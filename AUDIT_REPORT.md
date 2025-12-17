# Domain Rules Audit Report
**Date**: 2025-12-17
**Status**: INCOMPLETE - Multiple gaps identified

## Executive Summary

This audit examines all mutation entry points in the lawyer-app to ensure domain rules are enforced. The domain rules engine (`src/services/domainRules.js`) exists and contains comprehensive validation logic for Phase 1 (Terminal State Guards) and Phase 2 (Relational Mutation Guards). However, **integration is incomplete** - many mutation paths do NOT call `canPerformAction()` before executing.

**Critical Finding**: The domain rules engine exists but is NOT enforced in many critical paths. A mutation that bypasses validation is as dangerous as having no validation at all.

---

## Mutation Entry Points Identified

### 1. Table Screen Edit/Delete Buttons ❌ UNPROTECTED

**Location**: All 7 table screens
**Files**:
- `src/Screens/Dossiers.jsx` (Lines 127-143)
- `src/Screens/Cases.jsx` (Similar pattern)
- `src/Screens/Clients.jsx` (Similar pattern)
- `src/Screens/Tasks.jsx` (Lines 169-185)
- `src/Screens/Sessions.jsx` (Similar pattern)
- `src/Screens/Officers.jsx` (Similar pattern)
- `src/Screens/Accounting.jsx` (Similar pattern)

**Current Behavior**:
```javascript
// Edit button - NO VALIDATION
<IconButton
  icon="edit"
  variant="edit"
  title="Modifier"
  onClick={(e) => {
    e.stopPropagation();
    handleEdit(dossier);  // Opens modal directly
  }}
/>

// Delete button - NO VALIDATION
<IconButton
  icon="delete"
  variant="delete"
  title="Supprimer"
  onClick={(e) => {
    e.stopPropagation();
    handleDelete(dossier.id);  // Only shows confirm dialog, no domain rules
  }}
/>
```

**Problem**:
- Edit button opens `FormModal` without checking if entity can be edited
- Delete button only uses `useConfirm()` for confirmation, but does NOT call `canPerformAction(entityType, entityId, 'delete')`
- A user can edit/delete a Task that belongs to a closed Dossier
- A user can edit/delete a paid Financial Entry
- A user can delete a Dossier with open children

**Expected Behavior**:
```javascript
// Edit button - WITH VALIDATION
const handleEdit = (entity) => {
  const result = canPerformAction(entityType, entity.id, 'edit', { data: entity });
  if (!result.allowed) {
    // Show BlockerModal
    setValidationResult(result);
    setBlockerModalOpen(true);
    return;
  }
  // Proceed with edit
  setEditingEntity(entity);
  setIsModalOpen(true);
};

// Delete button - WITH VALIDATION
const handleDelete = async (id) => {
  const entity = entities.find(e => e.id === id);
  const result = canPerformAction(entityType, id, 'delete', { data: entity });

  if (!result.allowed) {
    setValidationResult(result);
    setBlockerModalOpen(true);
    return;
  }

  // Proceed with confirmation
  if (await confirm({ ... })) {
    // Delete entity
  }
};
```

**Entities Affected**:
- Dossiers (edit/delete not validated)
- Cases (edit/delete not validated)
- Clients (edit/delete not validated)
- Tasks (edit/delete not validated)
- Sessions (edit/delete not validated)
- Officers (edit/delete not validated)
- Financial Entries (edit/delete not validated)

---

### 2. FormModal Submit ❌ PARTIALLY PROTECTED

**Location**: `src/components/FormModal/FormModal.jsx` (Lines 172-184)

**Current Behavior**:
```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  if (validateForm()) {
    onSubmit(formData);  // NO domain rule validation
  } else {
    notify.warning({ ... });
  }
};
```

**Problem**:
- `FormModal` only validates required fields (empty checks)
- Does NOT call `canPerformAction()` to validate business rules
- When editing a Task from a closed Dossier, the form will accept the submission
- When editing a paid Financial Entry, the form will accept the submission

**Expected Behavior**:
FormModal should receive `entityType`, `entityId`, `entityData` props and validate before calling `onSubmit`:

```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  if (!validateForm()) {
    notify.warning({ ... });
    return;
  }

  // Domain rule validation for EDIT mode
  if (editingEntity && entityType) {
    const result = canPerformAction(entityType, editingEntity.id, 'edit', {
      data: editingEntity,
      newData: formData
    });

    if (!result.allowed) {
      // Show blockers in modal or emit to parent
      onValidationFailed(result);
      return;
    }
  }

  onSubmit(formData);
};
```

**Entities Affected**: ALL entities (Dossiers, Cases, Clients, Tasks, Sessions, Missions, Financial Entries, Officers)

---

### 3. Status Changes (Inline Selectors) ✅ PROTECTED

**Location**: `src/components/InlineSelectors/InlineStatusSelector.jsx` (Lines 62-82)

**Current Behavior**:
```javascript
const handleStatusChange = (newValue) => {
  if (entityId && entityType && entityType !== 'generic') {
    const result = canPerformAction(entityType, entityId, 'changeStatus', {
      newValue,
      currentValue: value,
      data: entityData
    });

    if (!result.allowed) {
      setPendingValue(newValue);
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }
  }

  onChange(newValue);
};
```

**Status**: ✅ PROTECTED
**Coverage**: Table status selectors and DetailView status selectors are protected

---

### 4. Priority Changes (Inline Selectors) ⚠️ NO VALIDATION REQUIRED

**Location**: `src/components/InlineSelectors/InlinePrioritySelector.jsx`

**Status**: Priority changes are NOT business-critical and do not require domain rule validation (per existing implementation pattern)

---

### 5. DetailView Quick Actions ✅ PROTECTED

**Location**: `src/components/DetailView/QuickActionsBar.jsx` (Lines 59-100)

**Current Behavior**: Status changes in DetailView quick actions are validated via `canPerformAction()`.

**Status**: ✅ PROTECTED

---

### 6. DetailView Tab Edit Actions ❌ UNPROTECTED

**Location**: `src/components/DetailView/tabs/OverviewTab.jsx` (Lines 54-108)

**Current Behavior**:
```javascript
// StructuredEditSection
const handleEdit = () => {
  // Initialize edited data
  setEditedData(initialData);
  setIsEditing(true);  // NO validation before entering edit mode
};

const handleSave = async () => {
  setIsSaving(true);
  await onSave(editedData);  // NO validation before saving
  setIsSaving(false);
  setIsEditing(false);
};
```

**Problem**:
- Edit button in overview sections does NOT validate
- Save button does NOT call `canPerformAction()` before persisting changes
- A user can edit a Task's overview fields even if it belongs to a closed Dossier

**Expected Behavior**:
```javascript
const handleEdit = () => {
  // Validate before entering edit mode
  const result = canPerformAction(entityType, entityId, 'edit', { data });
  if (!result.allowed) {
    // Show BlockerModal
    return;
  }
  setEditedData(initialData);
  setIsEditing(true);
};
```

**Entities Affected**: ALL entities with StructuredEditSection in OverviewTab

---

### 7. Financial Tab Actions ❌ UNPROTECTED

**Location**: `src/components/DetailView/tabs/FinancialTab.jsx` (Lines 135-150)

**Current Behavior**:
```javascript
const handleEdit = (entry) => {
  setEditingEntry(entry);
  setIsModalOpen(true);  // Opens modal directly, NO validation
};

const handleDelete = async (id) => {
  if (await confirm({ ... })) {
    deleteFinancialEntry(id);  // NO validation before deletion
    setRefreshKey((k) => k + 1);
  }
};

const handleStatusChange = (id, newStatus) => {
  updateFinancialEntry(id, { status: newStatus });  // NO validation
  setRefreshKey((k) => k + 1);
  showToast(...);
};
```

**Problem**:
- Financial entry edit does NOT check if entry is paid (paid entries cannot be edited)
- Financial entry delete does NOT check if entry is paid
- Status changes do NOT validate (e.g., cannot change status of paid entry)
- Does NOT check if parent Dossier is closed

**Expected Behavior**:
```javascript
const handleEdit = (entry) => {
  const result = canPerformAction('financialEntry', entry.id, 'edit', { data: entry });
  if (!result.allowed) {
    setValidationResult(result);
    setBlockerModalOpen(true);
    return;
  }
  setEditingEntry(entry);
  setIsModalOpen(true);
};
```

**Entities Affected**: All financial entries

---

### 8. PersonalTasks Screen ❌ CUSTOM IMPLEMENTATION (Not using InlineStatusSelector)

**Location**: `src/Screens/PersonalTasks.jsx` (Lines 35-75)

**Current Behavior**: PersonalTasks uses a custom `StatusDropdown` component that does NOT call `canPerformAction()`.

**Problem**:
- PersonalTasks has its own status dropdown implementation
- Does NOT use `InlineStatusSelector` (which has validation)
- No domain rules are applied to personal task status changes

**Expected Behavior**: Replace custom `StatusDropdown` with `InlineStatusSelector` and add validation.

---

### 9. Missing Entity Validators

**Location**: `src/services/domainRules.js`

**Entities with Complete Validators**: ✅
- Dossier: `changeStatus`, `close`, `archive`, `delete`
- Case: `changeStatus`, `close`, `delete`
- Client: `changeStatus`, `archive`, `delete`
- Task: `changeStatus`, `edit`, `delete`
- Session: `edit`, `delete`
- Mission: `edit`, `delete`
- FinancialEntry: `add`, `edit`, `delete`, `changeStatus`

**Entities with MISSING Validators**: ❌
- Officer: NO validators defined
- PersonalTask: NO validators defined

**Actions with MISSING Validators**: ⚠️
- All entities: `add` action (only financialEntry has it)
  - Should we validate before CREATING a Task on a closed Dossier?
  - Should we validate before CREATING a Session on a closed Case?

---

## Summary of Gaps

| Mutation Path | Status | Risk Level | Entities Affected |
|---------------|--------|------------|-------------------|
| Table Edit Buttons | ❌ UNPROTECTED | 🔴 HIGH | All 7 entity types |
| Table Delete Buttons | ❌ UNPROTECTED | 🔴 HIGH | All 7 entity types |
| FormModal Submit (Edit mode) | ❌ UNPROTECTED | 🔴 HIGH | All entities |
| FormModal Submit (Create mode) | ⚠️ UNCLEAR | 🟡 MEDIUM | All entities |
| DetailView OverviewTab Edit | ❌ UNPROTECTED | 🔴 HIGH | All entities |
| FinancialTab Edit/Delete | ❌ UNPROTECTED | 🔴 CRITICAL | Financial entries |
| FinancialTab Status Changes | ❌ UNPROTECTED | 🔴 CRITICAL | Financial entries |
| PersonalTasks Status Changes | ❌ UNPROTECTED | 🟡 MEDIUM | Personal tasks |
| Table Status Changes | ✅ PROTECTED | ✅ OK | All entities |
| DetailView Quick Actions | ✅ PROTECTED | ✅ OK | All entities |
| Missing Officer Validators | ❌ NOT DEFINED | 🟡 MEDIUM | Officers |
| Missing PersonalTask Validators | ❌ NOT DEFINED | 🟡 MEDIUM | Personal tasks |

---

## Recommended Fix Order (By Priority)

### 🔴 CRITICAL (Fix First)
1. **FinancialTab edit/delete/status changes** - Financial integrity is paramount
2. **Table delete buttons** - Prevents cascading data integrity issues
3. **FormModal submit validation** - Central mutation point

### 🔴 HIGH (Fix Second)
4. **Table edit buttons** - Prevents editing read-only entities
5. **DetailView OverviewTab edit actions** - Same as table edits

### 🟡 MEDIUM (Fix Third)
6. **PersonalTasks status changes** - Replace custom dropdown with `InlineStatusSelector`
7. **Add Officer validators** - Define edit/delete rules if applicable
8. **Add PersonalTask validators** - Define edit/delete/complete rules

### 🟢 LOW (Consider)
9. **FormModal create mode validation** - Decide if creating children on closed parents should be blocked

---

## Files Requiring Changes

1. `src/Screens/Dossiers.jsx` - Add validation to handleEdit/handleDelete
2. `src/Screens/Cases.jsx` - Add validation to handleEdit/handleDelete
3. `src/Screens/Clients.jsx` - Add validation to handleEdit/handleDelete
4. `src/Screens/Tasks.jsx` - Add validation to handleEdit/handleDelete
5. `src/Screens/Sessions.jsx` - Add validation to handleEdit/handleDelete
6. `src/Screens/Officers.jsx` - Add validation to handleEdit/handleDelete
7. `src/Screens/Accounting.jsx` - Add validation to handleEdit/handleDelete
8. `src/components/FormModal/FormModal.jsx` - Add domain rule validation to handleSubmit
9. `src/components/DetailView/tabs/OverviewTab.jsx` - Add validation to StructuredEditSection handleEdit/handleSave
10. `src/components/DetailView/tabs/FinancialTab.jsx` - Add validation to handleEdit/handleDelete/handleStatusChange
11. `src/Screens/PersonalTasks.jsx` - Replace StatusDropdown with InlineStatusSelector
12. `src/services/domainRules.js` - Add Officer and PersonalTask validators

---

## Next Steps

1. ✅ Audit complete - gaps identified
2. ⏳ Fix table screen edit/delete handlers (All 7 screens)
3. ⏳ Fix FormModal submit validation
4. ⏳ Fix FinancialTab actions
5. ⏳ Fix DetailView OverviewTab edit actions
6. ⏳ Fix PersonalTasks status changes
7. ⏳ Add missing entity validators
8. ⏳ End-to-end testing

**Bottom Line**: The domain rules engine is well-designed and comprehensive, but integration is ~40% complete. Many critical mutation paths still bypass the validation system entirely.
