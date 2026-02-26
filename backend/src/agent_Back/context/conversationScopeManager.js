"use strict";

const {
  getRequiredBindingSlots,
  isScopeCompatibleForSlot,
  getPayloadFieldForParent,
} = require("./scopeDomainRelations");

const CONFIDENCE_BY_PATH = Object.freeze({
  explicit_id: 1.0,
  explicit_selection: 1.0,
  tool_single_entity: 1.0,
  confirmed_mutation_result: 1.0,
  name_resolution_exact_unique: 0.95,
  name_resolution_fuzzy_unique: 0.8,
  scope_remap_single_candidate: 0.7,
});

const AUTO_BIND_ELIGIBILITY = Object.freeze({
  allowed: new Set([
    "explicit_id",
    "explicit_selection",
    "tool_single_entity",
    "confirmed_mutation_result",
    "name_resolution_exact_unique",
  ]),
  conditional: new Set([
    "name_resolution_fuzzy_unique",
    "scope_remap_single_candidate",
  ]),
});

function normalizeEntityType(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeScopeSource(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["explicit", "resolved", "mutation", "show_command"].includes(normalized)) {
    return normalized;
  }
  return "resolved";
}

function confidenceForResolutionPath(path) {
  return CONFIDENCE_BY_PATH[String(path || "").trim().toLowerCase()] ?? 0;
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function _dedupeAppendHistory(history, item) {
  const list = Array.isArray(history) ? history.slice(-49) : [];
  const prev = list.length > 0 ? list[list.length - 1] : null;
  if (
    prev &&
    normalizeEntityType(prev.entityType) === normalizeEntityType(item.entityType) &&
    Number(prev.entityId) === Number(item.entityId)
  ) {
    return list;
  }
  list.push(item);
  return list.slice(-50);
}

class ConversationScopeManager {
  constructor({ contextStore, ledger } = {}) {
    this.contextStore = contextStore || null;
    this.ledger = ledger || null;
  }

  _getOperationalStore() {
    return this.contextStore?._operationalStore || null;
  }

  _getKeyParts(requestContext = {}) {
    return {
      conversationId:
        requestContext?.conversationId ??
        requestContext?.agentSessionId ??
        requestContext?.sessionId ??
        null,
      userId: requestContext?.userId || "default",
    };
  }

  _readOperational(requestContext = {}) {
    const store = this._getOperationalStore();
    const { conversationId, userId } = this._getKeyParts(requestContext);
    if (!store || typeof store.get !== "function" || !conversationId) return null;
    return store.get(userId, conversationId);
  }

  _writeOperational(requestContext = {}, updates = {}) {
    const store = this._getOperationalStore();
    const { conversationId, userId } = this._getKeyParts(requestContext);
    if (!store || typeof store.update !== "function" || !conversationId) return null;
    return store.update(userId, conversationId, updates);
  }

  _recordLedger(type, payload = {}) {
    try {
      this.ledger?.record?.({
        type,
        ...payload,
        timestamp: payload.timestamp || new Date().toISOString(),
      });
    } catch (_) {}
  }

  getScope(requestContext = {}) {
    const operational = this._readOperational(requestContext);
    const scope = operational?.conversationScope || null;
    return scope ? _clone(scope) : { activeScope: null, history: [] };
  }

  buildScopeFromEntity({
    entityType,
    entityId,
    source,
    resolutionPath,
    confidence,
  } = {}) {
    const type = normalizeEntityType(entityType);
    const id = Number(entityId);
    if (!type || !Number.isInteger(id) || id <= 0) return null;
    const resolvedPath = String(resolutionPath || "").trim().toLowerCase() || null;
    const conf = Number.isFinite(Number(confidence))
      ? Number(confidence)
      : confidenceForResolutionPath(resolvedPath);
    return {
      entityType: type,
      entityId: id,
      confidence: conf > 0 ? conf : 1.0,
      source: normalizeScopeSource(source),
    };
  }

  /**
   * Scope manager event hook.
   * This is the canonical event-driven entrypoint for scope updates and mirrors
   * the resulting active scope into legacy operationalContext.activeEntity.
   */
  applyEvent(requestContext = {}, event = {}) {
    const prev = this.getScope(requestContext);
    const eventType = String(event?.type || "").trim().toUpperCase();
    let next = _clone(prev) || { activeScope: null, history: [] };
    if (!next || typeof next !== "object") next = { activeScope: null, history: [] };
    if (!Array.isArray(next.history)) next.history = [];

    const setActive = (scopeEntity) => {
      if (!scopeEntity) return;
      next.activeScope = {
        entityType: normalizeEntityType(scopeEntity.entityType),
        entityId: Number(scopeEntity.entityId),
        confidence: Number(scopeEntity.confidence),
        source: normalizeScopeSource(scopeEntity.source),
      };
      next.history = _dedupeAppendHistory(next.history, {
        entityType: next.activeScope.entityType,
        entityId: next.activeScope.entityId,
        timestamp: new Date().toISOString(),
      });
    };

    if (eventType === "CONTEXT_RESET_EXPLICIT") {
      next.activeScope = null;
    } else if (eventType === "READ_AMBIGUOUS") {
      // no-op
    } else if (eventType === "MUTATION_CONFIRMED_DELETE") {
      const deletedType = normalizeEntityType(event.entityType);
      const deletedId = Number(event.entityId);
      if (
        next.activeScope &&
        normalizeEntityType(next.activeScope.entityType) === deletedType &&
        Number(next.activeScope.entityId) === deletedId
      ) {
        next.activeScope = null;
      }
    } else {
      const scopeEntity = this.buildScopeFromEntity({
        entityType: event.entityType,
        entityId: event.entityId,
        source:
          event.source ||
          (eventType === "ENTITY_SELECTED_EXPLICIT"
            ? "explicit"
            : eventType.startsWith("MUTATION_CONFIRMED")
              ? "mutation"
              : eventType === "READ_ENTITY_UNAMBIGUOUS"
                ? "show_command"
                : "resolved"),
        resolutionPath:
          event.resolutionPath ||
          (eventType.startsWith("MUTATION_CONFIRMED")
            ? "confirmed_mutation_result"
            : eventType === "ENTITY_SELECTED_EXPLICIT"
              ? "explicit_selection"
              : "tool_single_entity"),
        confidence: event.confidence,
      });
      setActive(scopeEntity);
    }

    const mirroredActiveEntity =
      next.activeScope && Number(next.activeScope.entityId) > 0
        ? {
            type: next.activeScope.entityType,
            id: Number(next.activeScope.entityId),
            source: `scope:${next.activeScope.source}`,
          }
        : null;

    this._writeOperational(requestContext, {
      conversationScope: next,
      activeEntity: mirroredActiveEntity,
    });

    this._recordLedger("scope_update_event", {
      eventType,
      conversationId: this._getKeyParts(requestContext).conversationId,
      userId: this._getKeyParts(requestContext).userId,
      previousScope: prev?.activeScope || null,
      nextScope: next?.activeScope || null,
      source: next?.activeScope?.source || null,
      confidence: next?.activeScope?.confidence ?? null,
      entityType: next?.activeScope?.entityType || null,
      entityId: next?.activeScope?.entityId || null,
    });

    return next;
  }

  projectScopeToRequestContext({ requestContext = {}, llmHistory = {} } = {}) {
    const scope = llmHistory?.conversationScope || this.getScope(requestContext);
    const active = scope?.activeScope || llmHistory?.activeEntity || null;
    const type = normalizeEntityType(active?.entityType || active?.type);
    const id = Number(active?.entityId || active?.id || 0);
    if (!type || !Number.isInteger(id) || id <= 0) return requestContext;

    const scopeKeyMap = {
      client: "clientId",
      dossier: "dossierId",
      lawsuit: "lawsuitId",
      task: "taskId",
      session: "sessionId",
      mission: "missionId",
      personal_task: "personalTaskId",
      financial_entry: "financialEntryId",
      notification: "notificationId",
      history_event: "historyEventId",
    };
    const key = scopeKeyMap[type];
    if (key && !requestContext[key]) requestContext[key] = id;
    if (!requestContext.activeEntity || typeof requestContext.activeEntity !== "object") {
      requestContext.activeEntity = { type, id, source: "conversation_scope" };
    }
    return requestContext;
  }

  _proposalHasExplicitBinding({ proposalInput = {}, childEntityType } = {}) {
    const payload = proposalInput?.payload && typeof proposalInput.payload === "object"
      ? proposalInput.payload
      : {};
    const parent = proposalInput?.parent && typeof proposalInput.parent === "object"
      ? proposalInput.parent
      : null;
    const explicitFieldsPresent = {
      parent: Boolean(parent && parent.entityType && Number(parent.entityId) > 0),
      payloadParentFk: false,
      target: Boolean(proposalInput?.target && proposalInput.target.type && Number(proposalInput.target.id) > 0),
      entityId: Boolean(proposalInput?.entityId && String(proposalInput.entityId).trim() !== ""),
    };
    if (childEntityType) {
      for (const [key, value] of Object.entries(payload)) {
        if (/_id$/i.test(key) && value != null && value !== "") {
          explicitFieldsPresent.payloadParentFk = true;
          break;
        }
      }
    }
    return explicitFieldsPresent;
  }

  _classifyScopeEligibility(activeScope) {
    const source = String(activeScope?.source || "").toLowerCase();
    if (source === "explicit") return { eligible: true, class: "explicit_selection", confidence: 1.0 };
    if (source === "mutation") return { eligible: true, class: "confirmed_mutation_result", confidence: 1.0 };
    if (source === "show_command") return { eligible: true, class: "tool_single_entity", confidence: 1.0 };
    if (source === "resolved") return { eligible: true, class: "tool_single_entity", confidence: Number(activeScope?.confidence) || 1.0 };
    return { eligible: false, class: "unknown", confidence: Number(activeScope?.confidence) || 0 };
  }

  _logBindingDecision({ requestContext, proposalInput, audit }) {
    this._recordLedger("scope_binding_decision", {
      conversationId: this._getKeyParts(requestContext).conversationId,
      sessionId: requestContext?.sessionId || null,
      userId: this._getKeyParts(requestContext).userId,
      operation: proposalInput?.operation || null,
      entityType: proposalInput?.entityType || null,
      decision: audit?.decision || "skipped",
      reasonCode: audit?.reasonCode || null,
      explicitFieldsPresent: audit?.explicitFieldsPresent || {},
      activeScope: audit?.activeScope || null,
      resolutionPath: audit?.resolutionPath || null,
      injectedFields: audit?.injectedFields || [],
      compatibilityRule: audit?.compatibilityRule || null,
    });
  }

  buildScopeBindingAudit(input = {}) {
    return {
      applied: input.decision === "applied",
      decision: input.decision || "skipped",
      source: input.source || null,
      reasonCode: input.reasonCode || null,
      resolutionPath: input.resolutionPath || null,
      injectedFields: Array.isArray(input.injectedFields) ? input.injectedFields : [],
      activeScope: input.activeScope ? _clone(input.activeScope) : null,
      explicitFieldsPresent: input.explicitFieldsPresent || {},
      compatibilityRule: input.compatibilityRule || null,
    };
  }

  async resolveBindingsForProposalInput({
    proposalInput,
    requestContext = {},
    executionContext = {},
    lookupFns = {},
    legacyEnricher = null,
  } = {}) {
    const input = proposalInput && typeof proposalInput === "object"
      ? _clone(proposalInput)
      : {};
    const operation = String(input?.operation || "").toLowerCase();
    const entityType = normalizeEntityType(input?.entityType);
    const scope = this.getScope(requestContext);
    const activeScope = scope?.activeScope || null;
    const explicitFieldsPresent = this._proposalHasExplicitBinding({ proposalInput: input, childEntityType: entityType });
    const auditBase = {
      source: "conversation_scope",
      activeScope,
      explicitFieldsPresent,
      injectedFields: [],
    };

    // Only fill missing fields. Never override explicit references.
    if (!activeScope) {
      const audit = this.buildScopeBindingAudit({ ...auditBase, decision: "skipped", reasonCode: "scope_missing" });
      this._logBindingDecision({ requestContext, proposalInput: input, audit });
      return { proposalInput: input, bindingAudit: audit };
    }

    const slots = getRequiredBindingSlots({ operation, entityType, actionType: input?.actionType });
    if (!Array.isArray(slots) || slots.length === 0) {
      const audit = this.buildScopeBindingAudit({ ...auditBase, decision: "skipped", reasonCode: "no_required_binding_slots" });
      this._logBindingDecision({ requestContext, proposalInput: input, audit });
      return { proposalInput: input, bindingAudit: audit };
    }

    const scopeEligibility = this._classifyScopeEligibility(activeScope);
    if (!scopeEligibility.eligible) {
      const audit = this.buildScopeBindingAudit({
        ...auditBase,
        decision: "skipped",
        reasonCode: "scope_not_trusted_for_binding",
        resolutionPath: scopeEligibility.class,
      });
      this._logBindingDecision({ requestContext, proposalInput: input, audit });
      return { proposalInput: input, bindingAudit: audit };
    }

    // Generic create parent injection (missing parent/payload FK only)
    if (operation === "create" && entityType) {
      const slot = slots.find((s) => s.kind === "parent");
      if (slot) {
        if (explicitFieldsPresent.parent || explicitFieldsPresent.payloadParentFk) {
          const audit = this.buildScopeBindingAudit({
            ...auditBase,
            decision: "skipped",
            reasonCode: "explicit_parent_binding_present",
            resolutionPath: scopeEligibility.class,
          });
          this._logBindingDecision({ requestContext, proposalInput: input, audit });
          return { proposalInput: input, bindingAudit: audit };
        }

        const compat = isScopeCompatibleForSlot({ slot, activeScope });
        if (compat.compatible) {
          const payloadField = getPayloadFieldForParent({
            childEntityType: entityType,
            parentEntityType: activeScope.entityType,
          });
          if (payloadField) {
            if (!input.payload || typeof input.payload !== "object") input.payload = {};
            if (input.payload[payloadField] == null) {
              input.payload[payloadField] = Number(activeScope.entityId);
              input.parent = {
                entityType: activeScope.entityType,
                entityId: Number(activeScope.entityId),
                source: "conversation_scope",
              };
              const audit = this.buildScopeBindingAudit({
                ...auditBase,
                decision: "applied",
                reasonCode: "scope_parent_injected",
                resolutionPath: scopeEligibility.class,
                injectedFields: [payloadField],
                compatibilityRule: compat.compatibilityRule,
              });
              this._logBindingDecision({ requestContext, proposalInput: input, audit });
              return { proposalInput: input, bindingAudit: audit };
            }
          } else if (
            (!input.parent || typeof input.parent !== "object") &&
            Number(activeScope.entityId) > 0
          ) {
            // Inject only a typed parent hint (no FK) and let wrapped legacy deterministic logic
            // perform any required remap (e.g. client -> unique dossier for lawsuit creation).
            input.parent = {
              entityType: activeScope.entityType,
              entityId: Number(activeScope.entityId),
              source: "conversation_scope",
            };
          }
        }
      }
    }

    // Wrapped legacy deterministic enrichment (e.g., lawsuit from client -> unique dossier).
    if (typeof legacyEnricher === "function") {
      try {
        const before = _clone(input);
        const enriched = await legacyEnricher(input, {
          requestContext,
          executionContext,
          lookupFns,
          activeScope,
        });
        const nextInput = enriched && typeof enriched === "object" ? enriched : input;
        const injectedFields = [];
        const nextPayload = nextInput?.payload && typeof nextInput.payload === "object" ? nextInput.payload : {};
        const prevPayload = before?.payload && typeof before.payload === "object" ? before.payload : {};
        for (const [k, v] of Object.entries(nextPayload)) {
          if ((prevPayload[k] == null || prevPayload[k] === "") && v != null && v !== "") injectedFields.push(k);
        }
        if (injectedFields.length > 0) {
          const audit = this.buildScopeBindingAudit({
            ...auditBase,
            decision: "applied",
            reasonCode: "legacy_scope_enricher_applied",
            resolutionPath: "scope_remap_single_candidate",
            injectedFields,
          });
          this._logBindingDecision({ requestContext, proposalInput: nextInput, audit });
          return { proposalInput: nextInput, bindingAudit: audit };
        }
        const audit = this.buildScopeBindingAudit({
          ...auditBase,
          decision: "skipped",
          reasonCode: "legacy_scope_enricher_noop",
          resolutionPath: scopeEligibility.class,
        });
        this._logBindingDecision({ requestContext, proposalInput: nextInput, audit });
        return { proposalInput: nextInput, bindingAudit: audit };
      } catch (error) {
        const audit = this.buildScopeBindingAudit({
          ...auditBase,
          decision: "clarify",
          reasonCode: error?.code || "legacy_scope_enricher_failed",
          resolutionPath: "scope_remap_single_candidate",
        });
        this._logBindingDecision({ requestContext, proposalInput: input, audit });
        return {
          proposalInput: input,
          bindingAudit: audit,
          clarification: {
            code: error?.code || "SCOPE_BINDING_CLARIFY",
            message: String(error?.message || "I need one more detail before I can prepare this change."),
          },
        };
      }
    }

    const audit = this.buildScopeBindingAudit({
      ...auditBase,
      decision: "skipped",
      reasonCode: "scope_binding_not_applied",
      resolutionPath: scopeEligibility.class,
    });
    this._logBindingDecision({ requestContext, proposalInput: input, audit });
    return { proposalInput: input, bindingAudit: audit };
  }
}

module.exports = {
  ConversationScopeManager,
  CONFIDENCE_BY_PATH,
  AUTO_BIND_ELIGIBILITY,
  confidenceForResolutionPath,
};
