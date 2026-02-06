"use strict";

const { DATA_REQUIREMENTS } = require("../intent.classifier");

async function _resolveEntity(hint, policy) {
  const { type, nameHint, reference } = hint;

  const resolveFromList = async ({
    toolName,
    listKey,
    query,
    label,
    nameField,
  }) => {
    const result = await this._callReadTool(
      toolName,
      { query, limit: 10 },
      policy,
    );
    const items = result?.[listKey] || [];
    if (items.length === 0) {
      return {
        resolved: false,
        reason: "not_found",
        message: `No ${label} found matching "${query}"`,
      };
    }
    if (items.length === 1) {
      return { resolved: true, entity: items[0], type };
    }
    return {
      resolved: false,
      reason: "ambiguous",
      message: `Multiple ${label}s match "${query}".`,
      candidates: items.map((item) => ({
        id: item.id,
        name: item[nameField] || item.reference || item.title || item.name,
      })),
    };
  };

  // Resolution by dossier reference (exact match)
  if (type === "dossier" && reference) {
    try {
      const result = await this._callReadTool(
        "getDossierByReference",
        { reference },
        policy,
      );
      if (result && result.dossier) {
        return { resolved: true, entity: result.dossier, type: "dossier" };
      }
      return {
        resolved: false,
        reason: "not_found",
        message: `No dossier found with reference ${reference}`,
      };
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "dossier" && nameHint) {
    try {
      return await resolveFromList({
        toolName: "listDossiers",
        listKey: "dossiers",
        query: nameHint,
        label: "dossier",
        nameField: "title",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  // Resolution by client name (fuzzy match)
  if (type === "client" && nameHint) {
    try {
      const result = await this._callReadTool(
        "searchClientsByName",
        { nameHint },
        policy,
      );
      if (!result || !result.clients || result.clients.length === 0) {
        return {
          resolved: false,
          reason: "not_found",
          message: `No client found matching "${nameHint}"`,
        };
      }
      if (result.clients.length === 1) {
        return { resolved: true, entity: result.clients[0], type: "client" };
      }
      // Multiple matches - ambiguous
      return {
        resolved: false,
        reason: "ambiguous",
        message: `Multiple clients match "${nameHint}".`,
        candidates: result.clients.map((c) => ({ id: c.id, name: c.name })),
      };
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "lawsuit" && (reference || nameHint)) {
    try {
      return await resolveFromList({
        toolName: "listLawsuits",
        listKey: "lawsuits",
        query: reference || nameHint,
        label: "lawsuit",
        nameField: "title",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "mission" && (reference || nameHint)) {
    try {
      return await resolveFromList({
        toolName: "listMissions",
        listKey: "missions",
        query: reference || nameHint,
        label: "mission",
        nameField: "title",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "task" && nameHint) {
    try {
      return await resolveFromList({
        toolName: "listTasks",
        listKey: "tasks",
        query: nameHint,
        label: "task",
        nameField: "title",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "personal_task" && nameHint) {
    try {
      return await resolveFromList({
        toolName: "listPersonalTasks",
        listKey: "personalTasks",
        query: nameHint,
        label: "personal task",
        nameField: "title",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "session" && nameHint) {
    try {
      return await resolveFromList({
        toolName: "listSessions",
        listKey: "sessions",
        query: nameHint,
        label: "session",
        nameField: "title",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "financial_entry" && (reference || nameHint)) {
    try {
      return await resolveFromList({
        toolName: "listFinancialEntries",
        listKey: "financialEntries",
        query: reference || nameHint,
        label: "financial entry",
        nameField: "title",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "notification" && nameHint) {
    try {
      return await resolveFromList({
        toolName: "listNotifications",
        listKey: "notifications",
        query: nameHint,
        label: "notification",
        nameField: "template_key",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  if (type === "history_event" && nameHint) {
    try {
      return await resolveFromList({
        toolName: "listHistoryEvents",
        listKey: "historyEvents",
        query: nameHint,
        label: "history event",
        nameField: "action",
      });
    } catch (err) {
      return { resolved: false, reason: "error", message: err.message };
    }
  }

  return {
    resolved: false,
    reason: "unsupported",
    message: `Cannot resolve entity type: ${type}`,
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
  _resolveEntity,
  _callReadTool,
  _builtinEntityLookup,
  _fetchRequiredData,
  _buildEnrichedContext,
};
