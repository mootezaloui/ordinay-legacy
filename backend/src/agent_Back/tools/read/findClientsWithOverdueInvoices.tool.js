"use strict";

/**
 * READ TOOL: findClientsWithOverdueInvoices
 *
 * Finds clients with overdue receivable entries and aggregates totals.
 */

const clientsService = require("../../../services/clients.service");
const { TOOL_CATEGORIES } = require("../tool.registry");

const inputSchema = {
  type: "object",
  properties: {
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
      default: 5,
      description: "Maximum number of clients to return",
    },
    clientId: {
      type: ["integer", "null"],
      minimum: 1,
      description: "Optional client ID to scope results",
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: "object",
  properties: {
    clients: {
      type: "array",
      items: { type: "object" },
      description: "Aggregated overdue client rows",
    },
    count: {
      type: "integer",
      description: "Number of clients returned",
    },
  },
  required: ["clients", "count"],
  additionalProperties: false,
};

async function handler({ limit = 5, clientId = null } = {}) {
  const rows = clientsService.findClientsWithOverdueInvoices(limit, {
    clientId,
  });
  return {
    clients: rows,
    count: rows.length,
  };
}

module.exports = {
  name: "findClientsWithOverdueInvoices",
  category: TOOL_CATEGORIES.READ,
  description: "Find clients with overdue receivable invoices",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v1", "v2", "v3"],
  handler,
};
