const db = require("../db/connection");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  normalizeData,
} = require("./_utils");
const notesService = require("./notes.service");

const table = "dossiers";
const allowedFields = [
  "reference",
  "client_id",
  "title",
  "description",
  "category",
  "phase",
  "adversary_name",
  "adversary_party",
  "adversary_lawyer",
  "estimated_value",
  "court_reference",
  "assigned_lawyer",
  "status",
  "priority",
  "opened_at",
  "next_deadline",
  "closed_at",
  "notes",
];

function generateReference() {
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-6);
  return `DOS-${year}-${suffix}`;
}

function list() {
  const dossiers = db
    .prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`)
    .all();

  // Attach notes for each dossier so UI gets the persisted notes on initial load
  return dossiers.map((dossier) => ({
    ...dossier,
    notes: notesService.getNotesForEntity("dossier", dossier.id),
  }));
}

function get(id) {
  const dossier = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!dossier) return null;

  // Load notes from notes table
  const notes = notesService.getNotesForEntity("dossier", id);
  dossier.notes = notes;

  return dossier;
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    description: null,
    category: null,
    phase: null,
    adversary_name: null,
    adversary_party: null,
    adversary_lawyer: null,
    estimated_value: null,
    court_reference: null,
    assigned_lawyer: null,
    next_deadline: null,
    opened_at: new Date().toISOString(),
    closed_at: null,
    ...data,
  };
  assert(insertData.client_id, "client_id is required");
  assert(insertData.title, "title is required");
  if (!insertData.status) insertData.status = "open";
  if (!insertData.priority) insertData.priority = "medium";
  // Generate reference if not provided
  if (!insertData.reference) {
    insertData.reference = generateReference();
  }

  const stmt = db.prepare(
    `INSERT INTO ${table} (
      reference,
      client_id,
      title,
      description,
      category,
      phase,
      adversary_name,
      adversary_party,
      adversary_lawyer,
      estimated_value,
      court_reference,
      assigned_lawyer,
      status,
      priority,
      opened_at,
      next_deadline,
      closed_at
    ) VALUES (
      @reference,
      @client_id,
      @title,
      @description,
      @category,
      @phase,
      @adversary_name,
      @adversary_party,
      @adversary_lawyer,
      @estimated_value,
      @court_reference,
      @assigned_lawyer,
      @status,
      @priority,
      @opened_at,
      @next_deadline,
      @closed_at
    )`
  );
  const result = stmt.run(insertData);
  return get(result.lastInsertRowid);
}

function update(id, payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));

  // Handle notes separately - save to notes table
  let notesArray = null;
  if (data.notes !== undefined) {
    notesArray = data.notes;
    delete data.notes; // Remove from main update
  }

  // Only update dossier table if there are fields other than notes
  if (Object.keys(data).length > 0) {
    const setClause = buildUpdateClause(data);
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
    );

    try {
      const result = stmt.run({ ...data, id });
      if (result.changes === 0) return null;
    } catch (error) {
      console.error("[dossiers.service] Update failed:", error.message);
      console.error(
        "[dossiers.service] Update data:",
        JSON.stringify(data, null, 2)
      );
      console.error("[dossiers.service] SQL clause:", setClause);
      throw error;
    }
  }

  // Save notes if provided
  if (notesArray !== null) {
    notesService.saveNotesForEntity("dossier", id, notesArray);
  }

  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");

  // Get the dossier to know which client to update
  const dossier = get(id);
  if (!dossier) return false;

  const deleteIn = (tableName, column, ids) => {
    if (!ids || ids.length === 0) return 0;
    const params = {};
    const placeholders = ids.map((value, index) => {
      const key = `id${index}`;
      params[key] = value;
      return `@${key}`;
    });
    const stmt = db.prepare(
      `DELETE FROM ${tableName} WHERE ${column} IN (${placeholders.join(", ")})`
    );
    const result = stmt.run(params);
    return result.changes;
  };

  const deleteByEntity = (entityType, ids) => {
    if (!ids || ids.length === 0) return 0;
    const params = { entity_type: entityType };
    const placeholders = ids.map((value, index) => {
      const key = `id${index}`;
      params[key] = value;
      return `@${key}`;
    });
    const stmt = db.prepare(
      `DELETE FROM history_events WHERE entity_type = @entity_type AND entity_id IN (${placeholders.join(", ")})`
    );
    const result = stmt.run(params);
    return result.changes;
  };

  const deleteNotesByEntity = (entityType, ids) => {
    if (!ids || ids.length === 0) return 0;
    const params = { entity_type: entityType };
    const placeholders = ids.map((value, index) => {
      const key = `id${index}`;
      params[key] = value;
      return `@${key}`;
    });
    const stmt = db.prepare(
      `DELETE FROM notes WHERE entity_type = @entity_type AND entity_id IN (${placeholders.join(", ")})`
    );
    const result = stmt.run(params);
    return result.changes;
  };

  const deleteNotificationsByEntity = (entityType, ids) => {
    if (!ids || ids.length === 0) return 0;
    const params = { entity_type: entityType };
    const placeholders = ids.map((value, index) => {
      const key = `id${index}`;
      params[key] = value;
      return `@${key}`;
    });
    const stmt = db.prepare(
      `DELETE FROM notifications WHERE entity_type = @entity_type AND entity_id IN (${placeholders.join(", ")})`
    );
    const result = stmt.run(params);
    return result.changes;
  };

  const deleteTransaction = db.transaction(() => {
    const caseIds = db
      .prepare(`SELECT id FROM cases WHERE dossier_id = ?`)
      .all(id)
      .map((row) => row.id);

    const missionIds = db
      .prepare(
        `SELECT id FROM missions WHERE dossier_id = ?${
          caseIds.length > 0
            ? ` OR case_id IN (${caseIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(id, ...caseIds)
      .map((row) => row.id);

    const taskIds = db
      .prepare(
        `SELECT id FROM tasks WHERE dossier_id = ?${
          caseIds.length > 0
            ? ` OR case_id IN (${caseIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(id, ...caseIds)
      .map((row) => row.id);

    const sessionIds = db
      .prepare(
        `SELECT id FROM sessions WHERE dossier_id = ?${
          caseIds.length > 0
            ? ` OR case_id IN (${caseIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(id, ...caseIds)
      .map((row) => row.id);

    const financialEntryIds = db
      .prepare(
        `SELECT id FROM financial_entries WHERE dossier_id = ?${
          caseIds.length > 0
            ? ` OR case_id IN (${caseIds.map(() => "?").join(", ")})`
            : ""
        }${
          missionIds.length > 0
            ? ` OR mission_id IN (${missionIds.map(() => "?").join(", ")})`
            : ""
        }${
          taskIds.length > 0
            ? ` OR task_id IN (${taskIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(id, ...caseIds, ...missionIds, ...taskIds)
      .map((row) => row.id);

    const documentIds = db
      .prepare(
        `SELECT id FROM documents WHERE dossier_id = ?${
          caseIds.length > 0
            ? ` OR case_id IN (${caseIds.map(() => "?").join(", ")})`
            : ""
        }${
          missionIds.length > 0
            ? ` OR mission_id IN (${missionIds.map(() => "?").join(", ")})`
            : ""
        }${
          taskIds.length > 0
            ? ` OR task_id IN (${taskIds.map(() => "?").join(", ")})`
            : ""
        }${
          sessionIds.length > 0
            ? ` OR session_id IN (${sessionIds.map(() => "?").join(", ")})`
            : ""
        }${
          financialEntryIds.length > 0
            ? ` OR financial_entry_id IN (${financialEntryIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(
        id,
        ...caseIds,
        ...missionIds,
        ...taskIds,
        ...sessionIds,
        ...financialEntryIds
      )
      .map((row) => row.id);

    // Delete documents first (they can reference everything)
    deleteIn("documents", "id", documentIds);

    // Delete financial entries next (documents may reference them)
    deleteIn("financial_entries", "id", financialEntryIds);

    // Delete notifications, notes, history for all impacted entities
    const dossierIds = [id];
    deleteNotificationsByEntity("document", documentIds);
    deleteNotificationsByEntity("financial_entry", financialEntryIds);
    deleteNotificationsByEntity("mission", missionIds);
    deleteNotificationsByEntity("task", taskIds);
    deleteNotificationsByEntity("session", sessionIds);
    deleteNotificationsByEntity("case", caseIds);
    deleteNotificationsByEntity("dossier", dossierIds);

    deleteNotesByEntity("document", documentIds);
    deleteNotesByEntity("financial_entry", financialEntryIds);
    deleteNotesByEntity("mission", missionIds);
    deleteNotesByEntity("task", taskIds);
    deleteNotesByEntity("session", sessionIds);
    deleteNotesByEntity("case", caseIds);
    deleteNotesByEntity("dossier", dossierIds);

    deleteByEntity("document", documentIds);
    deleteByEntity("financial_entry", financialEntryIds);
    deleteByEntity("mission", missionIds);
    deleteByEntity("task", taskIds);
    deleteByEntity("session", sessionIds);
    deleteByEntity("case", caseIds);
    deleteByEntity("dossier", dossierIds);

    // Delete child entities
    deleteIn("missions", "id", missionIds);
    deleteIn("tasks", "id", taskIds);
    deleteIn("sessions", "id", sessionIds);
    deleteIn("cases", "id", caseIds);

    // Delete the dossier
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    return stmt.run({ id });
  });

  const result = deleteTransaction();

  // Add deletion event to parent client's history
  if (result.changes > 0 && dossier.client_id) {
    historyService.create({
      entity_type: "client",
      entity_id: dossier.client_id,
      action: "child_deleted",
      description: `Dossier "${dossier.title}" (${dossier.reference}) was deleted`,
    });
  }

  return result.changes > 0;
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
};
