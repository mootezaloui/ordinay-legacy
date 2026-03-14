# IMPLEMENTATION_PLAN.md — Step-by-Step Build Order

## Pre-Requisites

```bash
# From lawyer-app/backend/
npm install openai zod ajv
npm install -D vitest typescript @types/node @types/better-sqlite3
```

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "paths": {
      "@agent/*": ["./src/agent/*"]
    }
  },
  "include": ["src/**/*"]
}
```

---

## Phase 1: Foundation (Day 1-2)

### Task 1.1: Type Definitions
**File**: `agent/types.ts`
**What**: Define `AgentMode`, `ToolCategory`, `TurnType`, and other shared enums/types.
**Acceptance**: Types compile, no circular dependencies.

### Task 1.2: Configuration
**File**: `agent/config.ts`
**What**: Define constants: `MAX_LOOP_ITERATIONS=15`, `MAX_TOOLS_PER_TURN=30`, `SESSION_TTL_MS=1800000`, `TOKEN_BUDGETS`, `RECENT_TURNS_LIMIT=8`.
**Acceptance**: All magic numbers live here, not scattered in code.

### Task 1.3: Error Classes
**File**: `agent/errors.ts`
**What**: `AgentError` class with code, recoverable flag, userMessage. Error code enum.
**Acceptance**: Typed errors, constructors for common cases (`toolNotFound`, `validationFailed`, `permissionDenied`, etc.).

### Task 1.4: LLM Types
**File**: `agent/llm/llm.types.ts`
**What**: Provider-agnostic types: `LLMMessage`, `LLMToolCall`, `LLMResponse`, `LLMStreamChunk`, `ChatOptions`.
**Acceptance**: Types don't import from `openai` package — they're abstract.

### Task 1.5: LLM Provider Interface
**File**: `agent/llm/llm.provider.ts`
**What**: `ILLMProvider` interface with `chat(messages, tools, options)` returning `AsyncIterable<LLMStreamChunk>`.
**Acceptance**: Interface is implementable by OpenAI, Claude, Gemini without changes.

### Task 1.6: OpenAI Provider
**File**: `agent/llm/openai.provider.ts`
**What**: Implement `ILLMProvider` using `openai` npm package. Handle streaming, tool_calls parsing, error mapping.
**Acceptance**: Can send a message with tools and receive streamed response with tool calls parsed correctly.
**Test**: Unit test with mocked OpenAI client.

### Task 1.7: Session Types
**File**: `agent/session/session.types.ts`
**What**: `Session`, `Turn`, `CachedEntity`, `PendingAction` interfaces.
**Acceptance**: Complete type coverage for all session state.

### Task 1.8: Session Store
**File**: `agent/session/session.store.ts`
**What**: `SessionStore` class with in-memory Map. Methods: `create()`, `get()`, `update()`, `delete()`, `cleanup()` (remove expired).
**Acceptance**: Sessions persist across calls, TTL cleanup works.
**Test**: Unit test for CRUD + TTL expiry.

### Task 1.9: Tool Types
**File**: `agent/tools/tool.types.ts`
**What**: `AgentTool`, `ToolResult`, `OpenAIToolSchema`, `ToolMetadata`.
**Acceptance**: Types match existing tool shape (name, category, inputSchema, handler).

### Task 1.10: Tool Adapter
**File**: `agent/tools/tool.adapter.ts`
**What**: `adaptTool(existingJSTool) → AgentTool`, `toOpenAISchema(tool) → OpenAIToolSchema`.
**Acceptance**: Can import an existing JS tool file and convert it.
**Test**: Adapt `getClient` tool, verify schema output.

### Task 1.11: Tool Enrichments
**File**: `agent/tools/tool.enrichments.ts`
**What**: `ENRICHED_DESCRIPTIONS` map — richer descriptions for each tool to improve LLM selection.
**Acceptance**: Every existing tool has an enriched description.

### Task 1.12: Tool Registry
**File**: `agent/tools/tool.registry.ts`
**What**: `ToolRegistry` class. Methods: `register(tool)`, `get(name)`, `getAll()`, `getSchemasForMode(mode)`.
**Acceptance**: Can load all tools, filter by mode, produce OpenAI schemas.
**Test**: Register tools, verify filtering.

### Task 1.13: Tool Loader
**File**: `agent/tools/tool.loader.ts`
**What**: `loadToolsFromDirectories(paths[]) → AgentTool[]`. Auto-discovers .js files, requires them, adapts.
**Acceptance**: Loads all ~40 existing tools from `agent_Back/tools/read|draft|plan|execute|research`.
**Test**: Load from actual directories, verify count.

---

## Phase 2: Core Engine (Day 3-5)

### Task 2.1: Stream Emitter
**File**: `agent/engine/stream.emitter.ts`
**What**: `SSEEmitter` class wrapping Express `Response`. Methods: `emitTextDelta(text)`, `emitToolStart(name)`, `emitToolResult(name, summary)`, `emitPending(action)`, `emitError(msg)`, `emitDone()`.
**Acceptance**: Emits properly formatted SSE events.

### Task 2.2: Input Validator
**File**: `agent/safety/input.validator.ts`
**What**: Validate tool call parameters against JSON Schema using ajv.
**Acceptance**: Catches type mismatches, missing required fields, extra properties.
**Test**: Valid + invalid inputs for getClient and listDossiers.

### Task 2.3: Permission Gate
**File**: `agent/safety/permission.gate.ts`
**What**: `isToolPermitted(toolCategory, mode) → boolean`. Uses permission matrix.
**Acceptance**: Read-only mode blocks WRITE/EXECUTE. All modes allow READ.
**Test**: Matrix coverage.

### Task 2.4: Loop Guard
**File**: `agent/safety/loop.guard.ts`
**What**: `LoopGuard` class tracking iterations and tool call count. Methods: `canContinue()`, `recordIteration()`, `recordToolCall()`.
**Acceptance**: Stops loop at configured limits.

### Task 2.5: Pending Manager
**File**: `agent/engine/pending.manager.ts`
**What**: `createPending(session, action)`, `executePending(session, registry)`, `clearPending(session)`, `hasPending(session)`.
**Acceptance**: Creates pending from write tool calls, executes on confirmation, clears on rejection.
**Test**: Full create → confirm → execute flow.

### Task 2.6: Tool Executor
**File**: `agent/engine/tool.executor.ts`
**What**: `executeTool(toolCall, session, registry, emitter) → ToolResult`. Full pipeline: validate → permission check → cache check → write gate → execute → validate output → cache update.
**Acceptance**: READ tools execute and cache. WRITE tools create pending. Invalid tools return errors.
**Test**: Read tool execution, write tool interception, invalid tool name, invalid params.

### Task 2.7: Turn Classifier
**File**: `agent/engine/turn.classifier.ts`
**What**: `classifyTurn(message, session) → TurnType`. Detect CONFIRMATION, REJECTION, AMENDMENT when pending exists. Otherwise FULL_PIPELINE.
**Acceptance**: "yes" + pending → CONFIRMATION. "no" + pending → REJECTION. "change X" + pending → AMENDMENT. Anything without pending → FULL_PIPELINE.
**Test**: All turn types with French, Arabic, English patterns.

### Task 2.8: Entity Tracker
**File**: `agent/session/entity.tracker.ts`
**What**: `extractAndCacheEntities(toolName, result, session)`. Knows which tools produce which entities.
**Acceptance**: getClient caches client. listDossiers caches dossiers. getEntityGraph caches all entities in graph.
**Test**: Cache population from various tool results.

### Task 2.9: System Prompt Builder
**Files**: `agent/prompts/system.prompt.ts`, `identity.prompt.ts`, `schema.prompt.ts`, `tools.prompt.ts`, `mode.prompt.ts`
**What**: Construct the system prompt dynamically from session context.
**Acceptance**: Prompt includes identity, schema ref, active entities, pending actions, mode rules. Under 2000 tokens for the fixed part.
**Test**: Build prompt with various session states, verify all sections present.

### Task 2.10: Context Assembler
**File**: `agent/session/context.assembler.ts`
**What**: `assembleContext(session) → string`. Formats active entities and pending actions as text for the system prompt.
**Acceptance**: Active entities listed with key fields. Pending action described clearly.

### Task 2.11: Message Builder
**File**: `agent/engine/message.builder.ts`
**What**: `buildMessages(session, userMessage) → LLMMessage[]`. Assembles: system prompt + summary + recent turns + current message.
**Acceptance**: Correct message ordering. History truncation when over budget. Tool results summarized in older turns.
**Test**: Build with empty session, with long history, with pending action.

### Task 2.12: Agentic Loop
**File**: `agent/engine/agentic.loop.ts`
**What**: The core loop. Send messages to LLM → process tool_calls → append results → repeat → stream text.
**Acceptance**: Single-tool query works. Multi-tool chaining works. Write tool creates pending. Loop terminates on text-only response. Respects iteration limits.
**Test**: Integration test with mocked LLM provider returning scripted tool calls.

### Task 2.13: Agent Engine
**File**: `agent/engine/agent.engine.ts`
**What**: Top-level `processMessage(session, message, emitter)`. Calls turn classifier → routes to confirmation handler, amendment handler, or agentic loop → updates session.
**Acceptance**: Handles all turn types correctly. Session updated after each turn.
**Test**: Integration test covering: new request, follow-up, confirmation, rejection, amendment.

---

## Phase 3: Integration (Day 6-7)

### Task 3.1: SSE Handler
**File**: `agent/transport/sse.handler.ts`
**What**: Express route handler. Receives request, creates SSEEmitter, loads session, calls agent engine.
**Acceptance**: Wires into existing Express app. SSE events reach frontend.

### Task 3.2: Module Index
**File**: `agent/index.ts`
**What**: `createAgentHandler(deps)` — factory that creates the Express middleware with injected dependencies (db connection, LLM provider config).
**Acceptance**: Single import to wire into Express.

### Task 3.3: Route Wiring
**File**: Update `routes/` to add new endpoint `/api/agent/v2/stream`
**What**: Register the new agent handler alongside the existing one.
**Acceptance**: Both old and new agent endpoints work simultaneously.

### Task 3.4: Audit Logger
**File**: `agent/safety/audit.logger.ts`
**What**: `AuditLogger` class writing to SQLite. Creates table if not exists. Methods: `log(sessionId, turn, type, data)`.
**Acceptance**: Events written to DB. Queryable by session.

### Task 3.5: History Store
**File**: `agent/session/history.store.ts`
**What**: Persist sessions and turns to SQLite. Load on session resume.
**Acceptance**: Session survives app restart (for recent sessions).

### Task 3.6: Summary Service
**File**: `agent/session/summary.service.ts`
**What**: Summarize old turns via LLM call. Preserve entity IDs, dates, decisions.
**Acceptance**: Long conversations get compressed without losing critical context.

---

## Phase 4: Hardening (Day 8-9)

### Task 4.1: Output Validator
**File**: `agent/safety/output.validator.ts`
**What**: Validate tool outputs against outputSchema. Log warnings for mismatches.
**Acceptance**: Detects malformed outputs without blocking execution.

### Task 4.2: Conversation Test Suite
**File**: `agent/__tests__/scenarios/`
**What**: Multi-turn test scripts covering all conversation patterns from SKILLS.md.
**Acceptance**: All scenarios pass with mocked LLM.

### Task 4.3: Error Recovery
**What**: Ensure all error paths produce user-friendly messages. Tool failures inform the LLM. LLM failures retry. Session state is never corrupted.
**Acceptance**: No unhandled exceptions. No cryptic error messages reaching the user.

### Task 4.4: Token Budget Enforcement
**What**: Implement actual token counting (tiktoken or estimate) in message builder. Trim history when over budget.
**Acceptance**: Never exceed context window. Oldest turns get summarized first.

---

## Phase 5: Frontend Integration (Day 10)

### Task 5.1: Feature Flag
**What**: Frontend toggle to switch between `/api/agent/stream` (old) and `/api/agent/v2/stream` (new).
**Acceptance**: Can test new agent without breaking old one.

### Task 5.2: SSE Event Handling
**What**: Update frontend SSE handler to process new event types (tool_start, tool_result, pending, confirmed).
**Acceptance**: Tool execution shows progress. Pending actions show confirmation UI.

---

## Phase 6: Document Generation (Day 11-14)

### Task 6.1: Template Registry
### Task 6.2: Template Filler
### Task 6.3: Document Generator
### Task 6.4: DOCX Renderer
(Detailed later — depends on template format decisions)

---

## Validation Checkpoints

After each phase, verify:

- Phase 1 ✅ Completed
- Phase 2 ✅ Completed
- Phase 3 ✅ Completed
- Phase 4 ✅ Completed
- Phase 5 ✅ Completed
- Phase 6 ✅ Completed
- Phase 7 ✅ Completed
- Phase 8 ✅ Completed
- Phase 9 ✅ Completed
- Phase 11 ✅ Completed
- Phase 12 ✅ Completed
- Phase 13 ✅ Completed
- Phase 14 ✅ Completed
- Phase 15 ✅ Completed
- Phase 16 ✅ Completed
- Phase 17 (Operational Controls) 🔄 In Progress

### Phase 1 ✓ Checklist:
- [ ] Can load all ~40 existing tools
- [ ] Can convert them to OpenAI schemas
- [x] Session CRUD works
- [ ] OpenAI provider sends/receives with streaming
- [x] Types compile with no errors

### Phase 2 ✓ Checklist:
- [ ] Single-turn query works (user asks → tools called → response streamed)
- [ ] Multi-tool chaining works (client → dossiers → lawsuit in one turn)
- [ ] Write operations create pending actions (not auto-executed)
- [ ] Confirmations execute pending actions
- [ ] Amendments modify pending actions
- [ ] Turn classifier handles French + Arabic + English
- [ ] Session context persists across turns
- [ ] Entity cache prevents redundant queries
- [ ] Loop terminates safely at limits

### Phase 3 ✓ Checklist:
- [ ] SSE endpoint works end-to-end with real frontend
- [ ] Audit log records all events
- [ ] Sessions persist to SQLite
- [ ] Long conversations get summarized

### Phase 4 ✓ Checklist:
- [ ] All conversation patterns from SKILLS.md work
- [ ] No unhandled errors reach user
- [ ] Token budget respected for long conversations
- [ ] Tool failures handled gracefully


