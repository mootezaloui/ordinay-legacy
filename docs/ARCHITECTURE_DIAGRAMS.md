# Architecture Diagrams

## 1. System Context

```mermaid
flowchart LR
    User["Law Office Operator"]

    subgraph Desktop["Desktop App (Electron)"]
        R["React Renderer"]
        M["Electron Main Process"]
        B["Express Backend"]
        DB[("SQLite Database")]
    end

    Proxy["Optional Ordinay Proxy"]
    LLM["LLM Provider API"]

    User --> R
    R -->|IPC request/response| M
    M -->|Named pipe / localhost API| B
    B --> DB
    B -->|Agent tools + prompt orchestration| LLM
    B -. optional hosted deployment .-> Proxy
    Proxy -->|Auth, rate limits, quotas| LLM
```

## 2. Runtime Transport Logic

```mermaid
flowchart TD
    A["Renderer CRUD Request"] --> B{"Electron runtime?"}
    B -->|Yes| C["IPC: window.electronAPI.apiRequest"]
    C --> D["Main process proxyApiRequest"]
    D --> E["Backend /api/* routes"]

    B -->|No (web/fallback)| F["HTTP fetch to configured API base"]
    F --> E

    G["Agent streaming request"] --> H["Direct HTTP/SSE to /agent/v2/stream"]
    H --> E
```

## 3. Backend Domain Modules

```mermaid
flowchart LR
    Router["Route Layer"]
    Router --> Clients["clients.routes"]
    Router --> Dossiers["dossiers.routes"]
    Router --> Lawsuits["lawsuits.routes"]
    Router --> Tasks["tasks.routes"]
    Router --> Sessions["sessions.routes"]
    Router --> Missions["missions.routes"]
    Router --> Documents["documents.routes"]
    Router --> Financial["financial.routes"]
    Router --> Agent["agent.v2.routes"]
    Router --> Settings["settings.routes"]

    Clients --> DB[("SQLite")]
    Dossiers --> DB
    Lawsuits --> DB
    Tasks --> DB
    Sessions --> DB
    Missions --> DB
    Documents --> DB
    Financial --> DB
    Agent --> DB
```

## 4. Agent V2 Safety Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant BE as Backend Agent v2
    participant RT as Runtime/Tool Layer
    participant DB as SQLite
    participant L as LLM

    U->>FE: Ask question / request action
    FE->>BE: POST /agent/v2/stream
    BE->>BE: Validate payload + optional stream auth
    BE->>RT: Start agent loop
    RT->>L: Reason over context + tool schemas
    L->>RT: Tool calls / text chunks
    RT->>DB: Read/prepare write operations
    RT-->>BE: Structured result events
    BE-->>FE: SSE chunks + result envelope
    FE-->>U: Live response + confirmation UX for sensitive ops
```

## 5. Optional Proxy Topology

```mermaid
flowchart LR
    Client["Desktop/Backend Caller"] --> Proxy["Ordinay Proxy"]
    Proxy --> Auth["JWT Auth Middleware"]
    Auth --> Limits["Rate Limit + Quota Middleware"]
    Limits --> Route["Provider Router"]
    Route --> ProviderA["Fast Model Provider"]
    Route --> ProviderB["Capable Model Provider"]
    Proxy --> Usage["Analytics + Usage API"]
```

## 6. Architecture Notes

- CRUD traffic is optimized for local reliability (IPC + local backend path).
- Streaming keeps direct HTTP/SSE to preserve event flow characteristics.
- Core legal logic stays in backend/domain routes, not in UI components.
- Database constraints enforce relationship correctness even if UI validation is bypassed.
