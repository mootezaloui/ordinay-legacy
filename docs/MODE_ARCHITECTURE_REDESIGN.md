# Mode Architecture Redesign - v2 Implementation Checklist

## Scope and Baseline

This checklist applies to the v2 agent stack in:

- `backend/src/agent`
- `frontend/src/services/api/agent.ts`
- `frontend/src/Agent_front`

Current codebase baseline (confirmed):

- Frontend infers mode in `inferAgentV2Mode(...)` and sends `mode` in `/agent/v2/stream` payload.
- Backend stream parser requires `mode` (`sse.handler.ts -> parseInput`).
- Security input sanitizer requires `mode` (`security/input.sanitizer.js`).
- Session model persists `mode` (`session/session.types.ts`, `session/session.store.ts`, `persistence/session.repository.js`).
- Permission gate is mode-matrix based (`safety/permission.gate.ts`).
- Security permission boundary validates mode + scope + category (`security/permission.boundary.js`).
- Auth scope evaluator uses mode (`security/auth.scope.js`).
- Loop tool exposure is mode-filtered (`agentic.loop.ts -> listToolsForMode`).
- Loop behavior has many `input.mode === "DRAFT"` branches for draft enforcement.

---

## Architecture Decision (Frozen)

1. Mode is removed from runtime contract. The frontend must not infer or send mode.
2. The LLM always sees the full tool surface (subject to role/scope policy, not mode).
3. Safety comes from category behavior:
   - READ/SYSTEM execute immediately.
   - DRAFT emits draft artifact and never mutates DB directly.
   - PLAN emits pending plan artifact; execution only on user confirmation.
4. No direct LLM execution path for database side effects.
5. Role-based restrictions are allowed, mode-based restrictions are removed.

---

## Clean Rules (Do Not Break)

- Keep one execution pipeline in `AgenticLoop`; do not fork a second orchestration path.
- Keep PLAN interception and confirmation execution centralized in the existing pending flow.
- Do not reintroduce mode-like heuristics under a different name.
- Avoid DB schema migration in this phase unless absolutely required.
- Maintain backward compatibility for persisted sessions when possible.
- Keep security fail-closed for auth and permission boundary decisions.

---

## Target Contract (Mode-less)

Incoming stream request:

```ts
type AgentV2StreamRequest = {
  sessionId: string;
  turnId: string;
  message: string;
  userId?: string;
  metadata?: Record<string, unknown>;
};
```

No `mode` field in:

- frontend request payload
- backend input parser
- agent turn input type
- session runtime model

Tool categories remain and drive behavior, not eligibility.

---

## Phase Checklist

## Phase 0 - Contract Freeze and Impact Map

- [x] Freeze mode-less request contract and examples in this file.
- [x] Freeze category-driven behavior contract (READ/DRAFT/PLAN/SYSTEM).
- [x] Freeze compatibility policy for existing persisted sessions containing mode.
- [x] Identify all mode dependencies (transport, security, loop, session, tests) and lock file list.

Definition of done:

- [x] No ambiguity on "what replaces mode" (answer: nothing; category behavior + role/scope policy only).
- [x] Migration file map is complete and accepted.

### Phase 0 Frozen Contract

1. Incoming request contract is mode-less:
   - Required: `sessionId`, `turnId`, `message`
   - Optional: `userId`, `metadata`
   - `mode` is not part of the v2 contract.
2. Tool behavior is category-driven, not mode-driven:
   - READ/SYSTEM: immediate execution
   - DRAFT: artifact generation flow
   - PLAN: pending confirmation flow
   - EXECUTE: internal confirmation path only
3. Safety model is confirmation-first:
   - No DB mutation without explicit user confirmation of pending PLAN action.
4. Compatibility rule:
   - Legacy clients that still send `mode` are accepted during migration and the field is ignored.
5. Authorization model:
   - Keep scope/role-based fail-closed checks.
   - Remove mode as an authorization input.

### Phase 0 Migration File Map (Frozen)

Frontend request + stream contract:

- `frontend/src/services/api/agent.ts`
- `frontend/src/Agent_front/hooks/useAgentState.ts`

Backend transport + input parsing:

- `backend/src/agent/transport/sse.handler.ts`
- `backend/src/agent/security/input.sanitizer.js`

Core types + session model:

- `backend/src/agent/types.ts`
- `backend/src/agent/tools/tool.types.ts`
- `backend/src/agent/session/session.types.ts`
- `backend/src/agent/session/session.store.ts`
- `backend/src/agent/config.ts`

Persistence:

- `backend/src/agent/persistence/session.repository.js`
- `backend/src/agent/persistence/session.repository.utils.js`

Permissions + security:

- `backend/src/agent/safety/permission.gate.ts`
- `backend/src/agent/security/permission.boundary.js`
- `backend/src/agent/security/auth.scope.js`
- `backend/src/agent/security/index.js`

Loop + execution:

- `backend/src/agent/engine/agentic.loop.ts`
- `backend/src/agent/engine/tool.executor.ts`

Prompt/loop dependencies for draft safeguards and ambiguity handling:

- `backend/src/agent/memory/context.assembler.js`
- `backend/src/agent/engine/ambiguity.detector.js` (re-scoped from legacy UX preflight)
- `backend/src/agent/engine/agentic.loop.ts`
- `backend/src/agent/llm/native.provider.ts`

Legacy pre-LLM UX gate modules under `backend/src/agent/ux/*` were removed as part of
`docs/PREFLIGHT_GATE_REMOVAL.md` (Phases 3-4).

Test fixtures and assertions:

- `backend/src/agent/testing/scenario.fixtures.js`
- `backend/src/agent/testing/scenario.runner.js`
- `backend/src/agent/testing/tests/*`

---

## Phase 1 - Frontend Request Contract (Remove Guessing)

Files:

- `frontend/src/services/api/agent.ts`
- `frontend/src/Agent_front/hooks/useAgentState.ts` (if mode metadata assumptions exist)

Tasks:

- [x] Remove `AgentV2Mode` type.
- [x] Remove `inferAgentV2Mode(...)`.
- [x] Stop sending `mode` in `v2Request` payload for `/agent/v2/stream`.
- [x] Remove mode-related frontend logging fields.
- [x] Keep `requestedAction` metadata only if needed for auth/audit (not for mode inference).

Definition of done:

- [x] Network payload to `/agent/v2/stream` contains no `mode`.
- [x] "Hello", draft prompts, and mutation prompts all reach backend without client-side mode branching.

---

## Phase 2 - Transport and Input Sanitization (Mode Optional -> Removed)

Files:

- `backend/src/agent/transport/sse.handler.ts`
- `backend/src/agent/security/input.sanitizer.js`

Tasks:

- [x] Update input parse contract to not require `mode`.
- [x] Remove `normalizeAgentMode(...)` and mode validation errors.
- [x] Remove mode from stream start/end diagnostic payloads.
- [x] Update sanitizer to validate payload without mode.
- [x] Preserve backward compatibility for older clients that still send mode (ignore field safely).

Definition of done:

- [x] Backend accepts mode-less payloads.
- [x] Backend does not fail on legacy payloads that still include mode.

---

## Phase 3 - Core Types and Session Model

Files:

- `backend/src/agent/types.ts`
- `backend/src/agent/tools/tool.types.ts`
- `backend/src/agent/session/session.types.ts`
- `backend/src/agent/session/session.store.ts`
- `backend/src/agent/config.ts`

Tasks:

- [x] Remove `AgentMode` enum.
- [x] Remove `mode` from `AgentTurnInput`.
- [x] Remove `mode` from `ToolExecutionContext`.
- [x] Remove `mode` from `Session` and session creation input.
- [x] Remove `DEFAULT_AGENT_MODE` and any mode defaulting.

Definition of done:

- [x] Type layer compiles without mode references in agent core contracts.
- [x] Session lifecycle no longer depends on mode initialization.

---

## Phase 4 - Persistence Compatibility

Files:

- `backend/src/agent/persistence/session.repository.js`
- `backend/src/agent/persistence/session.repository.utils.js`

Tasks:

- [x] Stop reading/writing runtime `session.mode`.
- [x] Keep loading legacy rows with `mode` column without failure.
- [x] Keep saving sessions without introducing new migration complexity.
- [x] Ensure replay/load paths do not reconstruct mode into runtime session object.

Definition of done:

- [x] Existing sessions load successfully.
- [x] New sessions persist and reload without mode-dependent behavior.

---

## Phase 5 - Permission and Security Refactor (No Mode Matrix)

Files:

- `backend/src/agent/safety/permission.gate.ts`
- `backend/src/agent/security/permission.boundary.js`
- `backend/src/agent/security/auth.scope.js`
- `backend/src/agent/security/index.js`

Tasks:

- [x] Replace mode-matrix permission gate with mode-less decision model:
  - Tool/category validity
  - Role/scope policy
  - Confirmation requirement flag
- [x] Remove mode from permission boundary validation inputs.
- [x] Rework auth scope checks to rely on user scope + requested action semantics, not mode.
- [x] Keep fail-closed behavior on invalid security decisions.

Definition of done:

- [x] No security component requires mode input.
- [x] Scope-based denials still work and are auditable.

---

## Phase 6 - Loop and Tool Exposure (Always-On Tool Surface)

Files:

- `backend/src/agent/engine/agentic.loop.ts`
- `backend/src/agent/engine/tool.executor.ts`

Tasks:

- [x] Replace `listToolsForMode(...)` with mode-less listing for LLM tool schema exposure.
- [x] Remove `permissionGate.evaluate(mode, tool)` callsites and pass mode-less context.
- [x] Keep PLAN intercept path unchanged semantically (pending action + plan artifact).
- [x] Keep confirmation and rejection turn handling unchanged semantically.
- [x] Remove or refactor mode-branching where it is only policy plumbing.

Definition of done:

- [x] LLM can call READ/DRAFT/PLAN tools in one conversation without mode switching.
- [x] PLAN actions still require explicit confirmation before execution.

---

## Phase 7 - Draft Enforcement De-mode

Files:

- `backend/src/agent/engine/agentic.loop.ts`
- `backend/src/agent/memory/context.assembler.js`
- `backend/src/agent/llm/native.provider.ts` (if mode-gated drafting helpers exist)
- `backend/src/agent/engine/ambiguity.detector.js`
- `backend/src/agent/transport/sse.handler.ts` (transport bypass metadata + disambiguation compatibility)

Tasks:

- [x] Replace `input.mode === "DRAFT"` guards with intent/tool-driven checks.
- [x] Preserve existing draft quality controls (`DRAFT_DETAILS_REQUIRED`, ambiguity/context guards) without mode.
- [x] Remove mode hints from prompt-building logic; keep one unified capabilities/safety policy.
- [x] Remove UX policy assumptions tied to READ_ONLY vs DRAFT where no longer valid.

Definition of done:

- [x] Draft generation remains deterministic and guarded.
- [x] Mutation prompts no longer get downgraded to "draft environment" errors due to mode.

---

## Phase 8 - Frontend UX Cleanup

Files:

- `frontend/src/Agent_front/components/*` (if any mode UI remnants)
- `frontend/src/Agent_front/hooks/useAgentState.ts`
- `frontend/src/services/api/agent.ts`

Tasks:

- [x] Remove remaining mode vocabulary from user-facing and debug UX.
- [x] Keep Proposal/Draft/Suggestion artifacts as the only user-facing control surface.
- [x] Ensure confirm/reject flows remain consistent with backend events.

Definition of done:

- [x] User can run read, draft, and plan requests in one thread without any mode UI.
- [x] Artifact-driven UX is the only safety interaction pattern visible to users.

---

## Phase 9 - Tests, Fixtures, and Regression Hardening

Files:

- `backend/src/agent/testing/tests/*`
- `backend/src/agent/testing/scenario.fixtures.js`
- `backend/src/agent/testing/scenario.runner.js`
- frontend tests where stream payload is mocked (if present)

Tasks:

- [x] Migrate fixtures to mode-less request payload.
- [x] Replace mode matrix tests with scope/category policy tests.
- [x] Add scenario test: mixed conversation (read -> draft -> plan -> confirm) without mode.
- [x] Add regression tests for legacy payload compatibility (mode provided, ignored safely).
- [x] Verify no regression in PLAN/DRAFT artifact streaming.
- [x] Run:
  - [x] `npm run typecheck:agent`
  - [x] `npm run build:agent`
  - [x] `npm run test:agent-v2`

Definition of done:

- [x] All updated tests pass.
- [x] No blocking regression in existing READ + DRAFT + PLAN confirmation flows.

---

## Non-Goals (This Phase)

- [ ] No new workflow engine or state machine framework.
- [ ] No full RBAC redesign; only minimum scope-based checks needed for current runtime.
- [ ] No broad UI redesign beyond removing mode concepts.
- [ ] No mandatory DB migration just to remove historical `mode` column.

---

## Final Readiness Gate

Before rollout:

- [x] Frontend sends no mode.
- [x] Backend accepts mode-less contract and ignores legacy mode field.
- [x] Permission/security layers are mode-free and fail-closed.
- [x] Loop/tool execution is category-driven only.
- [x] Plan/Draft artifact behaviors match current UX expectations.
- [x] Full agent-v2 test suite passes.
