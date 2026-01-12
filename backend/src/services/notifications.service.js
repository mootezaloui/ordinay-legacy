const db = require('../db/connection');
const { assert, filterPayload, buildUpdateClause } = require('./_utils');

const table = 'notifications';
const allowedFields = ['type', 'sub_type', 'template_key', 'payload', 'severity', 'status', 'entity_type', 'entity_id', 'scheduled_at', 'read_at'];

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `"${key}":${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizePayload(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
      /* ignore parse error and fall back */
    }
  }
  return { value };
}

function computeDedupeKey(data) {
  const payloadObj = normalizePayload(data.payload);
  return [
    data.type || '',
    data.sub_type || '',
    data.template_key || '',
    data.entity_type || '',
    data.entity_id || '',
    stableStringify(payloadObj),
  ].join('|');
}

function validateEntityPair(data) {
  const hasType = data.entity_type !== undefined && data.entity_type !== null;
  const hasId = data.entity_id !== undefined && data.entity_id !== null;
  if (hasType || hasId) {
    assert(hasType && hasId, 'entity_type and entity_id must be provided together');
  }
}

function list() {
  return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
}

function get(id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`).get({ id });
}

function create(payload) {
  const data = filterPayload(payload, allowedFields);
  const insertData = {
    type: null,
    sub_type: null,
    template_key: null,
    payload: {},
    entity_type: null,
    entity_id: null,
    scheduled_at: null,
    read_at: null,
    ...data,
  };
  assert(insertData.type, 'type is required');
  assert(insertData.template_key, 'template_key is required');
  insertData.payload = normalizePayload(insertData.payload);
  validateEntityPair(insertData);
  if (!insertData.severity) insertData.severity = 'info';
  if (!insertData.status) insertData.status = 'unread';
  const dedupeKey = computeDedupeKey(insertData);
  const payloadString = stableStringify(insertData.payload);

  const stmt = db.prepare(
    `INSERT INTO ${table} (type, sub_type, template_key, payload, dedupe_key, severity, status, entity_type, entity_id, scheduled_at, read_at)
     VALUES (@type, @sub_type, @template_key, @payload, @dedupe_key, @severity, @status, @entity_type, @entity_id, @scheduled_at, @read_at)`
  );
  try {
    const result = stmt.run({
      ...insertData,
      payload: payloadString,
      dedupe_key: dedupeKey,
    });
    return get(result.lastInsertRowid);
  } catch (error) {
    if (error && error.message && error.message.includes('UNIQUE constraint failed')) {
      const existing = db
        .prepare(`SELECT * FROM ${table} WHERE dedupe_key = @dedupe_key AND deleted_at IS NULL`)
        .get({ dedupe_key: dedupeKey });
      if (existing) return existing;
    }
    throw error;
  }
}

function update(id, payload) {
  const data = filterPayload(payload, allowedFields);
  const updatable = {
    entity_type: null,
    entity_id: null,
    scheduled_at: null,
    read_at: null,
    ...data,
  };
  validateEntityPair(updatable);
  assert(Object.keys(data).length > 0, 'No fields provided for update');
  if (data.payload !== undefined) {
    data.payload = stableStringify(normalizePayload(data.payload));
  }

  const setClause = buildUpdateClause(data);
  const stmt = db.prepare(
    `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ ...data, id });
  if (result.changes === 0) return null;
  return get(id);
}

function remove(id) {
  const stmt = db.prepare(
    `UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ id });
  return result.changes > 0;
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
};
