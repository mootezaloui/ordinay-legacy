'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'name',
  'email',
  'phone',
  'alternate_phone',
  'address',
  'status',
  'cin',
  'date_of_birth',
  'profession',
  'company',
  'tax_id',
  'join_date',
];

const REQUIRED_CREATE_FIELDS = ['name'];

const ALLOWED_UPDATE_FIELDS = [
  'email',
  'phone',
  'alternate_phone',
  'address',
  'status',
];

function validate(operation, payload) {
  if (operation === 'create') {
    if (!payload.name) {
      throw new Error('name is required');
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
  const client = db.prepare(`
    SELECT email, phone, status
    FROM clients
    WHERE id = ? AND deleted_at IS NULL
  `).get(entityId);

  if (!client) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    email: client.email || null,
    phone: client.phone || null,
    status: client.status || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Clients can be deleted',
    },
    update: {
      reversible: true,
      reverseOperation: 'update',
      note: 'Updates can be reversed by setting previous values',
    },
    delete: {
      reversible: false,
      note: 'Deletion is permanent (cascade deletes all dossiers and children)',
    },
  };
}

const FIELD_ALIASES = {
  update: {
    email: ["email", "e-mail"],
    phone: ["phone", "phone number", "number", "mobile"],
    alternate_phone: ["alternate phone", "secondary phone"],
    address: ["address"],
    status: ["status", "state"],
  },
};

const FIELD_TYPES = {
  update: {
    email: "string",
    phone: "string",
    alternate_phone: "string",
    address: "string",
    status: "enum_token",
  },
};

const VALUE_PARSERS = {
  update: {
    status: "enum_token",
    email: "string",
    phone: "string",
    alternate_phone: "string",
    address: "string",
  },
};

module.exports = {
  entityType: 'client',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: false,
  fieldAliases: FIELD_ALIASES,
  fieldTypes: FIELD_TYPES,
  valueParsers: VALUE_PARSERS,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
