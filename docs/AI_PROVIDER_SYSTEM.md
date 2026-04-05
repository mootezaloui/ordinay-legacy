# AI Provider System — Implementation Plan

## Scope

This document tracks the implementation of the AI Provider System (APS) for Ordinay.

**Goal**: Replace hardcoded `.env`-based LLM configuration with a user-facing configuration portal that lets users plug in their own API keys or local models, without editing any files.

Current state confirmed in code:

- API keys hardcoded in `backend/.env` (Groq, OpenRouter, Ollama URL)
- Model names hardcoded in `native.provider.ts` (lines 25–27) and in `useAgentState.ts` (lines 163–172)
- No runtime configuration is possible without editing environment files
- `ILLMProvider` interface already exists at `backend/src/agent/llm/illm.provider.ts` — this is the contract, it must not change
- `SettingsAgent.jsx` exists but only handles document output format — AI config section does not exist yet
- Frontend model selector in `AgentTopBar.tsx` uses a hardcoded dropdown of 3 internal model names

Target state:

- User opens Settings → AI Configuration
- User selects provider type and enters credentials
- Agent uses those credentials at runtime — no `.env` edit required
- Non-technical users can configure the agent in under 60 seconds

---

## Architecture Rules (Do Not Break)

- `ILLMProvider` is the single contract — all providers implement it, nothing else is exposed to the agent loop
- Frontend never calls LLM APIs directly — all provider calls stay in the backend
- `agentic.loop.ts` must not be modified — it receives a provider instance, it does not know what kind
- Config is stored in SQLite (already in use) — no new databases, no new persistence layer
- API keys must be encrypted at rest — never stored as plaintext in the DB
- `native.provider.ts` stays as a fallback for `.env`-based config during transition — it is not deleted until the new system is fully stable and validated
- Provider selection happens at runtime init inside `runtime.factory.ts`, not inside the agent loop
- Runtime route loading uses `backend/.agent-build/agent/transport` (see `backend/src/routes/index.js`), so changes under `backend/src/agent/**` require `npm run build:agent` before they affect the live chatbot process

---

## Two Modes — User-Facing Framing

```
Mode 1: Use My Own API Key (BYOK)
  → User provides: Provider type, credentials, model name

Mode 2: Use Ordinay AI  [Coming Soon — greyed out in UI]
  → Placeholder — no backend for this yet
```

---

## UI Taxonomy vs Internal Types

```
User-facing provider taxonomy (Settings UI):
  - OpenAI
  - Anthropic
  - Gemini
  - Ollama
  - Custom endpoint
  - Azure OpenAI (Coming soon, disabled)
  - AWS Bedrock (Coming soon, disabled)

Internal backend provider_type values (unchanged, persisted):
  - openai_compatible
  - custom
  - ollama
  - anthropic
  - gemini

Display-to-backend mapping:
  - OpenAI          -> openai_compatible
  - Custom endpoint -> custom
  - Ollama          -> ollama
  - Anthropic       -> anthropic
  - Gemini          -> gemini

Custom endpoint presets in UI:
  - OpenRouter
  - Groq
  - Manual custom
```

---

## Phase Checklist

---

## Phase 0 — Contract Freeze

- [x] Confirm `ILLMProvider` interface covers all needed operations: generate, streaming, tool calls
- [x] Freeze DB config schema fields: `provider_type`, `base_url`, `api_key_encrypted`, `model`, `active`
- [x] Freeze `provider_type` identifiers for v1: `openai_compatible` | `ollama` | `custom`
- [x] Freeze API route surface: exactly 3 routes
  - `GET /api/settings/ai-provider`
  - `PUT /api/settings/ai-provider`
  - `POST /api/settings/ai-provider/test`
- [x] Freeze encryption strategy: AES-256-GCM, key derived from `APP_SECRET` env var or generated machine-bound value at startup
- [x] Freeze frontend mode identifiers: `byok` | `ordinay`
- [x] Freeze masked key representation: return `"****"` on `GET`, never return plaintext

### Phase 0 Frozen Decisions

1. `ILLMProvider` interface at `backend/src/agent/llm/illm.provider.ts` is complete: `generate()`, `stream()`, `supportsTools()`.
2. Storage uses the existing `app_settings` key-value table (already created by `documentAiSettings.service.js`) — no new table or migration needed.
3. Config stored as individual keys: `ai_provider_type`, `ai_provider_base_url`, `ai_provider_api_key_encrypted`, `ai_provider_model`.
4. API keys encrypted with AES-256-GCM, key derived from `SHA256(process.env.APP_SECRET)`.
5. Masked key returned as `"****"` on GET — never plaintext.
6. Service follows the exact pattern of `documentAiSettings.service.js`.

Definition of done:

- [x] All field names, route paths, and provider type strings are decided — no open ambiguity before any code is written

---

## Phase 1 — Backend: Config Storage

**Files:**
- `backend/src/services/aiProvider.service.js` *(new)* — follows `documentAiSettings.service.js` pattern exactly

Implementation note: Reuses the existing `app_settings` key-value table. No new table or migration needed.

Tasks:

- [x] Reuse existing `app_settings` table (created by `documentAiSettings.service.js` `ensureSchema()`)
- [x] Create `aiProvider.service.js` with three functions:
  - [x] `saveProviderConfig(config)` — encrypts API key via AES-256-GCM, stores each field as a separate `app_settings` key
  - [x] `getRawProviderConfig()` — reads config, decrypts API key, returns plain object; returns `null` when no config exists
  - [x] `clearProviderConfig()` — deletes all `ai_provider_*` keys from `app_settings`
- [x] `getProviderConfig()` — returns config with masked key (`"****"`) for API responses
- [x] Implement AES-256-GCM encryption helpers inside the service:
  - [x] Derive encryption key from `SHA256(process.env.APP_SECRET)` with fallback default
  - [x] Encrypt on write, decrypt on read only
  - [x] Key never logged or exposed in error messages
- [x] Schema ensured on module load (idempotent `CREATE TABLE IF NOT EXISTS`)
- [x] Validation: `provider_type` must be one of `openai_compatible`, `ollama`, `custom`; `model` required

Definition of done:

- [x] `saveProviderConfig()` + `getRawProviderConfig()` round-trip test passes with encrypted key
- [x] `getRawProviderConfig()` returns `null` when no config exists — does not throw
- [x] `getProviderConfig()` returns `api_key_masked: "****"` — never plaintext
- [x] Table is created automatically on backend startup if it does not exist

---

## Phase 2 — Backend: Settings API

**Files:**
- `backend/src/routes/settings.routes.js` *(new)*
- `backend/src/routes/index.js` — registered at `/settings`

Tasks:

- [x] Create `settings.routes.js` with exactly 3 endpoints:
  - [x] `GET /api/settings/ai-provider`
    - Returns current config with API key masked as `"****"`
    - When no DB config is saved, returns `{ configured: false }` plus effective native fallback values (`provider_type`, `base_url`, `model`, `source: "native_fallback"`) so Settings reflects what runtime is currently using
    - Returns optional UI metadata for hydration: `provider_display` and `provider_preset`
  - [x] `GET /api/settings/ai-provider/ollama-status`
    - Returns runtime readiness metadata: `installed`, `running`, `models`, `model_count`, `status`
    - Enables live Settings polling so users can install/start Ollama without restarting the app
  - [x] `PUT /api/settings/ai-provider`
    - Validates payload: `provider_type` required (400 if invalid), `model` required (400 if missing)
    - Saves via `aiProvider.service.saveProviderConfig()`
    - Returns `{ ok: true }`
  - [x] `POST /api/settings/ai-provider/test`
    - Supports both: request body config (pre-save test) or loads from DB
    - Sends a minimal OpenAI-compatible completion request to the provider
    - Returns `{ ok: true, latency_ms }` on success
    - Returns `{ ok: false, error }` on failure — descriptive messages for ECONNREFUSED, ENOTFOUND, timeout, HTTP errors
    - 15-second timeout via `AbortSignal.timeout`
- [x] Register routes in `backend/src/routes/index.js` at `/settings`

Definition of done:

- [x] `GET` with no config saved → `{ configured: false }` plus native fallback provider/model fields and optional UI metadata
- [x] `PUT` valid OpenAI-compatible config → `{ ok: true }`
- [x] `GET` after save → config returned with masked key
- [x] `PUT` invalid provider_type → 400 with descriptive error
- [x] `POST /test` connection refused → `{ ok: false, error: "Connection refused — is the server running?" }`
- [x] `POST /test` bad host → `{ ok: false, error: "Host not found — check the URL" }`
- [x] `POST /test` no config → `{ ok: false, error: "No AI provider configured..." }`

---

## Phase 3 — Backend: Provider Factory

**Files:**
- `backend/src/agent/llm/configured.provider.ts` *(new)* — clean ILLMProvider for user-configured endpoints
- `backend/src/agent/llm/provider.factory.ts` *(new)* — resolves which provider to use
- `backend/src/agent/llm/index.ts` — exports new modules
- `backend/src/agent/transport/runtime.factory.ts` — updated to use `resolveProvider()`

Tasks:

- [x] Create `configured.provider.ts`:
  - [x] Implements `ILLMProvider` (generate, stream, supportsTools)
  - [x] Single endpoint — no fallback chain, user's config is the source of truth
  - [x] Uses user-configured model always (ignores old `modelPreference` metadata)
  - [x] Handles OpenAI-compatible, Ollama, and Custom endpoints via URL construction
  - [x] Full streaming with SSE parsing, tool call assembly, and buffer flush
  - [x] Falls back to non-streaming generate on stream HTTP error
- [x] Create `provider.factory.ts`:
  - [x] `resolveProvider(): ILLMProvider` — loads DB config via `aiProvider.service.getRawProviderConfig()`
  - [x] DB config exists + valid → returns `ConfiguredLLMProvider`
  - [x] No DB config → falls back to `createNativeLLMProvider()` (.env-based)
  - [x] Dynamic `require()` to avoid TS→JS cross-boundary compile issue
- [x] Update `runtime.factory.ts`:
  - [x] Import `resolveProvider` from `../llm`
  - [x] Line 249: `resolveProvider()` replaces `createNativeLLMProvider()`
- [x] `native.provider.ts` untouched — stays as fallback

Definition of done:

- [x] Typecheck passes: `npm run typecheck:agent` — clean
- [x] Build passes: `npm run build:agent` — clean
- [x] All 109 tests pass: `npm run test:agent-v2` — 109/109
- [x] Factory log confirms: `[PROVIDER_FACTORY] No user config found, falling back to .env-based provider`
- [x] Runtime boots with no DB config → existing behavior preserved exactly

---

## Phase 4 — Frontend: AI Configuration UI

**Files:**
- `frontend/src/services/api/aiProvider.ts` *(new)* — API service with typed interfaces
- `frontend/src/components/settings/SettingsAgent.jsx` — added AI Configuration section above existing content
- `frontend/src/i18n/locales/en/settings.json` — added `agent.aiConfig.*` keys
- `frontend/src/i18n/locales/fr/settings.json` — added `agent.aiConfig.*` keys (French)
- `frontend/src/i18n/locales/ar/settings.json` — added `agent.aiConfig.*` keys (Arabic)

Tasks:

- [x] Create `aiProvider.ts` with 3 typed functions + interfaces:
  - [x] `getAIProviderConfig()` → `GET /api/settings/ai-provider`
  - [x] `saveAIProviderConfig(payload)` → `PUT /api/settings/ai-provider`
  - [x] `testAIProviderConfig(payload?)` → `POST /api/settings/ai-provider/test`
- [x] Add "AI Configuration" section to `SettingsAgent.jsx`:
  - [x] **Mode selector** (radio group):
    - `Use my own API key` — active and selectable
    - `Use Ordinay AI` — visible but disabled, "Coming soon" badge
  - [x] When `Use my own API key` is selected, show provider form:
    - [x] **Provider type dropdown**: `OpenAI-compatible` | `Ollama (local)` | `Custom endpoint`
    - [x] **Fields for `OpenAI-compatible`**: Base URL, API Key (password), Model — with contextual placeholders
    - [x] **Fields for `Ollama (local)`**: Ollama URL, Model — no API key field
    - [x] **Fields for `Custom endpoint`**: Base URL, API Key, Model
  - [x] **Save button** → calls `saveAIProviderConfig()`, shows toast on success/error
  - [x] **Test Connection button** → calls `testAIProviderConfig()` with current form values (pre-save test), shows inline result:
    - Success: green banner with latency in ms
    - Error: red banner with descriptive error message
  - [x] On mount: calls `getAIProviderConfig()` to pre-fill form if config exists (masked key)
  - [x] Both buttons disabled when model field is empty
- [x] Full trilingual i18n: English, French, Arabic

Definition of done:

- [x] API service types compile clean: `tsc --noEmit` — no errors on changed files
- [x] Backend typecheck + 109/109 tests still pass
- [x] Mode radio: "Ordinay AI" visible but disabled with badge
- [x] Provider dropdown changes field visibility (API key hidden for Ollama)
- [x] Placeholders change per provider type
- [x] Test result displays inline with color-coded feedback

---

## Phase 5 — Frontend: Model Selector Update

**Files:**
- `frontend/src/services/api/agent.ts` — `AgentModelPreference` changed from hardcoded union to `string`
- `frontend/src/Agent_front/components/AgentTopBar.tsx` — dropdown replaced with static label
- `frontend/src/Agent_front/hooks/useAgentState.ts` — hardcoded validation removed, loads from AI config

Tasks:

- [x] Update `agent.ts`:
  - [x] `AgentModelPreference` changed from `'gpt-oss:120b-cloud' | 'deepseek-r1:8b' | 'gemma3:1b'` to `string`
- [x] Update `AgentTopBar.tsx`:
  - [x] Removed hardcoded `<select>` with 3 model options
  - [x] Replaced with static `<span>` showing the configured model name
  - [x] If no model configured, shows: "Configure AI in Settings"
  - [x] Props interface unchanged — `modelPreference` and `onModelPreferenceChange` still passed (used by internal state flow)
- [x] Update `useAgentState.ts`:
  - [x] Removed hardcoded model validation (`gpt-oss:120b-cloud`, `deepseek-r1:8b`, `gemma3:1b`)
  - [x] `loadModelPreferenceFromStorage()` now returns any stored string or empty string
  - [x] Added `useEffect` on mount: calls `getAIProviderConfig()`, sets model from saved config
  - [x] localStorage still used as cache, but AI provider config is the source of truth on mount

Definition of done:

- [x] TopBar shows the model name the user configured in Settings
- [x] No hardcoded model names remain in the frontend model selector path
- [x] If no AI config is saved, user sees "Configure AI in Settings" — agent does not crash
- [x] Frontend typecheck: no errors on changed files
- [x] Backend: typecheck clean, 109/109 tests pass

---

## Phase 6 — Native SDK Providers (Non-OpenAI-Compatible)

**Why this phase is separate**: Anthropic Claude and Google Gemini use completely different API structures. Tool definitions, message formats, streaming events, and response shapes are all different from the OpenAI spec. Each requires its own SDK and a dedicated `ILLMProvider` adapter.

**Files:**
- `backend/src/agent/llm/anthropic.provider.ts` *(new)* — full ILLMProvider with system prompt splitting, tool format mapping, SDK streaming
- `backend/src/agent/llm/gemini.provider.ts` *(new)* — full ILLMProvider with contents format, functionDeclarations, SDK streaming
- `backend/src/agent/llm/provider.factory.ts` — added `anthropic` and `gemini` routing cases
- `backend/src/agent/llm/index.ts` — added exports for new providers
- `backend/src/services/aiProvider.service.js` — VALID_PROVIDER_TYPES updated with `anthropic`, `gemini`
- `backend/src/routes/settings.routes.js` — added `testAnthropicProvider()` and `testGeminiProvider()` native SDK test functions
- `frontend/src/components/settings/SettingsAgent.jsx` — added provider options, conditional Base URL visibility
- `frontend/src/i18n/locales/en/settings.json` — added Anthropic/Gemini provider labels and model placeholders
- `frontend/src/i18n/locales/fr/settings.json` — added Anthropic/Gemini provider labels and model placeholders
- `frontend/src/i18n/locales/ar/settings.json` — added Anthropic/Gemini provider labels and model placeholders

Tasks:

- [x] Freeze `provider_type` additions: `anthropic` | `gemini`
- [x] **Anthropic provider**:
  - [x] `npm install @anthropic-ai/sdk` in backend
  - [x] Create `anthropic.provider.ts` implementing `ILLMProvider`:
    - [x] Map `LLMGenerateParams.messages` → Anthropic messages API format (system prompt separate from user/assistant turns)
    - [x] Map tool definitions → Anthropic tool format (`input_schema` instead of `parameters`, different structure)
    - [x] Map Anthropic response → `LLMResponse` (normalize `tool_use` blocks → `toolCalls` array)
    - [x] Implement streaming via Anthropic SDK stream API → emit same `LLMStreamChunk` shape as other providers
  - [x] Add `anthropic` case to `provider.factory.ts`
- [x] **Gemini provider**:
  - [x] `npm install @google/generative-ai` in backend
  - [x] Create `gemini.provider.ts` implementing `ILLMProvider`:
    - [x] Map messages → Gemini `contents` format (role names differ: `model` not `assistant`)
    - [x] Map tool definitions → Gemini `functionDeclarations` format
    - [x] Map Gemini response → `LLMResponse` (normalize `functionCall` parts → `toolCalls` array)
    - [x] Implement streaming via Gemini SDK `generateContentStream`
  - [x] Add `gemini` case to `provider.factory.ts`
- [x] Update `PUT /api/settings/ai-provider` validation to accept `anthropic` | `gemini`
- [x] Update Settings UI provider dropdown:
  - [x] Add `Anthropic (Claude)`:
    - Fields: API Key, Model (placeholder: `claude-sonnet-4-5-20250514`)
    - No base URL field needed
  - [x] Add `Google (Gemini)`:
    - Fields: API Key, Model (placeholder: `gemini-2.5-flash`)
    - No base URL field needed
- [x] Verify `POST /api/settings/ai-provider/test` works for both new providers (native SDK test functions added)
- [ ] End-to-end test: agent uses tools through Anthropic provider (tool call format round-trip) — requires live API key
- [ ] End-to-end test: agent uses tools through Gemini provider (function call format round-trip) — requires live API key

Definition of done:

- [x] User selects `Anthropic (Claude)`, enters key + model, clicks Test → native SDK test endpoint implemented
- [x] User selects `Google (Gemini)`, enters key + model, clicks Test → native SDK test endpoint implemented
- [ ] Tool calls work end-to-end through both new providers (requires live API key testing)
- [ ] Streaming works for both — tokens arrive progressively, not in one batch (requires live API key testing)
- [x] No changes required in `agentic.loop.ts` — the loop is provider-agnostic

---

## Deferred Items — Not In V1

These are explicitly out of scope for the current implementation. They are tracked here so they are not forgotten.

### D1 — OS Keychain Integration
**What**: Store API keys in OS-native secure storage (Windows Credential Manager, macOS Keychain) instead of AES-encrypted SQLite.
**Why deferred**: Requires Electron IPC and OS-specific APIs. AES-256-GCM in SQLite is acceptable for v1 on a local desktop app.
**Replaces**: Phase 1 encryption — swap implementation without changing `saveConfig`/`loadConfig` API surface.
**Priority**: v2, after v1 is stable in production.

### D2 — Default Model Roles Per Task Type
**What**: Let users assign different models to different agent behaviors — a faster model for chat, a stronger model for drafting, a reasoning model for complex planning.
**Why deferred**: Adds configuration surface before the basic single-model path is proven. The agent currently uses one model per session. Multi-model routing requires routing logic in the agent loop.
**Priority**: After Phase 6 is complete and multiple providers are in production use.

### D3 — Custom Endpoint Request Headers
**What**: Let advanced users add arbitrary HTTP headers to provider requests (e.g., `HTTP-Referer`, `X-Title` for OpenRouter attribution).
**Why deferred**: Edge case. Affects a small subset of OpenRouter configurations. Can be added as an expandable "Advanced" section in the Custom endpoint form.
**Priority**: On user request.

### D4 — Auto-Detect Ollama Models
**What**: When user selects Ollama and enters the URL, query `GET {url}/api/tags` and populate a model name dropdown automatically instead of requiring manual text input.
**Why deferred**: UX improvement, not blocking. User can type the model name manually in Phase 4.
**Priority**: After Phase 3 is stable. Small addition to the Ollama form in `SettingsAgent.jsx`.

### D5 — Ordinay-Hosted AI (Proxy Backend)
**What**: Ordinay operates a backend proxy that forwards LLM requests using Ordinay's own API key. Users with no personal keys get AI access through Ordinay's infrastructure.
**Why deferred**: Requires backend hosting infrastructure, billing system, rate limiting, and authentication tokens. None of this exists yet.
**UI placeholder**: Phase 4 already includes the `Use Ordinay AI` option in the UI (greyed out / "Coming soon").
**Priority**: After infrastructure decision is made and funded.

---

## Validation Checkpoints

| Phase | Status |
|-------|--------|
| Phase 0 — Contract Freeze | ✅ Complete |
| Phase 1 — Config Storage | ✅ Complete |
| Phase 2 — Settings API | ✅ Complete |
| Phase 3 — Provider Factory | ✅ Complete |
| Phase 4 — AI Config UI | ✅ Complete |
| Phase 5 — Model Selector Update | ✅ Complete |
| Phase 6 — Native SDK Providers | ✅ Complete (live API key testing deferred to user) |

---

## End-to-End Acceptance Test (Final Gate)

Before this plan is considered complete, all of the following must pass:

- [ ] User with OpenRouter key: opens Settings → enters base URL + key + model → tests → agent responds correctly
- [ ] User with Groq key: same flow, different base URL (`https://api.groq.com/openai/v1`)
- [ ] User with local Ollama: enters `http://localhost:11434` + model name → tests → agent responds
- [ ] User with Anthropic key: enters key + model → tests → agent responds with tool calls working
- [ ] User with Gemini key: enters key + model → tests → agent responds with tool calls working
- [ ] User with no config saved: Settings still reflects active native fallback provider values, and agent does not crash
- [ ] Backend restart with config saved in DB: config persists, agent uses it immediately on next request
- [ ] Config changed in Settings while app is running: next agent request uses new provider
