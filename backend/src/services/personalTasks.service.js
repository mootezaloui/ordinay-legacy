const db = require("../db/connection");
const { assert, filterPayload, buildUpdateClause, normalizeData } = require("./_utils");

const table = "personal_tasks";
const allowedFields = [
  "title",
  "description",
  "category",
  "status",
  "priority",
  "due_date",
  "completed_at",
  "notes",
];

function list() {
  return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
}

function get(id) {
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    description: null,
    category: null,
    status: "Non commencée",
    priority: "Moyenne",
    due_date: null,
    completed_at: null,
    notes: null,
    ...data,
  };
  assert(insertData.title, "title is required");

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (title, description, category, status, priority, due_date, completed_at, notes)
       VALUES (@title, @description, @category, @status, @priority, @due_date, @completed_at, @notes)`
    );
    const result = stmt.run(insertData);
    return get(result.lastInsertRowid);
  } catch (error) {
    console.error("[personalTasks.service] Create failed:", error.message);
    console.error(
      "[personalTasks.service] Insert data:",
      JSON.stringify(insertData, null, 2)
    );
    throw error;
  }
}

function update(id, payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  assert(Object.keys(data).length > 0, "No fields provided for update");

  const setClause = buildUpdateClause(data);
  const stmt = db.prepare(
    `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ ...data, id });
  if (result.changes === 0) return null;
  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");

  // Delete all history events for this personal task
  historyService.deleteByEntity("personalTask", id);

  // Delete the personal task
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
