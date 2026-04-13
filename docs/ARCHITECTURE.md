# ARCHITECTURE.md — Ordinay Agent Technical Architecture

## 1. System Context

```
┌──────────────────────────────────────────────────────────────────┐
│  ELECTRON APP                                                     │
│                                                                    │
│  ┌──────────────┐     HTTP/SSE      ┌──────────────────────────┐ │
│  │   Frontend    │ ◄──────────────► │   Express Backend        │ │
│  │   (React)     │                   │                          │ │
│  │               │                   │  ┌────────────────────┐  │ │
│  │  Agent UI     │  SSE stream       │  │  Agent Module      │  │ │
│  │  Chat Panel   │ ◄────────────────│  │  (THIS DOCUMENT)   │  │ │
│  │  Artifacts    │                   │  └─────────┬──────────┘  │ │
│  │               │                   │            │              │ │
│  └──────────────┘                   │  ┌─────────▼──────────┐  │ │
│                                      │  │  Services Layer    │  │ │
│                                      │  │  (existing CRUD)   │  │ │
│                                      │  └─────────┬──────────┘  │ │
│                                      │            │              │ │
│                                      │  ┌─────────▼──────────┐  │ │
│                                      │  │  SQLite (local)    │  │ │
│                                      │  └────────────────────┘  │ │
│                                      └──────────────────────────┘ │
│                                                │                   │
│                                      ┌─────────▼──────────┐       │
│                                      │  OpenAI API (cloud) │       │
│                                      └────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Data Model Reference

The agent must understand these entities and their relationships:

```
Client (1) ──► (N) Dossier (1) ───────────────► (N) Lawsuit
                    │                              │
                    ├──► (N) Task-> invoice        ├──► (N) Task -> invoice
                    ├──► (N) Mission-> invoice     ├──► (N) Mission-> invoice
                    ├──► (N) Session-> invoice     ├──► (N) Document
                    ├──► (N) Document              ├──► (N) Session-> invoice
                    └──► (N) Invoice               └──► (N) Invoice


Additional entities:
  - PersonalTask (not linked to dossier — user-level)
  - Bailiff / Huissier
  - Notification
  - AccountingEntry these are the invoices
  - History (audit/activity log)
  - notes for each entity
```

Key relationships:

- A Client has many Dossiers
- A Dossier has many Lawsuits, Tasks, Missions, Sessions, Documents
- A Lawsuit has many Sessions, Tasks, Missions, Documents
- Tasks, Missions, Sessions should link to either Dossier OR Lawsuit (via foreign key)
- Documents can link to Dossier, Lawsuit, Task, Mission, Session, etc

## 3. Agent Pipeline — Detailed

### 3.1 Request Gateway

**Responsibility**: Receive the SSE request, load or create a session, sanitize input.

```typescript
// Input: HTTP request with { message, sessionId?, mode? }
// Output: { session, sanitizedMessage, requestId }

async function gateway(req: AgentRequest): Promise<GatewayResult> {
  const requestId = generateRequestId();
  const message = sanitizeInput(req.body.message);
  const session = req.body.sessionId
    ? sessionStore.get(req.body.sessionId)
    : sessionStore.create(req.userId);

  if (req.body.mode && session.mode !== req.body.mode) {
    session.mode = req.body.mode;
  }

  return { session, message, requestId };
}
```

### 3.1.1 Current v2 Transport Semantics (Authoritative)

The active runtime no longer has a pre-LLM UX gate.

- Valid turns are routed directly to `runtime.loop.run(...)`.
- Transport still attaches `metadata.uxDecision` with a deterministic bypass reason for trace compatibility.
- Transport logs `AGENT_V2_UX_PREFLIGHT_BYPASSED` for each valid streamed turn.
- Only transport/security checks can block before loop execution (invalid payload, auth scope, rate limit, safe-mode disable).

### 3.2 Turn Classifier

**Responsibility**: Determine if this message can be handled without a full LLM call.

Three short-circuit paths:

1. **CONFIRMATION**: Pending action exists + message is affirmative → execute pending
2. **REJECTION**: Pending action exists + message is negative → clear pending, acknowledge
3. **AMENDMENT**: Pending action exists + message modifies the pending action → re-run through LLM with amendment context

Everything else → **FULL_PIPELINE** (the LLM handles all nuance).

```
"yes" + pending action       → CONFIRMATION (no LLM call needed)
"no, cancel" + pending action → REJECTION (no LLM call needed)
"change the date to Friday" + pending → AMENDMENT (LLM call with amendment context)
"show me dossiers"           → FULL_PIPELINE (standard LLM processing)
"what about sessions?"       → FULL_PIPELINE (LLM understands context from history)
"the other client"           → FULL_PIPELINE (LLM resolves from conversation)
```

The key insight: we only short-circuit the obvious cases. The LLM naturally handles follow-ups, topic shifts, corrections, and context references through its conversation history. We do NOT need separate classifiers for those.

### 3.3 Agentic Loop

**Responsibility**: The core reasoning engine. Sends messages to LLM, processes tool calls, loops until done.

```
┌─────────────────────────────────────────────────────┐
│                  AGENTIC LOOP                        │
│                                                      │
│  messages = buildMessages(session, userMessage)      │
│  tools = getPermittedToolSchemas(session)            │
│                                                      │
│  loop (max 15 iterations):                           │
│    │                                                 │
│    ├─ response = await llm.chat(messages, tools)     │
│    │                                                 │
│    ├─ if response has text:                          │
│    │    stream text to user via SSE                  │
│    │                                                 │
│    ├─ if response has tool_calls:                    │
│    │    for each tool_call:                          │
│    │      result = toolExecutor.execute(tool_call)   │
│    │      append tool_call + result to messages      │
│    │      stream status event via SSE                │
│    │      update session.activeEntities              │
│    │                                                 │
│    ├─ if response has NO tool_calls:                 │
│    │    break (LLM is done)                          │
│    │                                                 │
│    └─ continue loop                                  │
│                                                      │
│  updateSession(session, messages)                    │
│  auditLog.write(session, messages)                   │
└─────────────────────────────────────────────────────┘
```

### 3.4 Tool Executor

**Responsibility**: Execute a single tool call safely.

```
Tool call from LLM: { name: "getClient", arguments: { clientId: 42 } }
     │
     ├─ 1. VALIDATE: Does tool exist in registry?
     │     → No: return error to LLM ("tool not found")
     │
     ├─ 2. PERMISSION CHECK: Is tool allowed for current mode + role?
     │     → No: return error to LLM ("insufficient permissions")
     │
     ├─ 3. INPUT VALIDATION: Do arguments match inputSchema?
     │     → No: return error to LLM ("invalid parameter: clientId must be integer")
     │
     ├─ 4. SESSION CACHE CHECK: Is this data already in activeEntities?
     │     → Yes (and fresh): return cached data, skip execution
     │
     ├─ 5. WRITE GATE: Is this a write/action tool?
     │     → Yes: Do NOT execute. Create PendingAction. Return to LLM:
     │       "Operation prepared. User must confirm before execution."
     │
     ├─ 6. EXECUTE: Call tool.handler(arguments)
     │     → Catch errors, return structured error to LLM
     │
     ├─ 7. OUTPUT VALIDATION: Does result match outputSchema?
     │     → No: log warning, attempt to use result anyway
     │
     ├─ 8. CACHE UPDATE: Store result in session.activeEntities
     │
     └─ 9. AUDIT LOG: Record tool call, params, result summary, duration
```

### 3.5 Response Handler

**Responsibility**: Stream the LLM's final response, update session, persist.

- Stream text chunks via SSE as they arrive
- After streaming completes:
  - Append the turn to session.turns
  - Summarize old turns if history exceeds token budget
  - Persist session state
  - Write final audit log entry

## 4. Session State Management

### 4.1 Session Lifecycle

```
CREATE: First message from user (or explicit session start)
   │
   ├── Session lives in memory (Map<sessionId, Session>)
   ├── Turns accumulate in session.turns[]
   ├── Entities accumulate in session.activeEntities
   │
   ├── On each turn:
   │   ├── Tool results → update activeEntities
   │   ├── If turns.length > MAX_TURNS → summarize oldest
   │   └── Update lastActivityAt
   │
   ├── On idle timeout (configurable, e.g., 30 min):
   │   └── Persist to SQLite, remove from memory
   │
   └── On explicit session end:
       └── Persist to SQLite, remove from memory
```

### 4.2 Entity Tracking

When a tool returns entity data, it's cached in the session:

```typescript
// After tool execution:
if (toolResult.ok && toolMeta.category === "READ") {
  const entities = extractEntities(toolMeta.name, toolResult.data);
  for (const entity of entities) {
    session.activeEntities.set(`${entity.type}:${entity.id}`, {
      type: entity.type,
      id: entity.id,
      data: entity.data,
      fetchedAtTurn: session.turnCount,
      toolSource: toolMeta.name,
    });
  }
}
```

Entity extraction rules (by tool):

- `getClient` → caches 1 client entity
- `listDossiers` → caches N dossier entities
- `getEntityGraph` → caches root + all children entities
- `getLawsuit` → caches lawsuit + linked entities

### 4.3 Conversation Summarization

When conversation exceeds the token budget for recent turns:

```typescript
async function summarizeOldTurns(session: Session): Promise<void> {
  const turnsToSummarize = session.turns.splice(0, SUMMARIZE_BATCH);

  const summaryPrompt = `Summarize this conversation segment concisely.
PRESERVE EXACTLY: entity names, IDs, dates, amounts, decisions made.
COMPRESS: explanations, reasoning, verbose tool outputs.`;

  const summary = await llm.chat([
    { role: "system", content: summaryPrompt },
    { role: "user", content: formatTurnsForSummary(turnsToSummarize) },
  ]);

  session.summary = session.summary
    ? session.summary + "\n" + summary
    : summary;
}
```

### 4.4 How Context Flows to the LLM

On each turn, the message array sent to the LLM is:

```typescript
function buildMessages(session: Session, userMessage: string): Message[] {
  return [
    // 1. System prompt with dynamic context
    {
      role: "system",
      content: buildSystemPrompt(session),
    },

    // 2. Summary of older conversation (if exists)
    ...(session.summary
      ? [
          {
            role: "system",
            content: `Previous conversation summary:\n${session.summary}`,
          },
        ]
      : []),

    // 3. Recent full turns (messages + tool calls + results)
    ...session.turns.flatMap((turn) => turn.messages),

    // 4. Current user message
    {
      role: "user",
      content: userMessage,
    },
  ];
}
```

## 5. Tool System

### 5.1 Tool Categories and Permissions

```
┌──────────────┬────────────┬─────────────────────────────────────────┐
│ Category     │ Risk Level │ Behavior                                │
├──────────────┼────────────┼─────────────────────────────────────────┤
│ READ         │ Low        │ Execute immediately, cache results      │
│ DRAFT        │ Medium     │ Execute, present output as draft        │
│ PLAN/WRITE   │ High       │ Create PendingAction, await confirmation│
│ EXECUTE      │ High       │ Only runs to fulfill confirmed pending  │
│ RESEARCH     │ Medium     │ Execute, validate sources               │
│ SYSTEM       │ Low        │ Execute immediately (formatting, etc.)  │
└──────────────┴────────────┴─────────────────────────────────────────┘
```

### 5.2 Tool Schema Enrichment

Existing tool descriptions are terse. The adapter enriches them:

```typescript
const DESCRIPTION_ENRICHMENTS: Record<string, string> = {
  getClient:
    "Retrieve a single client record by their numeric ID. Returns full client details including name, phone, email, address, status, notes, and creation date. Use when you need details about a specific known client.",

  listDossiers:
    "List and search dossiers (case files). Supports filtering by client ID, status, and text search on reference/title. Returns dossier records sorted by most recently updated. Use to find dossiers or see all dossiers for a client.",

  getEntityGraph:
    "Get a comprehensive graph of an entity and all its related records (parent entities, child entities like lawsuits, tasks, sessions, documents). Use when you need a complete picture of an entity and everything connected to it.",

  // ... enrichments for all ~40 tools
};
```

### 5.3 Adapting Existing Tools

```typescript
// tool.adapter.ts
import type { ExistingTool, AgentTool, OpenAIToolSchema } from "./tool.types";

export function adaptTool(existing: ExistingTool): AgentTool {
  return {
    name: existing.name,
    category: existing.category,
    description: DESCRIPTION_ENRICHMENTS[existing.name] || existing.description,
    inputSchema: existing.inputSchema,
    outputSchema: existing.outputSchema,
    handler: existing.handler,
    sideEffects: existing.sideEffects ?? false,
  };
}

export function toOpenAISchema(tool: AgentTool): OpenAIToolSchema {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}
```

## 6. Write Operation Protocol

### 6.1 The Proposal Pattern

```
LLM decides to call a WRITE tool
       │
       ▼
Tool Executor intercepts (category !== READ)
       │
       ▼
Creates PendingAction {
  type: 'create' | 'update' | 'delete',
  entityType: 'task',
  description: 'Create task: "File brief" due March 14, 2026',
  toolName: 'createTask',
  params: { title: "File brief", dueDate: "2026-03-14", ... },
  proposedAtTurn: 7
}
       │
       ▼
Returns to LLM: tool result = {
  status: "pending_confirmation",
  message: "Task creation prepared. Present details to user and ask for confirmation."
}
       │
       ▼
LLM generates user-facing message describing the proposal
       │
       ▼
User responds "yes" → Turn classifier: CONFIRMATION → Execute pending
User responds "no"  → Turn classifier: REJECTION → Clear pending
User responds "change the date" → Turn classifier: AMENDMENT → LLM adjusts params
```

### 6.2 Amendment Flow

When the user amends a pending action:

```typescript
// AMENDMENT detected by turn classifier
// The amendment message + pending action go through the LLM

const amendmentMessages = [
  ...buildMessages(session, amendmentMessage),
  {
    role: "system",
    content: `There is a pending action awaiting confirmation:
${JSON.stringify(session.pending, null, 2)}

The user wants to modify this action. Adjust the parameters based on their request, then call the same tool with updated parameters.`,
  },
];

// LLM will call the tool again with modified params
// Tool executor creates a new PendingAction replacing the old one
```

## 7. Streaming Protocol (SSE Events)

```typescript
// Event types sent over SSE
type SSEEvent =
  | { type: "text_delta"; content: string } // Streaming text chunk
  | { type: "tool_start"; tool: string; params: any } // Tool execution starting
  | { type: "tool_result"; tool: string; summary: string } // Tool completed
  | { type: "tool_error"; tool: string; error: string } // Tool failed
  | { type: "pending"; action: PendingAction } // Write awaiting confirmation
  | { type: "confirmed"; action: string } // Write executed
  | { type: "error"; message: string } // Agent-level error
  | { type: "done"; turnId: string }; // Turn complete
```

## 8. Safety & Governance

### 8.1 Permission Matrix

```typescript
const PERMISSIONS: Record<AgentMode, Set<ToolCategory>> = {
  read_only: new Set(["READ", "RESEARCH"]),
  drafting: new Set(["READ", "RESEARCH", "DRAFT", "SYSTEM"]),
  guided: new Set(["READ", "RESEARCH", "DRAFT", "SYSTEM", "PLAN", "EXECUTE"]),
  autonomous: new Set([
    "READ",
    "RESEARCH",
    "DRAFT",
    "SYSTEM",
    "PLAN",
    "EXECUTE",
  ]),
};
```

### 8.2 Agentic Loop Safety

- Maximum 15 iterations per turn (prevents infinite loops)
- Maximum 5 tool calls per iteration
- Maximum 30 total tool calls per turn
- If limits reached → force LLM to respond with text explaining what was accomplished and what remains

### 8.3 Hallucination Prevention

1. Tool names are validated against the registry — hallucinated tool names fail immediately
2. Parameters are validated against JSON Schema — fabricated IDs are caught
3. Tool results are the single source of truth — the LLM is instructed to base claims on tool outputs
4. The system prompt explicitly states: "Never invent data. If a tool returns no results, say so. If you don't have information, say so."

## 9. Audit Trail

Every event in the pipeline is logged:

```
session_id | turn | event_type     | data
───────────┼──────┼────────────────┼──────────────────────
sess-001   │  1   │ user_message   │ "Show me Bouazizi's dossiers"
sess-001   │  1   │ tool_call      │ { tool: "listDossiers", params: {...} }
sess-001   │  1   │ tool_result    │ { tool: "listDossiers", count: 3, ms: 12 }
sess-001   │  1   │ agent_response │ "Bouazizi has 3 dossiers: ..."
sess-001   │  2   │ user_message   │ "the commercial one"
sess-001   │  2   │ tool_call      │ { tool: "getEntityGraph", params: {...} }
...
```

Data is stored in SQLite. Full tool outputs are stored for recent entries, then compressed to summaries after 24 hours.

### 9.1 Operator Diagnostics for Preflight Bypass

Use the following log/event behavior as the source of truth for debugging pre-loop behavior:

- `AGENT_V2_STREAM_TURN_START`: request reached transport and passed parsing/sanitization.
- `AGENT_V2_UX_PREFLIGHT_BYPASSED`: transport attached bypass metadata and handed off to loop.
  - `action` should be `proceed`.
  - `reason` should describe direct routing to the agentic loop.
- Absence of `AGENT_V2_UX_PREFLIGHT_BYPASSED` with an SSE `error` event indicates a transport/security gate blocked execution before loop.
- Ambiguity handling is loop/tool-driven:
  - Draft ambiguity guards are enforced inside `agentic.loop.ts`.
  - SSE `disambiguation` events are derived from loop/tool outputs and candidate pools, not a transport preflight response.

## 10. Error Recovery

```
Error in tool execution:
  → Return structured error to LLM
  → LLM can: retry with different params, try alternative tool, or inform user

Error in LLM call (API timeout, rate limit):
  → Retry with exponential backoff (max 3 retries)
  → On persistent failure: inform user, preserve session state

Error in session state:
  → Session state is rebuilt from persisted conversation history
  → Active entities are re-fetched on next relevant tool call

Partial completion of multi-tool sequence:
  → READ tools: completed results are cached, failed ones are noted
  → WRITE tools: nothing executed until confirmation, so no partial state
  → LLM is informed of partial results and can adapt its response
```
