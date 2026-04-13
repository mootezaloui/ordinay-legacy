# Backend Package

Express + SQLite backend for `lawyer-app`.

Responsibilities:

- Domain APIs under `/api/*`
- Data integrity and business rule enforcement
- Local persistence (`better-sqlite3`)
- Agent v2 stream endpoint integration

## Requirements

- Node.js `20.19+` or `22.12+`
- npm `10+`

## Install

```bash
npm ci
```

## Configuration

Create local environment config:

```bash
cp .env.example .env
```

Key runtime settings are defined in:

- `src/config/app.config.js`
- `src/config/db.config.js`
- `.env.example`

## Run

Start production mode:

```bash
npm run start
```

Start development mode (nodemon):

```bash
npm run dev
```

## Agent Build Scripts

Type-check agent TypeScript:

```bash
npm run typecheck:agent
```

Build agent runtime artifacts:

```bash
npm run build:agent
```

## Project Layout

```text
backend/
  src/
    app.js               Express app wiring and middleware
    server.js            Backend startup entrypoint
    routes/              API route modules
    controllers/         Request handlers
    services/            Domain and persistence operations
    db/
      schema.sql         SQLite schema and constraints
      connection.js      DB initialization and connection
    middlewares/         Error, not-found, and request middlewares
    agent/               Agent runtime/deployment modules
```

## Data and Integrity Model

- SQLite schema is the authoritative source for structural constraints.
- Foreign keys and `CHECK` constraints enforce domain invariants.
- Soft-delete pattern is used across core entities (`deleted_at`).
- Backend services perform additional validation before writes.

## API Scope

The route layer covers core legal-office domains such as:

- clients, dossiers, lawsuits
- tasks, sessions, missions, officers
- documents, financial entries, notifications
- profile, settings, dashboard, imports
- agent endpoints (`/agent/v2/stream` when enabled)

## Integration Notes

- Frontend desktop mode typically reaches this backend through Electron IPC proxying.
- Agent streaming is consumed via direct HTTP stream endpoint access from the frontend.
- Optional `ordinay-proxy` can be used for hosted/provider-side AI routing scenarios.

## Related Docs

- Root project README: `../README.md`
- Architecture diagrams: `../docs/ARCHITECTURE_DIAGRAMS.md`
- Domain model: `../docs/DOMAIN_MODEL.md`
- Deep architecture notes: `../docs/ARCHITECTURE.md`

## License

MIT
