# LangSearch V2 Migration Phases

## Scope

This checklist tracks migration from legacy `backend/src/agent_Back` to `backend/src/agent` (v2) for external search.

Migration rules:

- Keep only simple web search.
- Remove deep search from frontend and shared contracts.
- Remove `agent_Back` after migration is complete.

---

## Phase 0 - Contract Freeze

- [x] Freeze migration scope to simple web search only.
- [x] Freeze output contract target: `web_search_results` only.
- [x] Freeze decommission target: remove `agent_Back` after v2 migration and verification.

Definition of done:

- [x] No new deep-search behavior is introduced in v2.
- [x] All next phases follow this scope.

---

## Phase 1 - Backend V2 Migration

- [x] Add LangSearch simple search tool to `backend/src/agent/tools/read`.
- [x] Register the tool in v2 read tool loading.
- [x] Emit frontend-compatible search artifact events from v2 SSE transport.
- [x] Move mock MCP websearch server usage away from `agent_Back` path.

Definition of done:

- [x] v2 backend can surface `web_search_results` without `agent_Back`.

---

## Phase 2 - Frontend Deep Search Removal

- [x] Remove deep-search mode controls from agent input UI.
- [x] Remove deep-search output types from shared API/agent message contracts.
- [x] Update workflow/status rendering to web-search-only behavior.

Definition of done:

- [x] Frontend contains no deep-search mode/path in active agent flow.

---

## Phase 3 - Legacy Folder Decommission

- [x] Delete `backend/src/agent_Back`.
- [x] Remove legacy script references to `agent_Back`.
- [x] Remove legacy backend npm scripts that target `agent_Back`.

Definition of done:

- [x] Repository has no runtime references to `agent_Back`.

---

## Phase 4 - Verification and Fixes

- [x] Run backend checks (`typecheck:agent`, `build:agent`, targeted tests).
- [x] Run frontend build/type checks.
- [x] Record fixes required during validation and mark completed items.

Definition of done:

- [ ] Migration is validated end-to-end.

Validation notes (2026-04-03):

- [x] `backend`: `npm run typecheck:agent` passed.
- [x] `backend`: `npm run build:agent` passed.
- [x] `backend`: `npm run test:agent-v2` passed (`109/109`).
- [x] `frontend`: `npm run test:agent-suggestions` passed (`5/5`).
- [ ] `frontend`: `npm run build:renderer` currently fails with existing TypeScript errors in:
  `src/Agent_front/components/AgentMessage.tsx`, `src/Agent_front/components/AgentWorkflow.tsx`,
  `src/Agent_front/components/artifacts/CommentaryBubble.tsx`, `src/Agent_front/components/UserCommand.tsx`,
  `src/services/api/client.ts`.
- [x] Regression fix applied: phase4 scenario assertion now validates suggestion-vs-draft behavior without brittle wording dependency.
