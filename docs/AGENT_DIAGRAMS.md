# Agent Diagrams

This file contains focused diagrams for the Agent v2 architecture.

## 1. Agent Runtime Context

```mermaid
flowchart LR
    U["User"] --> FE["Frontend Chat UI"]
    FE --> API["POST /api/agent/v2/stream"]
    API --> SEC["Security Layer"]
    SEC --> LOOP["Agentic Loop"]

    LOOP --> LLM["LLM Provider"]
    LOOP --> TOOLS["Tool Registry"]
    LOOP --> SES["Session Store"]
    LOOP --> MEM["Memory"]
    LOOP --> RET["Retrieval"]
    LOOP --> GND["Grounding"]

    TOOLS --> DB["SQLite + Services"]
    LOOP --> SSE["SSE Event Stream"]
    SSE --> FE
```

## 2. Turn Lifecycle

```mermaid
flowchart TD
    A["Incoming Turn"] --> B["Sanitize Input"]
    B --> C["Rate Limit + Auth Scope"]
    C --> D{"Safe Mode Allows Turn"}
    D -->|No| E["Emit error and done"]
    D -->|Yes| F["Load Session"]
    F --> G["Classify Turn Type"]
    G --> H{"Confirmation or Rejection"}
    H -->|Yes| I["Handle Pending Action Path"]
    H -->|No| J["Run Agentic Reasoning Loop"]
    J --> K["Execute Tools"]
    K --> L["Build Output + Artifacts"]
    I --> L
    L --> M["Persist Session and Audit"]
    M --> N["Emit SSE Events and done"]
```

## 3. Plan Confirm Execute Sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant AG as Agent Loop
    participant PL as Plan Tools
    participant PM as Pending Manager
    participant EX as Entity Executor
    participant DB as Database

    U->>FE: Update request
    FE->>AG: stream turn
    AG->>PL: proposeUpdate
    PL-->>AG: plan artifact
    AG->>PM: set pending action
    AG-->>FE: plan_artifact + pending
    FE-->>U: ask for confirmation

    U->>FE: confirm
    FE->>AG: confirmation turn
    AG->>EX: execute pending plan
    EX->>DB: mutation
    DB-->>EX: result
    EX-->>AG: execution outcome
    AG-->>FE: plan_executed + entity_mutation_success
```

## 4. Retrieval and Grounding Pipeline

```mermaid
flowchart TD
    A["Turn Input"] --> B["Context Assembler"]
    B --> C["Retrieval Context Builder"]
    C --> D["Matches from Retrieval Index"]
    D --> E["Grounding Source Tracker"]
    E --> F["Grounded Prompt Context"]
    F --> G["LLM Generation"]
    G --> H["Citation Builder"]
    H --> I["Grounded Assistant Output"]
```

## 5. Operations and Safe Mode Control Plane

```mermaid
flowchart LR
    OP["Admin Operator"] --> R["/api/agent/v2/admin/*"]
    R --> SM["Safe Mode State"]
    R --> DF["Debug Flags"]
    R --> ST["Runtime Status"]
    R --> AU["Audit Explorer"]

    SM --> G1["v2Disabled"]
    SM --> G2["forceReadOnly"]
    SM --> G3["writesDisabled"]
    SM --> G4["retrievalDisabled"]
    SM --> G5["groundingDisabled"]

    G1 --> LOOP["Agent Runtime Behavior"]
    G2 --> LOOP
    G3 --> LOOP
    G4 --> LOOP
    G5 --> LOOP
```
