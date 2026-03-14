"use strict";

const { getAgentConfig, validateAgentConfig, DEFAULTS } = require("./config.schema");
const {
  FLAG_CATEGORIES,
  FEATURE_FLAG_REGISTRY,
  getFeatureFlags,
  validateFeatureFlags,
} = require("./feature.flags");
const { validateEnvironment } = require("./env.validator");

let cachedState = null;

function initializeDeployment({ env = process.env, cwd = process.cwd(), logger = console, force = false } = {}) {
  if (cachedState && !force) {
    return cachedState;
  }

  const flags = getFeatureFlags(env);
  const config = getAgentConfig(env, { cwd, flags });

  const featureReport = validateFeatureFlags(flags);
  const configReport = validateAgentConfig(config);
  const envReport = validateEnvironment({ config, flags, cwd, env });

  const warnings = dedupeIssues([
    ...featureReport.warnings,
    ...configReport.warnings,
    ...envReport.warnings,
  ]);

  const allErrors = dedupeIssues([
    ...featureReport.errors,
    ...configReport.errors,
    ...envReport.errors,
  ]);

  const v2Enabled = Boolean(flags.values.FEATURE_AGENT_V2_STREAM);
  const blockingErrors = allErrors.filter((issue) => issue.scope !== "v2" || v2Enabled);

  logIssues(logger, warnings, "warn", "[agent.deployment] warning");
  logIssues(logger, allErrors.filter((issue) => !blockingErrors.includes(issue)), "warn", "[agent.deployment] deferred v2 error");

  if (blockingErrors.length > 0) {
    logIssues(logger, blockingErrors, "error", "[agent.deployment] startup error");
    const error = new Error(
      `Agent deployment validation failed with ${blockingErrors.length} blocking issue(s).`,
    );
    error.name = "AgentDeploymentValidationError";
    error.report = {
      ok: false,
      v2Enabled,
      blockingErrors,
      allErrors,
      warnings,
      checks: envReport.checks,
    };
    throw error;
  }

  cachedState = {
    ok: true,
    config,
    flags,
    report: {
      ok: true,
      v2Enabled,
      warnings,
      errors: allErrors,
      checks: envReport.checks,
    },
  };

  return cachedState;
}

function getDeploymentState() {
  return cachedState;
}

function clearDeploymentState() {
  cachedState = null;
}

function logIssues(logger, issues, level, prefix) {
  if (!logger || typeof logger[level] !== "function" || !Array.isArray(issues)) {
    return;
  }
  for (const issue of issues) {
    logger[level](`${prefix}: [${issue.code}] ${issue.message}`);
  }
}

function dedupeIssues(issues) {
  const output = [];
  const seen = new Set();
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") {
      continue;
    }
    const key = `${issue.code || "UNKNOWN"}|${issue.scope || "base"}|${issue.check || ""}|${issue.path || ""}|${issue.message || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(issue);
  }
  return output;
}

module.exports = {
  DEFAULTS,
  FLAG_CATEGORIES,
  FEATURE_FLAG_REGISTRY,
  getFeatureFlags,
  validateFeatureFlags,
  getAgentConfig,
  validateAgentConfig,
  validateEnvironment,
  initializeDeployment,
  getDeploymentState,
  clearDeploymentState,
};
