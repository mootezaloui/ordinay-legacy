# 🧩 TODO / BUGS & FEATURES — Organia Frontend

> Status: **Pre-backend hardening phase**  
> Goal: Fix UX, edge cases, and consistency before backend integration

---

## 🐞 Bugs & Edge Cases (To Fix)


Check status fields why they are in english and make errors now.

check for domain rule when i want to close a proces with open session it blocks perfecty, but when i want to click the mark as finished it says error ( check if related to the other bug first )

check notifications, its not normally behaving, why not creating notification when CREATING/updating an entity ?

do the same as client detail screen tabs to not add tasks, dossiers, proces, unless we have the parent entity

### 👤 Client

- [x] **Client can be set to `Inactive` from table inline edit**
  - Issue: This bypasses lifecycle/domain rules
  - Expected: Status change must respect domain rules and confirmations

- [x] **Client screen toast language bug**
  - Issue: Toast message is incorrect / malformed in French

- [x] **Client birth date not visible when editing from table**
  - Location: Client list → inline edit
  - Expected: Date de naissance should be visible and pre-filled

---

### 📁 Dossier / Procès

- [x] **Category selectors UX inconsistent**
  - ✅ FIXED: Unified selector styling across all forms and views
  - Changes:
    - SearchableSelect now supports compact mode
    - Native `<select>` elements match SearchableSelect styling exactly
    - Consistent hover states, borders, padding, animations
    - Unified z-index (z-100) for dropdown menus
    - Consistent chevron icons across all selectors
  - ✅ All conditional logic preserved (parentType, linkType switching)
  - ✅ All dynamic option loading preserved
  - ✅ All hideIf/getOptions logic untouched

- [x] **Changing related Dossier from Procès detail view is dangerous**
  - Risk: Can break relational integrity (backend risk)
  - Decision needed:
    - Either lock the field after creation
    - Or require Phase 2.5 relational-impact confirmation

- [x] **Adding a Task related to a Procès throws an error**
  - Needs investigation (likely relation or validation bug)

---

### 📌 Navigation & State

- [x] **Back navigation does not respect previous context**
  - Issue: Back button ignores last screen/tab
  - Expected: Correct navigation history restoration

---

### 🧑‍⚖️ Missions / Huissier

- [x] **Mission tab shows Huissier as `N/A` after creation**
  - Location: Dossier & Procès detail views
  - Expected: Assigned huissier name visible immediately

- [x] **Huissier status mismatch between table and detail view**
  - Issue: Status values not synced
  - Expected: Single source of truth

- [x] **Mission status editable when parent Dossier is closed**
  - Issue: Violates domain rules
  - Expected: Mission becomes read-only

- [x] **Mission edit flow unstable**
  - Status: Partially fixed
  - Current problems:
    - Reassignment confirmation fires
    - Assigned huissier name sometimes missing
  - Needs cleanup and verification

- [ ] **Huissier detail view UI inconsistent**
  - Issue: Tabs/layout differ from other entities
  - Expected: Same UI language and structure

---

### 📊 Comptabilité / Finance

- [ ] **Verify full accounting logic**
  - Check:
    - Client balance correctness
    - Aggregation by client/dossier/procès
    - No double counting

---

### 🗓️ Dates & Validation Rules

- [ ] **Missing / incomplete date validation**
  - [ ] Client birth date cannot be in the future
  - [ ] Task deadline must be in the future
  - [ ] Task related to Procès must not exceed audience date
  - [ ] Session dates must be coherent

---

### 🔔 Notifications

- [x] **Unexpected notification behavior**
  - Issue: Console shows duplicate / weird triggers
  - Action: Audit notification rules and scheduler

---

### 🧾 UI / Layout Consistency

- [x] **Toast hidden behind FormModal**
  - Issue: Z-index / layering bug
  - Expected: Toast always visible above modals

- [x] **Tab counters incorrect**
  - Issue: Numbers don’t match actual data
  - Expected: Accurate counts
- [x] **Quick actions toast notifications inconsistent**
  - ✅ Updated to use centralized toast system
  - ✅ Success toasts with undo action
  - ✅ Proper context and titles for all notifications
  - ✅ Consistent 4-second duration for undo opportunities
---

## ✨ New Features (Before Backend)

### 📧 Client Communication

- [x] **Notify clients on important events**
  - ✅ User-controlled email notification system
  - ✅ Lawyer explicitly chooses whether to notify client
  - ✅ Professional French email templates (7 event types)
  - ✅ Integrated into InlineStatusSelector (status changes)
  - ✅ Integrated into FormModal (field edits, new sessions)
  - ✅ Non-blocking UX (prompts after action succeeds)
  - ✅ Email preview before sending
  - ✅ Future-ready architecture (mobile push, in-app notifications)
  - Events covered:
    - Dossier status changes (Fermé, Suspendu, Ouvert)
    - Procès status changes (Clos, Suspendu)
    - Hearing date changes
    - Session creation/cancellation (Audience type)
    - Important deadline changes (>7 days)
  - Implementation:
    - `src/services/clientCommunication.js` - Core logic
    - `src/services/emailTemplates.js` - Email templates
    - `src/components/ui/ClientNotificationPrompt.jsx` - Consent UI
  - (Frontend MVP complete, backend hook ready)

---

### 🔢 Numbering & References

- [x] **User-defined Dossier / Procès / Mission numbers**
  - ✅ Implemented with flexible reference system
  - ✅ Supports both user-defined and auto-generated references
  - ✅ Strict uniqueness enforcement across entity types
  - ✅ Auto-generation follows format: DOS-YYYY-XXX, PRO-YYYY-XXX, MIS-YYYY-XXX
  - ✅ Reference changes require confirmation (relational-impact)
  - ✅ Centralized logic in `referenceUtils.js`

---

### ➕ UX Improvements

- [x] **After FormModal creation, auto-navigate to detail view**
  - ✅ Implemented with central route resolver
  - ✅ Works for: Client, Dossier, Procès, Task, Session, Officer
  - ✅ Only navigates on CREATE, not EDIT
  - ✅ Fails silently if route cannot be resolved

- [x] **History / Audit trail**
  - ✅ Implemented read-only History tab in all entity detail views
  - ✅ Tracks lifecycle events (creation, closure, archiving)
  - ✅ Tracks status changes (old → new with timestamps)
  - ✅ Tracks assignments and reassignments (missions, tasks)
  - ✅ Centralized logging via historyService
  - ✅ Clean timeline UI with icons and chronological ordering
  - ✅ Frontend-only, append-only event system

### 📁 Document Management (Desktop-First, Future-Ready)

- [x] **Document entity & metadata**
  - ✅ Documents are first-class entities (not simple attachments)
  - ✅ Centralized metadata (name, type, size, category, createdAt)
  - ✅ Documents can be linked to multiple entities (Client, Dossier, Procès, Mission, etc.)
  - Implementation: `src/models/Document.js` with full entity model

- [x] **Storage strategy (MVP)**
  - ✅ IndexedDB for browser storage (desktop-ready)
  - ✅ Storage abstraction layer (`IStorageProvider` interface)
  - ✅ No cloud sync or backend dependency for MVP
  - ✅ Future-ready for cloud providers (architecture in place)
  - Implementation: `src/services/storage/LocalStorageProvider.js`

- [x] **Entity linking rules**
  - ✅ Uploading a document creates one Document entity
  - ✅ Documents are linked to entities via references (not duplicated)
  - ✅ Parent relationships are implicit (Procès → Dossier → Client)
  - ✅ No file size limits (suitable for desktop application)
  - Implementation: Multi-entity linking system in `documentService.js`

- [x] **Preview / open / download UX**
  - ✅ Open with system default application (browser opens in new tab)
  - ✅ Reveal file in folder (triggers download in browser)
  - ✅ Lightweight preview for PDF/images (blob URL generation)
  - ✅ Graceful handling of missing files (relink option available)
  - Implementation: Full document operations in `DocumentsTab.jsx`

- [x] **Document lifecycle & integrity**
  - ✅ Atomic deletion (storage, metadata, UI state consistent)
  - ✅ Safe handling of deleted/missing files
  - ✅ No silent data loss (rollback on storage failures)
  - ✅ Clear user feedback on document state
  - ✅ Transaction-safe IndexedDB operations
  - Implementation: Fixed in latest update (December 2025)

- [ ] **Backup & export (MVP)**
  - ❌ No export/zip functionality yet
  - ❌ No manual backup tools
  - Note: Data accessible via browser DevTools → IndexedDB (LawyerAppDocuments)
  - Note: Documents stored in localStorage (metadata) + IndexedDB (blobs)
  - Future: Add export all documents as ZIP feature


---

### ⚙️ Settings

- [ ] **Finish Settings screen**
  - Preferences
  - Notification settings
  - Future roles/permissions hooks

---

## 🧠 Notes for Code Agents

- Respect **domain rules & Phase 2.5 confirmations**
- Do NOT introduce backend assumptions unless explicitly requested
- Prefer **small, scoped fixes**
- Ask before making structural decisions

---
