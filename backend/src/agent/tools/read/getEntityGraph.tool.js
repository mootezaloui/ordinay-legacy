"use strict";

/**
 * READ TOOL: getEntityGraph
 *
 * Deterministic graph snapshot for core legal entities using targeted FK queries.
 * Read-only, no side effects, safe for all agent versions.
 */

const TOOL_CATEGORIES = { READ: "READ" };
const inputSchema = require("../../schemas/getEntityGraph.input.schema.json");
const outputSchema = require("../../schemas/getEntityGraph.output.schema.json");

const {
  CHILD_CATEGORIES,
  buildCategoryAllowance,
  collectIncludedCategories,
  createCategoryMap,
  addNodeToCategoryMap,
  flattenCategoryMap,
  applyChildCaps,
  createEmptyMetrics,
  collectMetrics,
  toGraphNode,
} = require("./graph.utils");

const {
  createServices,
  createEntityNotFoundError,
  findRoot,
  collectParents,
  collectDirectChildren,
  collectDepthTwoChildren,
} = require("./graph.traversal");

const ALLOWED_ROOT_TYPES = new Set([
  "client",
  "dossier",
  "lawsuit",
  "task",
  "mission",
  "session",
  "document",
]);

const ALLOWED_DIRECTIONS = new Set(["up", "down", "both"]);

function normalizeEntityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!ALLOWED_ROOT_TYPES.has(normalized)) {
    throw new Error(`Unsupported entityType "${value}"`);
  }
  return normalized;
}

function normalizeEntityId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid entityId "${value}"`);
  }
  return parsed;
}

function normalizeDepth(value) {
  return Number(value) === 2 ? 2 : 1;
}

function normalizeDirection(value) {
  const normalized = String(value || "both").trim().toLowerCase();
  return ALLOWED_DIRECTIONS.has(normalized) ? normalized : "both";
}

async function getEntityGraph(args, executionContext = {}) {
  const entityType = normalizeEntityType(args?.entityType);
  const entityId = normalizeEntityId(args?.entityId);
  const depth = normalizeDepth(args?.depth);
  const direction = normalizeDirection(args?.direction);
  const nowMs = Date.now();
  const services = createServices(executionContext?.services || {});

  const rootRow = findRoot({ entityType, entityId, services });
  if (!rootRow) {
    throw createEntityNotFoundError(entityType, entityId);
  }

  const categoryAllowance = buildCategoryAllowance({
    include: args?.include,
    accessFilter: args?.accessFilter,
    contextDataAccess: executionContext?.dataAccess,
  });

  const includedCategories = collectIncludedCategories(categoryAllowance);
  const response = {
    root: toGraphNode(entityType, rootRow, nowMs),
    parents: {},
    children: {},
    metrics: createEmptyMetrics(),
    generatedAt: new Date().toISOString(),
    meta: {
      rootType: entityType,
      rootId: entityId,
      depth,
      direction,
      includedCategories,
      truncated: false,
      totalBeforeCap: 0,
    },
  };

  if (direction === "up" || direction === "both") {
    response.parents = collectParents({
      rootType: entityType,
      rootRow,
      services,
      nowMs,
    });
  }

  if (direction === "down" || direction === "both") {
    const forceClientDossiersForTraversal =
      entityType === "client" &&
      depth === 2 &&
      (categoryAllowance.lawsuits ||
        categoryAllowance.tasks ||
        categoryAllowance.missions ||
        categoryAllowance.sessions);

    const directChildren = collectDirectChildren({
      rootType: entityType,
      rootId: entityId,
      services,
      categoryAllowance,
      nowMs,
      forceClientDossiersForTraversal,
    });

    const categoryMap = createCategoryMap();

    for (const category of CHILD_CATEGORIES) {
      if (!categoryAllowance[category]) continue;
      for (const node of directChildren[category]) {
        addNodeToCategoryMap(categoryMap, category, node);
      }
    }

    if (depth === 2) {
      collectDepthTwoChildren({
        directChildren,
        categoryMap,
        categoryAllowance,
        services,
        nowMs,
      });
    }

    const flattened = flattenCategoryMap(categoryMap, categoryAllowance);
    const capped = applyChildCaps(flattened, categoryAllowance);
    response.children = capped.children;
    response.meta.truncated = capped.truncated;
    response.meta.totalBeforeCap = capped.totalBeforeCap;
  }

  response.metrics = collectMetrics({
    root: response.root,
    parents: response.parents,
    children: response.children,
  });

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
