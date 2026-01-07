# Intelligent Table Ordering - Documentation

## Overview

**Organia** uses domain-aware intelligent ordering for all major entity tables. This document explains the ordering logic for each entity type and the design philosophy behind it.

### Philosophy

> "Attention is a limited resource. Tables should respect it."

Tables in Organia behave like **professional worklists**, not spreadsheets. The system:

1. **Surfaces what matters first** - Urgent, active, and high-priority items appear at the top
2. **De-emphasizes completed work** - Finished items remain visible but visually quieter
3. **Maintains predictability** - Ordering is deterministic and stable
4. **Preserves user control** - Manual sorting always works and takes precedence

---

## Visual Emphasis Levels

Each row is assigned one of four visual emphasis levels:

| Level | CSS Class | Visual Treatment | When Used |
|-------|-----------|------------------|-----------|
| **Prominent** | `table-row-prominent` | Full opacity, accent left border, bold text | Urgent items (overdue, blocked, today) |
| **Normal** | `table-row-normal` | Standard styling | Active items in good standing |
| **Subdued** | `table-row-subdued` | 60% opacity, muted text color | Completed, on-hold, inactive |
| **Archived** | `table-row-archived` | 40% opacity, italic text | Cancelled, very old |

**Important**: No data is hidden. All items remain clickable and accessible.

---

## Entity-Specific Ordering Rules

### 1. Clients

**Domain Meaning of Importance:**
- Active clients represent ongoing relationships requiring attention
- Inactive clients are historical records

**Ordering Logic:**
```
1. Active clients (higher score)
2. Recently joined clients (slight boost for new relationships)
3. Inactive clients (de-emphasized)
```

**Visual Emphasis:**
- Active → `normal`
- Inactive → `subdued`

**Rationale:** A law firm's client list should show currently-served clients first. Inactive clients (former clients, dormant relationships) are important for records but don't need immediate visibility.

---

### 2. Dossiers (Case Files)

**Domain Meaning of Importance:**
- Open dossiers with high priority need immediate work
- In-progress dossiers are actively being handled
- On-hold dossiers are paused but not forgotten
- Closed dossiers are completed work

**Ordering Logic:**
```
1. Open dossiers (active work)
   - High priority (+200 points)
   - Medium priority (+100 points)
   - Low priority (+0 points)
2. In Progress dossiers
3. On Hold dossiers
4. Closed dossiers (de-emphasized)
```

**Visual Emphasis:**
- High priority + not closed → `prominent`
- Open / In Progress → `normal`
- On Hold → `subdued`
- Closed → `subdued`

**Rationale:** Open case files represent active legal work. High-priority dossiers (e.g., urgent client matters, time-sensitive cases) need to surface first. Closed dossiers are important records but shouldn't compete for attention.

---

### 3. Tasks

**Domain Meaning of Importance:**
- Overdue tasks are CRITICAL - work that's past due
- Blocked tasks need intervention to proceed
- In-progress tasks are actively being worked
- Tasks with approaching deadlines are more urgent
- Completed/cancelled tasks are done

**Ordering Logic:**
```
1. Overdue tasks (CRITICAL - highest score)
2. Blocked tasks (need attention to unblock)
3. In Progress tasks
4. Not Started tasks
   - Due today (+400 points)
   - Due this week (+200 points)
   - Due this month (+100 points)
   - High/Medium/Low priority modifiers
5. On Hold tasks
6. Completed/Done tasks (de-emphasized)
7. Cancelled tasks (archived)
```

**Visual Emphasis:**
- Overdue → `prominent`
- Blocked → `prominent`
- In Progress → `normal`
- High priority + Not Started → `normal`
- Completed/Done → `subdued`
- Cancelled → `archived`
- On Hold → `subdued`

**Rationale:** Overdue work is a legal risk. Blocked tasks represent workflow bottlenecks. The system surfaces these problems immediately rather than burying them in creation-date order.

---

### 4. Cases / Lawsuits (Procès)

**Domain Meaning of Importance:**
- Cases with imminent hearings are CRITICAL - preparation time is limited
- Active cases need ongoing attention
- Suspended/on-hold cases are paused
- Closed cases are resolved

**Ordering Logic:**
```
1. Hearing TODAY (+600 points) - CRITICAL
2. Hearing this week (+300 points)
3. Hearing this month (+100 points)
4. In Progress cases
5. On Hold / Suspended cases
6. Closed / Completed cases (de-emphasized)
```

**Visual Emphasis:**
- Hearing within 7 days → `prominent`
- In Progress → `normal`
- On Hold / Suspended → `subdued`
- Closed / Completed → `subdued`

**Rationale:** In litigation, missing a hearing is catastrophic. The system ensures cases with imminent court dates are immediately visible, regardless of when they were created.

---

### 5. Sessions / Hearings

**Domain Meaning of Importance:**
- Sessions happening TODAY are the most urgent
- Confirmed sessions this week need preparation
- Scheduled/pending sessions are planned future work
- Completed sessions are historical
- Cancelled sessions are archived

**Ordering Logic:**
```
1. Today's sessions (+700 points) - CRITICAL
2. This week's confirmed sessions (+400 points)
3. This week's scheduled sessions (+300 points)
4. This month's sessions (+100 points)
5. Pending sessions
6. Past sessions (not completed) - pushed down but not de-emphasized
7. Completed sessions (de-emphasized)
8. Cancelled sessions (archived)
```

**Visual Emphasis:**
- Today → `prominent`
- This week + Confirmed → `prominent`
- This week + Scheduled → `normal`
- Completed → `subdued`
- Cancelled → `archived`

**Rationale:** A lawyer's calendar must highlight today's commitments and upcoming week. Past sessions that weren't marked complete indicate potential record-keeping issues.

---

### 6. Officers (Huissiers / Bailiffs)

**Domain Meaning of Importance:**
- Available officers are ready for new assignments
- Busy officers are currently engaged
- Inactive officers are not available

**Ordering Logic:**
```
1. Available officers (ready for work)
2. Busy officers (currently assigned)
3. Inactive officers (de-emphasized)
```

**Visual Emphasis:**
- Available → `normal`
- Busy → `normal`
- Inactive → `subdued`

**Rationale:** When assigning a mission to an officer, you want to see who's available first. Inactive officers (retired, on leave, no longer working) should be visible for records but not prominent.

---

### 7. Missions

**Domain Meaning of Importance:**
- In-progress missions are actively being executed
- Pending/assigned missions need attention
- Missions with approaching deadlines are urgent
- Completed missions are done
- Cancelled missions are archived

**Ordering Logic:**
```
1. In Progress missions
2. Pending / Assigned missions
   - Deadline modifiers (overdue/soon)
3. On Hold missions
4. Completed / Done missions (de-emphasized)
5. Cancelled missions (archived)
```

**Visual Emphasis:**
- In Progress → `normal`
- Pending → `normal`
- On Hold → `subdued`
- Completed → `subdued`
- Cancelled → `archived`

**Rationale:** Active missions represent ongoing work that needs tracking. Completed missions are for billing and records but don't need daily attention.

---

### 8. Financial Entries

**Domain Meaning of Importance:**
- Draft entries need review and confirmation
- Confirmed entries need collection/payment
- Recent entries are more relevant than old ones
- Paid entries are settled
- Cancelled entries are void

**Ordering Logic:**
```
1. Draft entries (+700 points) - needs review
2. Confirmed entries (+600 points) - needs collection
   - Recent entries get activity bonus
   - Larger amounts get slight boost (logarithmic)
3. Paid entries (de-emphasized)
4. Cancelled entries (archived)
```

**Visual Emphasis:**
- Draft → `normal`
- Confirmed → `normal`
- Paid → `subdued`
- Cancelled → `archived`

**Rationale:** Unpaid invoices and unconfirmed entries represent potential revenue and action items. Paid entries are important for accounting but don't need daily attention.

---

### 9. Personal Tasks

**Domain Meaning of Importance:**
Same logic as regular Tasks - these are non-legal administrative items.

**Ordering Logic:**
```
1. Overdue personal tasks (CRITICAL)
2. Blocked personal tasks
3. In Progress tasks
4. Not Started tasks (by deadline proximity)
5. On Hold tasks
6. Done / Completed tasks (de-emphasized)
7. Cancelled tasks (archived)
```

---

## How Intelligent Ordering Works

### Implementation

1. **Scoring Function**: Each entity has an `calculate[Entity]Importance()` function that returns a numeric score
2. **Higher Score = More Important**: Items are sorted by descending score
3. **Tie-Breaker**: When scores are equal, items are sorted by ID for stability
4. **Visual Classification**: A separate `get[Entity]Emphasis()` function determines the CSS class

### User Override

When a user manually sorts by clicking a column header:
- Intelligent ordering is **disabled** for that session
- The user's chosen sort order takes effect
- Call `resetToIntelligentOrder()` to restore intelligent ordering

### Weight Constants

```javascript
STATUS: {
  CRITICAL: 1000,    // Blocked, overdue, urgent action needed
  ACTIVE: 800,       // In Progress, Currently being worked
  PENDING: 600,      // Scheduled, Confirmed, Awaiting action
  NEW: 500,          // Not Started, Draft, Fresh items
  ON_HOLD: 300,      // Paused but not completed
  COMPLETED: 100,    // Done, Paid, Closed
  CANCELLED: 50,     // Cancelled, Archived
}

PRIORITY: {
  HIGH: 200,
  MEDIUM: 100,
  LOW: 0,
}

DEADLINE: {
  OVERDUE: 500,      // Past due date
  TODAY: 400,        // Due today
  THIS_WEEK: 200,    // Due within 7 days
  THIS_MONTH: 100,   // Due within 30 days
  FUTURE: 0,         // Due later
}
```

---

## Tradeoffs & Design Decisions

### Why Not Hide Completed Items?

We chose de-emphasis over hiding because:
1. Users need to reference completed work
2. Hiding creates "where did my data go?" anxiety
3. Filters already allow users to hide what they don't need
4. Visual hierarchy achieves the same goal without data loss

### Why Not Use Fixed Status Sections?

Grouping by status (e.g., "Active" section, "Completed" section) was considered but rejected:
1. It breaks natural scanning flow
2. Different entities have different important statuses
3. Deadline urgency can override status importance
4. A blocked low-priority task might be more urgent than a high-priority not-started task

### Why Score-Based Rather Than Rule-Based?

A scoring system allows:
1. Multiple factors to combine naturally
2. Easy adjustment of weights
3. Extensibility for new entity types
4. Predictable, explainable ordering

---

## Maintenance Notes

### Adding a New Entity Type

1. Add an `calculate[Entity]Importance()` function to `intelligentOrdering.js`
2. Add a `get[Entity]Emphasis()` function for visual classification
3. Update the switch statements in `getImportanceCalculator()` and `getRowEmphasis()`
4. Pass `entityType` to `useAdvancedTable` in the screen component
5. Add `emphasis={table.getItemEmphasis(item)}` to the `TableRow`
6. Document the ordering rules in this file

### Adjusting Weights

All weights are defined as constants in `intelligentOrdering.js`. To adjust:
1. Modify the `WEIGHTS` object
2. Test with realistic data volumes
3. Verify the new order makes domain sense

### Testing Recommendations

- Test with 100+ items per entity type
- Include a mix of all statuses
- Include items from various date ranges
- Verify overdue items surface correctly
- Verify completed items sink but remain accessible

---

## File Reference

| File | Purpose |
|------|---------|
| `src/utils/intelligentOrdering.js` | Core ordering logic, scoring functions, emphasis classification |
| `src/hooks/useAdvancedTable.js` | Table hook with intelligent ordering integration |
| `src/components/table/TableRow.jsx` | Row component with emphasis prop support |
| `src/index.css` | CSS classes for visual emphasis levels |
| `src/Screens/*.jsx` | Screen components using intelligent ordering |

---

*Last Updated: January 2026*
*Author: Organia Development Team*
