# Document System Audit (2026-03-16)

## Scope
- Backend document storage, metadata, routes, agent session attachments, and generation pipeline.
- Frontend document tabs and agent document panel behavior.
- Current runtime/data state from local SQLite.
- Focused on post-OCR-removal behavior.

## Methodology
- Static code audit across backend/frontend document modules.
- Route/controller/service contract checks.
- Live DB snapshot checks for document statuses and storage integrity.

## Executive Summary
- OCR/document-understanding execution is disabled in backend services, and the system now works primarily as storage + metadata + generated documents.
- The largest risks are around file-path trust boundaries and shared-file deletion behavior.
- UX/contracts still contain some OCR-era semantics (`processing`, continue/retry OCR actions) that should be normalized.

## Findings (By Severity)

### Critical
1. Document API can be used for local file exfiltration if untrusted code can hit localhost.
- Evidence:
  - `backend/src/app.js:10`
  - `backend/src/routes/index.js:64`
  - `backend/src/services/documents.service.js:19`
  - `backend/src/controllers/documents.controller.js:197`
- Why it matters:
  - `POST /documents` accepts `file_path`.
  - `GET /documents/:id/download` serves that path with `res.download`.
- Recommended fix:
  - Enforce auth and request-origin trust for document routes.
  - Restrict CORS to trusted app origin(s).
  - Enforce backend allowlist: downloadable files must live under the managed document root.

### High
2. Physical file deletion can orphan other active document records.
- Evidence:
  - `backend/src/services/documentStorage.js:86`
  - `frontend/src/services/documentService.js:427`
  - `frontend/src/services/documentService.js:476`
- Why it matters:
  - Storage deduplicates by content hash (`same content -> same file_path`).
  - Deleting one link with `deleteFile=true` can remove the shared file for all linked records.
- Recommended fix:
  - Add file-reference counting and only physically delete when no active document row references the path.

3. Agent session attachments are anchored to business entities and can persist after unbind/clear.
- Evidence:
  - `backend/src/services/agentDocuments.service.js:130`
  - `backend/src/services/agentDocuments.service.js:134`
  - `backend/src/services/agentDocuments.service.js:436`
  - `backend/src/services/agentDocuments.service.js:449`
- Why it matters:
  - Session documents are created under an officer/client/dossier fallback due strict FK rule in `documents`.
  - Unbind/clear removes junction rows but leaves document metadata/files unless separately cleaned.
- Recommended fix:
  - Introduce explicit session-document ownership model (separate table or nullable parent strategy) and cleanup policy.

### Medium
4. Backend does not enforce ingest format governance on upload endpoints.
- Evidence:
  - `frontend/src/services/api/agentDocuments.ts:117`
  - `frontend/src/services/api/agentDocuments.ts:121`
  - `backend/src/controllers/documents.controller.js:50`
  - `backend/src/services/documentStorage.js:71`
- Why it matters:
  - Frontend warns unsupported types, but backend still stores them.
- Recommended fix:
  - Validate extension + MIME on backend using `documentFormatGovernance` before save.

5. Status model drift remains after OCR removal (`processing` still appears in schema/API/UI).
- Evidence:
  - `backend/src/db/schema.sql:309`
  - `backend/src/db/connection.js:236`
  - `backend/src/services/documents.service.js:93`
  - `frontend/src/services/api/agentDocuments.ts:24`
  - `frontend/src/components/DetailView/tabs/DocumentsTab.jsx:181`
- Why it matters:
  - UX and contracts still imply OCR lifecycle.
- Recommended fix:
  - Normalize to current states (`readable`, `unreadable`, `disabled`) across DB defaults, API types, and UI labels.

6. Upload flow is non-atomic (`/documents/upload` then `/documents`).
- Evidence:
  - `frontend/src/services/documentService.js:212`
  - `frontend/src/services/documentService.js:231`
  - `backend/src/controllers/documents.controller.js:50`
- Why it matters:
  - A file can be saved without metadata if metadata creation fails.
- Recommended fix:
  - Add atomic backend endpoint that stores file + metadata in one transaction/operation.

7. Agent session document frontend contract still carries OCR controls while backend is disabled.
- Evidence:
  - `frontend/src/services/api/agentDocuments.ts:265`
  - `frontend/src/Agent_front/components/AgentSessionDocumentsPanel.tsx:350`
  - `backend/src/controllers/agentDocuments.controller.js:186`
  - `backend/src/services/agentDocuments.service.js:538`
- Why it matters:
  - UI/actions and TS signatures still reference continue OCR modes/pages though backend ignores them.
- Recommended fix:
  - Remove OCR-specific params/actions from frontend API and panel copy.

### Low
8. Efficiency issues in document UI checks and SSE subscriptions.
- Evidence:
  - `frontend/src/Agent_front/components/AgentSessionDocumentsPanel.tsx:284`
  - `frontend/src/components/DetailView/tabs/DocumentsTab.jsx:73`
  - `frontend/src/services/documentService.js:621`
- Why it matters:
  - Potential stale subscriptions and N+1 file existence checks.
- Recommended fix:
  - Use stable dependency keys for SSE and add batch file-existence endpoint.

9. `/documents` list endpoint has no pagination guard.
- Evidence:
  - `backend/src/controllers/documents.controller.js:13`
  - `backend/src/services/documents.service.js:444`
- Why it matters:
  - Potential large payloads as data grows.
- Recommended fix:
  - Shift list route to paged `listFiltered` (`limit`, `offset`, optional query).

## Current Runtime Snapshot (Local, 2026-03-16)
- Documents total: 102 active (102 total, 0 soft-deleted).
- `text_status`: 78 `readable`, 24 `unreadable`, 0 `processing`.
- `analysis_status`: 78 `completed`, 24 `disabled`.
- `copy_type`: 102 `generated`.
- Agent session bindings (`agent_session_documents`): 0.
- Missing physical files among active documents: 0.

## What Is Working Well
- OCR/understanding pipeline execution is disabled in core backend paths.
  - `backend/src/services/documents.service.js:93`
  - `backend/src/services/agentDocuments.service.js:505`
  - `backend/src/agent_Back/chat/chat.agent.service.js:4627`
- Backend binds loopback-only by default.
  - `backend/src/server.start.js:1`
  - `backend/src/server.start.js:15`
- Document AI settings endpoints force local-disabled behavior.
  - `backend/src/controllers/documents.controller.js:208`

## Prioritized Remediation Plan
1. Security boundary hardening for `file_path` and download routes (Critical).
2. Reference-safe physical deletion (High).
3. Session-attachment ownership and cleanup redesign (High).
4. Backend upload format enforcement (Medium).
5. Status/contract normalization after OCR removal (Medium).
6. Atomic upload+metadata endpoint (Medium).
7. UI/API cleanup of OCR-specific controls and strings (Medium).

## Suggested Acceptance Criteria
- Download route rejects any path outside managed document roots.
- Physical delete cannot orphan any active metadata record.
- Session attachment lifecycle is isolated and does not pollute business entity scopes.
- No frontend/backend contract exposes OCR-specific controls in disabled mode.
- Document listing endpoints support bounded pagination.

