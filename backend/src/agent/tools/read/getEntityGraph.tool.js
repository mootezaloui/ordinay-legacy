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
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 2) {
    return 1;
  }
  return 2;
}

function normalizeDirection(value) {
  const normalized = String(value || "both").trim().toLowerCase();
  return ALLOWED_DIRECTIONS.has(normalized) ? normalized : "both";
}

async function getEntityGraph(args, executionContext = {}) {
  const entityType = normalizeEntityType(args?.entityType);
  const entityId = normalizeEntityId(args?.entityId);
  const requestedDepthRaw = args?.depth;
  const requestedDepth = Number(requestedDepthRaw);
  const hasRequestedDepth =
    requestedDepthRaw !== undefined &&
    requestedDepthRaw !== null &&
    String(requestedDepthRaw).trim().length > 0;
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
  if (hasRequestedDepth && requestedDepth !== depth) {
    console.warn(
      "[GRAPH_DEPTH_NORMALIZED]",
      safeJson({
        root_type: entityType,
        root_id: entityId,
        requested_depth: Number.isFinite(requestedDepth) ? requestedDepth : requestedDepthRaw,
        effective_depth: depth,
      }),
    );
  }
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
    console.info(
      "[GRAPH_DIRECT_CHILDREN]",
      safeJson({
        root_type: entityType,
        root_id: entityId,
        effective_depth: depth,
        dossiers: Array.isArray(directChildren.dossiers) ? directChildren.dossiers.length : 0,
        lawsuits: Array.isArray(directChildren.lawsuits) ? directChildren.lawsuits.length : 0,
        tasks: Array.isArray(directChildren.tasks) ? directChildren.tasks.length : 0,
        missions: Array.isArray(directChildren.missions) ? directChildren.missions.length : 0,
        sessions: Array.isArray(directChildren.sessions) ? directChildren.sessions.length : 0,
        documents: Array.isArray(directChildren.documents) ? directChildren.documents.length : 0,
      }),
    );

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
    console.info(
      "[GRAPH_CHILDREN_FINAL]",
      safeJson({
        root_type: entityType,
        root_id: entityId,
        effective_depth: depth,
        dossiers: Array.isArray(capped.children.dossiers) ? capped.children.dossiers.length : 0,
        lawsuits: Array.isArray(capped.children.lawsuits) ? capped.children.lawsuits.length : 0,
        tasks: Array.isArray(capped.children.tasks) ? capped.children.tasks.length : 0,
        missions: Array.isArray(capped.children.missions) ? capped.children.missions.length : 0,
        sessions: Array.isArray(capped.children.sessions) ? capped.children.sessions.length : 0,
        documents: Array.isArray(capped.children.documents) ? capped.children.documents.length : 0,
        truncated: capped.truncated,
        totalBeforeCap: capped.totalBeforeCap,
      }),
    );
    response.children = capped.children;
    response.meta.truncated = capped.truncated;
    response.meta.totalBeforeCap = capped.totalBeforeCap;
  }

  response.metrics = collectMetrics({
    root: response.root,
    parents: response.parents,
    children: response.children,
  });

  const parentsCount = countGraphNodes(response.parents);
  const childrenCount = countGraphNodes(response.children);
  const totalEntities = 1 + parentsCount + childrenCount;
  console.info(
    "[GRAPH_TRAVERSAL]",
    safeJson({
      root_type: entityType,
      root_id: entityId,
      depth,
      parents_count: parentsCount,
      children_count: childrenCount,
      total_entities: totalEntities,
    }),
  );

  if (depth <= 1) {
    console.warn("[GRAPH_WARNING] depth may be too shallow for workload queries");
  }

  return response;
}

function countGraphNodes(collection) {
  if (!collection || typeof collection !== "object") {
    return 0;
  }

  return Object.values(collection).reduce((total, value) => {
    if (Array.isArray(value)) {
      return total + value.length;
    }
    if (value && typeof value === "object") {
      return total + 1;
    }
    return total;
  }, 0);
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "unable to serialize graph diagnostics" });
  }
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
