"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");

async function handleListDossiers(state) {
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
    let clientId = scope === "client" ? context?.clientId : null;
    if (!clientId) {
      const hintClientId = getHintValue("id", "client");
      if (hintClientId) clientId = hintClientId;
    }
    if (!clientId) {
      const hintClientName = getHintValue("name", "client");
      if (hintClientName) {
        const resolution = await this._resolveEntity(
          { type: "client", nameHint: hintClientName },
          policy,
        );
        if (resolution.resolved) {
          clientId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Dossiers";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name} (ID: ${c.id})`),
          );
          details.push("Please specify which client you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Dossiers";
          summary = resolution.message;
          details.push("Try listing clients to see available records.");
          break;
        }
      }
    }
    const { dossiers } = await this._callReadTool(
      "listDossiers",
      {
        limit: 50,
        clientId,
        status: filters?.status || null,
        query: filters?.query || null,
      },
      policy,
    );
    data = dossiers;
    title = "Read data — Dossiers";
    summary =
      dossiers.length > 0
        ? `Found ${dossiers.length} dossier(s)`
        : "No dossiers found";
    dossiers.forEach((d) => {
      details.push(
        `${d.reference || "Dossier"} — ${d.title || "Untitled"} (${d.status || "open"}, ${d.priority || "medium"})`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listDossiers",
      note: "Dossier list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadDossier(state) {
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
    title = "Read data — Dossier";

    if (hintId) {
      const result = await this._callReadTool(
        "getDossier",
        { dossierId: hintId },
        policy,
      );
      const dossier = result?.dossier;
      if (!dossier) {
        summary = `No dossier found for ID ${hintId}`;
        details.push("Try listing dossiers to see available records.");
        break;
      }
      summary = `Dossier: ${dossier.reference || dossier.title || hintId}`;
      details.push(`Title: ${dossier.title || "Untitled"}`);
      details.push(`Status: ${dossier.status || "open"}`);
      details.push(`Priority: ${dossier.priority || "medium"}`);
      details.push(`Client ID: ${dossier.client_id || "N/A"}`);
      if (dossier.phase) details.push(`Phase: ${dossier.phase}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getDossier",
        note: "Dossier lookup",
      });
      data = dossier;
      await appendDocumentDetails("dossier", dossier);
      break;
    }

    if (hintRef) {
      const result = await this._callReadTool(
        "getDossierByReference",
        { reference: hintRef },
        policy,
      );
      const dossier = result?.dossier;
      if (!dossier) {
        summary = `No dossier found for reference "${hintRef}"`;
        details.push("Try listing all dossiers with: show me my dossiers");
        break;
      }
      summary = `Dossier: ${dossier.reference || hintRef}`;
      details.push(`Title: ${dossier.title || "Untitled"}`);
      details.push(`Status: ${dossier.status || "open"}`);
      details.push(`Priority: ${dossier.priority || "medium"}`);
      details.push(`Client ID: ${dossier.client_id || "N/A"}`);
      if (dossier.phase) details.push(`Phase: ${dossier.phase}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getDossierByReference",
        note: "Dossier lookup",
      });
      data = dossier;
      await appendDocumentDetails("dossier", dossier);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "listDossiers",
        { query: hintName, limit: 10 },
        policy,
      );
      const dossiers = result?.dossiers || [];
      if (dossiers.length === 0) {
        summary = `No dossier found for "${hintName}"`;
        details.push("Try listing all dossiers with: show me my dossiers");
      } else if (dossiers.length === 1) {
        const dossier = dossiers[0];
        summary = `Dossier: ${dossier.reference || dossier.title}`;
        details.push(`Title: ${dossier.title || "Untitled"}`);
        details.push(`Status: ${dossier.status || "open"}`);
        details.push(`Priority: ${dossier.priority || "medium"}`);
        details.push(`Client ID: ${dossier.client_id || "N/A"}`);
        if (dossier.phase) details.push(`Phase: ${dossier.phase}`);
        sources.push({
          sourceType: "system",
          reference: "tool:listDossiers",
          note: "Dossier lookup",
        });
        data = dossier;
        await appendDocumentDetails("dossier", dossier);
      } else {
        summary = `Multiple dossiers match "${hintName}"`;
        dossiers.forEach((d) =>
          details.push(
            `${d.reference || "Dossier"} — ${d.title || "Untitled"} (ID: ${d.id})`,
          ),
        );
        details.push("Please specify which dossier you mean.");
      }
      break;
    }

    summary = "Which dossier?";
    details.push("Provide a dossier ID or reference.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainDossier(state) {
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
    const scopedId = scope === "dossier" ? context?.dossierId : null;
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_DOSSIER && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("dossier");
      if (applyAggregateResult(aggregateResult)) break;
    }

    const fetchDossierByRef = async (reference) => {
      const result = await this._callReadTool(
        "getDossierByReference",
        { reference },
        policy,
      );
      return result?.dossier || null;
    };

    let dossier = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getDossier",
        { dossierId: targetId },
        policy,
      );
      dossier = result?.dossier || null;
    } else if (hintRef) {
      dossier = await fetchDossierByRef(hintRef);
    } else if (hintName) {
      const result = await this._callReadTool(
        "listDossiers",
        { query: hintName, limit: 5 },
        policy,
      );
      const dossiers = result?.dossiers || [];
      if (dossiers.length === 1) dossier = dossiers[0];
      else if (dossiers.length > 1) {
        summary = `Multiple dossiers match "${hintName}"`;
        dossiers.forEach((d) =>
          details.push(
            `${d.reference || "Dossier"} — ${d.title || "Untitled"} (ID: ${d.id})`,
          ),
        );
        details.push("Please specify which dossier you mean.");
        break;
      }
    }

    if (!dossier) {
      summary = "Which dossier?";
      details.push("Provide a dossier ID or reference.");
      break;
    }

    const tasksResult = await this._callReadTool(
      "listTasks",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const tasks = tasksResult?.tasks || [];
    const sessionsResult = await this._callReadTool(
      "listSessions",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const sessions = sessionsResult?.sessions || [];
    const missionsResult = await this._callReadTool(
      "listMissions",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const missions = missionsResult?.missions || [];
    const financialResult = await this._callReadTool(
      "listFinancialEntries",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const financialEntries = financialResult?.financialEntries || [];
    const lawsuitsResult = await this._callReadTool(
      "listLawsuits",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const lawsuits = lawsuitsResult?.lawsuits || [];
    const overdueTasks = tasks.filter(
      (task) =>
        task.due_date &&
        !["done", "cancelled"].includes(task.status) &&
        new Date(task.due_date) < now,
    );
    const blockedTasks = tasks.filter(
      (task) => String(task.status || "").toLowerCase() === "blocked",
    );
    const deadlineOverdue =
      dossier.next_deadline && new Date(dossier.next_deadline) < now;
    const overdueReceivables = financialEntries.filter(
      (entry) =>
        String(entry.direction || "").toLowerCase() === "receivable" &&
        isFinancialOverdue(entry),
    );
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "dossier", entityId: dossier.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];

    if (intent === READ_INTENTS.EXPLAIN_DOSSIER_STATE) {
      title = "Read data — Dossier state";
      summary = `${dossier.reference || "Dossier"} — ${dossier.title || "Untitled"}`;
      details.push(`Status: ${dossier.status || "open"} (priority ${dossier.priority || "medium"})`);
      details.push(
        `Relationships: ${lawsuits.length} lawsuit(s), ${tasks.length} task(s), ${sessions.length} session(s), ${missions.length} mission(s), ${financialEntries.length} financial entry(ies)`,
      );
      details.push(
        blockedTasks.length > 0 ||
          overdueTasks.length > 0 ||
          deadlineOverdue ||
          overdueReceivables.length > 0
          ? `Blocking: ${blockedTasks.length} blocked task(s), ${overdueTasks.length} overdue task(s), ${overdueReceivables.length} overdue receivable(s), ${deadlineOverdue ? "deadline overdue" : "deadline ok"}`
          : "Blocking: none detected",
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getDossier",
        note: "Dossier state",
      });
      data = dossier;
      await appendDocumentDetails("dossier", dossier);
      break;
    }

    title = "Read data — Dossier summary";
    summary = `${dossier.reference || "Dossier"} — ${dossier.title || "Untitled"}`;
    const recentActivity = historyEvents.map((event) => {
      const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
      return `${when} — ${event.action || "event"}`;
    });
    details.push(
      `Summary: status ${dossier.status || "open"}, ${tasks.length} task(s), ${sessions.length} session(s), ${financialEntries.length} financial entry(ies)`,
    );
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(
      `Key dates/risks: ${dossier.next_deadline ? `next deadline ${formatDate(dossier.next_deadline)}` : "no deadline"}${deadlineOverdue ? " (overdue)" : ""}${
        overdueReceivables.length > 0
          ? `, ${overdueReceivables.length} overdue receivable(s)`
          : ""
      }`,
    );
    sources.push({
      sourceType: "system",
      reference: "tool:getDossier",
      note: "Dossier summary",
    });
    data = dossier;
    await appendDocumentDetails("dossier", dossier);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListDossiers,
  handleReadDossier,
  handleExplainDossier,
};
