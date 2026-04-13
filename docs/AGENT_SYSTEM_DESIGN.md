# Agent System Design

This document explains the production design of the Agent v2 subsystem in `lawyer-app/backend/src/agent`.

## 1. Design Objectives

The agent is designed to be:

- `Useful`: answer operational legal-office questions with live data.
- `Safe`: do not execute impactful mutations without explicit confirmation.
- `Observable`: expose turn traces, audit events, health, and runtime status.
- `Controllable`: allow operators to reduce capability in real time via safe-mode.
- `Extensible`: support multiple LLM providers, retrieval/grounding, and tool modules without rewriting the loop.

## 2. Runtime Boundary and Contract

- Entry route: `POST /api/agent/v2/stream`
- Route source: `backend/src/routes/agent.v2.routes.js`
- Stream handler: `backend/src/agent/transport/sse.handler.ts`
- Runtime factory: `backend/src/agent/transport/runtime.factory.ts`

### Request Shape

Agent v2 expects:

- `sessionId`
- `turnId`
- `message`
- optional `metadata`
- optional `userId`

Input is sanitized before execution by `security/input.sanitizer.js`.

### Stream Event Contract

Primary SSE events emitted by the runtime:

- `text_delta`
- `tool_start`
- `tool_result`
- `draft_artifact`
- `suggestion_artifact`
- `plan_artifact`
- `plan_executed`
- `plan_rejected`
- `pending`
- `confirmed`
- `entity_mutation_success`
- `disambiguation`
- `artifact` (web search artifact payload)
- `done`
- `error`

Event typing is defined in `backend/src/agent/transport/stream.emitter.ts`.

## 3. Runtime Composition

`createAgentV2Runtime()` composes the following modules:

- LLM provider proxy (`llm/provider.factory.ts`)
- persistence repository (`persistence/session.repository.js`)
- session store (`session/session.store.ts`)
- safety gates (`safety/permission.gate.ts`, `safety/loop.guard.ts`)
- tool registry + bootstrapped tools (`tools/read`, `tools/draft`, `tools/plan`, `tools/system`)
- optional retrieval runtime (`retrieval/index.js`)
- optional grounding runtime (`grounding/index.js`)
- optional memory runtime (`memory/index.js`)
- optional observability runtime (`observability/index.js`)
- optional operations runtime (`operations/index.js`)
- security runtime (`security/index.js`)

This allows partial degradation: if optional modules fail to initialize, the core loop still runs with reduced capability.

## 4. Reasoning and Execution Logic

Core loop implementation: `engine/agentic.loop.ts`

Turn classifier: `engine/turn.classifier.ts`

Turn types:

- `NEW`
- `CONFIRMATION`
- `REJECTION`
- `AMENDMENT`

Loop protections:

- max tool iterations: `AGENT_MAX_TOOL_ITERATIONS` (default `15`)
- timeout guard: `AGENT_LOOP_GUARD_TIMEOUT_MS` (default `90000`)

Read optimization:

- if all tool calls in an iteration are `READ`, they are executed in parallel for latency reduction.

## 5. Tooling and Permission Model

Tool categories (`tools/tool.types.ts`):

- `READ`
- `WRITE`
- `DRAFT`
- `PLAN`
- `EXECUTE`
- `EXTERNAL`
- `SYSTEM`

Permission matrix is enforced in `safety/permission.gate.ts` and mirrored by `security/permission.boundary.js`.

Important behavior:

- `WRITE` and `EXECUTE` categories are marked `requiresConfirmation`.
- mutation intent is modeled as plan-first (`proposeCreate`, `proposeUpdate`, `proposeDelete`) before execution.
- `suggestAction` is advisory only and cannot mutate state.

## 6. Plan-Confirm-Execute Safety Pattern

The mutation path is intentionally split:

1. Agent proposes a plan artifact.
2. Runtime stores a `pendingAction`.
3. User confirms.
4. Runtime executes through `EntityExecutor`.
5. Stream emits `plan_executed` and `entity_mutation_success`.

This separation keeps LLM generation and data mutation decoupled, auditable, and user-controlled.

## 7. Memory, Retrieval, and Grounding

### Session and Memory

- Session cache + persistence bridge: `session/session.store.ts`
- Conversation summary service: `session/summary.service.ts`
- Entity tracking and context assembly: `memory/*`

### Retrieval

- Runtime: `retrieval/index.js`
- Can be policy-disabled or fail-closed to a disabled runtime.
- Supports session/turn artifact indexing and contextual retrieval blocks.

### Grounding

- Runtime: `grounding/index.js`
- Tracks turn sources, section source IDs, and citation construction.
- Supports low-source-density disclaimer policies.

## 8. Security and Operational Controls

Security runtime (`security/index.js`) wraps:

- input sanitization
- rate limiting
- auth scope evaluation
- permission boundary validation
- audit integrity hashing

Safe-mode controls (`operations/safe.mode.js`):

- `writesDisabled`
- `retrievalDisabled`
- `groundingDisabled`
- `summarizationDisabled`
- `forceReadOnly`
- `v2Disabled`

Admin endpoints (`/api/agent/v2/admin/*`) expose runtime status, audit browsing, turn trace lookup, safe-mode patching, and debug flags.

## 9. Deployment and Feature Gating

Deployment layer: `agent/deployment/*`

Key rollout flags:

- `FEATURE_AGENT_V2_STREAM`
- `FEATURE_AGENT_V2_SUGGESTIONS`

Behavior:

- route mounting for `/agent/v2/stream` is gated by `FEATURE_AGENT_V2_STREAM`.
- suggestion generation and telemetry are gated by `FEATURE_AGENT_V2_SUGGESTIONS`.

## 10. Why This Is Strong AI Engineering Evidence

This subsystem demonstrates:

- agent loop engineering under explicit safety constraints
- plan-based mutation architecture for trustworthy AI-assisted operations
- modular AI runtime composition with graceful degradation
- observability-first design for production debugging
- runtime operational controls for incident response and controlled rollout
