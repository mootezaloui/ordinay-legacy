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
const { FEATURE_AI_AGENT, FEATURE_AGENT_V2_STREAM } = require("../config/features");

let agentRouter = null;
if (FEATURE_AI_AGENT) {
  agentRouter = require("../agent_Back/agent.router");
}

let agentV2Router = null;
if (FEATURE_AGENT_V2_STREAM) {
  agentV2Router = loadAgentV2Router();
}

const https = require("https");

const router = express.Router();

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
router.use("/agent/sessions/:sessionId/documents", agentDocumentsRouter);
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
