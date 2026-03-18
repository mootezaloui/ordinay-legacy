"use strict";

const DEFAULT_USER_MESSAGE = "Run deterministic test turn.";

function listScenarioFixtures() {
  return Object.values(FIXTURES).map(cloneFixture);
}

function getScenarioFixture(id) {
  const key = String(id || "").trim();
  if (!key || !FIXTURES[key]) {
    throw new Error(`Unknown scenario fixture "${id}"`);
  }
  return cloneFixture(FIXTURES[key]);
}

const FIXTURES = Object.freeze({
  simple_read_only_query: {
    id: "simple_read_only_query",
    description: "Read-only turn with direct answer and no tool usage.",
    target: "loop_core",
    input: buildInput("fx_read", "READ_ONLY", "Show active dossiers."),
    setup(runtime, context) {
      return patchLlmGenerate(runtime, context, [{ text: "Found 2 active dossiers.", toolCalls: [] }]);
    },
    expect: { turnType: "NEW", noPendingAction: true, toolCallCount: 0 },
  },

  write_proposal_pending: {
    id: "write_proposal_pending",
    description: "WRITE tool call should be intercepted into pending action.",
    target: "loop_core",
    input: buildInput("fx_write_pending", "DRAFT", "Update the dossier status.", {
      security: { authScope: "draft" },
    }),
    setup(runtime, context) {
      installSyntheticTool(runtime, "__test_write_tool", "WRITE", async () => ({ ok: true, data: { ok: true } }));
      return patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [{ id: "tc_write_1", name: "__test_write_tool", arguments: { status: "closed" } }],
        },
      ]);
    },
    expect: { turnType: "NEW", hasPendingAction: true, toolCallCount: 1 },
  },

  confirmation_execution: {
    id: "confirmation_execution",
    description: "Confirmation should execute pending action and clear pending.",
    target: "loop_core",
    input: buildInput("fx_confirm_exec", "EXECUTE", "yes, execute", {
      security: { authScope: "execute" },
    }),
    preSession(session) {
      session.state.pendingAction = {
        id: "pending_confirm_1",
        toolName: "__test_confirm_tool",
        summary: "__test_confirm_tool({\"value\":1})",
        args: { value: 1 },
        createdAt: new Date().toISOString(),
        requestedByTurnId: "prior_turn",
        risk: "high",
      };
    },
    setup(runtime) {
      installSyntheticTool(runtime, "__test_confirm_tool", "EXECUTE", async (_context, args) => ({
        ok: true,
        data: { executed: true, args },
      }));
      return null;
    },
    expect: {
      turnType: "CONFIRMATION",
      noPendingAction: true,
      toolCallCount: 1,
      metadataFields: [{ path: "confirmedExecutionResult.ok", value: true }],
    },
  },

  rejection_path: {
    id: "rejection_path",
    description: "Rejection should clear pending action and avoid tool execution.",
    target: "loop_core",
    input: buildInput("fx_reject", "READ_ONLY", "no, cancel this"),
    preSession(session) {
      session.state.pendingAction = {
        id: "pending_reject_1",
        toolName: "__ignored_tool",
        summary: "__ignored_tool({})",
        args: {},
        createdAt: new Date().toISOString(),
        requestedByTurnId: "prior_turn",
        risk: "medium",
      };
    },
    expect: { turnType: "REJECTION", noPendingAction: true, toolCallCount: 0 },
  },

  amendment_replaces_pending: {
    id: "amendment_replaces_pending",
    description: "Amendment should replace prior pending write proposal.",
    target: "loop_core",
    input: buildInput("fx_amend", "DRAFT", "Change the amount to 250.", {
      security: { authScope: "draft" },
    }),
    preSession(session) {
      session.state.pendingAction = {
        id: "pending_old",
        toolName: "__test_write_tool",
        summary: "__test_write_tool({\"amount\":100})",
        args: { amount: 100 },
        createdAt: new Date().toISOString(),
        requestedByTurnId: "prior_turn",
        risk: "medium",
      };
    },
    setup(runtime, context) {
      installSyntheticTool(runtime, "__test_write_tool", "WRITE", async () => ({ ok: true }));
      return patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [{ id: "tc_amend_1", name: "__test_write_tool", arguments: { amount: 250 } }],
        },
      ]);
    },
    expect: {
      turnType: "AMENDMENT",
      hasPendingAction: true,
      toolCallCount: 1,
      metadataFields: [{ path: "replacedPendingActionId", value: "pending_old" }],
    },
  },

  ambiguity_clarification: {
    id: "ambiguity_clarification",
    description: "UX preflight handled=true blocks loop execution and returns clarification directly.",
    target: "sse_handler",
    input: buildInput("fx_ambiguity", "READ_ONLY", "Update the dossier"),
    setup(runtime, context) {
      context.flags = context.flags || {};
      return patchMethod(runtime?.ux, "evaluatePreLoop", () => {
        context.flags.uxPreflightHandled = true;
        return {
          handled: true,
          action: "ask",
          responseText: "Which dossier do you want me to update: D-102, D-118, or D-124?",
          metadata: {
            uxDecision: {
              action: "ask",
              posture: "clarification",
              ambiguityKind: "multiple_candidates",
              ambiguityConfidence: "high",
              workflowType: "none",
              reason: "Multiple candidate dossiers.",
            },
          },
        };
      });
    },
    expect: { clarificationTriggered: true, noPendingAction: true },
  },

  guided_workflow_suggestion: {
    id: "guided_workflow_suggestion",
    description: "UX preflight returns guided workflow response when underspecified.",
    target: "sse_handler",
    input: buildInput("fx_guided", "READ_ONLY", "Prepare the case."),
    setup(runtime) {
      return patchMethod(runtime?.ux, "evaluatePreLoop", () => ({
        handled: true,
        action: "guided_workflow",
        responseText:
          "To proceed with review dossier, I still need:\n- dossier reference\n- review scope\nSuggested next steps:\n- confirm dossier id\n- choose review dimensions",
        metadata: {
          uxDecision: {
            action: "guided_workflow",
            posture: "guided_workflow",
            ambiguityKind: "none",
            ambiguityConfidence: "medium",
            workflowType: "review_dossier",
            reason: "Workflow is underspecified.",
          },
        },
      }));
    },
    expect: { noPendingAction: true },
  },

  retrieval_assisted_answer: {
    id: "retrieval_assisted_answer",
    description: "Retrieval runtime should be queried when building context.",
    target: "loop_core",
    input: buildInput("fx_retrieval", "READ_ONLY", "Summarize prior findings."),
    setup(runtime, context) {
      context.flags = context.flags || {};
      const restoreRetrieval = patchMethod(runtime?.retrieval, "buildRetrievalContext", () => {
        context.flags.retrievalQueried = true;
        return {
          text: "Retrieved context: Dossier D-42 includes hearing summary and task timeline.",
          matches: [{ sourceId: "retrieval:1", documentId: "dossier:D-42", text: "summary" }],
        };
      });
      const restoreLlm = patchLlmGenerate(runtime, context, [{ text: "Retrieved details applied.", toolCalls: [] }]);
      return () => {
        restoreRetrieval?.();
        restoreLlm?.();
      };
    },
    expect: { turnType: "NEW", noPendingAction: true, toolCallCount: 0 },
    assert(result) {
      if (!result?.context?.flags?.retrievalQueried) {
        throw new Error("Expected retrieval context to be queried.");
      }
    },
  },

  grounded_citation_aware_response: {
    id: "grounded_citation_aware_response",
    description: "Research-mode response should append visible citations.",
    target: "sse_handler",
    input: buildInput("fx_grounded", "READ_ONLY", "Provide a research-grounded summary.", {
      outputProfile: "research",
      showCitations: true,
    }),
    setup(runtime, context) {
      const restoreUx = patchMethod(runtime?.ux, "evaluatePreLoop", () => ({ handled: false }));
      const restoreLlm = patchLlmGenerate(runtime, context, [{ text: "Grounded conclusion.", toolCalls: [] }]);
      const restoreSources = patchMethod(runtime?.grounding, "getTurnSources", () => [
        {
          id: "retrieval:doc:d42:1",
          type: "retrieval",
          label: "Dossier D-42 excerpt",
          reference: "dossier:D-42",
          confidence: "high",
        },
      ]);
      const restoreCitations = patchMethod(runtime?.grounding, "buildCitations", () => ({
        mode: "footnote",
        entries: [{ marker: "[1]", label: "Dossier D-42 excerpt", reference: "dossier:D-42" }],
        markers: { "retrieval:doc:d42:1": "[1]" },
        text: "[1] Dossier D-42 excerpt (dossier:D-42)",
      }));
      const restoreAppendPolicy = patchMethod(runtime?.grounding, "shouldAppendCitations", () => true);
      return () => {
        restoreUx?.();
        restoreLlm?.();
        restoreSources?.();
        restoreCitations?.();
        restoreAppendPolicy?.();
      };
    },
    expect: { citationPresence: true },
  },

  rate_limit_denial: {
    id: "rate_limit_denial",
    description: "Request should be denied before loop execution when rate-limited.",
    target: "sse_handler",
    input: buildInput("fx_rate_limit", "READ_ONLY", "Any update?"),
    setup(runtime) {
      return patchMethod(runtime?.security, "checkRateLimit", () => ({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        reason: "Rate limit exceeded. Please retry shortly.",
      }));
    },
    assert(result) {
      const errorEvents = (result?.events || []).filter((event) => event.event === "error");
      if (errorEvents.length === 0) {
        throw new Error("Expected SSE error event for rate-limit denial.");
      }
    },
  },

  unknown_scope_read_only_allowed: {
    id: "unknown_scope_read_only_allowed",
    description: "Unknown auth scope should still allow READ_ONLY mode and propagate scope metadata.",
    target: "sse_handler",
    input: buildInput("fx_unknown_scope", "READ_ONLY", "Read-only status check."),
    setup(runtime, context) {
      context.flags = context.flags || {};
      const restoreUx = patchMethod(runtime?.ux, "evaluatePreLoop", () => ({ handled: false }));
      const restoreLlm = patchLlmGenerate(runtime, context, [{ text: "Read-only path succeeded.", toolCalls: [] }]);
      return () => {
        restoreUx?.();
        restoreLlm?.();
      };
    },
    expect: { noPendingAction: true },
    assert(result) {
      const authScope = result?.capturedLoopInput?.metadata?.security?.authScope;
      if (String(authScope || "").trim() !== "unknown") {
        throw new Error(`Expected auth scope "unknown" but got "${authScope}".`);
      }
      const errors = (result?.events || []).filter((event) => event.event === "error");
      if (errors.length > 0) {
        throw new Error("Did not expect SSE error event for READ_ONLY unknown-scope path.");
      }
    },
  },
});

function buildInput(idPrefix, mode, message, metadata = {}) {
  return {
    sessionId: `${idPrefix}_session`,
    turnId: `${idPrefix}_turn_1`,
    message: String(message || DEFAULT_USER_MESSAGE),
    mode: String(mode || "READ_ONLY"),
    metadata: { ...metadata },
  };
}

function cloneFixture(fixture) {
  return {
    ...fixture,
    input: fixture.input ? { ...fixture.input, metadata: { ...(fixture.input.metadata || {}) } } : undefined,
    expect: fixture.expect ? { ...fixture.expect } : undefined,
  };
}

function patchLlmGenerate(runtime, context, responses) {
  const llm = runtime?.loop?.llm;
  if (!llm || typeof llm.generate !== "function") {
    return null;
  }
  const queue = Array.isArray(responses) ? [...responses] : [];
  const restore = patchMethod(llm, "generate", async () => {
    const next = queue.length > 0 ? queue.shift() : { text: "No further actions.", toolCalls: [] };
    context.flags = context.flags || {};
    context.flags.llmCalls = Number(context.flags.llmCalls || 0) + 1;
    return normalizeLlmResponse(next);
  });
  return restore;
}

function normalizeLlmResponse(value) {
  const row = isRecord(value) ? value : {};
  return {
    text: String(row.text || ""),
    toolCalls: Array.isArray(row.toolCalls) ? row.toolCalls : [],
    finishReason: row.finishReason || "stop",
    raw: row.raw || row,
  };
}

function installSyntheticTool(runtime, name, category, handler) {
  const registry = runtime?.loop?.registry;
  if (!registry || !(registry.tools instanceof Map)) {
    return;
  }
  registry.tools.set(name, {
    name,
    category,
    description: `Synthetic fixture tool ${name}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: true },
    outputSchema: undefined,
    sideEffects: category === "WRITE" || category === "EXECUTE",
    handler: async (context, args) => handler(context, args),
  });
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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  listScenarioFixtures,
  getScenarioFixture,
};
