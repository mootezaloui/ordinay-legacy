# lawyer-app

Law office management application with:

- Electron desktop frontend (`frontend`)
- Node/Express backend (`backend`)
- Optional proxy service (`ordinay-proxy`)

## Architecture Quick Links

- [Project Vision](docs/PROJECT_VISION.md)
- [Architecture Diagrams](docs/ARCHITECTURE_DIAGRAMS.md)
- [App Logic Use Cases](docs/APP_LOGIC_USE_CASES.md)
- [Domain Model](docs/DOMAIN_MODEL.md)
- [Deep Technical Architecture](docs/ARCHITECTURE.md)
- [Agent System Design](docs/AGENT_SYSTEM_DESIGN.md)
- [Agent Diagrams](docs/AGENT_DIAGRAMS.md)
- [Agent Use Cases](docs/AGENT_USE_CASES.md)

Architecture at a glance:

```mermaid
flowchart LR
    User["Operator"] --> UI["React Renderer"]
    UI --> IPC["Electron IPC"]
    IPC --> API["Express Backend"]
    API --> DB[("SQLite")]
    API --> LLM["LLM API"]
    API -. optional .-> Proxy["Ordinay Proxy"]

    classDef actor fill:#FFF4CC,stroke:#B7791F,color:#5B3A00,stroke-width:2px;
    classDef app fill:#E8F1FF,stroke:#2F6FEB,color:#0A2A59,stroke-width:2px;
    classDef data fill:#EAFAF1,stroke:#1F8F5F,color:#0A4C2A,stroke-width:2px;
    classDef ext fill:#F6ECFF,stroke:#7C3AED,color:#3B0764,stroke-width:2px;

    class User actor;
    class UI,IPC,API app;
    class DB data;
    class LLM,Proxy ext;
```

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+

## Quick Start

1. Install dependencies:

```bash
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix ordinay-proxy ci
```

2. Backend env setup:

```bash
cp backend/.env.example backend/.env
```

3. Frontend env setup (optional overrides):

```bash
cp frontend/.env.example frontend/.env
```

4. Start backend:

```bash
npm --prefix backend run start
```

5. Start frontend (dev mode):

```bash
npm --prefix frontend run electron:dev
```

## Build

Frontend desktop package:

```bash
npm --prefix frontend run electron:build
```

Proxy build:

```bash
npm --prefix ordinay-proxy run build
```

## Repository Layout

- `backend/` API server and domain logic
- `frontend/` Electron + React application
- `ordinay-proxy/` optional secured proxy
- `docs/` architecture, domain, and use-case documentation

## Architecture Vision Pack

For engineering and recruiter review, follow this order:

1. `docs/PROJECT_VISION.md` (product + architecture rationale)
2. `docs/ARCHITECTURE_DIAGRAMS.md` (system, runtime, and safety flow diagrams)
3. `docs/APP_LOGIC_USE_CASES.md` (core business flows and logic checkpoints)
4. `docs/DOMAIN_MODEL.md` (entity relationships and invariants)
5. `docs/ARCHITECTURE.md` (deep technical notes)
6. `docs/AGENT_SYSTEM_DESIGN.md` (agent runtime decisions and safety model)
7. `docs/AGENT_DIAGRAMS.md` (agent-focused architecture and lifecycle diagrams)
8. `docs/AGENT_USE_CASES.md` (AI workflow scenarios mapped to runtime behavior)

## License

MIT. See `LICENSE`.
