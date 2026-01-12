# Organia Backend Foundation (MVP)

Database-first backend with an Express HTTP layer. SQLite schema is enforced; the connection helper initializes the DB; endpoints perform basic CRUD with soft deletes and server-side validation aligned to schema constraints.

## Folder layout
- `backend/src/config/app.config.js` – app-level settings (port, env, API prefix).
- `backend/src/config/db.config.js` – database file location.
- `backend/src/db/schema.sql` – full SQLite schema (structural constraints only).
- `backend/src/db/connection.js` – opens `organia.db`, ensures the schema is applied, and exports a `better-sqlite3` instance.
- `backend/src/routes` – Express route modules (mounted under `/api/*`).
- `backend/src/controllers` – request/response handlers returning data or 404; they surface validation errors cleanly.
- `backend/src/services` – CRUD + validation against schema rules (soft deletes, XOR checks on polymorphic relations).
- `backend/src/middlewares` – error/not-found handlers.
- `backend/src/app.js` – Express app wiring (JSON parsing, routes, middleware).
- `backend/src/server.js` – server entry point.

## Why SQLite for the desktop-first MVP
- File-based, zero-ops: fits the single-user desktop app with no external services required.
- Fast and reliable on local disks; safe to bundle/distribute as one file (`organia.db`).
- Supports foreign keys and CHECK/UNIQUE constraints to enforce integrity early.
- Smooth path to later sync: the file can be replicated or migrated to a server-side RDBMS when a web backend arrives.

## Why Express for the service layer
- Ubiquitous, lightweight, and easy to extend for both desktop and future web targets.
- Plays well with synchronous `better-sqlite3` access for local-first flows.
- Simple middleware model for future auth, validation, and logging.

## Layered architecture
- Routes: define endpoints only; mounted under `/api/*`.
- Controllers: handle req/res, parse IDs, and return JSON/404.
- Services: CRUD + validation (XOR polymorphic checks, required fields, soft deletes via `deleted_at`, updated timestamps).
- DB: connection helper and schema; `better-sqlite3` used synchronously.

## Schema highlights (how it maps to the frontend)
- `clients` → `dossiers` → `cases` mirror the existing hierarchy (1:N per step).
- Tasks: `tasks` link to either a dossier or a case; `personal_tasks` are standalone.
- Hearings/consultations: `sessions` attach to either a case or a dossier (polymorphic) with status checks.
- Missions/officers: `missions` link to a case or dossier and may be assigned to an `officer`.
- Documents: single required target among client/dossier/case/mission/task/session/personal_task/financial_entry.
- Money: `financial_entries` always link to a client, optionally to a dossier or case (but never both together).
- Activity: `notifications` (lightweight reminders) and `history_events` (audit trail) capture timeline data.
- Every table is soft-delete ready (`deleted_at`) and timestamps creation/updates.
- Reference codes: dossiers (`DOS-YYYY-XXX`), cases (`PRO-YYYY-XXX`), missions (`MIS-YYYY-XXX`) are UNIQUE with format guards.

## Connection helper
`connection.js` uses `better-sqlite3` (synchronous, low overhead) which suits a desktop app and keeps query code simple. It enables foreign keys and runs `schema.sql` automatically the first time (`clients` table check). Install dependencies once in the backend package: `npm install`.

## What is intentionally not here yet
- No authentication/authorization.
- No data migration from the frontend/localStorage.
- No sync/cloud logic; this will be layered on later.
- No repository/DAL abstraction beyond the current services.

## Notes for future backend/web sync
- Keep `schema.sql` as the single source of truth; migrations can be added later.
- When introducing multi-user or remote sync, revisit auth fields and row-level ownership.
- Triggers can later enforce cross-entity invariants if needed (e.g., case ↔ dossier consistency for finances).
