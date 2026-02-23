'use strict';

const db = require('../../../db/connection');
const crypto = require('crypto');

const ALLOWED_FIELDS = [
  'name',
  'email',
  'phone',
  'alternate_phone',
  'address',
  'agency',
  'location',
  'specialization',
  'registration_number',
  'status',
];

const REQUIRED_CREATE_FIELDS = ['name'];

const ALLOWED_UPDATE_FIELDS = [
  'email',
  'phone',
  'alternate_phone',
  'address',
  'agency',
  'location',
  'specialization',
  'registration_number',
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
    const invalidFields = updateFields.filter(
      (field) => !ALLOWED_UPDATE_FIELDS.includes(field),
    );
    if (invalidFields.length > 0) {
      throw new Error(
        `Cannot update fields: ${invalidFields.join(', ')}. Only ${ALLOWED_UPDATE_FIELDS.join(', ')} can be updated.`,
      );
    }
  }

  return true;
}

function computeSnapshotHash(entityId) {
  const officer = db
    .prepare(
      `
    SELECT status, email, phone
    FROM officers
    WHERE id = ? AND deleted_at IS NULL
  `,
    )
    .get(entityId);

  if (!officer) {
    return 'sha256:null';
  }

  const canonical = JSON.stringify({
    status: officer.status || null,
    email: officer.email || null,
    phone: officer.phone || null,
  });

  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function getReversibilityRules() {
  return {
    create: {
      reversible: true,
      reverseOperation: 'delete',
      note: 'Officers can be deleted',
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
    email: ["email", "e-mail"],
    phone: ["phone", "phone number", "mobile"],
    alternate_phone: ["alternate phone", "secondary phone"],
    address: ["address"],
    agency: ["agency", "office"],
    location: ["location", "city"],
    specialization: ["specialization", "speciality", "specialty"],
    registration_number: ["registration number", "license", "license number"],
    status: ["status", "state"],
  },
};

const FIELD_TYPES = {
  update: {
    email: "string",
    phone: "string",
    alternate_phone: "string",
    address: "string",
    agency: "string",
    location: "string",
    specialization: "string",
    registration_number: "string",
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
    agency: "string",
    location: "string",
    specialization: "string",
    registration_number: "string",
  },
};

module.exports = {
  entityType: 'officer',
  allowedFields: ALLOWED_FIELDS,
  requiredCreateFields: REQUIRED_CREATE_FIELDS,
  allowedUpdateFields: ALLOWED_UPDATE_FIELDS,
  allowedDelete: true,
  fieldAliases: FIELD_ALIASES,
  fieldTypes: FIELD_TYPES,
  valueParsers: VALUE_PARSERS,
  validate,
  computeSnapshotHash,
  getReversibilityRules,
};
