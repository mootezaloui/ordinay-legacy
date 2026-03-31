# Domain-Aware Execution — Architecture

## The Problem

User: "Set client Leila to inactive"

What happens NOW:
```
Agent calls proposeUpdate({ entityType: "client", entityId: 7, 
  changes: { status: "inactive" } })
→ Plan Card shows: Status: Active → Inactive
→ User clicks Confirm
→ Backend tries to update → FAILS
→ Domain rules say: "Cannot set inactive — 3 open dossiers, 
   5 pending tasks, 2 unpaid invoices"
→ User sees: "Could not confirm the action"
```

What SHOULD happen:
```
Agent detects: user wants client inactive
Agent reads: getEntityGraph("client", 7, depth: 2)
Agent sees: 3 open dossiers, 5 pending tasks, 2 unpaid invoices
Agent UNDERSTANDS: setting inactive requires closing everything first
Agent proposes: a CASCADE PLAN — not a single update

"To set Leila inactive, I need to close all related work first. 
 Here's what I'll do:

 1. Mark 5 pending tasks as completed
 2. Mark 2 upcoming sessions as cancelled
 3. Close 1 active lawsuit
 4. Close 3 active dossiers
 5. Mark 2 unpaid invoices as paid
 6. Set client Leila to inactive

 This affects 13 records total. Confirm?"
```

## Why This Needs Architecture

This is NOT a "make proposeUpdate smarter" fix. It requires:

1. The agent understanding entity dependency rules
2. The agent reading the full entity graph before proposing
3. Building multi-step cascade plans
4. Executing steps in the right order (children before parents)
5. Rolling back if any step fails

This is a new capability layer.

## The Design: Domain-Aware Planning

### How It Works

The agent gets domain rules as SYSTEM PROMPT KNOWLEDGE. It doesn't 
call `canPerformAction()`. Instead, it understands the rules and 
builds cascade plans using existing tools.

```
SYSTEM PROMPT — DOMAIN RULES:

When proposing status changes, you MUST check for dependencies first.
Use getEntityGraph to see all related entities before proposing changes.

CLOSURE/DEACTIVATION RULES:
• Cannot set client inactive while they have:
  - Open dossiers (must close all dossiers first)
  - Unpaid invoices (must mark as paid or void first)

• Cannot close a dossier while it has:
  - Open lawsuits (must close all lawsuits first)
  - Pending tasks (must complete or cancel all tasks first)
  - Upcoming sessions (must complete or cancel all sessions first)
  - Active missions (must complete or cancel all missions first)
  - Unpaid invoices linked to the dossier

• Cannot close a lawsuit while it has:
  - Pending tasks (must complete or cancel first)
  - Upcoming sessions (must complete or cancel first)
  - Active missions (must complete or cancel first)

REOPENING RULES (reverse):
• Cannot reopen a dossier if parent client is inactive
• Cannot create children under a closed parent
• Reopening a dossier does NOT auto-reopen its children

DELETION RULES:
• Cannot delete a client with any dossiers (must delete/close dossiers first)
• Cannot delete a dossier with any children (tasks, lawsuits, etc.)
• Soft-delete is preferred over hard-delete

WHEN YOU DETECT A DEPENDENCY CONFLICT:
1. Call getEntityGraph to see the full picture
2. Identify ALL blockers (open tasks, unpaid invoices, etc.)
3. Build a CASCADE plan that resolves dependencies in order
4. Present the full plan to the user for confirmation
5. Execute in dependency order (deepest children first, parent last)
```

### The Cascade Plan Flow

```
User: "Set client Leila inactive"
  │
  ▼
LLM step 1: READ — get the full picture
  getEntityGraph("client", 7, depth: 2)
  → Returns: 3 dossiers (2 active, 1 closed)
    → Dossier D-51: active, 2 pending tasks, 1 upcoming session
    → Dossier D-52: active, 3 pending tasks, 1 active mission
    → Dossier D-53: closed (no blockers)
  → 2 unpaid invoices
  │
  ▼
LLM step 2: REASON — understand dependencies
  "Client has 2 active dossiers with open work.
   I need to close everything before setting inactive."
  │
  ▼
LLM step 3: PLAN — build cascade
  Calls: proposeCascade({
    goal: "Set client Leila (C-7) to inactive",
    steps: [
      // Deepest children first
      { action: "update", entityType: "task", entityId: 101, 
        changes: { status: "completed" }, 
        reason: "Complete before closing dossier D-51" },
      { action: "update", entityType: "task", entityId: 102, 
        changes: { status: "completed" }, 
        reason: "Complete before closing dossier D-51" },
      { action: "update", entityType: "session", entityId: 801, 
        changes: { status: "cancelled" }, 
        reason: "Cancel before closing dossier D-51" },
      { action: "update", entityType: "task", entityId: 103, 
        changes: { status: "completed" }, 
        reason: "Complete before closing dossier D-52" },
      { action: "update", entityType: "task", entityId: 104, 
        changes: { status: "completed" }, 
        reason: "Complete before closing dossier D-52" },
      { action: "update", entityType: "task", entityId: 105, 
        changes: { status: "completed" }, 
        reason: "Complete before closing dossier D-52" },
      { action: "update", entityType: "mission", entityId: 301, 
        changes: { status: "completed" }, 
        reason: "Complete before closing dossier D-52" },
      // Then parents
      { action: "update", entityType: "dossier", entityId: 51, 
        changes: { status: "closed" }, 
        reason: "Close before deactivating client" },
      { action: "update", entityType: "dossier", entityId: 52, 
        changes: { status: "closed" }, 
        reason: "Close before deactivating client" },
      // Financial
      { action: "update", entityType: "financialEntry", entityId: 501, 
        changes: { status: "paid" }, 
        reason: "Settle before deactivating client" },
      { action: "update", entityType: "financialEntry", entityId: 502, 
        changes: { status: "paid" }, 
        reason: "Settle before deactivating client" },
      // Root action last
      { action: "update", entityType: "client", entityId: 7, 
        changes: { status: "inactive" }, 
        reason: "Original user request" },
    ]
  })
  │
  ▼
Frontend: Cascade Plan Card
  Shows the full plan with all steps grouped by entity type.
  User can: Confirm All | Modify | Cancel
```

### The Cascade Plan Tool

```typescript
{
  name: "proposeCascade",
  category: "PLAN",
  description: "Propose a multi-step cascade operation that modifies "
    + "multiple entities in dependency order. Use when a single change "
    + "requires prerequisite changes to related entities. For example: "
    + "deactivating a client requires closing all their dossiers, which "
    + "requires completing all tasks and sessions first. The system "
    + "executes steps in order and rolls back if any step fails.",
  inputSchema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "The user's original request in plain language"
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create", "update", "delete"] },
            entityType: { type: "string" },
            entityId: { type: "integer" },
            changes: { type: "object", additionalProperties: true },
            reason: { type: "string" }
          },
          required: ["action", "entityType", "entityId"]
        },
        description: "Ordered list of operations. Execute from first to last. "
          + "Dependencies (children) must come before their parents."
      },
      totalAffected: {
        type: "integer",
        description: "Total number of records that will be modified"
      }
    },
    required: ["goal", "steps"]
  }
}
```

### The Cascade Plan Card (Frontend)

```
┌─────────────────────────────────────────────────────────┐
│ ┌──────────┐  ┌──────────────────┐                      │
│ │ CASCADE  │  │ 📋 Multi-Update  │          12 records   │
│ └──────────┘  └──────────────────┘                      │
├─────────────────────────────────────────────────────────┤
│ Set client Leila Ben Youssef to Inactive                │
│ Requires closing related work first                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 📋 Tasks (5)                                            │
│   T-101: "Prepare brief" — Pending → Completed         │
│   T-102: "File motion" — Pending → Completed           │
│   T-103: "Review contract" — Pending → Completed       │
│   T-104: "Gather exhibits" — Pending → Completed       │
│   T-105: "Send notices" — Pending → Completed          │
│                                                         │
│ 📅 Sessions (1)                                         │
│   S-801: "Hearing Mar 25" — Scheduled → Cancelled      │
│                                                         │
│ 📌 Missions (1)                                         │
│   M-301: "Document service" — Active → Completed       │
│                                                         │
│ 📁 Dossiers (2)                                         │
│   D-51: "Mansouri v. Atlas" — Active → Closed          │
│   D-52: "Property claim" — Active → Closed             │
│                                                         │
│ 💰 Invoices (2)                                         │
│   INV-501: 2,500 TND — Unpaid → Paid                   │
│   INV-502: 1,800 TND — Unpaid → Paid                   │
│                                                         │
│ 👤 Client                                               │
│   Leila Ben Youssef — Active → Inactive                 │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ⚠ This will modify 12 records. Review carefully.       │
│                        [Cancel]  [Modify]  [✓ Confirm] │
└─────────────────────────────────────────────────────────┘
```

### Cascade Execution

When user confirms, the entity executor runs steps IN ORDER:

```typescript
async function executeCascade(steps: CascadeStep[]): Promise<CascadeResult> {
  const completed: CascadeStep[] = [];
  
  for (const step of steps) {
    try {
      const service = getServiceForEntity(step.entityType);
      
      if (step.action === 'update') {
        await service.update(step.entityId, step.changes);
      } else if (step.action === 'create') {
        await service.create(step.changes);
      } else if (step.action === 'delete') {
        await service.delete(step.entityId);
      }
      
      completed.push(step);
      
    } catch (error) {
      // ROLLBACK all completed steps in reverse order
      for (const done of completed.reverse()) {
        await rollbackStep(done);
      }
      
      return {
        success: false,
        failedAt: step,
        error: error.message,
        rolledBack: completed.length
      };
    }
  }
  
  return { success: true, completed: completed.length };
}
```

### When NOT to Cascade

The agent should detect when a cascade is needed vs when a simple 
update is fine:

```
SIMPLE UPDATE (no cascade):
  "Update Leila's phone number" → proposeUpdate (single field change)
  "Change task priority to high" → proposeUpdate (no dependency impact)
  "Rename dossier D-42" → proposeUpdate (no status change)

CASCADE NEEDED:
  "Set client inactive" → check for open work → cascade if needed
  "Close this dossier" → check for pending tasks/sessions → cascade
  "Delete this client" → check for any children → cascade or block
  "Archive all old cases" → multi-entity status change → cascade

HOW THE LLM DECIDES:
  Before calling proposeUpdate with a STATUS change on a parent entity,
  ALWAYS call getEntityGraph first to check for open children.
  If open children exist → use proposeCascade.
  If no blockers → use proposeUpdate (simple single update).
```

## Implementation Tasks

```
Task 1: Create proposeCascade tool
  File: agent/tools/plan/proposeCascade.tool.ts (NEW)
  - Input: goal, steps[], totalAffected
  - Category: PLAN
  - Handler: validates step order, returns cascade proposal

Task 2: Add cascade execution to entity executor
  File: agent/engine/entity.executor.ts (UPDATE)
  - executeCascade(steps): runs steps in order
  - Rollback on failure: reverses completed steps
  - Returns structured result

Task 3: Add domain rules to system prompt
  File: agent/prompts/identity.prompt.ts (UPDATE)
  - Closure/deactivation dependency rules
  - Reopening rules
  - Deletion rules
  - Instruction: always getEntityGraph before status changes

Task 4: Create CascadePlanCard component
  File: frontend/.../cards/CascadePlanCard.tsx (NEW)
  - Groups steps by entity type
  - Shows old → new for each step
  - Shows total affected count
  - Actions: Confirm All | Modify | Cancel

Task 5: Handle cascade SSE events
  File: frontend/hooks/useAgentState.ts (UPDATE)
  - Handle plan_artifact with cascade type
  - Handle step-by-step execution progress events

Task 6: Update pending manager for cascades
  File: agent/engine/pending.manager.ts (UPDATE)
  - Store cascade plan as pending action
  - On confirmation: call executeCascade
  - On failure: emit rollback events

Task 7: Test cascade flows
  - "Set client inactive" with open dossiers → cascade plan
  - "Close dossier" with pending tasks → cascade plan
  - "Set client inactive" with no open work → simple update (no cascade)
  - Cascade with failure at step 5 → rollback steps 1-4
  - Modify cascade (remove a step, change a status)
```

## What About the Existing domainRules.js?

The existing `domainRules.js` is a FRONTEND validation layer. It stays.
It continues to protect the UI forms from invalid submissions.

The agent has its OWN domain awareness through:
1. System prompt rules (knows the dependency constraints)
2. getEntityGraph (reads the actual state before proposing)
3. proposeCascade (builds multi-step plans that satisfy constraints)

The agent does NOT call `canPerformAction()`. It doesn't need to.
It understands the rules and builds plans that satisfy them.

If the domain rules change, update BOTH:
- `domainRules.js` (frontend protection)
- System prompt domain rules section (agent awareness)

This is intentional duplication — the frontend needs instant validation 
without LLM calls, and the agent needs domain knowledge in its prompt.
