# Pre-LLM Gate Removal - v2 Implementation Checklist

## Scope and Baseline

This checklist applies to the v2 stream/runtime in:

- `backend/src/agent/transport/sse.handler.ts`
- `backend/src/agent/transport/runtime.factory.ts`
- `backend/src/agent/ux/*`
- `backend/src/agent/testing/tests/*`
- `backend/src/agent/testing/scenario.fixtures.js`

Current baseline (confirmed in code):

- A UX preflight runs before the agentic loop (`sse.handler.ts`).
- UX preflight can return `handled: true` and short-circuit the loop.
- Preflight behavior is driven by keyword heuristics in `ux/ambiguity.detector.js` and canned responses in `ux/clarification.builder.js`.
- This can block natural draft requests before the LLM sees the message.

---

## Architecture Decision (Frozen)

1. User messages must reach the agentic loop unless blocked by transport/security gates (invalid payload, auth scope, rate limit, safe mode off).
2. No keyword-based intent/ambiguity gate may produce user-facing text before the LLM loop.
3. Turn classifier shortcuts remain valid only for pending-action confirmation flows (confirmation/rejection/amendment).
4. Draft/mutation ambiguity handling must be performed by loop reasoning, tool results, and existing draft guards.
5. During migration, preflight metadata shape may be retained for observability, but preflight must not short-circuit execution.

---

## Clean Rules (Do Not Break)

- Keep a single execution path in `AgenticLoop`; do not introduce a second orchestration path.
- Do not reintroduce keyword heuristics in transport.
- Do not change pending confirmation semantics.
- Keep security fail-closed behavior unchanged.
- Keep disambiguation artifact compatibility in SSE.

---

## Target Pipeline

```
User message
  -> Input sanitize + auth/rate-limit + safe-mode checks
  -> Turn classifier (inside loop)
  -> AgenticLoop (LLM + tools)
  -> SSE events/artifacts
```

No pre-LLM ambiguity/mutation/detail gate.

---

## Phase Checklist

## Phase 0 - Contract Freeze and Impact Map

- [x] Freeze behavior contract in this doc: preflight cannot short-circuit user turns.
- [x] Freeze migration strategy: transport bypass first, module deletion later.
- [x] Freeze impacted file map:
  - [x] `backend/src/agent/transport/sse.handler.ts`
  - [x] `backend/src/agent/transport/runtime.factory.ts`
  - [x] `backend/src/agent/ux/index.js`
  - [x] `backend/src/agent/ux/ambiguity.detector.js`
  - [x] `backend/src/agent/ux/clarification.builder.js`
  - [x] `backend/src/agent/testing/scenario.fixtures.js`
  - [x] `backend/src/agent/testing/tests/ambiguity.test.js`

Definition of done:

- [x] Baseline and target flow documented.
- [x] No ambiguity on the migration sequence.

---

## Phase 1 - Transport Bypass (Start Here)

- [x] Update `backend/src/agent/transport/sse.handler.ts`:
  - [x] Bypass preflight short-circuiting (`handled: true` path removed from runtime behavior).
  - [x] Always run `runtime.loop.run(...)` for valid turns.
  - [x] Keep `uxDecision` metadata envelope with a deterministic bypass reason for trace compatibility.
  - [x] Add explicit bypass diagnostic log (`AGENT_V2_UX_PREFLIGHT_BYPASSED`).
- [x] Keep downstream SSE compatibility:
  - [x] Preserve `mergePreflightMetadata(...)` behavior.
  - [x] Preserve disambiguation event derivation from loop/tool outputs.

Definition of done:

- [x] A message can no longer be answered by UX preflight before the loop.
- [x] Preflight metadata remains present and auditable as bypassed.

---

## Phase 2 - Runtime Decoupling

- [x] Update `backend/src/agent/transport/runtime.factory.ts`:
  - [x] Stop loading UX runtime into active runtime wiring.
  - [x] Remove `ux` from `AgentV2Runtime` once callsites are removed.
- [x] Remove dead transport helpers in `sse.handler.ts`:
  - [x] `buildRetrievalContext(...)`
  - [x] `normalizeUxPreflightResult(...)`
  - [x] `buildUxHandledOutput(...)`
  - [x] Any unused preflight-only helper.

Definition of done:

- [x] Transport no longer depends on UX preflight modules.
- [x] Runtime contract compiles without UX preflight coupling.

---

## Phase 3 - Legacy UX Module Retirement

- [x] Remove or archive legacy preflight modules:
  - [x] `backend/src/agent/ux/index.js`
  - [x] `backend/src/agent/ux/ambiguity.detector.js` (moved to `backend/src/agent/engine/ambiguity.detector.js`)
  - [x] `backend/src/agent/ux/clarification.builder.js`
  - [x] `backend/src/agent/ux/clarification.policy.js`
  - [x] `backend/src/agent/ux/workflow.guide.js` (preflight-only, removed)
  - [x] `backend/src/agent/ux/response.posture.js` (preflight-only, removed)
- [x] Keep any reusable utilities only if re-scoped behind loop/tool flows.

Definition of done:

- [x] No pre-LLM UX gate code remains in active runtime path.

---

## Phase 4 - Tests and Fixture Migration

- [x] Update tests that currently patch `runtime.ux.evaluatePreLoop`.
- [x] Replace preflight-blocking expectations with loop-first expectations.
- [x] Add regression tests for natural-language draft phrasing:
  - [x] `"i should send ... a welcome letter"` reaches loop and can draft.
  - [x] `"create ... welcome letter"` still drafts.
  - [x] Confirmation/rejection shortcuts still work with pending actions.

Definition of done:

- [x] `npm run test:agent-v2` passes with no preflight assumptions.

---

## Phase 5 - Docs and Observability Alignment

- [x] Update architecture docs to remove references to active UX preflight gating.
- [x] Update operator/debug docs with new bypass log semantics.
- [x] Document final behavior for ambiguity handling (loop/tool-driven only).

Definition of done:

- [x] Documentation matches runtime behavior.

### Phase 5 Runtime Semantics (Authoritative)

- Transport has no active pre-LLM UX gate.
- For valid requests, transport always routes the turn to `runtime.loop.run(...)`.
- `metadata.uxDecision` is retained for trace compatibility and carries a deterministic bypass reason.
- `AGENT_V2_UX_PREFLIGHT_BYPASSED` is emitted as the transport-level diagnostic marker for bypass semantics.

### Phase 5 Operator/Debug Checklist

- If `AGENT_V2_STREAM_TURN_START` exists but `AGENT_V2_UX_PREFLIGHT_BYPASSED` does not, the request was blocked by a transport/security gate before loop execution.
- If both markers exist and no SSE `error` is emitted, the turn reached the loop as expected.
- A clarification/disambiguation UX response must now come from loop/tool outputs, not from transport preflight handlers.

### Final Ambiguity Handling Contract

- Ambiguity resolution is loop/tool-driven only.
- Draft ambiguity and detail/context guards are enforced in `agentic.loop.ts`.
- SSE `disambiguation` payloads are derived from loop/tool candidate sets and session context.
- Transport no longer emits user-facing `ask`/`guided_workflow` decisions from a pre-loop UX module.

---

## Non-Goals (This Plan)

- [ ] No change to confirmation execution semantics.
- [ ] No rewrite of draft guard logic inside `agentic.loop.ts`.
- [ ] No security/auth policy redesign.

---

## Final Readiness Gate

- [x] Phase 0 completed.
- [x] Phase 1 completed.
- [x] Phase 2-5 completed.
- [x] `typecheck:agent`, `build:agent`, and `test:agent-v2` all pass after full migration.
