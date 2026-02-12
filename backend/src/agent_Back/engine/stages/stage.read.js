"use strict";

const { READ_INTENTS } = require("../../intent.classifier");
const {
  ENTITY_LABELS,
  ENTITY_PLURALS,
  TASK_STATUSES,
  ACTIVE_CASE_STATUSES,
  INTENT_DOMAIN_MAP,
  READ_INTENT_BY_ENTITY,
} = require("./read/read.constants");
const {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
} = require("../../utils/entityDisplay");
const { buildReadHelpers } = require("./read/read.helpers");
const { buildFilterHelpers } = require("./read/read.filters");
const { buildSummaryHelpers } = require("./read/read.summary");
const { createDocumentAppender } = require("./read/read.documents");
const { dispatchReadIntent } = require("./read/handlers");
const {
  _resolveReadEntityType,
  _resolveReadEntityId,
  _inferReadOutcome,
  _buildReadMeta,
  _deriveContextPromotion,
  _buildReadInterpretationContext,
  _buildReadExplanation,
} = require("./read/read.meta");

function isWorkSnapshotRefreshRequest(message) {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;
  if (/\b(refresh|reload)\b/i.test(normalized)) return true;
  return /\bupdate\b\s+(?:the\s+)?(?:snapshot|work\s+snapshot|dossier\s+snapshot|dossier|work\s+mode)\b/i.test(
    normalized,
  );
}

async function _executeReadIntent(
  readIntent,
  message,
  context,
  policy,
  engineContext,
) {
  const {
    intent,
    entityHints = [],
    filters = {},
    aggregateSummary = false,
  } = readIntent;
  const turnDocumentContext =
    context?._turnDocumentContext ||
    engineContext?.documentContext ||
    null;
  const hasTurnDocumentContext = Boolean(
    turnDocumentContext &&
      Array.isArray(turnDocumentContext.documents) &&
      turnDocumentContext.documents.length > 0,
  );
  if (hasTurnDocumentContext) {
    context = {
      ...(context || {}),
      _turnDocumentContext: turnDocumentContext,
      _hasDocumentContext: true,
      hasDocuments: true,
      documentCount:
        Number(context?.documentCount || 0) ||
        Number(turnDocumentContext.documents.length || 0),
    };
  }
  const now = new Date();
  const scope = String(context?.scope || "").toLowerCase();
  const storedConversationContext =
    context && this.contextStore?.get ? this.contextStore.get(context) : null;
  const activeWorkSnapshot = storedConversationContext?.workSnapshot || null;
  const normalizedFilters =
    filters && typeof filters === "object" ? { ...filters } : {};
  const snapshotRefreshRequested =
    Boolean(normalizedFilters._snapshotRefresh) ||
    isWorkSnapshotRefreshRequest(message);
  if (Object.prototype.hasOwnProperty.call(normalizedFilters, "_snapshotRefresh")) {
    delete normalizedFilters._snapshotRefresh;
  }

  const aggregateFilters =
    normalizedFilters && typeof normalizedFilters === "object"
      ? normalizedFilters
      : {};
  const shouldAggregateSummary =
    aggregateSummary && String(intent || "").startsWith("SUMMARIZE_");

  const helpers = buildReadHelpers({
    engine: this,
    message,
    context,
    policy,
    entityHints,
    scope,
  });

  const filterHelpers = buildFilterHelpers({
    now,
    aggregateFilters,
    TASK_STATUSES,
    ACTIVE_CASE_STATUSES,
  });

  const summaryHelpers = buildSummaryHelpers({
    engine: this,
    policy,
    context,
    scope,
    now,
    getHintValue: helpers.getHintValue,
    aggregateFilters,
    ENTITY_LABELS,
    ENTITY_PLURALS,
    TASK_STATUSES,
    normalizeValue: filterHelpers.normalizeValue,
    formatCountMap: filterHelpers.formatCountMap,
    countBy: filterHelpers.countBy,
    applyAggregateFilters: filterHelpers.applyAggregateFilters,
    isFinancialOverdue: filterHelpers.isFinancialOverdue,
    isMissionOverdue: filterHelpers.isMissionOverdue,
    isSessionOverdue: filterHelpers.isSessionOverdue,
  });

  const details = [];
  const sources = [];
  const { appendDocumentDetails } = createDocumentAppender({
    engine: this,
    context,
    policy,
    message,
    details,
    sources,
  });

  const safeReadSummaryTool = async (toolName, params) => {
    try {
      return await this._callReadTool(toolName, params, policy);
    } catch (err) {
      return null;
    }
  };

  // DOMAIN ACCESS CHECK - Map READ intents to required domains
  const requiredDomain = INTENT_DOMAIN_MAP[intent];
  if (requiredDomain) {
    const domainCheck = this._checkDomainAccess(requiredDomain, context);
    if (!domainCheck.permitted) {
      this.ledger.record({
        type: "read_intent_domain_blocked",
        intent,
        domain: requiredDomain,
        timestamp: new Date().toISOString(),
      });
      // Return domain denied response
      return {
        intent: "ACCESS_DENIED",
        agentVersion: policy.version,
        reasoner: "domain-firewall",
        output: {
          type: "explanation",
          entityId: "domain_access_denied",
          entityType: "security",
          title: "Read data — Access denied",
          summary: domainCheck.message,
          details: [
            `This query requires access to ${requiredDomain} data.`,
            "",
            "To access this data:",
            "1. Open the Context panel (right sidebar)",
            `2. Enable access to \"${requiredDomain}\"`,
            "3. Try your request again",
          ],
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [
            {
              sourceType: "system",
              reference: "domain_firewall",
              note: "Data access permission check",
            },
          ],
          status: "blocked",
          source: "domain-firewall",
          requires_validation: false,
        },
        isAccessDenied: true,
      };
    }
  }

  const state = {
    engine: this,
    intent,
    message,
    context,
    policy,
    scope,
    entityHints: Array.isArray(entityHints) ? [...entityHints] : [],
    filters: normalizedFilters,
    aggregateFilters,
    shouldAggregateSummary,
    now,
    title: "Read data",
    data: null,
    summary: "",
    details,
    sources,
    relatedSummary: null,
    childSummary: null,
    ENTITY_LABELS,
    ENTITY_PLURALS,
    TASK_STATUSES,
    ACTIVE_CASE_STATUSES,
    ...helpers,
    ...filterHelpers,
    ...summaryHelpers,
    appendDocumentDetails,
    safeReadSummaryTool,
    workSnapshot: activeWorkSnapshot,
    snapshotRefreshRequested,
    workSnapshotEvent: null,
  };

  state.applyClientDossierSummary = (summaryData) =>
    summaryHelpers.applyClientDossierSummary(state, summaryData);
  state.applyDossierWorkSummary = (summaryData) =>
    summaryHelpers.applyDossierWorkSummary(state, summaryData);
  state.applyAggregateResult = (aggregateResult) =>
    summaryHelpers.applyAggregateResult(state, aggregateResult);
  state.setWorkSnapshotEvent = (event) => {
    state.workSnapshotEvent = event;
  };

  if (
    snapshotRefreshRequested &&
    state.workSnapshot &&
    state.workSnapshot.entityType === "dossier" &&
    state.intent === READ_INTENTS.LIST_DOSSIERS &&
    (!Array.isArray(state.entityHints) || state.entityHints.length === 0)
  ) {
    state.intent = READ_INTENTS.READ_DOSSIER;
    state.entityHints = [
      {
        type: "id",
        value: state.workSnapshot.entityId,
        entityType: "dossier",
      },
    ];
  }

  try {
    const normalizedMessage = String(message || "").toLowerCase();
    const singleEntityVerbPattern =
      /\b(show|open|view|read|display|see|get|lookup|find|inspect)\b/i;
    const aboutPattern =
      /\b(what\s+do\s+you\s+know\s+about|tell\s+me\s+about|info\s+on|information\s+on|details\s+on|about|regarding|concerning)\b/i;
    const hasSingleEntityVerb =
      singleEntityVerbPattern.test(normalizedMessage) ||
      aboutPattern.test(normalizedMessage);

    const formatCandidateDetail = (entityType, item) => {
      if (!item) return null;
      const label = resolveEntityDisplayLabel(entityType, item, {
        fallback: formatEntityTypeLabel(entityType),
      });
      if (entityType === "client") {
        return `${label} — ${item.status || "active"}${item.email ? ` • ${item.email}` : ""}`;
      }
      if (entityType === "dossier") {
        return `${label}`;
      }
      if (entityType === "task") {
        const due = item.due_date ? ` due ${helpers.formatDate(item.due_date)}` : "";
        return `${label} — ${item.status || "todo"}${due}`;
      }
      if (entityType === "session") {
        const when = item.scheduled_at
          ? helpers.formatDateTime(item.scheduled_at)
          : item.session_date
            ? helpers.formatDate(item.session_date)
            : null;
        return when ? `${label} — ${when}` : label;
      }
      return label;
    };

    const listIntent = String(intent || "").startsWith("LIST_");
    const entityTypeForIntent = this._resolveReadEntityType(intent);
    const readIntentByEntity = READ_INTENT_BY_ENTITY;
    let guardHandled = false;

    if (
      listIntent &&
      ["client", "dossier", "task", "session"].includes(entityTypeForIntent)
    ) {
      const queryText = helpers.getEntityQuery(entityTypeForIntent);
      const explicitList = helpers.isExplicitListRequest(
        message,
        entityTypeForIntent,
        queryText,
      );

      if (!explicitList && (hasSingleEntityVerb || queryText)) {
        if (!queryText) {
          state.title = `Read data — ${ENTITY_LABELS[entityTypeForIntent] || entityTypeForIntent}`;
          state.summary = `Which ${ENTITY_LABELS[entityTypeForIntent] || entityTypeForIntent}?`;
          state.details.push(
            `Provide a ${ENTITY_LABELS[entityTypeForIntent] || entityTypeForIntent} name or reference.`,
          );
          guardHandled = true;
        } else {
          const resolution = await helpers.resolveEntityQuery(
            entityTypeForIntent,
            queryText,
          );

          if (resolution.kind === "one" && resolution.id) {
            const redirectIntent = readIntentByEntity[entityTypeForIntent];
            if (redirectIntent) {
              return this._executeReadIntent(
                {
                  intent: redirectIntent,
                  requiresLocalData: true,
                  entityHints: [
                    { type: "id", value: resolution.id, entityType: entityTypeForIntent },
                  ],
                },
                message,
                context,
                policy,
                engineContext,
              );
            }
          }

          const label =
            ENTITY_LABELS[entityTypeForIntent] || entityTypeForIntent;
          if (resolution.kind === "many") {
            const candidates = resolution.candidates || [];
            const overflowNote = resolution.overflow
              ? "More matches exist; narrow the query to open the right record."
              : null;
            state.title = `Read data — ${label}`;
            state.summary = resolution.overflow
              ? `Multiple ${label}s match \"${queryText}\". Please narrow by reference or exact name.`
              : `Multiple ${label}s match \"${queryText}\".`;
            candidates.forEach((candidate) => {
              const detail = formatCandidateDetail(entityTypeForIntent, candidate);
              if (detail) state.details.push(detail);
            });
            if (overflowNote) state.details.push(overflowNote);
            state.data = candidates;
            state.sources.push({
              sourceType: "system",
              reference: `resolver:${entityTypeForIntent}`,
              note: "Entity resolution shortlist",
            });
            guardHandled = true;
          } else if (resolution.kind === "none") {
            state.title = `Read data — ${label}`;
            state.summary = `No ${label} found matching \"${queryText}\". Can you confirm spelling or provide a reference?`;
            state.details.push(
              `Provide a more specific ${label} identifier to continue.`,
            );
            state.sources.push({
              sourceType: "system",
              reference: `resolver:${entityTypeForIntent}`,
              note: "Entity resolution failed",
            });
            guardHandled = true;
          }
        }
      }
    }

    if (!guardHandled) {
      await dispatchReadIntent(state);
    }

    const entityType = this._resolveReadEntityType(state.intent);
    const readOutcome = this._inferReadOutcome({
      data: state.data,
      summary: state.summary,
      details: state.details,
      entityType,
    });
    const readMeta = this._buildReadMeta(entityType, state.data);
    const contextPromotion = this._deriveContextPromotion(
      readMeta,
      readOutcome,
      context,
    );
    const effectiveWorkSnapshot =
      state.workSnapshotEvent?.snapshot || state.workSnapshot || null;
    const baseInterpretationContext = {
      ...(context || {}),
      ...(state.childSummary ? { childSummary: state.childSummary } : {}),
      ...(effectiveWorkSnapshot ? { workSnapshot: effectiveWorkSnapshot } : {}),
    };
    if (state.workSnapshotEvent?.action === "refresh") {
      baseInterpretationContext._workSnapshotRefreshed = true;
      baseInterpretationContext._workSnapshotRefreshReason =
        state.workSnapshotEvent.reason || "refresh";
    }
    const interpretationContext = this._buildReadInterpretationContext(
      baseInterpretationContext,
      {
        entityType,
        entityData: state.data,
        readOutcome,
        readSummary: state.summary,
        readDetails: state.details,
        readMeta,
        promotion: contextPromotion,
        aggregateSummary: shouldAggregateSummary,
        aggregateFilters: shouldAggregateSummary ? aggregateFilters : null,
      },
    );
    if (
      (state.intent === READ_INTENTS.WEB_SEARCH ||
        state.intent === READ_INTENTS.DEEP_SEARCH) &&
      typeof normalizedFilters?.query === "string" &&
      normalizedFilters.query.trim()
    ) {
      interpretationContext._searchQuery = normalizedFilters.query.trim();
    }
    const explanationOutput = this._buildReadExplanation({
      intent: state.intent,
      entityType,
      entityData: state.data,
      summary: state.summary,
      details: state.details,
      context: interpretationContext,
      sources: state.sources,
      readOutcome,
      relatedSummary: state.relatedSummary,
    });

    // Validate based on actual output type (clean contract)
    const contractType = explanationOutput.type === "context_suggestion" ? "context_suggestion" : "explanation";
    this._validateContract(contractType, explanationOutput, {
      intent: "READ_DATA",
    });

    // Run plan analysis for dossiers (automatic state analysis)
    let planAnalysis = null;
    if (entityType === 'dossier' && state.data?.id && readOutcome === 'success') {
      try {
        const analyzeEntityStateTool = this.toolRegistry.get('analyzeEntityState');
        if (analyzeEntityStateTool) {
          planAnalysis = await analyzeEntityStateTool.handler({
            entityType: 'dossier',
            entityId: state.data.id,
          });
        }
      } catch (err) {
        this.ledger.record({
          type: 'plan_analysis_error',
          entityType,
          entityId: state.data?.id,
          error: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      intent: "READ_DATA",
      agentVersion: policy.version,
      reasoner: "read-gate",
      output: explanationOutput,
      isReadIntent: true,
      readMeta,
      readOutcome,
      contextPromotion,
      workSnapshotEvent: state.workSnapshotEvent,
      planAnalysis,
    };
  } catch (err) {
    this.ledger.record({
      type: "read_intent_error",
      intent: state.intent || intent,
      error: err.message,
      timestamp: new Date().toISOString(),
    });

    const entityType = this._resolveReadEntityType(state.intent || intent);
    const readOutcome = "error";
    const readMeta = this._buildReadMeta(entityType, null);
    const contextPromotion = this._deriveContextPromotion(
      readMeta,
      readOutcome,
      context,
    );
    const effectiveWorkSnapshot =
      state.workSnapshotEvent?.snapshot || state.workSnapshot || null;
    const baseInterpretationContext = {
      ...(context || {}),
      ...(state.childSummary ? { childSummary: state.childSummary } : {}),
      ...(effectiveWorkSnapshot ? { workSnapshot: effectiveWorkSnapshot } : {}),
    };
    const interpretationContext = this._buildReadInterpretationContext(
      baseInterpretationContext,
      {
        entityType,
        entityData: null,
        readOutcome,
        readSummary: `Unable to retrieve data: ${err.message}`,
        readDetails: [
          "An error occurred while accessing the data.",
          "Please try again or rephrase your request.",
        ],
        readMeta,
        promotion: contextPromotion,
        aggregateSummary: shouldAggregateSummary,
        aggregateFilters: shouldAggregateSummary ? aggregateFilters : null,
      },
    );
    const explanationOutput = this._buildReadExplanation({
      intent: state.intent || intent,
      entityType,
      entityData: null,
      summary: `Unable to retrieve data: ${err.message}`,
      details: [
        "An error occurred while accessing the data.",
        "Please try again or rephrase your request.",
      ],
      context: interpretationContext,
      sources: [{ sourceType: "system", reference: "read-intent-gate" }],
      readOutcome,
      relatedSummary: null,
    });

    return {
      intent: "READ_DATA",
      agentVersion: policy.version,
      reasoner: "read-gate",
      output: explanationOutput,
      isReadIntent: true,
      readMeta,
      readOutcome,
      contextPromotion,
      workSnapshotEvent: state.workSnapshotEvent,
    };
  }
}

module.exports = {
  _executeReadIntent,
  _resolveReadEntityType,
  _resolveReadEntityId,
  _inferReadOutcome,
  _buildReadMeta,
  _deriveContextPromotion,
  _buildReadInterpretationContext,
  _buildReadExplanation,
};
