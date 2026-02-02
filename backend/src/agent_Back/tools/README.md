# Agent Tools — Phase B Implementation

**Status**: ✅ Complete
**Safety Level**: CRITICAL
**Last Updated**: 2026-01-13

---

## Overview

This directory contains the **Tool Registry, Safety Firewall, and Tool Implementations** for the Organia Agent.

### ⚠️ CRITICAL SAFETY PRINCIPLES

1. **Tools are owned by the Agent Engine, NOT the LLM**
2. **LLMs never execute tools directly**
3. **LLMs never select tools directly**
4. **All tools must be declared in the registry**
5. **Undeclared tools are BLOCKED**
6. **Execute tools are BLOCKED in v1 and v2**

---

## Architecture

```
agent/tools/
├── tool.registry.js          # Central tool registry
├── tool.firewall.js          # Safety gates and execution control
├── tool.firewall.test.js     # Comprehensive test harness
├── index.js                  # Tool loader and initialization
├── read/                     # READ tools (safe, no side effects)
│   ├── getClient.tool.js
│   ├── getDossier.tool.js
│   ├── getLawsuit.tool.js
│   ├── getSession.tool.js
│   ├── listTasks.tool.js
│   └── getTimeline.tool.js
├── analysis/                 # ANALYSIS tools (pure computation)
│   ├── computeDossierStatus.tool.js
│   ├── detectOverdueTasks.tool.js
│   ├── findBlockingDependencies.tool.js
│   └── scanOperationalRisks.tool.js
├── draft/                    # DRAFT tools (output only)
│   ├── draftInvitation.tool.js
│   ├── draftClientEmail.tool.js
│   └── draftHearingSummary.tool.js
└── execute/                  # EXECUTE tools (STUBS, blocked in v1/v2)
    ├── createTask.tool.js
    ├── scheduleReminder.tool.js
    └── prepareClientNotification.tool.js
```

---

## Tool Categories

### 1️⃣ READ (Safe)

**Purpose**: Read-only access to Organia data
**Allowed in**: v1, v2, v3
**Side effects**: None
**Reversibility**: Yes (read operations don't modify data)

**Examples**:
- `getClient(clientId)` — Retrieve client record
- `getDossier(dossierId)` — Retrieve dossier with client info
- `getLawsuit(lawsuitId)` — Retrieve lawsuit with dossier info
- `getSession(sessionId)` — Retrieve session details
- `listTasks(filters)` — List tasks with filters
- `getTimeline(entityType, entityId)` — Get activity timeline

**Rules**:
- Return raw structured data only
- No computations
- No decisions
- No aggregations beyond basic listing

---

### 2️⃣ ANALYSIS (Safe, Derived)

**Purpose**: Pure computation over read data
**Allowed in**: v1, v2, v3
**Side effects**: None
**Reversibility**: Yes (deterministic computations)

**Examples**:
- `computeDossierStatus(dossierId)` — Compute derived status metrics
- `detectOverdueTasks(filters)` — Find overdue tasks with analysis
- `findBlockingDependencies(dossierId)` — Identify blockers
- `scanOperationalRisks(entityType, entityId)` — Calculate risk score

**Rules**:
- Must be deterministic (same input → same output)
- No side effects
- Output must be explainable
- No legal advice
- No predictions

---

### 3️⃣ DRAFT (Safe, Output Only)

**Purpose**: Create draft content, never persist automatically
**Allowed in**: v1, v2, v3
**Side effects**: None
**Reversibility**: Yes (drafts don't mutate state)

**Examples**:
- `draftInvitation(sessionId, language, tone)` — Draft session invitation
- `draftClientEmail(dossierId, purpose, language)` — Draft client email
- `draftHearingSummary(sessionId, language)` — Draft hearing summary

**Rules**:
- Output only
- Must include metadata:
  - `source: "agent_draft_tool"`
  - `status: "draft"`
  - `requiresValidation: true`
  - `generatedAt: ISO8601`
- Never save automatically
- Never send automatically

---

### 4️⃣ EXECUTE (Dangerous — BLOCKED in v1/v2)

**Purpose**: Perform operations with side effects
**Allowed in**: v3 ONLY (with confirmation)
**Side effects**: YES
**Reversibility**: Varies by tool

**Examples** (STUBS):
- `createTask(...)` — Create new task (NOT IMPLEMENTED)
- `scheduleReminder(...)` — Schedule reminder (NOT IMPLEMENTED)
- `prepareClientNotification(...)` — Queue notification (NOT IMPLEMENTED)

**Rules**:
- ALL execute tools are STUBS in Phase B
- BLOCKED in v1 and v2 (no exceptions)
- Require explicit confirmation in v3
- Must declare `reversibility` and `confirmationRequired`

---

## Safety Firewall

The **Tool Firewall** implements mandatory security gates.

### Gate Checks (in order)

1. **REGISTRY_CHECK**: Tool must exist in registry
2. **VERSION_CHECK**: Tool must be allowed for agent version
3. **CATEGORY_CHECK**: Tool category must be allowed by policy
4. **EXECUTION_CHECK**: Execute tools require `allowExecution=true`
5. **CONFIRMATION_CHECK**: Side-effect tools require explicit confirmation

### Rejection Handling

If ANY gate fails:
- Execution is BLOCKED
- Explicit error is thrown
- Reason is logged to ledger
- Suggested alternative may be provided
- NO silent fallback

---

## Agent Engine Integration

### Methods

#### `proposeAction(toolName, params, policy, context)`
Checks if a tool call would be permitted WITHOUT executing it.

**Returns**:
```javascript
{
  proposed: true,
  permitted: boolean,
  toolName: string,
  params: object,
  reason?: string,        // if blocked
  message?: string,       // if blocked
  suggestedAlternative?: object
}
```

#### `executeAction(toolName, params, policy, context)`
Executes a tool after permission check.

**Throws** if:
- Tool not permitted
- Tool not found
- Execution fails

#### `callTool(toolName, params, policy, context)`
Convenience method: proposes + executes.

---

## Ledger Integration

All tool operations are logged:

### Tool Permission Check
```javascript
{
  type: 'tool_permission_check',
  toolName: string,
  permitted: boolean,
  reason: string,
  policyVersion: string,
  toolCategory: string,
  checks: Array<{ gate, passed, message }>,
  timestamp: ISO8601
}
```

### Tool Execution
```javascript
{
  type: 'tool_execution',
  toolName: string,
  params: object,
  result?: object,      // if success
  error?: string,       // if failure
  success: boolean,
  policyVersion: string,
  timestamp: ISO8601
}
```

---

## Testing

### Run Test Harness

```bash
cd backend
node src/agent/tools/tool.firewall.test.js
```

### Tests Performed

1. ✅ Execute tool blocked in v1
2. ✅ Undeclared tool blocked
3. ✅ Analysis tool allowed in v1
4. ✅ Draft tool allowed in v1
5. ✅ Read tool allowed in v1
6. ✅ Execute tool blocked in v2
7. ✅ Execute tool blocked in v3 without confirmation
8. ✅ Registry integrity verified
9. ✅ Ledger logs permission checks
10. ✅ All READ tools have no side effects
11. ✅ All ANALYSIS tools have no side effects
12. ✅ All EXECUTE tools have side effects

**Result**: 12/12 tests passed ✅

---

## Usage Examples

### Example 1: Safely read client data (v1)

```javascript
const engine = new AgentEngine();
const policy = engine.policies.v1;

const result = await engine.callTool('getClient', { clientId: 42 }, policy);
// ✅ Allowed: READ tool in v1
```

### Example 2: Analyze dossier status (v1)

```javascript
const result = await engine.callTool(
  'computeDossierStatus',
  { dossierId: 10 },
  policy
);
// ✅ Allowed: ANALYSIS tool in v1
```

### Example 3: Draft client email (v1)

```javascript
const result = await engine.callTool(
  'draftClientEmail',
  {
    dossierId: 10,
    purpose: 'update',
    language: 'fr'
  },
  policy
);
// ✅ Allowed: DRAFT tool in v1
// Output includes metadata with requiresValidation: true
```

### Example 4: Attempt to create task (v1) — BLOCKED

```javascript
try {
  await engine.callTool('createTask', { title: 'New task' }, policy);
} catch (error) {
  console.log(error.reason); // "VERSION_NOT_ALLOWED"
  console.log(error.message); // "Tool 'createTask' is not allowed for agent version v1..."
  // ✅ Correctly blocked
}
```

### Example 5: Check permission before proposing to user

```javascript
const proposal = engine.proposeAction('createTask', { title: 'Task' }, policy);

if (!proposal.permitted) {
  console.log(`Cannot execute: ${proposal.message}`);
  if (proposal.suggestedAlternative) {
    console.log(`Try: ${proposal.suggestedAlternative.toolName}`);
  }
}
```

---

## Adding New Tools

### Step 1: Create Tool File

```javascript
// backend/src/agent/tools/read/getMyEntity.tool.js
'use strict';

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityId: { type: 'integer', minimum: 1 }
  },
  required: ['entityId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    entity: { type: ['object', 'null'] }
  },
  required: ['entity'],
  additionalProperties: false,
};

async function handler({ entityId }) {
  const entity = db.prepare('SELECT * FROM my_entity WHERE id = ?').get(entityId);
  return { entity: entity || null };
}

module.exports = {
  name: 'getMyEntity',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve an entity by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
```

### Step 2: Register in index.js

```javascript
// backend/src/agent/tools/index.js
const getMyEntityTool = require('./read/getMyEntity.tool');

function initializeToolRegistry() {
  const registry = new ToolRegistry();
  // ... existing tools
  registry.register(getMyEntityTool);
  return registry;
}
```

### Step 3: Test

Add a test case to `tool.firewall.test.js` and verify with:
```bash
node src/agent/tools/tool.firewall.test.js
```

---

## Security Audit Checklist

- [ ] All tools are declared in registry
- [ ] All READ tools have `sideEffects: false`
- [ ] All ANALYSIS tools have `sideEffects: false`
- [ ] All DRAFT tools have `sideEffects: false`
- [ ] All EXECUTE tools have `sideEffects: true`
- [ ] All EXECUTE tools are only in `allowedAgentVersions: ['v3']`
- [ ] All EXECUTE tools have `confirmationRequired: true`
- [ ] Tool Firewall blocks v1/v2 from calling EXECUTE tools
- [ ] Tool Firewall blocks undeclared tools
- [ ] Ledger logs all permission checks
- [ ] Test harness passes 100%

---

## Next Steps (Phase C)

Phase B is complete. Phase C will implement:

1. **LLM Integration** — Allow v3 to use external LLM reasoners
2. **EXECUTE Implementation** — Real implementations for execute tools
3. **Confirmation Flow** — User approval for side effects
4. **Rollback Mechanisms** — Undo for reversible operations
5. **External Search** — Integration with external data sources

---

## Contact

For questions or security concerns, contact the system architect.

**Remember**: If something is unsafe, BLOCK IT. No exceptions.
