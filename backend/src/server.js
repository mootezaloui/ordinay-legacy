const fs = require("node:fs");
const path = require("node:path");

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

function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return { raw: raw ?? null, effective: Boolean(defaultValue) };
  const normalized = String(raw).trim().toLowerCase();
  return {
    raw,
    effective: ["1", "true", "yes", "on"].includes(normalized),
  };
}

function envFlagAny(names = [], defaultValue = false) {
  for (const name of names) {
    const flag = envFlag(name, false);
    if (flag.raw != null && flag.raw !== "") return { ...flag, source: name };
  }
  return { raw: null, effective: Boolean(defaultValue), source: null };
}

const activeLlmModel = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
console.log(`[LLM] Active model: ${activeLlmModel}`);
{
  const debugFlag = envFlagAny(
    ["AGENT_CHAT_MUTATION_DEBUG", "AGENT_MUTATION_DEBUG"],
    process.env.NODE_ENV !== "production",
  );
  const adaptiveFlag = envFlag("AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS", true);
  const intentDetectionFlag = envFlag("AGENT_MUTATION_INTENT_DETECTION", true);
  console.log(
    "[AgentFlags] Mutation",
    JSON.stringify({
      chatMutationDebug: debugFlag,
      adaptiveDomainConstraints: adaptiveFlag,
      mutationIntentDetection: intentDetectionFlag,
    }),
  );
}

const app = require("./app");
const { port } = require("./config/app.config");
const { startBackendServers } = require("./server.start");

startBackendServers(app, { port });
