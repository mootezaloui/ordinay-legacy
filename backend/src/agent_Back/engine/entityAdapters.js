'use strict';

/**
 * Entity Adapter Registry for V3 Universal Mutation Framework
 *
 * Defines per-entity rules (allowed fields, validation, snapshot computation)
 * without creating separate tool files for each entity type.
 *
 * Scalability: Adding a new entity = add adapter config (10 minutes)
 * instead of writing 5+ tool files.
 */

const crypto = require('crypto');
const { filterPayload, normalizeData, ensureXor, assert } = require('../services/_utils');

// ========================================
// ENTITY ADAPTER REGISTRY
// ========================================

const ENTITY_ADAPTERS = {
  task: {
    servicePath: '../../services/tasks.service',
    allowedFields: {
      create: ['dossier_id', 'lawsuit_id', 'title', 'description', 'assigned_to', 'status', 'priority', 'due_date', 'estimated_time'],
      update: ['title', 'description', 'assigned_to', 'status', 'priority', 'due_date', 'estimated_time', 'completed_at']
    },
    snapshotFields: ['id', 'title', 'status', 'dossier_id', 'lawsuit_id'],
    requiredFields: {
      create: ['title']
    },
    xorConstraints: [
      { fields: ['dossier_id', 'lawsuit_id'], message: 'Provide either dossier_id or lawsuit_id (exclusive)' }
    ],
    reversibility: true,
    relationships: {
      parent: { types: ['dossier', 'lawsuit'], mode: 'xor' }
    }
  },

  dossier: {
    servicePath: '../../services/dossiers.service',
    allowedFields: {
      create: ['reference', 'client_id', 'title', 'description', 'category', 'phase', 'adversary_name', 'adversary_party', 'adversary_lawyer', 'estimated_value', 'court_reference', 'assigned_lawyer', 'status', 'priority', 'opened_at', 'next_deadline'],
      update: ['title', 'description', 'category', 'phase', 'adversary_name', 'adversary_party', 'adversary_lawyer', 'estimated_value', 'court_reference', 'assigned_lawyer', 'status', 'priority', 'next_deadline', 'closed_at']
    },
    snapshotFields: ['id', 'reference', 'status', 'client_id'],
    requiredFields: {
      create: ['client_id', 'title']
    },
    xorConstraints: [],
    reversibility: true,
    relationships: {
      parent: { types: ['client'], mode: 'single' }
    }
  },

  client: {
    servicePath: '../../services/clients.service',
    allowedFields: {
      create: ['name', 'email', 'phone', 'alternate_phone', 'address', 'status', 'cin', 'date_of_birth', 'profession', 'company', 'tax_id', 'join_date'],
      update: ['name', 'email', 'phone', 'alternate_phone', 'address', 'status', 'cin', 'date_of_birth', 'profession', 'company', 'tax_id']
    },
    snapshotFields: ['id', 'name', 'status'],
    requiredFields: {
      create: ['name']
    },
    xorConstraints: [],
    reversibility: true,
    relationships: {}
  },

  session: {
    servicePath: '../../services/sessions.service',
    allowedFields: {
      create: ['title', 'session_type', 'status', 'scheduled_at', 'session_date', 'duration', 'location', 'court_room', 'judge', 'outcome', 'description', 'participants', 'dossier_id', 'lawsuit_id'],
      update: ['title', 'session_type', 'status', 'scheduled_at', 'session_date', 'duration', 'location', 'court_room', 'judge', 'outcome', 'description', 'participants']
    },
    snapshotFields: ['id', 'title', 'status', 'dossier_id', 'lawsuit_id'],
    requiredFields: {
      create: ['scheduled_at']
    },
    xorConstraints: [
      { fields: ['dossier_id', 'lawsuit_id'], message: 'Provide either dossier_id or lawsuit_id (exclusive)' }
    ],
    reversibility: true,
    relationships: {
      parent: { types: ['dossier', 'lawsuit'], mode: 'xor' }
    }
  },

  mission: {
    servicePath: '../../services/missions.service',
    allowedFields: {
      create: ['reference', 'title', 'description', 'mission_type', 'status', 'priority', 'assign_date', 'due_date', 'completion_date', 'closed_at', 'result', 'dossier_id', 'lawsuit_id', 'officer_id'],
      update: ['title', 'description', 'mission_type', 'status', 'priority', 'assign_date', 'due_date', 'completion_date', 'closed_at', 'result', 'officer_id']
    },
    snapshotFields: ['id', 'reference', 'status', 'dossier_id', 'lawsuit_id'],
    requiredFields: {
      create: ['title']
    },
    xorConstraints: [
      { fields: ['dossier_id', 'lawsuit_id'], message: 'Provide either dossier_id or lawsuit_id (exclusive)' }
    ],
    reversibility: true,
    relationships: {
      parent: { types: ['dossier', 'lawsuit'], mode: 'xor' }
    }
  },

  // Additional adapters can be added here: lawsuit, officer, personal_task, financial_entry, document
};

// ========================================
// ADAPTER FUNCTIONS
// ========================================

/**
 * Get adapter for entity type
 * @param {string} entityType - Entity type (task, dossier, client, etc.)
 * @returns {object} Adapter config
 * @throws {Error} If entity type not supported
 */
function getAdapter(entityType) {
  const adapter = ENTITY_ADAPTERS[entityType];
  if (!adapter) {
    throw new Error(`No adapter for entity type: ${entityType}`);
  }
  return adapter;
}

/**
 * Validate create payload
 * @param {string} entityType - Entity type
 * @param {object} payload - Create payload
 * @returns {object} Validated and normalized payload
 * @throws {Error} If validation fails
 */
function validateCreate(entityType, payload) {
  const adapter = getAdapter(entityType);

  // Filter to allowed fields
  const filtered = filterPayload(payload, adapter.allowedFields.create);

  // Normalize data (e.g., "Active" → "active")
  const normalized = normalizeData(filtered);

  // Validate required fields
  (adapter.requiredFields.create || []).forEach(field => {
    assert(normalized[field], `${field} is required`);
  });

  // Validate XOR constraints
  adapter.xorConstraints.forEach(constraint => {
    const values = constraint.fields.map(f => normalized[f]);
    ensureXor(values, constraint.message);
  });

  return normalized;
}

/**
 * Validate update changes
 * @param {string} entityType - Entity type
 * @param {number} entityId - Entity ID
 * @param {object} changes - Field-level diffs { field: { from, to } }
 * @returns {object} Validated and normalized changes (flattened to { field: value })
 * @throws {Error} If validation fails
 */
function validateUpdate(entityType, entityId, changes) {
  const adapter = getAdapter(entityType);
  const service = require(adapter.servicePath);

  // Flatten changes: { status: { from: "todo", to: "done" } } → { status: "done" }
  const flatChanges = Object.entries(changes).reduce((acc, [field, diff]) => {
    if (diff && typeof diff === 'object' && 'to' in diff) {
      acc[field] = diff.to;
    }
    return acc;
  }, {});

  // Filter to allowed fields
  const filtered = filterPayload(flatChanges, adapter.allowedFields.update);

  // Normalize data
  const normalized = normalizeData(filtered);

  // Validate XOR constraints (if relationship fields are being changed)
  adapter.xorConstraints.forEach(constraint => {
    const relevantFields = constraint.fields.filter(f => normalized[f] !== undefined);
    if (relevantFields.length > 0) {
      // Need to check XOR with current + new values
      const values = constraint.fields.map(f => {
        // Use new value if being changed, otherwise get current value from DB
        if (normalized[f] !== undefined) return normalized[f];
        const current = service.get(entityId);
        return current ? current[f] : null;
      });
      ensureXor(values, constraint.message);
    }
  });

  return normalized;
}

/**
 * Compute snapshot hash for entity
 * @param {string} entityType - Entity type
 * @param {number} entityId - Entity ID
 * @returns {string} SHA256 hash (format: "sha256:abc123...")
 * @throws {Error} If entity not found
 */
function computeSnapshotHash(entityType, entityId) {
  const adapter = getAdapter(entityType);
  const service = require(adapter.servicePath);
  const entity = service.get(entityId);

  if (!entity) {
    throw new Error(`Entity not found: ${entityType} #${entityId}`);
  }

  // Extract snapshot fields only
  const snapshot = adapter.snapshotFields.reduce((acc, field) => {
    acc[field] = entity[field];
    return acc;
  }, {});

  // Hash the snapshot
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');

  return `sha256:${hash}`;
}

module.exports = {
  ENTITY_ADAPTERS,
  getAdapter,
  validateCreate,
  validateUpdate,
  computeSnapshotHash
};
