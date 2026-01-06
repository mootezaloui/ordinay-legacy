# Financial Stabilization — Phase 1

> **Defensive refactor to make the existing financial system safe, predictable, and explainable.**

## Overview

This document describes the Phase 1 financial stabilization changes implemented for Organia. The goal was to fix critical issues with the existing financial system without introducing new accounting concepts or tables.

---

## What Was Fixed

### 1. Soft-Delete Instead of Destructive Deletes

**Problem:** Hard deletes were destroying financial history and causing foreign key errors.

**Solution:**
- Confirmed financial entries are **cancelled** (soft-delete) instead of deleted
- Only **draft** entries can be hard-deleted
- Cancelled entries remain in the database with:
  - `cancelled_at` timestamp
  - `cancellation_reason` (optional)
  - `deleted_at` set to mark as soft-deleted

**Backend Changes:**
- `financial.service.js`: `remove()` now checks entry status and performs soft-delete for non-drafts
- New `cancel()` function for explicit cancellation
- New `canHardDelete()` helper

**API Endpoints:**
- `DELETE /api/financial/:id` — soft-deletes confirmed entries, hard-deletes drafts
- `POST /api/financial/:id/cancel` — explicit cancellation with optional reason

---

### 2. Financial Direction (Receivable vs Payable)

**Problem:** Balance calculations mixed client obligations with internal expenses, causing false blockers on closure.

**Solution:**
- New `direction` field: `receivable` | `payable`
- **Receivable**: Client owes the firm (fees, consignment, etc.)
- **Payable**: Firm's internal expense (not a client obligation)

**Direction Assignment:**
```javascript
// Determined by entry_type and scope
direction = 'receivable' when:
  - entry_type = 'income' AND scope = 'client' | 'dossier' | 'case'
  
direction = 'payable' when:
  - entry_type = 'expense' OR scope = 'mission' | 'officer'
```

**Database Migration:**
- Added `direction` column with CHECK constraint
- Backfilled existing entries based on type/scope

---

### 3. Canonical Status Vocabulary

**Problem:** Status values were inconsistent across database, backend, and frontend.

**Solution:**
- Three canonical statuses: `draft`, `confirmed`, `cancelled`
- Legacy status mapping:

| Legacy Status | Canonical Status |
|---------------|------------------|
| `pending`     | `draft`          |
| `posted`      | `confirmed`      |
| `paid`        | `confirmed`      |
| `void`        | `cancelled`      |
| `voided`      | `cancelled`      |

**Implementation:**
- Backend: `normalizeStatus()` in `financial.service.js`
- Frontend: `normalizeFinancialStatus()` in `financialConstants.js`
- Adapter: Status normalization in `adapters.ts`

---

### 4. Blocker Logic — Only Receivables Block Closure

**Problem:** Internal expenses (payable) were incorrectly blocking client archive and dossier closure.

**Solution:**
- Only **unpaid receivable** entries block closure operations
- Payable entries (internal expenses) never block

**Updated Logic:**
```javascript
// In domainRules.js
const blockerEntries = entries.filter(entry => 
  entry.direction === 'receivable' && 
  !entry.isPaid && 
  entry.status !== 'cancelled'
);
```

**Files Changed:**
- `domainRules.js`: `getClientFinancials()` now direction-aware
- `blockerEnrichment.js`: `parseFinancialBlocker()` filters by receivable

---

### 5. Audit Trail Preservation

**Problem:** Deletes and status changes weren't being tracked.

**Solution:**
- All mutations create history events
- Cancellation includes reason and timestamp
- Previous values preserved in history payloads

**History Events:**
- `financial_entry_created`
- `financial_entry_updated`
- `financial_entry_paid`
- `financial_entry_cancelled` (new)
- `financial_entry_deleted` (only for drafts)

---

### 6. Parent Deletion Validation

**Problem:** Deleting a client/dossier could cascade-delete confirmed financial entries.

**Solution:**
- New endpoint to check if parent deletion is allowed
- Returns list of entries that would block deletion

**API Endpoint:**
- `GET /api/financial/check/:parentType/:parentId`

---

## What Was NOT Fixed (Out of Scope)

Per the requirements, this stabilization intentionally avoided:

- ❌ No new tables (invoices, payments, ledgers, accounts)
- ❌ No chart of accounts
- ❌ No journal entries or ledger posting
- ❌ No new accounting concepts
- ❌ No UI redesign
- ❌ No payment allocation system
- ❌ No multi-currency support

> **Full financial redesign is planned for Phase 2.**

---

## Database Migration

File: `backend/src/migrations/001_financial_stabilization.sql`

```sql
-- Add direction column
ALTER TABLE financial_entries 
ADD COLUMN direction TEXT CHECK(direction IN ('receivable', 'payable'));

-- Add cancellation tracking
ALTER TABLE financial_entries ADD COLUMN cancelled_at TEXT;
ALTER TABLE financial_entries ADD COLUMN cancellation_reason TEXT;

-- Backfill direction based on existing data
UPDATE financial_entries SET direction = 'receivable' 
WHERE entry_type = 'income' AND scope IN ('client', 'dossier', 'case');

UPDATE financial_entries SET direction = 'payable'
WHERE entry_type = 'expense' OR scope IN ('mission', 'officer');

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_financial_direction ON financial_entries(direction);
```

---

## API Changes Summary

| Endpoint | Method | Change |
|----------|--------|--------|
| `/api/financial/:id` | DELETE | Now soft-deletes confirmed entries |
| `/api/financial/:id/cancel` | POST | New: explicit cancellation |
| `/api/financial/client/:clientId/balance` | GET | New: receivable balance for client |
| `/api/financial/check/:parentType/:parentId` | GET | New: validate parent deletion |

---

## Frontend Changes Summary

| File | Changes |
|------|---------|
| `financialConstants.js` | Canonical statuses, direction helpers |
| `adapters.ts` | Status normalization, direction mapping |
| `financialUtils.js` | Direction-aware balance calculations |
| `domainRules.js` | Receivable-only blocker logic |
| `blockerEnrichment.js` | Direction-aware blocker messages |
| `i18n/locales/*/domain.json` | New translation keys (EN/FR/AR) |

---

## Known Limitations

1. **Migration Required:** The database migration must be run before deploying
2. **Existing Data:** Entries created before migration may have `direction = NULL` until backfill
3. **No Retroactive Cancellation:** Historical deletes cannot be recovered
4. **Status Display:** UI may show legacy status names until components are updated

---

## Testing Checklist

- [ ] Create a draft financial entry → can hard-delete
- [ ] Create a confirmed entry → delete triggers soft-delete (cancellation)
- [ ] Cancel an entry → shows cancelled status, cannot edit
- [ ] Close dossier with unpaid receivables → blocked
- [ ] Close dossier with only payables → allowed
- [ ] Archive client with unpaid receivables → blocked
- [ ] Delete draft entry → removed from database
- [ ] Check history shows cancellation events

---

## Related Files

### Backend
- [financial.service.js](backend/src/services/financial.service.js)
- [financial.controller.js](backend/src/controllers/financial.controller.js)
- [financial.routes.js](backend/src/routes/financial.routes.js)
- [001_financial_stabilization.sql](backend/src/migrations/001_financial_stabilization.sql)

### Frontend
- [financialConstants.js](src/utils/financialConstants.js)
- [financialUtils.js](src/utils/financialUtils.js)
- [adapters.ts](src/services/api/adapters.ts)
- [domainRules.js](src/services/domainRules.js)
- [blockerEnrichment.js](src/services/blockerEnrichment.js)

### i18n
- [en/domain.json](src/i18n/locales/en/domain.json)
- [fr/domain.json](src/i18n/locales/fr/domain.json)
- [ar/domain.json](src/i18n/locales/ar/domain.json)

---

*Phase 1 completed. Full financial redesign (Phase 2) will introduce proper invoicing, payments, and ledger functionality.*
