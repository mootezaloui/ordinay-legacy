# Suggestion Rollback Plan

## Objective

Provide a fast, low-risk rollback path for proactive suggestion behavior in Agent v2 without disabling the full v2 stream.

## Rollback Switch

- Primary switch: `FEATURE_AGENT_V2_SUGGESTIONS=false`
- Scope: disables proactive suggestion generation/enforcement and suggestion tool exposure to the model.
- Safety: keeps draft/plan core flows active.

## When to Roll Back

- Suggestion artifacts become noisy or irrelevant in production.
- Suggestion acceptance drops while dismissal spikes unexpectedly.
- Suggestion generation failures increase and trigger frequent fallback messaging.
- Support incidents indicate confusion from suggestion-first behavior.

## Execution Steps

1. Set `FEATURE_AGENT_V2_SUGGESTIONS=false` in runtime environment.
2. Redeploy/restart backend process.
3. Run smoke checks:
   - implicit draft phrase no longer emits `suggestion_artifact`
   - explicit draft/execute flows remain operational
   - no mutation side effects occur from suggestion paths
4. Monitor audit stream for:
   - disappearance of `suggestion_shown`
   - absence of `suggestion_failed`/`suggestion_fallback` churn

## Escalation Rollback

If wider v2 instability is detected, apply existing route rollback:

- `FEATURE_AGENT_V2_STREAM=false`

## Re-Enable Criteria

- Root cause identified and fixed.
- Phase 8 suggestion rollout tests pass.
- Controlled canary confirms stable suggestion telemetry trend.
