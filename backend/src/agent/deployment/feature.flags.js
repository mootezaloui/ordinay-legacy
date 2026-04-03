"use strict";

const FLAG_CATEGORIES = Object.freeze({
  PERMANENT: "permanent",
  ROLLOUT: "rollout",
  DEPRECATED: "deprecated",
});

const FEATURE_FLAG_ENV_ALIASES = Object.freeze({
  FEATURE_AGENT_V2_STREAM: ["FEATURE_AI_AGENT_V2"],
});

const FEATURE_FLAG_REGISTRY = Object.freeze({
  FEATURE_AI_AGENT: {
    category: FLAG_CATEGORIES.PERMANENT,
    defaultValue: true,
    envControlled: false,
    description: "Legacy Agent v1 route availability.",
  },
  FEATURE_MCP_INTEGRATION: {
    category: FLAG_CATEGORIES.PERMANENT,
    defaultValue: true,
    envControlled: false,
    description: "Model Context Protocol integration availability.",
  },
  FEATURE_AGENT_V2_STREAM: {
    category: FLAG_CATEGORIES.ROLLOUT,
    defaultValue: false,
    envControlled: true,
    description: "Enable live Agent v2 SSE route.",
  },
  FEATURE_AGENT_V2_SUGGESTIONS: {
    category: FLAG_CATEGORIES.ROLLOUT,
    defaultValue: true,
    envControlled: true,
    description:
      "Enable proactive suggestion generation, suggestion SSE artifacts, and suggestion telemetry in Agent v2.",
  },
  AGENT_CHAT_MUTATION_DEBUG: {
    category: FLAG_CATEGORIES.DEPRECATED,
    defaultValue: false,
    envControlled: true,
    description: "Deprecated debug toggle for legacy mutation logs.",
  },
  AGENT_MUTATION_DEBUG: {
    category: FLAG_CATEGORIES.DEPRECATED,
    defaultValue: false,
    envControlled: true,
    description: "Deprecated debug toggle for legacy mutation logs.",
  },
  AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS: {
    category: FLAG_CATEGORIES.DEPRECATED,
    defaultValue: true,
    envControlled: true,
    description: "Deprecated legacy mutation policy toggle.",
  },
  AGENT_MUTATION_INTENT_DETECTION: {
    category: FLAG_CATEGORIES.DEPRECATED,
    defaultValue: true,
    envControlled: true,
    description: "Deprecated legacy mutation intent toggle.",
  },
});

function getFeatureFlags(env = process.env) {
  const values = {};
  const details = {};
  const categories = {
    [FLAG_CATEGORIES.PERMANENT]: [],
    [FLAG_CATEGORIES.ROLLOUT]: [],
    [FLAG_CATEGORIES.DEPRECATED]: [],
  };

  for (const [name, definition] of Object.entries(FEATURE_FLAG_REGISTRY)) {
    const raw = readEnv(env, name);
    const enabled = resolveFlagValue(definition, raw);
    values[name] = enabled;
    details[name] = {
      name,
      category: definition.category,
      description: definition.description,
      defaultValue: definition.defaultValue,
      envControlled: definition.envControlled,
      raw,
      enabled,
    };
    categories[definition.category].push(name);
  }

  return {
    values,
    details,
    categories,
  };
}

function validateFeatureFlags(flags) {
  const normalized = normalizeFlags(flags);
  const warnings = [];
  const errors = [];

  for (const name of normalized.categories[FLAG_CATEGORIES.DEPRECATED]) {
    const detail = normalized.details[name];
    if (detail && detail.enabled === true) {
      warnings.push({
        code: "DEPRECATED_FEATURE_FLAG_ENABLED",
        flag: name,
        scope: "base",
        message: `Deprecated flag "${name}" is enabled. Disable it before production rollout.`,
      });
    }
  }

  for (const name of normalized.categories[FLAG_CATEGORIES.PERMANENT]) {
    const detail = normalized.details[name];
    if (!detail || detail.envControlled || detail.raw == null || String(detail.raw).trim() === "") {
      continue;
    }
    const parsed = parseBoolean(detail.raw, detail.defaultValue);
    if (parsed !== detail.defaultValue) {
      warnings.push({
        code: "PERMANENT_FEATURE_FLAG_OVERRIDE_IGNORED",
        flag: name,
        scope: "base",
        message: `Flag "${name}" is permanent and ignores env override value "${detail.raw}".`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function normalizeFlags(flags) {
  if (!isRecord(flags) || !isRecord(flags.values) || !isRecord(flags.details) || !isRecord(flags.categories)) {
    return getFeatureFlags(process.env);
  }

  const categories = {
    [FLAG_CATEGORIES.PERMANENT]: Array.isArray(flags.categories[FLAG_CATEGORIES.PERMANENT])
      ? [...flags.categories[FLAG_CATEGORIES.PERMANENT]]
      : [],
    [FLAG_CATEGORIES.ROLLOUT]: Array.isArray(flags.categories[FLAG_CATEGORIES.ROLLOUT])
      ? [...flags.categories[FLAG_CATEGORIES.ROLLOUT]]
      : [],
    [FLAG_CATEGORIES.DEPRECATED]: Array.isArray(flags.categories[FLAG_CATEGORIES.DEPRECATED])
      ? [...flags.categories[FLAG_CATEGORIES.DEPRECATED]]
      : [],
  };

  return {
    values: { ...flags.values },
    details: { ...flags.details },
    categories,
  };
}

function resolveFlagValue(definition, rawValue) {
  if (!definition.envControlled) {
    return definition.defaultValue;
  }
  return parseBoolean(rawValue, definition.defaultValue);
}

function readEnv(env, key) {
  if (!isRecord(env)) {
    return undefined;
  }
  const direct = env[key];
  if (direct !== undefined) {
    return direct;
  }
  const aliases = FEATURE_FLAG_ENV_ALIASES[key];
  if (!Array.isArray(aliases)) {
    return undefined;
  }
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(env, alias)) {
      return env[alias];
    }
  }
  return undefined;
}

function parseBoolean(value, fallback) {
  if (typeof value !== "string") {
    return Boolean(fallback);
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return Boolean(fallback);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  FLAG_CATEGORIES,
  FEATURE_FLAG_REGISTRY,
  getFeatureFlags,
  validateFeatureFlags,
};
