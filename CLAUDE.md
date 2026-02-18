# Claude Operating Contract

This repository is production code.

Claude must behave as a senior production engineer, not as an experimental assistant.

Any violation of the rules below is considered a defect.

---

## Absolute Rules

### 1. No New Files

Claude MUST NOT create new files unless explicitly instructed.

If a change can be made by editing existing files, it MUST be done that way.

Creating new files for “cleanliness”, “organization”, or “best practice” reasons is FORBIDDEN.

---

### 2. No Refactors Without Request

Claude MUST NOT refactor code unless explicitly asked.

This includes but is not limited to:
- Renaming variables
- Reformatting code
- Extracting functions
- Reordering logic
- “Simplifying” code
- Replacing working logic with “cleaner” versions

Only change the minimal lines necessary to accomplish the requested task.

---

### 3. Existing Logic Is Canon

All implemented logic is considered correct and intentional.

Claude MUST follow existing patterns, structures, and styles already present in the codebase.

Claude MUST adapt to the codebase — the codebase must never be adapted to Claude.

---

### 4. Minimal Diff Policy

Changes must be:
- Minimal
- Targeted
- Localized

Large diffs are considered a failure unless explicitly requested.

---

### 5. No Architectural Changes

Claude MUST NOT:
- Change architecture
- Replace systems
- Introduce new patterns
- Add abstractions
- Add layers

Only fix the requested issue inside the existing architecture.

---

### 6. No “Best Practice” Rewrites

Claude MUST NOT apply general “best practices”, cleanups, or stylistic changes.

If code works, it stays.

---

### 7. No Silent Behavior Changes

Claude MUST NOT modify behavior outside the explicitly requested scope.

If a change might alter behavior, Claude MUST warn before proceeding.

---

### 8. No Hidden Assumptions

Claude MUST NOT invent requirements, validation, error handling, or business logic that does not already exist.

Only extend logic if explicitly requested.

---

### 9. Code Must Match Repository Style

Indentation, naming, spacing, comments, and conventions MUST match existing code exactly.

Claude must mirror the repository, not “improve” it.

---

### 10. Default Mode: Surgical Fixer

Unless told otherwise, Claude must operate as:

> Surgical patch engineer for a production system.

Not a teacher.  
Not a refactorer.  
Not a stylist.  
Not an optimizer.

---

## Output Rules

- Only show changed lines unless full file context is explicitly requested.
- Do not include explanations unless explicitly requested.
- Do not reprint unchanged code.

---

## If Rules Conflict

Choose the option that results in:
1. Fewer changed lines
2. No new files
3. No refactor

Always.

---

Failure to comply with this contract is a production defect.

---

## Ordinay App Context (Renderer Architecture)

Use this as system context for app-level reasoning and implementation.

### REAL CODE ARCHITECTURE (Renderer Side – Where the App Lives)

At code level, the app is:

App
 ├── Layout (Sidebar, Header, TitleBar)
 ├── Routing
 └── Feature Modules

Inside that, the real structure is:

/src
  /core
  /contexts
  /features
  /components
  /services
  /utils

That is what matters.

### Architecture Diagram

```text
App.tsx
  |
  v
Core Layer
  |
  v
Layout + Router + Providers
  |------------------------------|
  | providers:                   |
  | - ThemeProvider              |
  | - i18n Provider              |
  | - License Provider           |
  | - Notification Provider      |
  | - DataContext Provider       |
  |------------------------------|
  |
  +--> Feature Modules --> Reusable Components
  |
  +--> DataContext --> Service Layer --> Local Backend/Persistence
```

### 1) CORE LAYER (App Shell)

This is the structural skeleton.

Contains:
- App.tsx
- Router
- Layout wrapper
- Theme provider
- i18n provider
- License provider

This layer:
- Wraps everything
- Does not contain business logic
- Does not fetch data
- Does not mutate entities

It composes providers + layout.

### 2) CONTEXT LAYER (State Management Brain)

This is the heart of the app.

Main contexts:
- DataContext
- LicenseContext
- NotificationContext

This layer:
- Holds entity state arrays
- Exposes CRUD functions
- Synchronizes state after mutations
- Centralizes business-logic side effects

Mental model:

DataContext
  state:
    clients[]
    dossiers[]
    tasks[]
    sessions[]
    financialEntries[]
    history[]

  functions:
    addClient()
    updateClient()
    deleteClient()
    addDossier()
    ...

UI never mutates data directly. Everything flows through these functions.

### 3) FEATURE MODULES (Domain Isolation)

Each domain should be isolated:

/features
   /clients
   /dossiers
   /tasks
   /sessions
   /accounting
   /documents
   /settings

Each feature contains:
- FeaturePage.jsx
- FeatureList.jsx
- FeatureDetail.jsx
- FeatureForm.jsx

Rules:
- Feature does NOT own global state
- Feature uses DataContext
- Feature does NOT fetch directly from backend
- Feature does NOT mutate global state manually

Feature modules are presentation + orchestration only.

### 4) COMPONENT LAYER (Reusable UI)

This layer contains pure UI components:

/components
   Button
   Modal
   Table
   Grid
   Card
   FormField
   Pagination

Rules:
- No business logic
- No entity awareness
- No backend calls
- Fully reusable
- Fully controlled by props

### 5) SERVICE LAYER (Backend Interaction)

Services isolate persistence logic.

Example:

/services
   client.service.js
   dossier.service.js
   import.service.js
   license.service.ts

Services:
- Call local backend
- Transform responses
- Return clean data

Services do NOT:
- Store state
- Know about React
- Modify contexts

They are pure I/O wrappers.

### 6) HOW DATA FLOWS

When a user adds a client:

UI (ClientForm)
   ↓
calls DataContext.addClient()
   ↓
DataContext calls client.service.create()
   ↓
Service writes to local storage/backend
   ↓
DataContext updates state
   ↓
React re-renders

No component talks to another component.
No feature imports another feature's state.
Everything centralizes in context.

### Data Flow Sequence

```text
User
  -> Feature UI (ClientForm): submit new client
  -> DataContext: addClient(payload)
  -> client.service: create(payload)
  -> Backend/Storage: persist client
  -> client.service: stored client
  -> DataContext: clean client data
  -> DataContext: update clients[] state
  -> React Render: state changed
  -> User: UI re-renders with new client
```

### 7) WHY THIS ARCHITECTURE WORKS

Because:
- State is centralized
- Side effects are controlled
- UI is dumb
- Services are isolated
- Features are modular

This keeps the app from becoming spaghetti.

### 8) WHAT BREAKS THIS ARCHITECTURE

Do not:
- Fetch inside components
- Add new global state outside contexts
- Duplicate data in multiple contexts
- Let features talk to each other directly
- Store business logic in UI layer
- Create helper files that bypass service layer

These are the main failure modes.

### Dependency Rules Diagram

```text
Allowed:
Features -> Contexts
Features -> Components
Contexts -> Services
Services -> Backend/Persistence

Forbidden:
Features -X-> Backend/Persistence (direct)
Features -X-> Other Feature State (direct)
Components -X-> Contexts
Components -X-> Backend/Persistence
Services -X-> React State/Contexts
```

### 9) Brutal Summary

The app is:

A centralized state container (DataContext) that orchestrates domain modules, rendered through modular feature pages, using isolated services for persistence.

Not IPC.
Not cloud.
Not updates.
Just that.

---

## Ordinay Agent Context (Runtime Architecture)

Use this as system context for agent-side reasoning, debugging, and evolution planning.

### 1) Live Runtime Topology (What Actually Runs)

```text
Frontend (React/Vite)
  -> HTTP/SSE
Node Backend (Express)
  -> Agent Engine Layer
    -> Tool Registry
      -> Services Layer
        -> Database (SQLite/Postgres)
    -> LLM Client
      -> Ollama Server
        -> Local LLM Model
```

Operationally this is usually local processes: `ollama serve`, Node backend, Vite dev server, and database.

### 2) Clean 5-Layer Mental Model

```text
1) HTTP + Stream Layer
   agent.router.js
   - SSE transport
   - early transport gates
        |
        v
2) Control Plane
   pipeline.js
   - gate arbitration
   - intent/routing/plan decision
        |
        v
3) Execution Plane
   planner.js + executor.js
   - build plan
   - execute tools
   - validate + ledger
        |
        v
4) Domain Tools
   tools/ + firewall
   - read / draft / analysis / execute
        |
        v
5) Infrastructure
   context / ledger / permissions / llm
```

### 3) Container/Component Relationship (Current Graph)

```text
Frontend Agent Screen
  -> SSE /agent/stream
agent.router.js
  -> AgentEngine.run()
    -> pipeline.js
      -> planner.js -> executor.js -> Tool Registry -> Tool Firewall -> Domain Tools
      -> Read Stage
      -> Follow-up Stage
      -> Intent Stage

Domain Tools -> DB Services
Domain Tools -> LLM Client/Ollama
AgentEngine -> Ledger
AgentEngine -> Context Store

mcp/ module: exists but not wired into live Tool Registry path
```

### 4) MCP Status (Important)

MCP may exist in code (`mcp/` adapters/examples) while remaining non-operational in runtime.

MCP is effectively unused when one or more of these are true:
- Not registered in tool registry
- Behind disabled feature flag/policy
- No planner route selects MCP tools
- No runtime transport/connection to MCP server
- Firewall blocks external tool class

Interpretation rule:
- `present in repo` does not mean `reachable in execution graph`.

### 5) Architecture Constraints For Agents

Treat these as hard guidance when modifying agent code:
- Router is transport-first (`HTTP/SSE`), not business-policy authority
- Engine/pipeline is decision authority
- Avoid duplicating gate/intent logic between router and pipeline
- Keep stream and non-stream behavior aligned by one lifecycle contract
- Keep tool access only through registry + firewall
- Keep ledger/context updates in execution lifecycle, not UI transport layer

### 6) Performance Reality (Why It Feels Heavy)

Turn cost is cumulative orchestration:
- Transport gates
- Engine/policy gates
- Intent/read/follow-up arbitration
- Context enrichment
- Planning + execution
- Validation + ledger
- Artifact/commentary streaming

System feels heavy from stacked stages, not a single bottleneck.

### 7) Stability Priorities Before V3

Preferred direction:
1. Single canonical gate order
2. Router handles transport only
3. Engine owns all decision logic
4. One unified event/lifecycle contract
5. Context/session identity alignment

### 8) Brutal Summary

Current reality:
- Agent is a local orchestrator framework, not a simple chatbot
- MCP is currently safe but likely inert unless explicitly wired
- Main architectural risk is split control-plane logic (router vs pipeline), not MCP itself

---

## 3 Canonical Diagrams

### A) Entire App Architecture

```text
User
  -> Frontend App (React + Vite)
  -> Backend API (Node + Express)
      -> Office Management Modules
          -> Database
          -> Document/File Storage
      -> Agent Runtime
          -> Tool Registry + Firewall -> Database
          -> Tool Registry + Firewall -> Document/File Storage
          -> LLM Client -> Ollama -> Local Model
```

### C) Agent Architecture

```text
Frontend Agent Screen
  -> SSE /agent/stream -> agent.router.js
  -> AgentEngine.run()
      -> pipeline.js
          -> planner.js -> executor.js -> Tool Registry -> Firewall -> Domain Tools -> DB Services
      -> Ledger
      -> Context Store
      -> LLM Client -> Ollama

mcp/: optional module, not wired by default into Tool Registry path
```
