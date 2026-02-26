"use strict";

const AgentEngine = require("../agent.engine");
const { ChatOrchestrator } = require("./chat.orchestrator");

async function main() {
  const engine = new AgentEngine();
  const orchestrator = new ChatOrchestrator({ engine });

  const result = await orchestrator.runChatTurn({
    message: process.argv.slice(2).join(" ") || "List recent dossiers",
    context: { dataAccess: {} },
    agentVersion: "v3",
    sessionId: "dev-orchestrator-session",
    userId: "dev-user",
  });

  console.log(
    JSON.stringify(
      {
        state: result.state,
        intent: result.intent,
        message: result.message,
        artifactType: result.outputArtifact?.type || result.ambiguityArtifact?.type || "none",
        toolCalls: Array.isArray(result.toolExecutions) ? result.toolExecutions.length : 0,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});

