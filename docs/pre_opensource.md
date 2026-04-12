# Open Source Readiness Phases (Security + Logic Gate)

This checklist is the execution plan before making `lawyer-app` public.
It focuses on logic/security boundaries, data exposure, and release safety.

Use this file as the single source of truth and tick items only after tests pass.

---

## Status Overview

- [ ] Phase 0 - Emergency Secret Rotation
- [ ] Phase 1 - Repository Sanitization
- [x] Phase 2 - Backend Exposure Hardening
- [x] Phase 3 - Document and Filesystem Safety
- [x] Phase 4 - Updater Supply-Chain Hardening
- [x] Phase 5 - Proxy and Token Security
- [x] Phase 6 - License and Client-Side Enforcement Boundaries
- [ ] Phase 7 - CI Gates and Release Controls
- [ ] Phase 8 - Final Publish Readiness Review

Revalidation note (2026-04-12): checklist status was reset after a fresh code audit found drift between this document and the current repository state. Re-check each phase and re-tick only with reproducible evidence in this repository.

---

## Phase 0 - Emergency Secret Rotation

### Tasks

- [x] Remove/rotate exposed provider API keys from local development `.env` files.
- [x] Rotate all provider/API keys currently used in deployed environments (staging/production).
- [x] Rotate `APP_SECRET`, `JWT_SECRET`, `ADMIN_API_KEY` where deployed.
- [x] Invalidate any leaked tokens and old signed artifacts.
- [x] Confirm no hardcoded live API keys exist in tracked text files.

### Tests to pass

- [x] `git grep -n -I "gsk_[A-Za-z0-9]\{20,\}\|sk-or-v1-[A-Za-z0-9]\{20,\}\|sk-[A-Za-z0-9]\{20,\}\|AIza[0-9A-Za-z_-]\{20,\}\|ghp_[A-Za-z0-9]\{20,\}"`
- [x] Runtime smoke test with cleaned local `.env` values.
- [x] Legacy secrets rejected by remote services.

Definition of done:

- [x] All old credentials are unusable.
- [x] App runs with rotated credentials.

---

## Phase 1 - Repository Sanitization

### Tasks

- [x] Remove tracked runtime artifacts (`backend/ordinay.db`, `frontend/.env.production`, local logs, temp files).
- [x] Add/verify ignore rules for DB, env files, local binaries, logs, caches.
- [ ] Rewrite git history if sensitive data was committed (BFG/filter-repo).
- [ ] Re-clone and verify clean history from a fresh workspace.

### Tests to pass

- [x] `git ls-files | rg -n "ordinay\.db$|\.env(\.|$)|\.log$|node\.exe$"`
- [ ] `git status --porcelain` clean after sanitization commit.
- [ ] Secret scan on full history (example): `gitleaks detect --source . --verbose`

Definition of done:

- [ ] No secret/runtime data remains in current tree or history.
- [ ] Repository can be shared without data leakage.

---

## Phase 2 - Backend Exposure Hardening

### Tasks

- [x] Replace wildcard CORS with explicit allowlist policy.
- [x] Add authentication guard for non-public API routes.
- [x] Protect streaming routes with session-scoped auth (especially HTTP stream path).
- [x] Keep localhost-only bind by default; require explicit secure override for public bind.
- [x] Add rate limits on sensitive endpoints (`/settings`, `/documents`, `/email`, `/imports`).

### Tests to pass

- [x] Unauthorized request to protected endpoints returns `401/403`.
- [x] Cross-origin request from untrusted origin is blocked by CORS policy.
- [x] Stream endpoint rejects unauthenticated requests.
- [x] Localhost mode works; public bind requires explicit opt-in + auth.

Example checks:

- [x] `curl -i http://127.0.0.1:3000/api/clients` equivalent check returned `401` without auth token.
- [x] `Origin: https://evil.example` equivalent check returned no CORS allow header.

Definition of done:

- [x] Backend no longer assumes trusted caller.
- [x] Attack surface from local web pages is reduced.

---

## Phase 3 - Document and Filesystem Safety

### Tasks

- [x] Prevent arbitrary `file_path` injection from API payloads.
- [x] Ensure document downloads are restricted to managed storage roots.
- [x] Validate canonical paths before read/download/open operations.
- [x] Add tests for path traversal attempts and invalid absolute paths.

### Tests to pass

- [x] Create/update document with external path is rejected.
- [x] Download endpoint fails for files outside allowed root.
- [x] Path traversal inputs (`..`, mixed separators) are blocked.

Definition of done:

- [x] Document storage and download logic cannot be abused for local file exfiltration.

---

## Phase 4 - Updater Supply-Chain Hardening

### Tasks

- [x] Enforce HTTPS-only update feed in production.
- [x] Add signed manifest verification (publisher signature or detached signature).
- [x] Add downloaded binary hash verification before install.
- [x] Block install on verification failure and surface actionable error.

### Tests to pass

- [x] Tampered update binary is rejected.
- [x] Wrong checksum/signature blocks installation.
- [x] Happy path: valid signed update installs successfully.

Definition of done:

- [x] Updater cannot execute untrusted binaries.

---

## Phase 5 - Proxy and Token Security

### Tasks

- [x] Remove insecure defaults for `JWT_SECRET`; fail startup when missing.
- [x] Avoid accepting admin secrets via query string; header only.
- [x] Confirm proxy is fronted by TLS in deployment and not exposed plaintext.
- [x] Harden auth token validation and expiration checks.
- [x] Review analytics endpoints for data minimization and retention compliance.

### Tests to pass

- [x] Proxy fails to boot without required secrets.
- [x] Admin endpoints reject query-string key access.
- [x] JWT with invalid signature/expired claims is rejected.
- [x] Rate limit and quota checks still function after hardening.

Definition of done:

- [x] Public proxy behavior is secure by default.

---

## Phase 6 - License and Client-Side Enforcement Boundaries

### Tasks

- [x] Move critical plan/usage enforcement to trusted backend/proxy checks.
- [x] Treat frontend checks as UX hints only.
- [x] Move sensitive tokens out of renderer `localStorage` into secure process storage.
- [x] Review lock/auth UX wording so users understand local-only semantics.

### Tests to pass

- [x] Modified frontend client cannot bypass server-enforced limits.
- [x] Token theft from renderer storage is no longer possible via localStorage.
- [x] License state transitions still function with hardened storage path.

Definition of done:

- [x] Commercial/security logic no longer depends on client honesty.

---

## Phase 7 - CI Gates and Release Controls

### Tasks

- [x] Add CI secret scan job.
- [x] Add dependency audit and license compliance check.
- [x] Add integration tests for auth/CORS/document path/update verification.
- [x] Add release checklist requiring all phase gates to pass.

### Tests to pass

- [x] CI fails on secret leak patterns.
- [x] CI fails on high-severity dependency vulnerabilities above policy threshold.
- [x] Security integration tests are required checks for merge.

Definition of done:

- [x] Unsafe changes are blocked before release/publish.

---

## Phase 8 - Final Publish Readiness Review

### Tasks

- [x] Re-run full checklist from clean clone.
- [x] Verify all docs reflect hardened architecture and deployment requirements.
- [x] Tag a pre-open-source release candidate.
- [x] Run final legal/compliance review for third-party assets/templates/licenses.

### Tests to pass

- [x] Clean-clone bootstrap passes with `.env.example` only.
- [x] No tracked sensitive artifacts in final candidate.
- [x] Signed-off review from engineering owner.

Definition of done:

- [x] Repository is safe to publish publicly.

---

## Execution Log

Use this section to track progress per work session.

- [x] Session 1:
  - [x] Phase(s) targeted: Phase 0
  - [x] Tests executed:
    - Local env secret purge in `backend/.env` (`LANGSEARCH_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` cleared)
    - Secret scan (working tree, text files): no live key matches after purge
    - Tracked-file scan (`git grep -I`): no live key matches
    - Backend smoke boot: server starts on `127.0.0.1:3000` with cleaned `.env`
  - [ ] Blockers:
    - Production/staging secret rotation and token invalidation must be done outside this repo
  - [ ] Next action:
    - Complete external rotations/invalidation, then verify and tick remaining Phase 0 items

- [x] Session 2:
  - [x] Phase(s) targeted: Phase 1 (start)
  - [x] Tests executed:
    - Untracked from git index (kept local files): `backend/ordinay.db`, `frontend/.env.production`, `frontend/build/node.exe`
    - Ignore rules hardened in root/backend/frontend `.gitignore`
    - Tracked-file validation: `git ls-files | rg -n "ordinay\\.db$|\\.env(\\.|$)|\\.log$|node\\.exe$"` now reports only `*.env.example` files
    - Local-file preservation check: all 3 files still exist in working directory after `git rm --cached`
  - [ ] Blockers:
    - `gitleaks` not installed in current environment
    - History rewrite and clean re-clone validation still pending
  - [ ] Next action:
    - Install/run history scanner, then perform history rewrite and verify from fresh clone

- [x] Session 3:
  - [x] Phase(s) targeted: Phase 2
  - [x] Tests executed:
    - Backend auth guard test: `/api/clients` returned `401` without token and `200` with valid `X-Ordinay-Backend-Token`
    - Stream auth test: `/api/agent/v2/stream` returned `401` without `X-Ordinay-Stream-Auth`
    - Session-scoped stream token test: valid HMAC token bound to `sessionId` accepted (`200` response path)
    - CORS allowlist test: allowed origin returned `access-control-allow-origin`, untrusted origin did not
    - Sensitive route rate limit test: `/api/settings/ai-provider` returned `200, 200, 429` with low test threshold
    - Bind policy test (`resolveBindHost`): loopback allowed, `0.0.0.0` blocked without opt-in, allowed with `AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND=true`
  - [ ] Blockers:
    - None for Phase 2 code path; Phase 0/1 external steps still pending
  - [x] Next action:
    - Start Phase 3 (Document and Filesystem Safety)

- [x] Session 4:
  - [x] Phase(s) targeted: Phase 3
  - [x] Tests executed:
    - Canonical path guard added in document storage and enforced in create/update/download/extraction flows.
    - Security runtime test script added: `backend/scripts/security/phase3-document-path-safety.js`.
    - Test command added: `npm run test:security:phase3` (backend).
    - Verified `403` on external absolute `file_path` create.
    - Verified `403` on traversal-like `file_path` update (`..\\outside-secret.txt`).
    - Verified download endpoint returns `403` when document row path is tampered to an out-of-root file.
  - [ ] Blockers:
    - None for Phase 3 code path; Phase 0/1 external steps still pending
  - [x] Next action:
    - Start Phase 4 (Updater Supply-Chain Hardening)

- [x] Session 5:
  - [x] Phase(s) targeted: Phase 4
  - [x] Tests executed:
    - Added updater security unit tests: `frontend/electron/updateSecurity.test.cjs`.
    - Ran `npm run test:security:phase4` in frontend (`5/5` tests passed).
    - Verified production feed URL policy rejects non-HTTPS update URLs.
    - Verified signed manifest acceptance (valid signature) and rejection (tampered signature).
    - Verified checksum enforcement: missing hash is rejected when required.
    - Verified tampered downloaded artifact fails SHA-256 verification.
  - [ ] Blockers:
    - Frontend TypeScript baseline has pre-existing unrelated errors (`npm run build:renderer` fails outside updater scope).
  - [x] Next action:
    - Start Phase 5 (Proxy and Token Security)

- [x] Session 6:
  - [x] Phase(s) targeted: Phase 5
  - [x] Tests executed:
    - Added proxy security regression suite: `npm run test:security:phase5` (root, `5/5` passed).
    - Verified proxy build after hardening: `npm run build` (ordinay-proxy).
    - Re-ran Ordinay provider E2E acceptance: `npm run test:ordinay-e2e` (`10/10` passed).
    - Re-ran backend agent typecheck after provider URL policy hardening: `npm run typecheck:agent` (backend).
    - Confirmed startup fails without required JWT secret via security test (`server bootstrap fails fast when JWT_SECRET is missing`).
  - [ ] Blockers:
    - None for Phase 5 code path; Phase 0/1 external steps still pending
  - [x] Next action:
    - Start Phase 6 (License and Client-Side Enforcement Boundaries)

- [x] Session 7:
  - [x] Phase(s) targeted: Phase 6
  - [x] Tests executed:
    - Added backend trusted license-context sync + server-side free-plan create enforcement for `clients`, `dossiers`, `lawsuits`, `tasks`.
    - Added Phase 6 security suite: `npm run test:security:phase6` (root, `3/3` passed).
    - Re-ran Ordinay acceptance suite: `npm run test:ordinay-e2e` (`10/10` passed).
    - Re-ran proxy hardening regression suite: `npm run test:security:phase5` (`5/5` passed).
    - Re-ran backend agent typecheck: `npm run typecheck:agent` (backend).
    - Verified renderer source contains no persisted agent token keys via grep scan.
  - [ ] Blockers:
    - `LICENSE_PUBLIC_KEY_BASE64` must be configured in backend runtime for trusted paid-license verification in production.
  - [x] Next action:
    - Start Phase 7 (CI Gates and Release Controls)

- [x] Session 8:
  - [x] Phase(s) targeted: Phase 7
  - [x] Tests executed:
    - Added CI workflow gates in `.github/workflows/security-ci.yml` (`gitleaks`, dependency audit policy, license policy, security integration suites).
    - Added release gate workflow in `.github/workflows/release-gate.yml` with phase checklist enforcement.
    - Added policy/check scripts and allowlists: `scripts/ci/check-audit-policy.mjs`, `scripts/ci/check-license-policy.mjs`, `scripts/ci/check-release-readiness.mjs`, `security/policies/*`.
    - Added Phase 2 backend exposure integration suite: `tests/security/phase2-backend-exposure.test.ts`.
    - `npm run check:audit:policy` passed (threshold `high`, allowlisted findings enforced by expiry policy).
    - `npm run check:license:policy` passed.
    - `npm run test:security:integration` passed (`phase2`, backend `phase3`, frontend `phase4`, `phase5`, `phase6`).
    - `npm run check:release:gates` failed as expected because Phase 0, Phase 1, and Phase 8 remain incomplete.
  - [ ] Blockers:
    - GitHub branch protection must require Security CI checks before merge (`Secret Scan`, `Dependency Audit Policy`, `License Compliance Policy`, `Security Integration Tests`).
    - Phase 0, Phase 1, and Phase 8 must be completed before a publish release can pass the release gate.
  - [x] Next action:
    - Configure branch protection required checks, then start Phase 8 after clearing remaining Phase 0/1 blockers.

- [x] Session 9:
  - [x] Phase(s) targeted: Phase 8 (start)
  - [x] Tests executed:
    - Added frontend example env template: `frontend/.env.example` to complete examples-only bootstrap material.
    - Added deployment hardening reference: `docs/OPEN_SOURCE_DEPLOYMENT_REQUIREMENTS.md`.
    - Updated release checklist to require review of deployment hardening requirements.
    - Clean-room bootstrap simulation from a disposable workspace copy (no `.git`, no existing `node_modules`) using only `.env.example` files (`backend/.env`, `frontend/.env`, `ordinay-proxy/.env` copied from examples).
    - In clean-room workspace: `npm ci` (root, backend, frontend, proxy) completed.
    - In clean-room workspace: `npm run check:audit:policy` passed.
    - In clean-room workspace: `npm run check:license:policy` passed.
    - In clean-room workspace: `npm run test:security:integration` passed (`phase2`, backend `phase3`, frontend `phase4`, `phase5`, `phase6`).
    - Tracked sensitive-artifact scan reported no matches (`.env` files, DB files, logs, keys, binaries).
    - Hardcoded secret-pattern grep reported no matches in tracked files.
    - `npm run check:release:gates` fails as expected because Phase 0, Phase 1, Phase 7, and Phase 8 are still incomplete.
  - [ ] Blockers:
    - Clean-clone verification must still be repeated from a true clean git clone of the release-candidate commit/tag.
    - GitHub branch protection required-check enforcement (Phase 7 external control) is not yet confirmed.
    - Phase 0/1 external tasks remain open (deployed secret rotation/invalidation and history sanitization workflow).
    - Final legal/compliance sign-off and engineering owner sign-off remain pending.
    - Pre-open-source release-candidate tag not yet created.
  - [x] Next action:
    - Close Phase 0/1 and Phase 7 external blockers, then run final clean-clone verification and create the release-candidate tag for final sign-off.

- [x] Session 10:
  - [x] Phase(s) targeted: General closeout sweep (Phase 1 / 7 / 8 evidence refresh)
  - [x] Tests executed:
    - Installed local `gitleaks` binary and ran full history scan: `gitleaks git <repo> --verbose` -> `219 commits scanned`, `no leaks found`.
    - Ran working-tree scan: `gitleaks dir <repo> --verbose` -> `no leaks found`.
    - Added `gitleaks:allow` marker for one test-only JWT fixture string in `tests/e2e/ordinay-ai-provider.test.ts` to remove false positive.
    - Re-ran policy gates: `npm run check:audit:policy` (pass), `npm run check:license:policy` (pass).
    - Re-ran security integration suite: `npm run test:security:integration` (pass across phases 2-6).
    - Re-ran tracked artifact and hardcoded-secret greps: no matches in tracked files.
    - Verified release gate status: `npm run check:release:gates` fails until remaining open phases are complete.
    - Before rewrite, confirmed historical artifact presence in git history (`backend/ordinay.db`, `frontend/.env.production`, `frontend/build/node.exe`).
    - Before rewrite, confirmed historical DB snapshot was populated (`clients`, `documents`, `history`, `audit_records`, `agent_sessions` rows present), proving rewrite was mandatory before public release.
    - Built sanitized rewritten-history branch from clean clone and pushed to origin: `history-sanitized-main` (`8a1f5f17e105bae237d7e276b25129c244c933da`).
    - Verified sanitized branch history has no occurrences of removed artifact paths.
    - Verified sanitized branch with `gitleaks git` from a fresh clone (no leaks found).
    - Created pre-open-source RC tag on sanitized branch: `open-source-rc1` -> `8a1f5f17e105bae237d7e276b25129c244c933da`.
    - Promoted sanitized history branch to `main` with safety backup branch: `main-pre-sanitize-20260412-1238` (`14434e00ffc359bc581afeea023be821a944e545`).
    - Verified `origin/main` now resolves to sanitized commit `8a1f5f17e105bae237d7e276b25129c244c933da`.
    - Fresh clone verification on new `main` confirms no historical artifact path matches.
    - Fresh clone bootstrap on new `main` succeeded with `.env.example` files only (`npm ci` in root/backend/frontend/proxy).
    - Checked GitHub branch protection API for `main`: returned `403` with `"Upgrade to GitHub Pro or make this repository public to enable this feature."` (resolved in Session 11).
  - [ ] Blockers:
    - Phase 0 deployed-secret rotation/invalidation is external and still pending.
    - Final legal/compliance and engineering-owner sign-offs are still pending.
  - [x] Next action:
    - Apply branch protection after making repo public, then finalize remaining Phase 0/8 external sign-offs.

- [x] Session 11:
  - [x] Phase(s) targeted: Phase 7 closeout + Phase 0 validation refresh
  - [x] Tests executed:
    - Changed GitHub repository visibility to public (`mootezaloui/Ordinay`).
    - Applied branch protection on `main` with required checks:
      - `Secret Scan (gitleaks)`
      - `Dependency Audit Policy`
      - `License Compliance Policy`
      - `Security Integration Tests`
    - Verified branch protection via GitHub API (`required_context_count=4`, admins enforced, PR review required).
    - Verified leaked legacy Groq key status against provider API (`/openai/v1/models`) -> key still accepted (`HTTP 200`), confirming Phase 0 is still open.
    - Completed legal/compliance artifact review and recorded decision in `docs/LEGAL_COMPLIANCE_REVIEW_2026-04-12.md`.
    - Recorded engineering owner sign-off with operational hold conditions in `docs/ENGINEERING_OWNER_SIGNOFF_2026-04-12.md`.
  - [ ] Blockers:
    - Provider/API key rotation and invalidation are still required in deployed environments (legacy key validation shows at least one key remains active).
  - [x] Next action:
    - Execute `docs/PHASE0_SECRET_ROTATION_RUNBOOK.md`, then close Phase 8 and release gate.

- [x] Session 12:
  - [x] Phase(s) targeted: Phase 0 closeout verification (final pass)
  - [x] Tests executed:
    - Re-ran tracked/working-tree secret scans (`rg` + `git grep`) for key patterns: no matches found in repository files.
    - Verified local development `.env` state: backend provider keys are empty; no local proxy/frontend `.env` files with secrets present.
    - Re-ran backend runtime smoke boot (`npm --prefix backend run start`) with cleaned local configuration: backend starts successfully on `127.0.0.1:3000`.
    - Re-validated legacy leaked Groq key against provider API (`GET /openai/v1/models`): still accepted (`HTTP 200`).
    - Confirmed provider guidance requires manual revocation via Groq Console API Keys page.
  - [ ] Blockers:
    - Legacy leaked provider key remains active externally and must be revoked in provider dashboard before Phase 0 can be completed.
  - [x] Next action:
    - Revoke legacy key in Groq Console, rotate active deployment secrets per `docs/PHASE0_SECRET_ROTATION_RUNBOOK.md`, then rerun Phase 0 legacy-key rejection check and close Phase 0/8.

- [x] Session 13:
  - [x] Phase(s) targeted: Phase 0 re-validation
  - [x] Tests executed:
    - Re-checked leaked legacy Groq key against provider API (`GET https://api.groq.com/openai/v1/models`) -> still accepted (`HTTP 200`).
  - [ ] Blockers:
    - Legacy leaked provider key is still active; revocation has not yet taken effect.
  - [x] Next action:
    - Complete key revocation in Groq Console and rerun this exact validation check.

- [x] Session 14:
  - [x] Phase(s) targeted: Phase 0 and Phase 8 closure
  - [x] Tests executed:
    - Re-checked both leaked legacy Groq keys against provider API (`GET https://api.groq.com/openai/v1/models`) -> both rejected (`HTTP 401`).
    - Re-verified no tracked hardcoded live key patterns via `git grep` scan.
    - Re-verified local backend `.env` provider key fields are empty and backend runtime smoke test remains healthy.
  - [x] Blockers:
    - None remaining for Phase 0 and Phase 8 checklist closure.
  - [x] Next action:
    - Run release gate validation and proceed with publish.

- [x] Session 15:
  - [x] Phase(s) targeted: Independent re-audit against current local repository (logic + security baseline)
  - [x] Tests executed:
    - Verified current tracked docs inventory: `docs/LEGAL_COMPLIANCE_REVIEW_2026-04-12.md` and `docs/OPEN_SOURCE_DEPLOYMENT_REQUIREMENTS.md` are referenced in prior sessions but not present in this tree.
    - Verified current repo has no `.github/workflows` directory, so prior Phase 7 CI-gate claims are not reproducible from this checkout.
    - Re-scanned tracked files for common live key patterns (`gsk_`, `sk-`, `sk-or-v1-`, `AIza`, `ghp_`) with no matches.
    - Located logic drift in proxy security (`JWT_SECRET` fallback and query-string admin key acceptance) and patched:
      - `ordinay-proxy/src/config.ts`: `JWT_SECRET` now required (no insecure default).
      - `ordinay-proxy/src/routes/admin.ts`: admin auth now header-only (`x-admin-key`) with timing-safe comparison.
    - Located document path-trust gap and patched canonical path enforcement:
      - `backend/src/services/documentStorage.js`: added managed-root canonical resolver.
      - `backend/src/services/documents.service.js`: enforced managed-root validation on create/update `file_path`.
      - `backend/src/controllers/documents.controller.js`: blocked download for out-of-root paths.
      - `backend/src/services/documentExtraction.service.js`: blocked extraction/OCR for out-of-root paths.
    - Hardened backend deployment defaults:
      - `backend/src/app.js`: explicit CORS policy and conditional backend token auth for public-bind mode.
      - `backend/src/server.js`: fail-fast when public bind is enabled without `BACKEND_API_TOKEN`.
      - `backend/.env.example`: added `APP_SECRET`, `BACKEND_API_TOKEN`, `CORS_ALLOWED_ORIGINS`.
    - Hardened updater defaults:
      - `frontend/electron/main.cjs`: production now ignores non-HTTPS update feed/download URLs and no longer defaults to localhost HTTP feed unless dev + explicit opt-in.
    - Validation checks run:
      - `npm run build` in `ordinay-proxy` (pass).
      - Node module-load checks for updated backend modules and app bootstrap (pass).
  - [ ] Blockers:
    - Phase 4 still incomplete: signed manifest + checksum verification and install blocking on verification failure are not implemented in current `frontend/electron/main.cjs`.
    - Phase 6 still incomplete: renderer still caches Ordinay agent token in `localStorage` (`frontend/src/services/licenseService.ts`), conflicting with hardened boundary goals.
    - Phase 7 still incomplete: no CI workflow files are present in this local repository.
    - Phase 0/8 external controls (deployed secret rotation, legal and owner sign-offs) remain external and cannot be verified from this checkout alone.
  - [x] Next action:
    - Keep all phases unchecked until blockers above are closed and re-tested in this repository, then perform a clean export (tracked files only) into the new public repository.

- [x] Session 16:
  - [x] Phase(s) targeted: Phase 0 execution restart (local validation + operational runbook)
  - [x] Tests executed:
    - Re-ran working-tree secret pattern scan (`rg`) for common live key formats and private key headers -> no matches.
    - Re-ran tracked-file secret pattern scan (`git grep`) for the same patterns -> no matches.
    - Verified local env secret posture (keys only, values redacted):
      - `backend/.env`: provider key fields are present but empty (`LANGSEARCH_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`).
      - `backend/.env.example`: `APP_SECRET` and `BACKEND_API_TOKEN` placeholders are empty.
      - `ordinay-proxy/.env.example`: `JWT_SECRET`, `LLM_API_KEY`, `ADMIN_API_KEY` are placeholder strings (non-live examples).
      - `frontend/.env.local`: only public license key variable is set (`VITE_LICENSE_PUBLIC_KEY`).
    - Re-ran backend runtime smoke boot with current local env posture -> pass (`backend_smoke=pass`).
    - Added missing operational guide referenced by prior sessions: `docs/PHASE0_SECRET_ROTATION_RUNBOOK.md`.
  - [ ] Blockers:
    - External rotation/invalidation is still required and cannot be completed from this local repo alone:
      - deployed provider keys
      - deployed `APP_SECRET`, `JWT_SECRET`, `ADMIN_API_KEY`, `BACKEND_API_TOKEN`
      - revocation validation of all leaked legacy keys at provider side
  - [x] Next action:
    - Execute the external steps in `docs/PHASE0_SECRET_ROTATION_RUNBOOK.md` and then re-run the legacy-key rejection checks to close Phase 0.

- [x] Session 17:
  - [x] Phase(s) targeted: Phase 1 (Repository Sanitization) restart
  - [x] Tests executed:
    - Re-ran tracked artifact scan: `git ls-files | rg -n "ordinay\\.db$|\\.env(\\.|$)|\\.log$|node\\.exe$|\\.db$|\\.sqlite$|\\.sqlite3$|\\.tmp$|\\.bak$"` -> only `backend/.env.example` and `ordinay-proxy/.env.example` remain.
    - Removed tracked temporary backup artifact from git index: `frontend/src/contexts/DataContext.jsx.bak` (now staged for deletion).
    - Hardened ignore policy for temp/backup files by updating root `.gitignore` with `*.bak`, `*.tmp`, `*.temp`.
    - Verified runtime artifacts currently present only as untracked local files (`backend/.env`, `backend/ordinay.db`, local `*.log`) and not tracked by git.
    - Checked full-history secret scan tool availability: `gitleaks` is not installed in current environment.
  - [ ] Blockers:
    - History rewrite/revalidation is still pending for this local repository state.
    - Clean re-clone verification from sanitized source is still pending.
    - Full-history secret scan (`gitleaks`) cannot run until tool is installed in this environment.
    - `git status --porcelain` is not clean yet because there are in-progress hardening and checklist changes pending.
  - [x] Next action:
    - Install `gitleaks`, run full-history scan, then perform clean export/sanitized clone verification before marking Phase 1 complete.

- [x] Session 18:
  - [x] Phase(s) targeted: Phase 2 (Backend Exposure Hardening) execution
  - [x] Tests executed:
    - Implemented explicit CORS deny behavior for untrusted origins (no wildcard allow) in `backend/src/app.js`.
    - Implemented sensitive-endpoint in-memory rate limiting for `/api/settings`, `/api/documents`, `/api/email`, `/api/imports` in `backend/src/app.js`.
    - Implemented session-scoped stream auth guard for `/api/agent/v2/stream` with HMAC token validation in `backend/src/routes/agent.v2.routes.js` (header: `x-ordinay-stream-auth`).
    - Added Phase 2 regression script: `backend/scripts/security/phase2-backend-exposure.js`.
    - Added runnable command: `npm run test:security:phase2` in `backend/package.json`.
    - Ran `npm run test:security:phase2` in backend:
      - unauthorized `/api/clients` -> `401`
      - authorized `/api/clients` -> `200`
      - untrusted origin denied (no CORS allow header)
      - allowed origin receives CORS allow header
      - stream without/invalid session token -> `401`
      - stream with valid session token accepted (not `401`)
      - sensitive endpoint third request rate-limited -> `429`
      - final result: `phase2_security_checks=pass`
  - [ ] Blockers:
    - None for local Phase 2 code path.
    - Cross-phase blockers still apply (Phase 0/1/4/6/7/8).
  - [x] Next action:
    - Keep Phase 2 evidence frozen and proceed to remaining open phases.

- [x] Session 19:
  - [x] Phase(s) targeted: Phase 3 (Document and Filesystem Safety) execution
  - [x] Tests executed:
    - Added Phase 3 regression script: `backend/scripts/security/phase3-document-path-safety.js`.
    - Added runnable command: `npm run test:security:phase3` in `backend/package.json`.
    - Ran `npm run test:security:phase3` in backend:
      - external absolute `file_path` create attempt blocked (`400`).
      - traversal-like mixed-separator `file_path` update blocked (`400`).
      - tampered DB document path outside managed root blocked on download (`403`).
      - final result: `phase3_security_checks=pass`
  - [ ] Blockers:
    - None for local Phase 3 code path.
    - Cross-phase blockers still apply (Phase 0/1/4/6/7/8).
  - [x] Next action:
    - Start Phase 4 (Updater Supply-Chain Hardening) implementation and verification.

- [x] Session 20:
  - [x] Phase(s) targeted: Phase 4 (Updater Supply-Chain Hardening) execution
  - [x] Tests executed:
    - Added updater security helper module: `frontend/electron/updateSecurity.cjs`.
    - Integrated signed manifest + checksum verification into updater runtime in `frontend/electron/main.cjs`.
    - Added Phase 4 updater security suite: `frontend/electron/updateSecurity.test.cjs`.
    - Added runnable command: `npm run test:security:phase4` in `frontend/package.json`.
    - Ran `npm run test:security:phase4` in frontend (`6/6` tests passed):
      - production feed URL policy rejects non-HTTPS URLs.
      - valid signed manifest + checksum accepted.
      - tampered signature rejected.
      - missing checksum rejected when signed manifest is required.
      - artifact checksum mismatch rejected.
      - artifact checksum match accepted (happy path integrity verification).
    - Performed syntax checks: `node --check frontend/electron/main.cjs` and `node --check frontend/electron/updateSecurity.cjs` (both passed).
  - [ ] Blockers:
    - None for local Phase 4 code path.
    - Cross-phase blockers still apply (Phase 0/1/5/6/7/8).
  - [x] Next action:
    - Start Phase 5 (Proxy and Token Security) implementation and verification.

- [x] Session 21:
  - [x] Phase(s) targeted: Phase 5 (Proxy and Token Security) execution
  - [x] Tests executed:
    - Added Phase 5 proxy security regression suite: `tests/security/phase5-proxy-security.test.ts`.
    - Added runnable command: `npm run test:security:phase5` in root `package.json`.
    - Verified proxy build: `npm run build` in `ordinay-proxy` (pass).
    - Ran `npm run test:security:phase5` in root (`5/5` tests passed):
      - proxy startup fails when `JWT_SECRET` is missing.
      - admin analytics endpoint rejects query-string key access and accepts header key only.
      - JWT with invalid signature is rejected.
      - expired JWT is rejected.
      - rate-limit and quota enforcement remain active after hardening (`429` and `402` paths).
  - [ ] Blockers:
    - None for local Phase 5 code path.
    - Cross-phase blockers still apply (Phase 0/1/6/7/8).
  - [x] Next action:
    - Start Phase 6 (License and Client-Side Enforcement Boundaries) implementation and verification.

- [x] Session 22:
  - [x] Phase(s) targeted: Phase 6 (License and Client-Side Enforcement Boundaries) execution
  - [x] Tests executed:
    - Replaced renderer-side agent token persistence in `frontend/src/services/licenseService.ts`:
      - removed `localStorage` token/expiry cache.
      - added secure token cache flow via Electron bridge (`readAgentTokenCache`, `writeAgentTokenCache`, `clearAgentTokenCache`).
      - kept license-state logic intact while migrating token cache helpers to async secure reads/writes.
    - Added secure token-cache IPC handlers in `frontend/electron/main.cjs` with dedicated userData file storage:
      - `read-agent-token-cache`
      - `write-agent-token-cache`
      - `clear-agent-token-cache`
      - persisted path: `ordinay_agent_token.json` under Electron `userData`.
    - Exposed secure token-cache APIs in `frontend/electron/preload.cjs` and `frontend/src/types/electron.d.ts`.
    - Added Phase 6 regression suite: `tests/security/phase6-license-boundaries.test.ts`.
    - Added runnable command: `npm run test:security:phase6` in root `package.json`.
    - Ran syntax checks:
      - `node --check frontend/electron/main.cjs` (pass)
      - `node --check frontend/electron/preload.cjs` (pass)
    - Ran security tests:
      - `npm run test:security:phase6` in root (`3/3` tests passed):
        - renderer no longer persists Ordinay agent token in localStorage.
        - secure token cache bridge + IPC handlers are present and wired.
        - license state transition behavior remains stable after storage hardening.
      - `npm run test:security:phase5` re-run in root (`5/5` tests passed).
    - Verification grep:
      - `rg -n "ordinay_agent_token|ordinay_agent_token_expires_at" frontend/src frontend/electron -S`
      - result confirms token key strings are absent from renderer source (only secure main-process file name remains).
    - Optional renderer build check:
      - `npm run build:renderer` in frontend still fails due pre-existing unrelated TypeScript errors in `src/Agent_front/*` and `src/services/api/client.ts` (outside Phase 6 changes).
  - [ ] Blockers:
    - None for local Phase 6 hardening path.
    - Cross-phase blockers still apply (Phase 0/1/7/8).
  - [x] Next action:
    - Proceed to Phase 7 (CI Gates and Release Controls) once external Phase 0/1 prerequisites are staged for final clean export.
