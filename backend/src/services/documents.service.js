const db = require('../db/connection');
const { assert, filterPayload, buildUpdateClause } = require('./_utils');

const table = 'documents';
const allowedFields = [
  'title',
  'file_path',
  'mime_type',
  'size_bytes',
  'notes',
  'client_id',
  'dossier_id',
  'case_id',
  'mission_id',
  'task_id',
  'session_id',
  'personal_task_id',
  'financial_entry_id',
];

function validateTarget(data) {
  const targets = [
    data.client_id,
    data.dossier_id,
    data.case_id,
    data.mission_id,
    data.task_id,
    data.session_id,
    data.personal_task_id,
    data.financial_entry_id,
  ];
  const count = targets.filter((v) => v !== null && v !== undefined).length;
  assert(count === 1, 'Exactly one parent reference is required for documents');
}

function list(filters = {}) {
  let sql = `SELECT * FROM ${table} WHERE deleted_at IS NULL`;
  const params = {};

  // Entity filtering for scoped queries
  if (filters.client_id !== undefined) {
    sql += ` AND client_id = @client_id`;
    params.client_id = filters.client_id;
  }
  if (filters.dossier_id !== undefined) {
    sql += ` AND dossier_id = @dossier_id`;
    params.dossier_id = filters.dossier_id;
  }
  if (filters.case_id !== undefined) {
    sql += ` AND case_id = @case_id`;
    params.case_id = filters.case_id;
  }
  if (filters.mission_id !== undefined) {
    sql += ` AND mission_id = @mission_id`;
    params.mission_id = filters.mission_id;
  }
  if (filters.task_id !== undefined) {
    sql += ` AND task_id = @task_id`;
    params.task_id = filters.task_id;
  }
  if (filters.session_id !== undefined) {
    sql += ` AND session_id = @session_id`;
    params.session_id = filters.session_id;
  }
  if (filters.personal_task_id !== undefined) {
    sql += ` AND personal_task_id = @personal_task_id`;
    params.personal_task_id = filters.personal_task_id;
  }
  if (filters.financial_entry_id !== undefined) {
    sql += ` AND financial_entry_id = @financial_entry_id`;
    params.financial_entry_id = filters.financial_entry_id;
  }

  return db.prepare(sql).all(params);
}

function get(id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`).get({ id });
}

function create(payload) {
  const data = filterPayload(payload, allowedFields);
  const insertData = {
    mime_type: null,
    size_bytes: null,
    notes: null,
    client_id: null,
    dossier_id: null,
    case_id: null,
    mission_id: null,
    task_id: null,
    session_id: null,
    personal_task_id: null,
    financial_entry_id: null,
    ...data,
  };
  assert(insertData.title, 'title is required');
  assert(insertData.file_path, 'file_path is required');
  validateTarget(insertData);

  const stmt = db.prepare(
    `INSERT INTO ${table} (title, file_path, mime_type, size_bytes, notes, client_id, dossier_id, case_id, mission_id, task_id, session_id, personal_task_id, financial_entry_id)
     VALUES (@title, @file_path, @mime_type, @size_bytes, @notes, @client_id, @dossier_id, @case_id, @mission_id, @task_id, @session_id, @personal_task_id, @financial_entry_id)`
  );
  const result = stmt.run(insertData);
  return get(result.lastInsertRowid);
}

function update(id, payload) {
  const data = filterPayload(payload, allowedFields);
  const updatable = {
    mime_type: null,
    size_bytes: null,
    notes: null,
    client_id: null,
    dossier_id: null,
    case_id: null,
    mission_id: null,
    task_id: null,
    session_id: null,
    personal_task_id: null,
    financial_entry_id: null,
    ...data,
  };
  if (
    data.client_id !== undefined ||
    data.dossier_id !== undefined ||
    data.case_id !== undefined ||
    data.mission_id !== undefined ||
    data.task_id !== undefined ||
    data.session_id !== undefined ||
    data.personal_task_id !== undefined ||
    data.financial_entry_id !== undefined
  ) {
    validateTarget(updatable);
  }
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
