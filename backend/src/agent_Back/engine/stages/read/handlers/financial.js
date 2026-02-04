"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const { resolveEntityDisplayLabel } = require("../../../../utils/entityDisplay");

async function handleListFinancialEntries(state) {
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
    let dossierId = scope === "dossier" ? context?.dossierId : null;
    let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;
    let missionId = scope === "mission" ? context?.missionId : null;
    let taskId = scope === "task" ? context?.taskId : null;
    let personalTaskId =
      scope === "personal_task" ? context?.personalTaskId : null;

    if (
      !clientId &&
      !dossierId &&
      !lawsuitId &&
      !missionId &&
      !taskId &&
      !personalTaskId
    ) {
      const hintClientId = getHintValue("id", "client");
      const hintClientName = getHintValue("name", "client");
      if (hintClientId) {
        clientId = hintClientId;
      } else if (hintClientName) {
        const resolution = await this._resolveEntity(
          { type: "client", nameHint: hintClientName },
          policy,
        );
        if (resolution.resolved) {
          clientId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Financial entries";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Client"}`),
          );
          details.push("Please specify which client you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Financial entries";
          summary = resolution.message;
          details.push("Try listing clients to see available records.");
          break;
        }
      }
    }

    if (
      !dossierId &&
      (getHintValue("reference", "dossier") || getHintValue("name", "dossier"))
    ) {
      const resolution = await this._resolveEntity(
        {
          type: "dossier",
          reference: getHintValue("reference", "dossier") || undefined,
          nameHint: getHintValue("name", "dossier") || undefined,
        },
        policy,
      );
      if (resolution.resolved) {
        dossierId = resolution.entity.id;
      } else if (resolution.reason === "ambiguous") {
        title = "Read data — Financial entries";
        summary = resolution.message;
        resolution.candidates?.forEach((c) =>
          details.push(`${c.name || "Dossier"}`),
        );
        details.push("Please specify which dossier you mean.");
        break;
      } else if (resolution.reason === "not_found") {
        title = "Read data — Financial entries";
        summary = resolution.message;
        details.push("Try listing dossiers to see available records.");
        break;
      }
    }

    if (
      !lawsuitId &&
      (getHintValue("reference", "lawsuit") || getHintValue("name", "lawsuit"))
    ) {
      const resolution = await this._resolveEntity(
        {
          type: "lawsuit",
          reference: getHintValue("reference", "lawsuit") || undefined,
          nameHint: getHintValue("name", "lawsuit") || undefined,
        },
        policy,
      );
      if (resolution.resolved) {
        lawsuitId = resolution.entity.id;
      } else if (resolution.reason === "ambiguous") {
        title = "Read data — Financial entries";
        summary = resolution.message;
        resolution.candidates?.forEach((c) =>
          details.push(`${c.name || "Case"}`),
        );
        details.push("Please specify which case you mean.");
        break;
      } else if (resolution.reason === "not_found") {
        title = "Read data — Financial entries";
        summary = resolution.message;
        details.push("Try listing cases to see available records.");
        break;
      }
    }

    if (
      !missionId &&
      (getHintValue("reference", "mission") || getHintValue("name", "mission"))
    ) {
      const resolution = await this._resolveEntity(
        {
          type: "mission",
          reference: getHintValue("reference", "mission") || undefined,
          nameHint: getHintValue("name", "mission") || undefined,
        },
        policy,
      );
      if (resolution.resolved) {
        missionId = resolution.entity.id;
      } else if (resolution.reason === "ambiguous") {
        title = "Read data — Financial entries";
        summary = resolution.message;
        resolution.candidates?.forEach((c) =>
          details.push(`${c.name || "Mission"}`),
        );
        details.push("Please specify which mission you mean.");
        break;
      } else if (resolution.reason === "not_found") {
        title = "Read data — Financial entries";
        summary = resolution.message;
        details.push("Try listing missions to see available records.");
        break;
      }
    }

    if (!taskId && getHintValue("id", "task")) {
      taskId = getHintValue("id", "task");
    }

    if (!personalTaskId && getHintValue("id", "personal_task")) {
      personalTaskId = getHintValue("id", "personal_task");
    }

    const scopeCount = [
      clientId,
      dossierId,
      lawsuitId,
      missionId,
      taskId,
      personalTaskId,
    ].filter(Boolean).length;
    if (scopeCount > 1) {
      title = "Read data — Financial entries";
      summary = "Multiple scopes detected for financial entries.";
      details.push("Please specify a single client, dossier, case, mission, or task.");
      break;
    }

    const paymentStatus =
      filters?.paymentStatus || (filters?.overdue ? "overdue" : null);
    const { financialEntries } = await this._callReadTool(
      "listFinancialEntries",
      {
        limit: 50,
        paymentStatus,
        status: filters?.status || null,
        direction: filters?.direction || null,
        scope: filters?.scope || null,
        query: filters?.query || null,
        clientId,
        dossierId,
        lawsuitId,
        missionId,
        taskId,
        personalTaskId,
      },
      policy,
    );
    data = financialEntries;
    title = "Read data — Financial entries";
    summary =
      financialEntries.length > 0
        ? `Found ${financialEntries.length} entry(ies)`
        : "No financial entries found";
    financialEntries.forEach((entry) => {
      const amount = entry.amount
        ? `${entry.amount} ${entry.currency || ""}`.trim()
        : "N/A";
      const due = entry.due_date ? ` due ${formatDate(entry.due_date)}` : "";
      const ref =
        entry.reference || entry.title || entry.entry_type || "Entry";
      details.push(
        `${ref} — ${amount} (${entry.status || "draft"})${due}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listFinancialEntries",
      note: "Financial entry list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadFinancialEntry(state) {
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
    title = "Read data — Financial entry";

    const appendParentLabels = async (entry) => {
      if (entry.client_id) {
        const clientResult = await safeReadSummaryTool("getClient", {
          clientId: entry.client_id,
        });
        const clientLabel = clientResult?.client
          ? resolveEntityDisplayLabel("client", clientResult.client, {
              fallback: "Client",
            })
          : "Client";
        details.push(`Client: ${clientLabel}`);
      } else {
        details.push("Client: N/A");
      }

      if (entry.dossier_id) {
        const dossierResult = await safeReadSummaryTool("getDossier", {
          dossierId: entry.dossier_id,
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

    if (hintId) {
      const result = await this._callReadTool(
        "getFinancialEntry",
        { financialEntryId: hintId },
        policy,
      );
      const entry = result?.financialEntry;
      if (!entry) {
        summary = "No financial entry found for that identifier.";
        details.push("Try listing entries to see available records.");
        break;
      }
      summary = `Entry: ${resolveEntityDisplayLabel("financial_entry", entry, { fallback: "Financial entry" })}`;
      details.push(`Status: ${entry.status || "draft"}`);
      details.push(
        `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
      );
      details.push(`Due date: ${entry.due_date ? formatDate(entry.due_date) : "N/A"}`);
      await appendParentLabels(entry);
      sources.push({
        sourceType: "system",
        reference: "tool:getFinancialEntry",
        note: "Financial entry lookup",
      });
      data = entry;
      await appendDocumentDetails("financial_entry", entry);
      break;
    }

    if (hintRef || hintName) {
      const query = hintRef || hintName;
      const result = await this._callReadTool(
        "listFinancialEntries",
        { query, limit: 10 },
        policy,
      );
      const entries = result?.financialEntries || [];
      if (entries.length === 0) {
        summary = `No financial entry found for "${query}"`;
        details.push("Try listing all entries with: show me my accounting entries");
      } else if (entries.length === 1) {
        const entry = entries[0];
        summary = `Entry: ${resolveEntityDisplayLabel("financial_entry", entry, { fallback: "Financial entry" })}`;
        details.push(`Status: ${entry.status || "draft"}`);
        details.push(
          `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
        );
        details.push(`Due date: ${entry.due_date ? formatDate(entry.due_date) : "N/A"}`);
        await appendParentLabels(entry);
        sources.push({
          sourceType: "system",
          reference: "tool:listFinancialEntries",
          note: "Financial entry lookup",
        });
        data = entry;
        await appendDocumentDetails("financial_entry", entry);
      } else {
        summary = `Multiple financial entries match "${query}"`;
        entries.forEach((e) => {
          const ref = e.reference || e.title || "Entry";
          details.push(`${ref} — ${e.status || "draft"}`);
        });
        details.push("Please specify which entry you mean.");
      }
      break;
    }

    summary = "Which financial entry?";
    details.push("Provide an entry reference or name.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainFinancialEntry(state) {
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
      getHintValue("id", "financial_entry") || getHintValue("id");
    const hintRef = getHintValue("reference", "financial_entry");
    const hintName =
      getHintValue("name", "financial_entry") || getHintValue("name");
    const hasEntryHint = Boolean(hintId || hintRef || hintName);
    const allowAggregateFinancialSummary =
      intent === READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY &&
      shouldAggregateSummary;

    let entry = null;
    if (hintId) {
      const result = await this._callReadTool(
        "getFinancialEntry",
        { financialEntryId: hintId },
        policy,
      );
      entry = result?.financialEntry || null;
    } else if (hintRef || hintName) {
      const query = hintRef || hintName;
      const result = await this._callReadTool(
        "listFinancialEntries",
        { query, limit: 10 },
        policy,
      );
      const entries = result?.financialEntries || [];
      if (entries.length === 1) {
        entry = entries[0];
      } else if (entries.length > 1) {
        title =
          intent === READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE
            ? "Read data — Financial status"
            : "Read data — Financial summary";
        summary = `Multiple financial entries match "${query}"`;
        entries.forEach((e) => {
          const ref = e.reference || e.title || "Entry";
          details.push(`${ref} — ${e.status || "draft"}`);
        });
        details.push("Please specify which entry you mean.");
        break;
      }
    }

    if (!entry && hasEntryHint) {
      summary = "Which financial entry?";
      details.push("Provide an entry reference or name.");
      break;
    }

    if (!entry && intent === READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY && !allowAggregateFinancialSummary) {
      summary = "Which financial entry?";
      details.push("Provide an entry reference or name.");
      break;
    }

    if (!entry) {
      // Aggregate financial status / balance summary
      let clientId = scope === "client" ? context?.clientId : null;
      let dossierId = scope === "dossier" ? context?.dossierId : null;
      let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;
      let missionId = scope === "mission" ? context?.missionId : null;
      let taskId = scope === "task" ? context?.taskId : null;
      let personalTaskId =
        scope === "personal_task" ? context?.personalTaskId : null;

      if (
        !clientId &&
        !dossierId &&
        !lawsuitId &&
        !missionId &&
        !taskId &&
        !personalTaskId
      ) {
        const hintClientId = getHintValue("id", "client");
        const hintClientName = getHintValue("name", "client");
        if (hintClientId) {
          clientId = hintClientId;
        } else if (hintClientName) {
          const resolution = await this._resolveEntity(
            { type: "client", nameHint: hintClientName },
            policy,
          );
          if (resolution.resolved) {
            clientId = resolution.entity.id;
          } else if (resolution.reason === "ambiguous") {
            title = "Read data — Financial summary";
            summary = resolution.message;
            resolution.candidates?.forEach((c) =>
              details.push(`${c.name || "Client"}`),
            );
            details.push("Please specify which client you mean.");
            break;
          } else if (resolution.reason === "not_found") {
            title = "Read data — Financial summary";
            summary = resolution.message;
            details.push("Try listing clients to see available records.");
            break;
          }
        }
      }

      if (
        !dossierId &&
        (getHintValue("reference", "dossier") || getHintValue("name", "dossier"))
      ) {
        const resolution = await this._resolveEntity(
          {
            type: "dossier",
            reference: getHintValue("reference", "dossier") || undefined,
            nameHint: getHintValue("name", "dossier") || undefined,
          },
          policy,
        );
        if (resolution.resolved) {
          dossierId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Financial summary";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Dossier"}`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Financial summary";
          summary = resolution.message;
          details.push("Try listing dossiers to see available records.");
          break;
        }
      }

      if (
        !lawsuitId &&
        (getHintValue("reference", "lawsuit") || getHintValue("name", "lawsuit"))
      ) {
        const resolution = await this._resolveEntity(
          {
            type: "lawsuit",
            reference: getHintValue("reference", "lawsuit") || undefined,
            nameHint: getHintValue("name", "lawsuit") || undefined,
          },
          policy,
        );
        if (resolution.resolved) {
          lawsuitId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Financial summary";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Case"}`),
          );
          details.push("Please specify which case you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Financial summary";
          summary = resolution.message;
          details.push("Try listing cases to see available records.");
          break;
        }
      }

      if (
        !missionId &&
        (getHintValue("reference", "mission") || getHintValue("name", "mission"))
      ) {
        const resolution = await this._resolveEntity(
          {
            type: "mission",
            reference: getHintValue("reference", "mission") || undefined,
            nameHint: getHintValue("name", "mission") || undefined,
          },
          policy,
        );
        if (resolution.resolved) {
          missionId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Financial summary";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Mission"}`),
          );
          details.push("Please specify which mission you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Financial summary";
          summary = resolution.message;
          details.push("Try listing missions to see available records.");
          break;
        }
      }

      if (!taskId && getHintValue("id", "task")) {
        taskId = getHintValue("id", "task");
      }
      if (!personalTaskId && getHintValue("id", "personal_task")) {
        personalTaskId = getHintValue("id", "personal_task");
      }

      const scopeCount = [
        clientId,
        dossierId,
        lawsuitId,
        missionId,
        taskId,
        personalTaskId,
      ].filter(Boolean).length;
      if (scopeCount > 1) {
        title = "Read data — Financial summary";
        summary = "Multiple scopes detected for financial entries.";
        details.push(
          "Please specify a single client, dossier, case, mission, or task.",
        );
        break;
      }

      const result = await this._callReadTool(
        "listFinancialEntries",
        {
          limit: 200,
          paymentStatus: filters?.paymentStatus || null,
          status: filters?.status || null,
          clientId,
          dossierId,
          lawsuitId,
          missionId,
          taskId,
          personalTaskId,
        },
        policy,
      );
      const entries = result?.financialEntries || [];
      const totals = {};
      const unpaidTotals = {};
      const overdueTotals = {};
      let unpaidCount = 0;
      let overdueCount = 0;

      const addAmount = (map, currency, amount) => {
        const key = currency || "N/A";
        map[key] = (map[key] || 0) + amount;
      };

      entries.forEach((item) => {
        const amount = Number(item.amount || 0);
        const currency = item.currency || "N/A";
        addAmount(totals, currency, amount);
        if (item.paid_at) {
          return;
        }
        unpaidCount += 1;
        addAmount(unpaidTotals, currency, amount);
        if (isFinancialOverdue(item)) {
          overdueCount += 1;
          addAmount(overdueTotals, currency, amount);
        }
      });

      const formatTotals = (map) =>
        Object.entries(map)
          .map(([currency, amount]) => `${amount} ${currency}`)
          .join(", ");

      title =
        intent === READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE
          ? "Read data — Financial status"
          : "Read data — Financial summary";
      summary =
        entries.length > 0
          ? `${entries.length} financial entry(ies) in scope`
          : "No financial entries found";
      details.push(
        `Entries: ${entries.length} total, ${unpaidCount} unpaid, ${overdueCount} overdue`,
      );
      details.push(
        `Totals: ${formatTotals(totals) || "N/A"}`,
      );
      details.push(
        `Unpaid: ${formatTotals(unpaidTotals) || "N/A"}`,
      );
      if (overdueCount > 0) {
        details.push(
          `Overdue: ${formatTotals(overdueTotals) || "N/A"}`,
        );
      }
      sources.push({
        sourceType: "system",
        reference: "tool:listFinancialEntries",
        note: "Financial summary",
      });
      data = entries;
      break;
    }

    const paymentStatus = entry.paid_at
      ? "paid"
      : isFinancialOverdue(entry)
        ? "overdue"
        : "unpaid";
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "financial_entry", entityId: entry.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];

    if (intent === READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE) {
      title = "Read data — Financial status";
      summary = resolveEntityDisplayLabel("financial_entry", entry, {
        fallback: "Financial entry",
      });
      details.push(`Status: ${entry.status || "draft"}`);
      details.push(`Payment status: ${paymentStatus}`);
      details.push(
        `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
      );
      details.push(`Due date: ${entry.due_date ? formatDate(entry.due_date) : "N/A"}`);
      details.push(
        `Relationships: ${entry.client_id ? "linked client" : "client N/A"}, ${entry.dossier_id ? "linked dossier" : "dossier N/A"}, ${entry.lawsuit_id ? "linked case" : "case N/A"}`,
      );
      details.push(
        paymentStatus === "overdue"
          ? "Blocking: entry overdue"
          : "Blocking: none detected",
      );
      details.push("Explanation:");
      details.push(
        entry.paid_at
          ? `Paid on ${formatDate(entry.paid_at)}`
          : "No payment recorded yet",
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getFinancialEntry",
        note: "Financial entry state",
      });
      data = entry;
      await appendDocumentDetails("financial_entry", entry);
      break;
    }

    title = "Read data — Financial summary";
    summary = resolveEntityDisplayLabel("financial_entry", entry, {
      fallback: "Financial entry",
    });
    const recentActivity = historyEvents.map((event) => {
      const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
      return `${when} — ${event.action || "event"}`;
    });
    details.push(
      `Summary: status ${entry.status || "draft"}, payment ${paymentStatus}`,
    );
    details.push(
      `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
    );
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(
      `Key dates/risks: ${entry.due_date ? formatDate(entry.due_date) : "no due date"}${
        paymentStatus === "overdue" ? " (overdue)" : ""
      }`,
    );
    sources.push({
      sourceType: "system",
      reference: "tool:getFinancialEntry",
      note: "Financial entry summary",
    });
    data = entry;
    await appendDocumentDetails("financial_entry", entry);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListFinancialEntries,
  handleReadFinancialEntry,
  handleExplainFinancialEntry,
};
