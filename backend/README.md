# Ordinay Backend

![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Framework-Express-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)
![Agent](https://img.shields.io/badge/AI-Agent%20V2-6D28D9)

Express + SQLite backend for Ordinay.

## Responsibilities

- Domain API surface under `/api/*`.
- Business rule enforcement and persistence integrity.
- Session, document, and financial orchestration.
- Agent v2 streaming runtime and safety controls.

## Requirements

- Node.js `20.19+` or `22.12+`
- npm `10+`

## Install

```bash
npm ci
```

## Configuration

Create local runtime environment:

```bash
cp .env.example .env
```

Primary configuration references:

- `src/config/app.config.js`
- `src/config/db.config.js`
- `.env.example`

## Run

Start backend:

```bash
npm run start
```

Start development mode:

```bash
npm run dev
```

Both commands automatically run `build:agent` first to ensure the agent runtime is present.

## Agent Build Scripts

Type-check agent runtime:

```bash
npm run typecheck:agent
```

Build agent runtime artifacts:

```bash
npm run build:agent
```

## High-Level Layout

```text
backend/
  src/
    routes/        API contracts
    controllers/   request orchestration
    services/      domain and persistence services
    db/            schema and connection
    agent/         agent v2 runtime and modules
    middlewares/   cross-cutting request concerns
```

## Data Integrity Model

- SQLite schema is the structural source of truth.
- Foreign keys and `CHECK` constraints enforce invariants.
- Soft-delete lifecycle is used for core entities.
- Services perform additional domain-level validation before writes.

## API Coverage

- clients, dossiers, lawsuits
- tasks, sessions, missions, officers
- documents, financial entries, notifications
- profile, settings, dashboard, imports
- agent endpoints (`/agent/v2/stream` and admin operations when enabled)

## Integration Notes

- Desktop frontend usually accesses backend through Electron IPC proxying.
- Agent stream is consumed via direct HTTP SSE.
- `ordinay-proxy` is optional for hosted/provider routing.

## Related Documentation

- Root README: [../README.md](../README.md)
- Architecture diagrams: [../docs/ARCHITECTURE_DIAGRAMS.md](../docs/ARCHITECTURE_DIAGRAMS.md)
- Domain model: [../docs/DOMAIN_MODEL.md](../docs/DOMAIN_MODEL.md)
- Deep architecture notes: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## License

MIT
