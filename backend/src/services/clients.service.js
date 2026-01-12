const db = require('../db/connection');
const { assert, filterPayload, buildUpdateClause, normalizeData } = require('./_utils');

const table = 'clients';
const allowedFields = [
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
  'notes',
  'join_date',
];

function list() {
  return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
}

function get(id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`).get({ id });
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    email: null,
    phone: null,
    alternate_phone: null,
    address: null,
    cin: null,
    date_of_birth: null,
    profession: null,
    company: null,
    tax_id: null,
    notes: null,
    join_date: null,
    ...data,
  };
  assert(insertData.name, 'Name is required');
  if (!insertData.status) insertData.status = 'active';

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (name, email, phone, alternate_phone, address, status, cin, date_of_birth, profession, company, tax_id, notes, join_date)
       VALUES (@name, @email, @phone, @alternate_phone, @address, @status, @cin, @date_of_birth, @profession, @company, @tax_id, @notes, @join_date)`
    );
    const result = stmt.run(insertData);
    return get(result.lastInsertRowid);
  } catch (error) {
    console.error('[clients.service] Create failed:', error.message);
    console.error('[clients.service] Insert data:', JSON.stringify(insertData, null, 2));
    throw error;
  }
}

function update(id, payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  assert(Object.keys(data).length > 0, 'No fields provided for update');

  const setClause = buildUpdateClause(data);
  const stmt = db.prepare(
    `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ ...data, id });
  if (result.changes === 0) return null;
  return get(id);
}

function remove(id) {
  const historyService = require('./history.service');

  // Delete all history events for this client
  historyService.deleteByEntity('client', id);

  // Delete the client
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
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
