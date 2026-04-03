# Agent v2 Production Runtime Checklist

## Startup
- [ ] `FEATURE_AGENT_V2_STREAM` explicitly set for intended rollout state.
- [ ] `FEATURE_AGENT_V2_SUGGESTIONS` explicitly set for intended suggestion rollout state.
- [ ] Deployment bootstrap passes with zero blocking errors at server start.
- [ ] Deprecated agent flags are disabled (warnings reviewed if any remain enabled).

## Environment
- [ ] `PORT`, `API_PREFIX`, `NODE_ENV`, and `DB_FILE` validated.
- [ ] DB directory is writable and points to persistent storage.
- [ ] `AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND=true` set only when non-loopback bind is required.

## Persistence and Audit
- [ ] SQLite file path is on persistent volume/storage.
- [ ] Audit persistence remains enabled and append-only path is reachable.
- [ ] Backup/restore procedure for SQLite file is documented and tested.

## Security and Limits
- [ ] Rate-limit configuration is set (`RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_MS`).
- [ ] Security hardening modules are enabled in runtime (`security` runtime loads cleanly).
- [ ] Feature flags and permission boundaries validated during startup.

## Memory, Retrieval, and Summarization
- [ ] Memory caps configured (`SESSION_CACHE_MAX`, `SUMMARY_CACHE_MAX`, `MEMORY_WARNING_HEAP_MB`).
- [ ] Retrieval thresholds configured (`RETRIEVAL_TOP_K`, `RETRIEVAL_MAX_CHARS`, score/chunk settings).
- [ ] Summarization thresholds configured (`SUMMARY_TRIGGER_TURNS`, `SUMMARY_MAX_TOKENS`).

## Observability
- [ ] Health and performance snapshot cadences configured.
- [ ] Log rotation policy active for backend logs.
- [ ] `turn_trace`, `health_snapshot`, and `performance_snapshot` audit events are observable.

## Networking and Runtime Safety
- [ ] Backend port is exposed only as required by environment.
- [ ] Public bind opt-in is disabled unless container/runtime requires it.
- [ ] Safe-mode rollback for v2 route is known: set `FEATURE_AGENT_V2_STREAM=false`.
- [ ] Suggestion-only rollback is known: set `FEATURE_AGENT_V2_SUGGESTIONS=false`.

## Health Verification
- [ ] `/api/ping` reachable and healthy after deployment.
- [ ] `/api/agent/v2/stream` behavior validated with a smoke turn when feature flag is on.
- [ ] Legacy routes remain untouched and operational.
