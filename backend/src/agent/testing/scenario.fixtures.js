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
    input: buildInput("fx_read", "Show active dossiers."),
    setup(runtime, context) {
      return patchLlmGenerate(runtime, context, [{ text: "Found 2 active dossiers.", toolCalls: [] }]);
    },
    expect: { turnType: "NEW", noPendingAction: true, toolCallCount: 0 },
  },

  write_proposal_pending: {
    id: "write_proposal_pending",
    description: "PLAN tool call should be intercepted into pending action.",
    target: "loop_core",
    input: buildInput("fx_write_pending", "Update the dossier status.", {
      security: { authScope: "execute" },
    }),
    setup(runtime, context) {
      return patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [
            {
              id: "tc_plan_update_1",
              name: "proposeUpdate",
              arguments: {
                entityType: "dossier",
                entityId: 101,
                changes: { status: { from: "active", to: "closed" } },
                reason: "User asked to update dossier status.",
              },
            },
          ],
        },
      ]);
    },
    expect: {
      turnType: "NEW",
      hasPendingAction: true,
      toolCallCount: 1,
      metadataFields: [{ path: "planArtifact.operation.operation", value: "update" }],
    },
  },

  confirmation_execution: {
    id: "confirmation_execution",
    description: "Confirmation should execute pending action and clear pending.",
    target: "loop_core",
    input: buildInput("fx_confirm_exec", "yes, execute", {
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
    input: buildInput("fx_reject", "no, cancel this"),
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
    description: "Amendment should replace prior pending PLAN proposal.",
    target: "loop_core",
    input: buildInput("fx_amend", "Change the amount to 250.", {
      security: { authScope: "execute" },
    }),
    preSession(session) {
      session.state.pendingAction = {
        id: "pending_old",
        toolName: "proposeUpdate",
        summary: "Update financial entry 100 amount",
        args: { entityType: "financial_entry", entityId: 100, changes: { amount: { from: 100, to: 250 } } },
        plan: {
          operation: {
            operation: "update",
            entityType: "financial_entry",
            entityId: 100,
            changes: { amount: { from: 100, to: 250 } },
          },
        },
        createdAt: new Date().toISOString(),
        requestedByTurnId: "prior_turn",
        risk: "medium",
      };
    },
    setup(runtime, context) {
      return patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [
            {
              id: "tc_amend_1",
              name: "proposeUpdate",
              arguments: {
                entityType: "financial_entry",
                entityId: 100,
                changes: { amount: { from: 100, to: 250 } },
                reason: "User amended the requested amount.",
              },
            },
          ],
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

  plan_stream_pending_artifact: {
    id: "plan_stream_pending_artifact",
    description: "SSE emits plan_artifact and pending in stable order for PLAN proposals.",
    target: "sse_handler",
    input: buildInput("fx_plan_stream_pending", "Create a new client named Stream Corp", {
      security: { authScope: "execute" },
    }),
    requestUser: { id: "fx_plan_stream_pending_user", scope: "execute" },
    setup(runtime, context) {
      const restoreLlm = patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [
            {
              id: "tc_plan_stream_create_1",
              name: "proposeCreate",
              arguments: {
                entityType: "client",
                payload: { name: "Stream Corp", status: "active" },
                reason: "User asked to create a client.",
              },
            },
          ],
        },
      ]);
      return () => {
        restoreLlm?.();
      };
    },
    expect: {
      hasPendingAction: true,
      toolCallCount: 1,
      sseEvents: {
        includes: ["plan_artifact", "pending", "done"],
        excludes: ["plan_executed", "plan_rejected"],
        ordered: ["plan_artifact", "pending", "done"],
        counts: { plan_artifact: 1, done: 1 },
      },
    },
  },

  plan_stream_confirmation_events: {
    id: "plan_stream_confirmation_events",
    description: "SSE emits plan_executed then confirmed on confirmation path.",
    target: "sse_handler",
    input: buildInput("fx_plan_stream_confirm", "yes confirm", {
      security: { authScope: "execute" },
    }),
    requestUser: { id: "fx_plan_stream_confirm_user", scope: "execute" },
    preSession(session) {
      session.state.pendingAction = {
        id: "pending_stream_confirm_1",
        toolName: "proposeUpdate",
        summary: "Update client 77 status",
        args: {
          entityType: "client",
          entityId: 77,
          changes: { status: { from: "active", to: "inactive" } },
        },
        plan: {
          operation: {
            operation: "update",
            entityType: "client",
            entityId: 77,
            changes: { status: { from: "active", to: "inactive" } },
          },
        },
        createdAt: new Date().toISOString(),
        requestedByTurnId: "prev_turn",
        risk: "medium",
      };
    },
    setup(runtime) {
      const entityExecutor = runtime?.loop?.entityExecutor;
      const restoreExecute = patchMethod(entityExecutor, "execute", async () => ({
        ok: true,
        result: {
          operation: "update",
          entityType: "client",
          entityId: 77,
          changes: { status: { from: "active", to: "inactive" } },
        },
      }));
      return () => {
        restoreExecute?.();
      };
    },
    expect: {
      noPendingAction: true,
      metadataFields: [{ path: "planExecutedArtifact.ok", value: true }],
      sseEvents: {
        includes: ["plan_executed", "confirmed", "done"],
        excludes: ["plan_rejected"],
        ordered: ["plan_executed", "confirmed", "done"],
        counts: { plan_executed: 1, done: 1 },
      },
    },
  },

  plan_stream_rejection_events: {
    id: "plan_stream_rejection_events",
    description: "SSE emits plan_rejected and skips confirmed/plan_executed on rejection path.",
    target: "sse_handler",
    input: buildInput("fx_plan_stream_reject", "no cancel it", {
      security: { authScope: "execute" },
    }),
    requestUser: { id: "fx_plan_stream_reject_user", scope: "execute" },
    preSession(session) {
      session.state.pendingAction = {
        id: "pending_stream_reject_1",
        toolName: "proposeDelete",
        summary: "Delete task 501",
        args: { entityType: "task", entityId: 501 },
        plan: {
          operation: {
            operation: "delete",
            entityType: "task",
            entityId: 501,
          },
        },
        createdAt: new Date().toISOString(),
        requestedByTurnId: "prev_turn",
        risk: "high",
      };
    },
    expect: {
      noPendingAction: true,
      sseEvents: {
        includes: ["plan_rejected", "done"],
        excludes: ["plan_executed", "confirmed"],
        ordered: ["plan_rejected", "done"],
        counts: { plan_rejected: 1, done: 1 },
      },
    },
  },

  ambiguity_clarification: {
    id: "ambiguity_clarification",
    description: "Loop-first path returns clarification text for underspecified ambiguous request.",
    target: "sse_handler",
    input: buildInput("fx_ambiguity", "Update the dossier"),
    setup(runtime, context) {
      context.flags = context.flags || {};
      return patchLlmGenerate(runtime, context, [
        {
          text: "Which dossier do you want me to update: D-102, D-118, or D-124?",
          toolCalls: [],
        },
      ]);
    },
    expect: { clarificationTriggered: true, noPendingAction: true },
    assert(result) {
      if (!result?.capturedLoopInput) {
        throw new Error("Expected loop execution for ambiguity clarification scenario.");
      }
    },
  },

  guided_workflow_suggestion: {
    id: "guided_workflow_suggestion",
    description: "Loop-first path returns guided workflow response when request is underspecified.",
    target: "sse_handler",
    input: buildInput("fx_guided", "Prepare the case."),
    setup(runtime, context) {
      return patchLlmGenerate(runtime, context, [
        {
          text:
            "To proceed with review dossier, I still need:\n- dossier reference\n- review scope\nSuggested next steps:\n- confirm dossier id\n- choose review dimensions",
          toolCalls: [],
        },
      ]);
    },
    expect: { noPendingAction: true },
    assert(result) {
      if (!result?.capturedLoopInput) {
        throw new Error("Expected loop execution for guided workflow suggestion scenario.");
      }
    },
  },

  retrieval_assisted_answer: {
    id: "retrieval_assisted_answer",
    description: "Retrieval runtime should be queried when building context.",
    target: "loop_core",
    input: buildInput("fx_retrieval", "Summarize prior findings."),
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
    input: buildInput("fx_grounded", "Provide a research-grounded summary.", {
      outputProfile: "research",
      showCitations: true,
    }),
    setup(runtime, context) {
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
    input: buildInput("fx_rate_limit", "Any update?"),
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

  draft_stream_artifact: {
    id: "draft_stream_artifact",
    description: "SSE emits draft_artifact for generateDraft without PLAN side effects.",
    target: "sse_handler",
    input: buildInput("fx_draft_stream", "Draft a short hearing confirmation email."),
    setup(runtime, context) {
      const restoreLlm = patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [
            {
              id: "tc_draft_stream_1",
              name: "generateDraft",
              arguments: {
                draftType: "client_letter",
                title: "Hearing Date Confirmation",
                sections: [
                  { role: "salutation", text: "Dear Client," },
                  {
                    role: "body",
                    text: "We confirm that your next hearing is scheduled for April 12, 2026 at 10:00.",
                  },
                  { role: "closing", text: "Best regards," },
                  { role: "signature_name", text: "Counsel Team" },
                ],
              },
            },
          ],
        },
        { text: "I prepared the draft.", toolCalls: [] },
      ]);
      return () => {
        restoreLlm?.();
      };
    },
    expect: {
      noPendingAction: true,
      sseEvents: {
        includes: ["draft_artifact", "done"],
        excludes: ["plan_artifact", "pending"],
        ordered: ["draft_artifact", "done"],
        counts: { draft_artifact: 1, done: 1 },
      },
    },
  },

  unknown_scope_read_only_allowed: {
    id: "unknown_scope_read_only_allowed",
    description: "Unknown auth scope should still allow read requests and propagate scope metadata.",
    target: "sse_handler",
    input: buildInput("fx_unknown_scope", "Read-only status check."),
    setup(runtime, context) {
      context.flags = context.flags || {};
      const restoreLlm = patchLlmGenerate(runtime, context, [{ text: "Read-only path succeeded.", toolCalls: [] }]);
      return () => {
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
        throw new Error("Did not expect SSE error event for unknown-scope read path.");
      }
    },
  },
});

function buildInput(idPrefix, message, metadata = {}) {
  return {
    sessionId: `${idPrefix}_session`,
    turnId: `${idPrefix}_turn_1`,
    message: String(message || DEFAULT_USER_MESSAGE),
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
  if (
    !llm ||
    typeof llm.generate !== "function" ||
    typeof llm.stream !== "function"
  ) {
    return null;
  }
  const queueForStream = Array.isArray(responses) ? [...responses] : [];
  const queueForGenerate = Array.isArray(responses) ? [...responses] : [];

  const restoreStream = patchMethod(llm, "stream", async function* () {
    const next =
      queueForStream.length > 0
        ? queueForStream.shift()
        : { text: "No further actions.", toolCalls: [] };
    context.flags = context.flags || {};
    context.flags.llmCalls = Number(context.flags.llmCalls || 0) + 1;
    const normalized = normalizeLlmResponse(next);
    if (normalized.text) {
      yield { deltaText: normalized.text };
    }
    for (const toolCall of normalized.toolCalls) {
      yield { toolCall };
    }
    yield { finishReason: normalized.finishReason, done: true };
  });

  const restoreGenerate = patchMethod(llm, "generate", async () => {
    const next =
      queueForGenerate.length > 0
        ? queueForGenerate.shift()
        : { text: "No further actions.", toolCalls: [] };
    context.flags = context.flags || {};
    context.flags.llmCalls = Number(context.flags.llmCalls || 0) + 1;
    return normalizeLlmResponse(next);
  });

  return () => {
    restoreStream?.();
    restoreGenerate?.();
  };
}

function normalizeLlmResponse(value) {
  const row = isRecord(value) ? value : {};
  const toolCalls = Array.isArray(row.toolCalls) ? row.toolCalls : [];
  const finishReason =
    row.finishReason || (toolCalls.length > 0 ? "tool_calls" : "stop");
  return {
    text: String(row.text || ""),
    toolCalls,
    finishReason,
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

