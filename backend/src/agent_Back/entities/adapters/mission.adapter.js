'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'reference',
  'mission_number',
  'title',
  'description',
  'mission_type',
  'status',
  'priority',
  'assign_date',
  'due_date',
  'completion_date',
  'closed_at',
  'result',
  'notes',
  'dossier_id',
  'lawsuit_id',
  'officer_id',
];

const REQUIRED_CREATE_FIELDS = ['title'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'priority',
  'due_date',
  'result',
  'officer_id',
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
  const mission = db.prepare(`
    SELECT status, priority, due_date, result, officer_id
    FROM missions
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!mission) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: mission.status || null,
    priority: mission.priority || null,
    due_date: mission.due_date || null,
    result: mission.result || null,
    officer_id: mission.officer_id || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Missions can be deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent (cascade deletes documents and history)',
    },
  };
}

module.exports = {
  entityType: 'mission',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true, // Missions can be deleted
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
