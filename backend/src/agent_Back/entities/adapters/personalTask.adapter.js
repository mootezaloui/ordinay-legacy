'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'title',
  'description',
  'category',
  'status',
  'priority',
  'due_date',
  'completed_at',
];

const REQUIRED_CREATE_FIELDS = ['title'];

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'priority',
  'due_date',
  'category',
];

function validate(operation, payload) {
  if (operation === 'create') {
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
  const task = db.prepare(`
    SELECT status, priority, due_date, category
    FROM personal_tasks
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!task) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: task.status || null,
    priority: task.priority || null,
    due_date: task.due_date || null,
    category: task.category || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Personal tasks can be deleted',
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

const FIELD_ALIASES = {
  update: {
    status: ["status", "state", "mark", "mark as"],
    priority: ["priority", "urgency"],
    due_date: ["due", "due date", "deadline"],
    category: ["category", "type"],
  },
};

const FIELD_TYPES = {
  update: {
    status: "enum_token",
    priority: "enum_token",
    due_date: "date",
    category: "string",
  },
};

const VALUE_PARSERS = {
  update: {
    status: "enum_token",
    priority: "enum_token",
    due_date: "date",
    category: "string",
  },
};

module.exports = {
  entityType: 'personal_task',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true, // Safe entity — personal tasks can be deleted
  fieldAliases: FIELD_ALIASES,
  fieldTypes: FIELD_TYPES,
  valueParsers: VALUE_PARSERS,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
