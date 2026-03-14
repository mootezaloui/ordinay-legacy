const express = require("express");

function createAgentV2Router({ runtime, createHandler }) {
  const router = express.Router();
  if (typeof createHandler !== "function") {
    throw new Error("Agent v2 route requires a createHandler function.");
  }

  const handler = createHandler(runtime);
  router.post("/agent/v2/stream", handler);

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
};
