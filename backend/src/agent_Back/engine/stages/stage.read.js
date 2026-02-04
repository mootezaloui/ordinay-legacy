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
  const now = new Date();
  const scope = String(context?.scope || "").toLowerCase();

  const aggregateFilters =
    filters && typeof filters === "object" ? filters : {};
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
    entityHints,
    filters,
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
  };

  state.applyClientDossierSummary = (summaryData) =>
    summaryHelpers.applyClientDossierSummary(state, summaryData);
  state.applyDossierWorkSummary = (summaryData) =>
    summaryHelpers.applyDossierWorkSummary(state, summaryData);
  state.applyAggregateResult = (aggregateResult) =>
    summaryHelpers.applyAggregateResult(state, aggregateResult);

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
            : "date N/A";
        return `${label} — ${when}`;
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

    const entityType = this._resolveReadEntityType(intent);
    const readOutcome = this._inferReadOutcome({
      data: state.data,
      summary: state.summary,
      details: state.details,
    });
    const readMeta = this._buildReadMeta(entityType, state.data);
    const contextPromotion = this._deriveContextPromotion(
      readMeta,
      readOutcome,
      context,
    );
    const baseInterpretationContext = state.childSummary
      ? { ...(context || {}), childSummary: state.childSummary }
      : context;
    const interpretationContext = this._buildReadInterpretationContext(
      baseInterpretationContext,
      {
        entityType,
        entityData: state.data,
        readOutcome,
        readMeta,
        promotion: contextPromotion,
        aggregateSummary: shouldAggregateSummary,
        aggregateFilters: shouldAggregateSummary ? aggregateFilters : null,
      },
    );
    const explanationOutput = this._buildReadExplanation({
      intent,
      entityType,
      entityData: state.data,
      summary: state.summary,
      details: state.details,
      context: interpretationContext,
      sources: state.sources,
      readOutcome,
      relatedSummary: state.relatedSummary,
    });
    this._validateContract("explanation", explanationOutput, {
      intent: "READ_DATA",
    });

    return {
      intent: "READ_DATA",
      agentVersion: policy.version,
      reasoner: "read-gate",
      output: explanationOutput,
      isReadIntent: true,
      readMeta,
      contextPromotion,
    };
  } catch (err) {
    this.ledger.record({
      type: "read_intent_error",
      intent,
      error: err.message,
      timestamp: new Date().toISOString(),
    });

    const entityType = this._resolveReadEntityType(intent);
    const readOutcome = "error";
    const readMeta = this._buildReadMeta(entityType, null);
    const contextPromotion = this._deriveContextPromotion(
      readMeta,
      readOutcome,
      context,
    );
    const baseInterpretationContext = state.childSummary
      ? { ...(context || {}), childSummary: state.childSummary }
      : context;
    const interpretationContext = this._buildReadInterpretationContext(
      baseInterpretationContext,
      {
        entityType,
        entityData: null,
        readOutcome,
        readMeta,
        promotion: contextPromotion,
        aggregateSummary: shouldAggregateSummary,
        aggregateFilters: shouldAggregateSummary ? aggregateFilters : null,
      },
    );
    const explanationOutput = this._buildReadExplanation({
      intent,
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
      contextPromotion,
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
