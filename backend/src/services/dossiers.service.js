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

  // Delete all history events for this dossier
  historyService.deleteByEntity("dossier", id);

  // Delete all notes for this dossier
  notesService.deleteNotesForEntity("dossier", id);

  // Delete the dossier
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
  const result = stmt.run({ id });

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
