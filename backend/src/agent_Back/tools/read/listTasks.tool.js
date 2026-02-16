'use strict';

/**
 * READ TOOL: listTasks
 *
 * List tasks with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const tasksService = require('../../../services/tasks.service');
const dossiersService = require('../../../services/dossiers.service');
const lawsuitsService = require('../../../services/lawsuits.service');
const clientsService = require('../../../services/clients.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
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
    status: {
      type: ['string', 'null'],
      enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled', null],
      description: 'Filter by task status',
    },
    priority: {
      type: ['string', 'null'],
      enum: ['urgent', 'high', 'medium', 'low', null],
      description: 'Filter by priority',
    },
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on task title',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 50,
      description: 'Maximum number of tasks to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of task records',
    },
    count: {
      type: 'integer',
      description: 'Number of tasks returned',
    },
  },
  required: ['tasks', 'count'],
  additionalProperties: false,
};

async function handler({
  dossierId = null,
  lawsuitId = null,
  status = null,
  priority = null,
  query = null,
  limit = 50,
}) {
  let tasks = tasksService.list();
  const dossiers = dossiersService.list();
  const lawsuits = lawsuitsService.list();
  const clients = clientsService.list();

  const dossiersById = new Map(
    dossiers.map((dossier) => [Number(dossier.id), dossier]),
  );
  const lawsuitsById = new Map(
    lawsuits.map((lawsuit) => [Number(lawsuit.id), lawsuit]),
  );
  const clientsById = new Map(
    clients.map((client) => [Number(client.id), client]),
  );

  if (dossierId !== null) {
    tasks = tasks.filter(task => task.dossier_id === dossierId);
  }

  if (lawsuitId !== null) {
    tasks = tasks.filter(task => task.lawsuit_id === lawsuitId);
  }

  if (status !== null) {
    tasks = tasks.filter(task => task.status === status);
  }

  if (priority !== null) {
    tasks = tasks.filter(task => task.priority === priority);
  }

  if (query) {
    const q = String(query).toLowerCase();
    tasks = tasks.filter(task => String(task.title || '').toLowerCase().includes(q));
  }

  tasks = tasks.sort((a, b) => {
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    const priorityA = priorityOrder[String(a.priority || '').toLowerCase()] || 0;
    const priorityB = priorityOrder[String(b.priority || '').toLowerCase()] || 0;
    if (priorityA !== priorityB) return priorityB - priorityA;
    const dueA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    return dueA - dueB;
  });

  const limited = tasks.slice(0, limit);
  const enriched = limited.map((task) => {
    const dossierId = Number(task.dossier_id || 0);
    const lawsuitId = Number(task.lawsuit_id || 0);
    const linkedDossier = dossierId > 0 ? dossiersById.get(dossierId) || null : null;
    const linkedLawsuit = lawsuitId > 0 ? lawsuitsById.get(lawsuitId) || null : null;
    const lawsuitDossierId = Number(linkedLawsuit?.dossier_id || 0);
    const inferredDossier =
      linkedDossier ||
      (lawsuitDossierId > 0 ? dossiersById.get(lawsuitDossierId) || null : null);
    const linkedClient = inferredDossier?.client_id
      ? clientsById.get(Number(inferredDossier.client_id)) || null
      : null;

    return {
      ...task,
      linked_dossier: inferredDossier
        ? {
            id: Number(inferredDossier.id),
            reference: inferredDossier.reference || null,
            title: inferredDossier.title || null,
            client_name: linkedClient?.name || null,
            label:
              inferredDossier.reference || inferredDossier.title
                ? [inferredDossier.reference, inferredDossier.title]
                    .filter(Boolean)
                    .join(' - ')
                : `Dossier #${Number(inferredDossier.id)}`,
          }
        : null,
      linked_lawsuit: linkedLawsuit
        ? {
            id: Number(linkedLawsuit.id),
            reference: linkedLawsuit.reference || null,
            lawsuit_number: linkedLawsuit.lawsuit_number || null,
            title: linkedLawsuit.title || null,
            label:
              linkedLawsuit.reference ||
              linkedLawsuit.lawsuit_number ||
              linkedLawsuit.title
                ? [
                    linkedLawsuit.reference || linkedLawsuit.lawsuit_number,
                    linkedLawsuit.title,
                  ]
                    .filter(Boolean)
                    .join(' - ')
                : `Lawsuit #${Number(linkedLawsuit.id)}`,
          }
        : null,
    };
  });

  return {
    tasks: enriched,
    count: enriched.length,
  };
}

module.exports = {
  name: 'listTasks',
  category: TOOL_CATEGORIES.READ,
  description: 'List tasks with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};



