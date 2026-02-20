"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const clientHandlers = require("./clients");
const dossierHandlers = require("./dossiers");
const lawsuitHandlers = require("./lawsuits");
const taskHandlers = require("./tasks");
const personalTaskHandlers = require("./personal-tasks");
const sessionHandlers = require("./sessions");
const missionHandlers = require("./missions");
const officerHandlers = require("./officers");
const financialHandlers = require("./financial");
const notificationHandlers = require("./notifications");
const historyHandlers = require("./history");
const documentHandlers = require("./documents");

function normalizeExplicitSearchQuery(query, message) {
  const direct = String(query || "").trim();
  if (direct) return direct;
  const fallback = String(message || "").trim();
  if (!fallback) return "";
  return fallback
    .replace(
      /\b(?:do\s+a\s+deep\s+search|deep\s+search|deep\s+research|legal\s+research|jurisprudence\s+research|research\s+jurisprudence|search\s+the\s+web|web\s+search|search\s+online|internet\s+search|look\s+up\s+on\s+the\s+web|look\s+it\s+up\s+on\s+the\s+web)\b/gi,
      "",
    )
    .replace(/^(for|about|on)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();
}

function inferWebCategory(query, requestedCategory) {
  if (requestedCategory) return requestedCategory;
  const normalized = String(query || "").toLowerCase();
  if (/\b(deadline|due\s+date|filing\s+date|cutoff)\b/i.test(normalized)) {
    return "deadline";
  }
  if (/\b(procedure|process|step|how\s+to|filing)\b/i.test(normalized)) {
    return "procedure";
  }
  if (/\b(define|definition|meaning|what\s+is)\b/i.test(normalized)) {
    return "definition";
  }
  if (/\b(legal|law|jurisprudence|court|statute|regulation)\b/i.test(normalized)) {
    return "legal";
  }
  return "general";
}

function inferDeepResearchType(query, requestedType) {
  if (requestedType) return requestedType;
  const normalized = String(query || "").toLowerCase();
  if (
    /\b(jurisprudence|case\s+law|precedent|ruling|decision|judgment)\b/i.test(
      normalized,
    )
  ) {
    return "jurisprudence";
  }
  if (/\b(statute|law|code|regulation|act|article|section)\b/i.test(normalized)) {
    return "statute";
  }
  if (/\b(procedure|procedural|filing|deadline|appeal|jurisdiction)\b/i.test(normalized)) {
    return "procedure";
  }
  return "comprehensive";
}

function buildSearchDataFromCitations(citations = [], fallbackResults = []) {
  const records = citations.map((citation, index) => ({
    id: index + 1,
    title:
      citation.title ||
      fallbackResults[index]?.title ||
      citation.citation ||
      citation.source ||
      "Search result",
    source: citation.source || fallbackResults[index]?.source || "source",
    url: citation.url || fallbackResults[index]?.url || null,
  }));
  return records;
}

async function handleWebSearch(state) {
  const query = normalizeExplicitSearchQuery(
    state.filters?.query,
    state.message,
  );
  if (!query) {
    state.details.push("Search Type: Web Search");
    state.details.push("A search query is required.");
    state.details.push('Example: "Search the web for recent labor law changes."');
    state.sources.push({
      sourceType: "system",
      reference: "read:web_search",
      note: "Explicit query missing",
    });
    return {
      data: [],
      title: "Web Search",
      summary: "Web Search was explicitly requested, but no query was provided.",
    };
  }

  const category = inferWebCategory(query, state.filters?.category);
  const language = state.filters?.language || "en";
  const limit = Number.isInteger(state.filters?.limit)
    ? Math.max(1, Math.min(10, state.filters.limit))
    : 5;

  const result = await state.engine._callReadTool(
    "webSearch",
    {
      query,
      category,
      language,
      limit,
      requireCitation: true,
    },
    state.policy,
  );

  const results = Array.isArray(result?.results) ? result.results : [];
  const citations = Array.isArray(result?.citations) ? result.citations : [];
  const data = buildSearchDataFromCitations(citations, results);
  const resultCount =
    typeof result?.resultCount === "number" ? result.resultCount : data.length;

  while (data.length < resultCount) {
    data.push({ id: data.length + 1, title: "Search result", source: "source" });
  }

  state.details.push("Search Type: Web Search");
  state.details.push(`Query: ${query}`);
  state.details.push(`Category: ${category}`);
  state.details.push(`Provider: ${result?.searchMeta?.provider || "unknown"}`);
  state.details.push(`Result Count: ${resultCount}`);
  if (results.length === 0) {
    state.details.push("No web results were returned.");
  } else {
    results.slice(0, 5).forEach((item, index) => {
      const title = item?.title || `Result ${index + 1}`;
      const url = item?.url ? ` — ${item.url}` : "";
      state.details.push(`${index + 1}. ${title}${url}`);
    });
  }

  state.sources.push({
    sourceType: "analysis",
    reference: "tool:webSearch",
    note: "Explicit web search execution",
  });
  citations.slice(0, 10).forEach((citation, index) => {
    state.sources.push({
      sourceType: "analysis",
      reference: citation.url || `web:citation:${index + 1}`,
      note: `Web Search citation ${index + 1}`,
    });
  });

  return {
    data,
    title: "Web Search",
    summary: `Web Search executed for "${query}" and returned ${resultCount} result(s).`,
  };
}

async function handleDeepSearch(state) {
  const query = normalizeExplicitSearchQuery(
    state.filters?.query,
    state.message,
  );
  if (!query) {
    state.details.push("Search Type: Deep Search");
    state.details.push("A search query is required.");
    state.details.push('Example: "Do a deep search on wrongful termination jurisprudence."');
    state.sources.push({
      sourceType: "system",
      reference: "read:deep_search",
      note: "Explicit query missing",
    });
    return {
      data: [],
      title: "Deep Search",
      summary: "Deep Search was explicitly requested, but no query was provided.",
    };
  }

  const researchType = inferDeepResearchType(query, state.filters?.researchType);
  const jurisdiction = state.filters?.jurisdiction || "DE";
  const language = state.filters?.language || "en";
  const maxResults = Number.isInteger(state.filters?.maxResults)
    ? Math.max(1, Math.min(50, state.filters.maxResults))
    : 20;

  const result = await state.engine._callReadTool(
    "legalResearch",
    {
      query,
      researchType,
      jurisdiction,
      language,
      maxResults,
      includeCommentary: true,
    },
    state.policy,
  );

  const citations = Array.isArray(result?.citations) ? result.citations : [];
  const primarySources = Array.isArray(result?.primarySources)
    ? result.primarySources
    : [];
  const data = buildSearchDataFromCitations(citations, primarySources);
  const resultCount =
    typeof result?.resultCount === "number" ? result.resultCount : data.length;

  while (data.length < resultCount) {
    data.push({ id: data.length + 1, title: "Research result", source: "source" });
  }

  state.details.push("Search Type: Deep Search");
  state.details.push(`Query: ${query}`);
  state.details.push(`Research Type: ${researchType}`);
  state.details.push(`Jurisdiction: ${jurisdiction}`);
  state.details.push(`Result Count: ${resultCount}`);
  state.details.push(
    `Primary Sources: ${Array.isArray(result?.primarySources) ? result.primarySources.length : 0}`,
  );
  state.details.push(
    `Uncertainties: ${Array.isArray(result?.uncertainties) ? result.uncertainties.length : 0}`,
  );
  if (citations.length === 0) {
    state.details.push("No deep-search citations were returned.");
  } else {
    citations.slice(0, 5).forEach((citation, index) => {
      const title = citation?.title || citation?.citation || `Result ${index + 1}`;
      const source = citation?.source ? ` (${citation.source})` : "";
      const url = citation?.url ? ` — ${citation.url}` : "";
      state.details.push(`${index + 1}. ${title}${source}${url}`);
    });
  }

  state.sources.push({
    sourceType: "analysis",
    reference: "tool:legalResearch",
    note: "Explicit deep search execution",
  });
  citations.slice(0, 10).forEach((citation, index) => {
    state.sources.push({
      sourceType: "analysis",
      reference: citation.url || citation.citation || `legal:citation:${index + 1}`,
      note: `Deep Search citation ${index + 1}`,
    });
  });

  return {
    data,
    title: "Deep Search",
    summary: `Deep Search executed for "${query}" and returned ${resultCount} result(s).`,
  };
}

async function dispatchReadIntent(state) {
  const intent = state.intent;
  let result = null;

  switch (intent) {
    case READ_INTENTS.WEB_SEARCH:
      throw new Error("WEB_SEARCH is handled by SEARCH_WEB gate and must not execute in READ lane.");
    case READ_INTENTS.DEEP_SEARCH:
      throw new Error("DEEP_SEARCH is handled by SEARCH_DEEP_WEB gate and must not execute in READ lane.");

    case READ_INTENTS.LIST_CLIENTS:
      result = await clientHandlers.handleListClients.call(state.engine, state);
      break;
    case READ_INTENTS.READ_CLIENT:
      result = await clientHandlers.handleReadClient.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_CLIENT_STATE:
    case READ_INTENTS.SUMMARIZE_CLIENT:
      result = await clientHandlers.handleExplainClient.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_DOSSIERS:
      result = await dossierHandlers.handleListDossiers.call(state.engine, state);
      break;
    case READ_INTENTS.READ_DOSSIER:
      result = await dossierHandlers.handleReadDossier.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_DOSSIER_STATE:
    case READ_INTENTS.SUMMARIZE_DOSSIER:
      result = await dossierHandlers.handleExplainDossier.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_LAWSUITS:
      result = await lawsuitHandlers.handleListLawsuits.call(state.engine, state);
      break;
    case READ_INTENTS.READ_LAWSUIT:
      result = await lawsuitHandlers.handleReadLawsuit.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_LAWSUIT_STATE:
    case READ_INTENTS.SUMMARIZE_LAWSUIT:
      result = await lawsuitHandlers.handleExplainLawsuit.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_TASKS:
      result = await taskHandlers.handleListTasks.call(state.engine, state);
      break;
    case READ_INTENTS.LIST_OVERDUE_TASKS:
      result = await taskHandlers.handleListOverdueTasks.call(state.engine, state);
      break;
    case READ_INTENTS.READ_TASK:
      result = await taskHandlers.handleReadTask.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_TASK_STATE:
    case READ_INTENTS.SUMMARIZE_TASK:
      result = await taskHandlers.handleExplainTask.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_PERSONAL_TASKS:
      result = await personalTaskHandlers.handleListPersonalTasks.call(state.engine, state);
      break;
    case READ_INTENTS.READ_PERSONAL_TASK:
      result = await personalTaskHandlers.handleReadPersonalTask.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE:
    case READ_INTENTS.SUMMARIZE_PERSONAL_TASK:
      result = await personalTaskHandlers.handleExplainPersonalTask.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_SESSIONS:
    case READ_INTENTS.LIST_UPCOMING_SESSIONS:
      result = await sessionHandlers.handleListSessions.call(state.engine, state);
      break;
    case READ_INTENTS.READ_SESSION:
      result = await sessionHandlers.handleReadSession.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_SESSION_STATE:
    case READ_INTENTS.SUMMARIZE_SESSION:
      result = await sessionHandlers.handleExplainSession.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_MISSIONS:
      result = await missionHandlers.handleListMissions.call(state.engine, state);
      break;
    case READ_INTENTS.LIST_OFFICERS:
      result = await officerHandlers.handleListOfficers.call(state.engine, state);
      break;
    case READ_INTENTS.READ_MISSION:
      result = await missionHandlers.handleReadMission.call(state.engine, state);
      break;
    case READ_INTENTS.READ_OFFICER:
      result = await officerHandlers.handleReadOfficer.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_MISSION_STATE:
    case READ_INTENTS.SUMMARIZE_MISSION:
      result = await missionHandlers.handleExplainMission.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_OFFICER_STATE:
    case READ_INTENTS.SUMMARIZE_OFFICER:
      result = await officerHandlers.handleExplainOfficer.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_FINANCIAL_ENTRIES:
      result = await financialHandlers.handleListFinancialEntries.call(state.engine, state);
      break;
    case READ_INTENTS.READ_FINANCIAL_ENTRY:
      result = await financialHandlers.handleReadFinancialEntry.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE:
    case READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY:
      result = await financialHandlers.handleExplainFinancialEntry.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_NOTIFICATIONS:
      result = await notificationHandlers.handleListNotifications.call(state.engine, state);
      break;
    case READ_INTENTS.READ_NOTIFICATION:
      result = await notificationHandlers.handleReadNotification.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_NOTIFICATION_STATE:
    case READ_INTENTS.SUMMARIZE_NOTIFICATION:
      result = await notificationHandlers.handleExplainNotification.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_HISTORY_EVENTS:
      result = await historyHandlers.handleListHistoryEvents.call(state.engine, state);
      break;
    case READ_INTENTS.READ_HISTORY_EVENT:
      result = await historyHandlers.handleReadHistoryEvent.call(state.engine, state);
      break;
    case READ_INTENTS.LIST_DOCUMENTS:
      result = await documentHandlers.handleListDocuments.call(state.engine, state);
      break;
    case READ_INTENTS.READ_DOCUMENT:
      result = await documentHandlers.handleReadDocument.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_HISTORY_STATE:
    case READ_INTENTS.SUMMARIZE_HISTORY:
      result = await historyHandlers.handleExplainHistory.call(state.engine, state);
      break;
    case READ_INTENTS.SUMMARIZE_DOCUMENT:
      result = await documentHandlers.handleSummarizeDocument.call(state.engine, state);
      break;
    default:
      result = null;
  }

  if (result) {
    state.data = result.data;
    state.title = result.title;
    state.summary = result.summary;
  }

  return result;
}

module.exports = {
  dispatchReadIntent,
};
