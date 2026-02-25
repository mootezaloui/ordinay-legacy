"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

function readSseFrames(text) {
  return String(text || "")
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
}

function assertNoForbiddenLeak(text) {
  const source = String(text || "");
  const forbidden = [
    /\/mutate\b/i,
    /\bpropose_entity_mutation\b/i,
    /\buniversalmutation\b/i,
    /\bpayload\b/i,
    /\bendpoint\b/i,
    /\bapi\b/i,
    /\bsyntax\b/i,
    /\bError:\b/,
    /\bnode:/i,
  ];
  for (const re of forbidden) {
    assert.equal(re.test(source), false, `unexpected leak ${re}`);
  }
}

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("chat user-safe response policy strips internal mutation mechanics from /agent/chat output", async () => {
  const router = require("../agent.router");
  router.__setChatAgentServiceForTests({
    async run() {
      return {
        message:
          'Use /mutate then call propose_entity_mutation with payload {"status":"inactive"} on the endpoint.',
        toolExecutions: [],
        mutationOutcome: {
          status: "FAILED",
          safeMessage:
            "I couldn’t update the client record due to a system error. Try again, or I can prepare the change for confirmation.",
        },
        ambiguityArtifact: {
          type: "proposal",
          sessionId: "sess-sanitize",
          proposals: [
            {
              proposalId: "p-test",
              status: "PROPOSED",
              actionType: "UPDATE_ENTITY",
              requiresConfirmation: true,
              humanReadableSummary:
                'Update client #1 via /mutate payload {"status":"inactive"}',
              affectedEntities: [{ type: "client", id: 1, operation: "update" }],
              reversible: true,
              version: "v3",
              posture: "WORK",
              snapshot: { scope: "client", scopeId: 1, hash: "sha256:test" },
              confirmation: {
                preview: {
                  version: "v1",
                  scope: "workflow",
                  root: { type: "client", id: 1, label: "Client #1", operation: "update" },
                  primaryChanges: [
                    {
                      entityType: "client",
                      entityId: 1,
                      entityLabel: "Client #1",
                      field: "status",
                      from: "active",
                      to: "inactive",
                    },
                  ],
                  cascadeSummary: [
                    {
                      entityType: "task",
                      totalCount: 1,
                      changedFields: ["status"],
                      examples: [
                        {
                          entityType: "task",
                          entityId: 4,
                          entityLabel: "Task #4",
                          field: "status",
                          from: "todo",
                          to: "cancelled via /mutate payload",
                        },
                      ],
                    },
                  ],
                  effects: ["Uses /mutate endpoint payload cleanup"],
                  reversibility: "not_reversible",
                },
              },
              params: { entityType: "client", entityId: 1, changes: { status: "inActive" } },
            },
          ],
        },
      };
    },
  });

  const { server, baseUrl } = await startServer(router);
  try {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "please change it",
        sessionId: "sess-sanitize",
      }),
    });
    assert.equal(response.status, 200);
    const frames = readSseFrames(await response.text());
    const text = frames
      .filter((f) => f.event === "chunk")
      .map((f) => String(f.data?.content || ""))
      .join("");
    assert.match(text, /(couldn.t|could not)/i);
    assertNoForbiddenLeak(text);

    const resultFrame = frames.find((f) => f.event === "result");
    assert.ok(resultFrame, "expected result frame");
    const proposal = resultFrame.data?.output?.proposals?.[0];
    assert.ok(proposal, "expected proposal artifact");
    assert.equal("params" in proposal, false);
    assert.equal("snapshot" in proposal, false);
    assert.equal(typeof proposal.confirmation?.preview, "object");
    assert.equal("primaryChanges" in proposal.confirmation.preview, true);
    assert.equal(String(proposal.confirmation.preview.effects?.[0] || "").includes("/mutate"), false);
    assert.equal(
      String(
        proposal.confirmation.preview.cascadeSummary?.[0]?.examples?.[0]?.to || "",
      ).includes("/mutate"),
      false,
    );
    assertNoForbiddenLeak(proposal.humanReadableSummary || "");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
