'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'title',
  'session_type',
  'status',
  'scheduled_at',
  'session_date',
  'duration',
  'location',
  'court_room',
  'judge',
  'outcome',
  'description',
  'participants',
  'dossier_id',
  'lawsuit_id',
];

const REQUIRED_CREATE_FIELDS = ['scheduled_at'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'outcome',
  'location',
  'scheduled_at',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.scheduled_at) {
      throw new Error('scheduled_at is required');
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
  const session = db.prepare(`
    SELECT status, outcome, location, scheduled_at
    FROM sessions
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!session) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: session.status || null,
    outcome: session.outcome || null,
    location: session.location || null,
    scheduled_at: session.scheduled_at || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Sessions can be deleted',
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
  entityType: 'session',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
