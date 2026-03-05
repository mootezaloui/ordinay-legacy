# Tool System Architecture

**Last Updated**: 2026-03-05

---

## Component Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                      Agent Engine                            │
│                                                              │
│  Service container — owns registry, firewall, ledger,        │
│  scope manager, AJV validator, proposal store.               │
│                                                              │
│  executeToolV2(toolName, params, policy, context)            │
│  _callReadTool(toolName, params)                             │
│  storeProposal() / confirmProposal()                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌──────────────────┐           ┌──────────────────────┐
│  Tool Registry   │           │   Tool Firewall       │
│                  │◄──────────│                       │
│  ~41 tools       │           │  7 Security Gates:    │
│  5 categories    │           │  1. REGISTRY_CHECK    │
│  JSON schemas    │           │  2. VERSION_CHECK     │
│  Version rules   │           │  3. CATEGORY_CHECK    │
│                  │           │  4. EXTERNAL_CHECK    │
│                  │           │  5. EXECUTION_CHECK   │
│                  │           │  6. POSTURE_CHECK     │
│                  │           │  7. CONFIRMATION_CHK  │
└──────────────────┘           │  + DOMAIN_ACCESS      │
           │                   │  + ADAPTER_DELETE     │
           │                   └──────────┬────────────┘
           │                              │
           │                              ▼
           │                   ┌──────────────────────┐
           │                   │   Agent Ledger        │
           │                   │  All permission +     │
           │                   │  execution events     │
           │                   │  append-only          │
           │                   └──────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Tool Categories                         │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  READ    │  │  DRAFT   │  │  PLAN    │  │ EXECUTE  │   │
│  │          │  │          │  │          │  │          │   │
│  │ 35 tools │  │ 2 tools  │  │ 2 tools  │  │ 1 tool   │   │
│  │ v1/v2/v3 │  │ v1/v2/v3 │  │ v3 only  │  │ v3 only  │   │
│  │ safe     │  │ safe     │  │ proposal │  │ mutation │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐                                               │
│  │ RESEARCH │                                               │
│  │ 1 tool   │                                               │
│  │ v2/v3    │                                               │
│  └──────────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Principle: LLM Is the Analyst

Tools provide raw structured data. The LLM synthesizes, analyzes, and recommends.

No tool generates narrative text, analysis conclusions, risk assessments, or action recommendations. This is enforced structurally — the ANALYSIS category has been removed entirely. Entity-specific computation tools (`computeDossierStatus`, `detectOverdueTasks`, etc.) were removed because:

1. They were biased toward specific entities (1 of 13 types) with no consistent coverage
2. They duplicated what the LLM can derive directly from READ tool results
3. Some generated hardcoded description strings, violating the LLM-only constraint

The LLM gathers comprehensive context via `getEntityGraph`, `listTasks`, `listSessions`, and similar READ tools, then synthesizes its own analysis.

---

## Data Flow: Turn Pipeline

```text
User message
      │
      ▼
Chat Orchestrator
      │
      ├── detectCompositeIntent(message)
      │     → {primary, secondaries, signals}
      │
      ├── Resolution Phase
      │     ├── try _tryRunDeterministicReadList()
      │     │     → artifact (if deterministic intent matches)
      │     │     OR
      │     └── LLM Tool-Calling Loop (max 8 rounds)
      │           ├── LLM selects tool from exposed set
      │           ├── ChatAgentService._executeToolCall()
      │           │         │
      │           │         ▼
      │           │   ToolFirewall.checkPermission()
      │           │         │
      │           │         ├── Gate 1: REGISTRY_CHECK  → tool declared?
      │           │         ├── Gate 2: VERSION_CHECK   → version allowed?
      │           │         ├── Gate 3: CATEGORY_CHECK  → category in policy?
      │           │         ├── Gate 4: EXTERNAL_CHECK  → not external?
      │           │         ├── Gate 5: EXECUTION_CHECK → allowExecution set?
      │           │         ├── Gate 6: POSTURE_CHECK   → posture matches?
      │           │         ├── Gate 7: CONFIRMATION    → confirmed?
      │           │         ├── DOMAIN_ACCESS           → domain enabled?
      │           │         └── ADAPTER_DELETE          → delete permitted?
      │           │         │
      │           │         ▼
      │           │   Permission GRANTED → tool.handler(params)
      │           │   Permission DENIED  → error thrown, logged, no fallback
      │           │
      │           └── LLM produces final JSON (outputContract)
      │
      ▼
Responder Phase — buildTurnResponse({userMessage, artifact, context})
      │
      ├── selectMode({artifact, secondaries})
      │     secondaries.includes("ADVICE") → ADVISE
      │     artifact.type === "error"       → RECOVER
      │     artifact.type === "draft"       → DRAFT
      │     ambiguous artifact              → CLARIFY
      │     default                         → REPORT
      │
      ├── LLM loop paths: existingMessage passthrough (no extra call)
      ├── Deterministic paths: LLM synthesis call
      └── → {finalMessage, responseMode}
      │
      ▼
console.log("[AGENT_TURN]", {intent, artifactType, responseMode, messageLength, branch})
      │
      ▼
Response returned to router → SSE stream to frontend
```

---

## Policy Version Matrix

| Tool Category | v1  | v2  | v3  | Side Effects | Confirmation |
|---------------|-----|-----|-----|--------------|--------------|
| READ          | ✅  | ✅  | ✅  | No           | No           |
| DRAFT         | ✅  | ✅  | ✅  | No           | No           |
| RESEARCH      | ❌  | ✅  | ✅  | No           | No           |
| PLAN          | ❌  | ❌  | ⚠️  | No           | No*          |
| EXECUTE       | ❌  | ❌  | ⚠️  | Yes          | Yes          |

\* PLAN tools reach `propose_entity_mutation` / `propose_mutation_workflow` via firewall override when `explicitMutationCommand=true` or `strongMutationIntent=true`.

---

## Security Gates in Detail

### Gate 1: REGISTRY_CHECK

**Purpose**: Block undeclared tools
**Failure**: `UNDECLARED_TOOL`

### Gate 2: VERSION_CHECK

**Purpose**: Enforce per-version tool allowlist
**Failure**: `VERSION_NOT_ALLOWED`

### Gate 3: CATEGORY_CHECK

**Purpose**: Policy controls which categories are reachable
**Failure**: `CATEGORY_NOT_ALLOWED`
**Override**: Mutation proposal tools bypass this gate when explicit mutation intent is flagged in context

### Gate 4: EXTERNAL_CHECK

**Purpose**: MCP/external tools are always blocked
**Failure**: `EXTERNAL_TOOLS_DISABLED`

### Gate 5: EXECUTION_CHECK

**Purpose**: EXECUTE tools require `policy.allowExecution = true`
**Failure**: `EXECUTION_NOT_PERMITTED`

### Gate 6: POSTURE_CHECK

**Purpose**: EXECUTE tools require matching conversation posture
**Failure**: `POSTURE_MISMATCH`

### Gate 7: CONFIRMATION_CHECK

**Purpose**: Side-effect tools require `context.confirmed = true`
**Failure**: `CONFIRMATION_REQUIRED`

### Domain Access Check

**Purpose**: Per-domain data access control from frontend context
**Failure**: `DOMAIN_ACCESS_DENIED`
Multi-domain tools (universalMutation, propose_entity_mutation) resolve domain from operation params.

### Adapter Delete Check

**Purpose**: Block DELETE operations on entities where adapter sets `allowedDelete = false`
**Failure**: `DELETE_NOT_ALLOWED`

---

## Mutation Architecture

All mutations flow through a single surface: `universalMutation`.

```text
User confirms proposal
      │
      ▼
universalMutation.tool.js
      │
      ├── mutationScopeBinder         — resolve parent/child scope
      ├── fieldGovernance             — validate allowed fields
      ├── hierarchicalScopeBinder     — bind hierarchical relationships
      │
      ▼
mutation/ (consolidated module)
      ├── agentMutationProposal.service.js         — build proposals
      ├── agentMutationWorkflowProposal.service.js — multi-step workflows
      ├── agentMutationConstraintResolver.js       — resolve constraints
      ├── agentDomainConstraintEvaluator.js        — SQL domain checks
      ├── agentDomainMutationRules.js              — throw DOMAIN_MUTATION_BLOCKED
      ├── entityCreationPlanner.js                 — plan creation sequences
      ├── entityFieldRegistry.js                   — field metadata
      ├── fieldGovernance.js                       — field-level rules
      ├── hierarchicalScopeBinder.js               — scope inheritance
      ├── mutation.governance.js                   — governance layer
      └── mutation.entityTypeResolver.js           — entity type resolution
```

Domain constraints checked before any proposal is created — blocking on open child dependencies, closed parent entities, etc.

---

## Composite Intent Detection

The orchestrator detects secondary intents via `detectCompositeIntent()` in `intent.classifier.js`. This replaced the removed `detectGuidanceIntent()` keyword hack.

```text
detectCompositeIntent(message)
      │
      ├── primary: from detectReadIntent / detectDraftIntent
      ├── signals: from getIntentSignals
      └── secondaries: LLM classification prompt (5-second timeout)
            prompt: "ADVICE or NONE"
            fallback: [] (empty — no secondaries if LLM unavailable)
      │
      ▼
{primary, secondaries, signals}
      │
      └── secondaries passed to buildTurnResponse context
            → if ["ADVICE"]: mode = ADVISE
            → Responder generates advisory synthesis
```

This enables composite queries like "show client X — what should we do?" to:

1. Run the deterministic read (get client data as artifact)
2. Detect ADVICE secondary intent
3. Responder synthesizes actionable advisory response from the artifact in ADVISE mode

The hardcoded keyword list (`detectGuidanceIntent`) has been removed entirely.

---

## Tool Declaration Structure

```javascript
module.exports = {
  name: string,                    // Unique tool identifier
  category: TOOL_CATEGORIES,      // read | draft | plan | research | execute
  description: string,            // Used in LLM tool definitions
  inputSchema: JSONSchema,         // AJV-validated input
  outputSchema: JSONSchema,        // Optional output contract
  reversibility: boolean,          // Can operation be undone?
  sideEffects: boolean,            // Does tool modify state?
  allowedAgentVersions: string[], // ['v1', 'v2', 'v3']
  confirmationRequired?: boolean, // Execute tools only
  handler: async function,        // Implementation
};
```

---

## Ledger Event Types

### Tool Permission Check

```javascript
{
  type: 'tool_permission_check',
  toolName: string,
  permitted: boolean,
  reason: string,           // 'PERMITTED' or error code
  policyVersion: string,
  toolCategory: string,
  checks: [{ gate, passed, message }],
  timestamp: ISO8601
}
```

### Tool Execution

```javascript
{
  type: 'tool_execution',
  toolName: string,
  params: object,
  result?: object,
  error?: string,
  success: boolean,
  policyVersion: string,
  timestamp: ISO8601
}
```

---

## Debug Trace

The orchestrator emits `console.log("[AGENT_DEBUG]", ...)` at deterministic read decision points, capturing:

```javascript
{
  detectedIntent: string,
  hasGuidanceIntent: boolean,
  deterministicReadSkipped: boolean,
  artifactType: string,
  finalMessageLength: number,
  toolExecutionsCount: number,
  commentaryGenerated: boolean,
  commentaryReason: string,
  routerFallbackUsed: boolean,
  branch: string
}
```

This surfaces routing decisions and commentary outcomes per turn for debugging.

---

## engine/ Directory

After mutation consolidation, `engine/` retains only two non-mutation files:

- `entityAdapters.js` — adapter registry facade (snapshot hash, validation, field schemas, reversibility)
- `toolRuntime.js` — `executeToolV2` implementation bound to AgentEngine context

All mutation-related files previously in `engine/` now live in `mutation/`.
