"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase6: memory context prompt includes PLAN-first mutation policy", async () => {
  const runtime = createLiveRuntime();
  const loop = runtime.loop;
  assert.equal(typeof loop.buildInitialMessages, "function");

  const session = await runtime.sessionStore.createSession({
    sessionId: "phase6_prompt_memory_session",
    userId: "phase6_user",
  });
  const input = {
    sessionId: session.id,
    turnId: "phase6_prompt_memory_turn",
    message: "create a client called Atlas",
    metadata: { security: { authScope: "execute" } },
  };

  const messages = loop.buildInitialMessages(input, session, "NEW");
  const policyText = joinSystemMessages(messages);
  assert.match(policyText, /PLAN-FIRST MUTATION POLICY/);
  assert.match(policyText, /proposeCreate,\s*proposeUpdate,\s*proposeDelete/i);
  assert.match(
    policyText,
    /Never say a mutation is completed before explicit user confirmation/i,
  );
});

test("phase6: fallback loop prompt includes PLAN-first mutation policy", async () => {
  const runtime = createLiveRuntime();
  const loop = runtime.loop;
  assert.equal(typeof loop.buildInitialMessages, "function");
  assert.ok(
    loop.memory &&
      loop.memory.contextAssembler &&
      typeof loop.memory.contextAssembler.build === "function",
    "Expected memory contextAssembler.build to exist.",
  );

  const originalBuild = loop.memory.contextAssembler.build;
  loop.memory.contextAssembler.build = () => {
    throw new Error("phase6 fallback test");
  };

  try {
    const session = await runtime.sessionStore.createSession({
      sessionId: "phase6_prompt_fallback_session",
      userId: "phase6_user",
    });
    const input = {
      sessionId: session.id,
      turnId: "phase6_prompt_fallback_turn",
      message: "update client status",
      metadata: { security: { authScope: "execute" } },
    };

    const messages = loop.buildInitialMessages(input, session, "NEW");
    const policyText = joinSystemMessages(messages);
    assert.match(policyText, /PLAN-FIRST MUTATION POLICY/);
    assert.match(policyText, /Do NOT call WRITE or EXECUTE tools to initiate mutations/i);
    assert.match(
      policyText,
      /Never say a mutation is completed before explicit user confirmation/i,
    );
  } finally {
    loop.memory.contextAssembler.build = originalBuild;
  }
});

test("phase6: policy-driven regression path stays PLAN-first for mutation requests", async () => {
  const runtime = createLiveRuntime();
  const registry = runtime.loop.registry;
  const unsafeToolName = "__unsafeWrite";
  const originalUnsafeTool = registry.tools.get(unsafeToolName);
  registry.tools.set(unsafeToolName, {
    name: unsafeToolName,
    category: "EXECUTE",
    description: "Unsafe write fallback for phase6 regression guard.",
    sideEffects: true,
    handler: async () => ({ ok: true, data: { unsafe: true } }),
  });

  const restoreLlm = mockPolicyAwareMutationTool(runtime);
  try {
    const result = await runScenario(
      {
        id: "phase6_policy_plan_first_regression",
        target: "loop_core",
        input: {
          sessionId: "phase6_policy_plan_first_session",
          turnId: "phase6_policy_plan_first_turn",
          message: "create a new client named Phase6 Corp",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    assert.equal(result.output.turnType, "NEW");
    assert.ok(result.output.pendingAction, "Expected pendingAction to be created.");
    assert.ok(result.output.pendingAction.plan, "Expected PLAN pendingAction payload.");
    assert.equal(result.output.pendingAction.toolName, "proposeCreate");
    assert.equal(result.output.pendingAction.plan.operation.operation, "create");
    assert.equal(result.output.pendingAction.plan.operation.entityType, "client");
    assert.equal(result.output.metadata?.confirmedExecutionResult, undefined);
  } finally {
    restoreLlm?.();
    if (originalUnsafeTool) {
      registry.tools.set(unsafeToolName, originalUnsafeTool);
    } else {
      registry.tools.delete(unsafeToolName);
    }
  }
});

function mockPolicyAwareMutationTool(runtime) {
  const llm = runtime?.loop?.llm;
  if (!llm) {
    throw new Error("Expected runtime.loop.llm to be available.");
  }

  const buildToolCall = (params) => {
    const policyText = joinSystemMessages(params?.messages);
    const hasPlanPolicy =
      /PLAN-FIRST MUTATION POLICY/.test(policyText) &&
      /proposeCreate,\s*proposeUpdate,\s*proposeDelete/i.test(policyText);
    if (hasPlanPolicy) {
      return {
        id: "tc_phase6_plan_first",
        name: "proposeCreate",
        arguments: {
          entityType: "client",
          payload: { name: "Phase6 Corp" },
          reason: "Policy-driven PLAN-first regression test.",
        },
      };
    }
    return {
      id: "tc_phase6_unsafe_fallback",
      name: "__unsafeWrite",
      arguments: { entityType: "client", name: "Phase6 Corp" },
    };
  };

  const restoreStream = patchMethod(llm, "stream", async function* (params) {
    yield { toolCall: buildToolCall(params) };
    yield { finishReason: "tool_calls", done: true };
  });

  const restoreGenerate = patchMethod(llm, "generate", async (params) => {
    const toolCall = buildToolCall(params);
    return {
      text: "",
      toolCalls: [toolCall],
      finishReason: "tool_calls",
      raw: { mocked: true },
    };
  });

  return () => {
    restoreStream?.();
    restoreGenerate?.();
  };
}

function joinSystemMessages(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  return rows
    .filter((row) => row && row.role === "system")
    .map((row) => String(row.content || ""))
    .join("\n\n");
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
