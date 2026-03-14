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

const table = "lawsuits";
const allowedFields = [
  "reference",
  "lawsuit_number",
  "dossier_id",
  "title",
  "description",
  "adversary_name",
  "adversary",
  "adversary_party",
  "adversary_lawyer",
  "court",
  "filing_date",
  "next_hearing",
  "judgment_number",
  "judgment_date",
  "reference_number",
  "status",
  "priority",
  "opened_at",
  "closed_at",
  "notes",
];

function generateReference() {
  const year = new Date().getFullYear();
  const prefix = `PRO-${year}-`;

  // Get all existing lawsuit numbers for current year from database
  const existingLawsuits = db
    .prepare(
      `SELECT lawsuit_number FROM ${table} 
     WHERE deleted_at IS NULL 
     AND lawsuit_number LIKE @prefix`
    )
    .all({ prefix: `${prefix}%` });

  // Extract numbers from existing references
  const existingNumbers = existingLawsuits
    .map((lawsuit) => {
      const match = lawsuit.lawsuit_number?.match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((num) => !isNaN(num));

  // Find the maximum number and increment
  const maxNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const nextNumber = maxNumber + 1;

  // Format with leading zeros (XXX = 3 digits)
  const paddedNumber = String(nextNumber).padStart(3, "0");

  return `${prefix}${paddedNumber}`;
}

function list() {
  const lawsuits = db
    .prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`)
    .all();

  // Attach notes for each lawsuit so UI gets the persisted notes on initial load
  return lawsuits.map((lawsuit) => ({
    ...lawsuit,
    notes: notesService.getNotesForEntity("lawsuit", lawsuit.id),
  }));
}

function listByDossier(dossierId) {
  if (!Number.isInteger(Number(dossierId))) {
    return [];
  }

  const lawsuits = db
    .prepare(
      `SELECT * FROM ${table} WHERE dossier_id = @dossierId AND deleted_at IS NULL ORDER BY id ASC`,
    )
    .all({ dossierId: Number(dossierId) });

  return lawsuits.map((lawsuit) => ({
    ...lawsuit,
    notes: notesService.getNotesForEntity("lawsuit", lawsuit.id),
  }));
}

function listFiltered({ query = null, status = null, dossierId = null, limit = 50 } = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (Number.isInteger(Number(dossierId)) && Number(dossierId) > 0) {
    where.push("dossier_id = @dossierId");
    params.dossierId = Number(dossierId);
  }

  if (status) {
    where.push("LOWER(COALESCE(status, '')) = @status");
    params.status = String(status).trim().toLowerCase();
  }

  if (query) {
    where.push(
      `(LOWER(COALESCE(reference, '')) LIKE @query
        OR LOWER(COALESCE(lawsuit_number, '')) LIKE @query
        OR LOWER(COALESCE(title, '')) LIKE @query)`,
    );
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const lawsuits = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
       LIMIT @limit`,
    )
    .all(params);

  return lawsuits.map((lawsuit) => ({
    ...lawsuit,
    notes: notesService.getNotesForEntity("lawsuit", lawsuit.id),
  }));
}

function get(id) {
  const lawsuitData = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!lawsuitData) return null;

  // Load notes from notes table
  const notes = notesService.getNotesForEntity("lawsuit", id);
  lawsuitData.notes = notes;

  return lawsuitData;
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    description: null,
    adversary_name: null,
    adversary: null,
    adversary_party: null,
    adversary_lawyer: null,
    court: null,
    filing_date: null,
    next_hearing: null,
    judgment_number: null,
    judgment_date: null,
    reference_number: null,
    lawsuit_number: null,
    opened_at: new Date().toISOString(),
    closed_at: null,
    ...data,
  };
  assert(insertData.dossier_id, "dossier_id is required");
  assert(insertData.title, "title is required");
  if (!insertData.status) insertData.status = "in_progress";
  if (!insertData.priority) insertData.priority = "medium";

  // ✅ FIXED: Check if provided reference already exists, regenerate if needed
  if (insertData.reference || insertData.lawsuit_number) {
    const checkRef = insertData.reference || insertData.lawsuit_number;
    const existing = db
      .prepare(
        `SELECT id FROM ${table} WHERE lawsuit_number = @ref AND deleted_at IS NULL`
      )
      .get({ ref: checkRef });

    if (existing) {
      console.log(
        `[lawsuits.service] Reference ${checkRef} already exists, generating new one`
      );
      insertData.reference = generateReference();
      insertData.lawsuit_number = insertData.reference;
    } else {
      // Sync reference and lawsuit_number fields
      if (!insertData.reference) insertData.reference = insertData.lawsuit_number;
      if (!insertData.lawsuit_number)
        insertData.lawsuit_number = insertData.reference;
    }
  } else {
    // Generate new reference if none provided
    insertData.reference = generateReference();
    insertData.lawsuit_number = insertData.reference;
  }

  if (!insertData.opened_at) insertData.opened_at = new Date().toISOString();

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (
        reference,
        lawsuit_number,
        dossier_id,
        title,
        description,
        adversary_name,
        adversary,
        adversary_party,
        adversary_lawyer,
        court,
        filing_date,
        next_hearing,
        judgment_number,
        judgment_date,
        reference_number,
        status,
        priority,
        opened_at,
        closed_at
      ) VALUES (
        @reference,
        @lawsuit_number,
        @dossier_id,
        @title,
        @description,
        @adversary_name,
        @adversary,
        @adversary_party,
        @adversary_lawyer,
        @court,
        @filing_date,
        @next_hearing,
        @judgment_number,
        @judgment_date,
        @reference_number,
        @status,
        @priority,
        @opened_at,
        @closed_at
      )`
    );
    const result = stmt.run(insertData);
    return get(result.lastInsertRowid);
  } catch (error) {
    console.error("[lawsuits.service] Create failed:", error.message);
    console.error(
      "[lawsuits.service] Insert data:",
      JSON.stringify(insertData, null, 2)
    );
    throw error;
  }
}

function update(id, payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));

  // Handle notes separately - save to notes table
  let notesArray = null;
  if (data.notes !== undefined) {
    notesArray = data.notes;
    delete data.notes; // Remove from main update
  }

  // Only update lawsuit table if there are fields other than notes
  if (Object.keys(data).length > 0) {
    const setClause = buildUpdateClause(data);
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause} WHERE id = @id AND deleted_at IS NULL`
    );
    const result = stmt.run({ ...data, id });
    if (result.changes === 0) return null;
  }

  // Save notes if provided
  if (notesArray !== null) {
    notesService.saveNotesForEntity("lawsuit", id, notesArray);
  }

  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");

  // Get the lawsuit to know which dossier to update
  const lawsuitRecord = get(id);
  if (!lawsuitRecord) return false;

  return withTx(db, () => {
    notesService.deleteNotesForEntity("lawsuit", id);

    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    if (result.changes === 0) return false;

    historyService.create({
      entity_type: "lawsuit",
      entity_id: id,
      action: "entity_deleted",
      description: `Lawsuit "${lawsuitRecord.title}" (${lawsuitRecord.reference}) was deleted`,
    });

    if (lawsuitRecord.dossier_id) {
      historyService.create({
        entity_type: "dossier",
        entity_id: lawsuitRecord.dossier_id,
        action: "child_deleted",
        description: `Lawsuit "${lawsuitRecord.title}" (${lawsuitRecord.reference}) was deleted`,
      });
    }

    auditMutations.append(
      {
        entity_type: "lawsuit",
        entity_id: id,
        operation: "delete",
        source: "rest_api",
        before: lawsuitRecord,
        after: null,
      },
      db,
    );

    return true;
  });
}

module.exports = {
  list,
  listByDossier,
  listFiltered,
  get,
  create,
  update,
  remove,
};
