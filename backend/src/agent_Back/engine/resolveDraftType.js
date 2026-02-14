"use strict";

/**
 * resolveDraftType.js
 * 
 * DEPRECATED: This module is no longer used in the capability router architecture.
 * Draft type resolution is now handled by the capability router and activation guard.
 * 
 * Kept as a stub for backward compatibility.
 */

function resolveDraftType(message, contextEntityType) {
  // No longer performs inference - capability router handles this
  return null;
}

module.exports = {
  resolveDraftType,
};


========================
APPROVED DESIGN (SOURCE OF TRUTH)
========================
Use this exact design (do not re-invent):
- Capability domains: DRAFT, READ, SEARCH, ANALYZE, ASSISTANT
- Routing rules: choose capability deterministically using rule signals + intent outputs. If ambiguous or confidence<0.8 → clarification artifact (routing_clarification / draft_type_selection / read_scope_selection / search_confirmation / context_suggestion)
- Capability lock MUST happen before any LLM reasoner path and must NOT be bypassed by posture ASSISTANT.
- Posture becomes presentation only AFTER capability lock (never disables READ/DRAFT gates).
- Tool Activation Layer enforces preconditions, returns clarification artifacts instead of calling tools or falling back to LLM.
- No direct tool handler call bypassing firewall (stage.read.js analyzeEntityState currently violates this).
- After tool output: LLM framing/explanation/commentary allowed. During ambiguity resolution: no ungrounded “advice” text.

Artifacts:
- context_suggestion: add capability + originalIntent optional
- draft_type_selection: add capability optional
- new routing_clarification type: {type,message,candidates,timestamp,...}

========================
PHASE 0 — AUDIT FIRST (MANDATORY)
========================
1) Locate current execution order in backend/src/agent_Back/engine/pipeline.js.
2) Confirm where posture.resolver can set ASSISTANT and bypass gates.
3) Confirm how intent.classifier currently runs (LLM-first vs rule-first) and what it returns.
4) Identify all places where draftType is silently inferred (intent.classifier + stage.draft fallback).
5) Identify any “direct tool handler” calls that skip executeToolV2/firewall.
6) Identify current artifact schemas and where the frontend expects them.

Output a short “Audit Findings” section with file+line references. THEN implement.

========================
PHASE 2 — IMPLEMENTATION (ARCHITECTURE)
========================
Create NEW modules:
1) backend/src/agent_Back/engine/capability.router.js
   - Input: user message, existing rule signals from intent.classifier (or derived), optional follow-up “resume mode” context.
   - Output: routing_result OR routing_clarification artifact payload + routing metadata:
     {
       capability, intent (if known), confidence, signals[], requires{entity,draftType,scope}, candidates[]
     }
   - Must support “resume mode”: if prior step returned clarification, next user input should be treated as filling the missing requirement without re-running global inference.

2) backend/src/agent_Back/engine/activation.guard.js
   - Enforces preconditions matrix:
     READ: scope optional; entity required if single-entity reads; else clarify
     DRAFT: entity required unless explicitly “global allowed”; draftType required; else clarify
     SEARCH: query required; else clarify
     ANALYZE: requires prior read context; else clarify
   - Must return either:
     - “activation_ok” with normalized params for stage execution
     - OR a clarification artifact (context_suggestion, draft_type_selection, read_scope_selection, routing_clarification)
   - Must NOT call any tools itself. It only gates/normalizes.

3) backend/src/agent_Back/contracts/capabilityRoute.contract.js
   - Define types/schemas for routing_result, routing_clarification, activation_ok, and optional additions to context_suggestion/draft_type_selection.
   - Add lightweight runtime validation (zod or existing validator) if the repo already uses one; otherwise implement minimal guard checks.

========================
PHASE 3 — PIPELINE REFACTOR (CLEAN + FUTURE-PROOF)
========================
Modify backend/src/agent_Back/engine/pipeline.js:
1) Insert Capability Router BEFORE:
   - posture-resolver LLM fallback (if any)
   - classifyIntentWithLLM / reasoner.chat
   - any stage gating that depends on “governedPosture”
2) “Capability Lock”:
   - Store capabilityLock in engineContext (capability, confidence, signals, originalUserMessage, timestamp)
   - Posture is computed AFTER lock, and MUST NOT disable tool gates.
3) If router returns clarification artifact → stream it and STOP (no LLM reasoning).
4) If router returns routing_result → call activation.guard:
   - If clarification → stream and STOP.
   - If activation_ok → dispatch to correct stage (READ/DRAFT/SEARCH/ANALYZE).
5) Only after tool output is produced should you allow:
   - intent framing
   - commentary
   - general LLM explanation

Modify posture.resolver.js:
- Remove/disable any behavior where ASSISTANT posture causes skipping READ/DRAFT gates.
- Posture becomes UI/presentation only; capability controls execution.

Modify intent.classifier.js:
- Expose deterministic “signals” used by router (patterns matched, entities hinted, keywords).
- Ensure router can run without LLM.
- LLM classification may still exist but only to refine WITHIN a locked capability (e.g., choose a READ intent subtype), never to decide capability.

Modify stage.read.js:
- Replace direct toolRegistry.get(...).handler calls (like analyzeEntityState) with executeToolV2 + firewall checks.
- Ensure errors are deterministic artifacts, never “assistant advice”.

Modify stage.draft.js:
- Remove secondary fallback that silently assigns INVITATION/CLIENT_EMAIL/INTERNAL_NOTE when draftType is null.
- If draftType missing → return draft_type_selection.
- If entity missing/ambiguous → return context_suggestion (with capability + originalIntent preserved).
- Add “invoice selection ambiguity” rule: if multiple invoice candidates are relevant, ask which invoice(s) to reference BEFORE drafting.

Modify stage.searchWeb.js / stage.deepSearch.js if needed:
- Ensure SEARCH capability is the only path to them.
- Ensure they never trigger unrelated LLM stages during ambiguity resolution.

========================
FRONTEND / CONTRACT WIRING
========================
If the frontend needs to render routing_clarification:
- Add handling similar to existing context_suggestion / draft_type_selection in:
  frontend agent message processing + AgentWorkflow renderer
- Keep UI consistent with existing chat bubbles (no artifact “boxed cards” unless the whole system uses it).

But prefer keeping UI changes minimal: routing_clarification can reuse the existing “Query/clarification” style if already consistent. Do NOT introduce a new ugly container.

========================
TESTS (REQUIRED)
========================
Add or extend tests (use repo’s existing test framework; if none, add minimal node tests):
Must cover:
1) “help me see my upcoming tasks” → capability READ locked → listTasks tool called with timeframe upcoming
2) “write an official request” → capability DRAFT locked → draft_type_selection (no silent INVITATION)
3) “summarize my case” → capability READ locked but ambiguous entity scope → read_scope_selection
4) “search labor code online” → capability SEARCH locked → web_search tool called
5) “latest cases on labor law” → SEARCH lock (or search_confirmation if you have that heuristic), never ASSISTANT
6) Posture cannot bypass capability lock (regression test)
7) No tool is executed if activation.guard returns clarification
8) stage.read.js does not call un-firewalled tools (assert executeToolV2 path)

========================
LOGGING (REQUIRED, DEBUGGABLE)
========================
Add structured logs:
- [Router] decision {capability,confidence,signals,candidates}
- [CapabilityLock] stored
- [ActivationGuard] ok/clarify with reason
- [Dispatch] selected stage + tool
- Ensure logs DO NOT leak sensitive data (no full DB rows)

========================
DELIVERABLES
========================
1) Implement the modules + refactor pipeline and affected stages.
2) Update contracts/types.
3) Update frontend only if required to render new routing_clarification.
4) Add tests.
5) Provide a concise “What changed” summary and “How to verify” steps.

IMPORTANT CONSTRAINTS
- Do not remove intent framing/commentary globally. Only suppress them during ambiguity resolution steps.
- Do not regress MCP search streaming behavior.
- Avoid huge rewrites. Prefer surgical refactor with clear boundaries.
- Backward compatible: existing artifacts should still render.

Now proceed:
1) Audit with file+line references.
2) Implement Phase 2 modules.
3) Refactor pipeline + stages (Phase 3).
4) Add tests + logs.
5) Summarize changes + verification instructions."use strict";

function resolveDraftType(message, entityType) {
  const normalized = String(message || "").toLowerCase();

  const explicitEmail =
    /\b(email|e-mail|mail|letter|message|courrier|lettre)\b/i.test(normalized);
  const explicitInvitation =
    /\b(invitation|convocation|summons|assignation)\b/i.test(normalized);
  const explicitMotion = /\b(motion)\b/i.test(normalized);
  const explicitMemo = /\b(memo|internal\s+note|note\s+interne)\b/i.test(
    normalized,
  );
  const explicitReport = /\b(report)\b/i.test(normalized);

  if (explicitEmail) {
    return {
      type: "CLIENT_EMAIL",
      confidence: 1,
      ambiguous: false,
    };
  }

  if (explicitInvitation) {
    return {
      type: "INVITATION",
      confidence: 1,
      ambiguous: false,
    };
  }

  if (explicitMotion) {
    return {
      type: "COURT_MOTION",
      confidence: 1,
      ambiguous: false,
    };
  }

  if (explicitMemo) {
    return {
      type: "INTERNAL_NOTE",
      confidence: 1,
      ambiguous: false,
    };
  }

  if (explicitReport) {
    return {
      type: "HEARING_SUMMARY",
      confidence: 1,
      ambiguous: false,
    };
  }

  const vaguePatterns = [
    /\bofficial\s+request\b/i,
    /\bwrite\s+something\b/i,
    /\bprepare\s+(a\s+)?document\b/i,
    /\bdraft\s+(a\s+)?request\b/i,
  ];

  const isVague = vaguePatterns.some((pattern) => pattern.test(normalized));

  if (isVague && String(entityType || "").toLowerCase() === "session") {
    return {
      type: null,
      confidence: 0,
      ambiguous: true,
      options: [
        "INVITATION",
        "COURT_MOTION",
        "INTERNAL_NOTE",
        "CLIENT_NOTIFICATION",
      ],
    };
  }

  return {
    type: null,
    confidence: 0,
    ambiguous: true,
    options: ["INVITATION", "CLIENT_EMAIL", "INTERNAL_NOTE", "HEARING_SUMMARY"],
  };
}

module.exports = {
  resolveDraftType,
};
