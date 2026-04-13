# Agent Use Cases

This document maps real user scenarios to Agent v2 runtime behavior.

## 1. Case Intelligence Query (Read-Only)

### User Intent

- "Show me active lawsuits for this dossier and upcoming sessions."

### Runtime Path

- `transport/sse.handler.ts` accepts turn.
- `engine/agentic.loop.ts` classifies as `NEW`.
- loop executes read tools (`listLawsuits`, `listSessions`, `getEntityGraph`).
- read tool calls can run in parallel when all calls are `READ`.

### Streamed UX

- `tool_start` and `tool_result`
- `text_delta`
- `done`

### Design Value

- live data retrieval with bounded execution and no mutation risk.

## 2. Draft Generation Workflow

### User Intent

- "Draft a client update letter for dossier D-42."

### Runtime Path

- agent gathers context through read tools.
- uses `generateDraft` tool from `tools/draft`.
- emits structured draft sections and layout metadata.

### Streamed UX

- `draft_artifact`
- `text_delta`
- `done`

### Design Value

- separates semantic draft structure from renderer formatting and keeps output machine-actionable.

## 3. Planned Mutation with Human Confirmation

### User Intent

- "Mark this task as completed."

### Runtime Path

- plan tool (`proposeUpdate`) creates mutation proposal.
- pending action is stored.
- user confirmation turn triggers execution path.
- mutation runs through `EntityExecutor`.

### Streamed UX

- first turn: `plan_artifact`, `pending`
- confirmation turn: `plan_executed`, `confirmed`, `entity_mutation_success`

### Design Value

- high-trust pattern: no direct LLM mutation without explicit user approval.

## 4. Ambiguity Resolution

### User Intent

- "Update the task for Sara."

### Runtime Path

- multiple possible entities detected.
- ambiguity detector builds disambiguation payload.
- execution is paused until user selects target.

### Streamed UX

- `disambiguation`
- optional follow-up text asking user to choose.

### Design Value

- prevents silent wrong-entity mutations.

## 5. Proactive Suggestion Artifact

### User Intent

- implicit user intent detected, but explicit command is missing.

### Runtime Path

- loop calls `suggestAction` (system tool) at most once per turn.
- suggestion is validated as non-mutating and contextual.

### Streamed UX

- `suggestion_artifact`

### Design Value

- gives helpful next actions without bypassing safety controls.

## 6. Operator Incident Response

### User Intent

- system owner needs to reduce risk during instability.

### Runtime Path

- admin calls `/api/agent/v2/admin/safe-mode`.
- toggles `writesDisabled`, `forceReadOnly`, or `v2Disabled`.
- runtime behavior changes immediately for subsequent turns.

### Streamed UX

- blocked operations return controlled `error` outcomes.

### Design Value

- operational kill switches are first-class, not ad hoc patches.

## 7. Auth Scope Enforcement

### User Intent

- user with limited scope tries execute-level action.

### Runtime Path

- security evaluates auth scope.
- permission gate blocks forbidden categories.
- boundary validator checks decision consistency.

### Streamed UX

- permission failure surfaced as controlled error.

### Design Value

- explicit least-privilege enforcement for tool execution.

## 8. Retrieval or Grounding Degraded Mode

### User Intent

- continue using the assistant while optional modules are unavailable.

### Runtime Path

- retrieval or grounding can initialize in disabled mode.
- loop still runs with core capabilities and reduced context enrichment.

### Streamed UX

- regular response flow continues, with fewer enriched artifacts.

### Design Value

- graceful degradation instead of full outage.
