'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'scope',
  'client_id',
  'dossier_id',
  'lawsuit_id',
  'mission_id',
  'task_id',
  'personal_task_id',
  'entry_type',
  'status',
  'category',
  'amount',
  'currency',
  'occurred_at',
  'due_date',
  'paid_at',
  'title',
  'description',
  'reference',
  'direction',
];

const REQUIRED_CREATE_FIELDS = ['entry_type', 'amount'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'due_date',
  'paid_at',
  'category',
  'description',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.entry_type) {
      throw new Error('entry_type is required');
    }
    if (payload.amount === undefined || payload.amount === null) {
      throw new Error('amount is required');
    }
    if (payload.amount < 0) {
      throw new Error('amount must be >= 0');
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
  const entry = db.prepare(`
    SELECT status, due_date, paid_at, category
    FROM financial_entries
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!entry) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: entry.status || null,
    due_date: entry.due_date || null,
    paid_at: entry.paid_at || null,
    category: entry.category || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Financial entries can be soft-deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent — use cancel operation for audit trail',
    },
  };
}

const FIELD_ALIASES = {
  update: {
    status: ["status", "state"],
    due_date: ["due", "due date", "deadline"],
    paid_at: ["paid at", "paid date", "payment date"],
    category: ["category", "type"],
    description: ["description", "details", "note"],
  },
};

const FIELD_TYPES = {
  update: {
    status: "enum_token",
    due_date: "date",
    paid_at: "date",
    category: "string",
    description: "string",
  },
};

const VALUE_PARSERS = {
  update: {
    status: "enum_token",
    due_date: "date",
    paid_at: "date",
    category: "string",
    description: "string",
  },
};

module.exports = {
  entityType: 'financial_entry',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: false, // Risky entity — use cancel instead of delete
  fieldAliases: FIELD_ALIASES,
  fieldTypes: FIELD_TYPES,
  valueParsers: VALUE_PARSERS,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
