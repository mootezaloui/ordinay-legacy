const express = require("express");
const crypto = require("crypto");

const STREAM_AUTH_HEADER = "x-ordinay-stream-auth";
const STREAM_AUTH_VERSION = "v1";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const streamAuthRequired = parseBoolean(
  process.env.AGENT_STREAM_AUTH_REQUIRED,
  parseBoolean(process.env.AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND, false),
);
const streamAuthSecret = String(
  process.env.AGENT_STREAM_AUTH_SECRET || process.env.BACKEND_API_TOKEN || "",
).trim();
const streamAuthTtlSeconds = parsePositiveInt(
  process.env.AGENT_STREAM_AUTH_TTL_SECONDS,
  300,
);

function timingSafeEquals(left, right) {
  const leftBuf = Buffer.from(String(left || ""), "utf8");
  const rightBuf = Buffer.from(String(right || ""), "utf8");
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function createExpectedStreamSignature(sessionId, issuedAtSec) {
  return crypto
    .createHmac("sha256", streamAuthSecret)
    .update(`${String(sessionId)}:${String(issuedAtSec)}`)
    .digest("base64url");
}

function validateSessionScopedStreamToken(token, sessionId) {
  const normalized = String(token || "").trim();
  const parts = normalized.split(".");
  if (parts.length !== 3 || parts[0] !== STREAM_AUTH_VERSION) {
    return { ok: false, reason: "Malformed stream token." };
  }

  const issuedAtSec = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(issuedAtSec) || issuedAtSec <= 0) {
    return { ok: false, reason: "Invalid stream token timestamp." };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - issuedAtSec) > streamAuthTtlSeconds) {
    return { ok: false, reason: "Stream token expired." };
  }

  const expected = createExpectedStreamSignature(sessionId, issuedAtSec);
  if (!timingSafeEquals(parts[2], expected)) {
    return { ok: false, reason: "Invalid stream token signature." };
  }

  return { ok: true };
}

function enforceStreamSessionAuth(req, res, next) {
  if (!streamAuthRequired) {
    next();
    return;
  }

  if (!streamAuthSecret) {
    res.status(500).json({
      error: "stream_auth_not_configured",
      message:
        "AGENT_STREAM_AUTH_SECRET (or BACKEND_API_TOKEN) is required when stream auth is enabled.",
    });
    return;
  }

  const sessionId = String(req.body?.sessionId || "").trim();
  if (!sessionId) {
    res.status(400).json({
      error: "stream_session_id_required",
      message: "sessionId is required for stream authentication.",
    });
    return;
  }

  const headerValue = req.headers[STREAM_AUTH_HEADER];
  const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!token) {
    res.status(401).json({
      error: "stream_unauthorized",
      message: `Missing ${STREAM_AUTH_HEADER} header.`,
    });
    return;
  }

  const result = validateSessionScopedStreamToken(token, sessionId);
  if (!result.ok) {
    res.status(401).json({
      error: "stream_unauthorized",
      message: result.reason || "Stream auth failed.",
    });
    return;
  }

  next();
}

function createAgentV2Router({ runtime, createHandler }) {
  const router = express.Router();
  if (typeof createHandler !== "function") {
    throw new Error("Agent v2 route requires a createHandler function.");
  }

  const handler = createHandler(runtime);
  router.post("/agent/v2/stream", enforceStreamSessionAuth, handler);

  const adminRouter = createAdminRouter(runtime);
  router.use("/agent/v2/admin", adminRouter);

  return router;
}

function createAdminRouter(runtime) {
  const router = express.Router();
  const operations = runtime?.operations;

  if (operations && typeof operations.createAdminRouter === "function") {
    try {
      return operations.createAdminRouter();
    } catch (error) {
      const message = safeErrorMessage(error);
      console.warn(`[agent.v2] Failed to create admin routes: ${message}`);
    }
  }

  router.use((_req, res) => {
    res.status(503).json({
      ok: false,
      error: "AGENT_V2_OPERATIONS_UNAVAILABLE",
      message: "Operational controls are unavailable.",
    });
  });
  return router;
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error || "unknown error");
}

module.exports = {
  createAgentV2Router,
  validateSessionScopedStreamToken,
};
