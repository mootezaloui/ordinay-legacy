'use strict';

/**
 * READ TOOL: listFinancialEntries
 *
 * List accounting/financial entries with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const financialService = require('../../../services/financial.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on entry title or reference',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by entry status',
    },
    direction: {
      type: ['string', 'null'],
      description: 'Filter by entry direction (receivable/payable)',
    },
    scope: {
      type: ['string', 'null'],
      description: 'Filter by entry scope',
    },
    paymentStatus: {
      type: ['string', 'null'],
      enum: ['paid', 'unpaid', 'overdue', null],
      description: 'Filter by payment status',
    },
    clientId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by client ID',
    },
    dossierId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by dossier ID',
    },
    lawsuitId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by lawsuit ID',
    },
    missionId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by mission ID',
    },
    taskId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by task ID',
    },
    personalTaskId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by personal task ID',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of entries to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    financialEntries: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of financial entry records',
    },
    count: {
      type: 'integer',
      description: 'Number of entries returned',
    },
  },
  required: ['financialEntries', 'count'],
  additionalProperties: false,
};

function isOverdue(entry, now) {
  if (!entry || entry.paid_at) return false;
  if (!entry.due_date) return false;
  return new Date(entry.due_date) < now;
}

async function handler({
  query = null,
  status = null,
  direction = null,
  scope = null,
  paymentStatus = null,
  clientId = null,
  dossierId = null,
  lawsuitId = null,
  missionId = null,
  taskId = null,
  personalTaskId = null,
  limit = 50,
} = {}) {
  let entries = financialService.list(false);

  if (clientId !== null) {
    entries = entries.filter(entry => entry.client_id === clientId);
  }
  if (dossierId !== null) {
    entries = entries.filter(entry => entry.dossier_id === dossierId);
  }
  if (lawsuitId !== null) {
    entries = entries.filter(entry => entry.lawsuit_id === lawsuitId);
  }
  if (missionId !== null) {
    entries = entries.filter(entry => entry.mission_id === missionId);
  }
  if (taskId !== null) {
    entries = entries.filter(entry => entry.task_id === taskId);
  }
  if (personalTaskId !== null) {
    entries = entries.filter(entry => entry.personal_task_id === personalTaskId);
  }

  if (status) {
    const normalized = String(status).toLowerCase();
    entries = entries.filter(entry => String(entry.status || '').toLowerCase() === normalized);
  }

  if (direction) {
    const normalized = String(direction).toLowerCase();
    entries = entries.filter(entry => String(entry.direction || '').toLowerCase() === normalized);
  }

  if (scope) {
    const normalized = String(scope).toLowerCase();
    entries = entries.filter(entry => String(entry.scope || '').toLowerCase() === normalized);
  }

  if (paymentStatus) {
    const now = new Date();
    if (paymentStatus === 'paid') {
      entries = entries.filter(entry => !!entry.paid_at);
    } else if (paymentStatus === 'unpaid') {
      entries = entries.filter(entry => !entry.paid_at);
    } else if (paymentStatus === 'overdue') {
      entries = entries.filter(entry => isOverdue(entry, now));
    }
  }

  if (query) {
    const q = String(query).toLowerCase();
    entries = entries.filter(entry => {
      const haystack = [entry.title, entry.reference, entry.entry_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  entries = entries.sort((a, b) => {
    const aDate = new Date(a.occurred_at || a.created_at || 0).getTime();
    const bDate = new Date(b.occurred_at || b.created_at || 0).getTime();
    return bDate - aDate;
  });

  const limited = entries.slice(0, limit);

  return {
    financialEntries: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listFinancialEntries',
  category: TOOL_CATEGORIES.READ,
  description: 'List accounting/financial entries with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
