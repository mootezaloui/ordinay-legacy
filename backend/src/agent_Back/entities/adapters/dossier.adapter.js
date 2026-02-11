'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'reference',
  'client_id',
  'title',
  'description',
  'category',
  'phase',
  'adversary_name',
  'adversary_party',
  'adversary_lawyer',
  'estimated_value',
  'court_reference',
  'assigned_lawyer',
  'status',
  'priority',
  'opened_at',
  'next_deadline',
  'closed_at',
];

const REQUIRED_CREATE_FIELDS = ['client_id', 'title'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'priority',
  'phase',
  'next_deadline',
  'assigned_lawyer',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.client_id) {
      throw new Error('client_id is required');
    }
    if (!payload.title) {
      throw new Error('title is required');
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
  const dossier = db.prepare(`
    SELECT status, priority, phase, next_deadline, assigned_lawyer
    FROM dossiers
    WHERE id = ? AND deleted_at IS NULL AND validated = 1
  `).get(entityId);

  if (!dossier) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: dossier.status || null,
    priority: dossier.priority || null,
    phase: dossier.phase || null,
    next_deadline: dossier.next_deadline || null,
    assigned_lawyer: dossier.assigned_lawyer || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Dossiers can be deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent (cascade deletes all children: tasks, sessions, lawsuits, etc.)',
    },
  };
}

module.exports = {
  entityType: 'dossier',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: false,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
