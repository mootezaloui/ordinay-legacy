'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'entity_type',
  'entity_id',
  'content',
  'created_by',
];

const REQUIRED_CREATE_FIELDS = ['entity_type', 'entity_id', 'content'];

const ALLOWED_UPDATE_FIELDS = ['content'];

const VALID_ENTITY_TYPES = new Set([
  'client',
  'dossier',
  'lawsuit',
  'task',
  'session',
  'mission',
  'officer',
  'financial_entry',
  'document',
  'personal_task',
]);

function canonicalizeEntityType(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'financialEntry') return 'financial_entry';
  if (raw === 'personalTask') return 'personal_task';
  return raw.toLowerCase();
}

function validate(operation, payload) {
  if (operation === 'create') {
    const entityType = canonicalizeEntityType(payload.entity_type);
    const entityId = Number(payload.entity_id);
    const content = typeof payload.content === 'string' ? payload.content.trim() : '';
    if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
      throw new Error('entity_type is required and must be a supported entity type');
    }
    if (!Number.isFinite(entityId) || entityId <= 0) {
      throw new Error('entity_id is required and must be a positive integer');
    }
    if (!content) {
      throw new Error('content is required');
    }
  }

  if (operation === 'update') {
    const updateFields = Object.keys(payload || {});
    const invalidFields = updateFields.filter((f) => !ALLOWED_UPDATE_FIELDS.includes(f));
    if (invalidFields.length > 0) {
      throw new Error(
        `Cannot update fields: ${invalidFields.join(', ')}. Only ${ALLOWED_UPDATE_FIELDS.join(', ')} can be updated.`,
      );
    }
    const content = typeof payload.content === 'string' ? payload.content.trim() : '';
    if (!content) {
      throw new Error('content is required');
    }
  }

  return true;
}

function computeSnapshotHash(entityId) {
  const row = db
    .prepare(
      `SELECT entity_type, entity_id, content
       FROM notes
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(entityId);

  if (!row) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    entity_type: row.entity_type || null,
    entity_id: row.entity_id || null,
    content: row.content || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Notes can be deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Note content can be restored',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent',
    },
  };
}

module.exports = {
  entityType: 'note',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
