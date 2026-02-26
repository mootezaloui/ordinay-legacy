"use strict";

const { TOOL_CATEGORIES } = require("../tools/tool.registry");
const {
  TOOL_DOMAIN_MAP,
  ENTITY_TYPE_DOMAIN_MAP,
} = require("../tools/tool.firewall");

function cloneSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
  }
  return JSON.parse(JSON.stringify(schema));
}

function filterEnum(enumValues, enabledEntityTypes) {
  if (!Array.isArray(enumValues)) return enumValues;
  const filtered = enumValues.filter((value) =>
    enabledEntityTypes.has(String(value || "").toLowerCase()),
  );
  return filtered.length > 0 ? filtered : enumValues;
}

function applyEntityScopeToSchema(schema, enabledEntityTypes) {
  const scoped = cloneSchema(schema);
  if (!scoped.properties || typeof scoped.properties !== "object") return scoped;

  const directEntity = scoped.properties.entityType;
  if (directEntity && Array.isArray(directEntity.enum)) {
    directEntity.enum = filterEnum(directEntity.enum, enabledEntityTypes);
  }

  const params = scoped.properties.params;
  if (params && params.properties && typeof params.properties === "object") {
    const keys = ["entityType", "sourceType", "targetType"];
    for (const key of keys) {
      const node = params.properties[key];
      if (node && Array.isArray(node.enum)) {
        node.enum = filterEnum(node.enum, enabledEntityTypes);
      }
    }

    const target = params.properties.target;
    if (target && target.properties && target.properties.type) {
      const targetType = target.properties.type;
      if (Array.isArray(targetType.enum)) {
        targetType.enum = filterEnum(targetType.enum, enabledEntityTypes);
      }
    }
  }

  return scoped;
}

function getEnabledEntityTypes(dataAccess) {
  const enabled = new Set();
  const access = dataAccess && typeof dataAccess === "object" ? dataAccess : {};
  for (const [entityType, domain] of Object.entries(ENTITY_TYPE_DOMAIN_MAP)) {
    if (!domain || access[domain] !== false) {
      enabled.add(String(entityType || "").toLowerCase());
    }
  }
  return enabled;
}

function filterToolsForChat({ engine, policy, executionContext }) {
  return filterToolsForState({
    state: String(policy?.version || "").toLowerCase() === "v1" ? "RETRIEVE" : "PLAN_DRAFT",
    engine,
    policy,
    executionContext,
  });
}

function shouldExposeToolForState(tool, state, policy) {
  const normalizedState = String(state || "RETRIEVE").toUpperCase();
  const toolName = String(tool?.name || "");
  const category = String(tool?.category || "");

  if (toolName === "universalMutation" || category === TOOL_CATEGORIES.EXECUTE) {
    return false;
  }

  const allowedByState = {
    RETRIEVE: new Set([TOOL_CATEGORIES.READ, TOOL_CATEGORIES.ANALYSIS]),
    PLAN_DRAFT: new Set([
      TOOL_CATEGORIES.READ,
      TOOL_CATEGORIES.ANALYSIS,
      TOOL_CATEGORIES.PLAN,
      TOOL_CATEGORIES.DRAFT,
      TOOL_CATEGORIES.RESEARCH,
    ]),
    CLARIFY: new Set([TOOL_CATEGORIES.READ]),
    EXECUTE: new Set(),
    FINAL: new Set(),
  };

  const stateAllowedCategories =
    allowedByState[normalizedState] || allowedByState.RETRIEVE;
  if (!stateAllowedCategories.has(category)) return false;

  // Plan tools that create mutation proposals are only available in PLAN_DRAFT on v3.
  if (
    (toolName === "propose_entity_mutation" || toolName === "propose_mutation_workflow") &&
    !(normalizedState === "PLAN_DRAFT" && String(policy?.version || "").toLowerCase() === "v3")
  ) {
    return false;
  }

  return true;
}

function filterToolsForState({ state = "RETRIEVE", engine, policy, executionContext }) {
  const allTools = engine.toolRegistry.list({ agentVersion: policy.version });
  const exposed = [];
  const enabledEntityTypes = getEnabledEntityTypes(executionContext.dataAccess);

  for (const tool of allTools) {
    if (!policy.allowedToolCategories.includes(tool.category)) {
      continue;
    }
    if (!shouldExposeToolForState(tool, state, policy)) {
      continue;
    }

    const permission = engine.toolFirewall.checkPermission({
      toolName: tool.name,
      policy,
      context: {
        ...executionContext,
        confirmed: true,
        posture: executionContext?.posture || "WORK",
      },
      params: null,
    });
    if (!permission.permitted) continue;

    const schema = applyEntityScopeToSchema(tool.inputSchema, enabledEntityTypes);
    exposed.push({
      name: tool.name,
      category: tool.category,
      schema,
      domain: TOOL_DOMAIN_MAP[tool.name] || null,
    });
  }

  return exposed;
}

module.exports = {
  filterToolsForChat,
  filterToolsForState,
  getEnabledEntityTypes,
  applyEntityScopeToSchema,
};
