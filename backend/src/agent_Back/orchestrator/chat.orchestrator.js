"use strict";

const documentGenerationPreviewService = require("../../services/documentGeneration/documentGenerationPreview.service");
const { ChatAgentService } = require("../chat/chat.agent.service");
const { resolveChatAmbiguity } = require("../chat/chat.ambiguity.resolver");
const { filterToolsForState } = require("../chat/chat.tool.exposure");
const { detectDraftIntent, detectReadIntent } = require("../intent.classifier");
const { buildReadPlan } = require("../read/readPlan.builder");
const { buildQueryIR } = require("../query/queryIR");
const {
  getIntentExecutionPolicy,
  isGlobalSafeIntent,
} = require("../read/intentExecution.contract");
const { toProposalArtifact } = require("../proposals/proposalArtifact");
const { buildDocumentContext } = require("./document.context.builder");
const { buildDocumentSafeContext } = require("./document.exposure.firewall");
const { discoverScopedTarget } = require("../context/scopeDiscovery");
const {
  bindLastResolvedEntityToRequestContext,
  inferLastResolvedFromGraphResult,
  inferLastResolvedFromToolExecutions,
} = require("../context/scopedEntityContext");
const { CHAT_STATES, selectInitialState } = require("./chat.state.machine");
const { parseFinalOutputContract } = require("./output.contract");
const { parseJsonResponse } = require("../llm/llm.validation");
const { evaluateMutationGovernance } = require("../mutation/mutation.governance");
const { applyHierarchicalScopeBinding } = require("../mutations/hierarchicalScopeBinder");
const {
  getChatOrchestratorState,
  updateChatOrchestratorState,
  clearPendingClarificationState,
} = require("./chat.session.state");
const { runChatToolLoop } = require("./chat.tool.loop");
const { clarificationAnswerMatcher } = require("./clarificationAnswerMatcher");
const {
  DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  DEFAULT_CANONICAL_FORMAT,
  DEFAULT_PREVIEW_FORMAT,
  chooseOutputFormats,
  normalizeArtifactKind,
  normalizeFormat,
  normalizeOutputFormatPreference,
  normalizeStructureHints,
  isCanonicalFormat,
  isPreviewFormat,
} = require("../../domain/documentFormatGovernance");
const {
  StorageHint,
  normalizeStorageHint,
  resolveStorageTarget,
} = require("../../domain/document.storage.resolver");
const {
  buildMissingFieldPrompt,
} = require("../presentation/presentationSanitizer");

function nowIso() {
  return new Date().toISOString();
}

const PENDING_CLARIFICATION_TTL_MS = 3 * 60 * 1000;
const PENDING_CLARIFICATION_MAX_TURNS = 2;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inferLanguageFromText(text, fallback = "en") {
  const raw = String(text || "");
  // Script detection only, no keyword routing.
  if (/[\u0600-\u06FF]/.test(raw)) return "ar";
  return fallback;
}

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const DRAFT_INTENT_PREFIX = "DRAFT_";

const DOCUMENT_ARTIFACT_AUTH_REASON = Object.freeze({
  INTENT_NOT_DRAFT: "INTENT_NOT_DRAFT",
  MISSING_EXPLICIT_DRAFT_SIGNAL: "MISSING_EXPLICIT_DRAFT_SIGNAL",
  SCOPE_NOT_RESOLVED: "SCOPE_NOT_RESOLVED",
});

const DETERMINISTIC_LIST_INTENTS = new Set([
  "LIST_CLIENTS",
  "LIST_DOSSIERS",
  "LIST_LAWSUITS",
  "LIST_TASKS",
  "LIST_PERSONAL_TASKS",
  "LIST_OVERDUE_TASKS",
  "LIST_MISSIONS",
  "LIST_SESSIONS",
  "LIST_UPCOMING_SESSIONS",
  "LIST_OFFICERS",
  "LIST_DOCUMENTS",
  "LIST_NOTIFICATIONS",
  "LIST_HISTORY_EVENTS",
  "LIST_FINANCIAL_ENTRIES",
]);

const LIST_CATEGORY_LABELS = Object.freeze({
  clients: "clients",
  dossiers: "dossiers",
  lawsuits: "lawsuits",
  tasks: "tasks",
  personal_tasks: "personal tasks",
  missions: "missions",
  sessions: "sessions",
  officers: "officers",
  documents: "documents",
  notifications: "notifications",
  history: "history events",
  financial_entries: "financial entries",
});

const LIST_CATEGORY_ENTITY_TYPE = Object.freeze({
  clients: "client",
  dossiers: "dossier",
  lawsuits: "lawsuit",
  tasks: "task",
  personal_tasks: "personal_task",
  missions: "mission",
  sessions: "session",
  officers: "officer",
  documents: "document",
  notifications: "notification",
  history: "history_event",
  financial_entries: "financial_entry",
});

const LIST_CATEGORY_RESULT_KEY = Object.freeze({
  clients: "clients",
  dossiers: "dossiers",
  lawsuits: "lawsuits",
  tasks: "tasks",
  personal_tasks: "personalTasks",
  missions: "missions",
  sessions: "sessions",
  officers: "officers",
  documents: "documents",
  notifications: "notifications",
  history: "historyEvents",
  financial_entries: "financialEntries",
});

const LIST_CATEGORY_NARROWING_HINTS = Object.freeze({
  clients: "client name or reference",
  dossiers: "client, dossier title, or reference",
  lawsuits: "client, dossier, or lawsuit reference",
  tasks: "status, priority, or text query",
  personal_tasks: "status or text query",
  missions: "status or mission reference",
  sessions: "timeframe, status, or text query",
  officers: "name or reference",
  documents: "title, type, or text query",
  notifications: "status or text query",
  history: "activity type, direction, or text query",
  financial_entries: "payment status, date, or text query",
});

const STRUCTURED_DRAFT_TYPE_BY_ENTITY = Object.freeze({
  task: "task_list",
  mission: "mission_list",
  session: "session_list",
  financial_entry: "financial_entry_list",
  document: "document_draft_list",
});

const STRUCTURED_DRAFT_ENTITY_BY_TYPE = Object.freeze({
  task_list: "task",
  mission_list: "mission",
  session_list: "session",
  financial_entry_list: "financial_entry",
  document_draft_list: "document",
});

function withStateOutput(result, state) {
  return {
    intent: "CHATBOT_AGENT_MODE",
    toolExecutions: [],
    stepCommentaries: [],
    rounds: 0,
    ambiguityArtifact: null,
    outputArtifact: null,
    resolutionMeta: null,
    mutationOutcome: null,
    availableTools: [],
    ...result,
    state,
  };
}

class ChatOrchestrator {
  constructor({ engine, llmClient } = {}) {
    if (!engine) throw new Error("ChatOrchestrator requires engine");
    this.engine = engine;
    this.helper = new ChatAgentService({ engine, llmClient });
  }

  _buildRequestContext({ context = {}, sessionId, metadata, userId, tenantId }) {
    const contextMetadata =
      context?.requestMetadata &&
      typeof context.requestMetadata === "object" &&
      !Array.isArray(context.requestMetadata)
        ? context.requestMetadata
        : {};
    const incomingMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const mergedMetadata = {
      ...contextMetadata,
      ...incomingMetadata,
    };
    const resolvedPreference =
      normalizeOutputFormatPreference(
        mergedMetadata.documentOutputFormatPreference ||
          context?.documentOutputFormatPreference,
      ) || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
    return {
      ...(context || {}),
      conversationId:
        context?.conversationId || context?.agentSessionId || sessionId || undefined,
      userId: context?.userId || userId || "default",
      tenantId: context?.tenantId || tenantId || null,
      documentOutputFormatPreference: resolvedPreference,
      requestMetadata: {
        ...mergedMetadata,
        documentOutputFormatPreference: resolvedPreference,
      },
    };
  }

  _traceExecutionStep(requestContext = {}, step = "", details = {}) {
    this.engine?.ledger?.record?.({
      type: "chat_orchestrator_trace",
      sourceRoute: "/agent/chat",
      conversationId: requestContext?.conversationId || null,
      step: String(step || "").trim() || "unknown",
      ...(details && typeof details === "object" ? details : {}),
      timestamp: new Date().toISOString(),
    });
  }

  _summarizeHintDiagnostics(queryIR = null) {
    const extracted = Array.isArray(queryIR?.hints?.extracted) ? queryIR.hints.extracted : [];
    const bindingCount = Array.isArray(queryIR?.hints?.binding) ? queryIR.hints.binding.length : 0;
    const nonBindingCount = Array.isArray(queryIR?.hints?.nonBinding) ? queryIR.hints.nonBinding.length : 0;
    return {
      bindingCount,
      nonBindingCount,
      hints: extracted.slice(0, 5).map((hint) => ({
        type: hint?.type || null,
        value: hint?.value ?? null,
        entityType: hint?.entityType || null,
        confidence: Number.isFinite(Number(hint?.confidence)) ? Number(hint.confidence) : null,
        binding: Boolean(hint?.binding),
        classification: hint?.classification || null,
        reasonCode: hint?.reasonCode || null,
      })),
    };
  }

  _resolveOutputContractExecutionPolicy(currentPolicy = null) {
    if (this.engine && typeof this.engine._resolvePolicy === "function") {
      try {
        const v3Policy = this.engine._resolvePolicy("v3");
        if (v3Policy && v3Policy.version) {
          return v3Policy;
        }
      } catch (_) {
        // fall back to current policy
      }
    }
    return currentPolicy;
  }

  _buildPersistedActiveScope({
    entityType = "",
    entityId = null,
    scope = {},
    source = "resolved",
    confidence = 1,
  } = {}) {
    const normalizedType = String(entityType || "").toLowerCase().trim();
    const normalizedId = validId(entityId);
    if (!normalizedType || !normalizedId) return null;
    const rawScope = scope && typeof scope === "object" && !Array.isArray(scope) ? scope : {};
    const activeScope = {
      entityType: normalizedType,
      entityId: normalizedId,
      source: String(source || "resolved"),
      confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 1,
      taskId: validId(rawScope.taskId),
      sessionId: validId(rawScope.sessionId),
      missionId: validId(rawScope.missionId),
      financialEntryId: validId(rawScope.financialEntryId),
      lawsuitId: validId(rawScope.lawsuitId),
      dossierId: validId(rawScope.dossierId),
      clientId: validId(rawScope.clientId),
    };
    const scopeKey = this._scopeKeyForEntityType(normalizedType);
    if (scopeKey && !activeScope[scopeKey]) {
      activeScope[scopeKey] = normalizedId;
    }
    return activeScope;
  }

  _persistActiveScope({
    requestContext = {},
    activeScope = null,
    reason = "resolved_scope",
  } = {}) {
    if (!activeScope || typeof activeScope !== "object") return null;
    updateChatOrchestratorState(this.engine, requestContext, { activeScope });
    this._traceExecutionStep(requestContext, "scope_persisted", {
      reason,
      entityType: String(activeScope?.entityType || "").toLowerCase() || null,
      entityId: Number(activeScope?.entityId || 0) || null,
      dossierId: Number(activeScope?.dossierId || 0) || null,
      lawsuitId: Number(activeScope?.lawsuitId || 0) || null,
    });
    return activeScope;
  }

  _buildScopeSnapshotForStorage({ requestContext = {}, activeScope = null } = {}) {
    const snapshot = {
      taskId: null,
      sessionId: null,
      missionId: null,
      financialEntryId: null,
      lawsuitId: null,
      dossierId: null,
      clientId: null,
      entityType: null,
      entityId: null,
    };
    if (activeScope?.entityType && validId(activeScope?.entityId)) {
      snapshot.entityType = String(activeScope.entityType).toLowerCase();
      snapshot.entityId = validId(activeScope.entityId);
      const scopeKey = this._scopeKeyForEntityType(snapshot.entityType);
      if (scopeKey && !snapshot[scopeKey]) {
        snapshot[scopeKey] = snapshot.entityId;
      }
      return snapshot;
    }
    snapshot.taskId = validId(requestContext?.taskId);
    snapshot.sessionId = validId(requestContext?.sessionId);
    snapshot.missionId = validId(requestContext?.missionId);
    snapshot.financialEntryId = validId(requestContext?.financialEntryId);
    snapshot.lawsuitId = validId(requestContext?.lawsuitId);
    snapshot.dossierId = validId(requestContext?.dossierId);
    snapshot.clientId = validId(requestContext?.clientId);
    return snapshot;
  }

  _buildStorageScopeSuggestion({
    message = "I need to know which record should store this document before I can continue.",
    originalMessage = "",
  } = {}) {
    return {
      type: "context_suggestion",
      message,
      entityType: "dossier",
      reason: "missing_context",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: originalMessage || null,
      suggestions: [],
      timestamp: nowIso(),
      confidence: 0.9,
      source: "storage_scope_resolution",
      allowManualInput: true,
      manualInputHint:
        "Open/select the target client, dossier, lawsuit, task, session, mission, or financial entry, then retry.",
    };
  }

  _buildMutationGovernanceClarificationArtifact({
    governance = null,
    userMessage = "",
  } = {}) {
    const entityType = String(governance?.entityType || "entity").toLowerCase();
    const missing = Array.isArray(governance?.missingRequiredFields)
      ? governance.missingRequiredFields.filter(Boolean)
      : [];
    const parentResolutionStatus = String(governance?.parentResolution?.status || "").toLowerCase();
    const parentSelection =
      governance?.parentSelection && typeof governance.parentSelection === "object"
        ? governance.parentSelection
        : null;
    const selectionOptions = Array.isArray(parentSelection?.options)
      ? parentSelection.options
      : [];
    const suggestions = selectionOptions
      .map((row, index) => {
        const option = row && typeof row === "object" ? row : {};
        const entityTypeValue = String(option.entityType || "").toLowerCase();
        const entityIdValue = Number(option.entityId || option.id || 0);
        if (!entityTypeValue || !Number.isInteger(entityIdValue) || entityIdValue <= 0) return null;
        const stableOptionId = String(option.id || "").trim();
        const suggestionId = `${entityTypeValue}-${entityIdValue}-${stableOptionId || index}`;
        return {
          id: suggestionId,
          entityType: entityTypeValue,
          entityId: entityIdValue,
          label:
            String(option.label || "").trim() || `${entityTypeValue} #${entityIdValue}`,
          subtitle:
            typeof option.subtitle === "string" && option.subtitle.trim()
              ? option.subtitle.trim()
              : null,
          reference:
            typeof option.reference === "string" && option.reference.trim()
              ? option.reference.trim()
              : null,
          scope:
            option.scope && typeof option.scope === "object" && !Array.isArray(option.scope)
              ? option.scope
              : {},
          metadata: {},
          intent:
            typeof option.intent === "string" && option.intent.trim()
              ? option.intent.trim()
              : "RESOLVE_CONTEXT_AND_CONTINUE",
        };
      })
      .filter(Boolean);
    const needsParentSelection =
      (parentResolutionStatus === "ambiguous_parent_selection" ||
        parentResolutionStatus === "needs_parent_input") &&
      suggestions.length > 0;
    const friendlyPrompt = needsParentSelection
      ? "Select the parent record to continue with creation."
      : buildMissingFieldPrompt(missing);
    return {
      type: "context_suggestion",
      message: friendlyPrompt,
      entityType,
      reason: "missing_context",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: String(userMessage || "").trim() || null,
      suggestions,
      timestamp: nowIso(),
      confidence: Number.isFinite(Number(governance?.confidence))
        ? Number(governance.confidence)
        : 0.7,
      source: "mutation_governance",
      allowManualInput: true,
      manualInputHint: friendlyPrompt,
      mutationGovernance: {
        intent: governance?.intent || null,
        entityType: governance?.entityType || null,
        missingRequiredFields: missing,
        parentResolution: governance?.parentResolution || null,
      },
    };
  }

  _buildMutationOperationsFromGovernance(governance = {}, requestContext = {}, options = {}) {
    const intent = String(governance?.intent || "").toLowerCase();
    const entityType = String(governance?.entityType || "").toLowerCase();
    const extracted =
      governance?.extractedFields &&
      typeof governance.extractedFields === "object" &&
      !Array.isArray(governance.extractedFields)
        ? governance.extractedFields
        : {};
    const promotedLinkedScope =
      options?.promotedLinkedScope &&
      typeof options.promotedLinkedScope === "object" &&
      !Array.isArray(options.promotedLinkedScope)
        ? options.promotedLinkedScope
        : {};
    const scopeContext =
      options?.activeScopeContext &&
      typeof options.activeScopeContext === "object" &&
      !Array.isArray(options.activeScopeContext)
        ? { ...requestContext, ...options.activeScopeContext }
        : { ...requestContext };
    const linkedLawsuitId = validId(promotedLinkedScope?.lawsuitId);
    const linkedDossierId = validId(promotedLinkedScope?.dossierId);
    if (!validId(scopeContext?.lawsuitId) && linkedLawsuitId) {
      scopeContext.lawsuitId = linkedLawsuitId;
    }
    if (!validId(scopeContext?.dossierId) && linkedDossierId) {
      scopeContext.dossierId = linkedDossierId;
    }
    const resolvedScopeType = String(scopeContext?.resolvedEntity?.type || "").toLowerCase();
    const resolvedScopeId = validId(scopeContext?.resolvedEntity?.id);
    if (!linkedLawsuitId && !linkedDossierId && resolvedScopeId) {
      if (resolvedScopeType === "lawsuit" && !validId(scopeContext?.lawsuitId)) {
        scopeContext.lawsuitId = resolvedScopeId;
      }
      if (resolvedScopeType === "dossier" && !validId(scopeContext?.dossierId)) {
        scopeContext.dossierId = resolvedScopeId;
      }
    }
    const bindPayloadToResolvedScope = (payload = {}) => {
      const safePayload =
        payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
      const hierarchical = applyHierarchicalScopeBinding({
        entityType,
        payload: safePayload,
        activeScope: scopeContext,
      });
      return hierarchical?.preparedPayload &&
        typeof hierarchical.preparedPayload === "object" &&
        !Array.isArray(hierarchical.preparedPayload)
        ? hierarchical.preparedPayload
        : safePayload;
    };
    if (!intent || !entityType) return [];
    if (intent === "create") {
      const promotedItems = Array.isArray(options?.promotedItems)
        ? options.promotedItems.filter((item) => item && typeof item === "object")
        : [];
      if (promotedItems.length > 0) {
        const basePayload =
          extracted && typeof extracted === "object" && !Array.isArray(extracted)
            ? { ...extracted }
            : {};
        if (
          !Number(basePayload?.lawsuit_id || 0) &&
          Number(promotedLinkedScope?.lawsuitId || 0) > 0
        ) {
          basePayload.lawsuit_id = Number(promotedLinkedScope.lawsuitId);
        }
        if (
          !Number(basePayload?.dossier_id || 0) &&
          Number(promotedLinkedScope?.dossierId || 0) > 0
        ) {
          basePayload.dossier_id = Number(promotedLinkedScope.dossierId);
        }
        return promotedItems
          .map((item, index) => {
            const payload = { ...basePayload };
            for (const [key, value] of Object.entries(item || {})) {
              if (value === null || value === undefined) continue;
              if (typeof value === "string") {
                const trimmed = value.trim();
                if (!trimmed) continue;
                if (!String(payload?.[key] || "").trim()) {
                  payload[key] = trimmed;
                }
                continue;
              }
              if (payload[key] === undefined || payload[key] === null) {
                payload[key] = value;
              }
            }
            const boundPayload = bindPayloadToResolvedScope(payload);
            return {
              op: "CREATE_ENTITY",
              entityType,
              payload: {
                entityType,
                payload: boundPayload,
              },
              reason: `User requested creating ${entityType} item ${index + 1} from retained draft.`,
            };
          })
          .filter((op) => {
            const payload = op?.payload?.payload;
            return payload && typeof payload === "object" && Object.keys(payload).length > 0;
          });
      }
      return [
        {
          op: "CREATE_ENTITY",
          entityType,
          payload: {
            entityType,
            payload: bindPayloadToResolvedScope(extracted),
          },
          reason: `User requested creating a ${entityType} in chat.`,
        },
      ];
    }
    if (intent === "update") {
      const activeType = String(requestContext?.resolvedEntity?.type || "").toLowerCase();
      const activeId = Number(requestContext?.resolvedEntity?.id || 0);
      const targetId =
        activeType === entityType && Number.isInteger(activeId) && activeId > 0
          ? activeId
          : null;
      const changes = { ...extracted };
      delete changes.entityType;
      delete changes.entityId;
      if (!targetId || Object.keys(changes).length === 0) return [];
      return [
        {
          op: "UPDATE_ENTITY",
          entityType,
          payload: {
            entityType,
            entityId: targetId,
            changes,
          },
          reason: `User requested updating ${entityType} ${targetId} in chat.`,
        },
      ];
    }
    return [];
  }

  _resolveStructuredDraftScope({ requestContext = {}, llmHistory = null } = {}) {
    const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
    const lawsuitId =
      Number(requestContext?.lawsuitId || 0) > 0
        ? Number(requestContext.lawsuitId)
        : String(activeScope?.entityType || "").toLowerCase() === "lawsuit" &&
            Number(activeScope?.entityId || 0) > 0
          ? Number(activeScope.entityId)
          : null;
    const dossierId =
      Number(requestContext?.dossierId || 0) > 0
        ? Number(requestContext.dossierId)
        : String(activeScope?.entityType || "").toLowerCase() === "dossier" &&
            Number(activeScope?.entityId || 0) > 0
          ? Number(activeScope.entityId)
          : null;
    return {
      dossierId: Number.isInteger(dossierId) && dossierId > 0 ? dossierId : null,
      lawsuitId: Number.isInteger(lawsuitId) && lawsuitId > 0 ? lawsuitId : null,
    };
  }

  _deriveEntityTypeFromStructuredDraft(structuredDraft = null) {
    const draftType = String(structuredDraft?.type || "").trim().toLowerCase();
    if (STRUCTURED_DRAFT_ENTITY_BY_TYPE[draftType]) {
      return STRUCTURED_DRAFT_ENTITY_BY_TYPE[draftType];
    }
    const hintType = String(structuredDraft?.entityType || "").trim().toLowerCase();
    return STRUCTURED_DRAFT_TYPE_BY_ENTITY[hintType] ? hintType : null;
  }

  _isExecutionPromotionIntent(userMessage = "") {
    const text = String(userMessage || "").trim().toLowerCase();
    if (!text) return false;
    const executionVerb =
      /\b(add|create|insert|save|apply|post|record|schedule|open|generate|make|log|submit)\b/.test(
        text,
      );
    if (!executionVerb) return false;
    const continuationReference =
      /\b(them|these|those|it|this|all|the list|that list|checklist|draft|drafts|items)\b/.test(
        text,
      );
    const explicitLets = /\blet'?s\b/.test(text);
    return continuationReference || explicitLets;
  }

  _deriveEntityTypeHintFromMessage(userMessage = "") {
    const text = String(userMessage || "").toLowerCase();
    if (!text) return null;
    if (/\b(tasks?|to do|todo|checklist)\b/.test(text)) return "task";
    if (/\bmissions?\b/.test(text)) return "mission";
    if (/\b(sessions?|hearings?)\b/.test(text)) return "session";
    if (/\b(financial entries|financial entry|invoices?|payments?)\b/.test(text)) {
      return "financial_entry";
    }
    if (/\b(document drafts?|draft documents?)\b/.test(text)) return "document";
    return null;
  }

  _extractStructuredDraftItemsFromText(content = "") {
    const lines = String(content || "").split(/\r?\n/);
    const items = [];
    for (const rawLine of lines) {
      const line = String(rawLine || "").trim();
      if (!line) continue;
      const bulletMatch = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
      if (!bulletMatch) continue;
      const body = String(bulletMatch[1] || "").trim();
      if (!body) continue;
      const boldMatch = body.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/);
      if (boldMatch) {
        const title = String(boldMatch[1] || "").trim();
        const description = String(boldMatch[2] || "").trim();
        if (title) {
          items.push({ title, description: description || "" });
          continue;
        }
      }
      const colonIndex = body.indexOf(":");
      if (colonIndex > 0 && colonIndex < 120) {
        const title = String(body.slice(0, colonIndex)).trim();
        const description = String(body.slice(colonIndex + 1)).trim();
        if (title) {
          items.push({ title, description: description || "" });
          continue;
        }
      }
      items.push({ title: body, description: "" });
    }
    const bulletItems = items.filter((item) => String(item?.title || "").trim());
    if (bulletItems.length > 0) return bulletItems;

    const plainLines = lines
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (plainLines.length < 3) return [];
    const candidateLines = plainLines.filter(
      (line, index) =>
        index > 0 &&
        !/^(suggested|plan|today|what this means)/i.test(line) &&
        line.length > 20 &&
        line.length < 240,
    );
    if (candidateLines.length < 3) return [];
    return candidateLines.map((title) => ({ title, description: "" }));
  }

  _inferStructuredDraftType({ metadata = {}, content = "" } = {}) {
    const explicitType = String(metadata?.structuredDraft?.type || metadata?.draftType || "")
      .trim()
      .toLowerCase();
    if (STRUCTURED_DRAFT_ENTITY_BY_TYPE[explicitType]) return explicitType;
    const text = String(content || "").toLowerCase();
    if (/\b(tasks?|checklist|actions?|activities|suggested plan|to do|todo)\b/.test(text)) {
      return "task_list";
    }
    if (/\b(financial entries|financial entry|invoices?|payments?|accounting entries)\b/.test(text)) {
      return "financial_entry_list";
    }
    if (/\b(document drafts?|draft documents?)\b/.test(text)) {
      return "document_draft_list";
    }
    if (/\bmissions?\b/.test(text)) return "mission_list";
    if (/\b(sessions?|hearings?)\b/.test(text)) return "session_list";
    if (
      /\b(review|gather|prepare|draft|assign|schedule|confirm)\b/.test(text) &&
      /\b(plan|today|dossier|lawsuit|case)\b/.test(text)
    ) {
      return "task_list";
    }
    const entityType = String(metadata?.entityType || "").trim().toLowerCase();
    if (STRUCTURED_DRAFT_TYPE_BY_ENTITY[entityType]) {
      return STRUCTURED_DRAFT_TYPE_BY_ENTITY[entityType];
    }
    return null;
  }

  _buildStructuredDraftFromContract({
    contract = null,
    routedOutputType = "message",
    requestContext = {},
    llmHistory = null,
  } = {}) {
    const outputType = String(routedOutputType || "").toLowerCase();
    if (outputType !== "message" && outputType !== "research" && outputType !== "document") {
      return null;
    }
    const content = String(contract?.content || "").trim();
    const metadata =
      contract?.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
        ? contract.metadata
        : {};
    if (!content && !Array.isArray(metadata?.structuredDraft?.items)) return null;
    const type = this._inferStructuredDraftType({ metadata, content });
    if (!type) return null;
    const explicitItems = Array.isArray(metadata?.structuredDraft?.items)
      ? metadata.structuredDraft.items
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const normalized = {};
            for (const [key, value] of Object.entries(item)) {
              if (value === null || value === undefined) continue;
              if (typeof value === "string") {
                const trimmed = value.trim();
                if (!trimmed) continue;
                normalized[key] = trimmed;
              } else {
                normalized[key] = value;
              }
            }
            return Object.keys(normalized).length > 0 ? normalized : null;
          })
          .filter(Boolean)
      : [];
    const items = explicitItems.length > 0
      ? explicitItems
      : this._extractStructuredDraftItemsFromText(content);
    if (!items.length) return null;
    const linkedScope = this._resolveStructuredDraftScope({ requestContext, llmHistory });
    const entityType = STRUCTURED_DRAFT_ENTITY_BY_TYPE[type] || null;
    return {
      type,
      entityType,
      items,
      linkedScope,
      createdAt: nowIso(),
    };
  }

  _resolveDraftPromotion({
    mutationGovernance = null,
    sessionState = null,
  } = {}) {
    const intent = String(mutationGovernance?.intent || "").toLowerCase();
    const entityType = String(mutationGovernance?.entityType || "").toLowerCase();
    if (intent !== "create") return null;
    const structuredDraft =
      sessionState?.lastStructuredDraft &&
      typeof sessionState.lastStructuredDraft === "object" &&
      !Array.isArray(sessionState.lastStructuredDraft)
        ? sessionState.lastStructuredDraft
        : sessionState?.structuredDraft &&
            typeof sessionState.structuredDraft === "object" &&
            !Array.isArray(sessionState.structuredDraft)
          ? sessionState.structuredDraft
        : null;
    if (!structuredDraft) return null;
    const lockedEntityType =
      String(entityType || "").toLowerCase() ||
      String(sessionState?.lastDraftEntityType || "").toLowerCase() ||
      this._deriveEntityTypeFromStructuredDraft(structuredDraft) ||
      "";
    if (!lockedEntityType) return null;
    const items = Array.isArray(structuredDraft?.items)
      ? structuredDraft.items.filter((item) => item && typeof item === "object")
      : [];
    if (!items.length) return null;
    return {
      structuredDraft,
      entityType: lockedEntityType,
      items,
      linkedScope:
        structuredDraft?.linkedScope &&
        typeof structuredDraft.linkedScope === "object" &&
        !Array.isArray(structuredDraft.linkedScope)
          ? structuredDraft.linkedScope
          : null,
    };
  }

  _buildContinuityPromotionGovernance({
    entityType = "",
    continuityStructuredDraft = null,
    activeScopeContext = {},
  } = {}) {
    const normalizedEntityType = String(entityType || "").trim().toLowerCase();
    if (!normalizedEntityType) return null;
    const linkedScope =
      continuityStructuredDraft?.linkedScope &&
      typeof continuityStructuredDraft.linkedScope === "object" &&
      !Array.isArray(continuityStructuredDraft.linkedScope)
        ? continuityStructuredDraft.linkedScope
        : {};
    const extractedFields = {};
    const linkedLawsuitId = Number(linkedScope?.lawsuitId || 0);
    const linkedDossierId = Number(linkedScope?.dossierId || 0);
    const scopedLawsuitId = Number(activeScopeContext?.lawsuitId || 0);
    const scopedDossierId = Number(activeScopeContext?.dossierId || 0);
    if (linkedLawsuitId > 0 || scopedLawsuitId > 0) {
      extractedFields.lawsuit_id = linkedLawsuitId > 0 ? linkedLawsuitId : scopedLawsuitId;
    }
    if (linkedDossierId > 0 || scopedDossierId > 0) {
      extractedFields.dossier_id = linkedDossierId > 0 ? linkedDossierId : scopedDossierId;
    }
    const hierarchical = applyHierarchicalScopeBinding({
      entityType: normalizedEntityType,
      payload: extractedFields,
      activeScope: activeScopeContext,
    });
    const preparedPayload = hierarchical?.preparedPayload || extractedFields;
    const parentResolution = {
      status: String(hierarchical?.status || "ready"),
      source: String(hierarchical?.resolutionSource || "continuity_promotion"),
      missingParentFields: Array.isArray(hierarchical?.missingParentFields)
        ? hierarchical.missingParentFields
        : [],
      parentSelection:
        hierarchical?.parentSelection &&
        typeof hierarchical.parentSelection === "object" &&
        !Array.isArray(hierarchical.parentSelection)
          ? hierarchical.parentSelection
          : null,
    };
    return {
      intent: "create",
      entityType: normalizedEntityType,
      confidence: 0.99,
      scopeHints: {
        deepestScope: null,
        activeEntity:
          activeScopeContext?.resolvedEntity?.type && Number(activeScopeContext?.resolvedEntity?.id || 0) > 0
            ? {
                entityType: String(activeScopeContext.resolvedEntity.type).toLowerCase(),
                entityId: Number(activeScopeContext.resolvedEntity.id),
              }
            : null,
        scopeBoundFields: preparedPayload,
      },
      extractedFields: preparedPayload,
      parentResolution,
      parentSelection: parentResolution.parentSelection,
      missingRequiredFields: [],
      dedupeQuery: {
        entityType: normalizedEntityType,
        query: null,
        scope: null,
      },
      signals: {
        futureSignal: false,
        mutationSignal: true,
        strongRead: false,
        promotionEntityLock: true,
        promotionForced: true,
      },
      entityTypeResolution: {
        status: "resolved",
        source: "continuity_forced",
        candidates: [normalizedEntityType],
      },
      shouldBypassReadResolution: true,
    };
  }

  _resolveMissingFieldsAfterDraftPromotion(missingFields = [], operations = []) {
    const normalizedMissing = Array.isArray(missingFields)
      ? missingFields.filter(Boolean)
      : [];
    if (!normalizedMissing.length || !Array.isArray(operations) || !operations.length) {
      return normalizedMissing;
    }
    return normalizedMissing.filter((field) => {
      const providedInEveryOperation = operations.every((operation) => {
        const value = operation?.payload?.payload?.[field];
        if (value === null || value === undefined) return false;
        if (typeof value === "string") return Boolean(value.trim());
        return true;
      });
      return !providedInEveryOperation;
    });
  }

  _isDeterministicBulkTaskConfirmationIntent(userMessage = "") {
    const text = String(userMessage || "").trim().toLowerCase();
    if (!text) return false;
    if (/\b(cancel|stop|nevermind|never mind|don't|do not|edit|modify|change)\b/.test(text)) {
      return false;
    }
    if (/^(yes|yep|yeah|ok|okay|sure|please|go ahead|do it)\b/.test(text)) return true;
    if (/\b(add|create|make|insert|save|apply|record)\b/.test(text) && /\b(them|these|tasks|all)\b/.test(text)) {
      return true;
    }
    if (/\bcreate all tasks\b/.test(text)) return true;
    return false;
  }

  _extractDeterministicTaskTitlesFromDraft(structuredDraft = null) {
    const items = Array.isArray(structuredDraft?.items) ? structuredDraft.items : [];
    const titles = [];
    for (const item of items) {
      const rawTitle =
        typeof item === "string"
          ? item
          : typeof item?.title === "string"
            ? item.title
            : typeof item?.label === "string"
              ? item.label
              : "";
      const title = String(rawTitle || "")
        .replace(/\s+/g, " ")
        .replace(/^[\-\*\d\.\)\s]+/, "")
        .trim();
      if (!title) continue;
      titles.push(title);
    }
    return titles;
  }

  _buildDeterministicBulkTaskOperations({
    structuredDraft = null,
    scopeContext = {},
  } = {}) {
    const normalizedScope =
      scopeContext && typeof scopeContext === "object" && !Array.isArray(scopeContext)
        ? scopeContext
        : {};
    let dossierId = validId(normalizedScope?.dossierId);
    let lawsuitId = validId(normalizedScope?.lawsuitId);
    const resolvedType = String(normalizedScope?.resolvedEntity?.type || "")
      .trim()
      .toLowerCase();
    const resolvedId = validId(normalizedScope?.resolvedEntity?.id);
    if (!dossierId && resolvedType === "dossier" && resolvedId) {
      dossierId = resolvedId;
    }
    if (!lawsuitId && resolvedType === "lawsuit" && resolvedId) {
      lawsuitId = resolvedId;
    }
    if (!dossierId && validId(structuredDraft?.linkedScope?.dossierId)) {
      dossierId = validId(structuredDraft.linkedScope.dossierId);
    }
    if (!lawsuitId && validId(structuredDraft?.linkedScope?.lawsuitId)) {
      lawsuitId = validId(structuredDraft.linkedScope.lawsuitId);
    }
    const titles = this._extractDeterministicTaskTitlesFromDraft(structuredDraft);
    const operations = [];
    const skipped = [];
    for (const title of titles) {
      const normalizedTitle = String(title || "").trim();
      if (!normalizedTitle || normalizedTitle.length < 3) {
        skipped.push({ title: normalizedTitle || null, reason: "invalid_title" });
        continue;
      }
      const payload = {
        title: normalizedTitle,
        status: "todo",
      };
      if (lawsuitId) {
        payload.lawsuit_id = lawsuitId;
      } else if (dossierId) {
        payload.dossier_id = dossierId;
      }
      operations.push({
        op: "CREATE_ENTITY",
        entityType: "task",
        payload: {
          entityType: "task",
          payload,
        },
        reason: "Create task from deterministic structured task list confirmation.",
      });
    }
    return { operations, skipped, dossierId, lawsuitId };
  }

  async _buildMutationProposalFromOperations({
    operations = [],
    policy = null,
    executionContext = {},
    requestContext = {},
    risk = "medium",
    draftPromotion = null,
  } = {}) {
    if (!Array.isArray(operations) || operations.length === 0) {
      const err = new Error("Mutation operations are required.");
      err.code = "MUTATION_OPERATIONS_REQUIRED";
      throw err;
    }
    const mutationInput = {
      operations,
      idempotencyKey: `mutation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      origin: "chat",
      risk: ["low", "medium", "high"].includes(String(risk || "").toLowerCase())
        ? String(risk).toLowerCase()
        : "medium",
    };
    const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
    const v2Result = await this.engine.executeToolV2("universalMutation", mutationInput, executionPolicy, {
      ...executionContext,
      posture: "WORK",
      confirmed: true,
      sourceRoute: "/agent/chat",
    });
    const proposal = v2Result?.result || null;
    if (
      proposal &&
      proposal.proposalId &&
      proposal.requiresConfirmation === true &&
      typeof this.engine.storeProposal === "function"
    ) {
      this.engine.storeProposal(proposal, {
        sourceRoute: "/agent/chat",
        proposalKind: "entity_mutation",
        origin: "strong_mutation_intent",
        strongMutationIntent: true,
        explicitMutationCommand: false,
        requiresExtraConfirmation: String(mutationInput.risk || "medium") === "high",
        riskLevel: String(mutationInput.risk || "medium"),
        conversationId: requestContext?.conversationId || null,
        sessionId: executionContext?.sessionId || null,
        userId: executionContext?.userId || null,
        tenantId: executionContext?.tenantId || null,
        draftPromotion:
          draftPromotion && typeof draftPromotion === "object" && !Array.isArray(draftPromotion)
            ? draftPromotion
            : null,
      });
    }
    return proposal;
  }

  async _tryDeterministicBulkTaskCreation({
    userMessage = "",
    requestContext = {},
    executionContext = {},
    policy = null,
    posture = "WORK",
    sessionState = null,
  } = {}) {
    if (!this._isDeterministicBulkTaskConfirmationIntent(userMessage)) return null;
    const structuredDraft =
      sessionState?.lastStructuredDraft &&
      typeof sessionState.lastStructuredDraft === "object" &&
      !Array.isArray(sessionState.lastStructuredDraft)
        ? sessionState.lastStructuredDraft
        : sessionState?.structuredDraft &&
            typeof sessionState.structuredDraft === "object" &&
            !Array.isArray(sessionState.structuredDraft)
          ? sessionState.structuredDraft
          : null;
    const draftEntityType = this._deriveEntityTypeFromStructuredDraft(structuredDraft);
    if (!structuredDraft || draftEntityType !== "task") return null;
    const deterministicOps = this._buildDeterministicBulkTaskOperations({
      structuredDraft,
      scopeContext: requestContext,
    });
    this._traceExecutionStep(requestContext, "operations_generated_count", {
      count: Array.isArray(deterministicOps.operations) ? deterministicOps.operations.length : 0,
      skippedCount: Array.isArray(deterministicOps.skipped) ? deterministicOps.skipped.length : 0,
      entityType: "task",
      source: "deterministic_bulk_task_mode",
    });
    this._traceExecutionStep(requestContext, "scope_bound", {
      dossierId: deterministicOps.dossierId || null,
      lawsuitId: deterministicOps.lawsuitId || null,
      source: "deterministic_bulk_task_mode",
    });
    if (!deterministicOps.dossierId && !deterministicOps.lawsuitId) return null;
    if (!deterministicOps.operations.length) {
      this._traceExecutionStep(requestContext, "validation_failed", {
        reason: "no_valid_task_entries",
        skippedCount: Array.isArray(deterministicOps.skipped) ? deterministicOps.skipped.length : 0,
      });
      const finalMessage = "I couldn't find valid task titles in the list to create.";
      return withStateOutput(
        {
          message: finalMessage,
          outputArtifact: {
            type: "error",
            code: "BULK_TASK_LIST_EMPTY",
            message: finalMessage,
          },
        },
        CHAT_STATES.FINAL,
      );
    }
    this._traceExecutionStep(requestContext, "validation_passed", {
      operationsCount: deterministicOps.operations.length,
      skippedCount: Array.isArray(deterministicOps.skipped) ? deterministicOps.skipped.length : 0,
      source: "deterministic_bulk_task_mode",
    });
    this._traceExecutionStep(requestContext, "deterministic_bulk_task_mode", {
      detected: true,
      operationCount: deterministicOps.operations.length,
      skippedCount: deterministicOps.skipped.length,
      dossierId: deterministicOps.dossierId || null,
      lawsuitId: deterministicOps.lawsuitId || null,
    });
    let proposal = null;
    try {
      proposal = await this._buildMutationProposalFromOperations({
        operations: deterministicOps.operations,
        policy,
        executionContext,
        requestContext,
        risk: "medium",
        draftPromotion: {
          enabled: true,
          draftType: structuredDraft?.type || "task_list",
          itemCount: deterministicOps.operations.length,
          clearOnSuccess: true,
        },
      });
    } catch (error) {
      this._traceExecutionStep(requestContext, "mutation_proposal_build_failed_reason", {
        errorCode: String(error?.code || "DETERMINISTIC_BULK_TASK_PROPOSAL_FAILED"),
        message: String(error?.message || ""),
        operationCount: deterministicOps.operations.length,
      });
      this._traceExecutionStep(requestContext, "proposal_failed", {
        reason: String(error?.code || "DETERMINISTIC_BULK_TASK_PROPOSAL_FAILED"),
        message: String(error?.message || ""),
        operationsCount: deterministicOps.operations.length,
        source: "deterministic_bulk_task_mode",
      });
      const finalMessage = "I could not prepare the requested mutation proposal.";
      this.helper._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture,
        toolExecutions: [],
        artifactType: "error",
        artifact: {
          type: "error",
          code: String(error?.code || "DETERMINISTIC_BULK_TASK_PROPOSAL_FAILED"),
          message: String(error?.message || "Deterministic bulk task proposal failed."),
        },
      });
      return withStateOutput(
        {
          message: finalMessage,
          outputArtifact: {
            type: "error",
            code: String(error?.code || "DETERMINISTIC_BULK_TASK_PROPOSAL_FAILED"),
            message: String(error?.message || "Deterministic bulk task proposal failed."),
          },
        },
        CHAT_STATES.FINAL,
      );
    }
    if (!proposal?.proposalId || proposal.requiresConfirmation !== true) return null;
    this._traceExecutionStep(requestContext, "proposal_created", {
      proposalId: proposal?.proposalId || null,
      actionType: proposal?.actionType || null,
      operationsCount: deterministicOps.operations.length,
      source: "deterministic_bulk_task_mode",
    });
    const proposalArtifact = toProposalArtifact(proposal, executionContext?.sessionId || null);
    proposalArtifact.operations = deterministicOps.operations;
    proposalArtifact.bulkSummary = {
      createdCandidateCount: deterministicOps.operations.length,
      skippedCount: deterministicOps.skipped.length,
      skipped: deterministicOps.skipped,
    };
    const pendingProposal = {
      proposalId: proposal.proposalId,
      summary: proposal.humanReadableSummary || null,
      riskLevel: proposal?.confirmation?.extraRiskAck === true ? "high" : "normal",
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      artifact: proposalArtifact,
    };
    updateChatOrchestratorState(this.engine, requestContext, {
      activeState: CHAT_STATES.EXECUTE,
      pendingProposal,
      pendingClarification: null,
    });
    const skippedText =
      deterministicOps.skipped.length > 0 ? ` (${deterministicOps.skipped.length} skipped)` : "";
    const finalMessage = `I prepared ${deterministicOps.operations.length} task creations${skippedText}. Please confirm to apply them.`;
    this.helper._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture,
      toolExecutions: [],
      artifactType: "proposal",
      artifact: proposalArtifact,
    });
    return withStateOutput(
      {
        message: finalMessage,
        outputArtifact: proposalArtifact,
        mutationOutcome: {
          status: "PROPOSED",
          proposalId: proposal.proposalId,
          proposalArtifact,
        },
      },
      CHAT_STATES.EXECUTE,
    );
  }

  _createPreviewArtifactFromDocumentContract({
    contract,
    activeScope,
    requestContext,
    executionContext,
    structuredContext = null,
  }) {
    const metadata =
      contract?.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
        ? contract.metadata
        : {};
    const markdown = String(contract?.content || "").trim();
    const title =
      (typeof contract?.title === "string" && contract.title.trim()) ||
      (typeof metadata.title === "string" && String(metadata.title).trim()) ||
      "Document Draft";
    const language =
      (typeof metadata.language === "string" && metadata.language.trim().toLowerCase()) ||
      inferLanguageFromText(markdown, "en");
    const documentType =
      (typeof metadata.documentType === "string" && metadata.documentType.trim()) ||
      "freeform_request";
    const requestedCanonicalFormat = normalizeFormat(
      metadata.canonicalFormat || metadata.format,
    );
    const requestedPreviewFormat = normalizeFormat(metadata.previewFormat);
    const explicitCanonicalFormat = isCanonicalFormat(requestedCanonicalFormat)
      ? requestedCanonicalFormat
      : null;
    const preferenceFromContext =
      normalizeOutputFormatPreference(requestContext?.documentOutputFormatPreference) ||
      normalizeOutputFormatPreference(requestContext?.requestMetadata?.documentOutputFormatPreference) ||
      DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
    const artifactKind = normalizeArtifactKind(metadata.artifactKind) || "document";
    const structureHints = normalizeStructureHints(metadata.structureHints);
    const formatSelection = chooseOutputFormats({
      preference: explicitCanonicalFormat || preferenceFromContext,
      artifactKind,
      structureHints,
    });
    if (explicitCanonicalFormat) {
      formatSelection.selectionMode = "explicit";
      formatSelection.selectionSource = "explicit_request";
    }
    const canonicalFormat = isCanonicalFormat(formatSelection.canonicalFormat)
      ? formatSelection.canonicalFormat
      : DEFAULT_CANONICAL_FORMAT;
    const previewFormat = isPreviewFormat(requestedPreviewFormat)
      ? requestedPreviewFormat
      : isPreviewFormat(formatSelection.previewFormat)
        ? formatSelection.previewFormat
        : DEFAULT_PREVIEW_FORMAT;
    const templateKey =
      (typeof metadata.templateKey === "string" && metadata.templateKey.trim()) ||
      "llm.freeform.document";
    const schemaVersion =
      (typeof metadata.schemaVersion === "string" && metadata.schemaVersion.trim()) ||
      "v1";
    const explicitStorageHint =
      normalizeStorageHint(requestContext?.requestMetadata?.storageHint) || null;
    const storageHint = explicitStorageHint || StorageHint.INHERIT;
    const scopeSnapshot = this._buildScopeSnapshotForStorage({
      requestContext,
      activeScope,
    });
    let storageTarget;
    try {
      storageTarget = resolveStorageTarget({
        activeScope: scopeSnapshot,
        storageHint,
      });
    } catch (error) {
      if (String(error?.code || "") === "STORAGE_SCOPE_MISSING") {
        return this._buildStorageScopeSuggestion({
          message:
            String(error?.message || "").trim() ||
            "I need a resolved target record before I can prepare this stored document preview.",
          originalMessage: contract?.content || "",
        });
      }
      throw error;
    }
    const previewHtml = `<div dir="${language === "ar" ? "rtl" : "ltr"}" style="white-space:pre-wrap;font-family:system-ui,sans-serif;">${escapeHtml(markdown)}</div>`;
    const plan = {
      target: { type: storageTarget.entityType, id: Number(storageTarget.entityId) },
      documentType,
      language,
      canonicalFormat,
      previewFormat,
      formatSelection,
      // Backward compatibility for downstream code still expecting `format`.
      format: canonicalFormat,
      templateKey,
      schemaVersion,
      contentJson: {
        content: {
          title: String(title),
          markdown,
        },
        structuredContext:
          structuredContext &&
          typeof structuredContext === "object" &&
          !Array.isArray(structuredContext)
            ? structuredContext
            : undefined,
      },
      storageGovernance: {
        storageHint,
        activeScope: scopeSnapshot,
        resolvedTarget: {
          entityType: storageTarget.entityType,
          entityId: storageTarget.entityId,
        },
        resolutionMode: storageTarget.resolutionMode,
        status: "resolved",
        hasScopeBinding:
          requestContext?.hasScopeBinding === true ||
          (explicitStorageHint && explicitStorageHint !== StorageHint.INHERIT) ||
          storageHint !== StorageHint.INHERIT ||
          String(storageTarget?.entityType || "").toLowerCase() !== "client",
        scopeDiscoveryHint:
          requestContext?._scopeDiscoveryHint &&
          typeof requestContext._scopeDiscoveryHint === "object" &&
          !Array.isArray(requestContext._scopeDiscoveryHint)
            ? requestContext._scopeDiscoveryHint
            : null,
      },
      previewHtml,
    };
    return documentGenerationPreviewService.createPreview(plan, {
      conversationId: requestContext?.conversationId || null,
      sessionId: executionContext?.sessionId || null,
      createdBy: executionContext?.userId ? String(executionContext.userId) : null,
    });
  }

  _buildExposedToolsForState(state, policy, executionContext) {
    const scoped = filterToolsForState({
      state,
      engine: this.engine,
      policy,
      executionContext,
    });
    return scoped.map((tool) => ({
      name: tool.name,
      category: tool.category,
      schema: tool.schema,
      validate: this.engine.ajv.compile(tool.schema),
      definition: {
        type: "function",
        function: {
          name: tool.name,
          description:
            String(this.engine.toolRegistry.get(tool.name)?.description || "").trim() ||
            tool.name,
          parameters: tool.schema,
        },
      },
    }));
  }

  _extractPendingProposal(toolExecutions = [], sessionId = null) {
    for (const execution of toolExecutions) {
      const result = execution?.result;
      if (
        result &&
        typeof result === "object" &&
        result.proposalId &&
        result.requiresConfirmation === true
      ) {
        return {
          proposalId: result.proposalId,
          summary: result.humanReadableSummary || null,
          riskLevel:
            result?.confirmation?.extraRiskAck === true ? "high" : "normal",
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          artifact: toProposalArtifact(result, sessionId),
        };
      }
    }
    return null;
  }

  _resolveActiveEntityScope(requestContext = {}, llmHistory = null) {
    const resolved = requestContext?.resolvedEntity;
    if (resolved && resolved.type && Number.isInteger(Number(resolved.id)) && Number(resolved.id) > 0) {
      return { entityType: String(resolved.type).toLowerCase(), entityId: Number(resolved.id) };
    }
    const activeScope = llmHistory?.conversationScope?.activeScope || null;
    if (
      activeScope &&
      activeScope.entityType &&
      Number.isInteger(Number(activeScope.entityId)) &&
      Number(activeScope.entityId) > 0
    ) {
      return {
        entityType: String(activeScope.entityType).toLowerCase(),
        entityId: Number(activeScope.entityId),
      };
    }
    try {
      const resolvedStorageScope = resolveStorageTarget({
        activeScope: this._buildScopeSnapshotForStorage({ requestContext, activeScope: null }),
        storageHint: StorageHint.INHERIT,
      });
      return {
        entityType: resolvedStorageScope.entityType,
        entityId: resolvedStorageScope.entityId,
      };
    } catch (_) {
      // fall through to null
    }
    return null;
  }

  _isDeterministicListIntent(readIntent = null) {
    const intentName = String(readIntent?.intent || "").trim().toUpperCase();
    return DETERMINISTIC_LIST_INTENTS.has(intentName);
  }

  _formatGraphListItem(node = {}, listCategory = "") {
    const label =
      String(node?.title || node?.name || "").trim() ||
      String(listCategory || "item").replace(/s$/, "");
    const status = String(node?.status || "").trim();
    const dueIso = String(node?.keyDates?.nextUpcoming || "").trim();
    const due = dueIso ? dueIso.slice(0, 10) : "";
    if (status && due) return `- ${label} (${status}, ${due})`;
    if (status) return `- ${label} (${status})`;
    if (due) return `- ${label} (${due})`;
    return `- ${label}`;
  }

  _extractDirectListRows(result = {}, listCategory = "") {
    const key = LIST_CATEGORY_RESULT_KEY[listCategory] || null;
    if (!key) return [];
    const rows = Array.isArray(result?.[key]) ? result[key] : [];
    return rows;
  }

  _renderDeterministicReadList({
    result = {},
    listCategory = "",
    executionMode = "graph",
  } = {}) {
    const rows =
      executionMode === "direct"
        ? this._extractDirectListRows(result, listCategory)
        : Array.isArray(result?.children?.[listCategory])
          ? result.children[listCategory]
          : [];
    const categoryLabel = LIST_CATEGORY_LABELS[listCategory] || listCategory || "items";
    const rootLabel =
      executionMode === "graph"
        ? String(result?.root?.title || result?.root?.name || "").trim() || null
        : null;

    if (!rows.length) {
      if (rootLabel) return `No ${categoryLabel} found for ${rootLabel}.`;
      return executionMode === "direct"
        ? `No ${categoryLabel} found.`
        : `No ${categoryLabel} found in the current scope.`;
    }

    const head = rootLabel
      ? `Found ${rows.length} ${categoryLabel} for ${rootLabel}:`
      : `Found ${rows.length} ${categoryLabel}:`;
    const body = rows.slice(0, 12).map((row) => this._formatGraphListItem(row, listCategory));
    if (rows.length > body.length) {
      body.push(`- and ${rows.length - body.length} more`);
    }
    const narrowingHint = this._buildPostListNarrowingSuggestion({
      listCategory,
      rows,
    });
    return [head, ...body, ...(narrowingHint ? [narrowingHint] : [])].join("\n");
  }

  _buildPostListNarrowingSuggestion({ listCategory = "", rows = [] } = {}) {
    const hints = LIST_CATEGORY_NARROWING_HINTS[listCategory];
    if (!hints) return null;
    if (!Array.isArray(rows) || rows.length < 2) return null;
    return `You can narrow this list by ${hints}.`;
  }

  async _tryRunDeterministicReadList({
    userMessage = "",
    queryIR = null,
    readIntent: preResolvedReadIntent = null,
    requestContext = {},
    executionContext = {},
    llmHistory = null,
    policy = null,
    posture = "ASSISTANT",
    state = CHAT_STATES.RETRIEVE,
  } = {}) {
    const readIntent =
      preResolvedReadIntent ||
      (queryIR?.intent?.name
        ? {
            intent: queryIR.intent.name,
            filters: queryIR.filters || {},
            entityHints: Array.isArray(queryIR.entityHints) ? queryIR.entityHints : [],
            aggregateSummary:
              queryIR?.intent?.family === "SUMMARIZE" && queryIR?.target === "collection",
          }
        : detectReadIntent(String(userMessage || ""), requestContext || {}));
    if (!this._isDeterministicListIntent(readIntent)) return null;
    const intentPolicy = getIntentExecutionPolicy(readIntent?.intent || "");

    const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
    const plan = buildReadPlan({
      intent: readIntent,
      queryIR,
      requestContext,
      activeScope,
    });
    if (!plan) return null;

    this._traceExecutionStep(requestContext, "deterministic_read_plan_built", {
      intent: readIntent.intent,
      toolName: plan.toolName,
      toolInput: plan.toolInput,
      executionMode: plan.executionMode || "graph",
      intentPolicy: {
        scopeRequired: Boolean(intentPolicy.scopeRequired),
        globalSafe: Boolean(intentPolicy.globalSafe),
      },
    });

    let toolResult = null;
    let toolError = null;
    try {
      toolResult = await this.engine._callReadTool(
        plan.toolName,
        plan.toolInput,
        policy,
      );
    } catch (error) {
      toolError = error;
    }

    const toolExecution = {
      toolName: plan.toolName,
      args: plan.toolInput,
      ok: !toolError,
      result: toolResult,
      error: toolError
        ? {
            code: String(toolError?.code || "TOOL_EXECUTION_FAILED"),
            message: String(toolError?.message || "Tool execution failed."),
          }
        : null,
      responseForModel: toolError
        ? {
            ok: false,
            error: String(toolError?.message || "Tool execution failed."),
          }
        : toolResult,
    };

    const listCategory = String(plan?.renderHint?.listCategory || "").trim();
    const executionMode = String(plan?.executionMode || "graph").toLowerCase();
    const resolvedFromGraph =
      executionMode === "graph"
        ? inferLastResolvedFromGraphResult(toolResult, listCategory)
        : null;
    if (resolvedFromGraph) {
      updateChatOrchestratorState(this.engine, requestContext, {
        lastResolvedEntity: resolvedFromGraph,
      });
    }
    const listedRows =
      !toolError && executionMode === "graph"
        ? Array.isArray(toolResult?.children?.[listCategory])
          ? toolResult.children[listCategory]
          : []
        : !toolError
          ? this._extractDirectListRows(toolResult, listCategory)
          : [];
    let autoPinnedScope = null;
    if (!toolError && listedRows.length === 1) {
      const targetEntityType = LIST_CATEGORY_ENTITY_TYPE[listCategory] || null;
      const targetEntityId = validId(listedRows[0]?.id);
      if (targetEntityType && targetEntityId) {
        autoPinnedScope = this._pinEntityScopeBeforeContract({
          requestContext,
          executionContext,
          resolvedEntity: {
            entityType: targetEntityType,
            entityId: targetEntityId,
          },
          source: "resolved",
        });
      }
    }
    const finalMessage = toolError
      ? `I could not retrieve ${LIST_CATEGORY_LABELS[listCategory] || "the list"} right now.`
      : this._renderDeterministicReadList({
          result: toolResult,
          listCategory,
          executionMode,
        });

    updateChatOrchestratorState(this.engine, requestContext, {
      activeState: state,
    });

    const outputArtifact = {
      type: "chat",
      message: finalMessage,
      deterministicRead: true,
      listCategory,
    };
    this.helper._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture,
      toolExecutions: [toolExecution],
      artifactType: "chat",
      artifact: outputArtifact,
    });

    return withStateOutput(
      {
        message: finalMessage,
        toolExecutions: [toolExecution],
        stepCommentaries: [],
        rounds: 0,
        outputArtifact,
        resolutionMeta: {
          deterministicReadPlan: {
            intent: readIntent.intent,
            toolName: plan.toolName,
            toolInput: plan.toolInput,
            renderHint: plan.renderHint,
            executionMode,
          },
          autoPinnedScope,
        },
      },
      CHAT_STATES.FINAL,
    );
  }

  _scopeKeyForEntityType(entityType = "") {
    const map = {
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
      officer: "officerId",
    };
    return map[String(entityType || "").toLowerCase()] || null;
  }

  _normalizeEntityTypeForDiscovery(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "case") return "lawsuit";
    if (normalized === "hearing") return "session";
    if (normalized === "personal task") return "personal_task";
    if (normalized === "financial entry") return "financial_entry";
    if (normalized === "history event") return "history_event";
    return normalized;
  }

  _extractScopeDiscoveryHints(userMessage, requestContext = {}) {
    const draftIntent = detectDraftIntent(userMessage, requestContext || {});
    if (!draftIntent || !Array.isArray(draftIntent.entityHints) || draftIntent.entityHints.length === 0) {
      return [];
    }
    const hints = [];
    for (const hint of draftIntent.entityHints) {
      const type = String(hint?.type || "").toLowerCase();
      const rawValue =
        type === "reference"
          ? String(hint?.reference || hint?.value || "").trim()
          : type === "id"
            ? String(hint?.id || hint?.entityId || hint?.value || "").trim()
            : String(hint?.nameHint || hint?.value || "").trim();
      if (!rawValue) continue;
      const hintedEntityType = this._normalizeEntityTypeForDiscovery(hint?.entityType);
      hints.push({
        identifier: rawValue,
        mode: type === "id" ? "id" : "name",
        hintedEntityType: hintedEntityType || null,
      });
    }
    const seen = new Set();
    return hints.filter((hint) => {
      const key = `${hint.mode}:${hint.hintedEntityType || "any"}:${hint.identifier.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async _extractScopeDiscoveryHintsWithLLM(userMessage) {
    const extractor = this.helper?.mutationIntentExtractor;
    if (typeof extractor !== "function") return [];
    const prompt = [
      "Extract entity resolution hints from this user request.",
      "Return JSON only with shape: {\"hints\":[{\"entityType\":\"client|dossier|lawsuit|task|session|mission\",\"identifier\":\"string\",\"confidence\":0.0}]}",
      "Rules:",
      "- Extract only explicit concrete references likely pointing to an existing record.",
      "- Do not infer missing entities.",
      "- If uncertain, return {\"hints\":[]}.",
      `User message: ${String(userMessage || "")}`,
    ].join("\n");
    let raw = "";
    try {
      raw = await extractor(prompt);
    } catch (_) {
      return [];
    }
    const parsed = parseJsonResponse(raw);
    const rows = Array.isArray(parsed?.hints) ? parsed.hints : [];
    const allowedTypes = new Set(["client", "dossier", "lawsuit", "task", "session", "mission"]);
    const hints = [];
    for (const row of rows) {
      const entityType = String(row?.entityType || "").trim().toLowerCase();
      const identifier = String(row?.identifier || "").trim();
      const confidence = Number(row?.confidence);
      if (!allowedTypes.has(entityType)) continue;
      if (!identifier) continue;
      if (!Number.isFinite(confidence) || confidence < 0.85) continue;
      hints.push({
        identifier,
        mode: "name",
        hintedEntityType: entityType,
      });
    }
    const seen = new Set();
    return hints.filter((hint) => {
      const key = `${hint.mode}:${hint.hintedEntityType || "any"}:${hint.identifier.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async _extractDocumentScopeHintWithLLM(userMessage) {
    const extractor = this.helper?.mutationIntentExtractor;
    if (typeof extractor !== "function") {
      return {
        queryText: String(userMessage || "").trim() || null,
        preferredScopeLevels: [],
      };
    }
    const prompt = [
      "Extract a scope-discovery hint for deterministic entity resolution.",
      "Return JSON only with shape:",
      '{"queryText":"string|null","preferredScopeLevels":["dossier","lawsuit","session","task","mission","financial_entry","client"]}',
      "Rules:",
      "- Never return IDs.",
      "- Keep queryText as concise noun phrase(s) describing the target context.",
      "- preferredScopeLevels should list likely scope levels by priority.",
      "- If uncertain, set queryText to the original message and preferredScopeLevels to [].",
      `User message: ${String(userMessage || "")}`,
    ].join("\n");
    let raw = "";
    try {
      raw = await Promise.race([
        extractor(prompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("SCOPE_HINT_TIMEOUT")), 1500),
        ),
      ]);
    } catch (_) {
      return {
        queryText: String(userMessage || "").trim() || null,
        preferredScopeLevels: [],
      };
    }
    const parsed = parseJsonResponse(raw);
    const queryText = String(
      parsed?.queryText || parsed?.query || parsed?.text || String(userMessage || ""),
    )
      .replace(/\s+/g, " ")
      .trim();
    const allowed = new Set([
      "client",
      "dossier",
      "lawsuit",
      "session",
      "task",
      "mission",
      "financial_entry",
    ]);
    const preferredScopeLevels = Array.isArray(parsed?.preferredScopeLevels)
      ? parsed.preferredScopeLevels
          .map((value) => String(value || "").trim().toLowerCase())
          .filter((value) => allowed.has(value))
      : [];
    return {
      queryText: queryText || null,
      preferredScopeLevels: Array.from(new Set(preferredScopeLevels)),
    };
  }

  _buildScopeDiscoverySuggestion({ message, found = [], ambiguous = [] } = {}) {
    const suggestions = [];
    for (const row of found) {
      suggestions.push({
        entityType: row.entityType,
        entityId: row.entityId,
        label: row.entityLabel || `${row.entityType} #${row.entityId}`,
        score: 1,
      });
    }
    for (const row of ambiguous) {
      const entityType = String(row?.entityType || "").toLowerCase();
      const candidates = Array.isArray(row?.candidates) ? row.candidates : [];
      for (const c of candidates) {
        const id = Number(c?.id || 0);
        if (!entityType || !Number.isInteger(id) || id <= 0) continue;
        suggestions.push({
          entityType,
          entityId: id,
          label: String(c?.name || `${entityType} #${id}`),
          score: Number.isFinite(Number(c?.score)) ? Number(c.score) : null,
        });
      }
    }
    const deduped = [];
    const seen = new Set();
    for (const s of suggestions) {
      const key = `${s.entityType}:${s.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
      if (deduped.length >= 7) break;
    }
    return {
      type: "context_suggestion",
      message: "I found multiple possible records. Please confirm the exact one before I generate the document artifact.",
      entityType: deduped[0]?.entityType || null,
      reason: "multiple_matches",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: message,
      suggestions: deduped,
      timestamp: nowIso(),
      confidence: 0.82,
      source: "scope_discovery",
      allowManualInput: true,
      manualInputHint: "Provide the exact entity reference, ID, or full name.",
    };
  }

  _isClientOnlyArtifactScope({ activeScope, requestContext = {} } = {}) {
    if (activeScope?.entityType && activeScope?.entityId) {
      return String(activeScope.entityType).toLowerCase() === "client";
    }
    if (!validId(requestContext?.clientId)) return false;
    const deeperKeys = [
      "dossierId",
      "lawsuitId",
      "financialEntryId",
      "missionId",
      "sessionId",
      "taskId",
    ];
    return !deeperKeys.some((key) => validId(requestContext?.[key]));
  }

  _buildArtifactScopeClarifySuggestion({ message, candidates = [] } = {}) {
    const suggestions = (Array.isArray(candidates) ? candidates : [])
      .map((candidate, index) => {
        const entityType = String(candidate?.entityType || "").toLowerCase();
        const entityId = Number(candidate?.entityId || 0);
        if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return null;
        return {
          id: `scope-discovery-${entityType}-${entityId}-${index}`,
          entityType,
          entityId,
          label: String(candidate?.label || `${entityType} #${entityId}`),
          subtitle: candidate?.reference ? `Reference: ${String(candidate.reference)}` : null,
          metadata: {
            score: Number.isFinite(Number(candidate?.score))
              ? Number(Number(candidate.score).toFixed(3))
              : null,
          },
          intent: "RESOLVE_CONTEXT_AND_CONTINUE",
          scope: {
            [this._scopeKeyForEntityType(entityType) || "entityId"]: entityId,
          },
          resolveContext: {
            originalIntent: "CHATBOT_AGENT_MODE",
          },
        };
      })
      .filter(Boolean)
      .slice(0, 5);
    return {
      type: "context_suggestion",
      message:
        "I found multiple matching records under this client. Please confirm which record should receive this generated artifact.",
      entityType: suggestions[0]?.entityType || "dossier",
      reason: "multiple_matches",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: String(message || "").trim() || null,
      suggestions,
      timestamp: nowIso(),
      confidence: 0.82,
      source: "scope_discovery",
      allowManualInput: true,
      manualInputHint: "Provide the exact reference, title, ID, or date of the target record.",
    };
  }

  async _discoverArtifactScopeFromClient({
    userMessage,
    requestContext,
    executionContext,
    policy,
    llmHistory,
  } = {}) {
    const explicitStorageHint =
      normalizeStorageHint(requestContext?.requestMetadata?.storageHint) || StorageHint.INHERIT;
    if (explicitStorageHint !== StorageHint.INHERIT) {
      return { status: "skipped", reason: "explicit_storage_hint" };
    }

    const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
    if (!this._isClientOnlyArtifactScope({ activeScope, requestContext })) {
      return { status: "skipped", reason: "already_scoped" };
    }
    const clientId = validId(
      activeScope?.entityType === "client" ? activeScope?.entityId : requestContext?.clientId,
    );
    if (!clientId) {
      return { status: "none", reason: "client_scope_missing" };
    }

    const llmHint = await this._extractDocumentScopeHintWithLLM(userMessage);
    this.engine?.ledger?.record?.({
      type: "chat_scope_discovery_started",
      sourceRoute: "/agent/chat",
      conversationId: requestContext?.conversationId || null,
      clientId,
      hint: llmHint,
      timestamp: nowIso(),
    });

    const discovery = await discoverScopedTarget({
      engine: this.engine,
      clientId,
      message: userMessage,
      hint: llmHint,
      policy,
    });
    this.engine?.ledger?.record?.({
      type: "chat_scope_discovery_result",
      sourceRoute: "/agent/chat",
      conversationId: requestContext?.conversationId || null,
      clientId,
      status: discovery?.status || "none",
      targetType:
        discovery?.target?.entityType ||
        discovery?.entityType ||
        null,
      targetId:
        discovery?.target?.entityId ||
        discovery?.entityId ||
        null,
      topScore: Number.isFinite(Number(discovery?.topScore)) ? Number(discovery.topScore) : null,
      runnerUpScore:
        Number.isFinite(Number(discovery?.runnerUpScore)) ? Number(discovery.runnerUpScore) : null,
      timestamp: nowIso(),
    });
    if (discovery?.status === "resolved" && discovery.entityType && validId(discovery.entityId)) {
      const pinned = this._pinEntityScopeBeforeContract({
        requestContext,
        executionContext,
        resolvedEntity: {
          entityType: discovery.entityType,
          entityId: Number(discovery.entityId),
        },
        source: "scope_discovery",
      });
      requestContext.hasScopeBinding = true;
      executionContext.hasScopeBinding = true;
      requestContext._scopeDiscoveryHint = llmHint;
      executionContext._scopeDiscoveryHint = llmHint;
      return {
        status: "resolved",
        resolvedEntity: pinned,
        confidence: Number(discovery.confidence || 0),
        candidatesPreview: discovery.candidatesPreview || [],
        hint: llmHint,
      };
    }
    if (discovery?.status === "clarify") {
      requestContext.hasScopeBinding = false;
      executionContext.hasScopeBinding = false;
      requestContext._scopeDiscoveryHint = llmHint;
      executionContext._scopeDiscoveryHint = llmHint;
      return {
        status: "clarify",
        suggestionArtifact: this._buildArtifactScopeClarifySuggestion({
          message: userMessage,
          candidates: discovery.candidates || [],
        }),
        hint: llmHint,
      };
    }
    requestContext.hasScopeBinding = false;
    executionContext.hasScopeBinding = false;
    requestContext._scopeDiscoveryHint = llmHint;
    executionContext._scopeDiscoveryHint = llmHint;
    return { status: "none" };
  }

  async _discoverScopeBeforeContract({
    userMessage,
    requestContext,
    executionContext,
    policy,
    llmHistory,
  } = {}) {
    const alreadyScoped = this._resolveActiveEntityScope(requestContext, llmHistory);
    if (alreadyScoped) {
      return { status: "skipped", reason: "already_scoped" };
    }
    let hints = this._extractScopeDiscoveryHints(userMessage, requestContext);
    if (!hints.length) {
      const draftIntent = detectDraftIntent(userMessage, requestContext || {});
      if (draftIntent?.intent) {
        hints = await this._extractScopeDiscoveryHintsWithLLM(userMessage);
      }
    }
    if (!hints.length) {
      return { status: "skipped", reason: "no_hints" };
    }

    const defaultEntityTypes = ["client", "dossier", "lawsuit", "task", "session", "mission"];
    const found = [];
    const ambiguous = [];
    for (const hint of hints) {
      const candidateTypes = hint.hintedEntityType
        ? [hint.hintedEntityType]
        : defaultEntityTypes;
      for (const entityType of candidateTypes) {
        let resolution = null;
        try {
          resolution = await this.engine.resolveEntity(
            {
              entityType,
              identifier: hint.identifier,
              mode: hint.mode,
              scopeClientId:
                entityType === "dossier" && Number(requestContext?.clientId || 0) > 0
                  ? Number(requestContext.clientId)
                  : null,
            },
            policy,
          );
        } catch (_) {
          resolution = null;
        }
        if (resolution?.found && Number.isInteger(Number(resolution.entityId)) && Number(resolution.entityId) > 0) {
          found.push({
            entityType: String(resolution.entityType || entityType).toLowerCase(),
            entityId: Number(resolution.entityId),
            entityLabel: resolution.entityLabel || null,
          });
          continue;
        }
        if (String(resolution?.reason || "").toLowerCase() === "ambiguous") {
          ambiguous.push({
            entityType: String(entityType).toLowerCase(),
            candidates: Array.isArray(resolution?.candidates) ? resolution.candidates : [],
          });
        }
      }
    }

    const foundDeduped = [];
    const seen = new Set();
    for (const row of found) {
      const key = `${row.entityType}:${row.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      foundDeduped.push(row);
    }

    if (foundDeduped.length === 1) {
      return {
        status: "resolved",
        resolvedEntity: foundDeduped[0],
      };
    }
    if (foundDeduped.length > 1 || ambiguous.length > 0) {
      return {
        status: "ambiguous",
        suggestionArtifact: this._buildScopeDiscoverySuggestion({
          message: userMessage,
          found: foundDeduped,
          ambiguous,
        }),
      };
    }
    return { status: "skipped", reason: "unresolved" };
  }

  _deriveResolvedEntityFromAmbiguity(ambiguityResolution = null) {
    const resolvedScope =
      ambiguityResolution?.resolvedScope && typeof ambiguityResolution.resolvedScope === "object"
        ? ambiguityResolution.resolvedScope
        : null;
    if (resolvedScope) {
      try {
        const resolvedStorageScope = resolveStorageTarget({
          activeScope: resolvedScope,
          storageHint: StorageHint.INHERIT,
        });
        return {
          entityType: resolvedStorageScope.entityType,
          entityId: resolvedStorageScope.entityId,
        };
      } catch (_) {
        // fall through to metadata
      }
    }

    const meta = ambiguityResolution?.resolutionMeta || null;
    const metaType = String(meta?.entityType || "").toLowerCase();
    const metaId = Number(meta?.chosenId || 0);
    if (metaType && Number.isInteger(metaId) && metaId > 0) {
      return { entityType: metaType, entityId: metaId };
    }

    return null;
  }

  _pinEntityScopeBeforeContract({
    requestContext,
    executionContext,
    resolvedEntity,
    source = "resolved",
  } = {}) {
    const type = String(resolvedEntity?.entityType || "").toLowerCase();
    const id = Number(resolvedEntity?.entityId || 0);
    if (!type || !Number.isInteger(id) || id <= 0) return null;

    const scopeKey = this._scopeKeyForEntityType(type);
    if (scopeKey) {
      requestContext[scopeKey] = id;
      executionContext[scopeKey] = id;
    }

    requestContext.resolvedEntity = { type, id };
    executionContext.resolvedEntity = { type, id };

    const persistedActiveScope = this._buildPersistedActiveScope({
      entityType: type,
      entityId: id,
      scope: requestContext,
      source,
      confidence: 1,
    });
    this._persistActiveScope({
      requestContext,
      activeScope: persistedActiveScope,
      reason: "pin_entity_scope_before_contract",
    });
    this._traceExecutionStep(requestContext, "scope_resolved", {
      source,
      entityType: type,
      entityId: id,
      dossierId: Number(requestContext?.dossierId || 0) || null,
      lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
    });
    if (this.helper?.scopeManager && typeof this.helper.scopeManager.applyEvent === "function") {
      this.helper.scopeManager.applyEvent(requestContext, {
        type: source === "explicit_selection" ? "ENTITY_SELECTED_EXPLICIT" : "READ_ENTITY_UNAMBIGUOUS",
        entityType: type,
        entityId: id,
        source: source === "explicit_selection" ? "explicit" : "resolved",
        resolutionPath: source === "explicit_selection" ? "explicit_selection" : "tool_single_entity",
      });
    }
    return { entityType: type, entityId: id };
  }

  async _proposeStoreDocumentDraftArtifact({
    documentArtifact,
    policy,
    executionContext,
    requestContext,
  }) {
    if (!documentArtifact || typeof documentArtifact !== "object") return null;
    const targetType = String(documentArtifact.entityType || "").toLowerCase();
    const targetId = Number(documentArtifact.entityId || 0);
    if (!targetType || !Number.isInteger(targetId) || targetId <= 0) return null;

    const mutationInput = {
      operations: [
        {
          op: "ATTACH_TO_ENTITY",
          entityType: targetType,
          payload: {
            target: { type: targetType, id: targetId },
            attachmentType: "doc_draft",
            payload: {
              title: documentArtifact.title || "Document Draft",
              content: String(documentArtifact.content || ""),
              metadata:
                documentArtifact.metadata &&
                typeof documentArtifact.metadata === "object" &&
                !Array.isArray(documentArtifact.metadata)
                  ? documentArtifact.metadata
                  : {},
              notes: "LLM-generated document draft",
            },
          },
          reason: "Store generated document draft as linked doc_draft artifact",
        },
      ],
      idempotencyKey: `store_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      origin: "chat",
      risk: "medium",
    };
    const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
    const v2Result = await this.engine.executeToolV2("universalMutation", mutationInput, executionPolicy, {
      ...executionContext,
      posture: "WORK",
      confirmed: true,
      sourceRoute: "/agent/chat",
    });
    const proposal = v2Result?.result || null;
    if (
      proposal &&
      proposal.proposalId &&
      proposal.requiresConfirmation === true &&
      typeof this.engine.storeProposal === "function"
    ) {
      this.engine.storeProposal(proposal, {
        sourceRoute: "/agent/chat",
        proposalKind: "entity_mutation",
        origin: "strong_mutation_intent",
        strongMutationIntent: true,
        explicitMutationCommand: false,
        requiresExtraConfirmation: false,
        riskLevel: "medium",
        conversationId: requestContext?.conversationId || null,
        sessionId: executionContext?.sessionId || null,
        userId: executionContext?.userId || null,
        tenantId: executionContext?.tenantId || null,
      });
      return {
        proposal,
        artifact: toProposalArtifact(proposal, executionContext?.sessionId || null),
      };
    }
    return null;
  }

  _buildOutputContractInvalidResult({
    parseError,
    loopResult,
    requestContext,
    userMessage,
    posture,
  }) {
    this.engine?.ledger?.record?.({
      type: "chat_output_contract_invalid",
      sourceRoute: "/agent/chat",
      errorCode: parseError?.code || "OUTPUT_CONTRACT_INVALID",
      messagePreview: String(loopResult?.finalMessage || "").slice(0, 160),
      parsePhase:
        parseError?.code === "OUTPUT_CONTRACT_INVALID_JSON" ? "json" : "schema",
      timestamp: new Date().toISOString(),
    });
    const finalMessage = "I could not produce a valid structured response for this request.";
    const errorArtifact = {
      type: "error",
      code: parseError?.code || "OUTPUT_CONTRACT_INVALID",
      message: "Invalid structured output contract returned by model.",
      details: Array.isArray(parseError?.details) ? parseError.details : undefined,
    };
    this.helper._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture,
      toolExecutions: loopResult?.toolExecutions || [],
      artifactType: "error",
      artifact: errorArtifact,
    });
    return withStateOutput(
      {
        message: finalMessage,
        toolExecutions: loopResult?.toolExecutions || [],
        stepCommentaries: loopResult?.stepCommentaries || [],
        rounds: loopResult?.rounds || 0,
        outputArtifact: errorArtifact,
      },
      CHAT_STATES.FINAL,
    );
  }

  _hasDraftIntentClassification(draftIntent = null) {
    const intent = String(draftIntent?.intent || "").toUpperCase();
    return intent.startsWith(DRAFT_INTENT_PREFIX);
  }

  _hasExplicitDraftingSignal(message = "") {
    const normalized = String(message || "").toLowerCase();
    if (!normalized) return false;
    const draftVerbPattern = /\b(draft|write|compose|prepare|r[eé]diger|r[eé]diger)\b/i;
    const generationVerbPattern = /\b(generate|create|produce)\b/i;
    const documentLikeNounPattern =
      /\b(document|letter|message|email|mail|petition|motion|request|application|memorandum|memo|brief|draft|courrier|lettre|عريضة|طلب|وثيقة|مذكرة)\b/i;
    const hasDraftVerb = draftVerbPattern.test(normalized);
    const hasGenerationDraftCue =
      generationVerbPattern.test(normalized) && documentLikeNounPattern.test(normalized);
    return hasDraftVerb || hasGenerationDraftCue;
  }

  _isScopeResolved(activeScope = null) {
    if (!activeScope || typeof activeScope !== "object") return false;
    const entityType = String(activeScope.entityType || "").toLowerCase();
    const entityId = Number(activeScope.entityId || 0);
    return Boolean(entityType && Number.isInteger(entityId) && entityId > 0);
  }

  _authorizeDocumentArtifact({
    requestContext,
    userMessage = "",
    draftIntent = null,
    activeScope = null,
    stage = "document",
    requireScope = true,
  } = {}) {
    const reasonCodes = [];
    if (!this._hasDraftIntentClassification(draftIntent)) {
      reasonCodes.push(DOCUMENT_ARTIFACT_AUTH_REASON.INTENT_NOT_DRAFT);
    }
    if (!this._hasExplicitDraftingSignal(userMessage)) {
      reasonCodes.push(DOCUMENT_ARTIFACT_AUTH_REASON.MISSING_EXPLICIT_DRAFT_SIGNAL);
    }
    if (requireScope && !this._isScopeResolved(activeScope)) {
      reasonCodes.push(DOCUMENT_ARTIFACT_AUTH_REASON.SCOPE_NOT_RESOLVED);
    }
    const allowed = reasonCodes.length === 0;
    this.engine?.ledger?.record?.({
      type: allowed ? "artifact_authorization_pass" : "artifact_authorization_denied",
      sourceRoute: "/agent/chat",
      artifactType: "document",
      stage,
      reasonCodes,
      draftIntent: draftIntent?.intent || null,
      hasExplicitDraftSignal: this._hasExplicitDraftingSignal(userMessage),
      hasScope: this._isScopeResolved(activeScope),
      scopeEntityType: activeScope?.entityType || null,
      scopeEntityId: Number(activeScope?.entityId || 0) || null,
      timestamp: new Date().toISOString(),
    });
    return { allowed, reasonCodes };
  }

  _buildDocumentAuthorizationDowngradeMessage({
    contract = null,
    reasonCodes = [],
  } = {}) {
    const base = String(contract?.content || "").trim();
    if (base) return base;
    if (reasonCodes.includes(DOCUMENT_ARTIFACT_AUTH_REASON.SCOPE_NOT_RESOLVED)) {
      return "I can help with this once the target record is selected.";
    }
    return "I can discuss this as guidance, but I cannot generate a document artifact for this request.";
  }

  _sanitizeUserFacingIdRequest(message = "") {
    const text = String(message || "").trim();
    if (!text) return text;
    const mentionsInternalId =
      /\b(internal|database|db|numeric)\b.{0,24}\bid\b/i.test(text) ||
      /\bneed\b.{0,32}\bid\b.{0,32}\b(retrieve|lookup|find|locate)\b/i.test(text) ||
      /\bprovide\b.{0,20}\b(id|identifier)\b/i.test(text);
    const referencesRecordType = /\b(lawsuit|dossier|task|session|mission|case|record|entity)\b/i.test(text);
    if (!mentionsInternalId || !referencesRecordType) return text;
    return "I can resolve this using the reference or name, without internal IDs. Please share the reference (for example PRO-2026-001 or DOS-2026-001), or select the record from the suggestions.";
  }

  async _buildMutationProposalFromOutputContract({
    contract,
    policy,
    executionContext,
    requestContext,
  }) {
    const metadata =
      contract?.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
        ? contract.metadata
        : {};
    const operations = Array.isArray(metadata.operations) ? metadata.operations : null;
    if (!operations || operations.length === 0) {
      const err = new Error("Mutation outputs must include metadata.operations.");
      err.code = "MUTATION_OPERATIONS_REQUIRED_IN_METADATA";
      throw err;
    }

    const mutationInput = {
      operations,
      idempotencyKey:
        typeof metadata.idempotencyKey === "string" && metadata.idempotencyKey.trim()
          ? metadata.idempotencyKey.trim()
          : `mutation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      origin: "chat",
      risk: ["low", "medium", "high"].includes(String(metadata.risk || "").toLowerCase())
        ? String(metadata.risk).toLowerCase()
        : "medium",
    };

    const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
    const v2Result = await this.engine.executeToolV2("universalMutation", mutationInput, executionPolicy, {
      ...executionContext,
      posture: "WORK",
      confirmed: true,
      sourceRoute: "/agent/chat",
    });
    const proposal = v2Result?.result || null;
    if (proposal && proposal.type === "entity_creation_form") {
      return proposal;
    }
    if (
      proposal &&
      proposal.proposalId &&
      proposal.requiresConfirmation === true &&
      typeof this.engine.storeProposal === "function"
    ) {
      const normalizedRisk = String(mutationInput?.risk || "medium").toLowerCase();
      this.engine.storeProposal(proposal, {
        sourceRoute: "/agent/chat",
        proposalKind: "entity_mutation",
        origin: "strong_mutation_intent",
        strongMutationIntent: true,
        explicitMutationCommand: false,
        requiresExtraConfirmation: normalizedRisk === "high",
        riskLevel: normalizedRisk,
        conversationId: requestContext?.conversationId || null,
        sessionId: executionContext?.sessionId || null,
        userId: executionContext?.userId || null,
        tenantId: executionContext?.tenantId || null,
        draftPromotion:
          metadata?.draftPromotion &&
          typeof metadata.draftPromotion === "object" &&
          !Array.isArray(metadata.draftPromotion)
            ? metadata.draftPromotion
            : null,
      });
    }
    return proposal;
  }

  async runChatTurn({
    message,
    context = {},
    followUpIntent = null,
    sessionId,
    agentVersion = "v3",
    metadata = {},
    userId = null,
    tenantId = null,
    signal,
  } = {}) {
    const userMessage = String(message || "").trim();
    if (!userMessage) {
      const err = new Error("Message is required");
      err.status = 400;
      throw err;
    }

    const requestContext = this._buildRequestContext({
      context,
      sessionId,
      metadata,
      userId,
      tenantId,
    });
    this._traceExecutionStep(requestContext, "context_packet_built", {
      hasClientId: Number(requestContext?.clientId || 0) > 0,
      hasDossierId: Number(requestContext?.dossierId || 0) > 0,
      hasResolvedEntity:
        Boolean(requestContext?.resolvedEntity?.type) &&
        Number(requestContext?.resolvedEntity?.id || 0) > 0,
    });
    const policy = this.engine._resolvePolicy(agentVersion);
    const llmHistory =
      typeof this.engine.contextStore?.getContextForLLMInjection === "function"
        ? this.engine.contextStore.getContextForLLMInjection(requestContext)
        : {};
    let sessionState = getChatOrchestratorState(this.engine, requestContext);
    const turnCounter = Number(sessionState?.turnCounter || 0) + 1;
    sessionState = updateChatOrchestratorState(this.engine, requestContext, {
      turnCounter,
    });
    const persistedScope =
      sessionState?.activeScope &&
      typeof sessionState.activeScope === "object" &&
      !Array.isArray(sessionState.activeScope)
        ? sessionState.activeScope
        : null;
    if (persistedScope) {
      const hasExplicitResolvedEntity =
        Boolean(requestContext?.resolvedEntity?.type) &&
        Number(requestContext?.resolvedEntity?.id || 0) > 0;
      const persistedEntityType = String(persistedScope?.entityType || "").toLowerCase();
      const persistedEntityId = Number(persistedScope?.entityId || 0);
      let resolvedEntityHydrated = false;
      if (
        !hasExplicitResolvedEntity &&
        persistedEntityType &&
        Number.isInteger(persistedEntityId) &&
        persistedEntityId > 0
      ) {
        requestContext.resolvedEntity = { type: persistedEntityType, id: persistedEntityId };
        const persistedScopeKey = this._scopeKeyForEntityType(persistedEntityType);
        if (persistedScopeKey && !Number(requestContext?.[persistedScopeKey] || 0)) {
          requestContext[persistedScopeKey] = persistedEntityId;
        }
        resolvedEntityHydrated = true;
      }
      const scopeKeys = [
        "taskId",
        "sessionId",
        "missionId",
        "financialEntryId",
        "lawsuitId",
        "dossierId",
        "clientId",
      ];
      const hydratedKeys = [];
      for (const key of scopeKeys) {
        if (!Number(requestContext?.[key] || 0) && Number(persistedScope?.[key] || 0) > 0) {
          requestContext[key] = Number(persistedScope[key]);
          hydratedKeys.push(key);
        }
      }
      if (resolvedEntityHydrated || hydratedKeys.length > 0) {
        this._traceExecutionStep(requestContext, "scope_loaded_for_mutation", {
          source: "session.activeScope",
          entityType: persistedEntityType || null,
          entityId: persistedEntityId || null,
          hydratedKeys,
          dossierId: Number(requestContext?.dossierId || 0) || null,
          lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
        });
      }
    }
    let state = selectInitialState({
      followUpIntent,
      sessionState,
      policy,
      requestContext,
    });
    const continuityBinding = bindLastResolvedEntityToRequestContext({
      userMessage,
      requestContext,
      lastResolvedEntity: sessionState?.lastResolvedEntity || null,
    });
    if (continuityBinding.applied && continuityBinding.boundEntity) {
      const persistedActiveScope = this._buildPersistedActiveScope({
        entityType: continuityBinding.boundEntity.type,
        entityId: continuityBinding.boundEntity.id,
        scope: requestContext,
        source: "scoped_entity_context",
        confidence: 0.95,
      });
      sessionState = updateChatOrchestratorState(this.engine, requestContext, {
        activeScope: persistedActiveScope,
      });
      this._traceExecutionStep(requestContext, "scope_persisted", {
        reason: "continuity_binding",
        entityType: continuityBinding.boundEntity.type,
        entityId: continuityBinding.boundEntity.id,
        dossierId: Number(requestContext?.dossierId || 0) || null,
        lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
      });
      this._traceExecutionStep(requestContext, "scoped_entity_context_bound", {
        entityType: continuityBinding.boundEntity.type,
        entityId: continuityBinding.boundEntity.id,
        reason: continuityBinding.reason,
      });
    } else {
      this._traceExecutionStep(requestContext, "scoped_entity_context_skipped", {
        reason: continuityBinding.reason,
      });
    }
    const pendingClarification = sessionState?.pendingClarification || null;
    const pendingArtifact = pendingClarification?.artifact || null;
    const pendingSuggestions = Array.isArray(pendingArtifact?.suggestions)
      ? pendingArtifact.suggestions
      : [];
    const pendingCandidateKeySet = new Set();
    for (const candidate of pendingSuggestions) {
      if (!candidate || typeof candidate !== "object") continue;
      Object.keys(candidate).forEach((key) => pendingCandidateKeySet.add(String(key)));
    }
    this._traceExecutionStep(requestContext, "clarification_gate_state", {
      selectedInitialState: state,
      hasPendingClarification: Boolean(pendingClarification),
      pendingClarificationType:
        String(pendingArtifact?.type || pendingClarification?.entityType || "none"),
      pendingCandidatesCount: pendingSuggestions.length,
      pendingCandidateKeysPresent: Array.from(pendingCandidateKeySet).sort(),
      branchTaken: state === CHAT_STATES.CLARIFY ? "CLARIFY" : "normal",
    });

    let resolvedSelection = this.helper._extractResolvedSelection(followUpIntent);
    if (state === CHAT_STATES.CLARIFY) {
      const pendingClarification = sessionState.pendingClarification || null;
      const pendingExpiresAt = pendingClarification?.expiresAt
        ? Date.parse(pendingClarification.expiresAt)
        : NaN;
      const ttlExpired =
        Number.isFinite(pendingExpiresAt) && pendingExpiresAt > 0
          ? Date.now() > pendingExpiresAt
          : pendingClarification?.createdAt
            ? Date.now() - Date.parse(pendingClarification.createdAt) > PENDING_CLARIFICATION_TTL_MS
            : false;
      const turnBudgetExceeded =
        Number.isFinite(Number(pendingClarification?.turnsRemaining))
          ? Number(pendingClarification.turnsRemaining) <= 0
          : false;
      const matcherResult = resolvedSelection
        ? {
            isAnswer: true,
            reason: "resolved_selection_follow_up_intent",
            resolved: {
              kind: "selection",
              entityType: resolvedSelection.entityType,
              entityId: resolvedSelection.entityId,
              label: resolvedSelection.label || null,
              scope: resolvedSelection.scope || {},
            },
          }
        : clarificationAnswerMatcher(pendingClarification, userMessage);
      const freshQueryIR = buildQueryIR({
        message: String(userMessage || ""),
        requestContext,
      });
      const hasFreshCompleteIntent = Boolean(freshQueryIR?.intent?.name);
      const shouldClearForFreshTurn =
        !resolvedSelection &&
        (ttlExpired ||
          turnBudgetExceeded ||
          !matcherResult.isAnswer ||
          (hasFreshCompleteIntent && matcherResult?.resolved?.kind !== "selection"));
      if (pendingClarification && shouldClearForFreshTurn) {
        const clearReason = ttlExpired
          ? "expired_ttl"
          : turnBudgetExceeded
            ? "expired_turn_budget"
            : hasFreshCompleteIntent
              ? "fresh_complete_intent_override"
            : matcherResult.reason || "not_a_clarification_answer";
        updateChatOrchestratorState(this.engine, requestContext, {
          pendingClarification: null,
          activeState: pendingClarification?.resumeState || CHAT_STATES.RETRIEVE,
        });
        this.engine?.ledger?.record?.({
          type: "clarify_cleared_new_intent",
          sourceRoute: "/agent/chat",
          reason: clearReason,
          hasPendingClarification: true,
          pendingClarificationType:
            String(pendingClarification?.artifact?.type || pendingClarification?.entityType || "unknown"),
          pendingCandidatesCount: Array.isArray(pendingClarification?.artifact?.suggestions)
            ? pendingClarification.artifact.suggestions.length
            : 0,
          turnCounter,
          timestamp: new Date().toISOString(),
        });
        this._traceExecutionStep(requestContext, "clarification_pending_cleared", {
          cleared: true,
          reason: clearReason,
          branchTaken: "normal",
          clarificationClearedByFreshIntent: hasFreshCompleteIntent,
        });
        state = pendingClarification?.resumeState || CHAT_STATES.RETRIEVE;
      }
      if (
        !resolvedSelection &&
        matcherResult.isAnswer &&
        matcherResult?.resolved?.kind === "selection"
      ) {
        const matched = matcherResult.resolved;
        resolvedSelection = {
          entityType: String(matched.entityType || "").toLowerCase(),
          entityId: Number(matched.entityId),
          label: String(matched.label || "").trim() || null,
          scope:
            matched.scope && typeof matched.scope === "object" && !Array.isArray(matched.scope)
              ? matched.scope
              : {},
        };
      }
      if (resolvedSelection) {
        Object.assign(requestContext, resolvedSelection.scope || {});
        const persistedActiveScope = this._buildPersistedActiveScope({
          entityType: resolvedSelection.entityType,
          entityId: resolvedSelection.entityId,
          scope: requestContext,
          source: "explicit_selection",
          confidence: 1,
        });
        updateChatOrchestratorState(this.engine, requestContext, {
          activeScope: persistedActiveScope,
          pendingClarification: null,
          activeState: pendingClarification?.resumeState || CHAT_STATES.RETRIEVE,
        });
        this._traceExecutionStep(requestContext, "scope_resolved", {
          source: "clarification_selection",
          entityType: resolvedSelection.entityType,
          entityId: resolvedSelection.entityId,
          dossierId: Number(requestContext?.dossierId || 0) || null,
          lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
        });
        this._traceExecutionStep(requestContext, "scope_persisted", {
          reason: "clarification_selection",
          entityType: resolvedSelection.entityType,
          entityId: resolvedSelection.entityId,
          dossierId: Number(requestContext?.dossierId || 0) || null,
          lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
        });
        this._traceExecutionStep(requestContext, "clarification_pending_cleared", {
          cleared: true,
          reason: matcherResult?.reason || "resolved_selection",
          branchTaken: "CLARIFY",
        });
        state = pendingClarification?.resumeState || CHAT_STATES.RETRIEVE;
      } else if (pendingClarification?.artifact && !shouldClearForFreshTurn) {
        const decrementedTurns = Number.isFinite(Number(pendingClarification?.turnsRemaining))
          ? Math.max(0, Number(pendingClarification.turnsRemaining) - 1)
          : PENDING_CLARIFICATION_MAX_TURNS - 1;
        if (!ttlExpired && !turnBudgetExceeded) {
          updateChatOrchestratorState(this.engine, requestContext, {
            pendingClarification: {
              ...pendingClarification,
              turnsRemaining: decrementedTurns,
            },
            activeState: CHAT_STATES.CLARIFY,
          });
        }
        const finalMessage =
          String(pendingClarification.artifact.message || "").trim() ||
          "Please choose the exact record.";
        this.helper._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture: "ASSISTANT",
          toolExecutions: [],
          artifactType: "context_suggestion",
          artifact: pendingClarification.artifact,
        });
        this._traceExecutionStep(requestContext, "clarification_pending_replayed", {
          cleared: false,
          reason: matcherResult?.reason || "clarification_replay",
          turnsRemaining: decrementedTurns,
          branchTaken: "CLARIFY",
        });
        return withStateOutput(
          {
            message: finalMessage,
            ambiguityArtifact: pendingClarification.artifact,
            outputArtifact: pendingClarification.artifact,
            resolutionMeta: pendingClarification.resolutionMeta || null,
          },
          CHAT_STATES.FINAL,
        );
      }
    }

    if (state === CHAT_STATES.EXECUTE && sessionState.pendingProposal) {
      const pendingProposal = sessionState.pendingProposal;
      const finalMessage =
        "A change is ready to execute and still requires explicit confirmation. Use the confirmation action in the UI.";
      this.helper._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
        artifactType: "proposal",
        artifact: pendingProposal.artifact || null,
      });
      return withStateOutput(
        {
          message: finalMessage,
          outputArtifact: pendingProposal.artifact || null,
          mutationOutcome: {
            status: "PROPOSED",
            proposalId: pendingProposal.proposalId,
            safeMessage: finalMessage,
          },
        },
        CHAT_STATES.FINAL,
      );
    }

    const pendingClarificationOriginalMessage =
      resolvedSelection &&
      pendingClarification?.artifact &&
      typeof pendingClarification.artifact === "object"
        ? String(pendingClarification.artifact.originalMessage || "").trim() || null
        : null;
    const continuationOriginalMessage =
      String(followUpIntent?.originalMessage || "").trim() ||
      pendingClarificationOriginalMessage ||
      null;
    const continuationIntentSource =
      String(followUpIntent?.intent || "").toUpperCase() === "RESOLVE_CONTEXT_AND_CONTINUE"
        ? "follow_up_intent"
        : pendingClarificationOriginalMessage
          ? "pending_clarification_artifact"
          : null;
    const shouldResumeOriginalIntent =
      Boolean(resolvedSelection) &&
      Boolean(continuationIntentSource) &&
      Boolean(continuationOriginalMessage);
    const effectiveUserMessage = shouldResumeOriginalIntent
      ? continuationOriginalMessage
      : resolvedSelection
        ? `show ${resolvedSelection.entityType} ${resolvedSelection.label || resolvedSelection.entityId}`
        : userMessage;
    if (shouldResumeOriginalIntent) {
      this._traceExecutionStep(requestContext, "context_resolution_resumed", {
        resumedFrom: continuationIntentSource,
        originalIntent: String(followUpIntent?.originalIntent || "").trim() || null,
        entityType: resolvedSelection?.entityType || null,
        entityId: Number(resolvedSelection?.entityId || 0) || null,
      });
    } else if (resolvedSelection) {
      this._traceExecutionStep(requestContext, "context_resolution_resumed", {
        resumedFrom: "fallback_show_entity",
        originalIntent: String(followUpIntent?.originalIntent || "").trim() || null,
        entityType: resolvedSelection?.entityType || null,
        entityId: Number(resolvedSelection?.entityId || 0) || null,
      });
    }
    const posture = await this.helper._resolvePosture({
      message: effectiveUserMessage,
      context: requestContext,
      llmHistory,
    });
    this._traceExecutionStep(requestContext, "posture_determined", {
      posture,
    });
    const executionContext = {
      ...requestContext,
      posture,
      confirmed: true,
      sessionId: sessionId || null,
      dataAccess:
        requestContext.dataAccess && typeof requestContext.dataAccess === "object"
          ? requestContext.dataAccess
          : {},
    };
    const draftIntent = detectDraftIntent(effectiveUserMessage, requestContext);

    if (resolvedSelection) {
      clearPendingClarificationState(this.engine, requestContext);
      requestContext.resolvedEntity = {
        type: resolvedSelection.entityType,
        id: resolvedSelection.entityId,
        label: resolvedSelection.label,
      };
      const persistedActiveScope = this._buildPersistedActiveScope({
        entityType: resolvedSelection.entityType,
        entityId: resolvedSelection.entityId,
        scope: requestContext,
        source: "explicit_selection",
        confidence: 1,
      });
      updateChatOrchestratorState(this.engine, requestContext, {
        activeScope: persistedActiveScope,
      });
      this._traceExecutionStep(requestContext, "scope_resolved", {
        source: "follow_up_selection",
        entityType: resolvedSelection.entityType,
        entityId: resolvedSelection.entityId,
        dossierId: Number(requestContext?.dossierId || 0) || null,
        lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
      });
      this._traceExecutionStep(requestContext, "scope_persisted", {
        reason: "follow_up_selection",
        entityType: resolvedSelection.entityType,
        entityId: resolvedSelection.entityId,
        dossierId: Number(requestContext?.dossierId || 0) || null,
        lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
      });
      this._pinEntityScopeBeforeContract({
        requestContext,
        executionContext,
        resolvedEntity: {
          entityType: resolvedSelection.entityType,
          entityId: resolvedSelection.entityId,
        },
        source: "explicit_selection",
      });
      this._traceExecutionStep(requestContext, "scope_pinned_pre_llm", {
        source: "explicit_selection",
        entityType: resolvedSelection.entityType,
        entityId: resolvedSelection.entityId,
      });
    }

    const discoveredScope = await this._discoverScopeBeforeContract({
      userMessage: effectiveUserMessage,
      requestContext,
      executionContext,
      policy,
      llmHistory,
    });
    this._traceExecutionStep(requestContext, "scope_discovery_completed", {
      status: discoveredScope?.status || "skipped",
      reason: discoveredScope?.reason || null,
      entityType: discoveredScope?.resolvedEntity?.entityType || null,
      entityId: discoveredScope?.resolvedEntity?.entityId || null,
    });
    if (discoveredScope?.status === "resolved" && discoveredScope?.resolvedEntity) {
      this._pinEntityScopeBeforeContract({
        requestContext,
        executionContext,
        resolvedEntity: discoveredScope.resolvedEntity,
        source: "resolved",
      });
      this._traceExecutionStep(requestContext, "scope_pinned_pre_llm", {
        source: "scope_discovery",
        entityType: discoveredScope.resolvedEntity.entityType,
        entityId: discoveredScope.resolvedEntity.entityId,
      });
    } else if (discoveredScope?.status === "ambiguous" && discoveredScope?.suggestionArtifact) {
      const pendingClarification = {
        entityType: discoveredScope?.suggestionArtifact?.entityType || null,
        resumeState: state,
        artifact: discoveredScope.suggestionArtifact,
        resolutionMeta: {
          status: "ambiguous",
          entityType: discoveredScope?.suggestionArtifact?.entityType || null,
          candidatesCount: Array.isArray(discoveredScope?.suggestionArtifact?.suggestions)
            ? discoveredScope.suggestionArtifact.suggestions.length
            : 0,
          autoPicked: false,
          chosenId: null,
        },
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
        turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
      };
      updateChatOrchestratorState(this.engine, requestContext, {
        activeState: CHAT_STATES.CLARIFY,
        pendingClarification,
      });
      const finalMessage =
        String(discoveredScope.suggestionArtifact.message || "").trim() ||
        "I need one more detail to continue.";
      this.helper._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture,
        toolExecutions: [],
        artifactType: "context_suggestion",
        artifact: discoveredScope.suggestionArtifact,
      });
      return withStateOutput(
        {
          message: finalMessage,
          ambiguityArtifact: discoveredScope.suggestionArtifact,
          outputArtifact: discoveredScope.suggestionArtifact,
          resolutionMeta: pendingClarification.resolutionMeta,
        },
        CHAT_STATES.FINAL,
      );
    }

    const llmActiveScope =
      llmHistory?.conversationScope?.activeScope &&
      llmHistory.conversationScope.activeScope.entityType &&
      Number.isInteger(Number(llmHistory.conversationScope.activeScope.entityId)) &&
      Number(llmHistory.conversationScope.activeScope.entityId) > 0
        ? {
            entityType: String(llmHistory.conversationScope.activeScope.entityType).toLowerCase(),
            entityId: Number(llmHistory.conversationScope.activeScope.entityId),
          }
        : null;
    const governanceActiveScope =
      llmActiveScope || this._resolveActiveEntityScope(requestContext, llmHistory);
    this._traceExecutionStep(requestContext, "scope_loaded_for_mutation", {
      source: llmActiveScope ? "llm_history.activeScope" : "request_or_session_scope",
      entityType: governanceActiveScope?.entityType || null,
      entityId: Number(governanceActiveScope?.entityId || 0) || null,
      dossierId: Number(requestContext?.dossierId || 0) || null,
      lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
    });
    const governanceExecutionContext = { ...executionContext };
    if (
      governanceActiveScope?.entityType &&
      Number.isInteger(Number(governanceActiveScope?.entityId)) &&
      Number(governanceActiveScope.entityId) > 0
    ) {
      const scopeKey = this._scopeKeyForEntityType(governanceActiveScope.entityType);
      if (scopeKey && !Number(requestContext?.[scopeKey] || 0)) {
        governanceExecutionContext[scopeKey] = Number(governanceActiveScope.entityId);
      }
      // Prefer active scope from UI/session context for mutation governance.
      governanceExecutionContext.resolvedEntity = {
        type: String(governanceActiveScope.entityType).toLowerCase(),
        id: Number(governanceActiveScope.entityId),
      };
    }
    const continuityStructuredDraft =
      sessionState?.lastStructuredDraft &&
      typeof sessionState.lastStructuredDraft === "object" &&
      !Array.isArray(sessionState.lastStructuredDraft)
        ? sessionState.lastStructuredDraft
        : sessionState?.structuredDraft &&
            typeof sessionState.structuredDraft === "object" &&
            !Array.isArray(sessionState.structuredDraft)
          ? sessionState.structuredDraft
          : null;
    if (continuityStructuredDraft) {
      this._traceExecutionStep(requestContext, "structured_draft_detected", {
        source:
          sessionState?.lastStructuredDraft &&
          typeof sessionState.lastStructuredDraft === "object" &&
          !Array.isArray(sessionState.lastStructuredDraft)
            ? "lastStructuredDraft"
            : "structuredDraft",
        draftType: continuityStructuredDraft?.type || null,
        draftEntityType:
          this._deriveEntityTypeFromStructuredDraft(continuityStructuredDraft) || null,
        itemCount: Array.isArray(continuityStructuredDraft?.items)
          ? continuityStructuredDraft.items.length
          : 0,
      });
    }
    const shouldPromoteFromContinuity =
      Boolean(continuityStructuredDraft) &&
      this._isExecutionPromotionIntent(effectiveUserMessage);
    if (Boolean(continuityStructuredDraft)) {
      this._traceExecutionStep(requestContext, "promotion_attempted", {
        source: "continuity_pre_governance",
        executionIntentDetected: shouldPromoteFromContinuity,
      });
    } else {
      this._traceExecutionStep(requestContext, "promotion_skipped_reason", {
        reason: "no_structured_draft_in_session",
      });
    }
    if (shouldPromoteFromContinuity) {
      const explicitEntityHint = this._deriveEntityTypeHintFromMessage(effectiveUserMessage);
      const continuityEntityType =
        String(explicitEntityHint || "").toLowerCase() ||
        String(sessionState?.lastDraftEntityType || "").toLowerCase() ||
        this._deriveEntityTypeFromStructuredDraft(continuityStructuredDraft) ||
        null;
      if (continuityEntityType) {
        governanceExecutionContext.promotionLockEntityType = continuityEntityType;
        governanceExecutionContext.promotionLockReason = "structured_draft_continuity";
        this._traceExecutionStep(requestContext, "promotion_detected", {
          entityType: continuityEntityType,
          draftType: continuityStructuredDraft?.type || null,
          itemCount: Array.isArray(continuityStructuredDraft?.items)
            ? continuityStructuredDraft.items.length
            : 0,
        });
        this._traceExecutionStep(requestContext, "promotion_entity_type_locked", {
          entityType: continuityEntityType,
          source: "lastDraftEntityType_or_structuredDraft",
        });
      } else {
        this._traceExecutionStep(requestContext, "promotion_skipped_reason", {
          reason: "continuity_entity_type_unresolved",
          explicitEntityHint: explicitEntityHint || null,
          lastDraftEntityType: sessionState?.lastDraftEntityType || null,
          draftType: continuityStructuredDraft?.type || null,
        });
      }
    } else if (continuityStructuredDraft) {
      this._traceExecutionStep(requestContext, "promotion_skipped_reason", {
        reason: "execution_intent_not_detected",
      });
    }

    const deterministicBulkTaskOutcome = await this._tryDeterministicBulkTaskCreation({
      userMessage: effectiveUserMessage,
      requestContext,
      executionContext,
      policy,
      posture,
      sessionState,
    });
    if (deterministicBulkTaskOutcome) {
      return deterministicBulkTaskOutcome;
    }

    const continuityGovernance =
      shouldPromoteFromContinuity && governanceExecutionContext?.promotionLockEntityType
        ? this._buildContinuityPromotionGovernance({
            entityType: governanceExecutionContext.promotionLockEntityType,
            continuityStructuredDraft,
            activeScopeContext: governanceExecutionContext,
          })
        : null;
    const mutationGovernance = continuityGovernance
      ? continuityGovernance
      : await evaluateMutationGovernance({
          userMessage: effectiveUserMessage,
          requestContext,
          executionContext: governanceExecutionContext,
          llmExtractor: this.helper?.mutationIntentExtractor,
        });
    if (mutationGovernance?.shouldBypassReadResolution) {
      this._traceExecutionStep(requestContext, "mutation_intent_detected", {
        intent: mutationGovernance?.intent || null,
        entityType: mutationGovernance?.entityType || null,
        source: continuityGovernance ? "continuity_governance" : "mutation_governance",
        confidence: Number.isFinite(Number(mutationGovernance?.confidence))
          ? Number(mutationGovernance.confidence)
          : null,
      });
    }
    this._traceExecutionStep(requestContext, "mutation_governance_evaluated", {
      intent: mutationGovernance?.intent || null,
      entityType: mutationGovernance?.entityType || null,
      entityTypeResolutionStatus: mutationGovernance?.entityTypeResolution?.status || null,
      entityTypeResolutionSource: mutationGovernance?.entityTypeResolution?.source || null,
      entityTypeResolutionCandidates: Array.isArray(mutationGovernance?.entityTypeResolution?.candidates)
        ? mutationGovernance.entityTypeResolution.candidates
        : [],
      confidence: Number.isFinite(Number(mutationGovernance?.confidence))
        ? Number(mutationGovernance.confidence)
        : null,
      missingRequiredFields: Array.isArray(mutationGovernance?.missingRequiredFields)
        ? mutationGovernance.missingRequiredFields
        : [],
      bypassReadResolution: Boolean(mutationGovernance?.shouldBypassReadResolution),
    });
    const parentResolutionStatus = String(mutationGovernance?.parentResolution?.status || "").toLowerCase();
    if (parentResolutionStatus === "ready") {
      const resolutionSource = String(mutationGovernance?.parentResolution?.source || "").toLowerCase();
      if (resolutionSource.includes("scope")) {
        this._traceExecutionStep(requestContext, "parent_resolution_inferred_from_scope", {
          entityType: mutationGovernance?.entityType || null,
          source: mutationGovernance?.parentResolution?.source || null,
        });
      } else {
        this._traceExecutionStep(requestContext, "parent_resolution_success", {
          entityType: mutationGovernance?.entityType || null,
          source: mutationGovernance?.parentResolution?.source || null,
        });
      }
    } else if (parentResolutionStatus === "ambiguous_parent_selection") {
      this._traceExecutionStep(requestContext, "parent_resolution_ambiguous", {
        entityType: mutationGovernance?.entityType || null,
        optionsCount: Array.isArray(mutationGovernance?.parentSelection?.options)
          ? mutationGovernance.parentSelection.options.length
          : 0,
      });
    } else if (parentResolutionStatus === "needs_parent_input") {
      this._traceExecutionStep(requestContext, "parent_resolution_failed", {
        entityType: mutationGovernance?.entityType || null,
        source: mutationGovernance?.parentResolution?.source || null,
      });
    }
    if (mutationGovernance?.shouldBypassReadResolution) {
      if (
        parentResolutionStatus === "needs_parent_input" ||
        parentResolutionStatus === "ambiguous_parent_selection"
      ) {
        const parentMissing = Array.isArray(mutationGovernance?.parentResolution?.missingParentFields)
          ? mutationGovernance.parentResolution.missingParentFields.filter(Boolean)
          : [];
        const clarifyArtifact = this._buildMutationGovernanceClarificationArtifact({
          governance: {
            ...mutationGovernance,
            missingRequiredFields: parentMissing,
          },
          userMessage: effectiveUserMessage,
        });
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.CLARIFY,
          pendingClarification: {
            entityType: mutationGovernance?.entityType || null,
            resumeState: state,
            artifact: clarifyArtifact,
            resolutionMeta: {
              status: "missing",
              entityType: mutationGovernance?.entityType || null,
              candidatesCount: Array.isArray(mutationGovernance?.parentSelection?.options)
                ? mutationGovernance.parentSelection.options.length
                : 0,
              autoPicked: false,
              chosenId: null,
            },
            createdAt: nowIso(),
            expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
            turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
          },
        });
        const finalMessage =
          String(clarifyArtifact.message || "").trim() ||
          "Select the parent record to continue with creation.";
        this.helper._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "context_suggestion",
          artifact: clarifyArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: clarifyArtifact,
            ambiguityArtifact: clarifyArtifact,
            resolutionMeta: {
              mutationGovernance,
            },
          },
          CHAT_STATES.FINAL,
        );
      }
      const draftPromotion = this._resolveDraftPromotion({
        mutationGovernance,
        sessionState,
      });
      if (!draftPromotion) {
        this._traceExecutionStep(requestContext, "promotion_skipped_reason", {
          reason: "draft_promotion_unavailable_after_governance",
          governanceIntent: mutationGovernance?.intent || null,
          governanceEntityType: mutationGovernance?.entityType || null,
        });
      }
      if (draftPromotion) {
        this._traceExecutionStep(requestContext, "promotion_detected", {
          entityType: mutationGovernance?.entityType || draftPromotion?.entityType || null,
          draftType: draftPromotion?.structuredDraft?.type || null,
          itemCount: Array.isArray(draftPromotion?.items) ? draftPromotion.items.length : 0,
        });
        this._traceExecutionStep(requestContext, "draft_promotion_detected", {
          entityType: mutationGovernance?.entityType || null,
          draftType: draftPromotion?.structuredDraft?.type || null,
          itemCount: Array.isArray(draftPromotion?.items) ? draftPromotion.items.length : 0,
        });
      }
      const operations = this._buildMutationOperationsFromGovernance(
        mutationGovernance,
        requestContext,
        {
          promotedItems: draftPromotion?.items || [],
          promotedLinkedScope: draftPromotion?.linkedScope || null,
          activeScopeContext: governanceExecutionContext,
        },
      );
      this._traceExecutionStep(requestContext, "operations_generated_count", {
        count: Array.isArray(operations) ? operations.length : 0,
        entityType: mutationGovernance?.entityType || null,
        intent: mutationGovernance?.intent || null,
      });
      this._traceExecutionStep(requestContext, "scope_bound", {
        dossierId: Number(governanceExecutionContext?.dossierId || 0) || null,
        lawsuitId: Number(governanceExecutionContext?.lawsuitId || 0) || null,
      });
      const missingRequiredFields = Array.isArray(mutationGovernance?.missingRequiredFields)
        ? mutationGovernance.missingRequiredFields.filter(Boolean)
        : [];
      const effectiveMissingRequiredFields = draftPromotion
        ? this._resolveMissingFieldsAfterDraftPromotion(missingRequiredFields, operations)
        : missingRequiredFields;
      if (draftPromotion) {
        this._traceExecutionStep(requestContext, "promotion_operations_built", {
          entityType: mutationGovernance?.entityType || draftPromotion?.entityType || null,
          operationCount: Array.isArray(operations) ? operations.length : 0,
          missingRequiredFields: effectiveMissingRequiredFields,
        });
        this._traceExecutionStep(requestContext, "draft_promotion_operations_built", {
          entityType: mutationGovernance?.entityType || null,
          operationCount: Array.isArray(operations) ? operations.length : 0,
          missingRequiredFields: effectiveMissingRequiredFields,
        });
      }
      if (effectiveMissingRequiredFields.length > 0 || operations.length === 0) {
        this._traceExecutionStep(requestContext, "validation_failed", {
          reason:
            effectiveMissingRequiredFields.length > 0
              ? "missing_required_fields"
              : "no_operations_generated",
          missingRequiredFields: effectiveMissingRequiredFields,
          operationsCount: Array.isArray(operations) ? operations.length : 0,
        });
        if (draftPromotion) {
          this._traceExecutionStep(requestContext, "promotion_failed", {
            entityType: mutationGovernance?.entityType || draftPromotion?.entityType || null,
            reason:
              effectiveMissingRequiredFields.length > 0
                ? "missing_required_fields"
                : "no_operations_built",
            missingRequiredFields: effectiveMissingRequiredFields,
          });
        }
        const clarifyArtifact = this._buildMutationGovernanceClarificationArtifact({
          governance: {
            ...mutationGovernance,
            missingRequiredFields: effectiveMissingRequiredFields,
          },
          userMessage: effectiveUserMessage,
        });
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.CLARIFY,
          pendingClarification: {
            entityType: mutationGovernance?.entityType || null,
            resumeState: state,
            artifact: clarifyArtifact,
            resolutionMeta: {
              status: "missing",
              entityType: mutationGovernance?.entityType || null,
              candidatesCount: 0,
              autoPicked: false,
              chosenId: null,
            },
            createdAt: nowIso(),
            expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
            turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
          },
        });
        const finalMessage =
          String(clarifyArtifact.message || "").trim() ||
          "I need a few required fields before preparing this mutation proposal.";
        this.helper._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "context_suggestion",
          artifact: clarifyArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: clarifyArtifact,
            ambiguityArtifact: clarifyArtifact,
            resolutionMeta: {
              mutationGovernance,
            },
          },
          CHAT_STATES.FINAL,
        );
      }
      this._traceExecutionStep(requestContext, "validation_passed", {
        operationsCount: Array.isArray(operations) ? operations.length : 0,
      });

      const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
      const targetScopeBinding = this._buildScopeSnapshotForStorage({
        requestContext,
        activeScope,
      });
      const syntheticContract = {
        outputType: "mutation",
        title: "Mutation Proposal",
        content: `I prepared a ${mutationGovernance.intent} proposal for ${mutationGovernance.entityType}. Please review and confirm.`,
        metadata: {
          risk: "medium",
          operations,
          targetScope: targetScopeBinding,
          governance: {
            intent: mutationGovernance.intent,
            entityType: mutationGovernance.entityType,
            confidence: mutationGovernance.confidence,
            dedupeQuery: mutationGovernance.dedupeQuery || null,
          },
          ...(draftPromotion
            ? {
                draftPromotion: {
                  enabled: true,
                  draftType: draftPromotion?.structuredDraft?.type || null,
                  itemCount: Array.isArray(draftPromotion?.items)
                    ? draftPromotion.items.length
                    : 0,
                  clearOnSuccess: true,
                },
              }
            : {}),
        },
      };
      let proposal = null;
      try {
        proposal = await this._buildMutationProposalFromOutputContract({
          contract: syntheticContract,
          policy,
          executionContext: {
            ...executionContext,
            userMessage: effectiveUserMessage,
          },
          requestContext,
        });
      } catch (error) {
        this._traceExecutionStep(requestContext, "mutation_proposal_build_failed_reason", {
          errorCode: String(error?.code || "MUTATION_GOVERNANCE_PROPOSAL_FAILED"),
          message: String(error?.message || ""),
          mutationIntent: mutationGovernance?.intent || null,
          mutationEntityType: mutationGovernance?.entityType || null,
          operationsCount: Array.isArray(operations) ? operations.length : 0,
          promoted: Boolean(draftPromotion),
        });
        if (draftPromotion) {
          this._traceExecutionStep(requestContext, "promotion_failed", {
            entityType: mutationGovernance?.entityType || draftPromotion?.entityType || null,
            reason: String(error?.code || "proposal_build_failed"),
          });
        }
        const errorArtifact = {
          type: "error",
          code: String(error?.code || "MUTATION_GOVERNANCE_PROPOSAL_FAILED"),
          message: String(error?.message || "Mutation governance could not build proposal."),
        };
        const finalMessage = "I could not prepare the requested mutation proposal.";
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "error",
          artifact: errorArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: errorArtifact,
            resolutionMeta: {
              mutationGovernance,
            },
          },
          CHAT_STATES.FINAL,
        );
      }
      if (proposal?.type === "entity_creation_form") {
        if (draftPromotion) {
          this._traceExecutionStep(requestContext, "promotion_failed", {
            entityType: mutationGovernance?.entityType || draftPromotion?.entityType || null,
            reason: "entity_creation_form_required",
          });
        }
        const finalMessage = "I need a few required identity fields before preparing this mutation.";
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "entity_creation_form",
          artifact: proposal,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: proposal,
            resolutionMeta: {
              mutationGovernance,
            },
          },
          CHAT_STATES.FINAL,
        );
      }
      if (proposal?.proposalId && proposal.requiresConfirmation === true) {
        this._traceExecutionStep(requestContext, "proposal_created", {
          proposalId: proposal?.proposalId || null,
          actionType: proposal?.actionType || null,
          operationsCount: Array.isArray(operations) ? operations.length : 0,
        });
        const proposalArtifact = toProposalArtifact(proposal, executionContext?.sessionId || null);
        proposalArtifact.targetScope = targetScopeBinding;
        proposalArtifact.operations = operations;
        proposalArtifact.mutationGovernance = {
          intent: mutationGovernance.intent,
          entityType: mutationGovernance.entityType,
          confidence: mutationGovernance.confidence,
        };
        const pendingProposal = {
          proposalId: proposal.proposalId,
          summary: proposal.humanReadableSummary || null,
          riskLevel: proposal?.confirmation?.extraRiskAck === true ? "high" : "normal",
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          artifact: proposalArtifact,
        };
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.EXECUTE,
          pendingProposal,
          pendingClarification: null,
        });
        const finalMessage =
          syntheticContract.content ||
          "I prepared a mutation proposal. Please review and confirm before execution.";
        if (draftPromotion) {
          this._traceExecutionStep(requestContext, "promotion_success", {
            proposalId: proposal?.proposalId || null,
            entityType: mutationGovernance?.entityType || draftPromotion?.entityType || null,
            itemCount: Array.isArray(draftPromotion?.items) ? draftPromotion.items.length : 0,
          });
          this._traceExecutionStep(requestContext, "draft_promotion_executed", {
            proposalId: proposal?.proposalId || null,
            entityType: mutationGovernance?.entityType || null,
            itemCount: Array.isArray(draftPromotion?.items) ? draftPromotion.items.length : 0,
          });
        }
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "proposal",
          artifact: proposalArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: proposalArtifact,
            mutationOutcome: {
              status: "PROPOSED",
              proposalId: proposal.proposalId,
              proposalArtifact,
            },
            resolutionMeta: {
              outputContract: syntheticContract,
              routedOutputType: "mutation",
              mutationGovernance,
            },
          },
          CHAT_STATES.EXECUTE,
        );
      }
      this._traceExecutionStep(requestContext, "proposal_failed", {
        reason: "proposal_not_returned_or_not_confirmable",
        actionType: proposal?.actionType || null,
        hasProposalId: Boolean(proposal?.proposalId),
      });
    }
    if (!mutationGovernance?.shouldBypassReadResolution) {
      this._traceExecutionStep(requestContext, "promotion_skipped_reason", {
        reason: "mutation_governance_bypass_false",
        governanceIntent: mutationGovernance?.intent || null,
        governanceEntityType: mutationGovernance?.entityType || null,
        confidence: Number.isFinite(Number(mutationGovernance?.confidence))
          ? Number(mutationGovernance.confidence)
          : null,
      });
    }

    const queryIR = buildQueryIR({
      message: String(effectiveUserMessage || ""),
      requestContext,
    });
    this._traceExecutionStep(requestContext, "query_ir_produced", {
      rawMessage: String(effectiveUserMessage || ""),
      queryIR,
      hintDiagnostics: this._summarizeHintDiagnostics(queryIR),
    });
    const readIntent =
      queryIR?.intent?.name &&
      ["LIST", "READ", "SUMMARIZE", "EXPLAIN"].includes(String(queryIR?.intent?.family || ""))
        ? {
            intent: queryIR.intent.name,
            filters: queryIR.filters || {},
            entityHints: Array.isArray(queryIR.entityHints) ? queryIR.entityHints : [],
            aggregateSummary:
              queryIR?.intent?.family === "SUMMARIZE" && queryIR?.target === "collection",
          }
        : null;
    const readIntentPolicy = getIntentExecutionPolicy(readIntent?.intent || queryIR?.intent?.name || "");
    const globalSafeIntent = isGlobalSafeIntent(readIntent?.intent || queryIR?.intent?.name || "");
    this._traceExecutionStep(requestContext, "intent_policy_evaluated", {
      intent: readIntent?.intent || queryIR?.intent?.name || null,
      intentPolicy: {
        scopeRequired: Boolean(readIntentPolicy.scopeRequired),
        globalSafe: Boolean(readIntentPolicy.globalSafe),
        preferredExecutionPath: readIntentPolicy.preferredExecutionPath || null,
        reasonCode: readIntentPolicy.reasonCode || null,
      },
      globalSafeIntent,
    });
    if (globalSafeIntent) {
      const deterministicReadResult = await this._tryRunDeterministicReadList({
        userMessage: effectiveUserMessage,
        queryIR,
        readIntent,
        requestContext,
        executionContext,
        llmHistory,
        policy,
        posture,
        state,
      });
      if (deterministicReadResult) {
        this._traceExecutionStep(requestContext, "routing_execution_path", {
          executionPath: "deterministic_direct",
          intent: readIntent?.intent || null,
          hintDiagnostics: this._summarizeHintDiagnostics(queryIR),
          intentPolicy: {
            scopeRequired: readIntentPolicy.scopeRequired,
            globalSafe: readIntentPolicy.globalSafe,
            reasonCode: readIntentPolicy.reasonCode || null,
          },
        });
        return deterministicReadResult;
      }
    }

    const shouldSkipAmbiguityForUnscopedDraft =
      Boolean(draftIntent?.intent) &&
      (!Array.isArray(draftIntent?.entityHints) || draftIntent.entityHints.length === 0) &&
      !this._resolveActiveEntityScope(requestContext, llmHistory);
    const ambiguityResolution = shouldSkipAmbiguityForUnscopedDraft
      ? { status: "skipped" }
      : await resolveChatAmbiguity({
          engine: this.engine,
          message: effectiveUserMessage,
          queryIR,
          policy,
          executionContext,
          exposedTools: [],
        });
    const futureCreateHint =
      ambiguityResolution?.reason === "future_intent_create_candidate" &&
      ambiguityResolution?.mutationHint
        ? ambiguityResolution.mutationHint
        : null;
    this._traceExecutionStep(requestContext, "entity_resolution_completed", {
      status: ambiguityResolution?.status || "skipped",
      entityType: ambiguityResolution?.resolutionMeta?.entityType || null,
      chosenId: ambiguityResolution?.resolutionMeta?.chosenId || null,
      reason: ambiguityResolution?.reason || null,
      mutationHintEntityType: futureCreateHint?.entityType || null,
      mutationHintOperation: futureCreateHint?.operation || null,
      hintDiagnostics: this._summarizeHintDiagnostics(queryIR),
      intentPolicy: {
        scopeRequired: readIntentPolicy.scopeRequired,
        globalSafe: readIntentPolicy.globalSafe,
        reasonCode: readIntentPolicy.reasonCode || null,
      },
      executionPath: "ambiguity",
    });
    if (ambiguityResolution?.status === "resolved" && ambiguityResolution?.resolvedScope) {
      Object.assign(requestContext, ambiguityResolution.resolvedScope);
      Object.assign(executionContext, ambiguityResolution.resolvedScope);
      const resolvedFromAmbiguity = this._deriveResolvedEntityFromAmbiguity(ambiguityResolution);
      if (resolvedFromAmbiguity) {
        this._pinEntityScopeBeforeContract({
          requestContext,
          executionContext,
          resolvedEntity: resolvedFromAmbiguity,
          source: "resolved",
        });
        this._traceExecutionStep(requestContext, "scope_pinned_pre_llm", {
          source: "resolved",
          entityType: resolvedFromAmbiguity.entityType,
          entityId: resolvedFromAmbiguity.entityId,
        });
      }
    }
    if (
      ["ambiguous", "missing", "not_found"].includes(String(ambiguityResolution?.status || "")) &&
      ambiguityResolution?.suggestionArtifact
    ) {
      const pendingClarification = {
        entityType: ambiguityResolution?.resolutionMeta?.entityType || null,
        resumeState: state,
        artifact: ambiguityResolution.suggestionArtifact,
        resolutionMeta: ambiguityResolution.resolutionMeta || null,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
        turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
      };
      updateChatOrchestratorState(this.engine, requestContext, {
        activeState: CHAT_STATES.CLARIFY,
        pendingClarification,
      });
      const finalMessage =
        String(ambiguityResolution.suggestionArtifact.message || "").trim() ||
        "I need one more detail to continue.";
      this.helper._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture,
        toolExecutions: [],
        artifactType: "context_suggestion",
        artifact: ambiguityResolution.suggestionArtifact,
      });
      return withStateOutput(
        {
          message: finalMessage,
          ambiguityArtifact: ambiguityResolution.suggestionArtifact,
          outputArtifact: ambiguityResolution.suggestionArtifact,
          resolutionMeta: ambiguityResolution.resolutionMeta || null,
        },
        CHAT_STATES.FINAL,
      );
    }

    const documentFallback = this.helper._buildDocumentContextFallback({
      requestContext,
      userMessage: effectiveUserMessage,
      policyVersion: policy.version,
      posture,
    });
    if (documentFallback) {
      this.helper._recordTranscript({
        requestContext,
        userMessage: effectiveUserMessage,
        finalMessage: documentFallback.message,
        posture,
        toolExecutions: [],
      });
      return withStateOutput(
        {
          message: documentFallback.message,
          outputArtifact: {
            type: "chat",
            message: documentFallback.message,
          },
        },
        CHAT_STATES.FINAL,
      );
    }

    const deterministicReadResult = await this._tryRunDeterministicReadList({
      userMessage: effectiveUserMessage,
      queryIR,
      readIntent,
      requestContext,
      executionContext,
      llmHistory,
      policy,
      posture,
      state,
    });
    if (deterministicReadResult) {
      this._traceExecutionStep(requestContext, "routing_execution_path", {
        executionPath: "deterministic_graph",
        intent: readIntent?.intent || null,
        hintDiagnostics: this._summarizeHintDiagnostics(queryIR),
        intentPolicy: {
          scopeRequired: readIntentPolicy.scopeRequired,
          globalSafe: readIntentPolicy.globalSafe,
          reasonCode: readIntentPolicy.reasonCode || null,
        },
      });
      return deterministicReadResult;
    }

    const stateForTools = state === CHAT_STATES.RETRIEVE ? CHAT_STATES.RETRIEVE : CHAT_STATES.PLAN_DRAFT;
    const allExposedTools = this._buildExposedToolsForState(stateForTools, policy, executionContext);
    const exposedTools = this.helper._selectToolsForMessage(effectiveUserMessage, allExposedTools);
    const messages = this.helper._buildModelMessages({
      userMessage: effectiveUserMessage,
      llmHistory,
      posture,
      requestContext,
      exposedTools,
      draftIntent,
      queryIR,
    });
    if (futureCreateHint) {
      messages.push({
        role: "system",
        content:
          `Routing hint: treat this as a create request for entity type "${futureCreateHint.entityType}". ` +
          "No scoped records were found for this type and the user phrasing is future-intent. " +
          "Prefer a mutation output contract with CREATE_ENTITY instead of read-resolution clarification.",
      });
    }

    const loopResult = await runChatToolLoop({
      helperService: this.helper,
      messages,
      exposedTools,
      policy,
      executionContext,
      signal,
    });
    this._traceExecutionStep(requestContext, "routing_execution_path", {
      executionPath: "llm_loop",
      intent: readIntent?.intent || null,
      hintDiagnostics: this._summarizeHintDiagnostics(queryIR),
      intentPolicy: {
        scopeRequired: readIntentPolicy.scopeRequired,
        globalSafe: readIntentPolicy.globalSafe,
        reasonCode: readIntentPolicy.reasonCode || null,
      },
    });
    this._traceExecutionStep(requestContext, "output_contract_generation_completed", {
      rounds: loopResult?.rounds || 0,
      toolCalls: Array.isArray(loopResult?.toolExecutions) ? loopResult.toolExecutions.length : 0,
    });
    const resolvedFromTools = inferLastResolvedFromToolExecutions(loopResult?.toolExecutions || []);
    if (resolvedFromTools) {
      updateChatOrchestratorState(this.engine, requestContext, {
        lastResolvedEntity: resolvedFromTools,
      });
      this._traceExecutionStep(requestContext, "scoped_entity_context_updated_from_tools", {
        entityType: resolvedFromTools.type,
        entityId: resolvedFromTools.id,
      });
    }
    const parsedContract = parseFinalOutputContract(loopResult.finalMessage);
    if (!parsedContract.ok) {
      return this._buildOutputContractInvalidResult({
        parseError: parsedContract.error,
        loopResult,
        requestContext,
        userMessage: effectiveUserMessage,
        posture,
      });
    }
    const contract = parsedContract.contract;
    const scopedForDraftRouting = this._resolveActiveEntityScope(requestContext, llmHistory);
    const routedOutputType =
      contract.outputType === "message" && draftIntent?.intent && scopedForDraftRouting
        ? "document"
        : contract.outputType;
    if (routedOutputType !== contract.outputType) {
      this._traceExecutionStep(requestContext, "output_type_adjusted", {
        from: contract.outputType,
        to: routedOutputType,
        reason: "draft_intent_with_scoped_context",
      });
    }
    this._traceExecutionStep(requestContext, "output_contract_parsed", {
      outputType: routedOutputType,
    });
    this.engine?.ledger?.record?.({
      type: "chat_output_contract_parsed",
      sourceRoute: "/agent/chat",
      outputType: routedOutputType,
      hasTitle: typeof contract.title === "string" && contract.title.trim().length > 0,
      contentLength: contract.content.length,
      metadataKeys: Object.keys(contract.metadata || {}),
      timestamp: new Date().toISOString(),
    });

    let finalMessage = contract.content;
    let outputArtifact = null;
    let mutationOutcome = null;
    let nextState = CHAT_STATES.FINAL;
    let routeAction = "message";

    if (routedOutputType === "message" || routedOutputType === "research") {
      finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
        finalMessage: contract.content,
        requestContext,
      });
      finalMessage = this.helper._normalizeResponseMarkdown({
        content: finalMessage,
        outputType: routedOutputType === "research" ? "research" : "message",
      });
      routeAction = routedOutputType === "research" ? "research_message" : "message";
      if (routedOutputType === "research" && contract.metadata && Object.keys(contract.metadata).length > 0) {
        outputArtifact = {
          type: "research_contract",
          title: contract.title || null,
          content: contract.content,
          metadata: contract.metadata,
        };
      }
    } else if (routedOutputType === "document") {
      routeAction = "document_tool";
      let activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
      const routeAuthorization = this._authorizeDocumentArtifact({
        requestContext,
        userMessage: effectiveUserMessage,
        draftIntent,
        activeScope,
        stage: "document_route_gate",
        requireScope: false,
      });
      if (!routeAuthorization.allowed) {
        routeAction = "document_downgraded_to_message";
        outputArtifact = null;
        finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
          finalMessage: this._buildDocumentAuthorizationDowngradeMessage({
            contract,
            reasonCodes: routeAuthorization.reasonCodes,
          }),
          requestContext,
        });
        nextState = CHAT_STATES.FINAL;
      } else {
      const scopedDiscovery = await this._discoverArtifactScopeFromClient({
        userMessage: effectiveUserMessage,
        requestContext,
        executionContext,
        policy,
        llmHistory,
      });
      this._traceExecutionStep(requestContext, "artifact_scope_discovery_completed", {
        status: scopedDiscovery?.status || "skipped",
        reason: scopedDiscovery?.reason || null,
        entityType: scopedDiscovery?.resolvedEntity?.entityType || null,
        entityId: scopedDiscovery?.resolvedEntity?.entityId || null,
      });
      if (scopedDiscovery?.status === "resolved" && scopedDiscovery.resolvedEntity) {
        activeScope = {
          entityType: scopedDiscovery.resolvedEntity.entityType,
          entityId: scopedDiscovery.resolvedEntity.entityId,
        };
      }
      const artifactAuthorization = this._authorizeDocumentArtifact({
        requestContext,
        userMessage: effectiveUserMessage,
        draftIntent,
        activeScope,
        stage: "document_artifact_emit",
      });
      if (!artifactAuthorization.allowed) {
        routeAction = "document_downgraded_to_message";
        outputArtifact = null;
        finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
          finalMessage: this._buildDocumentAuthorizationDowngradeMessage({
            contract,
            reasonCodes: artifactAuthorization.reasonCodes,
          }),
          requestContext,
        });
        nextState = CHAT_STATES.FINAL;
      } else {
      if (
        scopedDiscovery?.status === "clarify" &&
        scopedDiscovery?.suggestionArtifact
      ) {
        const pendingClarification = {
          entityType: scopedDiscovery?.suggestionArtifact?.entityType || null,
          resumeState: state,
          artifact: scopedDiscovery.suggestionArtifact,
          resolutionMeta: {
            status: "ambiguous",
            entityType: scopedDiscovery?.suggestionArtifact?.entityType || null,
            candidatesCount: Array.isArray(scopedDiscovery?.suggestionArtifact?.suggestions)
              ? scopedDiscovery.suggestionArtifact.suggestions.length
              : 0,
            autoPicked: false,
            chosenId: null,
          },
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
          turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
        };
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.CLARIFY,
          pendingClarification,
        });
        const finalClarifyMessage =
          String(scopedDiscovery.suggestionArtifact.message || "").trim() ||
          "I need one more detail to continue.";
        this.helper._recordTranscript({
          requestContext,
          userMessage,
          finalMessage: finalClarifyMessage,
          posture,
          toolExecutions: loopResult.toolExecutions,
          artifactType: "context_suggestion",
          artifact: scopedDiscovery.suggestionArtifact,
        });
        return withStateOutput(
          {
            message: finalClarifyMessage,
            toolExecutions: loopResult.toolExecutions,
            stepCommentaries: loopResult.stepCommentaries,
            rounds: loopResult.rounds,
            ambiguityArtifact: scopedDiscovery.suggestionArtifact,
            outputArtifact: scopedDiscovery.suggestionArtifact,
            resolutionMeta: pendingClarification.resolutionMeta,
          },
          CHAT_STATES.FINAL,
        );
      }
      const documentContext = await buildDocumentContext({
        activeScope,
        readTool: async (toolName, params) => {
          if (!this.engine || typeof this.engine._callReadTool !== "function") return null;
          return this.engine._callReadTool(toolName, params, policy);
        },
      });
      const documentSafeContext = buildDocumentSafeContext(documentContext);
      this._traceExecutionStep(requestContext, "document_tool_called", {
        toolName: "planGeneratedDocument",
        hasActiveScope: Boolean(activeScope),
        hasClientDbId: Number(documentContext?.internal?.clientDbId || 0) > 0,
      });
      const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
      const docToolResult = await this.engine.executeToolV2(
        "planGeneratedDocument",
        {
          ...(contract.title ? { title: contract.title } : {}),
          content: contract.content,
          metadata: {
            ...(contract.metadata || {}),
            structuredContext: documentSafeContext,
          },
        },
        executionPolicy,
        {
          ...executionContext,
          confirmed: true,
          sourceRoute: "/agent/chat",
        },
      );
      const draftArtifactBase = docToolResult?.result && typeof docToolResult.result === "object"
        ? { ...docToolResult.result }
        : {
            type: "document_draft",
            title: contract.title || "Document Draft",
            content: contract.content,
            metadata: contract.metadata || {},
            entityType: null,
            entityId: null,
          };
      const groundedContract = {
        title:
          (typeof draftArtifactBase.title === "string" && draftArtifactBase.title.trim()) ||
          contract.title,
        content:
          (typeof draftArtifactBase.content === "string" && draftArtifactBase.content.trim()) ||
          contract.content,
        metadata: {
          ...(contract.metadata || {}),
          ...(draftArtifactBase?.metadata && typeof draftArtifactBase.metadata === "object"
            ? draftArtifactBase.metadata
            : {}),
        },
      };
      const previewArtifact = this._createPreviewArtifactFromDocumentContract({
        contract: groundedContract,
        activeScope,
        requestContext,
        executionContext,
        structuredContext: documentSafeContext,
      });
      if (previewArtifact?.type === "context_suggestion") {
        outputArtifact = previewArtifact;
        finalMessage =
          String(previewArtifact.message || "").trim() ||
          "I need the target record before I can prepare this stored document preview.";
        nextState = CHAT_STATES.CLARIFY;
        const pendingClarification = {
          entityType: "dossier",
          resumeState: state,
          artifact: previewArtifact,
          resolutionMeta: {
            status: "missing",
            entityType: "dossier",
            candidatesCount: 0,
            autoPicked: false,
            chosenId: null,
          },
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
          turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
        };
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.CLARIFY,
          pendingClarification,
        });
        this._traceExecutionStep(requestContext, "artifact_preview_scope_missing", {
          outputType: "document",
          artifactType: previewArtifact.type || null,
          previewSource: "storage_scope_guard",
        });
      } else if (previewArtifact) {
        outputArtifact = previewArtifact;
        finalMessage =
          "I prepared a document preview. You can edit it and confirm to create a proposal for storing it in the selected record.";
        this._traceExecutionStep(requestContext, "artifact_preview_pipeline_triggered", {
          outputType: "document",
          artifactType: previewArtifact.type || null,
          entityType: previewArtifact?.targetEntity?.type || activeScope?.entityType || null,
          entityId: previewArtifact?.targetEntity?.id || activeScope?.entityId || null,
          previewSource: "planGeneratedDocument_grounded",
        });
      }
      if (!outputArtifact) {
        outputArtifact = {
          ...draftArtifactBase,
          ...(activeScope ? activeScope : {}),
        };
        finalMessage = groundedContract.content;
        this._traceExecutionStep(requestContext, "artifact_preview_pipeline_triggered", {
          outputType: "document",
          artifactType: outputArtifact?.type || null,
          entityType: outputArtifact?.entityType || null,
          entityId: outputArtifact?.entityId || null,
          previewSource: "planGeneratedDocument",
        });
      }
      }
      }
    } else if (routedOutputType === "mutation") {
      routeAction = "mutation_proposal";
      let proposal = null;
      try {
        proposal = await this._buildMutationProposalFromOutputContract({
          contract,
          policy,
          executionContext: {
            ...executionContext,
            userMessage: effectiveUserMessage,
          },
          requestContext,
        });
      } catch (error) {
        const errorArtifact = {
          type: "error",
          code: String(error?.code || "MUTATION_ROUTING_FAILED"),
          message: String(error?.message || "Mutation routing failed."),
        };
        finalMessage = "I could not prepare the requested change because the mutation contract was invalid.";
        outputArtifact = errorArtifact;
        this.engine?.ledger?.record?.({
          type: "chat_output_contract_routed",
          sourceRoute: "/agent/chat",
          outputType: routedOutputType,
          routeAction: "mutation_error",
          proposalCreated: false,
          timestamp: new Date().toISOString(),
        });
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: loopResult.toolExecutions,
          artifactType: "error",
          artifact: errorArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            toolExecutions: loopResult.toolExecutions,
            stepCommentaries: loopResult.stepCommentaries,
            rounds: loopResult.rounds,
            outputArtifact: errorArtifact,
            resolutionMeta: { outputContract: contract },
          },
          CHAT_STATES.FINAL,
        );
      }

      if (proposal?.type === "entity_creation_form") {
        finalMessage = "I need a few required identity fields before preparing this mutation.";
        outputArtifact = proposal;
      } else if (proposal?.proposalId && proposal.requiresConfirmation === true) {
        const pendingProposal = {
          proposalId: proposal.proposalId,
          summary: proposal.humanReadableSummary || null,
          riskLevel: proposal?.confirmation?.extraRiskAck === true ? "high" : "normal",
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          artifact: toProposalArtifact(proposal, executionContext.sessionId),
        };
        nextState = CHAT_STATES.EXECUTE;
        mutationOutcome = {
          status: "PROPOSED",
          proposalId: proposal.proposalId,
          proposalArtifact: pendingProposal.artifact,
        };
        finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
          finalMessage: contract.content,
          requestContext,
        });
        outputArtifact = pendingProposal.artifact;
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.EXECUTE,
          pendingProposal,
        });
      }
    } else {
      finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
        finalMessage: contract.content,
        requestContext,
      });
    }
    finalMessage = this.helper._normalizeResponseMarkdown({
      content: finalMessage,
      outputType: routedOutputType,
    });
    finalMessage = this._sanitizeUserFacingIdRequest(finalMessage);

    const structuredDraft = this._buildStructuredDraftFromContract({
      contract,
      routedOutputType,
      requestContext,
      llmHistory,
    });
    if (structuredDraft) {
      const draftEntityType =
        this._deriveEntityTypeFromStructuredDraft(structuredDraft) || structuredDraft.entityType || null;
      updateChatOrchestratorState(this.engine, requestContext, {
        structuredDraft,
        lastStructuredDraft: structuredDraft,
        lastDraftCapability: "structured_draft",
        lastDraftEntityType: draftEntityType,
      });
      this._traceExecutionStep(requestContext, "structured_draft_retained", {
        draftType: structuredDraft.type,
        entityType: draftEntityType,
        itemCount: Array.isArray(structuredDraft.items) ? structuredDraft.items.length : 0,
        linkedScope: structuredDraft.linkedScope || null,
      });
      this._traceExecutionStep(requestContext, "structured_draft_detected", {
        source: "retained_from_contract",
        draftType: structuredDraft.type,
        draftEntityType: draftEntityType,
        itemCount: Array.isArray(structuredDraft.items) ? structuredDraft.items.length : 0,
      });
    }

    if (nextState !== CHAT_STATES.EXECUTE) {
      updateChatOrchestratorState(this.engine, requestContext, {
        activeState: stateForTools,
      });
    }
    this.engine?.ledger?.record?.({
      type: "chat_output_contract_routed",
      sourceRoute: "/agent/chat",
      outputType: routedOutputType,
      routeAction,
      proposalCreated: mutationOutcome?.status === "PROPOSED",
      timestamp: new Date().toISOString(),
    });

    this.helper._recordTranscript({
      requestContext,
      userMessage: effectiveUserMessage,
      finalMessage,
      posture,
      toolExecutions: loopResult.toolExecutions,
      artifactType:
        outputArtifact && String(outputArtifact.type || "").toLowerCase() === "proposal"
          ? "proposal"
          : outputArtifact && typeof outputArtifact === "object" && outputArtifact.type
            ? String(outputArtifact.type)
            : "chat",
      artifact: outputArtifact,
    });

    try {
      console.log(
        "[ChatOrchestrator][ArtifactOut]",
        JSON.stringify({
          state: nextState,
          outputType: routedOutputType,
          artifactType:
            outputArtifact && typeof outputArtifact === "object"
              ? outputArtifact.type || "object_without_type"
              : null,
          proposalId:
            outputArtifact?.proposalId ||
            outputArtifact?.proposals?.[0]?.proposalId ||
            mutationOutcome?.proposalId ||
            null,
          entityType: outputArtifact?.entityType || outputArtifact?.target?.type || null,
          entityId: outputArtifact?.entityId || outputArtifact?.target?.id || null,
          toolCalls: Array.isArray(loopResult.toolExecutions) ? loopResult.toolExecutions.length : 0,
        }),
      );
    } catch (_) {
      // Debug logging only
    }

    return withStateOutput(
      {
        message: finalMessage,
        toolExecutions: loopResult.toolExecutions,
        stepCommentaries: loopResult.stepCommentaries,
        rounds: loopResult.rounds,
        outputArtifact,
        mutationOutcome,
        availableTools: exposedTools.map((tool) => ({
          name: tool.name,
          category: tool.category,
        })),
        resolutionMeta: {
          outputContract: contract,
          routedOutputType,
        },
      },
      nextState,
    );
  }
}

module.exports = {
  ChatOrchestrator,
  CHAT_STATES,
};
