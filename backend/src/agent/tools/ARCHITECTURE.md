# Tool System Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Engine                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  run(message, context, agentVersion)                  │  │
│  │  • Intent Classification                              │  │
│  │  • Reasoner Selection                                 │  │
│  │  • Schema Validation                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           │ (new in Phase B)                 │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Tool Methods                                         │  │
│  │  • proposeAction(toolName, params, policy, context)   │  │
│  │  • executeAction(toolName, params, policy, context)   │  │
│  │  • callTool(toolName, params, policy, context)        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌───────────────────┐              ┌──────────────────────┐
│  Tool Registry    │              │   Tool Firewall      │
│                   │◄─────────────│                      │
│  • 16 tools       │              │  5 Security Gates:   │
│  • 4 categories   │              │  1. REGISTRY_CHECK   │
│  • Type schemas   │              │  2. VERSION_CHECK    │
│  • Version rules  │              │  3. CATEGORY_CHECK   │
│                   │              │  4. EXECUTION_CHECK  │
│                   │              │  5. CONFIRMATION_CHK │
└───────────────────┘              └──────────────────────┘
        │                                     │
        │                                     │
        │                                     ▼
        │                          ┌──────────────────────┐
        │                          │   Agent Ledger       │
        │                          │  • Permission logs   │
        │                          │  • Execution logs    │
        │                          │  • Append-only       │
        │                          └──────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                        Tool Categories                       │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐│
│  │   READ     │  │  ANALYSIS  │  │   DRAFT    │  │ EXECUTE││
│  │            │  │            │  │            │  │        ││
│  │ 6 tools    │  │ 4 tools    │  │ 3 tools    │  │ 3 stubs││
│  │ Safe       │  │ Safe       │  │ Safe       │  │ BLOCKED││
│  │ No effects │  │ No effects │  │ No effects │  │ in v1/2││
│  │            │  │            │  │            │  │        ││
│  │ v1/v2/v3   │  │ v1/v2/v3   │  │ v1/v2/v3   │  │ v3 only││
│  └────────────┘  └────────────┘  └────────────┘  └────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Tool Execution

### Successful Flow (READ/ANALYSIS/DRAFT in v1)

```
1. User Request
      │
      ▼
2. AgentEngine.callTool(toolName, params, policy)
      │
      ▼
3. ToolFirewall.checkPermission()
      │
      ├─► Gate 1: Tool in registry? ✓
      ├─► Gate 2: Version allowed? ✓
      ├─► Gate 3: Category allowed? ✓
      ├─► Gate 4: Execution permitted? N/A (not execute)
      └─► Gate 5: Confirmation? N/A (no side effects)
      │
      ▼
4. Permission GRANTED
      │
      ├─► Log to Ledger: tool_permission_check (permitted=true)
      │
      ▼
5. ToolRegistry.get(toolName)
      │
      ▼
6. Execute tool.handler(params)
      │
      ├─► Read from database
      ├─► Compute results
      └─► Return data
      │
      ▼
7. Log to Ledger: tool_execution (success=true)
      │
      ▼
8. Return result to caller
```

### Blocked Flow (EXECUTE in v1/v2)

```
1. User Request
      │
      ▼
2. AgentEngine.callTool('createTask', params, v1Policy)
      │
      ▼
3. ToolFirewall.checkPermission()
      │
      ├─► Gate 1: Tool in registry? ✓
      ├─► Gate 2: Version allowed? ✗ (v3 only)
      │
      └─► BLOCKED: VERSION_NOT_ALLOWED
      │
      ▼
4. Permission DENIED
      │
      ├─► Log to Ledger: tool_permission_check (permitted=false)
      │
      ▼
5. Throw Error
      │   reason: "VERSION_NOT_ALLOWED"
      │   message: "Tool 'createTask' is not allowed for agent version v1..."
      │   suggestedAlternative: { toolName: 'listTasks', ... }
      │
      ▼
6. Caller receives explicit error
```

---

## Policy Version Matrix

| Tool Category | v1  | v2  | v3  | Side Effects | Confirmation Required |
|--------------|-----|-----|-----|--------------|-----------------------|
| READ         | ✅  | ✅  | ✅  | No           | No                    |
| ANALYSIS     | ✅  | ✅  | ✅  | No           | No                    |
| DRAFT        | ✅  | ✅  | ✅  | No           | No                    |
| EXECUTE      | ❌  | ❌  | ⚠️  | Yes          | Yes                   |

Legend:
- ✅ Allowed
- ❌ Blocked
- ⚠️ Allowed with confirmation

---

## Security Gates in Detail

### Gate 1: REGISTRY_CHECK
**Purpose**: Prevent undeclared tools
**Check**: Tool exists in registry
**Failure**: `UNDECLARED_TOOL`

### Gate 2: VERSION_CHECK
**Purpose**: Enforce version constraints
**Check**: `policy.version` in `tool.allowedAgentVersions`
**Failure**: `VERSION_NOT_ALLOWED`

### Gate 3: CATEGORY_CHECK
**Purpose**: Enforce policy permissions
**Check**: `tool.category` in `policy.allowedToolCategories`
**Failure**: `CATEGORY_NOT_ALLOWED`

### Gate 4: EXECUTION_CHECK
**Purpose**: Prevent side effects in safe modes
**Check**: If `tool.category == 'execute'`, then `policy.allowExecution == true`
**Failure**: `EXECUTION_NOT_PERMITTED`

### Gate 5: CONFIRMATION_CHECK
**Purpose**: Require explicit approval for side effects
**Check**: If `tool.sideEffects == true` and `tool.confirmationRequired == true`, then `context.confirmed == true`
**Failure**: `CONFIRMATION_REQUIRED`

---

## Tool Declaration Structure

```javascript
{
  name: string,                    // Unique tool identifier
  category: TOOL_CATEGORIES,       // read | analysis | draft | execute
  description: string,             // Human-readable description
  inputSchema: JSONSchema,         // Input validation schema
  outputSchema: JSONSchema,        // Output validation schema
  reversibility: boolean,          // Can operation be reversed?
  sideEffects: boolean,            // Does tool modify state?
  allowedAgentVersions: string[],  // ['v1', 'v2', 'v3']
  confirmationRequired?: boolean,  // For execute tools
  handler: async function          // Implementation
}
```

---

## Ledger Event Structure

### Tool Permission Check

```javascript
{
  type: 'tool_permission_check',
  toolName: 'getClient',
  permitted: true,
  reason: 'PERMITTED',
  policyVersion: 'v1',
  toolCategory: 'read',
  checks: [
    { gate: 'REGISTRY_CHECK', passed: true, message: '...' },
    { gate: 'VERSION_CHECK', passed: true, message: '...' },
    { gate: 'CATEGORY_CHECK', passed: true, message: '...' },
    { gate: 'EXECUTION_CHECK', passed: true, message: '...' }
  ],
  timestamp: '2026-01-13T10:30:00Z'
}
```

### Tool Execution

```javascript
{
  type: 'tool_execution',
  toolName: 'getClient',
  params: { clientId: 42 },
  result: { client: { id: 42, name: '...' } },
  success: true,
  policyVersion: 'v1',
  timestamp: '2026-01-13T10:30:01Z'
}
```

---

## Category-Specific Rules

### READ Tools
- ✅ No computations beyond basic queries
- ✅ No aggregations beyond listing
- ✅ Return raw database records
- ✅ No filtering logic (client decides)
- ❌ No writes
- ❌ No side effects

### ANALYSIS Tools
- ✅ Pure functions (deterministic)
- ✅ Compute over read data
- ✅ Aggregations, statistics, scoring
- ❌ No database writes
- ❌ No predictions (only observations)
- ❌ No legal advice

### DRAFT Tools
- ✅ Generate content
- ✅ Include validation metadata
- ✅ Multiple language support
- ❌ Never persist automatically
- ❌ Never send automatically
- ❌ No database writes

### EXECUTE Tools
- ⚠️ Only in v3
- ⚠️ Require confirmation
- ⚠️ Must declare reversibility
- ✅ Can write to database
- ✅ Can send notifications
- ✅ Can schedule tasks

---

## Error Handling

### Error Structure

```javascript
{
  message: string,              // Human-readable error
  status: number,               // HTTP status code (403, 404, etc.)
  reason: string,               // Machine-readable reason code
  toolName: string,             // Tool that was attempted
  suggestedAlternative?: {      // Optional alternative
    toolName: string,
    message: string
  }
}
```

### Reason Codes

- `UNDECLARED_TOOL` — Tool not in registry
- `VERSION_NOT_ALLOWED` — Tool not allowed for agent version
- `CATEGORY_NOT_ALLOWED` — Category not allowed by policy
- `EXECUTION_NOT_PERMITTED` — Execute tools blocked in v1/v2
- `CONFIRMATION_REQUIRED` — Side effects require confirmation

---

## Testing Strategy

### Test Coverage

1. **Security Tests** (7 tests)
   - Execute blocked in v1 ✓
   - Execute blocked in v2 ✓
   - Execute blocked in v3 without confirmation ✓
   - Undeclared tool blocked ✓
   - READ allowed in v1 ✓
   - ANALYSIS allowed in v1 ✓
   - DRAFT allowed in v1 ✓

2. **Integrity Tests** (3 tests)
   - Registry has all tools ✓
   - Categories configured correctly ✓
   - Side effects declared correctly ✓

3. **Logging Tests** (2 tests)
   - Permission checks logged ✓
   - Executions logged ✓

### Run Tests

```bash
node backend/src/agent/tools/tool.firewall.test.js
```

---

## Performance Considerations

### Registry
- ✅ O(1) tool lookup (Map-based)
- ✅ Tools frozen after registration (immutable)
- ✅ No runtime compilation

### Firewall
- ✅ Fast gate checks (simple boolean logic)
- ✅ Early exit on first failure
- ✅ Minimal memory overhead

### Ledger
- ⚠️ In-memory only (Phase B)
- ⚠️ Array-based (future: database)
- ✅ Append-only (no mutations)

---

## Future Enhancements (Phase C+)

1. **LLM Tool Selection**
   - LLM proposes tools
   - Firewall validates
   - Engine executes

2. **Transaction Support**
   - Multi-tool operations
   - Rollback on failure
   - Atomic commits

3. **Tool Chaining**
   - Output of tool A → input of tool B
   - Dependency resolution
   - Pipeline execution

4. **Async Execution**
   - Long-running tools
   - Progress tracking
   - Cancellation support

5. **Persistent Ledger**
   - Database storage
   - Audit queries
   - Compliance reports

---

## Glossary

**Tool**: A first-class function with metadata (schemas, permissions, side effects)
**Registry**: Central catalog of all declared tools
**Firewall**: Security boundary that enforces permission checks
**Policy**: Agent version configuration (v1/v2/v3)
**Gate**: Individual security check within firewall
**Category**: Tool classification (read/analysis/draft/execute)
**Side Effect**: Operation that modifies state
**Reversibility**: Whether an operation can be undone
**Ledger**: Append-only log of all tool operations

---

**Last Updated**: 2026-01-13
**Phase**: B — Tools + Safety
**Status**: ✅ Complete
