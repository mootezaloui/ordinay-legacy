'use strict';

/**
 * READ TOOL: listDossiers
 *
 * List dossiers with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const dossiersService = require('../../../services/dossiers.service');
const clientsService = require('../../../services/clients.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on dossier reference or title',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by dossier status',
    },
    clientId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by client ID',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of dossiers to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossiers: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of dossier records',
    },
    count: {
      type: 'integer',
      description: 'Number of dossiers returned',
    },
  },
  required: ['dossiers', 'count'],
  additionalProperties: false,
};

async function handler({ query = null, status = null, clientId = null, limit = 50 } = {}) {
  let dossiers = dossiersService.list();
  const clientNameById = new Map(
    clientsService
      .list()
      .map((client) => [Number(client.id), String(client.name || "").trim()]),
  );

  if (clientId !== null) {
    dossiers = dossiers.filter(dossier => dossier.client_id === clientId);
  }

  if (status) {
    const normalized = String(status).toLowerCase();
    dossiers = dossiers.filter(dossier => String(dossier.status || '').toLowerCase() === normalized);
  }

  if (query) {
    const q = String(query).toLowerCase();
    dossiers = dossiers.filter(dossier => {
      const haystack = [dossier.reference, dossier.title].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  dossiers = dossiers.sort((a, b) => {
    const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime();
    const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime();
    return bUpdated - aUpdated;
  });

  const limited = dossiers.slice(0, limit).map((dossier) => {
    const resolvedClientName =
      String(
        dossier.client_name ||
          dossier.clientName ||
          clientNameById.get(Number(dossier.client_id)) ||
          "",
      ).trim() || null;
    if (!resolvedClientName) return dossier;
    return {
      ...dossier,
      client_name: resolvedClientName,
      clientName: resolvedClientName,
    };
  });

  return {
    dossiers: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listDossiers',
  category: TOOL_CATEGORIES.READ,
  description: 'List dossiers with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
