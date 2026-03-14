"use strict";

const fs = require("node:fs");
const path = require("node:path");

function validateEnvironment({ config, flags, cwd = process.cwd(), env = process.env } = {}) {
  const checks = [];

  checks.push(checkNodeVersion(env));
  checks.push(checkDbDirectory(config));
  checks.push(checkDbFilePath(config));
  checks.push(checkLogsDirectory(cwd));

  const v2Enabled = Boolean(flags?.values?.FEATURE_AGENT_V2_STREAM);
  checks.push(checkV2RuntimeArtifacts(cwd, v2Enabled));
  checks.push(checkV2RouteModule(cwd, v2Enabled));

  const errors = checks
    .filter((check) => check.ok === false && check.critical === true)
    .map(toIssue);
  const warnings = checks
    .filter((check) => check.ok === false && check.critical === false)
    .map(toIssue);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}

function checkNodeVersion(env) {
  const raw = String(env?.NODE_VERSION || process.version || "");
  const version = raw.startsWith("v") ? raw.slice(1) : raw;
  const major = Number.parseInt(version.split(".")[0], 10);
  const ok = Number.isInteger(major) && major >= 20;

  return {
    name: "node_version",
    scope: "base",
    critical: true,
    ok,
    message: ok
      ? `Node version ${process.version} is supported.`
      : `Node >= 20 is required (current ${process.version || raw || "unknown"}).`,
  };
}

function checkDbDirectory(config) {
  const dbPath = normalizeDbPath(config);
  const dir = path.dirname(dbPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return {
      name: "db_directory_writable",
      scope: "base",
      critical: true,
      ok: true,
      message: `Database directory is writable: ${dir}`,
    };
  } catch (error) {
    return {
      name: "db_directory_writable",
      scope: "base",
      critical: true,
      ok: false,
      message: `Database directory is not writable: ${dir} (${safeErrorMessage(error)})`,
    };
  }
}

function checkDbFilePath(config) {
  const dbPath = normalizeDbPath(config);
  if (!dbPath) {
    return {
      name: "db_path_present",
      scope: "base",
      critical: true,
      ok: false,
      message: "DB file path is empty.",
    };
  }

  return {
    name: "db_path_present",
    scope: "base",
    critical: true,
    ok: true,
    message: `Database path resolved: ${dbPath}`,
  };
}

function checkLogsDirectory(cwd) {
  const logsDir = path.resolve(String(cwd || process.cwd()), "logs");
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.accessSync(logsDir, fs.constants.W_OK);
    return {
      name: "logs_directory_writable",
      scope: "base",
      critical: false,
      ok: true,
      message: `Logs directory is writable: ${logsDir}`,
    };
  } catch (error) {
    return {
      name: "logs_directory_writable",
      scope: "base",
      critical: false,
      ok: false,
      message: `Logs directory is not writable: ${logsDir} (${safeErrorMessage(error)})`,
    };
  }
}

function checkV2RuntimeArtifacts(cwd, v2Enabled) {
  const runtimePath = path.resolve(String(cwd || process.cwd()), ".agent-build/agent/transport/index.js");
  const exists = fs.existsSync(runtimePath);
  return {
    name: "v2_runtime_artifact",
    scope: "v2",
    critical: v2Enabled,
    ok: exists,
    message: exists
      ? `V2 runtime artifact found: ${runtimePath}`
      : `V2 runtime artifact missing: ${runtimePath}`,
  };
}

function checkV2RouteModule(cwd, v2Enabled) {
  const routePath = path.resolve(String(cwd || process.cwd()), "src/routes/agent.v2.routes.js");
  const exists = fs.existsSync(routePath);
  return {
    name: "v2_route_module",
    scope: "v2",
    critical: v2Enabled,
    ok: exists,
    message: exists
      ? `V2 route module found: ${routePath}`
      : `V2 route module missing: ${routePath}`,
  };
}

function toIssue(check) {
  return {
    code: check.scope === "v2" ? "ENV_VALIDATION_V2_CHECK_FAILED" : "ENV_VALIDATION_CHECK_FAILED",
    scope: check.scope,
    check: check.name,
    message: check.message,
  };
}

function normalizeDbPath(config) {
  const value = String(config?.db?.file || "").trim();
  return value;
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error || "unknown error");
}

module.exports = {
  validateEnvironment,
};
