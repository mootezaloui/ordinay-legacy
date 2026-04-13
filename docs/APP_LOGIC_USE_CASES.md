# App Logic Use Cases

## 1. Use Case Map

```mermaid
flowchart TD
    A["Operator manages legal work"] --> B["Intake Client"]
    A --> C["Open Dossier"]
    A --> D["Track Lawsuit Lifecycle"]
    A --> E["Plan Tasks / Sessions / Missions"]
    A --> F["Attach and Analyze Documents"]
    A --> G["Track Financial Entries"]
    A --> H["Use AI Assistant with Safeguards"]

    classDef root fill:#E8F1FF,stroke:#2F6FEB,color:#0A2A59,stroke-width:2px;
    classDef core fill:#EAFAF1,stroke:#1F8F5F,color:#0A4C2A,stroke-width:2px;
    classDef ai fill:#F6ECFF,stroke:#7C3AED,color:#3B0764,stroke-width:2px;

    class A root;
    class B,C,D,E,F,G core;
    class H ai;
```

## 2. High-Value Use Cases

### UC1: Client Intake to Active Dossier

- Actor: Lawyer / legal operator
- Trigger: New client onboarding
- Main flow:
  1. Create `client`
  2. Open `dossier` linked to the client
  3. Add first tasks/sessions/documents
- Logic checkpoints:
  - Dossier must always reference an existing client
  - Dossier status and priority must stay within allowed states

### UC2: Dossier to Lawsuit Escalation

- Actor: Lawyer
- Trigger: Case escalates to litigation
- Main flow:
  1. Create `lawsuit` under dossier
  2. Plan hearings/sessions and legal tasks
  3. Keep related documents and evidence attached
- Logic checkpoints:
  - Lawsuit cannot exist without dossier
  - Lawsuit state transitions must use valid status values

### UC3: Operational Planning and Execution

- Actor: Lawyer + team
- Trigger: Need to execute legal actions
- Main flow:
  1. Create tasks/missions/sessions
  2. Assign owner, priority, due/scheduled dates
  3. Mark completion/outcomes and log history
- Logic checkpoints:
  - Task/session/mission must be linked to one parent context (xor rule)
  - History events should be emitted for important lifecycle actions

### UC4: Financial Control by Matter

- Actor: Lawyer / office manager
- Trigger: Billable or expense event
- Main flow:
  1. Create `financial_entry`
  2. Link to client and optionally dossier/lawsuit/mission/task
  3. Track status changes (`draft`, `pending`, `paid`, ...)
- Logic checkpoints:
  - Scope rules must hold (`client` scope requires `client_id`)
  - Monetary values are non-negative

### UC5: AI-Assisted Legal Operations

- Actor: Lawyer
- Trigger: User asks AI for summary, search, or operation
- Main flow:
  1. User asks in chat
  2. Agent streams response and may call tools
  3. Sensitive operations require explicit confirmation path
  4. Results are persisted and surfaced in UI
- Logic checkpoints:
  - Stream endpoint auth and feature flags control access
  - Agent behavior must degrade safely when runtime transport is unavailable

## 3. Sequence Example: Confirmed AI Mutation

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant AG as Agent Runtime
    participant DB as SQLite

    U->>FE: "Close this lawsuit and update sessions"
    FE->>BE: /agent/v2/stream
    BE->>AG: classify + plan operation
    AG-->>FE: return confirmation preview
    U->>FE: confirm
    FE->>BE: confirmation turn
    BE->>AG: execute validated tools
    AG->>DB: apply mutation set
    BE-->>FE: success + mutation outcome
```

## 4. Open-Source Logic Review Checkpoints

Before publishing, validate these logic points explicitly:

1. `Business invariants are in backend/db`: no critical rule should live only in frontend.
2. `Fallback behavior is deterministic`: if agent or proxy is down, core CRUD still works.
3. `Permission boundaries are explicit`: sensitive routes/operations require auth when exposed.
4. `No hidden coupling`: route contracts used by frontend match backend payload guarantees.
5. `Data lifecycle is explainable`: create/update/delete and history events are auditable.
6. `AI mutation safety is testable`: confirmation-required operations are covered by deterministic checks.
