'use strict';

/**
 * READ TOOL: listDocuments
 *
 * List document metadata with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const documentsService = require('../../../services/documents.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    clientId: { type: ['integer', 'null'], minimum: 1 },
    dossierId: { type: ['integer', 'null'], minimum: 1 },
    lawsuitId: { type: ['integer', 'null'], minimum: 1 },
    missionId: { type: ['integer', 'null'], minimum: 1 },
    taskId: { type: ['integer', 'null'], minimum: 1 },
    sessionId: { type: ['integer', 'null'], minimum: 1 },
    personalTaskId: { type: ['integer', 'null'], minimum: 1 },
    financialEntryId: { type: ['integer', 'null'], minimum: 1 },
    officerId: { type: ['integer', 'null'], minimum: 1 },
    query: { type: ['string', 'null'] },
    textStatus: {
      type: ['string', 'null'],
      enum: ['readable', 'unreadable', 'processing', null],
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    documents: {
      type: 'array',
      items: { type: 'object' },
    },
    count: {
      type: 'integer',
      minimum: 0,
    },
  },
  required: ['documents', 'count'],
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

async function handler({
  clientId = null,
  dossierId = null,
  lawsuitId = null,
  missionId = null,
  taskId = null,
  sessionId = null,
  personalTaskId = null,
  financialEntryId = null,
  officerId = null,
  query = null,
  textStatus = null,
  limit = 50,
}) {
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

  const documents = documentsService
    .listFiltered({
      ...filters,
      query,
      textStatus,
      limit,
    })
    .map((doc) => ({
      ...doc,
      id: Number(doc.document_id || doc.id),
    }));

  return {
    documents,
    count: documents.length,
  };
}

module.exports = {
  name: 'listDocuments',
  category: TOOL_CATEGORIES.READ,
  description:
    'List document metadata with optional scoped filters plus text-status/query filtering.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};

