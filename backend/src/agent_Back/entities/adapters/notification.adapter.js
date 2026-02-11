'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'type',
  'sub_type',
  'template_key',
  'payload',
  'dedupe_key',
  'severity',
  'status',
  'entity_type',
  'entity_id',
  'scheduled_at',
];

const REQUIRED_CREATE_FIELDS = ['type', 'template_key', 'payload', 'dedupe_key', 'severity'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'read_at',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.type) {
      throw new Error('type is required');
    }
    if (!payload.template_key) {
      throw new Error('template_key is required');
    }
    if (!payload.dedupe_key) {
      throw new Error('dedupe_key is required');
    }
    if (!payload.severity) {
      throw new Error('severity is required');
    }
  }

  if (operation === 'update') {
    const updateFields = Object.keys(payload);
    const invalidFields = updateFields.filter(f => !ALLOWED_UPDATE_FIELDS.includes(f));
    if (invalidFields.length > 0) {
      throw new Error(`Cannot update fields: ${invalidFields.join(', ')}. Only ${ALLOWED_UPDATE_FIELDS.join(', ')} can be updated.`);
    }
  }

  return true;
}

function computeSnapshotHash(entityId) {
  const notification = db.prepare(`
    SELECT status, read_at
    FROM notifications
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!notification) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: notification.status || null,
    read_at: notification.read_at || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Notifications can be deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent',
    },
  };
}

module.exports = {
  entityType: 'notification',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true, // Safe entity — notifications can be deleted
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
