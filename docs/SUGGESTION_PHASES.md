# Suggestion System Phase Checklist (DRAFT + EXECUTE)

## Scope and Baseline

This checklist tracks proactive suggestions as a dedicated workstream for the v2 agent in `backend/src/agent`.

Core scope freeze:

- Suggestions apply to both `DRAFT` and `EXECUTE` domains.
- Suggestions are non-mutating guidance only.
- Suggestions must never create a pending action or execute side effects.
- Existing PLAN/EXECUTE docs no longer carry suggestion implementation tasks.

---

## Phase 0 - Scope Freeze (Completed)

- [x] Freeze domain coverage: suggestions must support both draft and execute intents.
- [x] Freeze safety contract: suggestion flow is read-only and reversible.
- [x] Freeze separation of concerns: suggestion work tracked in this doc only.
- [x] Remove suggestion-specific checklist items from `PLAN_EXECUTE_PHASE_v2.md`.
- [x] Freeze trigger matrix for implicit vs explicit user intent.
- [x] Freeze event payload contract version and required fields.

Definition of done:

- [x] Team sign-off on scope and trigger semantics.
- [x] No conflicting suggestion requirements remain in other phase docs.

### Phase 0 Frozen Decisions

#### Trigger Matrix (Implicit vs Explicit)

| Case | Domain | Behavior |
| --- | --- | --- |
| User explicitly requests a concrete draft (`create`, `draft`, `write`, `compose` + document type) | `DRAFT` | Do not force suggestion. Proceed with normal draft flow. |
| User implies a draft need without explicit drafting command (`i should send...`, `maybe i need to write...`) | `DRAFT` | Emit one suggestion first, with prefilled draft context. |
| User explicitly requests a concrete mutation (`create/update/delete`, or equivalent direct action command) | `EXECUTE` | Do not force suggestion. Proceed with normal PLAN confirmation flow. |
| User implies mutation intent without explicit action command (`we should update...`, `i need to mark this...`) | `EXECUTE` | Emit one suggestion first, with prefilled execute context. |
| Entity/target is ambiguous | `DRAFT` and `EXECUTE` | Resolve ambiguity first. Suggestion is blocked until target is clear. |
| Pending confirmation already exists and user amends | `EXECUTE` | Continue amendment/replacement pending flow; no extra proactive suggestion by default. |

#### `suggestion_artifact` Contract (v1)

Frozen Phase 0 contract:

- Event name: `suggestion_artifact`
- Version: `v1`
- Required fields:
  - `artifact.version` (`"v1"`)
  - `artifact.domain` (`"draft"` or `"execute"`)
  - `artifact.trigger` (`"implicit_intent"` or `"proactive_context"`)
  - `artifact.actionType` (`"draft" | "create" | "update" | "delete"`)
  - `artifact.targetType` (string)
  - `artifact.title` (string)
  - `artifact.reason` (string)
  - `artifact.prefillData` (object)
- Optional fields:
  - `artifact.linkedEntityType` (string)
  - `artifact.linkedEntityId` (number or string)
  - `artifact.confidence` (`"low" | "medium" | "high"`)

---

## Phase 1 - Contracts and Types

- [x] Add/finalize suggestion artifact contracts in `src/agent/types.ts`.
- [x] Include domain classification in payload (`draft` or `execute`).
- [x] Include actionable prefill payload for follow-up action.
- [x] Define strict validation and safe defaults for missing fields.

Definition of done:

- [ ] Type contracts compile and are consumed consistently in transport/frontend.

Verification note:

- Backend checks passed: `npm run typecheck:agent`, `npm run build:agent`.
- Frontend full build currently fails due pre-existing unrelated type errors outside suggestion files; re-verify after baseline cleanup.

---

## Phase 2 - System Tool Layer

- [x] Implement `src/agent/tools/system/suggestAction.tool.ts`.
- [x] Implement `src/agent/tools/system/index.ts`.
- [x] Enforce contextual specificity (no generic boilerplate suggestions).
- [x] Ensure suggestion generator supports:
  - [x] Draft suggestions (document type, tone, purpose, target).
  - [x] Execute suggestions (create/update/delete action proposal direction).

Definition of done:

- [x] Tool returns normalized suggestion payloads for both domains.

Verification note:

- Backend checks passed: `npm run typecheck:agent`, `npm run build:agent`.
- Tool-level smoke invocation confirms:
  - valid `draft` suggestion payload -> `ok: true`
  - valid `execute` suggestion payload -> `ok: true`
  - invalid domain/action mismatch -> rejected with `SUGGESTION_DOMAIN_ACTION_MISMATCH`

---

## Phase 3 - Runtime Bootstrapping and Permissions

- [x] Load system tools in `src/agent/transport/runtime.factory.ts`.
- [x] Keep `ToolCategory.SYSTEM` policy explicit in permission gate.
- [x] Ensure mode matrix allows SYSTEM where intended and blocks where unsafe.

Definition of done:

- [x] Runtime registers system suggestion tools in intended modes.

Verification note:

- Runtime bootstrap includes `...loadSystemTools()` and now resolves `getSystemTools()` from `src/agent/tools/system/index.ts`.
- Permission matrix regression updated to assert `suggestAction` exposure by scope:
  - `read`: blocked
  - `draft`: allowed
  - `execute`: allowed
  - `unknown`: allowed (safe categories only)
- Checks passed:
  - `node --test src/agent/testing/tests/permission.matrix.test.js`
  - `npm run typecheck:agent`

---

## Phase 4 - Loop Integration

- [x] Handle `ToolCategory.SYSTEM` in `src/agent/engine/agentic.loop.ts`.
- [x] Emit `suggestion_artifact` without creating pending actions.
- [x] Enforce one suggestion per turn.
- [x] Add trigger behavior for implicit intent:
  - [x] Draft case: suggest first when user implies writing but does not explicitly request immediate draft generation.
  - [x] Execute case: suggest first when user implies mutation/next step but does not explicitly request immediate plan creation.

Definition of done:

- [x] Suggestion behavior is deterministic and does not interfere with PLAN confirmation semantics.

Verification note:

- Added regression suite: `backend/src/agent/testing/tests/suggestion.phase4.test.js`.
- Checks passed:
  - `npm run build:agent`
  - `node --test src/agent/testing/tests/suggestion.phase4.test.js`
  - `node --test src/agent/testing/tests/plan.phase4.test.js src/agent/testing/tests/suggestion.phase4.test.js`

---

## Phase 5 - Prompt and Behavior Policy

- [x] Update system policy blocks to describe when suggestion should be produced.
- [x] Add clear priority order: safety and disambiguation before suggestion.
- [x] Add anti-noise rule: skip suggestion when user request is already explicit and complete.

Definition of done:

- [x] LLM behavior matches policy in controlled regression scenarios.

Verification note:

- Updated policy blocks in:
  - `backend/src/agent/engine/agentic.loop.ts`
  - `backend/src/agent/memory/context.assembler.js`
- Added regression suite:
  - `backend/src/agent/testing/tests/suggestion.phase5.policy.test.js`
- Checks passed:
  - `npm run typecheck:agent`
  - `npm run build:agent`
  - `node --test src/agent/testing/tests/suggestion.phase4.test.js src/agent/testing/tests/suggestion.phase5.policy.test.js`

---

## Phase 6 - Transport and Frontend Wiring

- [x] Confirm backend SSE emits `suggestion_artifact` in all relevant loop paths.
- [x] Confirm frontend parser maps `suggestion_artifact` reliably.
- [x] Ensure UI renders suggestion card with domain-aware action labels.
- [x] Ensure suggestion CTA can prefill follow-up draft/plan flows.

Definition of done:

- [x] User sees actionable suggestions for both draft and execute scenarios.

Verification note:

- Backend transport:
  - Existing callback path already covered by `suggestion.phase4` SSE scenario.
  - Added fallback path regression:
    - `backend/src/agent/testing/tests/suggestion.phase6.transport.test.js`
    - Verifies `metadata.suggestionArtifact` is emitted as SSE `suggestion_artifact` when callback path is not used.
- Frontend parser and mapping:
  - `frontend/src/services/api/agent.ts` parses and normalizes `suggestion_artifact` payloads (`parseSuggestionArtifactEventData`).
  - `frontend/src/Agent_front/hooks/useAgentState.ts` maps suggestion artifacts into `assist_suggestions` with preserved `domain`, `trigger`, `prefillData`, and generated `followUpPrompt`.
- Frontend UI and CTA:
  - `frontend/src/Agent_front/components/artifacts/AssistSuggestions.tsx` now renders domain-aware action badges (`Draft`, `Plan Create/Update/Delete`) and CTA labels (`Use Draft`, `Use Plan`).
  - `frontend/src/Agent_front/components/AgentWorkflow.tsx` CTA handler now submits prefilled follow-up prompts through `onSubmitMessage` (fallback: populates input via `onExampleClick`).
- Checks passed:
  - `npm run typecheck:agent`
  - `npm run build:agent`
  - `node --test src/agent/testing/tests/suggestion.phase4.test.js src/agent/testing/tests/suggestion.phase5.policy.test.js src/agent/testing/tests/suggestion.phase6.transport.test.js`
- Frontend full renderer build still fails due pre-existing unrelated TypeScript errors in:
  - `frontend/src/Agent_front/components/AgentMessage.tsx`
  - `frontend/src/Agent_front/components/artifacts/CommentaryBubble.tsx`
  - `frontend/src/Agent_front/components/UserCommand.tsx`
  - `frontend/src/services/api/client.ts`

---

## Phase 7 - Tests and Hardening

- [x] Add backend unit/integration tests for suggestion generation in both domains.
- [x] Add stream tests for suggestion event ordering.
- [x] Add frontend tests for suggestion rendering and CTA behavior.
- [x] Add guard tests to prevent duplicate suggestions per turn.

Definition of done:

- [x] `npm run typecheck:agent`, `npm run build:agent`, and `npm run test:agent-v2` pass.

Verification note:

- Backend tests added:
  - `backend/src/agent/testing/tests/suggestion.phase7.generation.test.js`
  - `backend/src/agent/testing/tests/suggestion.phase7.stream-order.test.js`
- Frontend tests added:
  - `frontend/src/Agent_front/tests/suggestion.helpers.test.js`
  - `frontend/package.json` -> `test:agent-suggestions`
- Legacy scenario regression updated to match suggestion-first behavior for implicit draft phrasing:
  - `backend/src/agent/testing/tests/scenario.test.js`
- Checks passed:
  - `npm run typecheck:agent`
  - `npm run build:agent`
  - `npm run test:agent-v2` (`pass 101 / fail 0`)
  - `npm run test:agent-suggestions`

---

## Phase 8 - Rollout and Observability

- [x] Add feature flag for suggestion rollout.
- [x] Add telemetry for suggestion shown/accepted/dismissed.
- [x] Add fallback behavior when suggestion generation fails.
- [x] Define rollback plan.

Definition of done:

- [x] Suggestion rollout is measurable, reversible, and stable.

Verification note:

- Rollout feature flag:
  - Added `FEATURE_AGENT_V2_SUGGESTIONS` in `backend/src/agent/deployment/feature.flags.js`.
  - Runtime wiring added in `backend/src/agent/transport/runtime.factory.ts` and `backend/src/agent/engine/agentic.loop.ts`.
  - When disabled, implicit suggestion enforcement is bypassed and `suggestAction` is not exposed to the model tool schema.
- Telemetry:
  - Added per-session suggestion telemetry state in loop metadata:
    - `shown`
    - `accepted`
    - `dismissed`
    - `fallback`
    - `failures`
  - Added audit events:
    - `suggestion_shown`
    - `suggestion_accepted`
    - `suggestion_dismissed`
    - `suggestion_failed`
    - `suggestion_fallback`
- Fallback behavior:
  - If implicit suggestion flow is required and `suggestAction` fails, loop now returns a safe fallback message and does not create pending actions or side effects.
- Rollback plan:
  - Added `docs/SUGGESTION_ROLLBACK_PLAN.md`.
  - Updated runtime checklist with suggestion rollback switch.
- Checks passed:
  - `npm run typecheck:agent`
  - `npm run build:agent`
  - `node --test src/agent/testing/tests/suggestion.phase8.rollout.test.js`
  - `npm run test:agent-v2` (`pass 105 / fail 0`)
