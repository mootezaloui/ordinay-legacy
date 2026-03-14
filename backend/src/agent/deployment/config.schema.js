"use strict";

const path = require("node:path");
const { getFeatureFlags, validateFeatureFlags } = require("./feature.flags");

const DEFAULTS = Object.freeze({
  PORT: 3000,
  API_PREFIX: "/api",
  NODE_ENV: "development",
  DB_FILE: "ordinay.db",
  AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND: false,

  SESSION_CACHE_MAX: 200,
  RETRIEVAL_CACHE_MAX_SESSIONS: 120,
  RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: 80,
  SUMMARY_CACHE_MAX: 256,
  CACHE_EVICT_AFTER_TURNS: 120,
  MEMORY_WARNING_HEAP_MB: 768,

  RETRIEVAL_ENABLED: true,
  RETRIEVAL_TOP_K: 6,
  RETRIEVAL_MAX_CHARS: 1400,
  RETRIEVAL_MIN_SCORE: 0.1,
  RETRIEVAL_MAX_CHUNKS_PER_DOC: 2,
  RETRIEVAL_CHUNK_SIZE: 700,
  RETRIEVAL_CHUNK_OVERLAP: 140,

  RATE_LIMIT_REQUESTS: 30,
  RATE_LIMIT_WINDOW_MS: 60000,

  SUMMARY_TRIGGER_TURNS: 24,
  SUMMARY_MAX_TOKENS: 3500,

  HEALTH_SNAPSHOT_EVERY_N_TURNS: 25,
  PERFORMANCE_SNAPSHOT_EVERY_N_TURNS: 100,
  OPERATIONS_AUDIT_MAX_LIMIT: 100,
  SAFE_MODE_WRITES_DISABLED: false,
  SAFE_MODE_RETRIEVAL_DISABLED: false,
  SAFE_MODE_GROUNDING_DISABLED: false,
  SAFE_MODE_SUMMARIZATION_DISABLED: false,
  SAFE_MODE_FORCE_READ_ONLY: false,
  SAFE_MODE_V2_DISABLED: false,
  DEBUG_VERBOSE_TURN_TRACE: false,
  DEBUG_LOG_TOOL_BOUNDARY_CHECKS: false,
  DEBUG_LOG_RETRIEVAL_DECISIONS: false,
  DEBUG_EXPOSE_OPERATOR_WARNINGS: false,
});

function getAgentConfig(env = process.env, options = {}) {
  const cwd = normalizeCwd(options.cwd);
  const flags = options.flags && options.flags.values ? options.flags : getFeatureFlags(env);
  const parseWarnings = [];

  const config = {
    app: {
      port: parseInteger(readEnv(env, "PORT"), DEFAULTS.PORT),
      apiPrefix: parseString(readEnv(env, "API_PREFIX"), DEFAULTS.API_PREFIX),
      nodeEnv: parseString(readEnv(env, "NODE_ENV"), DEFAULTS.NODE_ENV),
    },
    db: {
      file: resolveDbFilePath(readEnv(env, "DB_FILE"), cwd),
    },
    deployment: {
      allowPublicBind: parseBooleanWithWarning(
        readEnv(env, "AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND"),
        DEFAULTS.AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND,
        "deployment.allowPublicBind",
        parseWarnings,
      ),
    },
    features: flags,
    policy: {
      memory: {
        sessionCacheMax: parseInteger(readEnvAny(env, ["SESSION_CACHE_MAX", "AGENT_SESSION_CACHE_MAX"]), DEFAULTS.SESSION_CACHE_MAX),
        summaryCacheMax: parseInteger(readEnvAny(env, ["SUMMARY_CACHE_MAX", "AGENT_SUMMARY_CACHE_MAX"]), DEFAULTS.SUMMARY_CACHE_MAX),
        cacheEvictAfterTurns: parseInteger(readEnvAny(env, ["CACHE_EVICT_AFTER_TURNS", "AGENT_CACHE_EVICT_AFTER_TURNS"]), DEFAULTS.CACHE_EVICT_AFTER_TURNS),
        memoryWarningHeapMb: parseInteger(readEnvAny(env, ["MEMORY_WARNING_HEAP_MB", "AGENT_MEMORY_WARNING_HEAP_MB"]), DEFAULTS.MEMORY_WARNING_HEAP_MB),
        summaryTriggerTurns: parseInteger(readEnvAny(env, ["SUMMARY_TRIGGER_TURNS", "AGENT_SUMMARY_TRIGGER_TURNS"]), DEFAULTS.SUMMARY_TRIGGER_TURNS),
        summaryMaxTokens: parseInteger(readEnvAny(env, ["SUMMARY_MAX_TOKENS", "AGENT_SUMMARY_MAX_TOKENS"]), DEFAULTS.SUMMARY_MAX_TOKENS),
      },
      retrieval: {
        enabled: parseBooleanWithWarning(
          readEnvAny(env, ["RETRIEVAL_ENABLED", "AGENT_RETRIEVAL_ENABLED"]),
          DEFAULTS.RETRIEVAL_ENABLED,
          "policy.retrieval.enabled",
          parseWarnings,
        ),
        topK: parseInteger(readEnvAny(env, ["RETRIEVAL_TOP_K", "AGENT_RETRIEVAL_TOP_K"]), DEFAULTS.RETRIEVAL_TOP_K),
        maxChars: parseInteger(readEnvAny(env, ["RETRIEVAL_MAX_CHARS", "AGENT_RETRIEVAL_MAX_CHARS"]), DEFAULTS.RETRIEVAL_MAX_CHARS),
        minScore: parseFloatValue(readEnvAny(env, ["RETRIEVAL_MIN_SCORE", "AGENT_RETRIEVAL_MIN_SCORE"]), DEFAULTS.RETRIEVAL_MIN_SCORE),
        maxChunksPerDoc: parseInteger(readEnvAny(env, ["RETRIEVAL_MAX_CHUNKS_PER_DOC", "AGENT_RETRIEVAL_MAX_CHUNKS_PER_DOC"]), DEFAULTS.RETRIEVAL_MAX_CHUNKS_PER_DOC),
        chunkSize: parseInteger(readEnvAny(env, ["RETRIEVAL_CHUNK_SIZE", "AGENT_RETRIEVAL_CHUNK_SIZE"]), DEFAULTS.RETRIEVAL_CHUNK_SIZE),
        chunkOverlap: parseInteger(readEnvAny(env, ["RETRIEVAL_CHUNK_OVERLAP", "AGENT_RETRIEVAL_CHUNK_OVERLAP"]), DEFAULTS.RETRIEVAL_CHUNK_OVERLAP),
        cacheMaxSessions: parseInteger(readEnvAny(env, ["RETRIEVAL_CACHE_MAX_SESSIONS", "AGENT_RETRIEVAL_CACHE_MAX_SESSIONS"]), DEFAULTS.RETRIEVAL_CACHE_MAX_SESSIONS),
        cacheMaxDocsPerSession: parseInteger(readEnvAny(env, ["RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION", "AGENT_RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION"]), DEFAULTS.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION),
      },
      security: {
        rateLimitRequests: parseInteger(readEnvAny(env, ["RATE_LIMIT_REQUESTS", "AGENT_RATE_LIMIT_REQUESTS"]), DEFAULTS.RATE_LIMIT_REQUESTS),
        rateLimitWindowMs: parseInteger(readEnvAny(env, ["RATE_LIMIT_WINDOW_MS", "AGENT_RATE_LIMIT_WINDOW_MS"]), DEFAULTS.RATE_LIMIT_WINDOW_MS),
      },
      observability: {
        healthSnapshotEveryNTurns: parseInteger(readEnvAny(env, ["HEALTH_SNAPSHOT_EVERY_N_TURNS", "AGENT_HEALTH_SNAPSHOT_EVERY_N_TURNS"]), DEFAULTS.HEALTH_SNAPSHOT_EVERY_N_TURNS),
        performanceSnapshotEveryNTurns: parseInteger(readEnvAny(env, ["PERFORMANCE_SNAPSHOT_EVERY_N_TURNS", "AGENT_PERFORMANCE_SNAPSHOT_EVERY_N_TURNS"]), DEFAULTS.PERFORMANCE_SNAPSHOT_EVERY_N_TURNS),
      },
      operations: {
        auditMaxLimit: parseInteger(
          readEnvAny(env, ["OPERATIONS_AUDIT_MAX_LIMIT", "AGENT_OPERATIONS_AUDIT_MAX_LIMIT"]),
          DEFAULTS.OPERATIONS_AUDIT_MAX_LIMIT,
        ),
        safeMode: {
          writesDisabled: parseBooleanWithWarning(
            readEnvAny(env, ["SAFE_MODE_WRITES_DISABLED", "AGENT_SAFE_MODE_WRITES_DISABLED"]),
            DEFAULTS.SAFE_MODE_WRITES_DISABLED,
            "policy.operations.safeMode.writesDisabled",
            parseWarnings,
          ),
          retrievalDisabled: parseBooleanWithWarning(
            readEnvAny(env, ["SAFE_MODE_RETRIEVAL_DISABLED", "AGENT_SAFE_MODE_RETRIEVAL_DISABLED"]),
            DEFAULTS.SAFE_MODE_RETRIEVAL_DISABLED,
            "policy.operations.safeMode.retrievalDisabled",
            parseWarnings,
          ),
          groundingDisabled: parseBooleanWithWarning(
            readEnvAny(env, ["SAFE_MODE_GROUNDING_DISABLED", "AGENT_SAFE_MODE_GROUNDING_DISABLED"]),
            DEFAULTS.SAFE_MODE_GROUNDING_DISABLED,
            "policy.operations.safeMode.groundingDisabled",
            parseWarnings,
          ),
          summarizationDisabled: parseBooleanWithWarning(
            readEnvAny(env, ["SAFE_MODE_SUMMARIZATION_DISABLED", "AGENT_SAFE_MODE_SUMMARIZATION_DISABLED"]),
            DEFAULTS.SAFE_MODE_SUMMARIZATION_DISABLED,
            "policy.operations.safeMode.summarizationDisabled",
            parseWarnings,
          ),
          forceReadOnly: parseBooleanWithWarning(
            readEnvAny(env, ["SAFE_MODE_FORCE_READ_ONLY", "AGENT_SAFE_MODE_FORCE_READ_ONLY"]),
            DEFAULTS.SAFE_MODE_FORCE_READ_ONLY,
            "policy.operations.safeMode.forceReadOnly",
            parseWarnings,
          ),
          v2Disabled: parseBooleanWithWarning(
            readEnvAny(env, ["SAFE_MODE_V2_DISABLED", "AGENT_SAFE_MODE_V2_DISABLED"]),
            DEFAULTS.SAFE_MODE_V2_DISABLED,
            "policy.operations.safeMode.v2Disabled",
            parseWarnings,
          ),
        },
        debugFlags: {
          verboseTurnTrace: parseBooleanWithWarning(
            readEnvAny(env, ["DEBUG_VERBOSE_TURN_TRACE", "AGENT_DEBUG_VERBOSE_TURN_TRACE"]),
            DEFAULTS.DEBUG_VERBOSE_TURN_TRACE,
            "policy.operations.debugFlags.verboseTurnTrace",
            parseWarnings,
          ),
          logToolBoundaryChecks: parseBooleanWithWarning(
            readEnvAny(env, ["DEBUG_LOG_TOOL_BOUNDARY_CHECKS", "AGENT_DEBUG_LOG_TOOL_BOUNDARY_CHECKS"]),
            DEFAULTS.DEBUG_LOG_TOOL_BOUNDARY_CHECKS,
            "policy.operations.debugFlags.logToolBoundaryChecks",
            parseWarnings,
          ),
          logRetrievalDecisions: parseBooleanWithWarning(
            readEnvAny(env, ["DEBUG_LOG_RETRIEVAL_DECISIONS", "AGENT_DEBUG_LOG_RETRIEVAL_DECISIONS"]),
            DEFAULTS.DEBUG_LOG_RETRIEVAL_DECISIONS,
            "policy.operations.debugFlags.logRetrievalDecisions",
            parseWarnings,
          ),
          exposeOperatorWarnings: parseBooleanWithWarning(
            readEnvAny(env, ["DEBUG_EXPOSE_OPERATOR_WARNINGS", "AGENT_DEBUG_EXPOSE_OPERATOR_WARNINGS"]),
            DEFAULTS.DEBUG_EXPOSE_OPERATOR_WARNINGS,
            "policy.operations.debugFlags.exposeOperatorWarnings",
            parseWarnings,
          ),
        },
      },
    },
    __parseWarnings: parseWarnings,
  };

  return config;
}

function validateAgentConfig(config) {
  const errors = [];
  const warnings = [];

  if (!isRecord(config)) {
    errors.push(toError("CONFIG_SHAPE_INVALID", "Config object is invalid.", "base"));
    return { ok: false, errors, warnings };
  }

  validatePort(config, errors);
  validateApiPrefix(config, errors);
  validateNodeEnv(config, warnings);
  validateDbPath(config, errors);
  validateMemoryPolicy(config, errors);
  validateRetrievalPolicy(config, errors);
  validateSecurityPolicy(config, errors);
  validateObservabilityPolicy(config, errors);
  validateOperationsPolicy(config, errors);

  const featureValidation = validateFeatureFlags(config.features);
  warnings.push(...featureValidation.warnings);
  errors.push(...featureValidation.errors);
  if (Array.isArray(config.__parseWarnings)) {
    warnings.push(...config.__parseWarnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validatePort(config, errors) {
  const port = Number(config?.app?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(toError("CONFIG_PORT_INVALID", `PORT must be an integer between 1 and 65535 (got "${config?.app?.port}").`, "base", "app.port"));
  }
}

function validateApiPrefix(config, errors) {
  const prefix = String(config?.app?.apiPrefix || "");
  if (!prefix.startsWith("/")) {
    errors.push(toError("CONFIG_API_PREFIX_INVALID", `API_PREFIX must start with '/' (got "${prefix}").`, "base", "app.apiPrefix"));
  }
}

function validateNodeEnv(config, warnings) {
  const nodeEnv = String(config?.app?.nodeEnv || "").trim().toLowerCase();
  const allowed = new Set(["development", "test", "production"]);
  if (!allowed.has(nodeEnv)) {
    warnings.push(toWarning("CONFIG_NODE_ENV_UNRECOGNIZED", `NODE_ENV "${config?.app?.nodeEnv}" is not one of development/test/production.`, "base", "app.nodeEnv"));
  }
}

function validateDbPath(config, errors) {
  const dbFile = String(config?.db?.file || "").trim();
  if (!dbFile) {
    errors.push(toError("CONFIG_DB_FILE_INVALID", "DB_FILE resolved to an empty path.", "base", "db.file"));
  }
}

function validateMemoryPolicy(config, errors) {
  const memory = config?.policy?.memory || {};
  ensurePositiveInt(errors, memory.sessionCacheMax, "CONFIG_MEMORY_SESSION_CACHE_MAX_INVALID", "policy.memory.sessionCacheMax", "base");
  ensurePositiveInt(errors, memory.summaryCacheMax, "CONFIG_MEMORY_SUMMARY_CACHE_MAX_INVALID", "policy.memory.summaryCacheMax", "base");
  ensurePositiveInt(errors, memory.cacheEvictAfterTurns, "CONFIG_MEMORY_CACHE_EVICT_AFTER_TURNS_INVALID", "policy.memory.cacheEvictAfterTurns", "base");
  ensurePositiveInt(errors, memory.memoryWarningHeapMb, "CONFIG_MEMORY_WARNING_HEAP_MB_INVALID", "policy.memory.memoryWarningHeapMb", "base");
  ensurePositiveInt(errors, memory.summaryTriggerTurns, "CONFIG_MEMORY_SUMMARY_TRIGGER_TURNS_INVALID", "policy.memory.summaryTriggerTurns", "base");
  ensurePositiveInt(errors, memory.summaryMaxTokens, "CONFIG_MEMORY_SUMMARY_MAX_TOKENS_INVALID", "policy.memory.summaryMaxTokens", "base");
}

function validateRetrievalPolicy(config, errors) {
  const retrieval = config?.policy?.retrieval || {};
  ensurePositiveInt(errors, retrieval.topK, "CONFIG_RETRIEVAL_TOP_K_INVALID", "policy.retrieval.topK", "v2");
  ensurePositiveInt(errors, retrieval.maxChars, "CONFIG_RETRIEVAL_MAX_CHARS_INVALID", "policy.retrieval.maxChars", "v2");
  ensurePositiveInt(errors, retrieval.maxChunksPerDoc, "CONFIG_RETRIEVAL_MAX_CHUNKS_PER_DOC_INVALID", "policy.retrieval.maxChunksPerDoc", "v2");
  ensurePositiveInt(errors, retrieval.chunkSize, "CONFIG_RETRIEVAL_CHUNK_SIZE_INVALID", "policy.retrieval.chunkSize", "v2");
  ensurePositiveInt(errors, retrieval.chunkOverlap, "CONFIG_RETRIEVAL_CHUNK_OVERLAP_INVALID", "policy.retrieval.chunkOverlap", "v2");
  ensurePositiveInt(errors, retrieval.cacheMaxSessions, "CONFIG_RETRIEVAL_CACHE_MAX_SESSIONS_INVALID", "policy.retrieval.cacheMaxSessions", "v2");
  ensurePositiveInt(errors, retrieval.cacheMaxDocsPerSession, "CONFIG_RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION_INVALID", "policy.retrieval.cacheMaxDocsPerSession", "v2");

  const minScore = Number(retrieval.minScore);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    errors.push(toError("CONFIG_RETRIEVAL_MIN_SCORE_INVALID", `policy.retrieval.minScore must be between 0 and 1 (got "${retrieval.minScore}").`, "v2", "policy.retrieval.minScore"));
  }
}

function validateSecurityPolicy(config, errors) {
  const security = config?.policy?.security || {};
  ensurePositiveInt(errors, security.rateLimitRequests, "CONFIG_SECURITY_RATE_LIMIT_REQUESTS_INVALID", "policy.security.rateLimitRequests", "v2");
  ensurePositiveInt(errors, security.rateLimitWindowMs, "CONFIG_SECURITY_RATE_LIMIT_WINDOW_MS_INVALID", "policy.security.rateLimitWindowMs", "v2");
}

function validateObservabilityPolicy(config, errors) {
  const observability = config?.policy?.observability || {};
  ensurePositiveInt(errors, observability.healthSnapshotEveryNTurns, "CONFIG_OBSERVABILITY_HEALTH_CADENCE_INVALID", "policy.observability.healthSnapshotEveryNTurns", "v2");
  ensurePositiveInt(errors, observability.performanceSnapshotEveryNTurns, "CONFIG_OBSERVABILITY_PERFORMANCE_CADENCE_INVALID", "policy.observability.performanceSnapshotEveryNTurns", "v2");
}

function validateOperationsPolicy(config, errors) {
  const operations = config?.policy?.operations || {};
  ensurePositiveInt(
    errors,
    operations.auditMaxLimit,
    "CONFIG_OPERATIONS_AUDIT_MAX_LIMIT_INVALID",
    "policy.operations.auditMaxLimit",
    "v2",
  );
}

function ensurePositiveInt(errors, value, code, pathRef, scope) {
  if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
    errors.push(toError(code, `${pathRef} must be a positive integer (got "${value}").`, scope, pathRef));
  }
}

function toError(code, message, scope, pathRef) {
  return {
    code,
    message,
    scope,
    path: pathRef,
  };
}

function toWarning(code, message, scope, pathRef) {
  return {
    code,
    message,
    scope,
    path: pathRef,
  };
}

function normalizeCwd(cwd) {
  const value = String(cwd || process.cwd() || ".").trim();
  return value || process.cwd();
}

function resolveDbFilePath(rawValue, cwd) {
  const value = parseString(rawValue, DEFAULTS.DB_FILE);
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }
  return path.resolve(cwd, value);
}

function readEnv(env, key) {
  if (!isRecord(env)) {
    return undefined;
  }
  return env[key];
}

function readEnvAny(env, keys) {
  if (!Array.isArray(keys)) {
    return undefined;
  }
  for (const key of keys) {
    const value = readEnv(env, key);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function parseString(value, fallback) {
  if (typeof value !== "string") {
    return String(fallback);
  }
  const normalized = value.trim();
  return normalized || String(fallback);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return Number(fallback);
  }
  return parsed;
}

function parseFloatValue(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? fallback));
  if (!Number.isFinite(parsed)) {
    return Number(fallback);
  }
  return parsed;
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

function parseBooleanWithWarning(value, fallback, pathRef, warnings) {
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
  if (Array.isArray(warnings)) {
    warnings.push(
      toWarning(
        "CONFIG_BOOLEAN_MALFORMED",
        `${pathRef} received malformed boolean "${value}", using fallback "${fallback}".`,
        "v2",
        pathRef,
      ),
    );
  }
  return Boolean(fallback);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  DEFAULTS,
  getAgentConfig,
  validateAgentConfig,
};
