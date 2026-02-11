'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'dossier_id',
  'lawsuit_id',
  'title',
  'description',
  'assigned_to',
  'status',
  'priority',
  'due_date',
  'estimated_time',
  'completed_at',
];

const REQUIRED_CREATE_FIELDS = ['title'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'priority',
  'due_date',
  'assigned_to',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.title) {
      throw new Error('title is required');
    }
    if (!payload.dossier_id && !payload.lawsuit_id) {
      throw new Error('Either dossier_id or lawsuit_id is required');
    }
    if (payload.dossier_id && payload.lawsuit_id) {
      throw new Error('Provide either dossier_id or lawsuit_id (exclusive)');
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
  const task = db.prepare(`
    SELECT status, priority, due_date, assigned_to
    FROM tasks
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!task) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: task.status || null,
    priority: task.priority || null,
    due_date: task.due_date || null,
    assigned_to: task.assigned_to || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Tasks can be deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent (cascade deletes notes and history)',
    },
  };
}

module.exports = {
  entityType: 'task',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
