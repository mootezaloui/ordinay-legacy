const db = require("../db/connection");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  ensureXor,
  normalizeData,
} = require("./_utils");
const notesService = require('./notes.service');
const { withTx } = require("../db/withTx");
const auditMutations = require("./auditMutations.service");

const table = "tasks";
const allowedFields = [
  "dossier_id",
  "lawsuit_id",
  "title",
  "description",
  "assigned_to",
  "status",
  "priority",
  "due_date",
  "estimated_time",
  "completed_at",
  "notes",
];

function list() {
  const tasks = db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();

  // Attach notes for each task so UI gets the persisted notes on initial load
  return tasks.map((task) => ({
    ...task,
    notes: notesService.getNotesForEntity('task', task.id),
  }));
}

function get(id) {
  const task = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!task) return null;

  // Load notes from notes table
  const notes = notesService.getNotesForEntity('task', id);
  task.notes = notes;

  return task;
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    dossier_id: null,
    lawsuit_id: null,
    description: null,
    assigned_to: null,
    due_date: null,
    estimated_time: null,
    completed_at: null,
    ...data,
  };
  insertData.title = insertData.title || "Nouvelle tâche";
  ensureXor(
    [insertData.dossier_id, insertData.lawsuit_id],
    "Provide either dossier_id or lawsuit_id (exclusive)"
  );
  assert(insertData.title, "title is required");
  if (!insertData.status) insertData.status = "Non commencee";
  if (!insertData.priority) insertData.priority = "Moyenne";

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (
        dossier_id,
        lawsuit_id,
        title,
        description,
        assigned_to,
        status,
        priority,
        due_date,
        estimated_time,
        completed_at
      ) VALUES (
        @dossier_id,
        @lawsuit_id,
        @title,
        @description,
        @assigned_to,
        @status,
        @priority,
        @due_date,
        @estimated_time,
        @completed_at
      )`
    );
    const result = stmt.run(insertData);
    return get(result.lastInsertRowid);
  } catch (error) {
    console.error("[tasks.service] Create failed:", error.message);
    console.error(
      "[tasks.service] Insert data:",
      JSON.stringify(insertData, null, 2)
    );
    throw error;
  }
}

function update(id, payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  if (data.dossier_id !== undefined || data.lawsuit_id !== undefined) {
    ensureXor(
      [data.dossier_id, data.lawsuit_id],
      "Provide either dossier_id or lawsuit_id (exclusive)"
    );
  }

  // Handle notes separately - save to notes table
  let notesArray = null;
  if (data.notes !== undefined) {
    notesArray = data.notes;
    delete data.notes; // Remove from main update
  }

  // Only update task table if there are fields other than notes
  if (Object.keys(data).length > 0) {
    const setClause = buildUpdateClause(data);
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
    );
    const result = stmt.run({ ...data, id });
    if (result.changes === 0) return null;
  }

  // Save notes if provided
  if (notesArray !== null) {
    notesService.saveNotesForEntity('task', id, notesArray);
  }

  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");

  // Get the task to know which parent to update
  const task = get(id);
  if (!task) return false;

  return withTx(db, () => {
    notesService.deleteNotesForEntity('task', id);

    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    if (result.changes === 0) return false;

    historyService.create({
      entity_type: "task",
      entity_id: id,
      action: "entity_deleted",
      description: `Task "${task.title}" was deleted`,
    });

    if (task.dossier_id) {
      historyService.create({
        entity_type: "dossier",
        entity_id: task.dossier_id,
        action: "child_deleted",
        description: `Task "${task.title}" was deleted`,
      });
    } else if (task.lawsuit_id) {
      historyService.create({
        entity_type: "lawsuit",
        entity_id: task.lawsuit_id,
        action: "child_deleted",
        description: `Task "${task.title}" was deleted`,
      });
    }

    auditMutations.append(
      {
        entity_type: "task",
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
  get,
  create,
  update,
  remove,
};

