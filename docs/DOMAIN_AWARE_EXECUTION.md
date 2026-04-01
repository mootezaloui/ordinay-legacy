# Domain-Aware Execution v2 — Phased Checklist

## Summary
- Replaces prompt-driven cascade behavior with deterministic backend workflow planning.
- Keeps LLM mutation intent entry points as-is: `proposeCreate`, `proposeUpdate`, `proposeDelete`.
- Expands risky parent/status/delete mutations into workflow steps before confirmation.
- Uses one confirmation for full workflow execution.
- Execution policy is MVP-safe: stop on first failure, report step-level results, no global rollback.
- Financial/destructive transitions can require explicit user decision before execution.

## Public/Contract Changes
- `PendingActionPlan` now supports workflow plan payload:
  - `rootOperation`
  - `workflowSteps[]`
  - `diagnostics`
  - `uiPreview`
- Added step model:
  - `DomainWorkflowStep = { id, actionType, operation, entityType, entityId?, payload?, changes?, reason?, dependsOn[] }`
- Plan artifact preview now supports grouped cascade output and decision prompts.
- Plan execution result now supports:
  - `stepResults[]`
  - `failedStepId`
  - `errorCode`
  - `errorMessage`

## Current Status (2026-04-01)
- Backend typecheck/build: passing.
- Agent v2 tests: passing (`test:agent-v2`).
- Frontend baseline build has pre-existing TypeScript errors unrelated to this plan; workflow mapping compiles.
- Phase 0–5 implementation audit: complete (contracts, planner, analyzer, and executor are aligned with checklist).
- Phase 7 sync plumbing implemented:
  - Backend SSE emits `entity_mutation_success` for successful workflow steps (including partial-failure workflows).
  - Frontend applies targeted sync per mutation event and falls back to scoped full reload on sync miss.
  - Covered by `plan.phase7.test.js`.
- Phase 8 hardening implemented:
  - Added planner scenario coverage for deactivate cascade, settlement decision gating, delete decision gating, and ancestor-reopen planning (`domain.workflow.planner.test.js`).
  - Added stale-plan confirm safety coverage with step-level failure diagnostics (`plan.phase8.test.js`).
  - Added backend/frontend rule-parity coverage for status aliases and ancestor constraints (`domain.rule.profile.test.js`).

## Phase Checklist

### Phase 0 — Contract Freeze and Rule Inventory
- [x] Freeze architecture decisions: deterministic planner, no new PLAN tool, stop-on-failure execution.
- [x] Audit current rule surface in `domainRules.js`, blocker enrichment, and PLAN/EXECUTE flow.
- [x] Freeze status normalization policy (`inactive/inActive`, `closed/Closed`, paid variants) via canonical normalizer.
- [x] Add rule matrix table to this doc: transition -> blockers -> resolver steps.
- [x] Freeze user-decision-required policy list (financial settlement, destructive cascade confirmation).
- Definition of done: stable contracts and rule policy set.

### Phase 1 — Domain Rule Profile (Backend Deterministic Core)
- [x] Implement backend rule profile module for transition constraints and resolver context.
- [x] Encode dependencies for client, dossier, lawsuit, task/session/mission blockers, financial entries, and officer activity.
- [x] Add canonical status mapper used by planner and executor.
- [x] Add rule-profile unit tests for each supported transition.
- Definition of done: transitions can be validated deterministically without LLM heuristics.

### Phase 2 — Graph Analysis and Blocker Detection
- [x] Implement analyzer on top of `getEntityGraph` + targeted READ tools for planning path.
- [x] Convert entity relations into blocker sets (`open_*`, `unpaid_receivables`, linked children).
- [x] Add deterministic ordering strategy (children first, root last).
- [x] Add diagnostics payload (`blockerCounts`, `notes`, decisions).
- Definition of done: equivalent input state yields deterministic blocker/step order.

### Phase 3 — Workflow Expansion (Intent -> Multi-Step Plan)
- [x] Add `DomainWorkflowPlanner.expand(rootOperation, context)`.
- [x] Expand blocked mutation into workflow steps with dependency reasons.
- [x] Support no-cascade path when operation is already valid.
- [x] Support decision-required plan path for unresolved financial/destructive decisions.
- Definition of done: blocked root mutations return executable workflow or explicit decision-required plan.

### Phase 4 — Pending Plan and Artifact Integration
- [x] Persist workflow plan in pending action payload.
- [x] Emit enriched `plan_artifact` with workflow preview structure.
- [x] Preserve amendment flow (recompute/replace pending action).
- [x] Keep confirmation/rejection event contract stable.
- Definition of done: UI receives one structured plan for confirm/reject/amend.

### Phase 5 — Domain-Aware Executor
- [x] Execute `workflowSteps[]` sequentially.
- [x] Re-validate each step before apply (fail fast on stale/invalid state).
- [x] Return `stepResults` + domain blocker failure details.
- [x] Verify and harden idempotency guard for repeated confirm clicks in workflow path.
- Definition of done: deterministic, auditable execution with safe partial-failure behavior.

### Phase 6 — UX and Confirmation Clarity
- [x] Wire workflow-aware plan preview mapping in frontend proposal state.
- [x] Finalize user-facing proposal card layout for "Main change" + "Required related changes".
- [x] Remove remaining technical/internal labels from confirmation UI.
- [x] Ensure current -> target values always come from live entity data when available.
- [x] Surface decision-required options in confirmation summary.
- Definition of done: clean user-facing confirmation cards.

### Phase 7 — Instant App Sync (No Manual Refresh)
- [x] Emit mutation sync events for each successful workflow step.
- [x] Ensure all affected screens subscribe and reconcile local caches/state.
- [x] Add targeted refetch fallback on sync miss.
- [ ] Verify cross-module immediate updates for multi-entity cascades.
- Definition of done: no manual refresh after confirmation.

### Phase 8 — Regression, Scenarios, and Hardening
- [x] Add scenarios: deactivate client with open children, delete with descendants, reopen constraints, paid/unpaid decisions.
- [x] Add stale-data tests between proposal and confirm.
- [x] Add mid-workflow failure tests with correct failed-step reporting.
- [x] Add parity tests vs frontend domain-rule expectations.
- Definition of done: known confirm-then-fail regressions are prevented.

## Rule Matrix (Phase 0 Artifact)

| Root transition | Blockers detected | Resolver workflow (ordered) | Decision required |
|---|---|---|---|
| `client.status -> inactive` | Open dossiers, open lawsuits, non-terminal tasks/sessions/missions, unpaid receivables | Close tasks/sessions/missions -> close lawsuits -> close dossiers -> set client inactive | Yes if unpaid receivables and no explicit settlement intent |
| `dossier.status -> closed` | Open lawsuits, non-terminal tasks/sessions/missions, unpaid receivables (linked client) | Close tasks/sessions/missions -> close lawsuits -> set dossier closed | Yes if unpaid receivables and no explicit settlement intent |
| `lawsuit.status -> closed` | Non-terminal tasks/sessions/missions | Close tasks/sessions/missions -> set lawsuit closed | No |
| `officer.status -> inactive` | Active missions | Block until missions become terminal | No |
| `delete client` | Linked dossiers | Block or require explicit force-delete decision | Yes for destructive cascade |
| `delete dossier` | Linked lawsuits/tasks/sessions/missions | Block or require explicit force-delete decision | Yes for destructive cascade |
| `delete lawsuit` | Linked tasks/sessions/missions | Block or require explicit force-delete decision | Yes for destructive cascade |

## User-Decision-Required Policy (Phase 0 Artifact)
- Financial settlement impact:
  - Any workflow that would implicitly settle unpaid receivables requires explicit user decision unless intent clearly asks for settlement.
- Destructive cascade impact:
  - Delete operations with linked children require explicit force-delete style confirmation.
- Planner must pause execution path and produce decision options in preview when required.

## Test Scenarios (Must Pass)
- [x] Client inactive request with open dossiers/tasks/sessions/missions/lawsuits -> cascade plan before execution.
- [x] Client inactive request with unpaid receivables -> explicit decision required, no silent auto-pay.
- [x] Delete parent with children -> cascade proposal or clear block reason.
- [x] Update closed-linked child -> valid reopen/alternative deterministic plan.
- [ ] Confirmed cascade updates all related UI modules instantly.
- [x] Double confirm click executes once only.
- [x] Stale snapshot between plan and confirm yields safe failure + actionable retry.

## Assumptions and Defaults
- MVP does not add distributed rollback transaction orchestration.
- Existing PLAN tools remain the only LLM mutation intent tools.
- Domain planner logic is deterministic backend authority; prompt heuristics are secondary.
- Financial state changes with accounting impact require explicit confirmation.
