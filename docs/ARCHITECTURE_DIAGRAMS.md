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
    D --> E["Backend API routes"]

    B -->|No, web fallback| F["HTTP fetch to configured API base"]
    F --> E

    G["Agent streaming request"] --> H["Direct HTTP SSE to /agent/v2/stream"]
    H --> E

    classDef request fill:#FFF4CC,stroke:#B7791F,color:#5B3A00,stroke-width:2px;
    classDef decision fill:#FFEAF2,stroke:#BE185D,color:#831843,stroke-width:2px;
    classDef transport fill:#E8F1FF,stroke:#2F6FEB,color:#0A2A59,stroke-width:2px;
    classDef backend fill:#EAFAF1,stroke:#1F8F5F,color:#0A4C2A,stroke-width:2px;

    class A,G request;
    class B decision;
    class C,D,F,H transport;
    class E backend;
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

    classDef core fill:#E8F1FF,stroke:#2F6FEB,color:#0A2A59,stroke-width:2px;
    classDef module fill:#EEF2FF,stroke:#4F46E5,color:#1E1B4B,stroke-width:1.5px;
    classDef store fill:#EAFAF1,stroke:#1F8F5F,color:#0A4C2A,stroke-width:2px;

    class Router core;
    class Clients,Dossiers,Lawsuits,Tasks,Sessions,Missions,Documents,Financial,Agent,Settings module;
    class DB store;
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

    classDef entry fill:#FFF4CC,stroke:#B7791F,color:#5B3A00,stroke-width:2px;
    classDef proxy fill:#E8F1FF,stroke:#2F6FEB,color:#0A2A59,stroke-width:2px;
    classDef guard fill:#FFEAF2,stroke:#BE185D,color:#831843,stroke-width:2px;
    classDef provider fill:#F6ECFF,stroke:#7C3AED,color:#3B0764,stroke-width:2px;
    classDef analytics fill:#EAFAF1,stroke:#1F8F5F,color:#0A4C2A,stroke-width:2px;

    class Client entry;
    class Proxy proxy;
    class Auth,Limits,Route guard;
    class ProviderA,ProviderB provider;
    class Usage analytics;
```

## 6. Architecture Notes

- CRUD traffic is optimized for local reliability (IPC + local backend path).
- Streaming keeps direct HTTP/SSE to preserve event flow characteristics.
- Core legal logic stays in backend/domain routes, not in UI components.
- Database constraints enforce relationship correctness even if UI validation is bypassed.
