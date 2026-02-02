const express = require("express");

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
const { FEATURE_AI_AGENT } = require("../config/features");

let agentRouter = null;
if (FEATURE_AI_AGENT) {
  agentRouter = require("../agent_Back/agent.router");
}

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
if (agentRouter) {
  router.use("/", agentRouter);
}

module.exports = router;
