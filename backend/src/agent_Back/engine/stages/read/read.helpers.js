"use strict";

const {
  resolveClientQuery,
  resolveDossierQuery,
  resolveTaskQuery,
  resolveSessionQuery,
} = require("../../../entity.resolver");

function buildReadHelpers({
  engine,
  message,
  context,
  policy,
  entityHints,
  scope,
}) {
  const formatDate = (value) =>
    value ? new Date(value).toISOString().slice(0, 10) : "N/A";
  const formatDateTime = (value) =>
    value
      ? new Date(value).toISOString().replace("T", " ").slice(0, 16)
      : "N/A";

  const parsePayload = (value) => {
    if (value === null || value === undefined) return {};
    if (typeof value === "object") return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (err) {
        return { value };
      }
    }
    return { value };
  };

  const getHintValue = (type, entityType = null) => {
    const hint = entityHints.find(
      (item) =>
        item.type === type &&
        (!entityType || !item.entityType || item.entityType === entityType),
    );
    return hint ? hint.value : null;
  };

  const cleanQueryText = (value) => {
    if (!value) return null;
    let cleaned = String(value).trim();
    cleaned = cleaned.replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, "");
    cleaned = cleaned.replace(/^[#:\-]+/, "");
    cleaned = cleaned.replace(
      /^(named|called|with|for|about|id|ref|reference|number|no\.?)\s+/i,
      "",
    );
    cleaned = cleaned.replace(/[?!.]+$/g, "");
    cleaned = cleaned.replace(/\b(please|now)\b$/gi, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    if (
      /^(all|list|overview|summary|clients?|dossiers?|tasks?|sessions?)$/i.test(
        cleaned,
      )
    ) {
      return null;
    }
    return cleaned;
  };

  const extractEntityQueryFromMessage = (messageText, entityType) => {
    if (!messageText || !entityType) return null;
    const patterns = {
      client: /\bclient\b\s*[:#\-]?\s*(.+)$/i,
      dossier: /\b(dossier|case\s*file|matter|matters)\b\s*[:#\-]?\s*(.+)$/i,
      lawsuit: /\b(lawsuit|case|trial|proces)\b\s*[:#\-]?\s*(.+)$/i,
      task: /\b(task|todo|to-do|todos)\b\s*[:#\-]?\s*(.+)$/i,
      session: /\b(session|hearing|meeting|appointment)\b\s*[:#\-]?\s*(.+)$/i,
      mission: /\b(mission|missions)\b\s*[:#\-]?\s*(.+)$/i,
      officer: /\b(officer|officers|bailiff|bailiffs|huissier|huissiers)\b\s*[:#\-]?\s*(.+)$/i,
    };
    const pattern = patterns[entityType];
    if (!pattern) return null;
    const match = String(messageText).match(pattern);
    if (!match) return null;
    const candidate = match[2] || match[1];
    return cleanQueryText(candidate);
  };

  const isExplicitListRequest = (messageText, entityType, queryText) => {
    if (!messageText) return false;
    if (queryText) return false;
    const normalizedText = String(messageText).toLowerCase();
    if (/\b(list|all|overview|summary|how\s+many|count)\b/i.test(normalizedText)) {
      return true;
    }
    if (
      /\b(show|display|see|get|give)\b\s+(me\s+)?(all|my)\b/i.test(
        normalizedText,
      )
    ) {
      return true;
    }
    const pluralMap = {
      client: /\bclients\b/i,
      dossier: /\bdossiers\b/i,
      lawsuit: /\blawsuits\b/i,
      task: /\btasks\b/i,
      session: /\bsessions\b/i,
      mission: /\bmissions\b/i,
      officer: /\b(officers|bailiffs|huissiers)\b/i,
      personal_task: /\bpersonal\s+tasks\b/i,
    };
    const pluralPattern = entityType ? pluralMap[entityType] : null;
    if (pluralPattern && pluralPattern.test(normalizedText)) {
      return true;
    }
    return false;
  };

  const getEntityQuery = (entityType) => {
    const hintId = getHintValue("id", entityType);
    if (hintId !== null && hintId !== undefined) return String(hintId);
    const hintRef = getHintValue("reference", entityType);
    if (hintRef) return String(hintRef);
    const hintName = getHintValue("name", entityType);
    if (hintName) return String(hintName);
    return extractEntityQueryFromMessage(message, entityType);
  };

  const resolveEntityQuery = async (entityType, queryText) => {
    if (!entityType || !queryText) return { kind: "none" };
    if (entityType === "client") {
      const { clients } = await engine._callReadTool(
        "listClients",
        { limit: 200 },
        policy,
      );
      return resolveClientQuery(queryText, clients || []);
    }
    if (entityType === "dossier") {
      const params = { limit: 200 };
      if (scope === "client" && context?.clientId) params.clientId = context.clientId;
      const { dossiers } = await engine._callReadTool(
        "listDossiers",
        params,
        policy,
      );
      return resolveDossierQuery(queryText, dossiers || []);
    }
    if (entityType === "task") {
      const params = { limit: 100 };
      if (scope === "dossier" && context?.dossierId) params.dossierId = context.dossierId;
      if (scope === "lawsuit" && context?.lawsuitId) params.lawsuitId = context.lawsuitId;
      const { tasks } = await engine._callReadTool(
        "listTasks",
        params,
        policy,
      );
      return resolveTaskQuery(queryText, tasks || []);
    }
    if (entityType === "session") {
      const params = { limit: 200 };
      if (scope === "dossier" && context?.dossierId) params.dossierId = context.dossierId;
      if (scope === "lawsuit" && context?.lawsuitId) params.lawsuitId = context.lawsuitId;
      const { sessions } = await engine._callReadTool(
        "listSessions",
        params,
        policy,
      );
      return resolveSessionQuery(queryText, sessions || []);
    }
    return { kind: "none" };
  };

  return {
    formatDate,
    formatDateTime,
    parsePayload,
    getHintValue,
    cleanQueryText,
    extractEntityQueryFromMessage,
    isExplicitListRequest,
    getEntityQuery,
    resolveEntityQuery,
  };
}

module.exports = {
  buildReadHelpers,
};
