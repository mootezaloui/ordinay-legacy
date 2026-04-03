"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("permission gate enforces scope/category policy (mode-free)", () => {
  const runtime = createLiveRuntime();
  const gate = runtime?.loop?.permissionGate;
  assert.ok(gate, "Expected runtime.loop.permissionGate to be available.");

  const readTool = createSyntheticTool("READ", "syntheticRead");
  const draftTool = createSyntheticTool("DRAFT", "syntheticDraft");
  const externalTool = createSyntheticTool("EXTERNAL", "syntheticExternal");
  const planTool = createSyntheticTool("PLAN", "syntheticPlan");
  const writeTool = createSyntheticTool("WRITE", "syntheticWrite");
  const executeTool = createSyntheticTool("EXECUTE", "syntheticExecute");
  const systemTool = createSyntheticTool("SYSTEM", "syntheticSystem");

  assertDecision(gate.evaluate("read", readTool), true, false);
  assertDecision(gate.evaluate("read", externalTool), true, false);
  assertDecision(gate.evaluate("read", draftTool), false, false);
  assertDecision(gate.evaluate("read", planTool), false, false);
  assertDecision(gate.evaluate("read", writeTool), false, false);
  assertDecision(gate.evaluate("read", executeTool), false, false);
  assertDecision(gate.evaluate("read", systemTool), false, false);

  assertDecision(gate.evaluate("draft", readTool), true, false);
  assertDecision(gate.evaluate("draft", draftTool), true, false);
  assertDecision(gate.evaluate("draft", externalTool), true, false);
  assertDecision(gate.evaluate("draft", systemTool), true, false);
  assertDecision(gate.evaluate("draft", planTool), false, false);
  assertDecision(gate.evaluate("draft", writeTool), false, false);
  assertDecision(gate.evaluate("draft", executeTool), false, false);

  assertDecision(gate.evaluate("execute", readTool), true, false);
  assertDecision(gate.evaluate("execute", draftTool), true, false);
  assertDecision(gate.evaluate("execute", externalTool), true, false);
  assertDecision(gate.evaluate("execute", systemTool), true, false);
  assertDecision(gate.evaluate("execute", planTool), true, false);
  assertDecision(gate.evaluate("execute", writeTool), true, true);
  assertDecision(gate.evaluate("execute", executeTool), true, true);

  // Unknown remains fail-closed for side effects, while still allowing safe categories.
  assertDecision(gate.evaluate("unknown", readTool), true, false);
  assertDecision(gate.evaluate("unknown", draftTool), true, false);
  assertDecision(gate.evaluate("unknown", externalTool), true, false);
  assertDecision(gate.evaluate("unknown", systemTool), true, false);
  assertDecision(gate.evaluate("unknown", planTool), true, false);
  assertDecision(gate.evaluate("unknown", writeTool), false, false);
  assertDecision(gate.evaluate("unknown", executeTool), false, false);
});

test("runtime exposes tools by auth scope, not by runtime mode", async () => {
  const runtime = createLiveRuntime();
  const registry = runtime?.loop?.registry;
  const llm = runtime?.loop?.llm;
  assert.ok(registry && registry.tools instanceof Map, "Expected runtime loop registry map.");
  assert.ok(llm, "Expected runtime loop llm instance.");

  const planTools = ["proposeCreate", "proposeUpdate", "proposeDelete"];
  for (const toolName of planTools) {
    assert.ok(registry.get(toolName), `Expected ${toolName} to be registered.`);
  }
  assert.ok(registry.get("suggestAction"), "Expected suggestAction to be registered.");

  const captured = new Map();
  let activeKey = null;
  const restoreStream = patchMethod(llm, "stream", async function* (params) {
    captured.set(activeKey, extractToolNames(params?.tools));
    yield { deltaText: "ok" };
    yield { finishReason: "stop", done: true };
  });
  const restoreGenerate = patchMethod(llm, "generate", async () => ({
    text: "ok",
    toolCalls: [],
    finishReason: "stop",
  }));

  try {
    const cases = [
      { key: "read", authScope: "read" },
      { key: "draft", authScope: "draft" },
      { key: "execute", authScope: "execute" },
      { key: "unknown", authScope: "unknown" },
      // Legacy mode is present but must not override explicit authScope.
      { key: "execute_with_legacy_read_mode", authScope: "execute", mode: "READ_ONLY" },
    ];

    for (const row of cases) {
      activeKey = row.key;
      await runScenario(
        {
          id: `permission_scope_tools_${row.key}`,
          target: "loop_core",
          input: {
            sessionId: `permission_scope_tools_session_${row.key}`,
            turnId: `permission_scope_tools_turn_${row.key}`,
            message: "status check",
            ...(row.mode ? { mode: row.mode } : {}),
            metadata: {
              security: { authScope: row.authScope },
            },
          },
        },
        { runtime, skipAssertions: true },
      );
    }
  } finally {
    restoreStream?.();
    restoreGenerate?.();
  }

  const readTools = captured.get("read") || [];
  const draftTools = captured.get("draft") || [];
  const executeTools = captured.get("execute") || [];
  const unknownTools = captured.get("unknown") || [];
  const executeWithLegacyReadModeTools = captured.get("execute_with_legacy_read_mode") || [];

  assert.equal(
    planTools.some((name) => readTools.includes(name)),
    false,
    "read scope must not expose PLAN tool schemas.",
  );
  assert.equal(
    planTools.some((name) => draftTools.includes(name)),
    false,
    "draft scope must not expose PLAN tool schemas.",
  );
  assert.equal(
    planTools.every((name) => executeTools.includes(name)),
    true,
    "execute scope must expose PLAN tool schemas.",
  );
  assert.equal(
    planTools.every((name) => unknownTools.includes(name)),
    true,
    "unknown scope currently exposes PLAN tool schemas (safe execution remains blocked by gate).",
  );
  assert.equal(
    planTools.every((name) => executeWithLegacyReadModeTools.includes(name)),
    true,
    "Explicit authScope must take precedence over legacy mode field.",
  );

  assert.equal(
    readTools.includes("suggestAction"),
    false,
    "read scope must not expose SYSTEM suggestion tool schemas.",
  );
  assert.equal(
    draftTools.includes("suggestAction"),
    true,
    "draft scope must expose SYSTEM suggestion tool schemas.",
  );
  assert.equal(
    executeTools.includes("suggestAction"),
    true,
    "execute scope must expose SYSTEM suggestion tool schemas.",
  );
  assert.equal(
    unknownTools.includes("suggestAction"),
    true,
    "unknown scope currently exposes SYSTEM suggestion tool schemas (safe execution remains blocked by gate).",
  );
  assert.equal(
    executeWithLegacyReadModeTools.includes("suggestAction"),
    true,
    "Explicit authScope must keep SYSTEM suggestions exposed even when legacy mode is READ_ONLY.",
  );
});

function createSyntheticTool(category, name) {
  return {
    name,
    category,
    description: `${name} (${category})`,
    handler: async () => ({ ok: true, data: {} }),
  };
}

function assertDecision(decision, allowed, requiresConfirmation) {
  assert.equal(Boolean(decision?.allowed), Boolean(allowed));
  assert.equal(Boolean(decision?.requiresConfirmation), Boolean(requiresConfirmation));
}

function extractToolNames(rawTools) {
  if (!Array.isArray(rawTools)) {
    return [];
  }
  return rawTools
    .map((tool) => (tool && tool.function ? String(tool.function.name || "").trim() : ""))
    .filter(Boolean);
}

function patchMethod(target, methodName, replacement) {
  if (!target || typeof target[methodName] !== "function") {
    return null;
  }
  const original = target[methodName];
  target[methodName] = replacement;
  return () => {
    target[methodName] = original;
  };
}
