# Agent Tools

**Last Updated**: 2026-03-05 (Responder layer added)
**Status**: Production

---

## Core Principle

**The LLM is the analyst. Tools are data providers.**

Tools never generate analysis, summaries, recommendations, or decisions. They fetch raw structured data. The LLM synthesizes everything from that data. This is a hard constraint — any tool that generates narrative text violates the architecture.

---

## Directory Structure

```text
tools/
├── tool.registry.js              # Central tool registry
├── tool.firewall.js              # Security gates (7 gates)
├── index.js                      # Tool loader and registry initialization
├── read/                         # READ tools — raw data retrieval (35 tools)
│   ├── getClient.tool.js
│   ├── listClients.tool.js
│   ├── searchClientsByName.tool.js
│   ├── getDossier.tool.js
│   ├── getDossierByReference.tool.js
│   ├── listDossiers.tool.js
│   ├── listDossiersForClient.tool.js
│   ├── getClientDossierSummary.tool.js
│   ├── getDossierWorkSummary.tool.js
│   ├── getLawsuit.tool.js
│   ├── listLawsuits.tool.js
│   ├── getSession.tool.js
│   ├── listSessions.tool.js
│   ├── listTasks.tool.js
│   ├── getTask.tool.js
│   ├── listPersonalTasks.tool.js
│   ├── getPersonalTask.tool.js
│   ├── listMissions.tool.js
│   ├── getMission.tool.js
│   ├── listOfficers.tool.js
│   ├── getOfficer.tool.js
│   ├── listFinancialEntries.tool.js
│   ├── getFinancialEntry.tool.js
│   ├── findClientsWithOverdueInvoices.tool.js
│   ├── listNotifications.tool.js
│   ├── getNotification.tool.js
│   ├── listDocuments.tool.js
│   ├── getDocument.tool.js
│   ├── listHistoryEvents.tool.js
│   ├── getHistoryEvent.tool.js
│   ├── getTimeline.tool.js
│   ├── getEntityGraph.tool.js    # Primary graph traversal tool
│   ├── mcpWebSearch.tool.js
│   ├── mcpLegalSearch.tool.js
│   └── mcpDeepSearch.tool.js
├── draft/                        # DRAFT tools — content generation (2 tools)
│   ├── genericDraft.tool.js
│   └── planGeneratedDocument.tool.js
├── plan/                         # PLAN tools — mutation proposals (2 tools)
│   ├── proposeEntityMutation.tool.js
│   └── proposeMutationWorkflow.tool.js
├── research/                     # RESEARCH tools — deep research (1 tool)
│   └── compileDossierResearch.tool.js
└── execute/                      # EXECUTE tools — mutations (1 tool)
    └── universalMutation.tool.js
```

---

## Tool Categories

### READ — Raw Data Retrieval

**Allowed in**: v1, v2, v3
**Side effects**: None

READ tools fetch raw entity data from the database. They do not compute, aggregate, score, or interpret. `getEntityGraph` is the primary tool for deep context — it traverses entity relationships up to a configurable depth.

Rules:

- Return raw structured records only
- No computation beyond basic SQL filtering
- No text generation
- No analysis of any kind

---

### DRAFT — Content Generation

**Allowed in**: v1, v2, v3
**Side effects**: None

DRAFT tools generate document content (letters, structured outputs) grounded in entity data. Output is never persisted or sent automatically.

Rules:

- Output only — no state mutation
- Must include `requiresValidation: true` in metadata
- Never persist or send automatically

---

### PLAN — Mutation Proposals

**Allowed in**: v3 only (explicit command or strong mutation intent)
**Side effects**: No (proposal only, not execution)

PLAN tools build structured mutation proposals that go through the confirmation workflow before any execution. They do not execute mutations directly.

- `proposeEntityMutation` — single-entity change proposal
- `proposeMutationWorkflow` — multi-step adaptive workflow proposal

Rules:

- Only reachable via `/mutate` slash command or strong mutation intent flag
- Output is a proposal contract, not an executed change
- Execution requires explicit user confirmation

---

### RESEARCH — Deep Research

**Allowed in**: v2, v3
**Side effects**: None

Research tools perform deep multi-source research and return structured findings. The LLM synthesizes findings into its response.

---

### EXECUTE — Mutation Execution

**Allowed in**: v3 only, with confirmation
**Side effects**: Yes

`universalMutation` is the single canonical mutation surface. It handles all entity create/update/delete operations across all entity types via a unified operation schema. All legacy per-entity execute wrappers have been removed.

Rules:

- v3 only, never callable in v1/v2
- Requires explicit confirmation (`context.confirmed = true`)
- All mutations pass through domain constraint evaluation before execution

---

## Responder Layer

The **Turn Responder** (`responders/turn.responder.js`) sits after the Resolution Phase in every turn.

It synthesizes the `finalMessage` the user reads from the resolved artifact and composite intent context.

### Response Modes

| Mode    | Triggered when                                    | LLM synthesis     |
|---------|---------------------------------------------------|-------------------|
| REPORT  | Primary READ, no secondaries                      | Yes / silent      |
| ADVISE  | `secondaries` includes `"ADVICE"`                 | Yes, never silent |
| CLARIFY | Ambiguous artifact or `context_suggestion` type   | Yes               |
| DRAFT   | Artifact type is `draft` or `research_contract`   | Yes               |
| RECOVER | Artifact type is `error`                          | Yes               |

### Silent Policy

`[silent]` is only permitted in REPORT mode when the artifact already contains a rich summary message. In all other modes, `finalMessage` is always non-empty.

### LLM Loop Passthrough

When the LLM tool-calling loop already produced a synthesized `finalMessage` (via `contract.content`), the responder receives it as `context.existingMessage` and returns it as-is. No extra LLM call is made for LLM loop paths.

### Composite Intent Detection

`detectCompositeIntent(message)` in `intent.classifier.js` uses a small LLM prompt to detect secondary intents (`ADVICE`, etc.) without hardcoded phrase matching. Result is passed to the responder as `context.secondaries`.

---

## What Was Removed (and Why)

### ANALYSIS category — removed entirely

The analysis category (`computeDossierStatus`, `detectOverdueTasks`, `findBlockingDependencies`, `scanOperationalRisks`) was removed because:

1. These tools were entity-biased — they hardcoded logic for 1-3 entity types out of 13 in the system
2. They duplicated what the LLM can derive from raw READ tool results
3. Some generated hardcoded description strings, violating the LLM-only analysis constraint

The LLM now gathers comprehensive context via READ tools (`getEntityGraph`, `listTasks`, `listSessions`, etc.) and synthesizes analysis itself.

### Legacy execute tools — removed

Per-entity wrappers (`createTask`, `updateTask`, `addNote`, `createDocumentDraft`, `updateDocumentMetadata`) were already disabled by env flag and fully superseded by `universalMutation`.

### Stub tools — removed

`scheduleReminder` and `prepareClientNotification` threw "not implemented" and never executed.

### Plan analysis tools — removed

`buildActionPlan`, `analyzeEntityState`, `detectPrioritySignals`, `summarizeEntityProgress` generated hardcoded template analysis text. This violated the constraint that the LLM is the sole source of analysis and recommendations.

---

## Safety Firewall

All tool calls pass through `tool.firewall.js` before execution. Gates run in order:

1. **REGISTRY_CHECK** — tool must be declared
2. **VERSION_CHECK** — tool must be allowed for agent version
3. **CATEGORY_CHECK** — category must be allowed by policy
4. **EXTERNAL_CHECK** — external tools are blocked (MCP category)
5. **EXECUTION_CHECK** — execute tools require `allowExecution=true`
6. **POSTURE_CHECK** — execute tools require matching posture
7. **CONFIRMATION_CHECK** — side-effect tools require `context.confirmed=true`

Firewall also resolves domain access per `TOOL_DOMAIN_MAP` and blocks DELETE operations on entity types where `adapter.allowedDelete === false`.

Any gate failure: execution blocked, error thrown, reason logged to ledger. No silent fallbacks.

---

## Adding a New Tool

### Step 1: Create the tool file

```javascript
// tools/read/getMyEntity.tool.js
'use strict';

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityId: { type: 'integer', minimum: 1 },
  },
  required: ['entityId'],
  additionalProperties: false,
};

async function handler({ entityId }) {
  const entity = db.prepare(
    'SELECT * FROM my_entity WHERE id = ? AND deleted_at IS NULL'
  ).get(entityId);
  return { entity: entity || null };
}

module.exports = {
  name: 'getMyEntity',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a my_entity record by ID',
  inputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
```

### Step 2: Register in `index.js`

```javascript
const getMyEntityTool = require('./read/getMyEntity.tool');

function initializeToolRegistry() {
  const registry = new ToolRegistry();
  // ... existing tools
  registry.register(getMyEntityTool);
  return registry;
}
```

### Step 3: Add domain mapping in `tool.firewall.js`

```javascript
const TOOL_DOMAIN_MAP = Object.freeze({
  // ... existing entries
  getMyEntity: 'myEntities',
});
```

### Step 4: Verify

```bash
node -e "require('./src/agent_Back/tools/index')" && echo OK
```

---

## Security Checklist

- [ ] All tools declared in registry
- [ ] All READ tools: `sideEffects: false`
- [ ] All DRAFT tools: `sideEffects: false`
- [ ] All READ/DRAFT tools: no text generation, no analysis
- [ ] EXECUTE tools: `sideEffects: true`, v3 only, `confirmationRequired: true`
- [ ] PLAN tools: only reachable via explicit mutation intent gate
- [ ] No tool generates narrative text, analysis conclusions, or recommendations
- [ ] Tool Firewall blocks v1/v2 from EXECUTE
- [ ] Tool Firewall blocks undeclared tools
- [ ] Ledger logs all permission checks
