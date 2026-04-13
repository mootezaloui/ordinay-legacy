# Domain Model

This document captures the core data logic from `backend/src/db/schema.sql`.

## 1. Core Entity Relationships

```mermaid
erDiagram
    CLIENTS ||--o{ DOSSIERS : owns
    DOSSIERS ||--o{ LAWSUITS : contains

    DOSSIERS ||--o{ TASKS : has
    LAWSUITS ||--o{ TASKS : has

    DOSSIERS ||--o{ SESSIONS : schedules
    LAWSUITS ||--o{ SESSIONS : schedules

    DOSSIERS ||--o{ MISSIONS : plans
    LAWSUITS ||--o{ MISSIONS : plans
    OFFICERS ||--o{ MISSIONS : executes

    CLIENTS ||--o{ FINANCIAL_ENTRIES : tracks
    DOSSIERS ||--o{ FINANCIAL_ENTRIES : links
    LAWSUITS ||--o{ FINANCIAL_ENTRIES : links
    MISSIONS ||--o{ FINANCIAL_ENTRIES : links

    CLIENTS ||--o{ DOCUMENTS : files
    DOSSIERS ||--o{ DOCUMENTS : files
    LAWSUITS ||--o{ DOCUMENTS : files
    TASKS ||--o{ DOCUMENTS : files
    SESSIONS ||--o{ DOCUMENTS : files
    MISSIONS ||--o{ DOCUMENTS : files
    FINANCIAL_ENTRIES ||--o{ DOCUMENTS : files
    OFFICERS ||--o{ DOCUMENTS : files
    PERSONAL_TASKS ||--o{ DOCUMENTS : files
```

## 2. Logic Invariants (Critical)

1. `Task ownership XOR`  
   A `task` must belong to exactly one parent: `dossier_id` or `lawsuit_id` (not both).

2. `Session ownership XOR`  
   A `session` must link to either a dossier or a lawsuit.

3. `Mission ownership XOR`  
   A `mission` must link to either a dossier or a lawsuit.

4. `Document single-target rule`  
   A `document` must be attached to exactly one entity type.

5. `Dossier/Lawsuit status vocabularies`  
   Status and priority are constrained by strict `CHECK` sets.

6. `Protected referential integrity`  
   Most core foreign keys use `ON DELETE RESTRICT` to avoid accidental cascade loss.

## 3. Lifecycle and Traceability

- `history_events`: immutable operational trace for entity lifecycle changes.
- `notes`: contextual human notes attached to domain entities.
- `notifications` + `dismissed_notifications`: proactive reminders and dedupe logic.
- `document_chunks` + `fts_document_chunks`: searchable document intelligence layer.

## 4. Why This Design Matters

- The data model encodes legal workflow semantics, not only storage.
- Entity constraints reduce inconsistent states before application code is reached.
- Relations support both operational UI and AI/tool-assisted reasoning paths.
