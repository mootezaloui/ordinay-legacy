"use strict";

const assert = require("assert");
const express = require("express");

const agentRouter = require("../agent.router");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/", agentRouter);
  return app;
}

async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function readSse(response) {
  const text = await response.text();
  const frames = text
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        event: eventLine ? eventLine.slice(7).trim() : "",
        data: dataLine ? JSON.parse(dataLine.slice(6)) : {},
      };
    });
  return frames;
}

async function testChatHttpSuccess() {
  let captured = null;
  agentRouter.__setChatAgentServiceForTests({
    async run(payload) {
      captured = payload;
      return {
        message: "Chatbot answer",
        toolExecutions: [{ toolName: "listTasks", ok: true }],
      };
    },
  });

  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "hello",
        agentVersion: "v3",
        sessionId: "sess-http-1",
        context: {
          scope: "GLOBAL",
          dataAccess: {
            clients: true,
            dossiers: false,
            lawsuits: true,
            tasks: true,
            personalTasks: true,
            missions: true,
            sessions: true,
            financialEntries: true,
            notifications: true,
            history: true,
            documents: true,
          },
        },
      }),
    });

    assert.strictEqual(response.status, 200);
    const frames = await readSse(response);
    assert(frames.some((f) => f.event === "start"));
    const streamed = frames
      .filter((f) => f.event === "chunk")
      .map((f) => String(f.data?.content || ""))
      .join("");
    assert.strictEqual(streamed.trim(), "Chatbot answer");
    assert(frames.some((f) => f.event === "done"));
    assert(captured);
    assert.strictEqual(captured.context.dataAccess.dossiers, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testChatHttpFollowUpIntentForwarding() {
  let captured = null;
  agentRouter.__setChatAgentServiceForTests({
    async run(payload) {
      captured = payload;
      return {
        message: "Follow-up handled",
        toolExecutions: [],
      };
    },
  });

  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "continue please",
        // Avoid read pre-routing so this test validates forwarding to chat service.
        // A pure conversational follow-up must still be passed through.
        // "continue please" keeps it non-read.
        sessionId: "sess-http-followup",
        followUpIntent: {
          intent: "RESOLVE_CONTEXT_AND_CONTINUE",
          originalIntent: "READ_DOSSIER",
          resolvedEntity: { type: "dossier", id: 10, label: "Divorce Case" },
          scope: { dossierId: 10 },
        },
      }),
    });

    assert.strictEqual(response.status, 200);
    await readSse(response);
    assert(captured);
    assert.strictEqual(
      captured.followUpIntent?.intent,
      "RESOLVE_CONTEXT_AND_CONTINUE",
    );
    assert.strictEqual(captured.followUpIntent?.scope?.dossierId, 10);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testChatHttpReadPreRouteBypassesChatService() {
  let called = 0;
  agentRouter.__setChatAgentServiceForTests({
    async run() {
      called += 1;
      throw new Error("chat_service_should_not_run_for_read");
    },
  });

  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "show dossier 1",
        sessionId: "sess-http-followup",
      }),
    });

    assert.strictEqual(response.status, 200);
    const frames = await readSse(response);
    assert(frames.some((f) => f.event === "result"));
    assert(frames.some((f) => f.event === "done"));
    assert.strictEqual(called, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testChatHttpValidationError() {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "",
      }),
    });
    assert.strictEqual(response.status, 400);
    const payload = await response.json();
    assert.strictEqual(payload.error, "Message is required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testChatHttpServiceError() {
  agentRouter.__setChatAgentServiceForTests({
    async run() {
      throw new Error("forced_failure");
    },
  });

  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "hello",
        sessionId: "sess-http-2",
      }),
    });

    assert.strictEqual(response.status, 200);
    const frames = await readSse(response);
    assert.strictEqual(frames.some((f) => f.event === "error"), false);
    const resultFrame = frames.find((f) => f.event === "result");
    assert(resultFrame);
    assert.strictEqual(resultFrame.data?.output?.type, "recovery");
    assert(
      frames.some(
        (f) =>
          f.event === "done" &&
          (f.data.status === "success" || f.data.mode === "chatbot"),
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testChatHttpAmbiguityArtifact() {
  agentRouter.__setChatAgentServiceForTests({
    async run() {
      return {
        message: "I found multiple dossiers. Please choose one.",
        toolExecutions: [],
        ambiguityArtifact: {
          type: "context_suggestion",
          message: "I found multiple dossiers. Please choose one.",
          entityType: "dossier",
          reason: "multiple_matches",
          originalIntent: "READ_DOSSIER",
          originalMessage: "show dossier case",
          suggestions: [
            {
              id: "dossier-10-0",
              entityType: "dossier",
              entityId: 10,
              label: "Divorce Case",
              subtitle: "DOS-10",
              metadata: { score: 0.93, signal: "match 93%" },
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
              scope: { dossierId: 10 },
            },
            {
              id: "dossier-11-1",
              entityType: "dossier",
              entityId: 11,
              label: "Commercial Case",
              subtitle: "DOS-11",
              metadata: { score: 0.91, signal: "match 91%" },
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
              scope: { dossierId: 11 },
            },
          ],
          timestamp: new Date().toISOString(),
          source: "rule-based",
          allowManualInput: true,
          manualInputHint: "Provide dossier ID if not listed.",
        },
      };
    },
  });

  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "need help choosing one",
        sessionId: "sess-http-amb",
      }),
    });

    assert.strictEqual(response.status, 200);
    const frames = await readSse(response);
    assert(frames.some((f) => f.event === "start"));
    const resultFrame = frames.find((f) => f.event === "result");
    assert(resultFrame);
    assert.strictEqual(resultFrame.data?.output?.type, "context_suggestion");
    assert(frames.some((f) => f.event === "done"));
    assert.strictEqual(
      frames.some((f) => f.event === "chunk"),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function run() {
  await testChatHttpSuccess();
  await testChatHttpFollowUpIntentForwarding();
  await testChatHttpReadPreRouteBypassesChatService();
  await testChatHttpValidationError();
  await testChatHttpServiceError();
  await testChatHttpAmbiguityArtifact();
  console.log("chat.route.http tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
