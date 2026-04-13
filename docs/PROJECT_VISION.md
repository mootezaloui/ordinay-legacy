# Project Vision

This document explains the product and architecture logic of `lawyer-app` in a way that is easy to review by recruiters and engineers.

## 1. Product Problem

Law offices usually run core operations across disconnected tools.  
`lawyer-app` unifies legal work into one desktop workflow:

- Client lifecycle management
- Dossier and lawsuit execution
- Hearings/sessions, tasks, missions, officers
- Financial tracking and linked evidence
- AI-assisted workflows with explicit safeguards

## 2. Design Goals

1. `Local-first control`: keep operational data close to the operator (SQLite + desktop runtime).
2. `Domain integrity`: enforce legal-work invariants directly in schema and services.
3. `Safe AI actions`: allow AI assistance, but gate impactful actions with confirmation/control.
4. `Operational resilience`: keep CRUD operations functional even when AI services are unavailable.
5. `Clear extensibility`: optional proxy and deployment flags without rewriting the domain core.

## 3. Architectural Style

The project is built as a desktop monolith with clear internal boundaries:

- `Frontend (React)` handles UX and user intent capture.
- `Electron main` enforces desktop security boundaries and brokers IPC.
- `Backend (Express)` owns domain rules, persistence, and integration logic.
- `SQLite` stores canonical legal operations data.
- `Optional Ordinay Proxy` adds API key isolation, quotas, and provider routing when needed.

This keeps local performance and operator control while still enabling cloud AI capabilities.

## 4. Why This Is Good To Showcase

For engineering review, this repo demonstrates:

- `Runtime boundary design`: renderer/main/backend split with controlled transport.
- `Data modeling`: rich legal entities and relationship constraints.
- `Safety design`: confirmation flows, auth gates, rate limits, and scoped operations.
- `Feature evolution`: flag-based rollout for agent v2 stream and fallback behavior.
- `Real product logic`: not only CRUD pages, but operational workflows and lifecycle tracking.

## 5. Recommended Reading Order

1. [`ARCHITECTURE_DIAGRAMS.md`](./ARCHITECTURE_DIAGRAMS.md)
2. [`APP_LOGIC_USE_CASES.md`](./APP_LOGIC_USE_CASES.md)
3. [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md)
4. [`ARCHITECTURE.md`](./ARCHITECTURE.md) (deep technical notes)
