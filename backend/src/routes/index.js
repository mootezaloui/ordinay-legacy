const express = require("express");
const path = require("node:path");

const clientsRouter = require("./clients.routes");
const dossiersRouter = require("./dossiers.routes");
const lawsuitsRouter = require("./lawsuits.routes");
const tasksRouter = require("./tasks.routes");
const sessionsRouter = require("./sessions.routes");
const missionsRouter = require("./missions.routes");
const officersRouter = require("./officers.routes");
const financialRouter = require("./financial.routes");
const documentsRouter = require("./documents.routes");
const notificationsRouter = require("./notifications.routes");
const emailRouter = require("./email.routes");
const personalTasksRouter = require("./personalTasks.routes");
const historyRouter = require("./history.routes");
const notesRouter = require("./notes.routes");
const operatorsRouter = require("./operators.routes");
const profileRouter = require("./profile.routes");
const dashboardRouter = require("./dashboard.routes");
const importsRouter = require("./imports.routes");
const agentDocumentsRouter = require("./agentDocuments.routes");
const settingsRouter = require("./settings.routes");
const { FEATURE_AI_AGENT, FEATURE_AGENT_V2_STREAM } = require("../config/features");

const AGENT_ROUTE_DIAGNOSTICS_ENABLED = parseBoolean(
  process.env.AGENT_ROUTE_DIAGNOSTICS,
  true,
);

let agentRouter = null;
// Legacy /agent/chat router has been retired; keep mount disabled.
if (FEATURE_AI_AGENT) {
  agentRouter = null;
}

let agentV2Router = null;
if (FEATURE_AGENT_V2_STREAM) {
  agentV2Router = loadAgentV2Router();
}

const https = require("https");

const router = express.Router();
if (AGENT_ROUTE_DIAGNOSTICS_ENABLED) {
  console.warn(
    "[AGENT_ROUTE_CONFIG]",
    JSON.stringify({
      featureAiAgent: FEATURE_AI_AGENT,
      featureAgentV2Stream: FEATURE_AGENT_V2_STREAM,
      legacyAgentMounted: Boolean(agentRouter),
      agentV2Mounted: Boolean(agentV2Router),
    }),
  );
}

router.use("/clients", clientsRouter);
router.use("/dossiers", dossiersRouter);
router.use("/lawsuits", lawsuitsRouter);
router.use("/tasks", tasksRouter);
router.use("/personal-tasks", personalTasksRouter);
router.use("/sessions", sessionsRouter);
router.use("/missions", missionsRouter);
router.use("/officers", officersRouter);
router.use("/financial", financialRouter);
router.use("/documents", documentsRouter);
router.use("/notifications", notificationsRouter);
router.use("/email", emailRouter);
router.use("/history", historyRouter);
router.use("/notes", notesRouter);
router.use("/operators", operatorsRouter);
router.use("/profile", profileRouter);
router.use("/dashboard", dashboardRouter);
router.use("/imports", importsRouter);
router.use("/settings", settingsRouter);
router.use("/agent/sessions/:sessionId/documents", agentDocumentsRouter);
router.use((req, _res, next) => {
  if (!AGENT_ROUTE_DIAGNOSTICS_ENABLED) {
    next();
    return;
  }

  const routePath = String(req.path || "");
  if (
    req.method === "POST" &&
    (routePath === "/agent/chat" || routePath === "/agent/v2/stream")
  ) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const metadata =
      body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const conversationId = asString(body.conversationId) || asString(body.sessionId) || null;
    const turnId = asString(body.turnId) || null;
    const mode = asString(body.mode) || null;
    const requestSource = asString(metadata.requestSource) || null;
    const requestTriggerId = asString(metadata.requestTriggerId) || null;
    console.warn(
      "[AGENT_ROUTE_HIT]",
      JSON.stringify({
        method: req.method,
        routePath,
        conversationId,
        turnId,
        mode,
        requestSource,
        requestTriggerId,
        legacyAgentMounted: Boolean(agentRouter),
        agentV2Mounted: Boolean(agentV2Router),
      }),
    );
  }

  next();
});
if (agentRouter) {
  router.use("/", agentRouter);
}

router.get("/ping", (_req, res) => {
  const probe = https.request(
    { hostname: "www.google.com", method: "HEAD", path: "/", timeout: 3000 },
    () => { res.json({ online: true }); probe.destroy(); },
  );
  probe.on("error", () => res.json({ online: false }));
  probe.on("timeout", () => { probe.destroy(); res.json({ online: false }); });
  probe.end();
});

if (agentV2Router) {
  router.use("/", agentV2Router);
}

function loadAgentV2Router() {
  const reasonPrefix = "Agent v2 route enabled but runtime is unavailable";

  try {
    const transportModulePath = path.resolve(
      __dirname,
      "../../.agent-build/agent/transport",
    );
    const transport = require(transportModulePath);
    const { createAgentV2Router } = require("./agent.v2.routes");

    if (
      typeof transport.createAgentV2Runtime !== "function" ||
      typeof transport.createAgentV2StreamHandler !== "function"
    ) {
      throw new Error("Transport factory exports are missing.");
    }

    const runtime = transport.createAgentV2Runtime();
    return createAgentV2Router({
      runtime,
      createHandler: transport.createAgentV2StreamHandler,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Unknown transport loading failure.";
    console.warn(`[agent.v2] ${reasonPrefix}: ${message}`);
    return createAgentV2FallbackRouter(`${reasonPrefix}: ${message}`);
  }
}

function createAgentV2FallbackRouter(message) {
  const router = express.Router();
  router.post("/agent/v2/stream", (_req, res) => {
    res.status(503).json({
      error: "AGENT_V2_UNAVAILABLE",
      message,
    });
  });
  return router;
}

module.exports = router;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function asString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
