# Ordinay AI Provider — Implementation Plan

## Scope

This document tracks the implementation of the **Ordinay-hosted AI provider** — the system that lets users access AI agent capabilities without bringing their own API keys.

**Goal**: When a user selects "Use Ordinay AI" in Settings, requests route through Ordinay's infrastructure to a managed LLM backend. The user provides nothing except a valid Ordinay license.

**Current state**:

- Frontend already has the `"Use Ordinay AI"` radio option in `SettingsAgent.jsx` (greyed out, "Coming soon" badge)
- `aiMode` state already supports `"byok"` | `"ordinay"` values
- `provider.factory.ts` resolves providers at runtime — new provider type slots in without touching the agent loop
- `ILLMProvider` interface is frozen — any new provider implements `generate()`, `stream()`, `supportsTools()`
- License system exists: `licenseService.ts` validates signed licenses with device binding
- Activation server already runs at `ordinay.app`

**Target state**:

- User opens Settings → selects "Use Ordinay AI"
- App verifies active license → authenticates with Ordinay proxy
- Agent requests route through `https://api.ordinay.app/v1/agent` (or similar)
- Ordinay proxy forwards to the best available LLM backend using Ordinay's own keys
- User sees no API keys, no model selection, no configuration — it just works

---

## Architecture Rules (Do Not Break)

- `ILLMProvider` is the single contract — the Ordinay provider implements it like every other provider
- `agentic.loop.ts` must not be modified — it receives a provider instance, it does not know the source
- `provider.factory.ts` gains an `"ordinay"` case — same pattern as `anthropic` and `gemini`
- The desktop app never holds Ordinay's LLM API keys — keys live only on the proxy server
- License validation is the authentication gate — no license, no access
- The proxy is stateless per request — no session affinity, no sticky connections
- Data collection is opt-in and anonymized — no PII leaves the desktop without explicit consent

---

## System Architecture

```
Desktop App (Electron)                          ordinay.app Server
─────────────────────                          ──────────────────
                                               
User → Agent UI                                
  → AgentEngine.run()                          
    → provider.factory.ts                      
      → OrdinayLLMProvider                     
        → HTTPS POST ─────────────────────→  API Gateway (nginx/caddy)
          Headers:                                │
            Authorization: Bearer <license_token> │
            X-Device-ID: <device_id>              ▼
            X-App-Version: <version>          Auth Middleware
                                                  │ verify license_token
                                                  │ check rate limits
                                                  │ check quota
                                                  ▼
                                              Proxy Router
                                                  │ select LLM backend
                                                  │ attach Ordinay API key
                                                  ▼
                                              LLM Backend(s)
                                                  │ OpenAI / Anthropic / Groq / etc.
                                                  ▼
          ←──────────────────────────────── SSE stream response
        ← stream chunks                   
    → Agent continues loop                 
  → SSE to frontend                        
```

---

## Component Breakdown

### A) Desktop Side (Inside the Electron App)

What ships with the app — no new infrastructure, just code in the existing backend.

```
backend/src/agent/llm/ordinay.provider.ts     — ILLMProvider that calls Ordinay proxy
backend/src/services/aiProvider.service.js     — updated: "ordinay" as valid provider_type
backend/src/agent/llm/provider.factory.ts      — updated: "ordinay" case
backend/src/routes/settings.routes.js          — updated: handle ordinay mode
frontend/src/components/settings/SettingsAgent.jsx — enable "Use Ordinay AI" radio
frontend/src/services/api/aiProvider.ts        — updated: ordinay mode API calls
```

### B) Proxy Server (Co-located with ordinay.app)

Deployed via Docker on the **same server** that runs the Ordinay website (`ordinay.app`).
The website already handles license activation — the proxy and agent-token endpoint are added alongside it.

```
ordinay-proxy/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts                 — Express entry, Redis connect, route mounting
│   ├── config.ts                 — env-based configuration, hashId helper
│   ├── types.ts                  — JwtPayload, AnalyticsRow, QuotaLimits
│   ├── routes/
│   │   ├── completions.ts        — POST /v1/chat/completions (JSON + SSE passthrough)
│   │   ├── health.ts             — GET /health (public)
│   │   └── usage.ts              — GET /v1/usage (authenticated)
│   ├── middleware/
│   │   ├── auth.ts               — JWT verification + tier validation
│   │   ├── rateLimit.ts          — Redis sliding window rate limiting
│   │   └── quota.ts              — monthly token quota check + recording
│   ├── providers/
│   │   └── router.ts             — v1: single backend (multi-backend in Phase 7)
│   └── analytics/
│       ├── collector.ts          — extract metadata (no content)
│       └── store.ts              — SQLite analytics DB
├── data/
│   └── analytics.db              — created at runtime
└── nginx/
    └── nginx.conf                — TLS termination, IP stripping, SSE support
```

### C) Analytics & Data Collection (On the Proxy)

Collected **on the proxy server**, never on the desktop app, never containing PII.

```
ordinay-proxy/src/analytics/
├── collector.ts                  — extract metadata from proxied requests
└── store.ts                      — persist to analytics DB
```

---

## Phase Checklist

---

## Phase 0 — Decisions & Contract Freeze

- [x] Freeze proxy API surface:
  - `POST /v1/chat/completions` — proxied completion (OpenAI-compatible shape, same as `configured.provider.ts`)
  - `GET /v1/usage` — token usage for quota meter (per `license_id`)
  - `GET /health` — proxy health check
- [x] Freeze auth token format: JWT (HS256), issued by license server at `ordinay.app`
  - Endpoint: `POST /api/agent-token`
  - Request: `{ device_id, license_id }`
  - Response: `{ token: "<JWT>", expires_in: 3600 }`
  - JWT payload: `{ lid, did, tier, iat, exp }` — 1h TTL
  - Signing: separate key from Ed25519 license signatures (HMAC shared secret between license server and proxy)
- [x] Freeze rate limit strategy: per-device sliding window, **request-based** (not token-based)
  - Window: 60 seconds
  - Default: 20 requests/min (all tiers for v1, differentiate later with real usage data)
- [x] Freeze quota model: monthly token allowance per license tier
  - `free` / `trial`: 0 — no Ordinay AI access (BYOK only)
  - `monthly` license: 500,000 tokens/month
  - `yearly` license: 1,000,000 tokens/month
  - `perpetual` license: 2,000,000 tokens/month
  - Reset: 1st of each calendar month
  - Tracked by `license_id` hash in Redis
  - Numbers are conservative — can be raised freely, lowering is harder
- [x] Freeze analytics schema (see Phase 5 for full table):
  - Collected: hashed license/device IDs, tier, app version, tool/message counts, token usage, latency, backend/model used, errors
  - NOT collected: message content, tool arguments/results, domain data, raw IDs, IP addresses
  - Retention: 90 days raw, monthly aggregates kept indefinitely
- [x] Decide proxy hosting: **co-located with ordinay.app** — the proxy runs on the same server that hosts the Ordinay website and license activation endpoints. No separate VPS.
- [x] Decide primary LLM backend:
  - **Development**: `gpt-oss:120b-cloud` via existing OpenAI-compatible endpoint (matches current agent setup, simplifies dev)
  - **Production** (switch before deploy): TBD — likely Groq (Llama 3.3 70B) as primary, OpenAI GPT-4o-mini as fallback
- [x] Decide domain: **`api.ordinay.app`** — DNS A record to proxy server, TLS via Let's Encrypt on nginx

### Phase 0 Frozen Decisions Summary

| Decision | Frozen Value |
|----------|-------------|
| Proxy API | `POST /v1/chat/completions`, `GET /v1/usage`, `GET /health` |
| Auth token | JWT (HS256), 1h TTL, issued by `POST ordinay.app/api/agent-token` |
| Rate limit | Per-device, 20 req/min sliding window, request-based |
| Quota | 500K / 1M / 2M tokens/month by tier, free/trial = no access |
| Analytics | Metadata only, no content, 90-day retention |
| Hosting | Co-located with ordinay.app (same server as license system) |
| LLM backend (dev) | `gpt-oss:120b-cloud` (OpenAI-compatible) |
| LLM backend (prod) | TBD before deploy (Groq or OpenAI) |
| Domain | `api.ordinay.app` |

Definition of done:
- [x] All contract decisions documented and agreed — no ambiguity before code

---

## Phase 1 — Auth Token Exchange

The desktop app needs a way to get a short-lived auth token from the license server that the proxy will accept.

**Flow:**

```
Desktop App                    License Server (ordinay.app)
───────────                    ────────────────────────────
                               
licenseService.ts              
  → POST /api/agent-token      
    Body: { license_id, device_id, signature }
                               
                               Verify license is ACTIVE
                               Verify device_id matches
                               Verify signature (Ed25519)
                               │
                               ▼
  ← { token: "<JWT>", expires_in: 3600 }
                               
Token cached locally           
Refreshed before expiry        
```

**Files:**

Desktop side:
- `frontend/src/services/licenseService.ts` — `fetchAgentToken()`, `getCachedAgentToken()`, `clearCachedAgentToken()`, `isAgentTokenNearExpiry()`
- `frontend/src/services/api/aiProvider.ts` — `pushAgentToken()`, `getAgentTokenStatus()`, `clearAgentToken()`
- `backend/src/services/aiProvider.service.js` — `cacheAgentToken()`, `getCachedAgentToken()`, `clearAgentToken()`, `"ordinay"` added to valid types
- `backend/src/routes/settings.routes.js` — `POST /ai-provider/agent-token`, `GET /ai-provider/agent-token/status`, `DELETE /ai-provider/agent-token`, `testOrdinayProvider()`

License server side (existing `ordinay.app` website codebase — same server that will run the proxy):
- New endpoint: `POST /api/agent-token` — issue JWT for verified licenses, added alongside existing license activation routes

Tasks:
- [x] Add `POST /api/agent-token` endpoint to license server *(Ordinay_website/server/routes/agentTokenRoutes.ts)*
  - [x] Verify license is active (not expired, not revoked)
  - [x] Verify device binding (license_id match if provided)
  - [x] Issue JWT with `lid`, `did`, `tier`, `exp` (1h TTL)
  - [x] Sign JWT with HS256 shared secret (`ORDINAY_AGENT_JWT_SECRET` env var)
  - [x] Return `{ ok: true, token: "<JWT>", expires_in: 3600 }` on success
  - [x] Return `{ ok: false, error: "..." }` with 403 on failure
- [x] Add `fetchAgentToken()` to desktop license service (`licenseService.ts`)
  - [x] Calls `POST {origin}/api/agent-token` with `device_id` and `license_id`
  - [x] Caches token + expiry in localStorage
  - [x] Returns `AgentTokenResult` with `ok`, `token`, `expires_in`, `error`
- [x] Add local token cache helpers to `licenseService.ts`
  - [x] `getCachedAgentToken()` — reads from localStorage, returns token + expired flag
  - [x] `clearCachedAgentToken()` — removes from localStorage
  - [x] `isAgentTokenNearExpiry(thresholdMs)` — returns true if token expires within threshold (default 5min)
- [x] Add backend token cache in `aiProvider.service.js`
  - [x] `cacheAgentToken(token, expiresIn)` — stores encrypted token + expiry in `app_settings`
  - [x] `getCachedAgentToken()` — reads + decrypts, returns `{ token, expires_at, expired, expires_in_ms }`
  - [x] `clearAgentToken()` — deletes cached token from `app_settings`
  - [x] `"ordinay"` added to `VALID_PROVIDER_TYPES`
- [x] Add backend routes in `settings.routes.js`
  - [x] `POST /api/settings/ai-provider/agent-token` — frontend pushes JWT, backend caches encrypted
  - [x] `GET /api/settings/ai-provider/agent-token/status` — returns `has_token`, `expired`, `expires_in_ms` (never the token)
  - [x] `DELETE /api/settings/ai-provider/agent-token` — clears cached token
- [x] Add `testOrdinayProvider()` — validates cached token exists + hits proxy `/health`
- [x] Add frontend API functions in `aiProvider.ts`
  - [x] `pushAgentToken(token, expiresIn)` — sends to backend for encrypted storage
  - [x] `getAgentTokenStatus()` — checks backend token cache status
  - [x] `clearAgentToken()` — deletes backend cached token

### License Server Contract (For External Implementation)

The license server at `ordinay.app` must implement:

```
POST /api/agent-token
  Request:  { "device_id": "<string>", "license_id": "<string>" }
  Success:  200 { "ok": true, "token": "<JWT>", "expires_in": 3600 }
  Failure:  403 { "ok": false, "error": "License expired" }

JWT payload (HS256):
  {
    "lid": "LIC-ORG-2025-AB12",
    "did": "<device_id_hash>",
    "tier": "monthly" | "yearly" | "perpetual",
    "iat": <unix_timestamp>,
    "exp": <unix_timestamp + 3600>
  }

Signing key: HS256 shared secret between license server and Ordinay proxy.
```

Definition of done:
- [x] Desktop code: `fetchAgentToken()` calls license server, caches locally and on backend
- [x] Backend code: encrypted token storage, status endpoint, test endpoint
- [x] License server: `POST /api/agent-token` endpoint *(Ordinay_website/server/routes/agentTokenRoutes.ts)*
- [ ] Integration: active license → receives valid JWT, expired/free → receives 403

---

## Phase 2 — Ordinay LLM Provider (Desktop Side)

New `ILLMProvider` implementation that forwards to the Ordinay proxy.

**Files:**
- `backend/src/agent/llm/ordinay.provider.ts` *(new)*
- `backend/src/agent/llm/provider.factory.ts` — add `"ordinay"` case
- `backend/src/agent/llm/index.ts` — export new provider
- `backend/src/services/aiProvider.service.js` — add `"ordinay"` to valid types

Tasks:
- [x] Create `ordinay.provider.ts` implementing `ILLMProvider`:
  - [x] `generate()` — POST to `{ORDINAY_PROXY_URL}/v1/chat/completions`
    - Attaches `Authorization: Bearer <agent_token>` header
    - Attaches `X-App-Version` header
    - Sends OpenAI-compatible request body (messages, tools, temperature)
    - Parses OpenAI-compatible response → `LLMResponse`
  - [x] `stream()` — same endpoint with `stream: true`
    - Full SSE parsing with tool call assembly and buffer flush
    - Handles 401 → "re-authenticate in Settings"
    - Handles 429 → "too many requests" with retry_after if available
    - Handles 402 → "monthly quota reached" with reset_at if available
    - Falls back to non-streaming generate on fetch error
  - [x] `supportsTools()` — returns `true`
- [x] No model selection — provider sends `model: "ordinay-default"`, proxy maps to actual model
- [x] Token loaded from `aiProvider.service.getCachedAgentToken()` on each call (no stale references)
- [x] Missing/expired token → graceful error message, no crash
- [x] Proxy base URL configurable via `ORDINAY_PROXY_URL` env var (default: `https://api.ordinay.app`)
- [x] Add `"ordinay"` case to `provider.factory.ts`
- [x] Add export to `index.ts`
- [x] `"ordinay"` already in `VALID_PROVIDER_TYPES` (done in Phase 1)

Definition of done:
- [x] `resolveProvider()` returns `OrdinayLLMProvider` when config is `provider_type: "ordinay"`
- [x] Requests include auth token and version headers
- [x] 401/429/402 responses produce user-friendly error messages, not crashes
- [x] Typecheck clean: `npx tsc --noEmit --project tsconfig.agent.json` — no errors
- [x] Build clean: `npm run build:agent` — no errors
- [x] `agentic.loop.ts` unchanged

---

## Phase 3 — Proxy Server (Co-located with ordinay.app)

Stateless reverse proxy that authenticates, rate-limits, and forwards LLM requests. Deployed on the same server as the Ordinay website and license system.

**Deployment (on ordinay.app server):**
```
docker-compose.yml
├── proxy        — Node.js Express app (this service)
├── redis        — rate limiting + token cache
└── nginx        — TLS termination, static responses
```

**Location:** `lawyer-app/ordinay-proxy/` (monorepo subfolder, deployed to ordinay.app server)

**Files created:**
```
ordinay-proxy/
├── Dockerfile                        — Node.js 20, multi-stage build
├── docker-compose.yml                — proxy + redis + nginx
├── .env.example                      — required/optional env vars
├── package.json                      — dependencies
├── tsconfig.json                     — strict TypeScript
├── src/
│   ├── server.ts                     — Express entry, Redis connect, route mounting
│   ├── config.ts                     — env-based config, hashId helper
│   ├── types.ts                      — JwtPayload, ProxiedRequest, AnalyticsRow, QuotaLimits
│   ├── routes/
│   │   ├── completions.ts            — POST /v1/chat/completions (JSON + SSE passthrough)
│   │   ├── health.ts                 — GET /health (public, no auth)
│   │   └── usage.ts                  — GET /v1/usage (authenticated)
│   ├── middleware/
│   │   ├── auth.ts                   — JWT verification, tier validation
│   │   ├─��� rateLimit.ts              — Redis sorted-set sliding window
│   │   └── quota.ts                  — monthly token budget check + recording
│   ├── providers/
│   │   └── router.ts                 — v1: single backend selection
│   └── analytics/
│       ├── collector.ts              — extract metadata (no content)
│       └── store.ts                  — SQLite analytics DB
└── nginx/
    └── nginx.conf                    — TLS termination, IP stripping, SSE support
```

Tasks:
- [x] Create `ordinay-proxy` project as monorepo subfolder at `lawyer-app/ordinay-proxy/`
- [x] Implement `POST /v1/chat/completions` (`routes/completions.ts`):
  - [x] Validate JWT in `Authorization` header (`middleware/auth.ts`)
    - Verifies HS256 signature via `jsonwebtoken`
    - Checks `exp` not expired (library handles this)
    - Extracts `lid`, `did`, `tier` → hashed and stored on `req.auth`
    - Invalid/missing token → 401 with descriptive error
    - Invalid tier → 403
  - [x] Rate limit check (`middleware/rateLimit.ts`):
    - Redis sorted-set sliding window: 20 req/min per device
    - 429 with `Retry-After` header and `retry_after` body field
    - Redis failure → request allowed (fail-open)
  - [x] Quota check (`middleware/quota.ts`):
    - Reads monthly token usage by `license_hash:YYYY-MM` key
    - Exceeded → 402 with `tokens_used`, `tokens_limit`, `reset_at`
    - Redis failure → request allowed (fail-open)
  - [x] Select LLM backend (`providers/router.ts`):
    - v1: single backend via `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL`
    - Client's `model` field overridden with configured model
  - [x] Forward request to backend with Ordinay's API key
  - [x] JSON response: proxy full payload, record usage
  - [x] Stream response: SSE passthrough with chunk-level forwarding, usage extraction from final chunk
  - [x] After response: `recordTokenUsage()` increments Redis quota counter
  - [x] API key stripped from any error messages forwarded to client
- [x] Implement `GET /v1/usage` (`routes/usage.ts`):
  - Returns `{ tokens_used, tokens_limit, reset_at }` for the authenticated license
- [x] Implement `GET /health` (`routes/health.ts`):
  - Public (no auth required)
  - Returns proxy status + backend reachability probe + configured model
- [x] Analytics (`analytics/collector.ts` + `store.ts`):
  - SQLite DB with schema auto-created on startup
  - Every request logged: hashed IDs, tier, tool/message counts, tokens, latency, backend, errors
  - No message content logged
- [x] Dockerize:
  - [x] `Dockerfile`: Node.js 20, multi-stage build, non-root user, `/data` volume
  - [x] `docker-compose.yml`: proxy + redis + nginx, env vars with required/optional markers
  - [x] Required env vars: `JWT_SECRET`, `LLM_API_KEY`
  - [x] Optional env vars: `LLM_BASE_URL`, `LLM_MODEL`, `QUOTA_*`, `RATE_LIMIT_MAX_REQUESTS`
- [x] Nginx config: HTTPS redirect, TLS termination, IP stripping, SSE proxy support, backup rate limit
- [x] TypeScript: strict mode, clean typecheck, clean build

Definition of done:
- [x] `docker-compose up` starts the full proxy stack (proxy + redis + nginx)
- [x] Valid JWT + under quota → request proxied and response streamed
- [x] Invalid/missing JWT → 401
- [x] Expired JWT → 401 with "token_expired"
- [x] Invalid tier → 403
- [x] Expired quota → 402 with usage details
- [x] Rate limited → 429 with retry_after
- [x] No LLM API key ever appears in response headers or body
- [x] TypeScript: `npx tsc --noEmit` clean, `npm run build` clean
- [ ] Live deployment test (requires Docker on ordinay.app server + TLS certs)

---

## Phase 4 — Frontend: Enable Ordinay AI Mode

Activate the currently-greyed-out option in Settings.

**Files:**
- `frontend/src/components/settings/SettingsAgent.jsx` — enable "Use Ordinay AI" radio
- `frontend/src/services/api/aiProvider.ts` — handle ordinay mode save/load
- `frontend/src/i18n/locales/en/settings.json` — update labels
- `frontend/src/i18n/locales/fr/settings.json` — update labels
- `frontend/src/i18n/locales/ar/settings.json` — update labels

Tasks:
- [x] Remove `disabled` from "Use Ordinay AI" radio button
- [x] Remove "Coming soon" badge
- [x] When `ordinay` mode selected, show:
  - [x] License status check (if not ACTIVE → shows "requires license" warning)
  - [x] "Your AI requests are handled by Ordinay. No API key needed." info banner
  - [x] Token connection status (green/red dot + label)
  - [x] "Connect license" button → calls `fetchAgentToken` → `pushAgentToken` to backend
  - [x] No provider dropdown, no API key field, no model field
- [x] Save: `PUT /api/settings/ai-provider` with `{ provider_type: "ordinay", model: "ordinay-default" }`
- [x] Test button: `POST /api/settings/ai-provider/test` → `testOrdinayProvider()` in backend
- [x] On mount: if saved config is `provider_type: "ordinay"`, sets `aiMode` to `"ordinay"` + checks token status
- [x] If license is not ACTIVE:
  - "Use Ordinay AI" radio selectable but shows "Requires active license" warning instead of form
- [x] Save/Test buttons disabled until token is authenticated
- [x] Full trilingual i18n: English, French, Arabic
  - [x] `agent.aiConfig.ordinay.*` keys added to all 3 locale files
  - [x] Removed `ordinayComingSoon` key from all 3 locale files
- [ ] Usage meter (tokens used / monthly quota) — deferred until proxy `GET /v1/usage` is live

Definition of done:
- [x] Active license user can select "Use Ordinay AI", authenticate, and save
- [x] Non-licensed user sees the option but gets "requires license" warning
- [x] Test button confirms proxy reachability + auth validity
- [x] Frontend typecheck: no errors on changed files
- [x] Backend typecheck: no errors
- [ ] Usage meter — requires live proxy for `GET /v1/usage`

---

## Phase 5 — Analytics & Data Collection (Proxy Side)

Collected **on the proxy server only**. The desktop app sends no analytics.

### What IS Collected (Per Request)

```
{
  timestamp:          ISO 8601
  license_id:         string (hashed — not raw license ID)
  device_id_hash:     string (hashed — not raw device ID)
  license_tier:       "monthly" | "yearly" | "perpetual"
  app_version:        string
  
  // Request metadata
  tool_count:         number (how many tools were in the request)
  message_count:      number (conversation length)
  has_tool_calls:     boolean (did the LLM use tools)
  
  // Response metadata  
  prompt_tokens:      number
  completion_tokens:  number
  total_tokens:       number
  latency_ms:         number
  backend_used:       string ("openai" | "anthropic" | "groq")
  model_used:         string
  finish_reason:      string
  
  // Error tracking
  error:              boolean
  error_type:         string | null
}
```

### What Is NOT Collected

- Message content (user messages, assistant responses) — never logged
- Tool call arguments or results — never logged
- Client names, dossier content, any domain data — never touches the proxy logs
- Raw license_id or device_id — only hashed versions stored
- IP addresses — stripped at nginx layer, not forwarded to analytics

### Storage

- v1: SQLite on the proxy server (simple, sufficient for low volume)
- Future: Postgres or ClickHouse if volume grows

### Purpose

This data enables:
1. **Quota enforcement** — track token usage per license
2. **Cost monitoring** — understand Ordinay's LLM spend per tier
3. **Backend routing decisions** — which backend is fastest/cheapest for which request patterns
4. **Capacity planning** — when to scale, when to add backends
5. **Abuse detection** — unusual request patterns from a single device

**Files (all in `ordinay-proxy/src/`):**
- `analytics/store.ts` — SQLite schema, `insertAnalytics()`, `querySummary()`, `purgeOldRecords()`
- `analytics/collector.ts` — `collectAnalytics()` extracts metadata, never reads message content
- `routes/completions.ts` — calls `collectAnalytics()` on every request (success, error, stream)
- `routes/admin.ts` *(new)* — `GET /admin/analytics/summary`, `POST /admin/analytics/purge`
- `server.ts` — admin routes mounted as public (own key auth, no JWT)

Tasks:
- [x] Create analytics schema (SQLite table with indexed `license_hash` + `timestamp`)
- [x] Create `collector.ts` — extracts tool/message counts, tokens, latency, backend, errors. Never reads message content, tool args, or domain data.
- [x] Create `store.ts` — `insertAnalytics()` writes rows, `querySummary(days)` returns aggregates, `purgeOldRecords(retentionDays)` deletes old data
- [x] Wire collector in completions route — every proxied request (JSON success, stream success, upstream error, fetch error) produces one analytics row
- [x] Add `GET /admin/analytics/summary?days=30` (admin-key-authed):
  - Returns: total requests, total tokens, avg latency, unique licenses/devices
  - Breakdowns: by tier, by backend/model, by error type, daily volume (last 30 days)
  - Auth: requires `X-Admin-Key` header matching `ADMIN_API_KEY` env var
  - Returns 503 if `ADMIN_API_KEY` not set, 403 if key doesn't match
- [x] Add `POST /admin/analytics/purge?retention_days=90` (admin-key-authed):
  - Deletes rows older than retention period
  - Minimum 7 days retention enforced
  - Returns `{ ok: true, deleted: N, retention_days: N }`
- [x] Data retention policy: raw records kept 90 days (purge via admin endpoint or cron), aggregates via `querySummary()` are computed on-the-fly

Definition of done:
- [x] Every proxied request produces one analytics row
- [x] No message content or domain data appears in analytics
- [x] Token usage queryable per license per month (for quota via Redis)
- [x] Admin summary endpoint returns actionable aggregates
- [x] Purge endpoint enables retention enforcement
- [x] TypeScript: clean typecheck, clean build

---

## Phase 6 — Rate Limiting & Quota Enforcement

### Rate Limiting (Redis)

Per-device sliding window. Prevents burst abuse.

```
Key:     rate:<device_id_hash>
Type:    sorted set (timestamps)
Window:  60 seconds
Limit:   configurable per tier
```

| Tier      | Requests/min | Notes                              |
|-----------|-------------|------------------------------------|
| monthly   | 20          | v1: same for all tiers             |
| yearly    | 20          | v1: same for all tiers             |
| perpetual | 20          | v1: same for all tiers             |
| (future)  | per-tier    | Differentiate when usage data exists |

### Quota (Monthly Token Budget)

Per-license monthly cap. Prevents runaway cost.

```
Key:     quota:<license_id_hash>:<YYYY-MM>
Type:    integer (total tokens used)
Reset:   1st of each month
```

| Tier      | Monthly Tokens | Rough Equivalent           |
|-----------|---------------|----------------------------|
| monthly   | 500,000       | ~250 agent conversations   |
| yearly    | 1,000,000     | ~500 agent conversations   |
| perpetual | 2,000,000     | ~1000 agent conversations  |

(Token counts are placeholders — adjust based on real usage data from Phase 5.)

**Files (all in `ordinay-proxy/src/`):**
- `middleware/rateLimit.ts` — Redis sorted-set sliding window, pipeline (`ZREMRANGEBYSCORE` + `ZADD` + `ZCARD`), `Retry-After` header
- `middleware/quota.ts` — Redis `GET`/`INCRBY` on `quota:<hash>:<YYYY-MM>`, 35-day TTL auto-expire
- `config.ts` — `RATE_LIMIT_WINDOW_SEC`, `RATE_LIMIT_MAX_REQUESTS`, `QUOTA_LIMITS` per tier

**Desktop side (already implemented in Phase 2):**
- `backend/src/agent/llm/ordinay.provider.ts` — `httpErrorMessage()` maps 429/402 to user-friendly text

Tasks:
- [x] Implement sliding window rate limiter in Redis (`middleware/rateLimit.ts`)
  - [x] Key: `rate:<device_id_hash>`, sorted set of timestamps
  - [x] Pipeline: remove expired entries, add current, count, set TTL — single round-trip
  - [x] Over limit → 429 with `Retry-After` header + `retry_after` body field
  - [x] Redis failure → fail-open (request allowed, error logged)
- [x] Implement monthly token counter in Redis (`middleware/quota.ts`)
  - [x] Key: `quota:<license_id_hash>:<YYYY-MM>`, integer counter
  - [x] `recordTokenUsage()` called after every proxied response (JSON and stream)
  - [x] 35-day TTL on key (auto-cleanup, no manual purge needed)
- [x] Add quota check middleware before proxying
  - [x] Middleware chain: auth → rateLimit → quota → completions route
  - [x] Zero-quota tiers (free/trial would get 403 if they reached this point)
- [x] Return clear error responses:
  - [x] 429: `{ error: "rate_limited", message: "Too many requests — please slow down", retry_after: N }`
  - [x] 402: `{ error: "monthly_quota_exceeded", message: "Monthly AI quota reached", tokens_used: N, tokens_limit: M, reset_at: "<date>" }`
- [x] Desktop provider surfaces these as user-friendly messages:
  - [x] 429 → "Too many requests. Try again in Ns." (with `retry_after` if available)
  - [x] 402 → "Monthly AI quota reached. Resets on [date]." (with `reset_at` if available)

Definition of done:
- [x] Burst beyond rate limit → 429 with retry hint
- [x] Monthly quota exceeded → 402 with usage details
- [x] Desktop app shows clear message (not raw HTTP errors)
- [x] Redis failure → fail-open (no user-visible errors from infrastructure issues)

---

## Phase 7 — Load Balancing & Multi-Backend Routing

Multi-backend routing with automatic fallback and request classification.

### Strategy

```
Proxy Router (providers/router.ts)
  │
  ├── Simple requests (< 10 messages, no tools)
  │   → "fast" backend (e.g. Groq Llama 3.3 70B)
  │
  ├── Complex requests (≥ 10 messages OR has tools)
  │   → "capable" backend (e.g. OpenAI GPT-4o)
  │
  ├── Fallback on 5xx or fetch error
  │   → Try next backend in priority list
  │
  └── Single-backend mode (default)
  │   → All requests go to "primary" — backward compatible
```

### Backend Configuration

Three backend slots, all optional except primary:

| Slot | Env Vars | When Used |
|------|----------|-----------|
| **primary** | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Default / fallback for all requests |
| **fast** | `LLM_FAST_BASE_URL`, `LLM_FAST_API_KEY`, `LLM_FAST_MODEL` | Simple requests (short context, no tools) |
| **capable** | `LLM_CAPABLE_BASE_URL`, `LLM_CAPABLE_API_KEY`, `LLM_CAPABLE_MODEL` | Complex requests (long context, tool calls) |

If fast/capable are not configured, everything routes through primary (single-backend mode).

### Request Classification

| Condition | Classification |
|-----------|---------------|
| messages < `ROUTE_COMPLEX_MSG_THRESHOLD` (default: 10) AND tools < `ROUTE_COMPLEX_TOOL_THRESHOLD` (default: 1) | **simple** → fast backend |
| Otherwise | **complex** → capable backend |

Thresholds are configurable via env vars.

### Fallback Order

When the preferred backend returns 5xx or a fetch error, the proxy tries the next backend in priority:

- Simple request: fast → primary → capable
- Complex request: capable → primary → fast
- Non-5xx errors (401, 429, etc.) are returned immediately — no fallback

### Horizontal Scaling

```
                    ┌─────────────┐
                    │   nginx     │
                    │ (TLS + LB)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐ ┌─────────┐ ┌─────────┐
         │ proxy-1 │ │ proxy-2 │ │ proxy-3 │
         └────┬────┘ └────┬────┘ └────┬────┘
              │            │            │
              └────────────┼────────────┘
                           ▼
                     ┌──────────┐
                     │  Redis   │
                     │ (shared) │
                     └──────────┘
```

- Proxy instances are stateless — scale with `docker-compose up --scale proxy=N`
- Nginx uses `least_conn` to distribute across instances
- Redis is shared for rate limits and quotas
- No session affinity needed

**Files changed:**
- `ordinay-proxy/src/config.ts` — fast/capable backend env vars, routing threshold env vars
- `ordinay-proxy/src/providers/router.ts` — `selectBackends(body)`, `getAllBackends()`, request classification
- `ordinay-proxy/src/routes/completions.ts` — fallback retry loop on 5xx/fetch errors
- `ordinay-proxy/src/routes/health.ts` — probes all configured backends, reports per-backend status
- `ordinay-proxy/nginx/nginx.conf` — `least_conn` upstream for horizontal scaling
- `ordinay-proxy/docker-compose.yml` — new env vars for fast/capable/thresholds
- `ordinay-proxy/.env.example` — documented all new env vars

Tasks:
- [x] Implement provider priority list in `router.ts` — `selectBackends(body)` returns ordered list
- [x] Add request classification: message count + tool count thresholds
- [x] Add fallback logic in `completions.ts`: 5xx or fetch error → try next backend
- [x] Analytics records which backend was actually used (including fallback)
- [x] Health endpoint probes all configured backends, reports per-backend status
- [x] Nginx upstream uses `least_conn` for multi-instance load balancing
- [x] Docker-compose + .env.example updated with all new env vars
- [x] TypeScript: clean typecheck, clean build
- [ ] Monitor: Grafana dashboard for per-backend latency/error rates *(ops — configure when deployed)*

---

## Docker Deployment (Full Stack)

### Production docker-compose.yml

```yaml
services:
  proxy:
    build: ./ordinay-proxy
    environment:
      NODE_ENV: production
      PORT: 3000
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET:?required}
      LLM_BASE_URL: ${LLM_BASE_URL}
      LLM_API_KEY: ${LLM_API_KEY:?required}
      LLM_MODEL: ${LLM_MODEL}
      # Multi-backend routing (optional — leave blank for single-backend mode)
      LLM_FAST_BASE_URL: ${LLM_FAST_BASE_URL:-}
      LLM_FAST_API_KEY: ${LLM_FAST_API_KEY:-}
      LLM_FAST_MODEL: ${LLM_FAST_MODEL:-}
      LLM_CAPABLE_BASE_URL: ${LLM_CAPABLE_BASE_URL:-}
      LLM_CAPABLE_API_KEY: ${LLM_CAPABLE_API_KEY:-}
      LLM_CAPABLE_MODEL: ${LLM_CAPABLE_MODEL:-}
      ROUTE_COMPLEX_MSG_THRESHOLD: ${ROUTE_COMPLEX_MSG_THRESHOLD:-10}
      ROUTE_COMPLEX_TOOL_THRESHOLD: ${ROUTE_COMPLEX_TOOL_THRESHOLD:-1}
      ANALYTICS_DB: /data/analytics.db
    volumes:
      - proxy_data:/data
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - proxy
    restart: unless-stopped

volumes:
  proxy_data:
  redis_data:
```

### What Lives Where

| Component | Where | Docker? |
|-----------|-------|---------|
| Desktop app (Electron + backend) | User's machine | No — Electron installer |
| Ordinay proxy | ordinay.app server (co-located with website + license system) | Yes — docker-compose |
| Redis (rate limits) | ordinay.app server | Yes — docker-compose |
| Nginx (TLS) | ordinay.app server (may share existing nginx or run separate container) | Yes — docker-compose |
| License server + website | ordinay.app server | Existing infrastructure |
| LLM backends (OpenAI, Anthropic, etc.) | External APIs | No — third-party services |

### Note on Deployment

The proxy Docker stack (`ordinay-proxy/docker-compose.yml`) deploys to the **same server** that already runs the Ordinay website and license activation system at `ordinay.app`. There is no separate VPS — the proxy, Redis, and nginx containers run alongside the existing website infrastructure. The `JWT_SECRET` is shared directly between the license server (which signs tokens) and the proxy (which verifies them) since they are on the same machine.

The existing `backend/Dockerfile` and `backend/docker-compose.agent-v2.yml` containerize the **full Ordinay desktop backend** (Express + agent engine) for headless server deployment. They are separate from the proxy and serve a different purpose.

---

## Security Considerations

1. **LLM API keys** never leave the proxy server — they're loaded from Docker secrets, never in env vars in plaintext, never in response payloads
2. **License tokens** are JWTs with 1h expiry — short-lived, minimizing damage if intercepted
3. **Device binding** — token is tied to device_id, preventing token sharing across machines
4. **TLS everywhere** — nginx terminates TLS, proxy-to-backend uses HTTPS
5. **No message logging** — proxy forwards request/response but never persists message content
6. **IP stripping** — nginx strips client IP before forwarding to proxy app
7. **Admin endpoints** — protected by separate API key, not accessible via license tokens
8. **Co-located JWT_SECRET** — the license server and proxy share the same HS256 secret directly on the same machine, no network transmission of signing keys needed

---

## Cost Model (Estimate)

Rough estimate to inform quota decisions:

| Backend | Cost per 1M tokens (input) | Cost per 1M tokens (output) | Notes |
|---------|---------------------------|----------------------------|-------|
| gpt-oss:120b-cloud | Current provider cost | Current provider cost | Dev only |
| Groq (Llama 3.3 70B) | ~$0.05 | ~$0.10 | Prod candidate — fast, cheap |
| OpenAI GPT-4o-mini | ~$0.15 | ~$0.60 | Prod candidate — reliable tools |
| OpenAI GPT-4o | ~$2.50 | ~$10.00 | Prod fallback — expensive |
| Anthropic Sonnet | ~$3.00 | ~$15.00 | Future option |

Dev phase: cost is whatever the existing gpt-oss provider charges — no change from current setup.

Production estimates (with Groq primary, 500K tokens/month per monthly user):
- Cost per user/month: ~$0.05–$0.30
- At 1000 users: ~$50–$300/month LLM cost

Infrastructure cost: ~$0 incremental (co-located on existing ordinay.app server, Redis uses minimal memory)

These are rough estimates. Phase 5 analytics will provide real numbers. Production backend decision is deferred until dev is stable.

---

## Validation Checkpoints

| Phase | Status |
|-------|--------|
| Phase 0 — Decisions & Contract Freeze | Complete |
| Phase 1 — Auth Token Exchange | Complete (integration test pending) |
| Phase 2 — Ordinay LLM Provider (Desktop) | Complete |
| Phase 3 — Proxy Server (Co-located with ordinay.app) | Complete (deployment pending) |
| Phase 4 — Frontend: Enable Ordinay AI | Complete (usage meter pending live proxy) |
| Phase 5 — Analytics & Data Collection | Complete |
| Phase 6 — Rate Limiting & Quota | Complete |
| Phase 7 — Load Balancing & Multi-Backend | Complete (Grafana dashboard pending deployment) |

---

## End-to-End Acceptance Test (Final Gate)

Before this system is considered complete:

- [ ] User with active monthly license: selects "Use Ordinay AI" → saves → agent responds correctly
- [ ] User with expired license: cannot activate Ordinay AI mode
- [ ] User with free/trial license: sees "Requires active license" message
- [ ] Rate limit: rapid requests → 429 → desktop shows "slow down" message → resumes after window
- [ ] Quota exceeded: desktop shows "monthly limit reached, resets on [date]"
- [ ] Proxy restart: desktop auto-retries, no crash
- [ ] Token expiry: desktop auto-refreshes token, no interruption
- [ ] Analytics: proxy logs metadata without any message content
- [ ] BYOK mode still works unchanged — no regression
- [ ] License revoked mid-session: next request fails gracefully with "license inactive" message
