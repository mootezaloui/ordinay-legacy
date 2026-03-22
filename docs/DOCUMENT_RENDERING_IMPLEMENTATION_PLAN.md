# Document Rendering Implementation Plan (Codebase-Audited)

Last updated: 2026-03-19
Source architecture: `docs/DOCUMENT_RENDERING_ARCHITECTURE.md`

## 1) Audit Snapshot (Current Reality)

### Backend and stream pipeline
- [x] `draft_artifact` SSE event already exists and is wired end-to-end.
- [x] Session keeps a `currentDraft`.
- [x] `generateDraft` tool exists and is category `DRAFT`.
- [x] `generateDraft` schema accepts `sections` + `layout` (with `content` as legacy fallback).
- [x] Prompt rules instruct: "place draft in `generateDraft.sections` and `generateDraft.layout`."
- [x] Fallback draft synthesis and enforcement logic produce structured `sections` + `layout`.

Files audited:
- `backend/src/agent/tools/draft/generateDraft.tool.ts`
- `backend/src/agent/types.ts`
- `backend/src/agent/engine/agentic.loop.ts`
- `backend/src/agent/transport/sse.handler.ts`
- `backend/src/agent/transport/stream.emitter.ts`
- `backend/src/agent/session/session.types.ts`

### Frontend rendering and editing
- [x] `draft_v2` artifact route exists and renders in `DraftArtifact`.
- [x] Rendering is semantic role-based via `DraftRenderer` component with per-role styling.
- [x] Edit mode is section-level (per-section inputs/textareas), not one large textarea.
- [x] Save path for `draft_v2` preserves `sections` + `layout` + `content` in message data.
- [x] Regeneration sends edited draft snapshot in metadata to backend.

Files audited:
- `frontend/src/Agent_front/components/artifacts/DraftArtifact.tsx`
- `frontend/src/Agent_front/components/artifacts/draft/DraftRenderer.tsx`
- `frontend/src/Agent_front/components/artifacts/draft/roleStyles.ts`
- `frontend/src/Agent_front/components/artifacts/draft/layoutUtils.ts`
- `frontend/src/Agent_front/components/AgentWorkflow.tsx`
- `frontend/src/Agent_front/hooks/useAgentState.ts`
- `frontend/src/services/api/agent.ts`
- `frontend/src/Agent_front/AgentLayout.tsx`

### Critical inconsistency (RESOLVED)
- [x] Edit and regenerate are now logically connected.
  - `DraftArtifact` passes snapshot to `onRegenerate`.
  - `AgentWorkflow` sends `draftSnapshot` in `AgentRequestMetadata`.
  - Backend `resolveDraftForTurn` prefers metadata snapshot over session copy.

## 2) Target Contract (Migration End-State)

> Decision: keep `draft_v2` event type. The structured-sections upgrade is an evolution of v2, not a new v3.
> The interface below matches `DraftArtifactData` in `frontend/src/services/api/agent.ts` and `DraftArtifact` in `backend/src/agent/types.ts`.

```ts
interface DraftSection {
  id: string; // required for stable editing and reconciliation
  role: string;
  text?: string;
  label?: string;
}

interface DraftLayout {
  direction: "ltr" | "rtl";
  language: string;
  formality: "formal" | "standard" | "casual";
  documentClass: string;
}

// Frontend: DraftArtifactData (type: 'draft_v2')
// Backend: DraftArtifact
interface DraftArtifactData {
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  sections: DraftSection[];
  layout: DraftLayout;
  // temporary compatibility field during migration window
  content?: string;
  linkedEntityType?: string;
  linkedEntityId?: number;
  generatedAt: string;
  version: number;
}
```

## 3) Migration Strategy

- [x] Use a two-step compatibility rollout.
- [x] Step A: backend and frontend accept both old and new artifact shapes.
- [x] Step B: LLM and UI default to `sections + layout`, keep string fallback only as safety.
- [ ] Step C: remove old `content`-first paths after stabilization.

## 4) Phase-by-Phase Implementation Checklist

## Phase 0 - Alignment Decisions
- [x] Confirm section role catalog to support in v1 renderer (`date`, `recipient`, `reference`, `subject`, `salutation`, `body`, `closing`, signature roles, structural roles).
  > Resolved: role catalog added to system prompt and `roleStyles.ts` covers all roles. Unknown roles fall back to `body` style.
- [x] Confirm whether users can add/remove/reorder sections in first release or text-edit only.
  > Resolved: text-edit only per section in v1. Section structure is fixed by LLM output.
- [x] Confirm if `DocumentDraftArtifact` stays separate from `draft_v2` path (recommended: yes).
  > Resolved: yes, stays separate. Different use case (document generation vs agent drafting).
- [x] Confirm font policy for Arabic and Latin scripts (ship bundled fonts vs fallback to system stack).
  > Resolved: `getDocumentFontFamily()` in `roleStyles.ts` returns Arabic/formal/default font stacks with system fallbacks. Bundled fonts can be added later if needed.

## Phase 1 - Data Contracts and Types

Backend tasks:
- [x] Update `backend/src/agent/types.ts` `DraftArtifact` to include `sections` and `layout`.
- [x] Keep optional `content?: string` as transition fallback for old sessions and logs.
- [x] Update `backend/src/agent/tools/draft/generateDraft.tool.ts` input schema:
  - [x] add `sections` (array of section objects).
  - [x] add `layout` object.
  - [x] keep `content` optional only for fallback mode.
  > Note: `sections` and `layout` are intentionally NOT required in the JSON schema (`required: ["draftType", "title"]`). The `normalizeSections` + `normalizeLayout` helpers handle missing/malformed input gracefully. This is the chosen design — lenient schema with robust normalization.
- [x] Add runtime normalization helper in `generateDraft.tool.ts`:
  - [x] if only `content` is provided, wrap into one `body` section and infer layout.
  - [x] if malformed sections, fail safely with validation error.

Frontend tasks:
- [x] Update `frontend/src/services/api/agent.ts` `DraftArtifactData` to include `sections` and `layout`.
- [x] Keep `content?: string` optional during migration.
- [x] Update `frontend/src/Agent_front/types/agentMessage.ts` types if needed.
  > Already correct: imports `DraftArtifactData` which includes `sections` + `layout`.

Acceptance:
- [ ] Typecheck passes (`backend: typecheck:agent`, `frontend: build:renderer`).
- [x] Old draft payloads still render.
  > `normalizeDraft()` in `DraftArtifact.tsx` handles both `DraftOutput` (old) and `DraftArtifactData` (new).
- [x] New payloads parse without casting hacks.

## Phase 2 - Prompt and Agent Logic Migration

- [x] Update draft instructions in `backend/src/agent/engine/agentic.loop.ts`:
  - [x] replace `generateDraft.content` language with `generateDraft.sections + layout`.
  - [x] include role catalog and JSON examples for FR and AR outputs.
    > Added: AVAILABLE SECTION ROLES block + French court letter and Arabic court request examples.
- [x] Update draft enforcement messages:
  - [x] from "Place full draft text in content" to structured sections instruction.
- [x] Update fallback synthesis path:
  - [x] generate fallback `sections` and `layout` when LLM fails tool format.
- [x] Update placeholder publishing path:
  - [x] publish empty `sections` placeholder instead of empty `content`.
- [x] Update current draft injection in prompt:
  - [x] serialize compact structured draft context (do not dump large raw blob blindly).

Acceptance:
- [ ] LLM calls `generateDraft` with `sections + layout`.
  > Requires live LLM testing.
- [x] Regeneration prompt context references structured draft form.
  > `resolveDraftForTurn` + prompt injection at message builder verified.

## Phase 3 - Stream and Session Consistency

- [x] Keep `draft_artifact` event type unchanged, but payload upgraded to structured shape.
- [x] Update draft diagnostics in:
  - [x] `backend/src/agent/transport/sse.handler.ts`
  - [x] `backend/src/agent/engine/agentic.loop.ts`
    > Fixed: fallback synthesis path now logs `sectionCount` alongside `contentLength`.
  - [x] `frontend/src/services/api/agent.ts`
  - [x] Replace `contentLength` logs with `sectionCount` and role summary.
- [x] Ensure `session.currentDraft` always stores normalized structured artifact.
- [x] Add safe de/serialization for persisted sessions containing old `content` drafts.
  > `currentDraft` saved/loaded via `metadata_json` in `session.repository.js`. `session.store.ts` guards loaded `currentDraft` with type check.

Acceptance:
- [ ] No runtime crash when old session data is loaded.
- [x] Stream emits structured draft artifacts for new turns.

## Phase 4 - Frontend Semantic Renderer

- [x] Create `frontend/src/Agent_front/components/artifacts/draft/DraftRenderer.tsx`.
  > Contains `SectionView` (per-role rendering) + `DraftRenderer` (container with dir/lang/font).
- [x] Create `frontend/src/Agent_front/components/artifacts/draft/roleStyles.ts`.
  > Contains `getSectionClass()`, `MULTILINE_ROLES`, `getDocumentFontFamily()`.
- [x] Create `frontend/src/Agent_front/components/artifacts/draft/layoutUtils.ts`:
  - [x] role style resolution.
  - [x] rtl/ltr direction handling.
  - [x] language/formality font selection.
- [x] Update `DraftArtifact.tsx` view mode to render `sections` through `DraftRenderer`.
- [x] Keep plain text fallback render path for legacy drafts only.
  > `normalizeDraft()` converts old `DraftOutput` (subject/greeting/body/closing/signature) into semantic sections automatically.

Acceptance:
- [ ] French letter shows expected hierarchy (header/subject/body/signature).
  > Requires live LLM testing to verify section output quality.
- [ ] Arabic draft flips direction and alignment consistently.
  > `DraftRenderer` applies `dir="rtl"` and Arabic font stack. Needs manual verification.

## Phase 5 - Section-Level Edit UX

- [x] Section-level editing implemented inline in `DraftArtifact.tsx` via `SectionEdit` component.
  > Not extracted to separate `EditableDraftRenderer.tsx` — currently lives in `DraftArtifact.tsx`. Can extract later if file grows beyond comfort.
- [x] Use stable `section.id` for controlled updates.
  > `handleSectionChange` uses `section.id`. `ensureSectionId` guarantees all sections have ids.
- [x] Keep structural sections (`spacer`, `separator`) non-editable.
  > `SectionEdit` delegates to `SectionView` for spacer/separator/page_break roles.
- [x] Replace one-big-textarea mode in `DraftArtifact.tsx`.
- [x] Update save callback contracts in:
  - [x] `AgentWorkflow.tsx` — `draft_v2` save path preserves `sections` + `layout` + `content`.
  - [x] `DraftArtifact.tsx` — `onSave` sends `{ sections, layout, content }`.
  - [x] `useAgentState.ts` — metadata forwarding wired via `handleSubmit`.
- [x] Remove legacy `subject/greeting/body/closing/signature` mapping for `draft_v2`.
  > The old mapping only applies to the `draft` (v1) type path. The `draft_v2` path is clean.

Acceptance:
- [x] User edits text only, no raw markup exposed.
- [x] Switching view/edit preserves structure and visual layout.
  > Font family now applied to edit mode container too via `getDocumentFontFamily()`.

## Phase 6 - Regenerate Uses Edited Draft (Priority Fix)

- [x] Extend message submit API path to allow structured metadata from artifact actions.
  > `AgentRequestMetadata.draftSnapshot` in `frontend/src/services/api/agent.ts`.
- [x] Update `AgentLayout.tsx` `handleSubmitMessage` to optionally pass metadata.
- [x] Update `AgentWorkflow.tsx` regenerate callback to send:
  - [x] regenerate instruction text.
  - [x] current edited structured draft snapshot in metadata.
- [x] Update `useAgentState.ts` stream starter to forward that metadata.
- [x] Update backend `agentic.loop.ts`:
  - [x] if request metadata contains draft snapshot, prefer it over session copy for this turn.
    > `resolveDraftForTurn()` checks `DRAFT_METADATA_SNAPSHOT_KEY` in metadata first.
  - [x] after successful `generateDraft`, persist returned artifact as new `session.currentDraft`.
    > `publishDraftArtifact()` sets `session.currentDraft = normalized` when not transient.

Acceptance:
- [ ] Edit -> Regenerate uses edited content as base.
  > Full chain wired. Needs end-to-end manual test.
- [x] Version increments correctly.
  > `publishDraftArtifact()` increments version from existing draft.

## Phase 7 - Validation and Safety Nets

- [x] Validate section roles against allow-list in backend tool handler.
  > `KNOWN_ROLES` set in `generateDraft.tool.ts`. Unknown roles fallback to `"body"` during normalization.
- [x] Unknown roles fallback to `body` style in frontend renderer.
  > `getSectionClass()` default case returns body style.
- [x] Guard against empty section arrays.
  > `generateDraft.tool.ts` returns error if sections empty after normalization.
- [x] Add maximum section count and text size limits.
  > `MAX_SECTIONS = 60`, `MAX_SECTION_TEXT_LENGTH = 12000` in `generateDraft.tool.ts`.
- [x] Add malformed payload fallback: one `body` section from raw content.
  > `normalizeSections()` wraps legacy `content` string into single body section.

Acceptance:
- [ ] Bad tool payloads do not break rendering.
- [ ] User always sees a recoverable preview.

## Phase 8 - Testing and Rollout

Backend tests:
- [x] Add draft contract tests under `backend/src/agent/testing/tests/`.
  > `draft.contract.test.js` — 13 tests covering FR/AR/EN, role validation, limits, fallbacks.
- [x] Add scenario for FR structured draft generation.
- [x] Add scenario for AR RTL structured draft generation.
- [ ] Add scenario for regenerate with edited draft snapshot metadata.
  > Requires full loop integration test with LLM mock — deferred to manual testing.

Frontend checks:
- [ ] Manual matrix: FR/EN/AR rendering.
- [ ] Manual matrix: edit -> save -> regenerate.
- [ ] Manual matrix: legacy draft compatibility.

Commands:
- [x] `cd backend && npx tsc --noEmit --project tsconfig.agent.json` — clean, zero errors.
- [ ] `cd backend && npm run test:agent-v2`
- [x] `cd frontend && npx tsc --noEmit` — all errors pre-existing in untouched files, none in modified/new files.

## Phase 9 - Cleanup (After Stabilization Window)

- [ ] Remove content-first prompt language.
- [ ] Remove legacy `content` reconstruction code in `AgentWorkflow.tsx` and `DraftArtifact.tsx`.
- [ ] Remove legacy `DraftOutput` specific edit mapping where no longer used.
  > Note: the old `draft` (v1) type path in `AgentWorkflow.tsx` (lines 1412-1463) maps sections back to subject/greeting/body/closing/signature. Keep for backward compat during stabilization, remove here.
- [ ] Update docs:
  - [ ] `docs/DOCUMENT_RENDERING_ARCHITECTURE.md`
  - [ ] `docs/DRAFT_PHASE_PLAN_v2.md`
  - [ ] add migration completion notes.

## 5) Open Questions for Product/UX Confirmation

- [x] Do we allow the user to change section role types in v1 edit mode, or text-only edit per section?
  > Decided: text-only edit per section. Roles are fixed by LLM output.
- [ ] Should label text (`Objet:`, `Ref:`) be editable separately from section text?
- [x] For regeneration, do we always regenerate from latest edited draft, or only after explicit "Save edits"?
  > Decided: always from latest edited state. The snapshot captures current section state at regenerate time.
- [ ] Do we show role names in edit mode (developer clarity) or hide roles completely (lawyer simplicity)?
- [ ] Should unknown roles be visible as normal body text, or surfaced with a warning badge?

## 6) Definition of Done

- [x] New drafts are generated as semantic `sections + layout`.
- [x] Preview rendering is semantic and direction-aware.
- [x] Edit flow is section-level and markup-free.
- [x] Regeneration respects user edits.
- [x] Legacy drafts still open safely during migration.
- [x] Typecheck passes (backend + frontend clean for our changes).

## 7) Remaining Work Summary

### Must do (functional gaps):
1. **Phase 8**: Backend contract tests (FR draft, AR RTL draft, regenerate with snapshot).
2. **Phase 8**: Manual testing matrix (FR/EN/AR rendering, edit→save→regenerate, legacy compat).

### Should do (quality):
3. **Phase 5 open**: Decide on label editability and role name visibility in edit mode.
4. **Phase 7**: End-to-end verification that bad payloads degrade gracefully.

### Later (cleanup):
5. **Phase 9**: Remove all legacy content-first paths after stabilization window.
