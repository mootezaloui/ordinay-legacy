# Mutation Authority Contract — Organia (Phase 1)

This contract defines the single authoritative way any data mutation is allowed to occur in Organia, grounded in Phase-1 audits (Rule Audit, Entity Relationships, Mutation Coverage) and the current regulated, audit-critical posture.

---

## 1. Mutation Authority Model
- **Mutation definition**: Any operation that creates, updates, deletes, cancels, closes/archives, changes status, nullifies references, or cascades removal of data in persisted entities.
- **Authoritative mutation**: A mutation that passes the approved validation pipeline, is recorded in the audit trail with actor attribution, and is executed only through approved mutation gateways.
- **Allowed initiators**:
  - Frontend UI: MAY initiate mutations but MUST call the authoritative pipeline.
  - Backend services/controllers: MAY execute mutations only through the authoritative pipeline.
  - Background/system processes: MAY initiate only through the authoritative pipeline with explicit actor/system attribution.
  - AI agents: Phase 1 = READ-ONLY; MAY only propose or simulate; execution requires the authoritative pipeline (see Section 6).
- **Disallowed initiators**: Direct database writes, bypassed service calls, or any path that skips the authoritative pipeline.

## 2. Single Authoritative Mutation Pipeline
All mutations MUST follow this exact sequence:
1. **Identity & Actor Context**: Resolve authenticated actor (user/system/agent) and target entity/action.
2. **Normalization & Intent Capture**: Normalize input (IDs, references, parent links) and capture intended action (create/edit/delete/status change/cascade).
3. **Validation Entry Point**: Invoke the unified validator (e.g., `canPerformAction` equivalent) on the backend with full live context.
4. **Domain Rule Enforcement**: Apply domain rules for the entity/action; if `allowed === false`, stop; if `requiresConfirmation`, require an explicit, auditable confirmation token before proceeding.
5. **Cascade Declaration**: Enumerate any cascades (child deletions, nullifications) up front; re-validate that cascades are permissible for the current state.
6. **Audit Pre-Write Record**: Write a pending audit intent entry (actor, entity, action, payload hash, cascade plan).
7. **Execute Mutation**: Perform the mutation atomically with the declared cascades only; no additional side effects outside the declared plan.
8. **Audit Completion Record**: Append completion audit with final state pointers, confirmation of cascades executed, and any warnings emitted.
9. **Failure Behavior**: On any failure, abort mutation, append a failure audit with reason, and perform no partial cascades.

## 3. Frontend vs Backend Responsibilities
- **Frontend MAY**:
  - Initiate mutation requests.
  - Present blockers/warnings/confirmation prompts.
  - Submit confirmation tokens and actor identity.
- **Frontend MUST NOT**:
  - Enforce domain rules as the sole authority.
  - Execute cascades locally.
  - Bypass the backend validator.
- **Backend MUST**:
  - Host the authoritative validation entry point.
  - Enforce domain rules and confirmation requirements.
  - Execute mutations and cascades atomically.
  - Record all audit events (intent, success, failure, cascades) with actor attribution.
- **Backend MUST NOT**:
  - Accept mutations without passing through the validation entry point.
  - Perform silent cascades or status changes without audit.
  - Trust frontend-only validation.

## 4. Cascade & Force-Delete Rules (Authoritative)
- Cascades are allowed **only** when explicitly declared, validated, and auditable.
- Every cascade must list affected child entities before execution; validation must confirm permissibility (state, dependencies).
- Force-delete flows must emit blockers/warnings and require explicit confirmation tokens; silent force deletes are forbidden.
- Cascades must be atomic with the parent mutation; partial cascades are forbidden.
- Any cascade must produce audit entries for both parent and each affected child reference (including deletions, nullifications).

## 5. History & Audit Guarantees
- **Append-only**: All mutation attempts (success or failure) must be recorded; deletion of history records is forbidden.
- **Actor attribution**: Every audit entry must include actor identity (user/system/agent) and source (UI/API/process).
- **Mutation type recording**: Record action type (create/update/delete/status change/cascade/force-delete) and scope.
- **Cascade traceability**: Record each cascaded entity ID/type and outcome.
- **Illegal behaviors**: Executing mutations without audit, deleting audit trails, or performing cascades without audit entries.

## 6. Agent Interaction Contract
- **Agent MAY**:
  - Read data and domain rule outcomes.
  - Propose mutations with full context and pass them to the authoritative pipeline.
- **Agent MAY NOT**:
  - Execute mutations directly against services or the database.
  - Bypass validation or audit.
- **Agent FUTURE EXECUTION CONDITIONS**:
  - Backend authoritative validator enforced server-side.
  - Audit trail append-only with actor attribution for agents.
  - Confirmation/force-delete flows require explicit, logged tokens.
  - No mutation path exists that bypasses the pipeline.

## 7. Forbidden Mutation Paths
- Direct controller/service mutations that bypass validation and audit (as observed in Phase-1 backend CRUD paths).
- Frontend-only cascades or direct API calls that skip backend validation.
- Silent cascades (missions/officers/clients/cases/dossiers) without validation and audit.
- History deletions or omission of mutation events.

## 8. Phase-2 Implications (Non-Executable)
- MUST implement backend authoritative validator/gateway that all mutations use.
- MUST centralize audit logging (intent, success, failure, cascades) and make it append-only.
- MUST remove or disable direct CRUD paths that bypass validation/audit.
- MUST enforce confirmation tokens for force-delete/cascade actions.
- MUST ensure cascades are validated and atomic.
- MUST NOT regress existing domain rule logic or allow frontend-only enforcement.

## 9. Phase-1 TODO File Update (reference)
See docs/phase1/TODO.md for updated task status and Phase-2 preparation tasks derived from this contract.
