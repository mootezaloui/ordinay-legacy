# Structured Intent + Commentary Streaming Audit (Phase 1)

## Trace (previous implementation)
- SSE route lifecycle was implemented in `backend/src/agent_Back/agent.router.js:847` with `start -> intent -> artifact -> commentary -> done`.
- Intent framing stream lived in `backend/src/agent_Back/agent.router.js:192` (`streamIntentEvent`).
- Artifact emission lived in `backend/src/agent_Back/agent.router.js:272` (`sendArtifactEvent`).
- Commentary stream lived in `backend/src/agent_Back/agent.router.js:422` (`streamCommentaryEvent`) and optional search-summary path at `backend/src/agent_Back/agent.router.js:321`.

## Root Causes
- Intent/commentary omission by design gates:
  - Commentary was intentionally skipped for `chat`, `web_search_results`, `web_deep_search_results`, `context_suggestion`, and error/resolution states in `backend/src/agent_Back/agent.router.js:440`.
- Silent failure paths (no mandatory failure envelope):
  - Intent/commentary stream errors resolved quietly via `resolve()` in callbacks (`backend/src/agent_Back/agent.router.js:237`, `backend/src/agent_Back/agent.router.js:578`), so stages could disappear without explicit failure events.
- Provider coupling to Ollama NDJSON parser:
  - Streaming parser `consumeOllamaJsonlStream` (`backend/src/agent_Back/llm/llm.client.js:437`) assumes line-delimited JSON and `JSON.parse(trimmed)` (`backend/src/agent_Back/llm/llm.client.js:446`), which breaks/degrades on cloud providers that return non-NDJSON streaming or buffered JSON.
- Buffered/block behavior risk:
  - Old path used provider-token chunks directly and relied on transport behavior; there was no deterministic chunk-size/flush policy for intent/commentary schema stages.

## Implemented Fixes (this PR)
- Deterministic sequence with mandatory stage terminals:
  - `turn.start -> intent.delta* -> intent.final|intent.failed -> artifact.delta* -> artifact.final|artifact.failed -> commentary.delta* -> commentary.final|commentary.failed -> turn.end`.
  - Implemented in `backend/src/agent_Back/agent.router.js:1194` onward.
- Schema contract added:
  - `backend/src/agent_Back/schemas/event-envelope.schema.json`
  - `backend/src/agent_Back/schemas/intent.schema.json`
  - `backend/src/agent_Back/schemas/commentary.schema.json`
  - `backend/src/agent_Back/schemas/failure.schema.json`
- Ajv validation + retry-once for structured intent/commentary:
  - `backend/src/agent_Back/agent.router.js:1052` (`generateStructuredPayload`) with strict retry.
- Provider-agnostic adapter:
  - `backend/src/agent_Back/llm/stream.provider.js` (`streamLLM`) supports NDJSON/SSE/plain JSON paths and `auto|ollama|openai` resolution.
- Streaming chunk policy:
  - Configurable chunking and periodic flush via `createDeltaEmitter` in `backend/src/agent_Back/agent.router.js:955`.

## Frontend Contract/Rendering Alignment
- New envelope/event parsing added in `frontend/src/services/api/agent.ts:1096`.
- Structured intent card rendering in `frontend/src/Agent_front/components/messages/IntentFramingMessage.tsx:17`.
- Structured commentary typed-card rendering in `frontend/src/Agent_front/components/artifacts/CommentaryBubble.tsx:28`.
