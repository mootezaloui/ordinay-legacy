"use strict";

const path = require("node:path");

function resolveTransportModule() {
  const candidates = buildTransportCandidates();
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      return require(resolved);
    } catch {
      continue;
    }
  }
  throw new Error(
    `Unable to resolve live Agent v2 transport module. Tried: ${candidates.join(", ")}`,
  );
}

function createLiveRuntime() {
  const transport = resolveTransportModule();
  if (typeof transport.createAgentV2Runtime !== "function") {
    throw new Error("Transport module missing createAgentV2Runtime export.");
  }
  return transport.createAgentV2Runtime();
}

function createLiveStreamHandler(runtime) {
  const transport = resolveTransportModule();
  if (typeof transport.createAgentV2StreamHandler !== "function") {
    throw new Error("Transport module missing createAgentV2StreamHandler export.");
  }
  return transport.createAgentV2StreamHandler(runtime);
}

function buildTransportCandidates() {
  return dedupe([
    path.resolve(__dirname, "../../../.agent-build/agent/transport"),
    path.resolve(__dirname, "../../.agent-build/agent/transport"),
    path.resolve(process.cwd(), ".agent-build/agent/transport"),
    path.resolve(process.cwd(), "backend/.agent-build/agent/transport"),
    path.resolve(__dirname, "../transport"),
    path.resolve(process.cwd(), "src/agent/transport"),
    path.resolve(process.cwd(), "backend/src/agent/transport"),
  ]);
}

function dedupe(items) {
  return [...new Set(items)];
}

module.exports = {
  resolveTransportModule,
  createLiveRuntime,
  createLiveStreamHandler,
};

