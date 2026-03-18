# Ambiguity Handling Fix Plan (Agent V2 Only)

## Scope and Constraints

- This plan applies only to `backend/src/agent` (Agent V2) and V2 frontend stream/UI paths.
- `backend/src/agent_Back` is dead code and must not be used for implementation.
- No implementation should depend on old resolver/classifier/posture modules in `agent_Back`.

---

## Problem Statement

Observed user message:

`we will work on Leila dossier today lets start what do you know about it ?`

Observed agent response:

`Your reference is ambiguous. Name the exact item (ID or label) so I can continue safely.`

Observed backend log signal:

- `toolCallsCount: 0`

This means ambiguity handling short-circuited before the loop/tool phase, so the agent did not perform tool-first grounding.

---

## Root Cause (V2 Audit)

1. V2 stream handler evaluates UX preflight before loop execution and can bypass the loop entirely.
2. UX preflight currently allows ambiguity detector + clarification policy to produce handled responses in read flows.
3. Clarification text contains a generic hardcoded message for unclear references.
4. Result: no READ tool call, no data-grounded disambiguation list, weaker autonomy UX.

---

## Target Behavior

### Read-only turns (`READ_ONLY`)

- Agent must attempt tool-first grounding before ambiguity rejection.
- If multiple matches are found, agent should present best candidates with distinguishing details.
- Agent should ask user to choose, not stop with a generic ambiguity message.

### Mutating turns (`DRAFT`, `EXECUTE`, `AUTONOMOUS`)

- Keep strict safety behavior.
- Do not silently pick entities when ambiguity could cause incorrect writes/actions.
- Clarification remains mandatory in high-risk unresolved states.

---

## Architecture Decisions

1. Keep a UX ambiguity module in V2, but change its role:
   - non-blocking for `READ_ONLY` discovery requests.
   - blocking/safety-capable for mutating modes.
2. Move ambiguity resolution trigger to post-tool evidence for read disambiguation.
3. Reuse existing `context_suggestion` UI contract for clickable options + manual input.
4. Do not introduce any dependency on `agent_Back`.

---

## Claude Execution Checklist

> Claude should tick each item only after code + tests for that item are complete.

### Phase 1: Core Behavior Fix (Required Before New Features)

- [x] `P1-01` Update V2 UX preflight to avoid ambiguity short-circuit in `READ_ONLY` when no pending action exists.
- [x] `P1-02` Preserve strict clarification blocking for high-risk ambiguous states in `DRAFT` / `EXECUTE` / `AUTONOMOUS`.
- [x] `P1-03` Ensure loop executes and READ tools can run for ambiguous read requests like “Leila dossier”.
- [x] `P1-04` Replace generic unclear-reference fallback phrasing with actionable clarification copy in V2.
- [x] `P1-05` Update V2 system/context instructions so ambiguity is resolved from tool results (not raw message text only).

### Phase 2: Structured Disambiguation UX (Clickable Choices)

- [x] `P2-01` Add a V2 stream event path for structured disambiguation payloads (or equivalent compatible event strategy).
- [x] `P2-02` Update frontend stream parser to handle the new disambiguation event without falling to recovery/default error flow.
- [x] `P2-03` Map disambiguation payload to existing `context_suggestion` rendering path.
- [x] `P2-04` Ensure list supports:
  - top relevant matches (cap to 5),
  - distinguishing attributes,
  - manual/free-text fallback hint.
- [x] `P2-05` Ensure user selection round-trips as follow-up intent (`RESOLVE_CONTEXT_AND_CONTINUE`) with stable scope data.

### Phase 3: Regression and Safety Tests

- [x] `P3-01` Add regression test: ambiguous read query must produce tool calls (`toolCallsCount > 0`) before clarification.
- [x] `P3-02` Add regression test: read ambiguity with multiple matches returns structured options (or equivalent response contract).
- [x] `P3-03` Add regression test: mutating ambiguity still blocks safely and asks clarification before write/execute.
- [x] `P3-04` Add stream parser test for disambiguation event handling (no unexpected recovery fallback).
- [x] `P3-05` Run and pass full Agent V2 scenario suite with updated ambiguity expectations.

### Phase 4: Cleanup and Migration Guardrails

- [x] `P4-01` Verify no new imports/references to `agent_Back` are introduced.
- [x] `P4-02` Remove/adjust obsolete ambiguity scenario assumptions that depended on pre-loop blocking in read mode.
- [x] `P4-03` Document final behavior in V2 docs with examples for: 1 match, 2-5 matches, >5 matches, 0 matches.

---

## Acceptance Criteria

1. For ambiguous read query (example: “Leila dossier”), the agent performs READ tooling before clarification.
2. Clarification lists candidate entities with meaningful distinguishing context.
3. User can select an option directly from UI (structured path), or provide manual clarification.
4. Mutating flows remain conservative and safe.
5. No implementation relies on `agent_Back`.

---

## Out of Scope

- Any fix in `agent_Back`.
- Reintroducing old resolver/classifier/posture architecture.
- Silent auto-selection of ambiguous legal entities in high-risk operations.

---

## Final Behavior Reference

### By Mode

| Mode | Ambiguity Detected | Behavior |
|------|-------------------|----------|
| `READ_ONLY` | Yes | UX preflight returns `handled: false` with `proceed_with_ambiguity`. Loop runs, READ tools execute, entity tracker populates `session.activeEntities`. Post-loop disambiguation event emitted if multiple same-type entities found. |
| `DRAFT` / `EXECUTE` / `AUTONOMOUS` | Yes | UX preflight returns `handled: true` with `action: “ask”`. Loop does NOT run. Clarification text returned directly. No disambiguation event. |

### By Match Count (READ_ONLY)

**0 matches** — READ tools return empty results. LLM informs user no matching entities were found. No disambiguation event emitted.

Example: “Show me the Martinez dossier” → tools find no client or dossier matching “Martinez” → agent responds: “I could not find any dossier matching 'Martinez'. Could you provide more details?”

**1 match** — READ tools return exactly one entity. LLM proceeds with that entity and states the assumption explicitly. No disambiguation event emitted (requires ≥ 2 same-type entities).

Example: “Show me Leila dossier” → tools find 1 client with 1 dossier → agent proceeds: “I found Leila Ben Youssef's dossier D-2026-101 (Land dispute)...”

**2–5 matches** — READ tools return multiple entities. Entity tracker records them in `session.activeEntities`. Post-loop `detectDisambiguation` groups entities by type, finds the type with most matches, and emits a `disambiguation` SSE event with `context_suggestion` payload.

Example: “Show me Leila dossier” → tools find 2 dossiers → disambiguation event:
```json
{
  “type”: “context_suggestion”,
  “suggestions”: [
    { “label”: “Land dispute”, “subtitle”: “D-2026-101”, “metadata”: { “status”: “open” } },
    { “label”: “Contract review”, “subtitle”: “D-2026-102”, “metadata”: { “status”: “open” } }
  ],
  “allowManualInput”: true,
  “manualInputHint”: “Or provide more details to narrow your search.”
}
```

Frontend renders clickable `ContextSuggestionRenderer`. User selection sends `RESOLVE_CONTEXT_AND_CONTINUE` intent.

**>5 matches** — Same as 2–5, but suggestions are capped to the first 5 candidates (`MAX_DISAMBIGUATION_CANDIDATES = 5`). The `allowManualInput` hint allows users to refine manually if their target is not in the top 5.

### SSE Event Sequence

```
text_delta (streamed LLM response)
tool_start / tool_result (for each tool call)
disambiguation (if ≥ 2 same-type entities found, READ_ONLY + proceed_with_ambiguity)
done
```

### Key Implementation Files

| File | Role |
|------|------|
| `agent/ux/index.js` | READ_ONLY bypass in `evaluatePreLoop` — returns `proceed_with_ambiguity` instead of blocking |
| `agent/transport/sse.handler.ts` | `detectDisambiguation()` — post-loop entity grouping and `context_suggestion` payload construction |
| `agent/transport/stream.emitter.ts` | `disambiguation` event type in `StreamEvent` union |
| `agent/engine/agentic.loop.ts` | `AMBIGUITY RESOLUTION POLICY` in system prompt; entity tracking via `trackToolEntities` |
| `agent/memory/entity.tracker.js` | Extracts entities from tool results into `session.activeEntities` |
| `agent/ux/clarification.builder.js` | Updated fallback phrasing for `unclear_reference` |
| `frontend/src/services/api/agent.ts` | `disambiguation` case in `dispatchEvent` → routes to `onResult` with `DISAMBIGUATION` intent |
| `frontend/src/Agent_front/components/artifacts/ContextSuggestionRenderer.tsx` | Renders clickable suggestion rows |
