const db = require("../db/connection");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  normalizeData,
} = require("./_utils");
const notesService = require("./notes.service");
const { withTx } = require("../db/withTx");
const auditMutations = require("./auditMutations.service");

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

function listByClient(clientId) {
  if (!Number.isInteger(Number(clientId))) {
    return [];
  }

  const dossiers = db
    .prepare(
      `SELECT * FROM ${table} WHERE client_id = @clientId AND deleted_at IS NULL ORDER BY id ASC`,
    )
    .all({ clientId: Number(clientId) });

  return dossiers.map((dossier) => ({
    ...dossier,
    notes: notesService.getNotesForEntity("dossier", dossier.id),
  }));
}

function getByReference(reference) {
  const normalized = String(reference || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const dossier = db
    .prepare(
      `SELECT * FROM ${table} WHERE LOWER(reference) = @reference AND deleted_at IS NULL LIMIT 1`,
    )
    .get({ reference: normalized });

  if (!dossier) return null;
  return {
    ...dossier,
    notes: notesService.getNotesForEntity("dossier", dossier.id),
  };
}

function listFiltered({ query = null, status = null, clientId = null, limit = 50 } = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (Number.isInteger(Number(clientId)) && Number(clientId) > 0) {
    where.push("client_id = @clientId");
    params.clientId = Number(clientId);
  }

  if (status) {
    where.push("LOWER(COALESCE(status, '')) = @status");
    params.status = String(status).trim().toLowerCase();
  }

  if (query) {
    where.push(
      "(LOWER(COALESCE(reference, '')) LIKE @query OR LOWER(COALESCE(title, '')) LIKE @query)",
    );
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const dossiers = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
       LIMIT @limit`,
    )
    .all(params);

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

  const deleted = withTx(db, () => {
    const lawsuitIds = db
      .prepare(`SELECT id FROM lawsuits WHERE dossier_id = ?`)
      .all(id)
      .map((row) => row.id);

    const missionIds = db
      .prepare(
        `SELECT id FROM missions WHERE dossier_id = ?${
          lawsuitIds.length > 0
            ? ` OR lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(id, ...lawsuitIds)
      .map((row) => row.id);

    const taskIds = db
      .prepare(
        `SELECT id FROM tasks WHERE dossier_id = ?${
          lawsuitIds.length > 0
            ? ` OR lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(id, ...lawsuitIds)
      .map((row) => row.id);

    const sessionIds = db
      .prepare(
        `SELECT id FROM sessions WHERE dossier_id = ?${
          lawsuitIds.length > 0
            ? ` OR lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})`
            : ""
        }`
      )
      .all(id, ...lawsuitIds)
      .map((row) => row.id);

    const financialEntryIds = db
      .prepare(
        `SELECT id FROM financial_entries WHERE dossier_id = ?${
          lawsuitIds.length > 0
            ? ` OR lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})`
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
      .all(id, ...lawsuitIds, ...missionIds, ...taskIds)
      .map((row) => row.id);

    const documentIds = db
      .prepare(
        `SELECT id FROM documents WHERE dossier_id = ?${
          lawsuitIds.length > 0
            ? ` OR lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})`
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
        ...lawsuitIds,
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

    // Delete notifications and notes for all impacted entities
    const dossierIds = [id];
    deleteNotificationsByEntity("document", documentIds);
    deleteNotificationsByEntity("financial_entry", financialEntryIds);
    deleteNotificationsByEntity("mission", missionIds);
    deleteNotificationsByEntity("task", taskIds);
    deleteNotificationsByEntity("session", sessionIds);
    deleteNotificationsByEntity("lawsuit", lawsuitIds);
    deleteNotificationsByEntity("dossier", dossierIds);

    deleteNotesByEntity("document", documentIds);
    deleteNotesByEntity("financial_entry", financialEntryIds);
    deleteNotesByEntity("mission", missionIds);
    deleteNotesByEntity("task", taskIds);
    deleteNotesByEntity("session", sessionIds);
    deleteNotesByEntity("lawsuit", lawsuitIds);
    deleteNotesByEntity("dossier", dossierIds);

    // Delete child entities
    deleteIn("missions", "id", missionIds);
    deleteIn("tasks", "id", taskIds);
    deleteIn("sessions", "id", sessionIds);
    deleteIn("lawsuits", "id", lawsuitIds);

    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    if (result.changes === 0) return false;

    historyService.create({
      entity_type: "dossier",
      entity_id: id,
      action: "entity_deleted",
      description: `Dossier "${dossier.title}" (${dossier.reference}) was deleted`,
    });

    if (dossier.client_id) {
      historyService.create({
        entity_type: "client",
        entity_id: dossier.client_id,
        action: "child_deleted",
        description: `Dossier "${dossier.title}" (${dossier.reference}) was deleted`,
      });
    }

    auditMutations.append(
      {
        entity_type: "dossier",
        entity_id: id,
        operation: "delete",
        source: "rest_api",
        before: dossier,
        after: null,
        metadata: {
          cascade: true,
        },
      },
      db
    );

    return true;
  });

  return deleted;
}

module.exports = {
  list,
  listByClient,
  listFiltered,
  getByReference,
  get,
  create,
  update,
  remove,
};


