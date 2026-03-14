"use strict";

const { createAuditExplorer } = require("./audit.explorer");
const debugFlagsModule = require("./debug.flags");
const { createOperatorRoutes } = require("./operator.routes");
const { getRuntimeStatus } = require("./runtime.status");
const safeModeModule = require("./safe.mode");

function createOperationsRuntime({
  config = {},
  flags = {},
  repository,
  runtime,
  policyOverrides = {},
} = {}) {
  const defaults = resolveDefaults(config, policyOverrides);
  const safeMode = safeModeModule.initializeSafeMode(defaults.safeMode);
  const debugFlags = debugFlagsModule.initializeDebugFlags(defaults.debugFlags);
  const auditExplorer = createAuditExplorer(repository, {
    maxLimit: defaults.audit.maxLimit,
  });

  let runtimeRef = runtime || null;

  function attachRuntime(nextRuntime) {
    runtimeRef = nextRuntime || null;
  }

  async function getRuntimeStatusSnapshot() {
    return getRuntimeStatus(runtimeRef, {
      flags,
      safeMode,
      debugFlags,
      auditExplorer,
    });
  }

  function authorizeAdminRequest(req) {
    const user = toRecord(req?.user);
    const scope = deriveScopeFromUser(user);
    if (scope !== "admin") {
      return {
        allowed: false,
        scope,
        reason: "Admin scope is required for Agent v2 operations endpoints.",
      };
    }

    return {
      allowed: true,
      scope,
    };
  }

  function createAdminRouter() {
    return createOperatorRoutes({ runtime: runtimeRef, operations: api });
  }

  const api = {
    safeMode,
    debugFlags,
    auditExplorer,
    attachRuntime,
    getRuntimeStatus: getRuntimeStatusSnapshot,
    authorizeAdminRequest,
    createAdminRouter,
  };

  return api;
}

function resolveDefaults(config, policyOverrides) {
  const policy = toRecord(config?.policy);
  const operations = toRecord(policy?.operations);
  const safeModePolicy = {
    ...toRecord(operations?.safeMode),
    ...toRecord(policyOverrides?.safeMode),
  };
  const debugFlagsPolicy = {
    ...toRecord(operations?.debugFlags),
    ...toRecord(policyOverrides?.debugFlags),
  };

  return {
    safeMode: {
      writesDisabled: toBoolean(safeModePolicy.writesDisabled, false),
      retrievalDisabled: toBoolean(safeModePolicy.retrievalDisabled, false),
      groundingDisabled: toBoolean(safeModePolicy.groundingDisabled, false),
      summarizationDisabled: toBoolean(safeModePolicy.summarizationDisabled, false),
      forceReadOnly: toBoolean(safeModePolicy.forceReadOnly, false),
      v2Disabled: toBoolean(safeModePolicy.v2Disabled, false),
    },
    debugFlags: {
      verboseTurnTrace: toBoolean(debugFlagsPolicy.verboseTurnTrace, false),
      logToolBoundaryChecks: toBoolean(debugFlagsPolicy.logToolBoundaryChecks, false),
      logRetrievalDecisions: toBoolean(debugFlagsPolicy.logRetrievalDecisions, false),
      exposeOperatorWarnings: toBoolean(debugFlagsPolicy.exposeOperatorWarnings, false),
    },
    audit: {
      maxLimit: normalizePositiveInt(operations?.auditMaxLimit, 100),
    },
  };
}

function deriveScopeFromUser(user) {
  if (!user) {
    return "unknown";
  }

  const direct = normalizeScope(user.scope || user.authScope || user.role);
  if (direct !== "unknown") {
    return direct;
  }

  if (Array.isArray(user.permissions)) {
    const normalized = user.permissions
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean);
    if (normalized.some((entry) => entry.includes("admin"))) {
      return "admin";
    }
    if (normalized.some((entry) => entry.includes("execute") || entry.includes("write"))) {
      return "execute";
    }
    if (normalized.some((entry) => entry.includes("draft"))) {
      return "draft";
    }
    if (normalized.some((entry) => entry.includes("read") || entry.includes("view"))) {
      return "read";
    }
  }

  return "unknown";
}

function normalizeScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["admin", "execute", "draft", "read"].includes(normalized)) {
    return normalized;
  }
  if (["owner", "superadmin"].includes(normalized)) {
    return "admin";
  }
  if (["readonly", "read_only", "reader"].includes(normalized)) {
    return "read";
  }
  return "unknown";
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  createOperationsRuntime,
  createOperatorRoutes,
  ...safeModeModule,
  ...debugFlagsModule,
  createAuditExplorer,
  getRuntimeStatus,
};
