"use strict";

const { DATA_REQUIREMENTS } = require("../intent.classifier");

const ENTITY_RESOLUTION_CONFIG = Object.freeze({
  client: {
    label: "client",
    listTool: "listClients",
    listKey: "clients",
    idTool: "getClient",
    idParam: "clientId",
    idResultKey: "client",
    labelFields: ["name", "email", "company"],
  },
  dossier: {
    label: "dossier",
    listTool: "listDossiers",
    listKey: "dossiers",
    idTool: "getDossier",
    idParam: "dossierId",
    idResultKey: "dossier",
    labelFields: ["reference", "title", "description", "phase"],
    referenceTool: "getDossierByReference",
    referenceParam: "reference",
    referenceResultKey: "dossier",
  },
  session: {
    label: "session",
    listTool: "listSessions",
    listKey: "sessions",
    idTool: "getSession",
    idParam: "sessionId",
    idResultKey: "session",
    labelFields: ["title", "session_type", "location"],
  },
  lawsuit: {
    label: "lawsuit",
    listTool: "listLawsuits",
    listKey: "lawsuits",
    idTool: "getLawsuit",
    idParam: "lawsuitId",
    idResultKey: "lawsuit",
    labelFields: ["title", "case_number", "description"],
  },
  task: {
    label: "task",
    listTool: "listTasks",
    listKey: "tasks",
    idTool: "getTask",
    idParam: "taskId",
    idResultKey: "task",
    labelFields: ["title", "description", "status"],
  },
  personal_task: {
    label: "personal task",
    listTool: "listPersonalTasks",
    listKey: "personalTasks",
    idTool: "getPersonalTask",
    idParam: "personalTaskId",
    idResultKey: "personalTask",
    labelFields: ["title", "description", "status"],
  },
  mission: {
    label: "mission",
    listTool: "listMissions",
    listKey: "missions",
    idTool: "getMission",
    idParam: "missionId",
    idResultKey: "mission",
    labelFields: ["title", "description", "status"],
  },
  financial_entry: {
    label: "financial entry",
    listTool: "listFinancialEntries",
    listKey: "financialEntries",
    idTool: "getFinancialEntry",
    idParam: "financialEntryId",
    idResultKey: "financialEntry",
    labelFields: ["title", "reference", "entry_type"],
  },
  notification: {
    label: "notification",
    listTool: "listNotifications",
    listKey: "notifications",
    idTool: "getNotification",
    idParam: "notificationId",
    idResultKey: "notification",
    labelFields: ["template_key", "title", "description"],
  },
  history_event: {
    label: "history event",
    listTool: "listHistoryEvents",
    listKey: "historyEvents",
    idTool: "getHistoryEvent",
    idParam: "historyEventId",
    idResultKey: "historyEvent",
    labelFields: ["action", "description", "entity_type"],
  },
});

function normalizeEntityType(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const map = {
    case: "lawsuit",
    lawsuit: "lawsuit",
    client: "client",
    dossier: "dossier",
    session: "session",
    hearing: "session",
    task: "task",
    personal_task: "personal_task",
    personaltask: "personal_task",
    "personal task": "personal_task",
    mission: "mission",
    financial_entry: "financial_entry",
    financialentry: "financial_entry",
    "financial entry": "financial_entry",
    notification: "notification",
    history_event: "history_event",
    historyevent: "history_event",
    "history event": "history_event",
  };
  return map[normalized] || normalized;
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/\u06C0/g, "\u0647")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(value) {
  return normalizeForMatch(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 || /^[\u0600-\u06FF]$/u.test(token));
}

function similarityScore(query, candidateText) {
  const q = normalizeForMatch(query);
  const c = normalizeForMatch(candidateText);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q)) return 0.93;
  if (q.includes(c)) return 0.88;

  const qTokens = tokenize(q);
  const cTokens = tokenize(c);
  if (!qTokens.length || !cTokens.length) return 0;

  const cSet = new Set(cTokens);
  let overlap = 0;
  for (const token of qTokens) {
    if (cSet.has(token)) overlap += 1;
  }
  const ratio = overlap / qTokens.length;
  if (ratio === 1) return 0.9;
  return ratio;
}

function candidateLabel(entity, entityType) {
  if (!entity || typeof entity !== "object") return `${entityType} (unknown)`;
  return (
    entity.name ||
    entity.title ||
    entity.reference ||
    entity.email ||
    `${entityType} #${entity.id}`
  );
}

function buildCandidateText(entity, labelFields = []) {
  const fields = [
    ...labelFields.map((field) => entity?.[field]),
    entity?.name,
    entity?.title,
    entity?.reference,
    entity?.description,
  ];
  return fields.filter(Boolean).join(" ");
}

async function resolveEntity(
  { entityType, identifier, mode = "name", scopeClientId = null },
  policy,
) {
  const normalizedType = normalizeEntityType(entityType);
  const cfg = ENTITY_RESOLUTION_CONFIG[normalizedType];
  const rawIdentifier = String(identifier ?? "").trim();
  if (!normalizedType || !cfg || !rawIdentifier) {
    return {
      found: false,
      reason: "unsupported",
      message: `Cannot resolve entity type: ${entityType || "unknown"}`,
    };
  }

  if (mode === "id") {
    const numericId = Number(rawIdentifier);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return {
        found: false,
        reason: "not_found",
        message: `No ${cfg.label} found with id ${rawIdentifier}`,
      };
    }
    try {
      const response = await this._callReadTool(
        cfg.idTool,
        { [cfg.idParam]: numericId },
        policy,
      );
      const entity = response?.[cfg.idResultKey] || null;
      if (!entity) {
        return {
          found: false,
          reason: "not_found",
          message: `No ${cfg.label} found with id ${rawIdentifier}`,
        };
      }
      return {
        found: true,
        entityType: normalizedType,
        entity,
        entityId: entity.id,
        entityLabel: candidateLabel(entity, normalizedType),
      };
    } catch (err) {
      return { found: false, reason: "error", message: err.message };
    }
  }

  if (normalizedType === "dossier" && cfg.referenceTool) {
    try {
      const byRef = await this._callReadTool(
        cfg.referenceTool,
        { [cfg.referenceParam]: rawIdentifier },
        policy,
      );
      const refEntity = byRef?.[cfg.referenceResultKey] || null;
      if (refEntity) {
        return {
          found: true,
          entityType: normalizedType,
          entity: refEntity,
          entityId: refEntity.id,
          entityLabel: candidateLabel(refEntity, normalizedType),
        };
      }
    } catch {
      // Continue to name matching.
    }
  }

  let items = [];
  const scopedClientId = Number(scopeClientId);
  const dossierScopedToClient =
    normalizedType === "dossier" &&
    Number.isFinite(scopedClientId) &&
    scopedClientId > 0;
  try {
    const listParams = { query: rawIdentifier, limit: 20 };
    if (dossierScopedToClient) {
      listParams.clientId = scopedClientId;
    }
    const queried = await this._callReadTool(
      cfg.listTool,
      listParams,
      policy,
    );
    items = Array.isArray(queried?.[cfg.listKey]) ? queried[cfg.listKey] : [];
  } catch {
    items = [];
  }

  if (!items.length) {
    try {
      const fallbackParams = { limit: 200 };
      if (dossierScopedToClient) {
        fallbackParams.clientId = scopedClientId;
      }
      const fallback = await this._callReadTool(
        cfg.listTool,
        fallbackParams,
        policy,
      );
      items = Array.isArray(fallback?.[cfg.listKey]) ? fallback[cfg.listKey] : [];
    } catch {
      items = [];
    }
  }

  if (!items.length) {
    return {
      found: false,
      reason: "not_found",
      message: `No ${cfg.label} found matching "${rawIdentifier}"`,
    };
  }

  const ranked = items
    .map((entity) => {
      const text = buildCandidateText(entity, cfg.labelFields);
      const score = similarityScore(rawIdentifier, text);
      return { entity, score };
    })
    .filter((entry) => entry.score >= 0.75)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      found: false,
      reason: "not_found",
      message: `No ${cfg.label} found matching "${rawIdentifier}"`,
    };
  }

  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.08) {
    return {
      found: false,
      reason: "ambiguous",
      message: `Multiple ${cfg.label}s match "${rawIdentifier}".`,
      candidates: ranked.slice(0, 5).map((entry) => ({
        id: entry.entity.id,
        name: candidateLabel(entry.entity, normalizedType),
        score: entry.score,
      })),
    };
  }

  const winner = ranked[0].entity;
  return {
    found: true,
    entityType: normalizedType,
    entity: winner,
    entityId: winner.id,
    entityLabel: candidateLabel(winner, normalizedType),
  };
}

async function _resolveEntity(hint, policy) {
  const rawType = hint?.entityType || hint?.type;
  const normalizedType = normalizeEntityType(rawType);
  const typeToken = String(hint?.type || "").toLowerCase();
  const nameHint = hint?.nameHint || hint?.value || hint?.reference;
  const idHint = hint?.id || hint?.entityId || hint?.value;
  const mode = typeToken === "id" ? "id" : "name";
  const identifier = mode === "id" ? idHint : nameHint;

  const resolution = await this.resolveEntity(
    {
      entityType: normalizedType,
      identifier,
      mode,
    },
    policy,
  );

  if (resolution.found && resolution.entity) {
    return {
      resolved: true,
      entity: resolution.entity,
      type: resolution.entityType,
    };
  }
  if (resolution.reason === "ambiguous") {
    return {
      resolved: false,
      reason: "ambiguous",
      message: resolution.message,
      candidates: resolution.candidates || [],
    };
  }
  return {
    resolved: false,
    reason: resolution.reason || "not_found",
    message: resolution.message || `No ${normalizedType || "entity"} found`,
    candidates: resolution.candidates || [],
  };
}

/**
 * Call a READ tool safely (wrapper for data fetching)
 *
 * @param {string} toolName - Name of the READ tool
 * @param {Object} params - Tool parameters
 * @param {Object} policy - Current agent policy
 * @returns {Promise<Object>} Tool result
 * @private
 */

async function _callReadTool(toolName, params, policy) {
  // Check if tool exists and is permitted
  const tool = this.toolRegistry.get(toolName);
  if (!tool) {
    const error = new Error(`Tool ${toolName} not found in registry`);
    error.status = 404;
    throw error;
  }

  // Verify tool category is 'read' and policy allows it
  if (tool.category !== "read") {
    const error = new Error(`Tool ${toolName} is not a READ tool`);
    error.status = 403;
    throw error;
  }

  if (!policy.allowedToolCategories.includes("read")) {
    const error = new Error("READ tools not permitted for this agent version");
    error.status = 403;
    throw error;
  }

  // Execute through standard callTool path
  const result = await this.callTool(toolName, params, policy, {
    confirmed: true,
  });
  return result.result;
}

/**
 * Built-in entity lookup for entity resolution (does not require registered tools)
 * Safe, read-only, minimal queries for context resolution
 *
 * @param {string} lookupType - Type of lookup
 * @param {Object} params - Lookup parameters
 * @returns {Promise<Object>} Lookup result
 * @private
 */

async function _builtinEntityLookup(lookupType, params) {
  const error = new Error(
    `Direct entity lookup is disabled. Use READ tools instead (attempted: ${lookupType}).`,
  );
  error.status = 400;
  throw error;
}

/**
 * Fetch required data based on detected requirements and context
 *
 * @param {Object} dataReqs - Data requirements from detectDataRequirements
 * @param {Object} context - Current context (scope, refs)
 * @param {Object} policy - Current agent policy
 * @returns {Promise<Object>} Fetched data: { entities: {}, lists: {}, resolution: {} }
 * @private
 */

async function _fetchRequiredData(dataReqs, context, policy) {
  const result = {
    entities: {},
    lists: {},
    resolution: {
      resolved: [],
      failed: [],
    },
  };
  const documentMode = policy?.documentHandling?.mode
    ? String(policy.documentHandling.mode).toLowerCase()
    : policy?.version === "v1"
      ? "text"
      : "metadata";
  const shouldAttachDocuments =
    documentMode === "text" || documentMode === "analyzed";
  const documentPreviewLength = shouldAttachDocuments ? 0 : 0;

  // Step 1: Resolve entity hints (e.g., "Emma" → client ID)
  for (const hint of dataReqs.entityHints) {
    const resolution = await this._resolveEntity(hint, policy);
    if (resolution.resolved) {
      result.entities[resolution.type] = resolution.entity;
      result.resolution.resolved.push({
        hint,
        entity: resolution.entity,
      });
      // If client resolved and target is dossier, fetch client's dossiers
      if (resolution.type === "client" && hint.targetEntity === "dossier") {
        const dossiers = await this._callReadTool(
          "listDossiersForClient",
          {
            clientId: resolution.entity.id,
          },
          policy,
        );
        result.lists.dossiers = dossiers?.dossiers || [];
      }
    } else {
      result.resolution.failed.push({
        hint,
        reason: resolution.reason,
        message: resolution.message,
        candidates: resolution.candidates,
      });
    }
  }

  // Step 2: Fetch data based on explicit context refs
  if (context.clientId && !result.entities.client) {
    try {
      const clientResult = await this._callReadTool(
        "getClient",
        { clientId: context.clientId },
        policy,
      );
      if (clientResult?.client) {
        result.entities.client = clientResult.client;
        if (shouldAttachDocuments) {
          const docResult = this._loadDocumentMetadata(
            "client",
            result.entities.client.id,
            context,
            { previewLength: documentPreviewLength },
          );
          if (docResult.permitted) {
            result.entities.client.documents = docResult.documents;
          }
        }
      }
    } catch (err) {
      this.ledger.record({
        type: "data_fetch_error",
        tool: "getClient",
        error: err.message,
      });
    }
  }

  if (context.dossierId && !result.entities.dossier) {
    try {
      const dossierResult = await this._callReadTool(
        "getDossier",
        { dossierId: context.dossierId },
        policy,
      );
      if (dossierResult?.dossier) {
        result.entities.dossier = dossierResult.dossier;
        if (shouldAttachDocuments) {
          const docResult = this._loadDocumentMetadata(
            "dossier",
            result.entities.dossier.id,
            context,
            { previewLength: documentPreviewLength },
          );
          if (docResult.permitted) {
            result.entities.dossier.documents = docResult.documents;
          }
        }
      }
    } catch (err) {
      this.ledger.record({
        type: "data_fetch_error",
        tool: "getDossier",
        error: err.message,
      });
    }
  }

  // Step 3: Fetch lists based on detected needs
  if (dataReqs.needs.includes(DATA_REQUIREMENTS.OVERDUE_TASKS)) {
    try {
      const overdueResult = await this._callReadTool(
        "detectOverdueTasks",
        {
          dossierId: context.dossierId || null,
        },
        policy,
      );
      result.lists.overdueTasks = overdueResult?.overdueTasks || [];
      result.lists.overdueAnalysis = overdueResult?.analysis || {};
    } catch (err) {
      this.ledger.record({
        type: "data_fetch_error",
        tool: "detectOverdueTasks",
        error: err.message,
      });
    }
  }

  if (dataReqs.needs.includes(DATA_REQUIREMENTS.TASK)) {
    try {
      const tasksResult = await this._callReadTool(
        "listTasks",
        {
          dossierId: context.dossierId || null,
          limit: 20,
        },
        policy,
      );
      result.lists.tasks = tasksResult?.tasks || [];
    } catch (err) {
      this.ledger.record({
        type: "data_fetch_error",
        tool: "listTasks",
        error: err.message,
      });
    }
  }

  // Step 4: Fetch timeline if needed
  if (dataReqs.needs.includes(DATA_REQUIREMENTS.TIMELINE)) {
    try {
      const timelineParams = {};
      if (context.clientId) timelineParams.entityType = "client";
      if (context.dossierId) timelineParams.entityType = "dossier";
      if (context.clientId) timelineParams.entityId = context.clientId;
      if (context.dossierId) timelineParams.entityId = context.dossierId;

      if (timelineParams.entityType) {
        const timelineResult = await this._callReadTool(
          "getTimeline",
          timelineParams,
          policy,
        );
        result.lists.timeline = timelineResult?.events || [];
      }
    } catch (err) {
      this.ledger.record({
        type: "data_fetch_error",
        tool: "getTimeline",
        error: err.message,
      });
    }
  }

  return result;
}

/**
 * Build enriched context by merging original context with fetched data
 *
 * @param {Object} context - Original context
 * @param {Object} fetchedData - Data from _fetchRequiredData
 * @param {Object} dataReqs - Data requirements
 * @returns {Object} Enriched context for reasoner
 * @private
 */

function _buildEnrichedContext(context, fetchedData, dataReqs) {
  const enriched = { ...context };

  // Add fetched entities to context
  if (fetchedData.entities.client) {
    enriched.clientData = fetchedData.entities.client;
    enriched.entityId =
      enriched.entityId || String(fetchedData.entities.client.id);
    enriched.entityType = enriched.entityType || "client";
  }

  if (fetchedData.entities.dossier) {
    enriched.dossierData = fetchedData.entities.dossier;
    enriched.entityId =
      enriched.entityId || String(fetchedData.entities.dossier.id);
    enriched.entityType = enriched.entityType || "dossier";
    enriched.status = enriched.status || fetchedData.entities.dossier.status;
    enriched.lastUpdated =
      enriched.lastUpdated || fetchedData.entities.dossier.updated_at;
  }

  // Add fetched lists
  if (fetchedData.lists.tasks) {
    enriched.tasks = fetchedData.lists.tasks;
  }
  if (fetchedData.lists.overdueTasks) {
    enriched.overdueTasks = fetchedData.lists.overdueTasks;
    enriched.overdueAnalysis = fetchedData.lists.overdueAnalysis;
  }
  if (fetchedData.lists.dossiers) {
    enriched.dossiers = fetchedData.lists.dossiers;
  }
  if (fetchedData.lists.timeline) {
    enriched.timeline = fetchedData.lists.timeline;
  }

  if (
    Array.isArray(context.documentTextIds) &&
    context.documentTextIds.length > 0
  ) {
    const docResult = this._loadDocumentTexts(context.documentTextIds, context);
    if (docResult.permitted) {
      enriched.documentTexts = docResult.documents;
    } else {
      enriched.documentTexts = [];
      enriched.documentTextsAccessDenied = true;
      enriched.documentTextsAccessMessage = docResult.message;
    }
  }

  // Add resolution metadata
  enriched._dataResolution = {
    resolved: fetchedData.resolution.resolved.length,
    failed: fetchedData.resolution.failed.length,
    failedDetails: fetchedData.resolution.failed,
  };

  // Flag for reasoner to know data was fetched
  enriched._dataEnriched = true;
  enriched._dataRequirements = dataReqs;

  return enriched;
}

module.exports = {
  resolveEntity,
  _resolveEntity,
  _callReadTool,
  _builtinEntityLookup,
  _fetchRequiredData,
  _buildEnrichedContext,
};
