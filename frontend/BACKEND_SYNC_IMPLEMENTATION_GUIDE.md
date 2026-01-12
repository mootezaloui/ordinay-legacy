# Backend Sync Implementation Guide
## Dynamic Field Options Synchronization

**Date Created:** 2025-12-24
**Purpose:** Sync custom field options across desktop app and web interface
**Current Status:** Using localStorage (desktop-only)
**Future Goal:** Backend database sync for multi-device support

---

## Table of Contents

1. [Current Implementation](#current-implementation)
2. [Why Backend Sync Is Needed](#why-backend-sync-is-needed)
3. [Architecture Design](#architecture-design)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Integration](#frontend-integration)
7. [Migration Strategy](#migration-strategy)
8. [Complete Implementation Prompt](#complete-implementation-prompt)

---

## Current Implementation

### Dynamic Fields with localStorage

We currently have **7 dynamic fields** that allow users to add custom options:

| Field | Form | Manager File | Storage Key | Defaults |
|-------|------|--------------|-------------|----------|
| **Phase** | Dossier | `phaseManager.js` | `lawyer_app_custom_phases` | 6 phases |
| **Court** | Case | `courtManager.js` | `lawyer_app_custom_courts` | 8 courts |
| **AssignedTo** | Task | `assigneeManager.js` | `lawyer_app_custom_assignees` | 2 assignees |
| **Category** | Dossier | `categoryManager.js` | `lawyer_app_custom_categories` | 7 categories |
| **Judge** | Case | `judgeManager.js` | `lawyer_app_custom_judges` | 0 defaults |
| **Adversary Lawyer** | Case/Dossier | `adversaryLawyerManager.js` | `lawyer_app_custom_adversary_lawyers` | 0 defaults |
| **Mission Type** | Mission | `missionTypeManager.js` | `lawyer_app_custom_mission_types` | 5 types |

### Manager Pattern

All managers follow the same pattern:

```javascript
// src/utils/{field}Manager.js

const STORAGE_KEY = "lawyer_app_custom_{field}s";

export function getCustom{Field}s() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function addCustom{Field}(name) {
  // Validation
  // Duplicate check
  // Save to localStorage
}

export function removeCustom{Field}(value) {
  // Remove from localStorage
}

export function getAll{Field}s(defaults = []) {
  const custom = getCustom{Field}s();
  return [...defaults, ...custom];
}
```

### Current Limitations

1. ❌ **Per-device only** - Options not synced between desktop app and web
2. ❌ **Lost if browser data cleared**
3. ❌ **No team collaboration** - Each user has separate lists
4. ❌ **No backup** - Data can be permanently lost

---

## Why Backend Sync Is Needed

### Use Case: Desktop + Web Scenario

**Problem:**
```
Desktop App (Electron):
- User adds judge "Ahmed Ben Ali"
- User adds category "Droit de la Consommation"
- Stored in app's localStorage

Web Browser:
- User logs in from another device
- Judge "Ahmed Ben Ali" NOT available ❌
- Category "Droit de la Consommation" NOT available ❌
- Must re-add manually
```

**Solution with Backend Sync:**
```
Desktop App:
- User adds judge "Ahmed Ben Ali"
- Saved to localStorage + Backend DB ✅

Web Browser:
- User logs in
- Fetches options from backend
- Judge "Ahmed Ben Ali" available ✅
- All custom options synced ✅
```

### Benefits

1. ✅ **Cross-device sync** - Same options on desktop, web, mobile
2. ✅ **Data backup** - Options stored safely in database
3. ✅ **Team collaboration** - Share options across organization (future)
4. ✅ **Offline support** - localStorage cache + backend sync
5. ✅ **Audit trail** - Track who added what, when

---

## Architecture Design

### Hybrid Approach: localStorage + Backend

**Strategy:** Use both localStorage (fast) and backend (sync)

```
┌─────────────────────────────────────────────────────────┐
│                     User Action                         │
│                  "Add Custom Phase"                     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              1. Save to localStorage (instant)          │
│                 - Fast user feedback                    │
│                 - Works offline                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              2. Sync to Backend (async)                 │
│                 - POST /api/field-options               │
│                 - Persists to database                  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              3. Sync on App Start                       │
│                 - GET /api/field-options                │
│                 - Merge with localStorage               │
│                 - Resolve conflicts                     │
└─────────────────────────────────────────────────────────┘
```

### Conflict Resolution

**Scenario:** User added option on desktop while offline, then syncs

```javascript
// Merge strategy: Union (combine both)
const localOptions = getCustomPhases();      // From localStorage
const backendOptions = await fetchPhases();  // From API

// Combine and deduplicate
const merged = [...backendOptions, ...localOptions];
const unique = Array.from(
  new Map(merged.map(item => [item.value.toLowerCase(), item])).values()
);

// Save merged result
saveToLocalStorage(unique);
```

---

## Database Schema

### New Table: `field_options`

```sql
-- backend/src/db/schema.sql

CREATE TABLE IF NOT EXISTS field_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Field identification
    field_name TEXT NOT NULL,           -- 'phase', 'court', 'assignee', etc.
    option_value TEXT NOT NULL,         -- The value (e.g., "Médiation")
    option_label TEXT NOT NULL,         -- Display label (same as value)

    -- Metadata
    is_default BOOLEAN DEFAULT 0,       -- System default (can't be deleted)
    is_active BOOLEAN DEFAULT 1,        -- Soft delete support
    display_order INTEGER DEFAULT 0,    -- Custom sorting

    -- Audit fields
    created_by INTEGER,                 -- User who added it (future)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE(field_name, option_value)    -- No duplicates per field
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_field_options_field_name
ON field_options(field_name);

CREATE INDEX IF NOT EXISTS idx_field_options_active
ON field_options(field_name, is_active);
```

### Seed Default Options

```sql
-- Insert default phases
INSERT OR IGNORE INTO field_options (field_name, option_value, option_label, is_default, display_order) VALUES
('phase', 'Ouverture', 'Ouverture', 1, 1),
('phase', 'Instruction', 'Instruction', 1, 2),
('phase', 'Négociation', 'Négociation', 1, 3),
('phase', 'Plaidoirie', 'Plaidoirie', 1, 4),
('phase', 'Jugement', 'Jugement', 1, 5),
('phase', 'Exécution', 'Exécution', 1, 6);

-- Insert default courts
INSERT OR IGNORE INTO field_options (field_name, option_value, option_label, is_default, display_order) VALUES
('court', 'Tribunal de première instance', 'Tribunal de première instance', 1, 1),
('court', 'Tribunal de première instance - Tunis', 'TPI Tunis', 1, 2),
('court', 'Tribunal de première instance - Ariana', 'TPI Ariana', 1, 3),
('court', 'Tribunal de première instance - Ben Arous', 'TPI Ben Arous', 1, 4),
('court', 'Cour d''appel', 'Cour d''appel', 1, 5),
('court', 'Cour d''Appel - Tunis', 'Cour d''Appel Tunis', 1, 6),
('court', 'Cour de cassation', 'Cour de cassation', 1, 7),
('court', 'Tribunal administratif', 'Tribunal administratif', 1, 8);

-- Insert default assignees
INSERT OR IGNORE INTO field_options (field_name, option_value, option_label, is_default, display_order) VALUES
('assignee', 'Moi-même', 'Moi-même', 1, 1),
('assignee', 'Stagiaire', 'Stagiaire', 1, 2);

-- Insert default categories
INSERT OR IGNORE INTO field_options (field_name, option_value, option_label, is_default, display_order) VALUES
('category', 'Commercial', 'Droit Commercial', 1, 1),
('category', 'Famille', 'Droit de la Famille', 1, 2),
('category', 'Pénal', 'Droit Pénal', 1, 3),
('category', 'Travail', 'Droit du Travail', 1, 4),
('category', 'Immobilier', 'Droit Immobilier', 1, 5),
('category', 'Administratif', 'Droit Administratif', 1, 6),
('category', 'Fiscal', 'Droit Fiscal', 1, 7);

-- Insert default mission types
INSERT OR IGNORE INTO field_options (field_name, option_value, option_label, is_default, display_order) VALUES
('mission_type', 'Signification', 'Signification', 1, 1),
('mission_type', 'Exécution', 'Exécution', 1, 2),
('mission_type', 'Constat', 'Constat', 1, 3),
('mission_type', 'Saisie', 'Saisie', 1, 4),
('mission_type', 'Enquête', 'Enquête', 1, 5);
```

---

## API Endpoints

### Backend Routes

**File:** `backend/src/routes/field-options.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const fieldOptionsController = require('../controllers/field-options.controller');

// Get all options for a specific field
// GET /api/field-options/:fieldName
// Example: GET /api/field-options/phase
router.get('/:fieldName', fieldOptionsController.getOptions);

// Add a new custom option
// POST /api/field-options/:fieldName
// Body: { value: "Médiation", label: "Médiation" }
router.post('/:fieldName', fieldOptionsController.createOption);

// Delete a custom option (soft delete)
// DELETE /api/field-options/:fieldName/:id
// Only custom options (is_default = false) can be deleted
router.delete('/:fieldName/:id', fieldOptionsController.deleteOption);

// Sync all field options (bulk get)
// GET /api/field-options
// Returns all fields and their options
router.get('/', fieldOptionsController.getAllOptions);

module.exports = router;
```

### Service Layer

**File:** `backend/src/services/field-options.service.js`

```javascript
const db = require('../db/connection').getDb();

const fieldOptionsService = {
  /**
   * Get all options for a specific field
   */
  getOptions: (fieldName) => {
    const sql = `
      SELECT
        id,
        field_name,
        option_value as value,
        option_label as label,
        is_default,
        display_order,
        created_at
      FROM field_options
      WHERE field_name = ? AND is_active = 1
      ORDER BY is_default DESC, display_order ASC, option_label ASC
    `;

    try {
      return db.prepare(sql).all(fieldName);
    } catch (error) {
      console.error('Error fetching field options:', error);
      throw error;
    }
  },

  /**
   * Create a new custom option
   */
  createOption: (fieldName, optionValue, optionLabel) => {
    // Check if already exists
    const existsSql = `
      SELECT id FROM field_options
      WHERE field_name = ? AND LOWER(option_value) = LOWER(?)
    `;
    const existing = db.prepare(existsSql).get(fieldName, optionValue);

    if (existing) {
      throw new Error('Cette option existe déjà');
    }

    // Insert new option
    const insertSql = `
      INSERT INTO field_options (
        field_name,
        option_value,
        option_label,
        is_default,
        is_active
      ) VALUES (?, ?, ?, 0, 1)
    `;

    try {
      const result = db.prepare(insertSql).run(
        fieldName,
        optionValue,
        optionLabel
      );

      return {
        id: result.lastInsertRowid,
        field_name: fieldName,
        value: optionValue,
        label: optionLabel,
        is_default: false,
        custom: true,
      };
    } catch (error) {
      console.error('Error creating field option:', error);
      throw error;
    }
  },

  /**
   * Delete a custom option (soft delete)
   */
  deleteOption: (fieldName, id) => {
    // Check if it's a default option
    const checkSql = `
      SELECT is_default FROM field_options
      WHERE id = ? AND field_name = ?
    `;
    const option = db.prepare(checkSql).get(id, fieldName);

    if (!option) {
      throw new Error('Option non trouvée');
    }

    if (option.is_default) {
      throw new Error('Impossible de supprimer une option par défaut');
    }

    // Soft delete
    const deleteSql = `
      UPDATE field_options
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND field_name = ?
    `;

    try {
      db.prepare(deleteSql).run(id, fieldName);
      return { success: true };
    } catch (error) {
      console.error('Error deleting field option:', error);
      throw error;
    }
  },

  /**
   * Get all field options (for bulk sync)
   */
  getAllOptions: () => {
    const sql = `
      SELECT
        field_name,
        option_value as value,
        option_label as label,
        is_default
      FROM field_options
      WHERE is_active = 1
      ORDER BY field_name, is_default DESC, display_order ASC
    `;

    try {
      const rows = db.prepare(sql).all();

      // Group by field name
      const grouped = rows.reduce((acc, row) => {
        if (!acc[row.field_name]) {
          acc[row.field_name] = [];
        }
        acc[row.field_name].push({
          value: row.value,
          label: row.label,
          custom: !row.is_default,
        });
        return acc;
      }, {});

      return grouped;
    } catch (error) {
      console.error('Error fetching all field options:', error);
      throw error;
    }
  },
};

module.exports = fieldOptionsService;
```

### Controller Layer

**File:** `backend/src/controllers/field-options.controller.js`

```javascript
const fieldOptionsService = require('../services/field-options.service');

const fieldOptionsController = {
  /**
   * GET /api/field-options/:fieldName
   */
  getOptions: (req, res) => {
    try {
      const { fieldName } = req.params;
      const options = fieldOptionsService.getOptions(fieldName);
      res.json(options);
    } catch (error) {
      console.error('Error in getOptions:', error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/field-options/:fieldName
   */
  createOption: (req, res) => {
    try {
      const { fieldName } = req.params;
      const { value, label } = req.body;

      if (!value || !label) {
        return res.status(400).json({
          error: 'Value and label are required'
        });
      }

      const newOption = fieldOptionsService.createOption(
        fieldName,
        value,
        label
      );

      res.status(201).json(newOption);
    } catch (error) {
      console.error('Error in createOption:', error);

      if (error.message.includes('existe déjà')) {
        return res.status(409).json({ error: error.message });
      }

      res.status(500).json({ error: error.message });
    }
  },

  /**
   * DELETE /api/field-options/:fieldName/:id
   */
  deleteOption: (req, res) => {
    try {
      const { fieldName, id } = req.params;
      fieldOptionsService.deleteOption(fieldName, parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error('Error in deleteOption:', error);

      if (error.message.includes('par défaut')) {
        return res.status(403).json({ error: error.message });
      }

      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/field-options
   */
  getAllOptions: (req, res) => {
    try {
      const allOptions = fieldOptionsService.getAllOptions();
      res.json(allOptions);
    } catch (error) {
      console.error('Error in getAllOptions:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = fieldOptionsController;
```

### Register Routes

**File:** `backend/src/server.js` (or `backend/src/app.js`)

```javascript
// Add this with other route imports
const fieldOptionsRoutes = require('./routes/field-options.routes');

// Register the routes
app.use('/api/field-options', fieldOptionsRoutes);
```

---

## Frontend Integration

### Updated Manager Pattern

**Example:** `src/utils/phaseManager.js`

```javascript
import { apiClient } from '../services/api/client';

const STORAGE_KEY = "lawyer_app_custom_phases";
const FIELD_NAME = "phase";

/**
 * Get custom phases from localStorage
 */
export function getCustomPhases() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom phases:", error);
    return [];
  }
}

/**
 * Sync phases from backend on app start
 */
export async function syncPhasesFromBackend() {
  try {
    // Fetch from backend
    const backendOptions = await apiClient.get(`/field-options/${FIELD_NAME}`);

    // Get local options
    const localOptions = getCustomPhases();

    // Merge (union strategy)
    const backendCustom = backendOptions
      .filter(opt => !opt.is_default)
      .map(opt => ({ value: opt.value, label: opt.label, custom: true }));

    const merged = [...backendCustom, ...localOptions];

    // Deduplicate (case-insensitive)
    const unique = Array.from(
      new Map(merged.map(item => [item.value.toLowerCase(), item])).values()
    );

    // Save merged result to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));

    return unique;
  } catch (error) {
    console.error("Error syncing phases from backend:", error);
    // Fallback to local storage if backend fails
    return getCustomPhases();
  }
}

/**
 * Add a new custom phase
 */
export async function addCustomPhase(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Le nom de phase est requis");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Le nom de phase ne peut pas être vide");
  }

  const customPhases = getCustomPhases();

  // Check if already exists (case-insensitive)
  const exists = customPhases.some(
    (phase) => phase.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("Cette phase existe déjà dans la liste");
  }

  const newPhase = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  // 1. Save to localStorage immediately (instant feedback)
  const updated = [...customPhases, newPhase];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error saving custom phase to localStorage:", error);
    throw new Error("Erreur lors de l'enregistrement local");
  }

  // 2. Sync to backend (async, non-blocking)
  try {
    await apiClient.post(`/field-options/${FIELD_NAME}`, {
      value: trimmedName,
      label: trimmedName,
    });
  } catch (error) {
    console.error("Error syncing phase to backend:", error);
    // Don't throw - localStorage save already succeeded
    // Backend will sync later
  }

  return newPhase;
}

/**
 * Remove a custom phase
 */
export async function removeCustomPhase(value) {
  const customPhases = getCustomPhases();
  const updated = customPhases.filter((phase) => phase.value !== value);

  // 1. Remove from localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom phase from localStorage:", error);
    throw new Error("Erreur lors de la suppression locale");
  }

  // 2. Remove from backend (async)
  try {
    // Find the ID from backend first
    const backendOptions = await apiClient.get(`/field-options/${FIELD_NAME}`);
    const option = backendOptions.find(opt => opt.value === value);

    if (option && !option.is_default) {
      await apiClient.delete(`/field-options/${FIELD_NAME}/${option.id}`);
    }
  } catch (error) {
    console.error("Error removing phase from backend:", error);
    // Don't throw - localStorage removal already succeeded
  }
}

/**
 * Get all phases (default + custom)
 */
export function getAllPhases(defaultPhases = []) {
  const customPhases = getCustomPhases();
  return [...defaultPhases, ...customPhases];
}
```

### App Initialization

**File:** `src/App.jsx` or `src/contexts/DataContext.jsx`

```javascript
import { useEffect } from 'react';
import {
  syncPhasesFromBackend,
  syncCourtsFromBackend,
  syncAssigneesFromBackend,
  syncCategoriesFromBackend,
  syncJudgesFromBackend,
  syncAdversaryLawyersFromBackend,
  syncMissionTypesFromBackend,
} from './utils/fieldManagers';

function App() {
  useEffect(() => {
    // Sync all field options from backend on app start
    const syncFieldOptions = async () => {
      try {
        await Promise.all([
          syncPhasesFromBackend(),
          syncCourtsFromBackend(),
          syncAssigneesFromBackend(),
          syncCategoriesFromBackend(),
          syncJudgesFromBackend(),
          syncAdversaryLawyersFromBackend(),
          syncMissionTypesFromBackend(),
        ]);
        console.log('✅ Field options synced from backend');
      } catch (error) {
        console.error('⚠️ Error syncing field options:', error);
        // App still works with localStorage fallback
      }
    };

    syncFieldOptions();
  }, []);

  return (
    // ... app content
  );
}
```

### API Client Updates

**File:** `src/services/api/client.ts`

```typescript
// Add field options methods to existing apiClient

export const apiClient = {
  // ... existing methods (get, post, put, delete)

  // Field options methods
  fieldOptions: {
    getAll: async () => {
      return apiClient.get('/field-options');
    },

    getByField: async (fieldName: string) => {
      return apiClient.get(`/field-options/${fieldName}`);
    },

    create: async (fieldName: string, value: string, label: string) => {
      return apiClient.post(`/field-options/${fieldName}`, { value, label });
    },

    delete: async (fieldName: string, id: number) => {
      return apiClient.delete(`/field-options/${fieldName}/${id}`);
    },
  },
};
```

---

## Migration Strategy

### Phase 1: Database Setup (1 hour)

1. ✅ Add `field_options` table to `schema.sql`
2. ✅ Add seed data for default options
3. ✅ Test database creation

### Phase 2: Backend API (2-3 hours)

1. ✅ Create `field-options.routes.js`
2. ✅ Create `field-options.service.js`
3. ✅ Create `field-options.controller.js`
4. ✅ Register routes in `server.js`
5. ✅ Test all endpoints with Postman/curl

### Phase 3: Frontend Updates (2-3 hours)

1. ✅ Add sync methods to all manager files
2. ✅ Update `addCustom{Field}` to save to backend
3. ✅ Update `removeCustom{Field}` to delete from backend
4. ✅ Add sync call on app initialization
5. ✅ Test all fields (add, delete, sync)

### Phase 4: Migration & Testing (1-2 hours)

1. ✅ Migrate existing localStorage data to backend
2. ✅ Test desktop app → web sync
3. ✅ Test offline → online sync
4. ✅ User acceptance testing

### Total Time Estimate: **6-9 hours**

---

## Testing Checklist

### Backend Tests

- [ ] `GET /api/field-options/phase` returns all phases
- [ ] `POST /api/field-options/phase` creates new custom phase
- [ ] `POST /api/field-options/phase` rejects duplicate
- [ ] `DELETE /api/field-options/phase/:id` deletes custom option
- [ ] `DELETE /api/field-options/phase/:id` rejects default option delete
- [ ] `GET /api/field-options` returns all fields grouped

### Frontend Tests

- [ ] App start syncs options from backend
- [ ] Adding custom option saves to localStorage + backend
- [ ] Deleting custom option removes from localStorage + backend
- [ ] Offline mode: Add works (localStorage only)
- [ ] Online mode: Sync merges localStorage + backend
- [ ] Conflict resolution: Deduplicates correctly

### End-to-End Tests

- [ ] Desktop app: Add custom phase
- [ ] Web browser: See custom phase appear
- [ ] Web browser: Add custom court
- [ ] Desktop app: See custom court appear
- [ ] Clear localStorage: Options reload from backend
- [ ] Backend down: App works with localStorage

---

## Rollback Plan

If issues occur during migration:

1. **Keep localStorage Fallback:**
   ```javascript
   // All managers already have localStorage fallback
   // Backend failures won't break the app
   ```

2. **Disable Backend Sync:**
   ```javascript
   // Comment out sync calls in App.jsx
   // useEffect(() => {
   //   syncFieldOptions(); // DISABLED
   // }, []);
   ```

3. **Revert Database:**
   ```sql
   -- Drop the table if needed
   DROP TABLE IF EXISTS field_options;
   ```

---

## Complete Implementation Prompt

**Copy this prompt when you're ready to implement backend sync:**

```
I need you to implement backend synchronization for dynamic field options in my Lawyer App.

CONTEXT:
I have a React app (desktop Electron + web) with a Node.js/Express backend using SQLite.
Currently, I have 7 dynamic fields that allow users to add custom options, stored in localStorage.

FIELDS WITH CUSTOM OPTIONS:
1. Phase (Dossier form) - phaseManager.js - storage key: lawyer_app_custom_phases
2. Court (Case form) - courtManager.js - storage key: lawyer_app_custom_courts
3. AssignedTo (Task form) - assigneeManager.js - storage key: lawyer_app_custom_assignees
4. Category (Dossier form) - categoryManager.js - storage key: lawyer_app_custom_categories
5. Judge (Case form) - judgeManager.js - storage key: lawyer_app_custom_judges
6. Adversary Lawyer (Case/Dossier) - adversaryLawyerManager.js - storage key: lawyer_app_custom_adversary_lawyers
7. Mission Type (Mission form) - missionTypeManager.js - storage key: lawyer_app_custom_mission_types

CURRENT IMPLEMENTATION:
- All managers follow the same pattern (getCustom{Field}s, addCustom{Field}, removeCustom{Field}, getAll{Field}s)
- Options stored in localStorage (per-device only)
- Located in: lawyer-app/src/utils/{field}Manager.js

BACKEND STRUCTURE:
- Database: SQLite (better-sqlite3)
- Schema: backend/src/db/schema.sql
- Routes: backend/src/routes/*.routes.js
- Services: backend/src/services/*.service.js
- Controllers: backend/src/controllers/*.controller.js

GOAL:
Implement backend sync so custom options are:
1. Saved to database when added (not just localStorage)
2. Synced across desktop app and web interface
3. Still work offline (localStorage fallback)
4. Merged intelligently (no duplicates)

IMPLEMENTATION REQUIRED:

1. DATABASE SCHEMA:
   - Create field_options table (see schema in BACKEND_SYNC_IMPLEMENTATION_GUIDE.md)
   - Add seed data for all default options
   - Add indexes for performance

2. BACKEND API:
   - Create field-options.routes.js with routes:
     - GET /api/field-options/:fieldName (get options for one field)
     - POST /api/field-options/:fieldName (create custom option)
     - DELETE /api/field-options/:fieldName/:id (delete custom option)
     - GET /api/field-options (get all fields for bulk sync)
   - Create field-options.service.js with business logic
   - Create field-options.controller.js with request handlers
   - Register routes in server.js

3. FRONTEND UPDATES:
   - Update all 7 manager files to:
     - Add syncFromBackend() method
     - Update addCustom{Field}() to save to backend
     - Update removeCustom{Field}() to delete from backend
     - Keep localStorage as cache + fallback
   - Add sync call on app initialization (App.jsx or DataContext.jsx)
   - Handle conflicts (merge localStorage + backend)

4. MIGRATION:
   - Create script to migrate existing localStorage data to backend
   - Test sync between desktop and web

REFERENCE:
See complete implementation details in:
lawyer-app/BACKEND_SYNC_IMPLEMENTATION_GUIDE.md

REQUIREMENTS:
- Use existing code patterns and architecture
- Maintain backward compatibility (localStorage fallback)
- Handle offline mode gracefully
- No breaking changes to existing functionality
- Follow error handling patterns from existing code

Please implement all components step by step, starting with the database schema, then backend API, then frontend updates.
```

---

## Additional Resources

### Related Files

- **Analysis Document:** `DYNAMIC_FIELDS_COMPREHENSIVE_ANALYSIS.md`
- **Current Managers:** `lawyer-app/src/utils/*Manager.js`
- **Form Configs:** `lawyer-app/src/components/FormModal/formConfigs.js`
- **API Client:** `lawyer-app/src/services/api/client.ts`
- **Database Schema:** `backend/src/db/schema.sql`

### Field Name Mappings

| Frontend Field | Backend field_name | Storage Key |
|----------------|-------------------|-------------|
| Phase | `phase` | `lawyer_app_custom_phases` |
| Court | `court` | `lawyer_app_custom_courts` |
| AssignedTo | `assignee` | `lawyer_app_custom_assignees` |
| Category | `category` | `lawyer_app_custom_categories` |
| Judge | `judge` | `lawyer_app_custom_judges` |
| Adversary Lawyer | `adversary_lawyer` | `lawyer_app_custom_adversary_lawyers` |
| Mission Type | `mission_type` | `lawyer_app_custom_mission_types` |

### Default Options Count

| Field | Default Options | Example Defaults |
|-------|----------------|------------------|
| Phase | 6 | Ouverture, Instruction, Négociation, ... |
| Court | 8 | TPI Tunis, TPI Ariana, Cour d'appel, ... |
| AssignedTo | 2 | Moi-même, Stagiaire |
| Category | 7 | Droit Commercial, Droit Pénal, ... |
| Judge | 0 | (none - all custom) |
| Adversary Lawyer | 0 | (none - all custom) |
| Mission Type | 5 | Signification, Exécution, Constat, ... |

---

## Notes

- **Performance:** Use bulk sync (`GET /api/field-options`) on app start, then individual endpoints for add/delete
- **Caching:** localStorage serves as cache - sync only on app start and after add/delete
- **Offline:** App fully functional offline - syncs when connection restored
- **Conflicts:** Union merge strategy (combine both sources, deduplicate)
- **Security:** Add authentication when implementing multi-user support
- **Future:** Consider real-time sync with WebSockets for team collaboration

---

**Document Version:** 1.0
**Last Updated:** 2025-12-24
**Status:** Ready for implementation when needed
