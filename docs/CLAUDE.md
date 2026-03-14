# CLAUDE.md — Ordinay AI Agent Implementation Guide
_Migration Status: Phase 16 ✅ Completed | Phase 17 (Operational Controls) 🔄 In Progress_

## Project Overview

Ordinay is a legal practice management desktop application (Electron) with an embedded AI agent. We are **rebuilding the agent's core engine** while keeping the working pieces:

- ✅ KEEP: Database schema + CRUD services (`services/`)
- ✅ KEEP: SSE transport (`routes/agent.stream.routes.js`)
- ✅ KEEP: Frontend (`frontend/`)
- ✅ KEEP: Tool implementations (~40 tools in `tools/`) — adapt their interface
- 🔄 REBUILD: Agent engine (`agent_Back/`) → new module at `agent/`

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express |
| Desktop | Electron |
| Database | SQLite via better-sqlite3 (raw SQL) |
| LLM | OpenAI GPT API (primary), provider-agnostic abstraction for future Claude/Gemini |
| Transport | SSE (Server-Sent Events) — already working |
| Languages | French + Arabic + English (trilingual) |

---

## Critical Rules (READ BEFORE WRITING ANY CODE)

### Rule 1: No File Over 300 Lines
Previous codebase had 2000+ line files. Every file MUST stay under 300 lines. Decompose aggressively.

### Rule 2: No Hardcoded Keywords for Tool Selection
Tool selection uses OpenAI's native function-calling. The LLM sees tool schemas and decides. We do NOT build keyword matchers, intent routers, or regex-based classifiers. We ADD validation, permissions, and caching on top of the LLM's decisions.

### Rule 3: Session State Drives Context
Every request is processed within a conversational session. Entities resolved on turn 1 persist through turn N. The agent does NOT re-fetch data it already has. The session state — not the latest message alone — drives tool selection.

### Rule 4: Write Operations Always Require Confirmation
Any tool that creates, updates, or deletes data produces a PROPOSAL. Execution only happens after explicit user confirmation. The response includes what will change, and the pending action is stored in session state.

### Rule 5: TypeScript Strict Mode
All new code is TypeScript with `strict: true`. Existing JS tool files are wrapped with TS adapters.

### Rule 6: Every Tool Call Is Validated and Logged
Before execution: validate parameters against schema. After execution: validate output shape. Always: write to audit log with timing, inputs (sanitized), outputs (summarized), and status.

---

## Architecture Overview

```
User Message (via SSE)
       │
       ▼
┌──────────────────────┐
│  L1: Gateway         │  Load/create session, sanitize input, resolve mode
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  L2: Turn Classifier │  Is this NEW_REQUEST | FOLLOW_UP | CONFIRMATION |
│                      │  AMENDMENT | CORRECTION | TOPIC_SHIFT ?
│                      │  Short-circuit confirmations and amendments.
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  L3: Agentic Loop    │  Build messages → Send to LLM with tool schemas →
│                      │  LLM responds with text and/or tool_calls →
│                      │  Execute tools → Feed results back → Loop until
│                      │  LLM produces final text response.
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  L4: Tool Executor   │  Validate params → Check permissions → Execute →
│                      │  Validate output → Cache in session state
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  L5: Response Stream │  Stream text via SSE → Create pending actions
│                      │  for writes → Update session → Audit log
└──────────────────────┘
```

### The Agentic Loop — Core Design

```
1. Build messages array:
   [system_prompt, ...history, current_message]
2. Call LLM with messages + tool schemas
3. LLM responds:
   a) Text only → stream to user, DONE
   b) tool_calls → execute each, append results to messages, GOTO 2
   c) Text + tool_calls → execute tools, GOTO 2
4. Safety: max 15 iterations, then force text response
```

The LLM chains tools naturally: calls getClient → uses client_id from result → calls listDossiers → uses dossier data → calls getLawsuit → etc. This replaces the previous keyword-based intent router entirely.

---

## Implementation Phases

### Phase 1: Foundation
Create the type system, configuration, LLM abstraction, and session store.

```
agent/
├── types.ts                    # Core type definitions
├── config.ts                   # Constants, limits, defaults
├── errors.ts                   # Typed error classes
├── llm/
│   ├── llm.types.ts            # Provider-agnostic LLM types
│   ├── llm.provider.ts         # Abstract provider interface
│   └── openai.provider.ts      # OpenAI implementation
├── session/
│   ├── session.types.ts        # Session state types
│   └── session.store.ts        # In-memory session management
└── tools/
    ├── tool.types.ts           # Tool interface types
    ├── tool.registry.ts        # Registry: load, index, convert to LLM schema
    └── tool.adapter.ts         # Adapt existing JS tools to new interface
```

### Phase 2: Core Engine
Build the agentic loop, turn classifier, and tool executor.

```
agent/engine/
├── agent.engine.ts             # Main entry: orchestrates the full pipeline
├── turn.classifier.ts          # Classify turn type from session context
├── message.builder.ts          # Assemble messages array for LLM
├── tool.executor.ts            # Execute tool calls with validation
├── pending.manager.ts          # Manage pending write operations
└── stream.emitter.ts           # Emit SSE events during execution
```

### Phase 3: Session & Context
Implement entity tracking, conversation summarization, and persistence.

```
agent/session/
├── entity.tracker.ts           # Track active entities across turns
├── context.assembler.ts        # Build dynamic system prompt context
├── summary.service.ts          # Summarize old turns to save tokens
└── history.store.ts            # Persist conversations to SQLite
```

### Phase 4: Safety & Audit
Permission checking, output validation, and audit logging.

```
agent/safety/
├── permission.gate.ts          # Role × mode × tool category permissions
├── input.validator.ts          # JSON Schema validation on tool params
├── output.validator.ts         # Verify tool outputs, detect anomalies
└── audit.logger.ts             # Append-only audit log to SQLite
```

### Phase 5: Integration
Wire new engine to existing SSE transport, adapt existing tools.

```
agent/transport/
└── sse.handler.ts              # Connect new engine to existing SSE route

agent/tools/adapters/
├── read.adapter.ts             # Adapt read tools
├── write.adapter.ts            # Adapt write tools (add confirmation gate)
├── action.adapter.ts           # Adapt action tools
└── index.ts                    # Auto-discover and load all tool files
```

### Phase 6: Document Generation (later)
```
agent/documents/
├── template.registry.ts
├── template.filler.ts
├── document.generator.ts
└── docx.renderer.ts            # Uses docx-js library
```

---

## Key Implementation Details

### System Prompt Structure

```typescript
function buildSystemPrompt(session: Session): string {
  return [
    AGENT_IDENTITY,          // Who you are, behavioral rules
    LANGUAGE_INSTRUCTIONS,   // Respond in user's language, trilingual support
    DATABASE_SCHEMA_REF,     // Condensed schema: entity types, key fields, relationships
    TOOL_USAGE_RULES,        // When to use tools, confirmation requirements
    ACTIVE_CONTEXT,          // Dynamic: current entities, pending actions, focus
    MODE_INSTRUCTIONS,       // Current mode constraints
  ].join('\n\n');
}
```

The system prompt is ~1500-2000 tokens. It is NOT a massive document — it's focused and dynamic.

### Tool Schema Conversion

Existing tools export:
```javascript
module.exports = {
  name: 'getClient',
  category: 'READ',
  description: 'Retrieve a single client by ID',
  inputSchema: { type: 'object', properties: {...}, required: [...] },
  handler: async (params) => result
}
```

We convert to OpenAI format:
```json
{
  "type": "function",
  "function": {
    "name": "getClient",
    "description": "Retrieve a single client by ID. Returns the full client record including name, contact info, and status.",
    "parameters": { "type": "object", "properties": {...}, "required": [...] }
  }
}
```

The adapter enriches descriptions to help the LLM make better decisions. Terse descriptions like "Retrieve a single client by ID" become "Retrieve a single client record by their numeric ID. Returns full client details including name, phone, email, address, status, and creation date. Use when you have a specific client ID and need their details."

### Session State

```typescript
interface Session {
  id: string;
  userId: string;
  mode: 'read_only' | 'drafting' | 'guided' | 'autonomous';
  
  activeEntities: Map<string, CachedEntity>;
  pending: PendingAction | null;
  
  turns: Turn[];        // Recent full turns (last N)
  summary: string;      // Compressed older turns
  turnCount: number;
  
  createdAt: number;
  lastActivityAt: number;
}

interface CachedEntity {
  type: string;         // 'client', 'dossier', 'lawsuit', etc.
  id: number;
  data: Record<string, unknown>;
  fetchedAtTurn: number;
  toolSource: string;   // Which tool fetched this
}

interface PendingAction {
  type: 'create' | 'update' | 'delete';
  entityType: string;
  description: string;  // Human-readable description of what will happen
  toolName: string;
  params: Record<string, unknown>;
  proposedAtTurn: number;
}
```

### Turn Classification

The turn classifier is a lightweight function (NOT an LLM call) that examines the message + session state:

```typescript
function classifyTurn(message: string, session: Session): TurnType {
  // CONFIRMATION: short affirmative + pending action exists
  if (session.pending && isAffirmative(message)) return 'CONFIRMATION';
  
  // REJECTION: short negative + pending action exists
  if (session.pending && isNegative(message)) return 'REJECTION';
  
  // AMENDMENT: modification language + pending action exists
  if (session.pending && isAmendment(message)) return 'AMENDMENT';
  
  // Everything else goes through the full LLM pipeline
  // The LLM itself handles FOLLOW_UP vs NEW_REQUEST vs TOPIC_SHIFT
  // naturally through conversation context
  return 'FULL_PIPELINE';
}
```

Note: We only short-circuit for CONFIRMATION/REJECTION/AMENDMENT (where we can act without calling the LLM). All other classification happens implicitly — the LLM, with full conversation context, naturally handles follow-ups, topic shifts, and references.

### Confirmation/Amendment Detection

```typescript
// These are NOT hardcoded keywords — they're linguistic pattern sets
// covering French, Arabic, and English affirmatives/negatives
const AFFIRMATIVE_PATTERNS = [
  /^(yes|yep|yeah|ok|okay|sure|go ahead|confirm|do it|proceed|save|approve)$/i,
  /^(oui|d'accord|vas-y|confirme|enregistre|valide|c'est bon|parfait)$/i,
  /^(نعم|أي|ايه|موافق|سجل|نفذ|ماشي|يزي|صحيح|بالحق)$/i,
];

// These short-circuit ONLY when there's a pending action.
// If no pending action, "yes" goes through the full LLM pipeline.
```

### Write Operation Flow

```
User: "Create a task to file the brief by Friday"
  │
  ├─ LLM calls: createTask({ title: "File brief", dueDate: "2026-03-14" })
  │
  ├─ Tool Executor detects: category = WRITE
  │   → Does NOT execute the tool
  │   → Creates a PendingAction in session state
  │   → Returns to LLM: "Task creation prepared. Awaiting user confirmation."
  │
  ├─ LLM generates response:
  │   "I've prepared a new task:
  │    • Title: File brief
  │    • Due: Friday, March 14
  │    • Status: Pending
  │    Would you like me to create it?"
  │
  └─ User: "Yes"
      │
      ├─ Turn classifier: CONFIRMATION (pending exists + affirmative)
      ├─ Execute pending action (actually call createTask)
      └─ Response: "Task created successfully. ✓"
```

### Token Budget Management

```typescript
const TOKEN_BUDGET = {
  systemPrompt: 2000,      // Fixed persona + rules + schema ref
  dynamicContext: 500,      // Active entities, pending actions
  historySummary: 500,      // Compressed old conversation
  recentTurns: 6000,       // Last 5-8 full turns with tool results
  toolSchemas: 3000,       // ~40 tool definitions
  currentMessage: 500,      // User's current message
  responseReserve: 4000,   // Space for LLM response
  // Total: ~16500 tokens — well within 128K, leaves huge margin
};
```

We're aggressive about summarizing tool results in history. A tool that returns 50 dossiers gets summarized to "Listed 50 dossiers for client C-1234. Top 5: D-42 (active), D-43 (active), ..." when stored in turn history.

### Error Handling

```typescript
class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean,
    public userMessage: string,   // Safe to show to user (in their language)
    public details?: unknown       // For audit log only
  ) { super(message); }
}

// Tool execution NEVER throws — always returns a result
type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; code: string; recoverable: boolean }
```

### Audit Log Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,       -- 'user_message' | 'tool_call' | 'tool_result' | 'agent_response' | 'confirmation' | 'error'
  event_data TEXT NOT NULL,       -- JSON blob
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms INTEGER,
  INDEX idx_session (session_id),
  INDEX idx_timestamp (timestamp)
);
```

---

## Migration Strategy

1. New agent module lives at `backend/src/agent/` (alongside existing `agent_Back/`)
2. New SSE handler at `agent/transport/sse.handler.ts` exposes a new endpoint (e.g., `/api/agent/v2/stream`)
3. Frontend gets a feature flag to switch between old and new agent endpoints
4. Once new agent is stable, remove `agent_Back/` and update the endpoint
5. Tools are adapted with wrappers — original JS files untouched until deliberate migration

## Testing Approach

- **Unit tests**: Turn classifier, input validator, session state operations, message builder
- **Integration tests**: Full agentic loop with mocked OpenAI responses
- **Conversation tests**: Multi-turn scenario scripts that verify context carries correctly
- Test runner: vitest

## Commands

```bash
# Install new dependencies
npm install openai zod
npm install -D vitest @types/better-sqlite3

# Run tests
npx vitest run

# Run single test
npx vitest run agent/engine/turn.classifier.test.ts
```

