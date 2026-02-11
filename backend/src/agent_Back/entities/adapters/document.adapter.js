'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'title',
  'file_path',
  'original_filename',
  'category',
  'mime_type',
  'size_bytes',
  'notes',
  'copy_type',
  'uploaded_by',
  'client_id',
  'dossier_id',
  'lawsuit_id',
  'mission_id',
  'task_id',
  'session_id',
  'personal_task_id',
  'financial_entry_id',
  'officer_id',
];

const REQUIRED_CREATE_FIELDS = ['title', 'file_path'];

const ALLOWED_UPDATE_FIELDS = [
  'title',
  'notes',
  'copy_type',
  'category',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.title) {
      throw new Error('title is required');
    }
    if (!payload.file_path) {
      throw new Error('file_path is required');
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
  const doc = db.prepare(`
    SELECT title, notes, copy_type, category
    FROM documents
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!doc) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    title: doc.title || null,
    notes: doc.notes || null,
    copy_type: doc.copy_type || null,
    category: doc.category || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Documents (metadata) can be deleted — file remains on disk',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Metadata updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion removes metadata record — file on disk is not affected',
    },
  };
}

module.exports = {
  entityType: 'document',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true, // Documents (drafts especially) can be deleted
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
