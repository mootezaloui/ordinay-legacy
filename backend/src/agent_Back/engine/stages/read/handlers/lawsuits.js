"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const { resolveEntityDisplayLabel } = require("../../../../utils/entityDisplay");

async function handleListLawsuits(state) {
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
    let dossierId = scope === "dossier" ? context?.dossierId : null;
    if (!dossierId) {
      const hintDossierId = getHintValue("id", "dossier");
      if (hintDossierId) dossierId = hintDossierId;
    }
    if (!dossierId) {
      const hintRef = getHintValue("reference", "dossier");
      const hintName = getHintValue("name", "dossier");
      if (hintRef || hintName) {
        const resolution = await this._resolveEntity(
          {
            type: "dossier",
            reference: hintRef || undefined,
            nameHint: hintName || undefined,
          },
          policy,
        );
        if (resolution.resolved) {
          dossierId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Lawsuits";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Dossier"}`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Lawsuits";
          summary = resolution.message;
          details.push("Try listing dossiers to see available records.");
          break;
        }
      }
    }
    if (
      !dossierId &&
      (getHintValue("id", "client") || getHintValue("name", "client"))
    ) {
      title = "Read data — Lawsuits";
      summary = "Cases are linked to dossiers.";
      details.push("Specify a dossier to list related cases.");
      break;
    }
    const { lawsuits } = await this._callReadTool(
      "listLawsuits",
      {
        limit: 50,
        dossierId,
        status: filters?.status || null,
        query: filters?.query || null,
      },
      policy,
    );
    data = lawsuits;
    title = "Read data — Lawsuits";
    summary =
      lawsuits.length > 0
        ? `Found ${lawsuits.length} lawsuit(s)`
        : "No lawsuits found";
    lawsuits.forEach((l) => {
      const ref = l.reference || l.lawsuit_number || "Lawsuit";
      details.push(
        `${ref} — ${l.title || "Untitled"} (${l.status || "in_progress"})`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listLawsuits",
      note: "Lawsuit list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadLawsuit(state) {
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
    const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    title = "Read data — Lawsuit";

    const appendParentLabel = async (lawsuit) => {
      if (lawsuit.dossier_id) {
        const dossierResult = await safeReadSummaryTool("getDossier", {
          dossierId: lawsuit.dossier_id,
        });
        const dossierLabel = dossierResult?.dossier
          ? resolveEntityDisplayLabel("dossier", dossierResult.dossier, {
              fallback: "Dossier",
            })
          : "Dossier";
        details.push(`Dossier: ${dossierLabel}`);
      } else {
        details.push("Dossier: N/A");
      }
    };

    const resolveFromList = async (query) => {
      const result = await this._callReadTool(
        "listLawsuits",
        { query, limit: 10 },
        policy,
      );
      return result?.lawsuits || [];
    };

    if (hintId) {
      const result = await this._callReadTool(
        "getLawsuit",
        { lawsuitId: hintId },
        policy,
      );
      const lawsuit = result?.lawsuit;
      if (!lawsuit) {
        summary = "No lawsuit found for that identifier.";
        details.push("Try listing lawsuits to see available records.");
        break;
      }
      summary = `Lawsuit: ${resolveEntityDisplayLabel("lawsuit", lawsuit, { fallback: "Lawsuit" })}`;
      details.push(`Title: ${lawsuit.title || "Untitled"}`);
      details.push(`Status: ${lawsuit.status || "in_progress"}`);
      if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
      const adversary =
        lawsuit.adversary_party ||
        lawsuit.adversary_name ||
        lawsuit.adversary;
      if (adversary) details.push(`Adversary: ${adversary}`);
      details.push(`Next hearing: ${lawsuit.next_hearing ? formatDate(lawsuit.next_hearing) : "N/A"}`);
      await appendParentLabel(lawsuit);
      sources.push({
        sourceType: "system",
        reference: "tool:getLawsuit",
        note: "Lawsuit lookup",
      });
      data = lawsuit;
      await appendDocumentDetails("lawsuit", lawsuit);
      break;
    }

    if (hintRef || hintName) {
      const query = hintRef || hintName;
      const lawsuits = await resolveFromList(query);
      if (lawsuits.length === 0) {
        summary = `No lawsuit found for "${query}"`;
        details.push("Try listing all lawsuits with: show me my lawsuits");
      } else if (lawsuits.length === 1) {
        const lawsuit = lawsuits[0];
        summary = `Lawsuit: ${resolveEntityDisplayLabel("lawsuit", lawsuit, { fallback: "Lawsuit" })}`;
        details.push(`Title: ${lawsuit.title || "Untitled"}`);
        details.push(`Status: ${lawsuit.status || "in_progress"}`);
        if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
        const adversary =
          lawsuit.adversary_party ||
          lawsuit.adversary_name ||
          lawsuit.adversary;
        if (adversary) details.push(`Adversary: ${adversary}`);
        details.push(`Next hearing: ${lawsuit.next_hearing ? formatDate(lawsuit.next_hearing) : "N/A"}`);
        await appendParentLabel(lawsuit);
        sources.push({
          sourceType: "system",
          reference: "tool:listLawsuits",
          note: "Lawsuit lookup",
        });
        data = lawsuit;
        await appendDocumentDetails("lawsuit", lawsuit);
      } else {
        summary = `Multiple lawsuits match "${query}"`;
        lawsuits.forEach((l) => {
          details.push(
            `${l.reference || l.lawsuit_number || "Lawsuit"} — ${l.title || "Untitled"}`,
          );
        });
        details.push("Please specify which lawsuit you mean.");
      }
      break;
    }

    summary = "Which lawsuit?";
    details.push("Provide a lawsuit reference or name.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainLawsuit(state) {
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
    const scope = String(context?.scope || "").toLowerCase();
    const scopedId = scope === "lawsuit" ? context?.lawsuitId : null;
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_LAWSUIT && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("lawsuit");
      if (applyAggregateResult(aggregateResult)) break;
    }

    let lawsuit = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getLawsuit",
        { lawsuitId: targetId },
        policy,
      );
      lawsuit = result?.lawsuit || null;
    } else if (hintRef || hintName) {
      const query = hintRef || hintName;
      const result = await this._callReadTool(
        "listLawsuits",
        { query, limit: 5 },
        policy,
      );
      const lawsuits = result?.lawsuits || [];
      if (lawsuits.length === 1) lawsuit = lawsuits[0];
      else if (lawsuits.length > 1) {
        summary = `Multiple lawsuits match "${query}"`;
        lawsuits.forEach((l) =>
          details.push(
            `${l.reference || l.lawsuit_number || "Lawsuit"} — ${l.title || "Untitled"}`,
          ),
        );
        details.push("Please specify which lawsuit you mean.");
        break;
      }
    }

    if (!lawsuit) {
      summary = "Which lawsuit?";
      details.push("Provide a lawsuit reference or name.");
      break;
    }

    const tasksResult = await this._callReadTool(
      "listTasks",
      { lawsuitId: lawsuit.id, limit: 200 },
      policy,
    );
    const tasks = tasksResult?.tasks || [];
    const sessionsResult = await this._callReadTool(
      "listSessions",
      { lawsuitId: lawsuit.id, limit: 200 },
      policy,
    );
    const sessions = sessionsResult?.sessions || [];
    const overdueTasks = tasks.filter(
      (task) =>
        task.due_date &&
        !["done", "cancelled"].includes(task.status) &&
        new Date(task.due_date) < now,
    );
    const hearingOverdue =
      lawsuit.next_hearing && new Date(lawsuit.next_hearing) < now;
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "lawsuit", entityId: lawsuit.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];

    if (intent === READ_INTENTS.EXPLAIN_LAWSUIT_STATE) {
      title = "Read data — Lawsuit state";
      summary = `${lawsuit.reference || lawsuit.lawsuit_number || "Lawsuit"} — ${lawsuit.title || "Untitled"}`;
      details.push(`Status: ${lawsuit.status || "in_progress"}`);
      if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
      const adversary =
        lawsuit.adversary_party ||
        lawsuit.adversary_name ||
        lawsuit.adversary;
      if (adversary) details.push(`Adversary: ${adversary}`);
      details.push(
        `Relationships: ${tasks.length} task(s), ${sessions.length} session(s)`,
      );
      details.push(
        hearingOverdue || overdueTasks.length > 0
          ? `Blocking: ${overdueTasks.length} overdue task(s)${hearingOverdue ? ", next hearing overdue" : ""}`
          : "Blocking: none detected",
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getLawsuit",
        note: "Lawsuit state",
      });
      data = lawsuit;
      await appendDocumentDetails("lawsuit", lawsuit);
      break;
    }

    title = "Read data — Lawsuit summary";
    summary = `${lawsuit.reference || lawsuit.lawsuit_number || "Lawsuit"} — ${lawsuit.title || "Untitled"}`;
    const recentActivity = historyEvents.map((event) => {
      const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
      return `${when} — ${event.action || "event"}`;
    });
    details.push(
      `Summary: status ${lawsuit.status || "in_progress"}, ${tasks.length} task(s), ${sessions.length} session(s)`,
    );
    if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
    const adversary =
      lawsuit.adversary_party ||
      lawsuit.adversary_name ||
      lawsuit.adversary;
    if (adversary) details.push(`Adversary: ${adversary}`);
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(
      `Key dates/risks: ${lawsuit.next_hearing ? `next hearing ${formatDate(lawsuit.next_hearing)}` : "no hearing scheduled"}${hearingOverdue ? " (overdue)" : ""}`,
    );
    sources.push({
      sourceType: "system",
      reference: "tool:getLawsuit",
      note: "Lawsuit summary",
    });
    data = lawsuit;
    await appendDocumentDetails("lawsuit", lawsuit);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListLawsuits,
  handleReadLawsuit,
  handleExplainLawsuit,
};
