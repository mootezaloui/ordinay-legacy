"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");

async function handleListClients(state) {
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
    const { clients } = await this._callReadTool(
      "listClients",
      {
        limit: 50,
        status: filters?.status || null,
        query: filters?.query || null,
      },
      policy,
    );
    data = clients;
    title = "Read data — Clients";
    summary =
      clients.length > 0
        ? `Found ${clients.length} client(s)`
        : "No clients found";
    clients.forEach((c) => {
      details.push(
        `${c.name || "Client"} — ${c.status || "active"}${c.email ? ` • ${c.email}` : ""}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listClients",
      note: "Client list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadClient(state) {
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
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    title = "Read data — Client";

    if (hintId) {
      const result = await this._callReadTool(
        "getClient",
        { clientId: hintId },
        policy,
      );
      const client = result?.client;
      if (!client) {
        summary = "No client found for that identifier.";
        details.push("Try listing clients to see available records.");
        break;
      }
      summary = `Client: ${client.name}`;
      details.push(`Status: ${client.status || "active"}`);
      details.push(`Email: ${client.email || "N/A"}`);
      details.push(`Phone: ${client.phone || "N/A"}`);
      details.push(`Company: ${client.company || "N/A"}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getClient",
        note: "Client lookup",
      });
      data = client;
      await appendDocumentDetails("client", client);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "searchClientsByName",
        { nameHint: hintName, limit: 10 },
        policy,
      );
      const clients = result?.clients || [];
      if (clients.length === 0) {
        summary = `No client found matching "${hintName}"`;
        details.push("Try listing all clients with: show me my clients");
      } else if (clients.length === 1) {
        const client = clients[0];
        summary = `Client: ${client.name}`;
        details.push(`Status: ${client.status || "active"}`);
        details.push(`Email: ${client.email || "N/A"}`);
        details.push(`Phone: ${client.phone || "N/A"}`);
        details.push(`Company: ${client.company || "N/A"}`);
        sources.push({
          sourceType: "system",
          reference: "tool:searchClientsByName",
          note: "Client lookup",
        });
        data = client;
        await appendDocumentDetails("client", client);
      } else {
        summary = `Multiple clients match "${hintName}"`;
        clients.forEach((c) => {
          details.push(
            `${c.name || "Client"} — ${c.status || "active"}`,
          );
        });
        details.push("Please specify which client you mean.");
      }
      break;
    }

    summary = "Which client?";
    details.push("Provide a client name.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainClient(state) {
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
    const scopedId = scope === "client" ? context?.clientId : null;
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_CLIENT && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("client");
      if (applyAggregateResult(aggregateResult)) break;
    }

    if (targetId) {
      const result = await this._callReadTool(
        "getClient",
        { clientId: targetId },
        policy,
      );
      const client = result?.client;
      if (!client) {
        title = "Read data — Client";
        summary = "No client found for that identifier.";
        details.push("Try listing clients to see available records.");
        break;
      }

      const dossiersResult = await this._callReadTool(
        "listDossiersForClient",
        { clientId: client.id, limit: 50 },
        policy,
      );
      const dossiers = dossiersResult?.dossiers || [];
      const financialResult = await this._callReadTool(
        "listFinancialEntries",
        { clientId: client.id, limit: 200 },
        policy,
      );
      const financialEntries = financialResult?.financialEntries || [];
      const overdueReceivables = financialEntries.filter(
        (entry) =>
          String(entry.direction || "").toLowerCase() === "receivable" &&
          !entry.paid_at &&
          entry.due_date &&
          new Date(entry.due_date) < now,
      );
      const historyResult = await this._callReadTool(
        "listHistoryEvents",
        { entityType: "client", entityId: client.id, limit: 5 },
        policy,
      );
      const historyEvents = historyResult?.historyEvents || [];

      if (intent === READ_INTENTS.EXPLAIN_CLIENT_STATE) {
        title = "Read data — Client state";
        summary = `Client: ${client.name}`;
        details.push(`Status: ${client.status || "active"}`);
        details.push(
          `Relationships: ${dossiers.length} dossier(s), ${financialEntries.length} financial entry(ies)`,
        );
        details.push(
          overdueReceivables.length > 0
            ? `Blocking: ${overdueReceivables.length} overdue receivable(s)`
            : "Blocking: none detected",
        );
        sources.push({
          sourceType: "system",
          reference: "tool:getClient",
          note: "Client state",
        });
        data = client;
        await appendDocumentDetails("client", client);
        break;
      }

      title = "Read data — Client summary";
      summary = `Client: ${client.name}`;
      const recentActivity = historyEvents.map((event) => {
        const when = event.created_at
          ? formatDateTime(event.created_at)
          : "unknown";
        return `${when} — ${event.action || "event"}`;
      });
      details.push(
        `Summary: status ${client.status || "active"}, ${dossiers.length} dossier(s)`,
      );
      details.push(
        `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
      );
      details.push(
        overdueReceivables.length > 0
          ? `Key risks: ${overdueReceivables.length} overdue receivable(s)`
          : "Key risks: none detected",
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getClient",
        note: "Client summary",
      });
      data = client;
      await appendDocumentDetails("client", client);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "searchClientsByName",
        { nameHint: hintName, limit: 5 },
        policy,
      );
      const clients = result?.clients || [];
      if (clients.length === 1) {
        const client = clients[0];
        title =
          intent === READ_INTENTS.EXPLAIN_CLIENT_STATE
            ? "Read data — Client state"
            : "Read data — Client summary";
        summary = `Client: ${client.name}`;
        details.push(`Status: ${client.status || "active"}`);
        details.push("Provide the client name to load relationships and blockers.");
        sources.push({
          sourceType: "system",
          reference: "tool:searchClientsByName",
          note: "Client lookup",
        });
        data = client;
        await appendDocumentDetails("client", client);
        break;
      }
      summary = `Multiple clients match "${hintName}"`;
      clients.forEach((c) =>
        details.push(`${c.name || "Client"} — ${c.status || "active"}`),
      );
      details.push("Please specify which client you mean.");
      break;
    }

    summary = "Which client?";
    details.push("Provide a client name.");
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListClients,
  handleReadClient,
  handleExplainClient,
};
