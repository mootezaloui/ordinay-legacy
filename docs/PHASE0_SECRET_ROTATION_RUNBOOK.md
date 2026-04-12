# Phase 0 Secret Rotation Runbook

Purpose: complete Phase 0 external secret rotation and invalidation before publishing a clean public repository.

This runbook covers only operational rotation/invalidation. Source-code hardening and local scans are tracked separately.

## 1. Scope of Credentials to Rotate

- Provider/API keys:
  - `LANGSEARCH_API_KEY`
  - `GROQ_API_KEY`
  - `OPENROUTER_API_KEY`
  - Any other LLM/provider keys used in staging/production
- Application secrets:
  - `APP_SECRET` (backend encryption root)
  - `JWT_SECRET` (proxy signing/verification)
  - `ADMIN_API_KEY` (proxy admin endpoints)
  - `BACKEND_API_TOKEN` (when public bind/auth is enabled)
- Any deployment token used for update feeds, artifact signing, or CI/CD publishing

## 2. Rotation Order

1. Generate new secrets in a secure secret manager.
2. Update staging/production environments with new secrets.
3. Redeploy services that consume those secrets.
4. Revoke old secrets at provider side (do not only stop using them).
5. Verify old secrets are rejected.

Do not publish or mirror the new repo before step 5 is complete.

## 3. Provider Revocation Validation

Run each validation with the old key after revocation. Expected result: authentication failure (`401`/`403`).

Example (Groq):

```powershell
curl -s -o NUL -w "%{http_code}" https://api.groq.com/openai/v1/models -H "Authorization: Bearer <OLD_KEY>"
```

Record the result in `docs/pre_opensource.md` execution log.

## 4. Local Repository Safety Checks

After rotation, run from repository root:

```powershell
git grep -n -I -E "gsk_[A-Za-z0-9]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----"
```

```powershell
rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.venv/**' --glob '!**/.git/**' "gsk_[A-Za-z0-9]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----" .
```

Expected: no matches.

## 5. Runtime Smoke Check (post-rotation)

Confirm backend still boots with sanitized local env:

```powershell
npm --prefix backend run start
```

Expected: backend starts successfully with cleaned/local-safe values.

## 6. Sign-off Criteria for Phase 0

Phase 0 is complete only if all are true:

- Old provider keys are rejected by provider APIs.
- New secrets are active in all deployed environments.
- Local/working-tree and tracked-file scans show no secret leaks.
- Runtime smoke check passes.
- Evidence is logged in `docs/pre_opensource.md` execution log.
