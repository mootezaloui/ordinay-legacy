"use strict";

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

const CHILD_CAPS = Object.freeze({
  dossiers: 50,
  lawsuits: 50,
  tasks: 50,
  missions: 30,
  sessions: 50,
  documents: 30,
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

const TASK_CLOSED_STATUSES = new Set(["done", "completed", "cancelled", "closed"]);
const TASK_COMPLETED_STATUSES = new Set(["done", "completed", "closed"]);
const LAWSUIT_INACTIVE_STATUSES = new Set(["closed", "archived", "cancelled"]);

function toIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeStatus(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isClosedByStatus(entityType, status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
  const closedStatuses = CLOSED_STATUSES[entityType] || [];
  return closedStatuses.some((value) => String(value).toLowerCase() === normalized);
}

function resolveUpcomingDate(type, row) {
  if (!row || typeof row !== "object") return null;

  if (type === "dossier") return toIso(row.next_deadline);
  if (type === "lawsuit") return toIso(row.next_hearing);
  if (type === "task") return toIso(row.due_date);
  if (type === "mission") return toIso(row.due_date);
  if (type === "session") return toIso(row.scheduled_at || row.session_date);

  return null;
}

function isUrgentPriority(priority) {
  const normalized = String(priority || "").trim().toLowerCase();
  return normalized === "urgent" || normalized === "high";
}

function toGraphNode(type, row, nowMs) {
  const status = normalizeStatus(row?.status);
  const nextUpcoming = resolveUpcomingDate(type, row);
  const nextUpcomingMs = nextUpcoming ? new Date(nextUpcoming).getTime() : null;
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
      createdAt: toIso(
        row.created_at ||
          row.opened_at ||
          row.assign_date ||
          row.scheduled_at ||
          row.uploaded_at,
      ),
      updatedAt: toIso(row.updated_at || row.created_at || row.opened_at || row.uploaded_at),
    },
    flags: {
      isUrgent: isUrgentPriority(priority),
      isOverdue: Boolean(nextUpcomingMs && nextUpcomingMs < nowMs && !isClosed),
    },
  };
}

function buildCategoryAllowance({
  include,
  accessFilter = null,
  contextDataAccess = null,
}) {
  const includeSet =
    Array.isArray(include) && include.length > 0 ? new Set(include) : null;
  const allowance = {};

  for (const category of CHILD_CATEGORIES) {
    let allowed = true;

    if (includeSet && !includeSet.has(category)) {
      allowed = false;
    }

    if (accessFilter && typeof accessFilter[category] === "boolean") {
      allowed = allowed && accessFilter[category];
    }

    const domain = CATEGORY_TO_DOMAIN[category];
    if (
      contextDataAccess &&
      typeof contextDataAccess === "object" &&
      contextDataAccess[domain] === false
    ) {
      allowed = false;
    }

    allowance[category] = allowed;
  }

  return allowance;
}

function collectIncludedCategories(categoryAllowance) {
  return CHILD_CATEGORIES.filter((category) => categoryAllowance[category]);
}

function createCategoryMap() {
  return {
    dossiers: new Map(),
    lawsuits: new Map(),
    tasks: new Map(),
    missions: new Map(),
    sessions: new Map(),
    documents: new Map(),
  };
}

function addNodeToCategoryMap(categoryMap, category, node) {
  if (!categoryMap[category]) {
    categoryMap[category] = new Map();
  }
  categoryMap[category].set(Number(node.id), node);
}

function sortNodesById(nodes) {
  return [...nodes].sort((left, right) => Number(left.id) - Number(right.id));
}

function flattenCategoryMap(categoryMap, categoryAllowance) {
  const children = {};

  for (const category of CHILD_CATEGORIES) {
    if (!categoryAllowance[category]) continue;
    const asList = categoryMap[category]
      ? sortNodesById(categoryMap[category].values())
      : [];
    children[category] = asList;
  }

  return children;
}

function applyChildCaps(children, categoryAllowance) {
  let truncated = false;
  let totalBeforeCap = 0;
  const cappedChildren = {};

  for (const category of CHILD_CATEGORIES) {
    if (!categoryAllowance[category]) continue;

    const source = Array.isArray(children[category]) ? children[category] : [];
    totalBeforeCap += source.length;

    const cap = CHILD_CAPS[category] || source.length;
    if (source.length > cap) {
      truncated = true;
      cappedChildren[category] = source.slice(0, cap);
    } else {
      cappedChildren[category] = source;
    }
  }

  return {
    children: cappedChildren,
    truncated,
    totalBeforeCap,
  };
}

function createEmptyMetrics() {
  return {
    totalDossiers: 0,
    totalLawsuits: 0,
    totalTasks: 0,
    totalMissions: 0,
    totalSessions: 0,
    totalDocuments: 0,
    overdueDeadlines: 0,
    upcomingWithin7Days: 0,
    upcomingWithin30Days: 0,
    openTasks: 0,
    urgentTasks: 0,
    activeLawsuits: 0,
    completedTasks: 0,
    latestActivity: null,
    earliestUpcoming: null,
  };
}

function collectMetrics({ root, parents, children }) {
  const metrics = createEmptyMetrics();
  const nowMs = Date.now();
  const in7DaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;
  const in30DaysMs = nowMs + 30 * 24 * 60 * 60 * 1000;

  const dossiers = asArray(children?.dossiers);
  const lawsuits = asArray(children?.lawsuits);
  const tasks = asArray(children?.tasks);
  const missions = asArray(children?.missions);
  const sessions = asArray(children?.sessions);
  const documents = asArray(children?.documents);

  metrics.totalDossiers = dossiers.length;
  metrics.totalLawsuits = lawsuits.length;
  metrics.totalTasks = tasks.length;
  metrics.totalMissions = missions.length;
  metrics.totalSessions = sessions.length;
  metrics.totalDocuments = documents.length;

  for (const task of tasks) {
    const status = String(task.status || "").trim().toLowerCase();
    if (TASK_COMPLETED_STATUSES.has(status)) {
      metrics.completedTasks += 1;
    }
    if (!TASK_CLOSED_STATUSES.has(status)) {
      metrics.openTasks += 1;
    }
    if (task.flags?.isUrgent) {
      metrics.urgentTasks += 1;
    }
  }

  for (const lawsuit of lawsuits) {
    const status = String(lawsuit.status || "").trim().toLowerCase();
    if (!LAWSUIT_INACTIVE_STATUSES.has(status)) {
      metrics.activeLawsuits += 1;
    }
  }

  const allNodes = collectAllNodes(root, parents, children);
  let latestActivityMs = null;
  let earliestUpcomingMs = null;

  for (const node of allNodes) {
    const updatedAtMs = parseTime(node?.keyDates?.updatedAt);
    if (updatedAtMs !== null && (latestActivityMs === null || updatedAtMs > latestActivityMs)) {
      latestActivityMs = updatedAtMs;
    }

    const nextUpcomingMs = parseTime(node?.keyDates?.nextUpcoming);
    if (nextUpcomingMs !== null) {
      if (node?.flags?.isOverdue) {
        metrics.overdueDeadlines += 1;
      } else {
        if (nextUpcomingMs >= nowMs && nextUpcomingMs <= in7DaysMs) {
          metrics.upcomingWithin7Days += 1;
        }
        if (nextUpcomingMs >= nowMs && nextUpcomingMs <= in30DaysMs) {
          metrics.upcomingWithin30Days += 1;
        }
        if (
          nextUpcomingMs >= nowMs &&
          (earliestUpcomingMs === null || nextUpcomingMs < earliestUpcomingMs)
        ) {
          earliestUpcomingMs = nextUpcomingMs;
        }
      }
    }
  }

  metrics.latestActivity = latestActivityMs ? new Date(latestActivityMs).toISOString() : null;
  metrics.earliestUpcoming = earliestUpcomingMs
    ? new Date(earliestUpcomingMs).toISOString()
    : null;

  return metrics;
}

function collectAllNodes(root, parents, children) {
  const nodes = [];
  if (root) nodes.push(root);
  if (parents && typeof parents === "object") {
    for (const value of Object.values(parents)) {
      if (value && typeof value === "object") {
        nodes.push(value);
      }
    }
  }
  for (const category of CHILD_CATEGORIES) {
    for (const node of asArray(children?.[category])) {
      nodes.push(node);
    }
  }
  return nodes;
}

function parseTime(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  CHILD_CATEGORIES,
  CATEGORY_TO_DOMAIN,
  CHILD_CAPS,
  buildCategoryAllowance,
  collectIncludedCategories,
  createCategoryMap,
  addNodeToCategoryMap,
  flattenCategoryMap,
  applyChildCaps,
  createEmptyMetrics,
  collectMetrics,
  toGraphNode,
  toIso,
};
