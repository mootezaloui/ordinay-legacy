# STRUCTURE.md — Agent Module File Structure
_Migration Status: Phase 16 ✅ Completed | Phase 17 (Operational Controls) 🔄 In Progress_

## Location

The new agent lives at `lawyer-app/backend/src/agent/` alongside (not replacing) the existing `agent_Back/`.

Once stable, `agent_Back/` is removed and the SSE route points to the new module.

## Directory Tree

```
backend/src/agent/
│
├── index.ts                          # Public API: createAgentHandler()
├── types.ts                          # Shared type definitions (≤200 lines)
├── config.ts                         # Constants, limits, defaults
├── errors.ts                         # AgentError class + error codes
│
├── llm/                              # LLM Provider Abstraction
│   ├── llm.types.ts                  # Provider-agnostic types (Message, ToolCall, etc.)
│   ├── llm.provider.ts               # Abstract interface: ILLMProvider
│   ├── openai.provider.ts            # OpenAI GPT implementation
│   └── index.ts                      # Export active provider
│
├── engine/                           # Core Agent Engine
│   ├── agent.engine.ts               # Main entry: processMessage()
│   ├── agentic.loop.ts               # The LLM ↔ tool execution loop
│   ├── turn.classifier.ts            # Classify: CONFIRMATION | AMENDMENT | FULL_PIPELINE
│   ├── message.builder.ts            # Assemble messages array for LLM
│   ├── tool.executor.ts              # Execute single tool call with all checks
│   ├── pending.manager.ts            # Manage pending write operations
│   └── stream.emitter.ts             # SSE event emission helpers
│
├── session/                          # Session & Context Management
│   ├── session.types.ts              # Session, Turn, CachedEntity, PendingAction types
│   ├── session.store.ts              # In-memory session store (Map-based)
│   ├── entity.tracker.ts             # Extract + cache entities from tool results
│   ├── context.assembler.ts          # Build dynamic system prompt context
│   ├── summary.service.ts            # Summarize old turns to save tokens
│   └── history.store.ts              # Persist/load conversations from SQLite
│
├── tools/                            # Tool System
│   ├── tool.types.ts                 # Tool interface definitions
│   ├── tool.registry.ts              # Load, index, and serve tool schemas
│   ├── tool.adapter.ts               # Adapt existing JS tools to new interface
│   ├── tool.enrichments.ts           # Enhanced descriptions for each tool
│   ├── tool.validator.ts             # JSON Schema validation for inputs/outputs
│   └── tool.loader.ts               # Auto-discover tool files from directories
│
├── prompts/                          # System Prompt Construction
│   ├── system.prompt.ts              # Master system prompt builder
│   ├── identity.prompt.ts            # Agent identity + behavioral rules
│   ├── schema.prompt.ts              # Database schema reference (condensed)
│   ├── tools.prompt.ts               # Tool usage guidelines
│   └── mode.prompt.ts                # Mode-specific instructions
│
├── safety/                           # Safety & Governance
│   ├── permission.gate.ts            # Mode × role → allowed tool categories
│   ├── input.validator.ts            # Validate tool call params against schema
│   ├── output.validator.ts           # Verify tool outputs, detect anomalies
│   ├── loop.guard.ts                 # Iteration limits, infinite loop detection
│   └── audit.logger.ts              # Write events to audit log (SQLite)
│
├── transport/                        # SSE Integration
│   └── sse.handler.ts                # Express route handler wiring
│
├── documents/                        # Document Generation (Phase 6)
│   ├── template.registry.ts          # Template catalog
│   ├── template.filler.ts            # Inject data into templates
│   ├── document.generator.ts         # Orchestrate document creation
│   └── docx.renderer.ts             # DOCX file generation (docx-js)
│
└── __tests__/                        # Tests
    ├── turn.classifier.test.ts
    ├── tool.executor.test.ts
    ├── session.store.test.ts
    ├── message.builder.test.ts
    ├── pending.manager.test.ts
    ├── agentic.loop.test.ts          # Integration test with mocked LLM
    └── scenarios/                    # Multi-turn conversation test scripts
        ├── simple.query.test.ts
        ├── document.draft.test.ts
        ├── write.confirmation.test.ts
        └── context.carryover.test.ts
```

## File Responsibilities — Detailed

### Root Files

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `index.ts` | Single public export: `createAgentHandler(deps)` → Express middleware | 30 |
| `types.ts` | Core types used across all modules: `AgentMode`, `ToolCategory`, etc. | 120 |
| `config.ts` | `MAX_LOOP_ITERATIONS`, `MAX_TOOLS_PER_TURN`, `SESSION_TTL`, `TOKEN_BUDGETS` | 60 |
| `errors.ts` | `AgentError` class, error code enum, helper constructors | 80 |

### `llm/` — LLM Provider

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `llm.types.ts` | `Message`, `ToolCall`, `LLMResponse`, `ChatOptions` — provider-agnostic | 80 |
| `llm.provider.ts` | `ILLMProvider` interface: `chat(messages, tools, options) → AsyncIterable<LLMChunk>` | 40 |
| `openai.provider.ts` | OpenAI implementation using `openai` npm package. Handles streaming, tool_calls parsing, error mapping. | 200 |

To add Claude later: create `claude.provider.ts` implementing `ILLMProvider`. No other code changes.

### `engine/` — Core Engine

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `agent.engine.ts` | Top-level `processMessage(session, message, emitter)`. Calls turn classifier → agentic loop → session update. | 120 |
| `agentic.loop.ts` | The loop: send to LLM → process tool_calls → feed back → repeat. Handles streaming chunks. | 200 |
| `turn.classifier.ts` | `classifyTurn(message, session) → TurnType`. Pattern matching for confirmations/rejections/amendments. | 100 |
| `message.builder.ts` | `buildMessages(session, message) → Message[]`. Assembles system prompt + history + context. | 150 |
| `tool.executor.ts` | `executeTool(toolCall, session, registry) → ToolResult`. Full validation pipeline. | 180 |
| `pending.manager.ts` | `createPending()`, `executePending()`, `clearPending()`, `amendPending()` | 100 |
| `stream.emitter.ts` | `SSEEmitter` class wrapping Express response. Methods: `emitText()`, `emitToolStart()`, `emitDone()`, etc. | 80 |

### `session/` — Session Management

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `session.types.ts` | `Session`, `Turn`, `CachedEntity`, `PendingAction`, `TurnType` | 100 |
| `session.store.ts` | In-memory `Map<string, Session>` with TTL cleanup. `get()`, `create()`, `update()`, `cleanup()` | 120 |
| `entity.tracker.ts` | `extractAndCacheEntities(toolName, toolResult, session)` — knows which tools produce which entity types | 150 |
| `context.assembler.ts` | `assembleContext(session) → string` — formats active entities + pending actions for system prompt | 120 |
| `summary.service.ts` | `summarizeTurns(turns) → string` — calls LLM to compress old turns. Preserves IDs, dates, decisions. | 100 |
| `history.store.ts` | SQLite persistence: `saveSession()`, `loadSession()`, `listSessions()` | 120 |

### `tools/` — Tool System

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `tool.types.ts` | `AgentTool`, `ToolResult`, `OpenAIToolSchema`, `ToolMetadata` | 60 |
| `tool.registry.ts` | `ToolRegistry` class: `register()`, `get()`, `getAll()`, `getSchemas(mode)` | 120 |
| `tool.adapter.ts` | `adaptTool(existingJSTool) → AgentTool` — wraps existing tools | 60 |
| `tool.enrichments.ts` | `ENRICHED_DESCRIPTIONS: Record<string, string>` — better descriptions for each tool | 200 |
| `tool.validator.ts` | `validateInput(schema, data)`, `validateOutput(schema, data)` — uses Zod or ajv | 80 |
| `tool.loader.ts` | `loadToolsFromDirectory(path) → AgentTool[]` — auto-discover and adapt | 80 |

### `prompts/` — System Prompt

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `system.prompt.ts` | `buildSystemPrompt(session) → string` — assembles all prompt parts | 60 |
| `identity.prompt.ts` | Agent identity, persona, language rules, behavioral constraints | 100 |
| `schema.prompt.ts` | Condensed database schema reference for the LLM | 100 |
| `tools.prompt.ts` | Instructions on tool usage: when to search, when to confirm, etc. | 80 |
| `mode.prompt.ts` | Per-mode instructions (read_only restrictions, drafting rules, etc.) | 80 |

### `safety/` — Safety & Governance

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `permission.gate.ts` | `isToolPermitted(toolCategory, mode, userRole) → boolean` | 60 |
| `input.validator.ts` | JSON Schema validation using ajv | 80 |
| `output.validator.ts` | Post-execution output checks | 60 |
| `loop.guard.ts` | Iteration counter, tool call counter, budget enforcement | 60 |
| `audit.logger.ts` | `AuditLogger` class: `logEvent(sessionId, turn, type, data)` → SQLite | 100 |

### `transport/` — SSE Integration

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `sse.handler.ts` | Express route handler: receives request, calls agent engine, pipes SSE events | 100 |

## Dependency Graph

```
transport/sse.handler
    └── engine/agent.engine
            ├── engine/turn.classifier
            │       └── session/session.types
            ├── engine/agentic.loop
            │       ├── llm/openai.provider
            │       ├── engine/tool.executor
            │       │       ├── tools/tool.registry
            │       │       ├── tools/tool.validator (safety/input.validator)
            │       │       ├── safety/permission.gate
            │       │       ├── session/entity.tracker
            │       │       └── engine/pending.manager
            │       ├── engine/message.builder
            │       │       ├── prompts/system.prompt
            │       │       ├── session/context.assembler
            │       │       └── session/summary.service
            │       ├── engine/stream.emitter
            │       └── safety/loop.guard
            ├── session/session.store
            └── safety/audit.logger
```

## Integration with Existing Code

### Existing code that stays UNTOUCHED:

```
backend/src/
├── services/           # All CRUD services — tools call these
├── db/                 # Database connection, schema, migrations
├── controllers/        # Non-agent routes
├── routes/             # Non-agent routes  
├── middlewares/        # Auth, etc.
├── config/             # App config
└── domain/             # Domain models
```

### Existing code that gets a THIN ADAPTER:

```
backend/src/
├── agent_Back/tools/read/       # ~15 read tools → loaded by tool.loader.ts
├── agent_Back/tools/draft/      # ~5 draft tools → loaded by tool.loader.ts
├── agent_Back/tools/plan/       # ~5 plan tools → loaded by tool.loader.ts
├── agent_Back/tools/execute/    # ~5 execute tools → loaded by tool.loader.ts
├── agent_Back/tools/research/   # ~3 research tools → loaded by tool.loader.ts
```

The tool.loader reads these directories, imports each .js file, passes it through tool.adapter, and registers it. Zero changes to existing tool files.

### Existing code that gets REWIRED:

```
backend/src/routes/agent.stream.routes.js
  — Currently points to agent_Back/agent.engine.js
  — Will be updated to point to agent/transport/sse.handler.ts
  — (or: add a new route /api/agent/v2/stream alongside the old one)
```

## New SQLite Tables

```sql
-- Conversation persistence
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'guided',
  summary TEXT,
  active_entities TEXT,          -- JSON
  created_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id),
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL,             -- 'user' | 'assistant' | 'tool'
  content TEXT,
  tool_calls TEXT,               -- JSON array of tool calls
  tool_results TEXT,             -- JSON array of tool results
  created_at TEXT NOT NULL
);

-- Audit log
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,      -- JSON
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_session ON agent_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON agent_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_turns_session ON agent_turns(session_id);
```

