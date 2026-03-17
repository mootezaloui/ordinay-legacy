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
    clientId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by client ID. Get this from listClients results.' },
    dossierId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by dossier ID. Get this from listDossiers results.' },
    lawsuitId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by lawsuit ID.' },
    missionId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by mission ID.' },
    taskId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by task ID.' },
    sessionId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by session ID.' },
    personalTaskId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by personal task ID.' },
    financialEntryId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by financial entry ID.' },
    officerId: { type: ['integer', 'null'], minimum: 1, description: 'Filter by officer ID.' },
    query: { type: ['string', 'null'], description: 'Text search on document title, filename, or notes only. Does NOT search by client or dossier name.' },
    textStatus: {
      type: ['string', 'null'],
      enum: ['readable', 'unreadable', 'processing', null],
      description: 'Filter by document text availability status.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of documents to return.',
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
    .map(({ document_text, artifact_json, ...doc }) => ({
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
    'List document metadata. To find documents for a specific client, first use listClients to get the client ID, then pass it as clientId here. The query parameter searches document titles and filenames only, not client names.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};

