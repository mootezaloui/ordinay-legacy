# Tools

## `getEntityGraph`

Deterministic, read-only graph snapshot for Ordinay Intelligence entities.  
Uses explicit foreign-key links only.

### Input

```json
{
  "entityType": "client | dossier | lawsuit | task | mission",
  "entityId": 123,
  "depth": 1,
  "direction": "both",
  "include": ["dossiers", "lawsuits", "tasks", "missions", "sessions"],
  "accessFilter": {
    "dossiers": true,
    "lawsuits": true,
    "tasks": true,
    "missions": true,
    "sessions": true
  }
}
```

### Output

```json
{
  "root": {
    "type": "dossier",
    "id": 123,
    "name": null,
    "title": "Commercial dispute",
    "status": "open",
    "priority": "high",
    "keyDates": {
      "nextUpcoming": "2026-03-01T09:00:00.000Z",
      "createdAt": "2026-01-04T10:00:00.000Z",
      "updatedAt": "2026-02-14T08:00:00.000Z"
    },
    "flags": {
      "isUrgent": true,
      "isOverdue": false
    }
  },
  "parents": {
    "client": null,
    "dossier": null,
    "lawsuit": null
  },
  "children": {
    "lawsuits": [],
    "tasks": [],
    "missions": [],
    "sessions": []
  },
  "metrics": {
    "totalDossiers": 0,
    "totalLawsuits": 0,
    "totalTasks": 0,
    "totalMissions": 0,
    "totalSessions": 0,
    "overdueDeadlines": 0,
    "upcomingWithin7Days": 0,
    "upcomingWithin30Days": 0
  },
  "generatedAt": "2026-02-16T10:00:00.000Z"
}
```

### Behavior

- `depth=1`: direct parent and direct children only.
- `depth=2`: includes children-of-children, maximum two hops.
- `direction=up`: only parent nodes.
- `direction=down`: only children.
- `direction=both`: parent + children.
- `include`: optional child-category whitelist.
- `accessFilter`: optional child-category allow/deny map.
- Context data access (`context.dataAccess`) is always enforced in addition to `accessFilter`.
- Disabled categories are omitted from `children`.
- Unknown root entity throws structured error metadata:
  - `type: "entity_not_found"`
  - `entityType`
  - `entityId`

### Chat Mode Usage

`ChatAgentService` exposes `getEntityGraph` and includes a grounding primer so the model calls it first for entity-scoped legal requests before synthesis.
