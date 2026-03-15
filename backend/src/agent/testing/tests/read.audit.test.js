"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const getEntityGraphTool = require("../../tools/read/getEntityGraph.tool");
const listDossiersTool = require("../../tools/read/listDossiers.tool");
const { runScenario } = require("../scenario.runner");

test("read audit: client workload turn calls at least one workload read tool", async () => {
  const fixture = createLoopFixture({
    id: "read_audit_client_workload",
    message: "Show client Leila Ben Youssef. What is her workload and cases?",
    setup(runtime) {
      installSyntheticReadTool(runtime, "getEntityGraph", async () => ({
        ok: true,
        data: {
          root: { type: "client", id: 10 },
          parents: {},
          children: { dossiers: [{ id: 101 }], tasks: [{ id: 201 }, { id: 202 }] },
          metrics: { totalDossiers: 1, totalTasks: 2 },
          generatedAt: new Date().toISOString(),
        },
      }));

      return queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [
            {
              id: "tc_graph_1",
              name: "getEntityGraph",
              arguments: { entityType: "client", entityId: 10, depth: 2, direction: "both" },
            },
          ],
        },
        { text: "Leila has one dossier and two tasks.", toolCalls: [] },
      ]);
    },
    assert(result) {
      const names = (result?.output?.toolCalls || []).map((row) => row.toolName);
      assert.ok(
        names.some((name) => ["getEntityGraph", "listDossiers", "listTasks"].includes(name)),
        `Expected workload read tool call, got: ${names.join(", ")}`,
      );
    },
  });

  await runScenario(fixture);
});

test("read audit: active dossier workload summary calls dossier and task retrieval", async () => {
  const fixture = createLoopFixture({
    id: "read_audit_active_workload",
    message: "Summarize workload across active dossiers",
    setup(runtime) {
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: { dossiers: [{ id: 101, status: "open" }], count: 1 },
      }));
      installSyntheticReadTool(runtime, "listTasks", async () => ({
        ok: true,
        data: { tasks: [{ id: 301 }, { id: 302 }], count: 2 },
      }));

      return queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [
            { id: "tc_list_dossiers", name: "listDossiers", arguments: { status: "open" } },
            { id: "tc_list_tasks", name: "listTasks", arguments: { status: "todo" } },
          ],
        },
        { text: "Active dossiers workload summarized.", toolCalls: [] },
      ]);
    },
    assert(result) {
      const names = (result?.output?.toolCalls || []).map((row) => row.toolName);
      assert.ok(names.includes("listDossiers"), "Expected listDossiers tool call.");
      assert.ok(names.includes("listTasks"), "Expected listTasks tool call.");
    },
  });

  await runScenario(fixture);
});

test("read audit: dossier reference task lookup follows getDossierByReference then listTasks", async () => {
  const fixture = createLoopFixture({
    id: "read_audit_reference_lookup",
    message: "Show tasks for dossier D-2024-019",
    setup(runtime) {
      installSyntheticReadTool(runtime, "getDossierByReference", async (_context, args) => ({
        ok: true,
        data: { dossier: { id: 222, reference: args.reference || "D-2024-019" } },
      }));
      installSyntheticReadTool(runtime, "listTasks", async () => ({
        ok: true,
        data: { tasks: [{ id: 401, dossier_id: 222 }], count: 1 },
      }));

      return queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [
            {
              id: "tc_ref_1",
              name: "getDossierByReference",
              arguments: { reference: "D-2024-019" },
            },
          ],
        },
        {
          text: "",
          toolCalls: [{ id: "tc_ref_2", name: "listTasks", arguments: { dossierId: 222 } }],
        },
        { text: "Dossier tasks loaded.", toolCalls: [] },
      ]);
    },
    assert(result) {
      const sequence = (result?.output?.toolCalls || []).map((row) => row.toolName);
      assert.deepEqual(sequence.slice(0, 2), ["getDossierByReference", "listTasks"]);
    },
  });

  await runScenario(fixture);
});

test("read audit: graph depth=1 vs depth=2 changes entity coverage", async () => {
  const services = createGraphServicesFixture();
  const depthOne = await getEntityGraphTool.handler(
    { entityType: "client", entityId: 10, direction: "down", depth: 1 },
    { services },
  );
  const depthTwo = await getEntityGraphTool.handler(
    { entityType: "client", entityId: 10, direction: "down", depth: 2 },
    { services },
  );

  assert.equal(depthOne.metrics.totalTasks, 0);
  assert.equal(depthTwo.metrics.totalTasks, 1);
});

test("read audit: db-related no-tool answer emits READ_WARNING", async () => {
  const fixture = createLoopFixture({
    id: "read_audit_no_tool_warning",
    message: "What is the workload for this client?",
    setup(runtime) {
      return queueLlmResponses(runtime, [{ text: "No records found.", toolCalls: [] }]);
    },
  });

  const { records } = await withCapturedConsole(async () => runScenario(fixture));
  const warningLines = records.warn.map((args) => args.join(" "));
  assert.ok(
    warningLines.some((line) => line.includes("[READ_WARNING]")),
    "Expected [READ_WARNING] log when no tools are used for DB-related question.",
  );
});

test("read audit: invalid status input emits STATUS_WARNING", async () => {
  const { records } = await withCapturedConsole(async () =>
    listDossiersTool.handler({ status: "not_a_real_status", limit: 1 }),
  );
  const warningLines = records.warn.map((args) => args.join(" "));
  assert.ok(
    warningLines.some((line) => line.includes("[STATUS_WARNING]")),
    "Expected [STATUS_WARNING] log for invalid status.",
  );
});

test("read audit: request-level READ summary log is emitted once per turn", async () => {
  const fixture = createLoopFixture({
    id: "read_audit_summary_log",
    message: "List open dossiers",
    setup(runtime) {
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: { dossiers: [], count: 0 },
      }));
      return queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [{ id: "tc_summary_1", name: "listDossiers", arguments: { status: "open" } }],
        },
        { text: "Done.", toolCalls: [] },
      ]);
    },
  });

  const { records } = await withCapturedConsole(async () => runScenario(fixture));
  const summaryLogs = records.info.filter(
    (args) => args[0] === "[READ_OBSERVABILITY_SUMMARY]",
  );
  assert.equal(summaryLogs.length, 1, "Expected one summary log per request.");
  assert.equal(summaryLogs[0][1]?.READ_TOOL_CALL_COUNT, 1);
  assert.equal(summaryLogs[0][1]?.READ_EMPTY_RESULTS, 1);
});

function createLoopFixture({ id, message, setup, assert: assertFn }) {
  return {
    id,
    target: "loop_core",
    input: {
      sessionId: `${id}_session`,
      turnId: `${id}_turn_1`,
      message,
      mode: "READ_ONLY",
      metadata: {},
    },
    setup,
    assert: assertFn,
  };
}

function installSyntheticReadTool(runtime, name, handler) {
  const registry = runtime?.loop?.registry;
  if (!registry || !(registry.tools instanceof Map)) {
    throw new Error("Unable to install synthetic tool: missing registry map.");
  }
  registry.tools.set(name, {
    name,
    category: "READ",
    description: `Synthetic read tool ${name}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: true },
    outputSchema: undefined,
    sideEffects: false,
    handler: async (context, args) => handler(context, args),
  });
}

function queueLlmResponses(runtime, responses) {
  const llm = runtime?.loop?.llm;
  if (!llm || typeof llm.generate !== "function") {
    throw new Error("Unable to patch LLM generate for read audit test.");
  }

  const queue = Array.isArray(responses) ? [...responses] : [];
  const original = llm.generate.bind(llm);
  llm.generate = async () => {
    const next = queue.length > 0 ? queue.shift() : { text: "Done.", toolCalls: [] };
    return {
      text: String(next?.text || ""),
      toolCalls: Array.isArray(next?.toolCalls) ? next.toolCalls : [],
      finishReason: "stop",
      raw: next,
    };
  };

  return () => {
    llm.generate = original;
  };
}

async function withCapturedConsole(fn) {
  const records = { info: [], warn: [] };
  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.info = (...args) => {
    records.info.push(args);
  };
  console.warn = (...args) => {
    records.warn.push(args);
  };

  try {
    const result = await fn();
    return { result, records };
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

function createGraphServicesFixture() {
  return {
    clients: {
      get(id) {
        return id === 10 ? { id: 10, name: "Leila Ben Youssef", status: "active" } : null;
      },
    },
    dossiers: {
      get(id) {
        return id === 100
          ? { id: 100, client_id: 10, reference: "DOS-2026-100", title: "Family Matter", status: "open" }
          : null;
      },
      listByClient(clientId) {
        return Number(clientId) === 10 ? [this.get(100)] : [];
      },
    },
    lawsuits: {
      get() {
        return null;
      },
      listByDossier() {
        return [];
      },
    },
    tasks: {
      get(id) {
        return id === 200
          ? { id: 200, dossier_id: 100, title: "Prepare filing", status: "todo", priority: "medium" }
          : null;
      },
      listByDossier(dossierId) {
        return Number(dossierId) === 100 ? [this.get(200)] : [];
      },
      listByLawsuit() {
        return [];
      },
    },
    missions: {
      get() {
        return null;
      },
      listByDossier() {
        return [];
      },
      listByLawsuit() {
        return [];
      },
    },
    sessions: {
      get() {
        return null;
      },
      listByDossier() {
        return [];
      },
      listByLawsuit() {
        return [];
      },
    },
    documents: {
      get() {
        return null;
      },
      listByClient() {
        return [];
      },
      listByDossier() {
        return [];
      },
      listByLawsuit() {
        return [];
      },
      listByTask() {
        return [];
      },
      listByMission() {
        return [];
      },
      listBySession() {
        return [];
      },
    },
  };
}
