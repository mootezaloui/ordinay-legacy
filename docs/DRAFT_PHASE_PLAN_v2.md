# DRAFT Phase — Implementation Plan (Audited)

> Last updated: 2026-03-18
> Status: Implementation complete — all Phase 2A-2C tasks done, Phase 2D (testing) pending

---

## Scope

DRAFT phase = generate text artifacts + display them + edit + regenerate.
That's it. No saving, no exporting, no database mutations.

Export (save to file, create document record, attach to dossier) is an
EXECUTE action and will be implemented in Phase 3 (PLAN/EXECUTE).

```
DRAFT phase delivers:
  ✓ LLM gathers context via READ tools
  ✓ LLM generates draft text via generateDraft tool
  ✓ Frontend renders Draft Card (view, edit, regenerate, discard)
  ✓ LLM can suggest drafts proactively
  ✓ Regeneration with user instructions

DRAFT phase does NOT deliver:
  ✗ Export to PDF/DOCX
  ✗ Save to database
  ✗ Attach to dossier/lawsuit
  ✗ Document templates or letterheads
  ✗ Version history persistence
```

---

## Codebase Audit Findings

> These findings were gathered from auditing the actual V2 agent codebase
> on 2026-03-18. They inform every decision below.

### Backend — What Exists (agent/)

| Component | File | Status |
|-----------|------|--------|
| ToolCategory enum | `agent/tools/tool.types.ts` | Has READ, WRITE, PLAN, EXECUTE, EXTERNAL — **NO DRAFT** |
| StreamEvent types | `agent/transport/stream.emitter.ts` | Has text_delta, tool_start, tool_result, pending, confirmed, disambiguation, done, error — **NO draft_artifact** |
| Session interface | `agent/session/session.types.ts` | Has state, turns, history, activeEntities — **NO currentDraft** |
| Tool executor | `agent/engine/tool.executor.ts` | Handles READ logging only — **NO DRAFT-specific logic** |
| Agentic loop | `agent/engine/agentic.loop.ts` | Fully functional. System prompt is **inline** (READ_POLICY_INSTRUCTIONS) |
| System prompts | **No `prompts/` directory exists** | Prompt text lives directly in `agentic.loop.ts` |
| AgentMode enum | `agent/types.ts` | Has READ_ONLY, **DRAFT**, EXECUTE, AUTONOMOUS — mode exists, no tools use it |
| Permission gate | `agent/safety/` | Exists, evaluates mode × tool category — DRAFT not wired |
| Read tools | `agent/tools/read/` | 33 tools, all functional |
| Draft tools | **None in agent/** | DRAFT tools only exist in agent_Back/ |

### Backend — What Exists in agent_Back/ (Reference Only)

| Component | File | Notes |
|-----------|------|-------|
| genericDraft tool | `agent_Back/tools/draft/genericDraft.tool.js` (537 lines) | LLM-powered via Ollama, builds prompts, parses sections |
| planGeneratedDocument tool | `agent_Back/tools/draft/planGeneratedDocument.tool.js` (212 lines) | v3-only, uses documentGenerationService |
| Draft contract | `agent_Back/contracts/draft.contract.js` (300 lines) | DRAFT_TYPE, DRAFT_TONE, DRAFT_SOURCE enums |
| Tool registry categories | `agent_Back/tools/tool.registry.js` | Has DRAFT category defined |

**Decision**: We do NOT port genericDraft from agent_Back. It uses Ollama directly and
has its own prompt/parse pipeline. In V2, the LLM itself generates draft content within
the agentic loop and calls `generateDraft` to emit the artifact. The tool is a structured
output emitter, not a content generator.

### Frontend — What Exists

| Component | File | Status |
|-----------|------|--------|
| DraftArtifact | `Agent_front/components/artifacts/DraftArtifact.tsx` (224 lines) | Old sectioned draft (subject/greeting/body/closing/signature). **REPLACE** |
| DocumentDraftArtifact | `Agent_front/components/artifacts/DocumentDraftArtifact.tsx` (110 lines) | Newer title+content draft. **REPLACE** |
| DraftCard (legacy) | `Agent_front/cards/DraftCard.tsx` (57 lines) | Legacy card, not in artifact workflow. **REMOVE** |
| DraftOutput type | `services/api/agent.ts` line 427 | Typed for INVITATION, CLIENT_EMAIL, HEARING_SUMMARY, INTERNAL_NOTE |
| DocumentDraftOutput type | `services/api/agent.ts` line 803 | Has type, title, content, metadata, entityType, entityId |
| SSE streaming | `services/api/agent.ts` → `streamAgentMessage()` | Uses `onResult` callback for structured artifacts |
| Agent state hook | `Agent_front/hooks/useAgentState.ts` (~2000 lines) | Handles onResult → sets message.data → triggers artifact render |
| AgentWorkflow | `Agent_front/components/AgentWorkflow.tsx` (~600 lines) | Routes data.type to artifact component |
| AgentMessageData types | `Agent_front/types/agentMessage.ts` | Includes 'draft' and 'document_draft' as valid types |

**Key frontend insight**: The existing flow is `onResult → message.data → AgentWorkflow → artifact renderer`.
There is NO separate `draft_artifact` SSE event type. Drafts arrive as structured output inside the
standard `artifact` SSE result event, with a `type` field that routes to the right component.

---

## Architecture (Corrected)

```
User: "Write a postponement letter for the Bouazizi hearing"
  │
  ▼
┌────────────────────────────────────────────────────────────┐
│ AGENTIC LOOP (agent/engine/agentic.loop.ts)                │
│                                                            │
│ 1. LLM calls READ tools to gather context                 │
│    listClients({ search: "Bouazizi" }) → client            │
│    getEntityGraph("client", id, depth:2) → full picture    │
│                                                            │
│ 2. LLM generates the draft text in its reasoning           │
│                                                            │
│ 3. LLM calls generateDraft({                               │
│      draftType: "court_letter",                             │
│      title: "Request for Session Postponement",             │
│      subtitle: "Case #2025/COM/1847 · Tribunal de Tunis",  │
│      metadata: { client, dossier, language, tone },         │
│      content: "Tunis, le 18 mars 2026\n\nÀ Monsieur..."    │
│    })                                                       │
│                                                            │
│ 4. Tool executor detects DRAFT category                    │
│    → executes immediately (like READ, no confirmation)     │
│    → emits draft_artifact SSE event                        │
│    → stores draft in session.state.currentDraft            │
│                                                            │
│ 5. LLM continues with text response:                       │
│    "I've drafted a postponement request..."                 │
└────────────────────────────────────────────────────────────┘
  │
  ▼
┌────────────────────────────────────────────────────────────┐
│ FRONTEND                                                   │
│                                                            │
│ SSE stream delivers:                                       │
│   1. text_delta events (agent's conversational message)    │
│   2. draft_artifact event (NEW — structured draft data)    │
│                                                            │
│ useAgentState.ts handles draft_artifact:                    │
│   → stores artifact in message.data (type: "draft_v2")     │
│   → AgentWorkflow routes to new DraftArtifactCard          │
│                                                            │
│ DraftArtifactCard renders:                                  │
│   - Header with draftType badge + metadata fields           │
│   - Document surface (view / edit modes)                    │
│   - Regenerate input panel                                  │
│   - Action bar: Discard | Edit | Regenerate | Export (disabled) │
│   - Result footer for discarded/exported states             │
└────────────────────────────────────────────────────────────┘
```

---

## The Draft Tool

```typescript
// ONE tool handles all draft types
// File: agent/tools/draft/generateDraft.tool.ts (NEW)
{
  name: "generateDraft",
  category: "DRAFT",           // ← New category, added to ToolCategory enum
  description: "Generate a draft document, letter, email, summary, or other "
    + "text artifact. Call this AFTER gathering all necessary context with READ "
    + "tools. The content field contains the full draft text. Use when: the user "
    + "asks to write, draft, compose, prepare, or generate any text. Also suggest "
    + "drafts when you identify an opportunity (e.g., approaching deadline, "
    + "missing document, follow-up needed).",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: {
      draftType: {
        type: "string",
        description: "Type of draft: court_letter | demand_letter | "
          + "client_letter | counsel_letter | legal_notice | contract | "
          + "email | sms | summary | case_report | hearing_prep | "
          + "session_notes | evidence_list | financial_summary | "
          + "memo | task_brief | other"
      },
      title: {
        type: "string",
        description: "Title for the draft"
      },
      subtitle: {
        type: "string",
        description: "Subtitle — typically case reference and court"
      },
      metadata: {
        type: "object",
        description: "Key-value pairs displayed in the card header. "
          + "Include relevant fields like client, dossier, language, "
          + "tone, recipient. Use 2-4 fields maximum.",
        additionalProperties: { type: "string" }
      },
      content: {
        type: "string",
        description: "The complete draft text with line breaks"
      },
      linkedEntityType: {
        type: "string",
        description: "Entity this draft relates to: client | dossier | lawsuit"
      },
      linkedEntityId: {
        type: "integer",
        description: "ID of the related entity"
      }
    },
    required: ["draftType", "title", "content"]
  }
}
```

---

## SSE Event (NEW type added to StreamEmitter)

```typescript
// Added to StreamEvent union in agent/transport/stream.emitter.ts
| { type: "draft_artifact"; artifact: DraftArtifact }

// DraftArtifact shape (defined in agent/types.ts)
interface DraftArtifact {
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  content: string;
  linkedEntityType?: string;
  linkedEntityId?: number;
  generatedAt: string;   // ISO timestamp
  version: number;       // 1-based, increments on regeneration
}
```

---

## Regeneration Flow

```
User clicks "Regenerate" → types "make it shorter and more urgent"
  │
  ▼
Frontend sends NEW message to /agent/v2/stream:
  { message: "Regenerate the draft: make it shorter and more urgent",
    metadata: { regenerateDraft: true, currentDraftContent: "..." } }
  │
  ▼
Backend: agentic.loop runs. session.state.currentDraft exists.
  The system prompt context includes the current draft.
  LLM sees: "User wants to regenerate. Current draft: [content].
  Instructions: make it shorter and more urgent."
  │
  ▼
LLM generates new content → calls generateDraft → new draft_artifact SSE event
  │
  ▼
Frontend receives new draft_artifact → replaces card with version: N+1
```

---

## Discard Flow

```
User clicks "Discard"
  → Card transitions to "discarded" state (red footer, "Draft discarded")
  → "Restore" button re-shows the draft (purely frontend, draft stays in memory)
```

No backend call needed for discard. It's a UI state change.

---

## System Prompt Additions

Append to `READ_POLICY_INSTRUCTIONS` in `agent/engine/agentic.loop.ts` (the system
prompt lives inline there — no separate prompts/ directory exists):

```
DRAFTING:

You can generate draft documents, letters, emails, summaries, and other
text artifacts. When the user asks you to write, draft, compose, or
prepare any text:

1. FIRST gather all necessary context using READ tools:
   - Who is the client? Get their details.
   - What case/dossier is this for? Get the full picture.
   - What are the relevant facts (dates, parties, court, case number)?

2. THEN generate the draft by calling the generateDraft tool with:
   - draftType: the category of document
   - title: a clear title
   - metadata: client name, dossier reference, language, tone
   - content: the complete text of the draft
   - linkedEntityType/Id: what entity this relates to

3. After generating, tell the user you've prepared the draft and invite
   them to review, edit, or regenerate it.

DRAFT CONTENT RULES:
- Write in the same language the user is using (French, Arabic, or English)
- Use appropriate legal register and terminology for the jurisdiction
- Include all relevant factual details from the case data you retrieved
- For letters: include proper headers, date, recipient, salutation, body, closing
- For summaries: organize by sections with clear headings
- NEVER invent facts. Only include information retrieved from READ tools.
- Use [placeholder] brackets for information you don't have (e.g., [Nom de l'avocat])

DRAFT SUGGESTIONS:
After answering a query or analyzing a case, consider suggesting a draft
if it would be helpful:
- Upcoming deadline with no filing → suggest drafting the submission
- Overdue item → suggest a follow-up letter
- Case review → suggest a status summary for the client
- New hearing scheduled → suggest hearing preparation notes
Say: "Would you like me to draft [specific thing]?" — don't auto-generate.
```

---

## Implementation Tasks

### Phase 2A: Backend Foundation

```
[x] Task 1: Add DRAFT to ToolCategory enum
    File: agent/tools/tool.types.ts (UPDATE — 1 line)
    - Add DRAFT = "DRAFT" to the ToolCategory enum
    Why: Currently only READ, WRITE, PLAN, EXECUTE, EXTERNAL exist.
         DRAFT category is required before any draft tool can be registered.

[x] Task 2: Add DraftArtifact type to agent types
    File: agent/types.ts (UPDATE — ~15 lines)
    - Add DraftArtifact interface
    - Fields: draftType, title, subtitle?, metadata?, content,
      linkedEntityType?, linkedEntityId?, generatedAt, version

[x] Task 3: Add currentDraft to session state
    File: agent/session/session.types.ts (UPDATE — 1 line)
    - Add currentDraft?: DraftArtifact to Session interface
    - Used for regeneration context (agentic loop reads it)

[x] Task 4: Add draft_artifact to StreamEvent union
    File: agent/transport/stream.emitter.ts (UPDATE — ~5 lines)
    - Add { type: "draft_artifact"; artifact: DraftArtifact } to StreamEvent
    - Update toCompatPayload() to handle the new event type
```

### Phase 2B: Backend — Draft Tool + Integration

```
[x] Task 5: Create generateDraft tool
    File: agent/tools/draft/generateDraft.tool.ts (NEW)
    - Define inputSchema (draftType, title, subtitle, metadata, content,
      linkedEntityType, linkedEntityId)
    - Handler: receives args, builds DraftArtifact object with generatedAt
      timestamp and version:1, returns { ok: true, data: artifact }
    - category: DRAFT, sideEffects: false
    Note: This tool does NOT generate content — the LLM generates content
    in its reasoning and passes it as the content arg. The tool just
    structures and emits the artifact.

[x] Task 6: Register draft tool in tool loader
    File: agent/transport/runtime.factory.ts (UPDATE)
    - Added loadDraftTools() and included in bootstrapTools()
    - Also fixed tool.adapter.ts DRAFT→WRITE mapping to DRAFT→DRAFT

[x] Task 7: Handle DRAFT category in tool executor
    File: agent/engine/tool.executor.ts (UPDATE — ~10 lines)
    - DRAFT tools execute immediately (like READ tools, no pending/confirmation)
    - Add logging for DRAFT tools similar to READ logging
    - The finalizeExecution method currently only logs READ; extend to log DRAFT

[x] Task 8: Emit draft_artifact SSE event from agentic loop
    File: agent/engine/agentic.loop.ts (UPDATE — ~15 lines)
    - After tool executor returns for a DRAFT tool, emit draft_artifact via
      StreamEmitter (same pattern as how text_delta is emitted via streamCallbacks)
    - Store the artifact in session.state.currentDraft
    - On regeneration (when currentDraft already exists): increment version

[x] Task 9: Add draft instructions to system prompt
    File: agent/engine/agentic.loop.ts (UPDATE — ~40 lines)
    - Appended DRAFTING section to READ_POLICY_INSTRUCTIONS
    - Includes: when to draft, content rules, language rules, suggestion guidelines
    - When session.currentDraft exists, injects current draft context in
      system prompt for regeneration awareness

[x] Task 10: Update permission gate for DRAFT category
    File: agent/safety/permission.gate.ts (UPDATE — ~5 lines)
    - DRAFT tools allowed in: DRAFT, EXECUTE, AUTONOMOUS modes
    - DRAFT tools NOT allowed in: READ_ONLY mode
    - Added ToolCategory.DRAFT to evaluateDraft() allowed categories
```

### Phase 2C: Frontend — New DraftArtifactCard

```
[x] Task 11: Add DraftArtifact types to frontend
    File: frontend/src/services/api/agent.ts (UPDATE — ~20 lines)
    - Added DraftArtifactData interface matching backend DraftArtifact
    - Added DraftArtifactData to AgentOutput union type
    - Added 'draft_artifact' to known SSE event types

[x] Task 12: Handle draft_artifact SSE event in streaming
    File: frontend/src/services/api/agent.ts (UPDATE — ~15 lines)
    - Added onDraftArtifact callback to StreamCallbacks interface
    - Added draft_artifact case in dispatchEvent switch
    - Calls onDraftArtifact with { ...data.artifact, type: 'draft_v2' }

[x] Task 13: Handle draft_artifact in useAgentState
    File: frontend/src/Agent_front/hooks/useAgentState.ts (UPDATE — ~20 lines)
    - Added onDraftArtifact callback in all 3 stream callback registration sites
    - Sets agentData with type "draft_v2", creates/updates agent message with stage "artifact"

[x] Task 14: Replace DraftArtifact component with new DraftArtifactCard
    File: frontend/src/Agent_front/components/artifacts/DraftArtifact.tsx (REWRITE — ~297 lines)
    - Complete rewrite based on document-draft-card.jsx proposal
    - Supports both DraftArtifactData (v2) and DraftOutput (legacy) via type guards
    - Modes: view | edit | regen, States: pending | exported | discarded
    - Header: verb label + draftType badge + "Reversible" tag + version
    - Title area, meta fields grid, DRAFT watermark, RTL support
    - Action bar: Discard | Edit | Regenerate | Export (disabled for Phase 3)

[x] Task 15: DocumentDraftArtifact — no changes needed
    File: frontend/src/Agent_front/components/artifacts/DocumentDraftArtifact.tsx (UNCHANGED)
    - DocumentDraftArtifact handles a separate pipeline (document_draft type with DocumentDraftOutput)
    - Different data type, different flow (includes proposal confirmation step)
    - Kept as-is for backward compatibility

[x] Task 16: Route draft_v2 type in AgentWorkflow
    File: frontend/src/Agent_front/components/AgentWorkflow.tsx (UPDATE — ~30 lines)
    - Added case for data.type === "draft_v2" → render new DraftArtifact
    - Wired onRegenerate → onSubmitMessage for regeneration
    - Wired onSave → updateSessionMessages for edit persistence
    - Kept existing "draft" and "document_draft" routes for backward compat

[x] Task 17: Implement Regenerate action (frontend → backend round-trip)
    - Regeneration wired via onSubmitMessage in AgentWorkflow routing
    - DraftArtifact.tsx already has the regen input panel + onRegenerate prop
    - Message sent as "Revise the draft: [instructions]"
    - Backend injects session.currentDraft into system prompt context
    - New draft_artifact SSE event replaces card with incremented version

[x] Task 18: Remove legacy DraftCard
    File: frontend/src/Agent_front/cards/DraftCard.tsx — already removed
    - File does not exist in the codebase (confirmed via glob search)
```

### Phase 2D: Testing & Verification

```
[ ] Test 1: Explicit draft request
    "Write a letter to the judge requesting a postponement for dossier D-42"
    Expected: Agent calls READ tools → gathers context → calls generateDraft
    → draft_artifact SSE event → card appears with letter content, correct metadata

[ ] Test 2: Draft with context gathering
    "Summarize the Bouazizi case"
    Expected: Agent searches client → gets entity graph → calls generateDraft
    with draftType: "summary" → card appears with case summary

[ ] Test 3: Ambiguous draft request
    "Draft something for Leila"
    Expected: Agent searches → finds multiple matches → asks which one →
    user selects → agent generates draft

[ ] Test 4: Regeneration
    After Test 1, user clicks Regenerate → types "make it shorter"
    Expected: New draft version appears with shorter content, version: 2

[ ] Test 5: Proactive suggestion
    User: "What's the status of dossier D-42?"
    Expected: Agent responds with status + suggests:
    "Would you like me to draft a status update for the client?"
    User: "Yes"
    Expected: Agent generates the draft

[ ] Test 6: Multi-language
    User (Arabic): "اكتب رسالة للقاضي لتأجيل الجلسة"
    Expected: Draft generated in Arabic with proper legal register

[ ] Test 7: Edit + Regen cycle
    Generate draft → Edit text → Regenerate → "add a paragraph about urgency"
    Expected: New version incorporates edited text + new paragraph

[ ] Test 8: Discard + Restore
    Generate draft → Discard → verify red footer → Restore → verify content returns

[ ] Test 9: Permission gate
    Set mode to READ_ONLY → request a draft
    Expected: Agent cannot call generateDraft, responds explaining mode limitation

[ ] Test 10: Backward compatibility
    Load a session with old "draft" or "document_draft" messages
    Expected: Old messages still render (old component or graceful fallback)
```

---

## File Change Summary

### New Files (2)
| File | Purpose |
|------|---------|
| `agent/tools/draft/generateDraft.tool.ts` | The generateDraft tool definition + handler |
| `agent/tools/draft/index.ts` | Barrel export for draft tools |

### Modified Files (11)
| File | Change |
|------|--------|
| `agent/types.ts` | Add DraftArtifact interface |
| `agent/tools/tool.types.ts` | Add DRAFT to ToolCategory enum |
| `agent/transport/stream.emitter.ts` | Add draft_artifact to StreamEvent |
| `agent/session/session.types.ts` | Add currentDraft to Session |
| `agent/engine/tool.executor.ts` | Handle DRAFT category logging |
| `agent/engine/agentic.loop.ts` | Emit draft_artifact SSE, system prompt additions, currentDraft context |
| `agent/safety/` (permission gate) | Allow DRAFT in DRAFT/EXECUTE/AUTONOMOUS modes |
| `frontend/src/services/api/agent.ts` | Add DraftArtifactData type, onDraftArtifact callback, parse SSE event |
| `frontend/src/Agent_front/hooks/useAgentState.ts` | Handle onDraftArtifact, store in message.data |
| `frontend/src/Agent_front/components/AgentWorkflow.tsx` | Route draft_v2 type to new component |
| `frontend/src/Agent_front/components/artifacts/DocumentDraftArtifact.tsx` | Delegate to new DraftArtifact or merge |

### Rewritten Files (1)
| File | Change |
|------|--------|
| `frontend/src/Agent_front/components/artifacts/DraftArtifact.tsx` | Complete rewrite based on document-draft-card.jsx proposal |

### Deleted Files (1)
| File | Reason |
|------|--------|
| `frontend/src/Agent_front/cards/DraftCard.tsx` | Legacy card, not used in artifact workflow |

---

## Implementation Order (Dependency Graph)

```
Phase 2A (Backend Foundation) — no dependencies, do first
  Task 1 → Task 2 → Task 3 → Task 4
  (each depends on previous)

Phase 2B (Backend Integration) — depends on 2A
  Task 5 depends on: Task 1 (DRAFT category), Task 2 (DraftArtifact type)
  Task 6 depends on: Task 5
  Task 7 depends on: Task 1
  Task 8 depends on: Task 4 (draft_artifact event), Task 5, Task 3 (currentDraft)
  Task 9 depends on: Task 3 (currentDraft for context)
  Task 10 depends on: Task 1

  Recommended order: 5 → 6 → 7 → 10 → 8 → 9

Phase 2C (Frontend) — depends on 2B for SSE contract
  Task 11 depends on: Task 2 (type must match backend)
  Task 12 depends on: Task 4, Task 11
  Task 13 depends on: Task 12
  Task 14 depends on: Task 11 (needs type), independent of backend
  Task 15 depends on: Task 14
  Task 16 depends on: Task 14
  Task 17 depends on: Task 14, Task 13
  Task 18 independent (can do anytime)

  Recommended order: 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

Phase 2D (Testing) — depends on all above
  All tests depend on complete backend + frontend
```

---

## What Comes After DRAFT (Phase 3 Preview)

```
PLAN/EXECUTE phase will add:
  - Plan tools: proposeCreate, proposeUpdate, proposeDelete
  - Plan card UI (similar to draft card but shows proposed DB changes)
  - Confirmation flow (user clicks Confirm → EXECUTE runs)
  - Export draft (save as document, attach to dossier) ← this is where export goes
  - Save draft (persist to session/database for later)

The infrastructure built in DRAFT that transfers to PLAN:
  - SSE artifact event pattern → plan_artifact
  - Card UI component pattern → PlanCard
  - Session state for artifacts → session.pendingAction
  - Regeneration/amendment flow → plan modification flow
```
