"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");

async function handleListHistoryEvents(state) {
  const {
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
    details,
    sources,
    ENTITY_LABELS,
    ENTITY_PLURALS,
    TASK_STATUSES,
    ACTIVE_CASE_STATUSES,
    formatDate,
    formatDateTime,
    parsePayload,
    getHintValue,
    resolveEntityQuery,
    getEntityQuery,
    resolveScopedEntityId,
    buildAggregateSummary,
    applyAggregateResult,
    applyAggregateFilters,
    normalizeValue,
    countBy,
    formatCountMap,
    isFinancialOverdue,
    isMissionOverdue,
    isSessionOverdue,
    appendDocumentDetails,
    safeReadSummaryTool,
    applyClientDossierSummary,
    applyDossierWorkSummary,
  } = state;
  let { data, title, summary } = state;

  do {
    let entityType = filters?.entityType || null;
    let entityId = filters?.entityId || null;

    if (!entityType) {
      const scopeMap = {
        client: context?.clientId,
        dossier: context?.dossierId,
        lawsuit: context?.lawsuitId,
        session: context?.sessionId,
        task: context?.taskId,
        mission: context?.missionId,
        personal_task: context?.personalTaskId,
        financial_entry: context?.financialEntryId,
      };
      if (scope && scopeMap[scope]) {
        entityType = scope;
        entityId = scopeMap[scope];
      }
    }

    if (!entityType) {
      const hintTypes = [
        "client",
        "dossier",
        "lawsuit",
        "session",
        "task",
        "mission",
        "personal_task",
        "financial_entry",
      ];
      for (const hintType of hintTypes) {
        const hintId = getHintValue("id", hintType);
        const hintRef = getHintValue("reference", hintType);
        const hintName = getHintValue("name", hintType);
        if (hintId) {
          entityType = hintType;
          entityId = hintId;
          break;
        }
        if (hintRef || hintName) {
          const resolution = await this._resolveEntity(
            {
              type: hintType,
              reference: hintRef || undefined,
              nameHint: hintName || undefined,
            },
            policy,
          );
          if (resolution.resolved) {
            entityType = hintType;
            entityId = resolution.entity.id;
            break;
          } else if (resolution.reason === "ambiguous") {
            title = "Read data — History";
            summary = resolution.message;
            resolution.candidates?.forEach((c) =>
              details.push(`${c.name} (ID: ${c.id})`),
            );
            details.push("Please specify which record you mean.");
            break;
          } else if (resolution.reason === "not_found") {
            title = "Read data — History";
            summary = resolution.message;
            details.push("Try listing records to see available items.");
            break;
          }
        }
      }
      if (summary) break;
    }

    const { historyEvents } = await this._callReadTool(
      "listHistoryEvents",
      {
        limit: 50,
        entityType,
        entityId,
        query: filters?.query || null,
      },
      policy,
    );
    data = historyEvents;
    title = "Read data — History";
    summary =
      historyEvents.length > 0
        ? `Found ${historyEvents.length} history event(s)`
        : "No history events found";
    historyEvents.forEach((e) => {
      const when = e.created_at ? formatDateTime(e.created_at) : "unknown";
      details.push(
        `${when} — ${e.action || "event"}: ${e.description || "No description"}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listHistoryEvents",
      note: "History list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadHistoryEvent(state) {
  const {
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
    details,
    sources,
    ENTITY_LABELS,
    ENTITY_PLURALS,
    TASK_STATUSES,
    ACTIVE_CASE_STATUSES,
    formatDate,
    formatDateTime,
    parsePayload,
    getHintValue,
    resolveEntityQuery,
    getEntityQuery,
    resolveScopedEntityId,
    buildAggregateSummary,
    applyAggregateResult,
    applyAggregateFilters,
    normalizeValue,
    countBy,
    formatCountMap,
    isFinancialOverdue,
    isMissionOverdue,
    isSessionOverdue,
    appendDocumentDetails,
    safeReadSummaryTool,
    applyClientDossierSummary,
    applyDossierWorkSummary,
  } = state;
  let { data, title, summary } = state;

  do {
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    title = "Read data — History event";

    if (hintId) {
      const result = await this._callReadTool(
        "getHistoryEvent",
        { historyEventId: hintId },
        policy,
      );
      const event = result?.historyEvent;
      if (!event) {
        summary = `No history event found for ID ${hintId}`;
        details.push("Try listing history events to see available records.");
        break;
      }
      summary = `History event: ${event.action || "event"}`;
      details.push(`Entity: ${event.entity_type || "N/A"} ${event.entity_id || ""}`.trim());
      details.push(`Description: ${event.description || "N/A"}`);
      if (event.actor) details.push(`Actor: ${event.actor}`);
      if (event.changed_fields) {
        const fields = Object.keys(event.changed_fields || {});
        if (fields.length > 0)
          details.push(`Changed fields: ${fields.join(", ")}`);
      }
      details.push(`Created at: ${event.created_at ? formatDateTime(event.created_at) : "N/A"}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getHistoryEvent",
        note: "History event lookup",
      });
      data = event;
      break;
    }

    summary = "Which history event?";
    details.push("Provide a history event ID.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainHistory(state) {
  const {
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
    details,
    sources,
    ENTITY_LABELS,
    ENTITY_PLURALS,
    TASK_STATUSES,
    ACTIVE_CASE_STATUSES,
    formatDate,
    formatDateTime,
    parsePayload,
    getHintValue,
    resolveEntityQuery,
    getEntityQuery,
    resolveScopedEntityId,
    buildAggregateSummary,
    applyAggregateResult,
    applyAggregateFilters,
    normalizeValue,
    countBy,
    formatCountMap,
    isFinancialOverdue,
    isMissionOverdue,
    isSessionOverdue,
    appendDocumentDetails,
    safeReadSummaryTool,
    applyClientDossierSummary,
    applyDossierWorkSummary,
  } = state;
  let { data, title, summary } = state;

  do {
    const hintId =
      getHintValue("id", "history_event") || getHintValue("id");
    const hintName =
      getHintValue("name", "history_event") || getHintValue("name");

    if (intent === READ_INTENTS.SUMMARIZE_HISTORY && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("history_event");
      if (applyAggregateResult(aggregateResult)) break;
    }

    let event = null;
    if (hintId) {
      const result = await this._callReadTool(
        "getHistoryEvent",
        { historyEventId: hintId },
        policy,
      );
      event = result?.historyEvent || null;
    } else if (hintName) {
      const result = await this._callReadTool(
        "listHistoryEvents",
        { query: hintName, limit: 10 },
        policy,
      );
      const events = result?.historyEvents || [];
      if (events.length === 1) {
        event = events[0];
      } else if (events.length > 1) {
        title =
          intent === READ_INTENTS.EXPLAIN_HISTORY_STATE
            ? "Read data — History explanation"
            : "Read data — History summary";
        summary = `Multiple history events match "${hintName}"`;
        events.forEach((e) => {
          const when = e.created_at ? formatDateTime(e.created_at) : "unknown";
          details.push(`${when} — ${e.action || "event"} (ID: ${e.id})`);
        });
        details.push("Please specify which history event you mean.");
        break;
      }
    }

    if (event) {
      const changedFields = event.changed_fields
        ? Object.keys(event.changed_fields)
        : [];
      if (intent === READ_INTENTS.EXPLAIN_HISTORY_STATE) {
        title = "Read data — History explanation";
        summary = `History event: ${event.action || "event"}`;
        details.push(
          `Entity: ${event.entity_type || "N/A"} ${event.entity_id || ""}`.trim(),
        );
        details.push(`Created at: ${event.created_at ? formatDateTime(event.created_at) : "N/A"}`);
        if (event.actor) details.push(`Actor: ${event.actor}`);
        if (event.description) details.push(`Description: ${event.description}`);
        if (changedFields.length > 0) {
          details.push(`Changed fields: ${changedFields.join(", ")}`);
        }
        details.push("Explanation:");
        details.push(
          event.description
            ? `Reason: ${event.description}`
            : "Reason: no description recorded",
        );
        sources.push({
          sourceType: "system",
          reference: "tool:getHistoryEvent",
          note: "History explanation",
        });
        data = event;
        break;
      }

      title = "Read data — History summary";
      summary = `History event: ${event.action || "event"}`;
      details.push(
        `Entity: ${event.entity_type || "N/A"} ${event.entity_id || ""}`.trim(),
      );
      details.push(`Description: ${event.description || "N/A"}`);
      details.push(`Created at: ${event.created_at ? formatDateTime(event.created_at) : "N/A"}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getHistoryEvent",
        note: "History summary",
      });
      data = event;
      break;
    }

    if (intent === READ_INTENTS.SUMMARIZE_HISTORY) {
      // Fallback to recent history summary
      const result = await this._callReadTool(
        "listHistoryEvents",
        { limit: 10 },
        policy,
      );
      const events = result?.historyEvents || [];
      title = "Read data — History summary";
      summary =
        events.length > 0
          ? `Recent history (${events.length} event(s))`
          : "No history events found";
      events.forEach((e) => {
        const when = e.created_at ? formatDateTime(e.created_at) : "unknown";
        details.push(
          `${when} — ${e.action || "event"} (${e.entity_type || "entity"} ${e.entity_id || ""})`.trim(),
        );
      });
      sources.push({
        sourceType: "system",
        reference: "tool:listHistoryEvents",
        note: "History summary",
      });
      data = events;
      break;
    }

    summary = "Which history event?";
    details.push("Provide a history event ID.");
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListHistoryEvents,
  handleReadHistoryEvent,
  handleExplainHistory,
};
