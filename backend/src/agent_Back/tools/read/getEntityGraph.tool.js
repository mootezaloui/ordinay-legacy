"use strict";

/**
 * READ TOOL: getEntityGraph
 *
 * Deterministic graph snapshot for core legal entities using explicit FK links.
 * Read-only, no side effects, safe for all agent versions.
 */

const clientsService = require("../../../services/clients.service");
const dossiersService = require("../../../services/dossiers.service");
const lawsuitsService = require("../../../services/lawsuits.service");
const tasksService = require("../../../services/tasks.service");
const missionsService = require("../../../services/missions.service");
const sessionsService = require("../../../services/sessions.service");
const documentsService = require("../../../services/documents.service");
const { TOOL_CATEGORIES } = require("../tool.registry");
const inputSchema = require("../../schemas/getEntityGraph.input.schema.json");
const outputSchema = require("../../schemas/getEntityGraph.output.schema.json");

const CHILD_CATEGORIES = Object.freeze([
  "dossiers",
  "lawsuits",
  "tasks",
  "missions",
  "sessions",
  "documents",
]);

const CATEGORY_TO_DOMAIN = Object.freeze({
  dossiers: "dossiers",
  lawsuits: "lawsuits",
  tasks: "tasks",
  missions: "missions",
  sessions: "sessions",
  documents: "documents",
});

const CLOSED_STATUSES = Object.freeze({
  client: ["inactive", "inActive"],
  dossier: ["closed", "archived", "cancelled"],
  lawsuit: ["closed", "archived", "cancelled"],
  task: ["done", "completed", "cancelled", "closed"],
  mission: ["completed", "cancelled", "closed"],
  session: ["completed", "cancelled", "closed"],
  document: [],
});

function toIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeStatus(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function isClosedByStatus(entityType, status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
  const closed = CLOSED_STATUSES[entityType] || [];
  return closed.map((value) => String(value).toLowerCase()).includes(normalized);
}

function resolveUpcomingDate(type, row) {
  if (!row || typeof row !== "object") return null;
  // "nextUpcoming" is used for overdue/upcoming risk metrics, so it must only
  // contain actionable future-oriented dates (not historical timestamps).
  if (type === "dossier") return toIso(row.next_deadline);
  if (type === "lawsuit") return toIso(row.next_hearing);
  if (type === "task") return toIso(row.due_date);
  if (type === "mission") return toIso(row.due_date);
  if (type === "session") return toIso(row.scheduled_at || row.session_date);
  if (type === "document") return null;
  if (type === "client") return null;
  return null;
}

function toGraphNode(type, row, nowMs) {
  const status = normalizeStatus(row?.status);
  const nextUpcoming = resolveUpcomingDate(type, row);
  const nextMs = nextUpcoming ? new Date(nextUpcoming).getTime() : null;
  const isClosed = isClosedByStatus(type, status);
  const priority = row?.priority ? String(row.priority) : null;

  return {
    type,
    id: Number(row.id),
    name: type === "client" ? String(row.name || "") || null : null,
    title: type === "client" ? null : String(row.title || row.reference || "") || null,
    status,
    priority,
    keyDates: {
      nextUpcoming,
      createdAt: toIso(row.created_at || row.opened_at || row.assign_date || row.scheduled_at),
      updatedAt: toIso(row.updated_at || row.created_at || row.opened_at),
    },
    flags: {
      isUrgent:
        String(priority || "")
          .trim()
          .toLowerCase() === "urgent" ||
        String(priority || "")
          .trim()
          .toLowerCase() === "high",
      isOverdue: Boolean(nextMs && nextMs < nowMs && !isClosed),
    },
  };
}

function createEntityNotFoundError(entityType, entityId) {
  const error = new Error(`Entity ${entityType}#${entityId} not found`);
  error.type = "entity_not_found";
  error.entityType = entityType;
  error.entityId = entityId;
  error.payload = {
    type: "entity_not_found",
    entityType,
    entityId,
  };
  return error;
}

function buildCategoryAllowance({
  include,
  accessFilter = null,
  contextDataAccess = null,
}) {
  const includeSet = Array.isArray(include) ? new Set(include) : null;
  const allowed = {};

  for (const category of CHILD_CATEGORIES) {
    let isAllowed = true;

    if (includeSet && !includeSet.has(category)) {
      isAllowed = false;
    }

    if (accessFilter && typeof accessFilter[category] === "boolean") {
      isAllowed = isAllowed && accessFilter[category];
    }

    const domain = CATEGORY_TO_DOMAIN[category];
    if (
      contextDataAccess &&
      typeof contextDataAccess === "object" &&
      contextDataAccess[domain] === false
    ) {
      isAllowed = false;
    }

    allowed[category] = isAllowed;
  }

  return allowed;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
}

function addNode(categoryMap, category, node) {
  if (!categoryMap[category]) {
    categoryMap[category] = new Map();
  }
  categoryMap[category].set(node.id, node);
}

function flattenChildren(categoryMap, categoryAllowance) {
  const output = {};
  for (const category of CHILD_CATEGORIES) {
    if (!categoryAllowance[category]) continue;
    const map = categoryMap[category];
    output[category] = map ? [...map.values()] : [];
  }
  return output;
}

function collectMetrics(children) {
  const allNodes = Object.values(children || {}).flat();
  const now = new Date();
  const nowMs = now.getTime();
  const in7DaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;
  const in30DaysMs = nowMs + 30 * 24 * 60 * 60 * 1000;

  let overdueDeadlines = 0;
  let upcomingWithin7Days = 0;
  let upcomingWithin30Days = 0;

  for (const node of allNodes) {
    const next = node?.keyDates?.nextUpcoming;
    if (!next) continue;
    const nextMs = new Date(next).getTime();
    if (Number.isNaN(nextMs)) continue;

    if (node?.flags?.isOverdue) {
      overdueDeadlines += 1;
      continue;
    }
    if (nextMs >= nowMs && nextMs <= in7DaysMs) {
      upcomingWithin7Days += 1;
    }
    if (nextMs >= nowMs && nextMs <= in30DaysMs) {
      upcomingWithin30Days += 1;
    }
  }

  return {
    totalDossiers: Array.isArray(children?.dossiers) ? children.dossiers.length : 0,
    totalLawsuits: Array.isArray(children?.lawsuits) ? children.lawsuits.length : 0,
    totalTasks: Array.isArray(children?.tasks) ? children.tasks.length : 0,
    totalMissions: Array.isArray(children?.missions) ? children.missions.length : 0,
    totalSessions: Array.isArray(children?.sessions) ? children.sessions.length : 0,
    totalDocuments: Array.isArray(children?.documents) ? children.documents.length : 0,
    overdueDeadlines,
    upcomingWithin7Days,
    upcomingWithin30Days,
  };
}

function getDataset() {
  return {
    clients: sortRows(clientsService.list()),
    dossiers: sortRows(dossiersService.list()),
    lawsuits: sortRows(lawsuitsService.list()),
    tasks: sortRows(tasksService.list()),
    missions: sortRows(missionsService.list()),
    sessions: sortRows(sessionsService.list()),
    documents: sortRows(documentsService.list()),
  };
}

function findRoot(dataset, entityType, entityId) {
  if (entityType === "client") {
    return dataset.clients.find((row) => row.id === entityId) || null;
  }
  if (entityType === "dossier") {
    return dataset.dossiers.find((row) => row.id === entityId) || null;
  }
  if (entityType === "lawsuit") {
    return dataset.lawsuits.find((row) => row.id === entityId) || null;
  }
  if (entityType === "task") {
    return dataset.tasks.find((row) => row.id === entityId) || null;
  }
  if (entityType === "mission") {
    return dataset.missions.find((row) => row.id === entityId) || null;
  }
  return null;
}

function collectDirectChildren({ dataset, rootType, rootId, categoryAllowance, nowMs }) {
  const direct = {
    dossiers: [],
    lawsuits: [],
    tasks: [],
    missions: [],
    sessions: [],
    documents: [],
  };

  const collectDocumentsByColumn = (column, value) =>
    dataset.documents
      .filter((row) => Number(row[column]) === Number(value))
      .map((row) => toGraphNode("document", row, nowMs));

  if (rootType === "client" && categoryAllowance.dossiers) {
    direct.dossiers = dataset.dossiers
      .filter((row) => Number(row.client_id) === rootId)
      .map((row) => toGraphNode("dossier", row, nowMs));
  }
  if (rootType === "client" && categoryAllowance.documents) {
    direct.documents = collectDocumentsByColumn("client_id", rootId);
  }

  if (rootType === "dossier") {
    if (categoryAllowance.lawsuits) {
      direct.lawsuits = dataset.lawsuits
        .filter((row) => Number(row.dossier_id) === rootId)
        .map((row) => toGraphNode("lawsuit", row, nowMs));
    }
    if (categoryAllowance.tasks) {
      direct.tasks = dataset.tasks
        .filter((row) => Number(row.dossier_id) === rootId)
        .map((row) => toGraphNode("task", row, nowMs));
    }
    if (categoryAllowance.missions) {
      direct.missions = dataset.missions
        .filter((row) => Number(row.dossier_id) === rootId)
        .map((row) => toGraphNode("mission", row, nowMs));
    }
    if (categoryAllowance.sessions) {
      direct.sessions = dataset.sessions
        .filter((row) => Number(row.dossier_id) === rootId)
        .map((row) => toGraphNode("session", row, nowMs));
    }
    if (categoryAllowance.documents) {
      direct.documents = collectDocumentsByColumn("dossier_id", rootId);
    }
  }

  if (rootType === "lawsuit") {
    if (categoryAllowance.tasks) {
      direct.tasks = dataset.tasks
        .filter((row) => Number(row.lawsuit_id) === rootId)
        .map((row) => toGraphNode("task", row, nowMs));
    }
    if (categoryAllowance.missions) {
      direct.missions = dataset.missions
        .filter((row) => Number(row.lawsuit_id) === rootId)
        .map((row) => toGraphNode("mission", row, nowMs));
    }
    if (categoryAllowance.sessions) {
      direct.sessions = dataset.sessions
        .filter((row) => Number(row.lawsuit_id) === rootId)
        .map((row) => toGraphNode("session", row, nowMs));
    }
    if (categoryAllowance.documents) {
      direct.documents = collectDocumentsByColumn("lawsuit_id", rootId);
    }
  }

  if (rootType === "task" && categoryAllowance.documents) {
    direct.documents = collectDocumentsByColumn("task_id", rootId);
  }
  if (rootType === "mission" && categoryAllowance.documents) {
    direct.documents = collectDocumentsByColumn("mission_id", rootId);
  }

  return direct;
}

function collectDepthTwoChildren({
  dataset,
  directChildren,
  categoryMap,
  categoryAllowance,
  nowMs,
}) {
  const addDocumentsByColumn = (column, id) => {
    if (!categoryAllowance.documents) return;
    const docs = dataset.documents.filter((row) => Number(row[column]) === Number(id));
    for (const doc of docs) {
      addNode(categoryMap, "documents", toGraphNode("document", doc, nowMs));
    }
  };

  const directDossiers = directChildren.dossiers || [];
  const directLawsuits = directChildren.lawsuits || [];
  const directTasks = directChildren.tasks || [];
  const directMissions = directChildren.missions || [];
  const directSessions = directChildren.sessions || [];

  for (const node of directDossiers) {
    const dossierId = node.id;
    if (categoryAllowance.lawsuits) {
      const lawsuits = dataset.lawsuits.filter((row) => Number(row.dossier_id) === dossierId);
      for (const lawsuit of lawsuits) {
        addNode(categoryMap, "lawsuits", toGraphNode("lawsuit", lawsuit, nowMs));
        addDocumentsByColumn("lawsuit_id", lawsuit.id);
      }
    }
    if (categoryAllowance.tasks) {
      const tasks = dataset.tasks.filter((row) => Number(row.dossier_id) === dossierId);
      for (const task of tasks) {
        addNode(categoryMap, "tasks", toGraphNode("task", task, nowMs));
      }
    }
    if (categoryAllowance.missions) {
      const missions = dataset.missions.filter((row) => Number(row.dossier_id) === dossierId);
      for (const mission of missions) {
        addNode(categoryMap, "missions", toGraphNode("mission", mission, nowMs));
      }
    }
    if (categoryAllowance.sessions) {
      const sessions = dataset.sessions.filter((row) => Number(row.dossier_id) === dossierId);
      for (const session of sessions) {
        addNode(categoryMap, "sessions", toGraphNode("session", session, nowMs));
      }
    }
    addDocumentsByColumn("dossier_id", dossierId);
  }

  for (const node of directLawsuits) {
    const lawsuitId = node.id;
    if (categoryAllowance.tasks) {
      const tasks = dataset.tasks.filter((row) => Number(row.lawsuit_id) === lawsuitId);
      for (const task of tasks) {
        addNode(categoryMap, "tasks", toGraphNode("task", task, nowMs));
      }
    }
    if (categoryAllowance.missions) {
      const missions = dataset.missions.filter((row) => Number(row.lawsuit_id) === lawsuitId);
      for (const mission of missions) {
        addNode(categoryMap, "missions", toGraphNode("mission", mission, nowMs));
      }
    }
    if (categoryAllowance.sessions) {
      const sessions = dataset.sessions.filter((row) => Number(row.lawsuit_id) === lawsuitId);
      for (const session of sessions) {
        addNode(categoryMap, "sessions", toGraphNode("session", session, nowMs));
      }
    }
    addDocumentsByColumn("lawsuit_id", lawsuitId);
  }

  for (const taskNode of directTasks) {
    addDocumentsByColumn("task_id", taskNode.id);
  }
  for (const missionNode of directMissions) {
    addDocumentsByColumn("mission_id", missionNode.id);
  }
  for (const sessionNode of directSessions) {
    addDocumentsByColumn("session_id", sessionNode.id);
  }
}

function collectParents({ dataset, rootType, root }) {
  const parents = {};

  if (rootType === "dossier" && root.client_id) {
    const parent = dataset.clients.find((row) => row.id === Number(root.client_id));
    if (parent) parents.client = parent;
  } else if (rootType === "lawsuit" && root.dossier_id) {
    const parent = dataset.dossiers.find((row) => row.id === Number(root.dossier_id));
    if (parent) parents.dossier = parent;
  } else if (rootType === "task") {
    if (root.lawsuit_id) {
      const parent = dataset.lawsuits.find((row) => row.id === Number(root.lawsuit_id));
      if (parent) parents.lawsuit = parent;
    } else if (root.dossier_id) {
      const parent = dataset.dossiers.find((row) => row.id === Number(root.dossier_id));
      if (parent) parents.dossier = parent;
    }
  } else if (rootType === "mission") {
    if (root.lawsuit_id) {
      const parent = dataset.lawsuits.find((row) => row.id === Number(root.lawsuit_id));
      if (parent) parents.lawsuit = parent;
    } else if (root.dossier_id) {
      const parent = dataset.dossiers.find((row) => row.id === Number(root.dossier_id));
      if (parent) parents.dossier = parent;
    }
  }

  return parents;
}

async function getEntityGraph(
  {
    entityType,
    entityId,
    depth = 1,
    direction = "both",
    include = undefined,
    accessFilter = undefined,
  },
  executionContext = {},
) {
  const normalizedEntityType = String(entityType || "").toLowerCase();
  const normalizedEntityId = Number(entityId);
  const nowMs = Date.now();

  const dataset = getDataset();
  const rootRow = findRoot(dataset, normalizedEntityType, normalizedEntityId);
  if (!rootRow) {
    throw createEntityNotFoundError(normalizedEntityType, normalizedEntityId);
  }

  const categoryAllowance = buildCategoryAllowance({
    include,
    accessFilter,
    contextDataAccess: executionContext?.dataAccess,
  });

  const root = toGraphNode(normalizedEntityType, rootRow, nowMs);
  const response = {
    root,
    parents: {},
    children: {},
    metrics: {
      totalDossiers: 0,
      totalLawsuits: 0,
      totalTasks: 0,
      totalMissions: 0,
      totalSessions: 0,
      totalDocuments: 0,
      overdueDeadlines: 0,
      upcomingWithin7Days: 0,
      upcomingWithin30Days: 0,
    },
    generatedAt: new Date().toISOString(),
  };

  if (direction === "up" || direction === "both") {
    const parentRows = collectParents({
      dataset,
      rootType: normalizedEntityType,
      root: rootRow,
    });
    if (parentRows.client) {
      response.parents.client = toGraphNode("client", parentRows.client, nowMs);
    }
    if (parentRows.dossier) {
      response.parents.dossier = toGraphNode("dossier", parentRows.dossier, nowMs);
    }
    if (parentRows.lawsuit) {
      response.parents.lawsuit = toGraphNode("lawsuit", parentRows.lawsuit, nowMs);
    }
  }

  if (direction !== "down" && direction !== "both") {
    return response;
  }

  const hasAllowedChildren = CHILD_CATEGORIES.some((category) => categoryAllowance[category]);
  if (!hasAllowedChildren) {
    return response;
  }

  const directChildren = collectDirectChildren({
    dataset,
    rootType: normalizedEntityType,
    rootId: normalizedEntityId,
    categoryAllowance,
    nowMs,
  });

  const categoryMap = {};
  for (const category of CHILD_CATEGORIES) {
    if (!categoryAllowance[category]) continue;
    for (const node of directChildren[category] || []) {
      addNode(categoryMap, category, node);
    }
  }

  if (Number(depth) === 2) {
    collectDepthTwoChildren({
      dataset,
      directChildren,
      categoryMap,
      categoryAllowance,
      nowMs,
    });
  }

  response.children = flattenChildren(categoryMap, categoryAllowance);
  response.metrics = collectMetrics(response.children);
  return response;
}

module.exports = {
  name: "getEntityGraph",
  category: TOOL_CATEGORIES.READ,
  description:
    "Return a deterministic graph snapshot of an entity with parent/child FK relationships",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v1", "v2", "v3"],
  handler: getEntityGraph,
  getEntityGraph,
};
