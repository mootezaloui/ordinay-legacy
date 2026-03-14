const fs = require("node:fs");
const path = require("node:path");
const { initializeDeployment } = require("./agent/deployment");

function loadEnvFiles() {
  // Load backend/.env first (project-level), then src/.env as fallback/override.
  const candidates = [
    path.resolve(__dirname, "..", ".env"),
    path.resolve(__dirname, ".env"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        process.loadEnvFile(file);
      } catch (error) {
        console.warn(`[Env] Failed to load ${file}:`, error?.message || error);
      }
    }
  }
}

loadEnvFiles();

const deploymentState = initializeDeployment({
  env: process.env,
  cwd: path.resolve(__dirname, ".."),
  logger: console,
});

const activeLlmModel = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
console.log(`[LLM] Active model: ${activeLlmModel}`);
{
  const flags = deploymentState.flags.values;
  console.log(
    "[AgentFlags] Deployment",
    JSON.stringify({
      featureAiAgent: flags.FEATURE_AI_AGENT,
      featureMcpIntegration: flags.FEATURE_MCP_INTEGRATION,
      featureAgentV2Stream: flags.FEATURE_AGENT_V2_STREAM,
      deprecatedFlags: {
        AGENT_CHAT_MUTATION_DEBUG: flags.AGENT_CHAT_MUTATION_DEBUG,
        AGENT_MUTATION_DEBUG: flags.AGENT_MUTATION_DEBUG,
        AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS: flags.AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS,
        AGENT_MUTATION_INTENT_DETECTION: flags.AGENT_MUTATION_INTENT_DETECTION,
      },
    }),
  );
}

const app = require("./app");
const { port } = require("./config/app.config");
const { startBackendServers } = require("./server.start");

startBackendServers(app, { port });
