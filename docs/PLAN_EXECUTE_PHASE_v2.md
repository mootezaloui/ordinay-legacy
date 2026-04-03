# PLAN and EXECUTE Phase - v2 Implementation Checklist

## Scope and Baseline

This checklist is for the v2 agent in `backend/src/agent`.

Current status confirmed in code:

- READ tools are implemented and loaded.
- DRAFT tool (`generateDraft`) is implemented with artifact streaming.
- PLAN tools are not implemented yet (`src/agent/tools/plan` is empty).
- Runtime currently boots READ + DRAFT only (`src/agent/transport/runtime.factory.ts`).
- Pending confirmation flow already exists in `agentic.loop.ts`, but it is based on `WRITE/EXECUTE` interception, not a clean PLAN contract.
- `agent_Back` is removed, so this plan is based only on current v2 code and docs.

---

## Clean Architecture Rules (Do Not Break)

- Keep one execution path in `AgenticLoop`; do not introduce a second workflow engine.
- PLAN tools must only propose; they must never mutate DB directly.
- EXECUTE stays internal to confirmation handling; the LLM must not directly execute side effects.
- Keep mutation mapping centralized in one executor service (`entity.executor.ts`), not spread across tools.
- Reuse existing frontend artifact system where possible (`proposal`) before creating new UI frameworks.
- Prefer extending current session/pending structures over adding new persistence tables.
- Keep mode/permission policy explicit and small; avoid hidden heuristics.

---

## Target Flow (MVP)

1. User asks for create/update/delete.
2. LLM calls PLAN tool (`proposeCreate`/`proposeUpdate`/`proposeDelete`).
3. Loop intercepts PLAN result, creates `pendingAction`, emits `plan_artifact`.
4. Frontend renders confirmation card.
5. User confirms/rejects/amends.
6. On confirm, backend executes through `entity.executor`, emits `plan_executed`.
7. On reject, pending is cleared, emits `plan_rejected`.
8. On amend, LLM reproposes and replaces pending action.

---

## Phase Checklist

## Phase 0 - Contract Freeze

- [x] Finalize event contracts for v2 stream:
  - `plan_artifact`
  - `plan_executed`
  - `plan_rejected`
- [x] Finalize pending action envelope shape in `src/agent/types.ts` (what data PLAN must persist for EXECUTE).
- [x] Freeze entity operation format for executor input (`operation`, `entityType`, `payload`, `changes`, etc.).

Definition of done:

- [x] Event payload examples documented in this file.
- [x] No open ambiguity about field names between backend and frontend.

### Phase 0 Frozen Decisions

1. PLAN remains the only LLM entrypoint for DB mutation intent:
   - LLM calls `proposeCreate` / `proposeUpdate` / `proposeDelete`.
   - Confirmation path performs execution internally (no direct LLM EXECUTE tool call).
2. Stream event names are frozen as:
   - `plan_artifact`
   - `plan_executed`
   - `plan_rejected`
3. Pending action must carry a normalized operation snapshot (not only free-form args) so confirm/amend/retry all work deterministically.

---

## Phase 1 - Core Types and Shared Contracts

- [x] Update `src/agent/types.ts`:
  - [x] Extend `PendingAction` with structured plan payload (not only summary + raw args).
  - [x] Add typed plan artifact payload type.
- [x] Update `src/agent/tools/tool.types.ts`:
  - [x] Keep category contracts aligned with active PLAN/EXECUTE flow.
- [x] Update persistence rebuild helpers:
  - [x] `src/agent/persistence/session.repository.utils.js`
  - [x] `src/agent/persistence/session.repository.js`
  - [x] Ensure new pending payload fields serialize/deserialize safely.
- [x] Update stream event union in `src/agent/transport/stream.emitter.ts`.

Definition of done:

- [x] Typecheck passes (`npm run typecheck:agent`).
- [x] Pending actions survive reload with full plan payload.

---

## Phase 2 - PLAN Tool Layer

- [x] Implement PLAN tools:
  - [x] `src/agent/tools/plan/proposeCreate.tool.ts`
  - [x] `src/agent/tools/plan/proposeUpdate.tool.ts`
  - [x] `src/agent/tools/plan/proposeDelete.tool.ts`
  - [x] `src/agent/tools/plan/index.ts`
- [x] Implement entity schema/normalization:
  - [x] `src/agent/tools/plan/entity.schemas.ts`
  - [x] Validation of required fields, enum safety, and ID types.

Definition of done:

- [x] PLAN tools return normalized proposal payloads.
- [x] Tool input validation rejects malformed proposals cleanly.

---

## Phase 3 - Runtime Bootstrapping and Permissions

- [x] Update `src/agent/transport/runtime.factory.ts`:
  - [x] Load and register PLAN tools.
- [x] Update `src/agent/safety/permission.gate.ts`:
  - [x] Explicit mode matrix for READ, DRAFT, PLAN, EXECUTE, SYSTEM.
  - [x] Keep READ_ONLY strict (no PLAN/EXECUTE).
  - [x] Keep DRAFT mode non-mutating.

Definition of done:

- [x] Runtime list shows plan tools in EXECUTE/AUTONOMOUS modes only.
- [x] Permission tests cover mode matrix edge cases.

---

## Phase 4 - Loop Integration (PLAN Intercept + Artifact Emission)

- [x] Update `src/agent/engine/agentic.loop.ts`:
  - [x] Intercept `ToolCategory.PLAN` calls (instead of legacy `WRITE` path).
  - [x] Create pending action from normalized PLAN payload.
  - [x] Emit `plan_artifact` via stream callbacks/emitter.
  - [x] Keep AMENDMENT replacement behavior with `replacedPendingActionId`.
- [x] Add loop callbacks for new artifact events.
- [x] Keep existing DRAFT guard flow unchanged.

Definition of done:

- [x] Explicit mutation request yields `plan_artifact` and no DB write.
- [x] Amendment replaces pending proposal deterministically.

---

## Phase 5 - EXECUTE Service (Confirmed Mutations)

- [x] Add `src/agent/engine/entity.executor.ts`:
  - [x] Map entity + operation to existing domain services.
  - [x] Return typed success/failure payload.
  - [x] Centralize error normalization.
- [x] Integrate in confirmation path in `src/agent/engine/agentic.loop.ts`:
  - [x] On confirmation, execute pending through executor.
  - [x] Emit `plan_executed` event.
  - [x] Clear pending action only after completion decision.
  - [x] Update active entities/session metadata when relevant.
- [x] On rejection path:
  - [x] Emit `plan_rejected` event.

Definition of done:

- [x] Confirmed plan executes exactly once.
- [x] Failures are user-safe and auditable.

---

## Phase 6 - Prompt and Behavior Alignment

- [x] Update prompt instructions where currently defined:
  - [x] `src/agent/engine/agentic.loop.ts` (system policy block)
  - [x] `src/agent/memory/context.assembler.js` (if needed for parity)
- [x] Add PLAN usage rules:
  - [x] Use PLAN tools for create/update/delete.
  - [x] Never execute mutation without user confirmation.

Definition of done:

- [x] LLM behavior follows PLAN-first flow in regression tests.

---

## Phase 7 - Transport and Frontend Wiring

- [x] Backend stream transport:
  - [x] `src/agent/transport/sse.handler.ts` forwards new artifact callbacks.
  - [x] `src/agent/transport/stream.emitter.ts` supports new event types.
- [x] Frontend stream parser:
  - [x] `frontend/src/services/api/agent.ts` handles `plan_artifact`, `plan_executed`, `plan_rejected`.
- [x] Frontend state mapping:
  - [x] `frontend/src/Agent_front/hooks/useAgentState.ts` maps events to UI message data.
- [x] UI rendering strategy (recommended minimal path):
  - [x] Reuse `ProposalArtifact` for plan confirmation.

Definition of done:

- [x] User can confirm/reject from UI with correct state transitions.
- [x] Event ordering is stable during streaming.

---

## Phase 8 - Tests and Hardening

- [x] Add/extend backend tests:
  - [x] PLAN proposal creation.
  - [x] Confirmation executes mutation.
  - [x] Rejection clears pending.
  - [x] Amendment replaces pending.
  - [x] Mode restrictions.
- [x] Extend scenario fixtures in `src/agent/testing/scenario.fixtures.js`.
- [x] Add stream-level event assertions in v2 tests.
- [x] Run:
  - [x] `npm run typecheck:agent`
  - [x] `npm run build:agent`
  - [x] `npm run test:agent-v2`

Definition of done:

- [x] All phase-critical tests pass.
- [x] No regression on existing READ + DRAFT flows.

---

## Event Payloads (Frozen in Phase 0)

Use these as stable contracts for implementation.

```ts
type PlanOperation = {
  operation: "create" | "update" | "delete";
  entityType: string;
  entityId?: number | string;
  payload?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  reason?: string;
};

type PendingActionEnvelope = {
  id: string;
  toolName: "proposeCreate" | "proposeUpdate" | "proposeDelete";
  summary: string;
  args: Record<string, unknown>;
  createdAt: string;
  requestedByTurnId?: string;
  risk?: "low" | "medium" | "high";
  plan: {
    operation: PlanOperation;
    preview?: {
      title?: string;
      subtitle?: string;
      fields?: Array<{ key: string; from?: unknown; to?: unknown }>;
      warnings?: string[];
    };
  };
};

type PlanArtifactEvent = {
  type: "plan_artifact";
  artifact: {
    pendingActionId: string;
    operation: PlanOperation;
    summary: string;
    preview?: PendingActionEnvelope["plan"]["preview"];
  };
};

type PlanExecutedEvent = {
  type: "plan_executed";
  artifact: {
    pendingActionId: string;
    ok: boolean;
    result?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
  };
};

type PlanRejectedEvent = {
  type: "plan_rejected";
  artifact: {
    pendingActionId: string;
  };
};
```

---

## Non-Goals (to avoid overengineering now)

- [ ] No new workflow DSL/state-machine framework.
- [ ] No new database tables for plan artifacts.
- [ ] No generic plugin platform work in this phase.
- [ ] No autonomous auto-execution policy changes in MVP.

---

## Final Readiness Gate

Before starting implementation:

- [x] Phase 0 contract freeze completed.
- [ ] All file paths in this plan still match current repository.
