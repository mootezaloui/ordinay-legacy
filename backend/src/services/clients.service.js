const db = require('../db/connection');
const notesService = require('./notes.service');
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
  'join_date',
];

function list() {
  const clients = db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
  return clients.map((client) => ({
    ...client,
    notes: notesService.getNotesForEntity('client', client.id),
  }));
}

function get(id) {
  const client = db.prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`).get({ id });
  if (!client) return null;
  return {
    ...client,
    notes: notesService.getNotesForEntity('client', id),
  };
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
    join_date: null,
    ...data,
  };
  assert(insertData.name, 'Name is required');
  if (!insertData.status) insertData.status = 'active';

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (name, email, phone, alternate_phone, address, status, cin, date_of_birth, profession, company, tax_id, join_date)
       VALUES (@name, @email, @phone, @alternate_phone, @address, @status, @cin, @date_of_birth, @profession, @company, @tax_id, @join_date)`
    );
    const result = stmt.run(insertData);
    const created = get(result.lastInsertRowid);
    if (payload?.notes !== undefined) {
      notesService.saveNotesForEntity('client', created.id, payload.notes);
      return get(created.id);
    }
    return created;
  } catch (error) {
    console.error('[clients.service] Create failed:', error.message);
    console.error('[clients.service] Insert data:', JSON.stringify(insertData, null, 2));
    throw error;
  }
}

function update(id, payload) {
  const notesArray = payload?.notes;
  const data = normalizeData(filterPayload(payload, allowedFields));
  const hasDataFields = Object.keys(data).length > 0;
  if (!hasDataFields && notesArray === undefined) {
    assert(false, 'No fields provided for update');
  }

  if (hasDataFields) {
    const setClause = buildUpdateClause(data);
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
    );
    const result = stmt.run({ ...data, id });
    if (result.changes === 0) return null;
  }
  if (notesArray !== undefined) {
    notesService.saveNotesForEntity('client', id, notesArray);
  }
  return get(id);
}

function remove(id) {
  const historyService = require('./history.service');

  // Delete all history events for this client
  historyService.deleteByEntity('client', id);
  notesService.deleteNotesForEntity('client', id);

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
