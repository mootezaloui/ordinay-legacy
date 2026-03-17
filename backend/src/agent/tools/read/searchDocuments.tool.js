'use strict';

/**
 * READ TOOL: searchDocuments
 *
 * Keyword search over document content via FTS5 chunks.
 * Read-only, no side effects, safe for all agent versions.
 */

const { searchChunks } = require('../../../services/documentExtraction.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search keywords to find in document content.' },
    clientId: { type: ['integer', 'null'], minimum: 1, description: 'Filter results to documents belonging to this client ID.' },
    dossierId: { type: ['integer', 'null'], minimum: 1, description: 'Filter results to documents belonging to this dossier ID.' },
    lawsuitId: { type: ['integer', 'null'], minimum: 1, description: 'Filter results to documents belonging to this lawsuit ID.' },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 10,
      description: 'Maximum number of matching chunks to return.',
    },
  },
  required: ['query'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: { type: 'object' },
    },
    count: {
      type: 'integer',
      minimum: 0,
    },
  },
  required: ['results', 'count'],
  additionalProperties: false,
};

async function handler({
  query = '',
  clientId = null,
  dossierId = null,
  lawsuitId = null,
  limit = 10,
}) {
  const results = searchChunks({
    query,
    clientId: clientId ? Number(clientId) : undefined,
    dossierId: dossierId ? Number(dossierId) : undefined,
    lawsuitId: lawsuitId ? Number(lawsuitId) : undefined,
    limit,
  });

  return {
    results: results.map((row) => ({
      document_id: row.document_id,
      file_name: row.file_name || row.original_filename,
      mime_type: row.mime_type,
      chunk_id: row.chunk_id,
      chunk_order: row.chunk_order,
      page_start: row.page_start,
      page_end: row.page_end,
      sheet_name: row.sheet_name,
      snippet: row.chunk_text,
    })),
    count: results.length,
  };
}

module.exports = {
  name: 'searchDocuments',
  category: TOOL_CATEGORIES.READ,
  description:
    'Search document contents by keyword. Returns matching text chunks with document references. Use this to find specific information inside documents when you know what text to look for. For listing documents by metadata, use listDocuments instead.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
