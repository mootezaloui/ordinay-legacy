# Universal Mutation Framework

## Overview

The universal mutation framework replaces per-entity execution tools with a single unified system.

**Status**: ✅ PRODUCTION READY

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ universalMutation.tool.js                               │
│ - Single tool for all mutations                         │
│ - Generates proposals with snapshot validation          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ confirmation.js                                          │
│ - Two-phase commit (PROPOSE → CONFIRM → EXECUTE)        │
│ - Snapshot hash validation                              │
│ - Idempotency via proposalStore                         │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ universalOperations.js                                   │
│ - executeCreateEntity()                                  │
│ - executeUpdateEntity()                                  │
│ - executeDeleteEntity()                                  │
│ - executeLinkEntities() (add/remove)                     │
│ - executeAttachToEntity() (note/doc_draft/file_ref)      │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ entityAdapters.js                                        │
│ - Central adapter registry                              │
│ - Snapshot hash computation                             │
│ - Payload validation                                     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Entity Adapters (task, client, dossier, session)        │
│ - Field schemas (allowed, required, update-allowed)     │
│ - Validation logic                                       │
│ - Snapshot hash computation                             │
│ - Reversibility rules                                    │
└──────────────────────────────────────────────────────────┘
```

## Operation Types

### CREATE_ENTITY

Creates a new entity of any type.

**Parameters:**
```javascript
{
  operation: 'CREATE_ENTITY',
  params: {
    entityType: 'task',
    payload: {
      title: 'Review contract',
      dossierId: 42,
      priority: 'high'
    }
  }
}
```

**Replaces:**
- `createTask.tool.js`
- Future: `createClient.tool.js`, `createDossier.tool.js`, etc.

### UPDATE_ENTITY

Updates an existing entity with field-level validation.

**Parameters:**
```javascript
{
  operation: 'UPDATE_ENTITY',
  params: {
    entityType: 'task',
    entityId: 123,
    changes: {
      status: 'done',
      priority: 'low'
    }
  }
}
```

**Replaces:**
- `updateTask.tool.js`
- `updateDocumentMetadata.tool.js`
- Future: `updateClient.tool.js`, `updateDossier.tool.js`, etc.

### DELETE_ENTITY

Soft-deletes an entity of any type.

**Parameters:**
```javascript
{
  operation: 'DELETE_ENTITY',
  params: {
    entityType: 'task',
    entityId: 123
  }
}
```

**Reversibility:** Determined per entity adapter (most deletions are irreversible).

### LINK_ENTITIES

Links or unlinks two entities (updates foreign key).

**Parameters (add):**
```javascript
{
  operation: 'LINK_ENTITIES',
  params: {
    sourceType: 'task',
    sourceId: 123,
    targetType: 'dossier',
    targetId: 42,
    linkField: 'dossierId',
    mode: 'add'           // default
  }
}
```

**Parameters (remove):**
```javascript
{
  operation: 'LINK_ENTITIES',
  params: {
    sourceType: 'task',
    sourceId: 123,
    targetType: 'dossier',
    targetId: 42,
    linkField: 'dossierId',
    mode: 'remove'        // sets linkField to null
  }
}
```

**Use cases:**
- Reassign task to different dossier
- Move session to different lawsuit
- Change parent-child relationships
- Detach entity from parent (remove)

### ATTACH_TO_ENTITY

Attaches a sub-entity to a parent. Supports `note`, `doc_draft`, and `file_ref`.

**Parameters (note):**
```javascript
{
  operation: 'ATTACH_TO_ENTITY',
  params: {
    target: { type: 'dossier', id: 42 },
    attachmentType: 'note',
    payload: { content: 'Client called to request update' }
  }
}
```

**Parameters (doc_draft):**
```javascript
{
  operation: 'ATTACH_TO_ENTITY',
  params: {
    target: { type: 'dossier', id: 42 },
    attachmentType: 'doc_draft',
    payload: { title: 'Settlement proposal', content: '...draft text...' }
  }
}
```

**Parameters (file_ref):**
```javascript
{
  operation: 'ATTACH_TO_ENTITY',
  params: {
    target: { type: 'dossier', id: 42 },
    attachmentType: 'file_ref',
    payload: { filePath: '/uploads/contract.pdf', fileName: 'contract.pdf' }
  }
}
```

**Replaces:**
- `addNote.tool.js`
- `createDocumentDraft.tool.js`

## Adapter Structure

Each entity adapter (`task.adapter.js`, `client.adapter.js`, etc.) defines:

```javascript
module.exports = {
  entityType: 'task',
  allowedFields: [...],           // All fields that can be set on creation
  requiredCreateFields: [...],    // Required fields for creation
  allowedUpdateFields: [...],     // Fields that can be updated (subset)
  validate(operation, payload),   // Validation logic
  computeSnapshotHash(entityId),  // Snapshot hash for conflict detection
  getReversibilityRules(),        // Reversibility metadata
};
```

## Snapshot Validation

Each UPDATE/LINK/ATTACH operation computes a snapshot hash BEFORE the operation:

```javascript
const hash = computeSnapshotHash('task', 123);
// Returns: "sha256:abc123..."
```

**Hash includes only mutable fields** (excludes timestamps to avoid false positives).

At confirmation time, the hash is recomputed and compared:
- ✅ Match → Execute
- ❌ Mismatch → Reject with "data changed" error

## Two-Phase Commit

1. **PROPOSE**: Tool generates ActionProposal with snapshot
2. **CONFIRM**: User approves, confirmation.js validates snapshot
3. **EXECUTE**: universalOperations dispatches to service layer

**Idempotency**: Proposals are stored for 1 hour after execution to prevent duplicate execution.

## Ledger Integration

All operations are logged:

- `proposal_stored` - When proposal is created (includes snapshot hash and params)
- `proposal_executed` - When proposal succeeds (includes before/after diff hashes)
- `proposal_execution_failed` - When proposal fails

## Adding New Entity Types

1. Create adapter in `entities/adapters/<entity>.adapter.js`
2. Register in `entityAdapters.js`
3. Add service mapping in `universalOperations.js`

No tool changes needed - universal mutation handles all entity types.

## Backward Compatibility

Legacy tools (`createTask`, `updateTask`, `addNote`) remain registered with deprecation notices.

The confirmation.js fallback ensures old proposals still execute via tool registry.

## Migration Guide

**Old way:**
```javascript
// createTask.tool.js
{
  toolName: 'createTask',
  params: {
    title: 'Review contract',
    dossierId: 42
  }
}
```

**New way:**
```javascript
// universalMutation.tool.js
{
  operation: 'CREATE_ENTITY',
  params: {
    entityType: 'task',
    payload: {
      title: 'Review contract',
      dossierId: 42
    }
  }
}
```

## Security

- **Field-level validation**: Only allowed fields can be set
- **Update restrictions**: Different fields for create vs. update
- **Snapshot validation**: Prevents race conditions
- **Two-phase commit**: User approval required for v3 execution tools
- **Version gating**: Only available in v3

## Performance

- **Snapshot computation**: O(1) - single query for mutable fields
- **Validation**: O(1) - schema-based
- **Execution**: Same as direct service calls (no overhead)

## Future Enhancements

- [ ] BATCH_MUTATE for atomic multi-entity operations
- [ ] Transaction rollback for failed multi-step operations
- [ ] Optimistic locking with version counters
- [x] Audit trail with before/after diffs (implemented in confirmation.js ledger records)
