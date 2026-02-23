'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'reference',
  'lawsuit_number',
  'dossier_id',
  'title',
  'description',
  'adversary_name',
  'adversary',
  'adversary_party',
  'adversary_lawyer',
  'court',
  'filing_date',
  'next_hearing',
  'judgment_number',
  'judgment_date',
  'reference_number',
  'status',
  'priority',
  'opened_at',
  'closed_at',
];

const REQUIRED_CREATE_FIELDS = ['dossier_id', 'title'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'priority',
  'next_hearing',
  'court',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.dossier_id) {
      throw new Error('dossier_id is required');
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
  const lawsuit = db.prepare(`
    SELECT status, priority, next_hearing, court
    FROM lawsuits
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!lawsuit) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: lawsuit.status || null,
    priority: lawsuit.priority || null,
    next_hearing: lawsuit.next_hearing || null,
    court: lawsuit.court || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Lawsuits can be deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent (cascade deletes sessions, tasks, missions)',
    },
  };
}

const FIELD_ALIASES = {
  update: {
    status: ["status", "state"],
    priority: ["priority", "urgency"],
    next_hearing: ["next hearing", "hearing date", "next session", "next court date"],
    court: ["court", "tribunal"],
  },
};

const FIELD_TYPES = {
  update: {
    status: "enum_token",
    priority: "enum_token",
    next_hearing: "date",
    court: "string",
  },
};

const VALUE_PARSERS = {
  update: {
    status: "enum_token",
    priority: "enum_token",
    next_hearing: "date",
    court: "string",
  },
};

module.exports = {
  entityType: 'lawsuit',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: false, // Risky entity — soft-delete via status change only
  fieldAliases: FIELD_ALIASES,
  fieldTypes: FIELD_TYPES,
  valueParsers: VALUE_PARSERS,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
