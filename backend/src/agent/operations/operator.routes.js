"use strict";

const express = require("express");

function createOperatorRoutes({ runtime, operations } = {}) {
  const router = express.Router();
  const ops = operations || runtime?.operations;

  if (!ops) {
    router.use((_req, res) => {
      res.status(503).json({
        error: "AGENT_V2_OPERATIONS_UNAVAILABLE",
        message: "Operations runtime is not available.",
      });
    });
    return router;
  }

  router.use((req, res, next) => enforceAdminGuard(req, res, next, ops));

  router.get("/status", async (_req, res) => {
    try {
      const status = await ops.getRuntimeStatus();
      res.json({ ok: true, status });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: "AGENT_V2_ADMIN_STATUS_FAILED",
        message: safeErrorMessage(error),
      });
    }
  });

  router.get("/audit", async (req, res) => {
    try {
      const limit = req.query?.limit;
      const sessionId = normalizeOptionalString(req.query?.sessionId);
      const eventTypes = parseEventTypes(req.query?.eventTypes);
      const events = await ops.auditExplorer.getRecentAuditEvents({
        limit,
        eventTypes,
        sessionId: sessionId || undefined,
      });
      res.json({ ok: true, count: events.length, events });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: "AGENT_V2_ADMIN_AUDIT_FAILED",
        message: safeErrorMessage(error),
      });
    }
  });

  router.get("/turn-trace/:turnId", async (req, res) => {
    try {
      const turnId = normalizeOptionalString(req.params?.turnId);
      if (!turnId) {
        res.status(400).json({
          ok: false,
          error: "AGENT_V2_ADMIN_TURN_ID_REQUIRED",
          message: "turnId is required.",
        });
        return;
      }

      const turnTrace = await ops.auditExplorer.getTurnTraceByTurnId(turnId);
      if (!turnTrace) {
        res.status(404).json({
          ok: false,
          error: "AGENT_V2_ADMIN_TURN_TRACE_NOT_FOUND",
          message: `No turn_trace record found for turnId \"${turnId}\".`,
        });
        return;
      }

      res.json({ ok: true, turnTrace });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: "AGENT_V2_ADMIN_TURN_TRACE_FAILED",
        message: safeErrorMessage(error),
      });
    }
  });

  router.post("/safe-mode", (req, res) => {
    try {
      const nextState = ops.safeMode.setSafeModeState(req.body);
      const warnings = ops.safeMode.getWarnings();
      res.json({ ok: true, safeMode: nextState, warnings });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: "AGENT_V2_ADMIN_SAFE_MODE_FAILED",
        message: safeErrorMessage(error),
      });
    }
  });

  router.post("/debug-flags", (req, res) => {
    try {
      const nextFlags = ops.debugFlags.setDebugFlags(req.body);
      res.json({ ok: true, debugFlags: nextFlags });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: "AGENT_V2_ADMIN_DEBUG_FLAGS_FAILED",
        message: safeErrorMessage(error),
      });
    }
  });

  return router;
}

function enforceAdminGuard(req, res, next, ops) {
  const decision =
    typeof ops.authorizeAdminRequest === "function"
      ? ops.authorizeAdminRequest(req)
      : { allowed: false, scope: "unknown", reason: "Admin guard unavailable." };

  if (decision.allowed !== true) {
    res.status(403).json({
      ok: false,
      error: "AGENT_V2_ADMIN_FORBIDDEN",
      scope: decision.scope || "unknown",
      reason: decision.reason || "Admin access is required.",
    });
    return;
  }

  next();
}

function parseEventTypes(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error || "unknown error");
}

module.exports = {
  createOperatorRoutes,
};
