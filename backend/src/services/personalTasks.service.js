const db = require("../db/connection");
const { assert, filterPayload, buildUpdateClause, normalizeData } = require("./_utils");
const notesService = require("./notes.service");
const { withTx } = require("../db/withTx");
const auditMutations = require("./auditMutations.service");

const table = "personal_tasks";
const allowedFields = [
  "title",
  "description",
  "category",
  "status",
  "priority",
  "due_date",
  "completed_at",
];

function list() {
  const tasks = db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
  return tasks.map(task => ({
    ...task,
    notes: notesService.getNotesForEntity("personal_task", task.id),
  }));
}

function listFiltered({ query = null, status = null, priority = null, limit = 50 } = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (status) {
    where.push("LOWER(COALESCE(status, '')) = @status");
    params.status = String(status).trim().toLowerCase();
  }

  if (priority) {
    where.push("LOWER(COALESCE(priority, '')) = @priority");
    params.priority = String(priority).trim().toLowerCase();
  }

  if (query) {
    where.push("LOWER(COALESCE(title, '')) LIKE @query");
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const tasks = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(due_date, created_at) DESC, id DESC
       LIMIT @limit`,
    )
    .all(params);

  return tasks.map((task) => ({
    ...task,
    notes: notesService.getNotesForEntity("personal_task", task.id),
  }));
}

function get(id) {
  const task = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!task) return null;
  task.notes = notesService.getNotesForEntity("personal_task", id);
  return task;
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    description: null,
    category: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    completed_at: null,
    ...data,
  };
  assert(insertData.title, "title is required");

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (title, description, category, status, priority, due_date, completed_at)
       VALUES (@title, @description, @category, @status, @priority, @due_date, @completed_at)`
    );
    const result = stmt.run(insertData);
    const created = get(result.lastInsertRowid);
    if (payload?.notes !== undefined) {
      notesService.saveNotesForEntity("personal_task", created.id, payload.notes);
      created.notes = notesService.getNotesForEntity("personal_task", created.id);
    }
    return created;
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
  const notesArray = payload?.notes;
  const hasDataFields = Object.keys(data).length > 0;
  if (!hasDataFields && notesArray === undefined) {
    throw new Error("No fields provided for update");
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
    notesService.saveNotesForEntity("personal_task", id, notesArray);
  }

  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");
  const task = get(id);
  if (!task) return false;

  return withTx(db, () => {
    notesService.deleteNotesForEntity("personal_task", id);

    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    if (result.changes === 0) return false;

    historyService.create({
      entity_type: "personal_task",
      entity_id: id,
      action: "entity_deleted",
      description: `Personal task "${task.title}" was deleted`,
    });
    auditMutations.append(
      {
        entity_type: "personal_task",
        entity_id: id,
        operation: "delete",
        source: "rest_api",
        before: task,
        after: null,
      },
      db,
    );
    return true;
  });
}

module.exports = {
  list,
  listFiltered,
  get,
  create,
  update,
  remove,
};
