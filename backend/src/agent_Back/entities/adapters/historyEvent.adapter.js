'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

/**
 * History Event Adapter (READ-ONLY)
 *
 * History events are system-generated audit records.
 * They cannot be created, updated, or deleted via the agent.
 * This adapter exists only for snapshot hashing and read validation.
 */

const ALLOWED_FIELDS = [];

const REQUIRED_CREATE_FIELDS = [];

const ALLOWED_UPDATE_FIELDS = [];

function validate(operation, payload) {
  if (operation === 'create') {
    throw new Error('history_event is read-only — cannot be created via agent');
  }

  if (operation === 'update') {
    throw new Error('history_event is read-only — cannot be updated via agent');
  }

  if (operation === 'delete') {
    throw new Error('history_event is read-only — cannot be deleted via agent');
  }

  return true;
}

function computeSnapshotHash(entityId) {
  const event = db.prepare(`
    SELECT action, entity_type, entity_id
    FROM history_events
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!event) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    action: event.action || null,
    entity_type: event.entity_type || null,
    entity_id: event.entity_id || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: false,
      note: 'History events are system-generated — not available via agent',
    },
    update: {
      reversible: false,
      note: 'History events are immutable',
    },
    delete: {
      reversible: false,
      note: 'History events cannot be deleted',
    },
  };
}

module.exports = {
  entityType: 'history_event',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: false, // Read-only — no mutations
  readOnly: true,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
