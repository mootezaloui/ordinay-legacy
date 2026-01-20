const db = require("../db/connection");

const table = "operators";

/**
 * Get the current operator.
 * For MVP, this returns the single active operator.
 * This is a local implicit operator - no authentication.
 */
function getCurrentOperator() {
  const operator = db
    .prepare(`SELECT * FROM ${table} WHERE is_active = 1 ORDER BY id ASC LIMIT 1`)
    .get();

  if (!operator) {
    throw new Error("No active operator found. Database may not be initialized.");
  }

  return operator;
}

/**
 * List all operators.
 */
function list() {
  return db
    .prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`)
    .all();
}

/**
 * Get operator by id.
 */
function getById(id) {
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = @id`)
    .get({ id });
}

/**
 * Update operator profile.
 * This is identity management, NOT authentication.
 * No password fields allowed.
 */
function update(id, updates) {
  // Whitelist of allowed fields (no password fields)
  const allowedFields = [
    'name',
    'title',
    'office_name',
    'office_address',
    'email',
    'phone',
    'fax',
    'mobile',
    'specialization',
    'bar_id',
    'bar_number',
    'vpa',
    'office',
    'bio'
  ];

  // Filter to only allowed fields
  const filtered = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filtered[field] = updates[field];
    }
  }

  // If no valid fields to update, return current operator
  if (Object.keys(filtered).length === 0) {
    return getById(id);
  }

  // Build SET clause dynamically
  const setClauses = Object.keys(filtered).map(key => `${key} = @${key}`);
  const sql = `
    UPDATE ${table}
    SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `;

  const stmt = db.prepare(sql);
  stmt.run({ ...filtered, id });

  return getById(id);
}

module.exports = {
  getCurrentOperator,
  list,
  getById,
  update,
};
