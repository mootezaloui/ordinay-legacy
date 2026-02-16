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
    assert(frames.some((f) => f.event === "error"));
    assert(
      frames.some(
        (f) =>
          f.event === "done" &&
          (f.data.status === "error" || f.data.mode === "chatbot"),
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function run() {
  await testChatHttpSuccess();
  await testChatHttpValidationError();
  await testChatHttpServiceError();
  console.log("chat.route.http tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
