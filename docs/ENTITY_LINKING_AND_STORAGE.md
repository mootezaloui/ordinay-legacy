# Entity Linking and Storage v2 - Audit and Phased Checklist

## Short Answer
- The executor does not guess links. It executes exactly what is in `plan.operation.payload` or `plan.operation.changes`.
- Session context (`activeEntities`) and draft metadata (`linkedEntityType`, `linkedEntityId`) help the LLM choose IDs, but this is soft guidance, not deterministic backend linking.
- Document disk storage is handled by document storage/services, not by a special document branch in `entity.executor.ts`.

## What Is Correct Today (as implemented)
- PLAN intent is intercepted and normalized through `proposeCreate`, `proposeUpdate`, `proposeDelete`.
- PLAN proposals are expanded by deterministic backend workflow planning before confirm.
- On confirm, executor runs service-layer create/update/delete and domain re-validation.
- Draft artifacts can carry `linkedEntityType` and `linkedEntityId`.
- Document records enforce strict parent-link integrity in `documents.service` (exactly one parent FK).

## Audit Findings (ordered by severity)

### 1) Critical - Document create can pass PLAN but fail at EXECUTE
- Current `proposeCreate` validation does not require document `file_path` or parent FK.
- `documents.service.create` requires:
  - `title`
  - `file_path`
  - exactly one parent reference (`client_id`, `dossier_id`, `lawsuit_id`, etc.)
- Result: proposal can look valid, then fail at execution.

### 2) High - Linking is still mostly prompt-driven for new creates
- Backend does not currently auto-resolve missing parent links from `activeEntities` at PLAN time.
- If the LLM omits required parent fields (`dossier_id`/`lawsuit_id`), service constraints reject execution.

### 3) High - Current draft link metadata is not strongly enforced in save flows
- `generateDraft` supports `linkedEntityType` and `linkedEntityId`.
- But there is no deterministic backend "save current draft as document" bridge that automatically converts draft + link into a valid document create payload (including file persistence details).

### 4) Medium - Previous doc assumptions were outdated
- PLAN tool input is `payload`, not `data` and not `linkedTo`.
- `entity.executor.ts` does not have a special document file-save branch.
- File storage is provided by `documentStorage` and document services/controllers.

## Architecture Reality (current)

### Mutation path
1. User intent -> LLM calls `proposeCreate` / `proposeUpdate` / `proposeDelete`
2. Agent intercepts PLAN proposal
3. `DomainWorkflowPlanner.expand(...)` builds `PendingActionPlan`
4. User confirms
5. `EntityExecutor.execute(...)` runs workflow steps or single root op
6. Underlying service (`clients.service`, `tasks.service`, `documents.service`, etc.) applies DB mutation

### Where linking is decided
- For create/update: parent links must be present in payload/changes (`client_id`, `dossier_id`, `lawsuit_id`, etc.).
- Domain planner can infer parent context for specific reopen/cascade workflows, but there is no generic create-link auto-fill contract yet.

### Where file storage is decided
- Upload/ingestion path: `documentStorage.saveUploadedDocument(...)` resolves path under app documents directory.
- Document create path persists `file_path` into `documents` table.
- Agent session attachments use `agentDocuments.service` + `agent_session_documents` bridge.

## Status Matrix (2026-04-01)

| Capability | Status | Notes |
|---|---|---|
| PLAN -> pending confirmation interception | Done | Deterministic |
| Workflow planning before execute | Done | Deterministic |
| Executor stop-on-first-failure | Done | Step-level results |
| Draft metadata link fields | Done | In draft artifact schema |
| Generic deterministic create-link resolver | Not done | Still LLM/prompt dependent |
| Deterministic draft-to-document persistence bridge | Done | Draft -> file -> linked document create is deterministic |
| PLAN-time validation for document storage fields | Done | Enforced in PLAN validation |
| EXECUTE preflight for link/storage before create | Done | Standardized `EXEC_PRECONDITION_*` failures |

## Phased Checklist

### Phase 0 - Contract and Audit Baseline
- [x] Audit real PLAN/EXECUTE/link/storage code paths.
- [x] Freeze source-of-truth contracts for proposal payload and executor behavior.
- [x] Mark outdated assumptions in previous doc.
- Definition of done: this doc reflects actual implementation.

### Phase 1 - Link Contract Hardening (PLAN layer)
- [x] Add entity-specific create constraints in PLAN validation:
  - `task/session/mission`: require exactly one of `dossier_id` or `lawsuit_id`.
  - `document`: require exactly one parent reference.
  - `document`: require a storage source contract (`file_path` or generation source token).
- [x] Reject invalid link payloads before pending confirmation.
- [x] Add unit tests for all required parent-link permutations.
- Definition of done: invalid create payloads are blocked at PLAN, not at EXECUTE.

### Phase 2 - Deterministic Link Resolver (Backend)
- [x] Add `LinkResolver.resolve(operation, sessionContext, draftContext)` in backend.
- [x] Deterministically fill missing parent IDs when unambiguous.
- [x] Return explicit ambiguity diagnostics when multiple candidates exist.
- [x] Write resolved link provenance into `plan.diagnostics` and `uiPreview`.
- Definition of done: link resolution is backend-deterministic, not prompt-only.

### Phase 3 - Draft-to-Document Persistence Bridge
- [x] Introduce explicit backend path: "save current draft as document".
- [x] Convert draft artifact to persisted file path (renderer/storage service contract).
- [x] Build document create payload with validated parent link and metadata.
- [x] Persist provenance: draft version, session id, source turn id.
- Definition of done: "save this draft to X" is deterministic end-to-end.

### Phase 4 - Executor Preflight and Error Semantics
- [x] Add preflight checks for storage/link requirements before `service.create`.
- [x] Standardize error codes for link/storage failures.
- [x] Surface user-actionable errors in plan execution artifact.
- Definition of done: confirm does not fail with avoidable validation surprises.

### Phase 5 - UX Clarity for Linking
- [x] Proposal UI must always show exact target link:
  - "Linked to: Client X / Dossier Y / Lawsuit Z"
- [x] Show whether link was user-specified vs auto-resolved.
- [x] If ambiguous, ask targeted disambiguation before proposal.
- Definition of done: users always know where data will be stored.

### Phase 6 - Sync and Traceability
- [x] Ensure sync events include entity link metadata for all created/updated entities.
- [x] Add audit trace field for link-resolution source (`explicit`, `resolved`, `fallback`).
- [x] Add observability counters for link-resolution failures.
- Definition of done: link decisions are debuggable and observable.

### Phase 7 - Regression Suite
- [x] Tests: create task without parent should fail at PLAN.
- [x] Tests: create document without file/link should fail at PLAN.
- [x] Tests: save draft with linked entity persists in correct parent scope.
- [x] Tests: ambiguous "save this document" forces disambiguation.
- [x] Tests: deterministic resolver picks same target for same context.
- Definition of done: linking/storage regressions are prevented by tests.

## Must-Pass Scenarios
- [ ] "Create a task for dossier D-42" -> proposal includes `dossier_id=42` and executes.
- [ ] "Create a task" with no parent context -> structured clarification before proposal.
- [ ] "Save this generated letter to dossier D-42" -> document stored with valid `file_path` and `dossier_id=42`.
- [ ] "Move document DOC-201 to lawsuit L-5001" -> update proposal shows old/new link and executes.
- [ ] Ambiguous link references ("save to the dossier") -> deterministic disambiguation prompt, no blind execution.

## Assumptions
- No distributed rollback is introduced in this track.
- PLAN tools stay as LLM mutation-intent entry points.
- Domain rules and service constraints remain backend authority.
- Linking/storage correctness must be guaranteed before execution, not recovered after failure.
