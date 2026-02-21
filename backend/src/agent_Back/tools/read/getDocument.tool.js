'use strict';

/**
 * READ TOOL: getDocument
 *
 * Retrieve a single document by ID or scoped reference.
 * Read-only, no side effects, safe for all agent versions.
 */

const documentsService = require('../../../services/documents.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    documentId: {
      type: ['integer', 'null'],
      minimum: 1,
    },
    query: {
      type: ['string', 'null'],
    },
    clientId: { type: ['integer', 'null'], minimum: 1 },
    dossierId: { type: ['integer', 'null'], minimum: 1 },
    lawsuitId: { type: ['integer', 'null'], minimum: 1 },
    missionId: { type: ['integer', 'null'], minimum: 1 },
    taskId: { type: ['integer', 'null'], minimum: 1 },
    sessionId: { type: ['integer', 'null'], minimum: 1 },
    personalTaskId: { type: ['integer', 'null'], minimum: 1 },
    financialEntryId: { type: ['integer', 'null'], minimum: 1 },
    officerId: { type: ['integer', 'null'], minimum: 1 },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    document: {
      type: ['object', 'null'],
    },
  },
  required: ['document'],
  additionalProperties: false,
};

function buildFilters(input) {
  const filters = {};
  if (input.clientId) filters.client_id = Number(input.clientId);
  if (input.dossierId) filters.dossier_id = Number(input.dossierId);
  if (input.lawsuitId) filters.lawsuit_id = Number(input.lawsuitId);
  if (input.missionId) filters.mission_id = Number(input.missionId);
  if (input.taskId) filters.task_id = Number(input.taskId);
  if (input.sessionId) filters.session_id = Number(input.sessionId);
  if (input.personalTaskId) filters.personal_task_id = Number(input.personalTaskId);
  if (input.financialEntryId) filters.financial_entry_id = Number(input.financialEntryId);
  if (input.officerId) filters.officer_id = Number(input.officerId);
  return filters;
}

function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

async function handler({
  documentId = null,
  query = null,
  clientId = null,
  dossierId = null,
  lawsuitId = null,
  missionId = null,
  taskId = null,
  sessionId = null,
  personalTaskId = null,
  financialEntryId = null,
  officerId = null,
}) {
  if (!documentId && !normalize(query)) {
    throw new Error("Either documentId or query is required");
  }

  if (documentId) {
    const row = documentsService.get(Number(documentId));
    return { document: row ? { ...row, id: Number(row.document_id || row.id) } : null };
  }

  const filters = buildFilters({
    clientId,
    dossierId,
    lawsuitId,
    missionId,
    taskId,
    sessionId,
    personalTaskId,
    financialEntryId,
    officerId,
  });

  const q = normalize(query);
  if (!q) return { document: null };

  const candidates = documentsService.list(filters);
  const matched = candidates.find((doc) => {
    const haystack = [doc.title, doc.original_filename, doc.notes]
      .map(normalize)
      .join(' ');
    return haystack.includes(q);
  });

  return {
    document: matched
      ? { ...matched, id: Number(matched.document_id || matched.id) }
      : null,
  };
}

module.exports = {
  name: 'getDocument',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single document by ID or scoped query',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
