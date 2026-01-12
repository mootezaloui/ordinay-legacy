const db = require("../db/connection");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  normalizeData,
} = require("./_utils");
const notesService = require("./notes.service");

const table = "cases";
const allowedFields = [
  "reference",
  "case_number",
  "dossier_id",
  "title",
  "description",
  "adversary",
  "adversary_party",
  "adversary_lawyer",
  "court",
  "filing_date",
  "next_hearing",
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

  // Get all existing case numbers for current year from database
  const existingCases = db
    .prepare(
      `SELECT case_number FROM ${table} 
     WHERE deleted_at IS NULL 
     AND case_number LIKE @prefix`
    )
    .all({ prefix: `${prefix}%` });

  // Extract numbers from existing references
  const existingNumbers = existingCases
    .map((c) => {
      const match = c.case_number?.match(/(\d+)$/);
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
  const cases = db
    .prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`)
    .all();

  // Attach notes for each case so UI gets the persisted notes on initial load
  return cases.map((caseItem) => ({
    ...caseItem,
    notes: notesService.getNotesForEntity("case", caseItem.id),
  }));
}

function get(id) {
  const caseData = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!caseData) return null;

  // Load notes from notes table
  const notes = notesService.getNotesForEntity("case", id);
  caseData.notes = notes;

  return caseData;
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    description: null,
    adversary: null,
    adversary_party: null,
    adversary_lawyer: null,
    court: null,
    filing_date: null,
    next_hearing: null,
    reference_number: null,
    case_number: null,
    opened_at: new Date().toISOString(),
    closed_at: null,
    ...data,
  };
  assert(insertData.dossier_id, "dossier_id is required");
  assert(insertData.title, "title is required");
  if (!insertData.status) insertData.status = "in_progress";
  if (!insertData.priority) insertData.priority = "medium";

  // ✅ FIXED: Check if provided reference already exists, regenerate if needed
  if (insertData.reference || insertData.case_number) {
    const checkRef = insertData.reference || insertData.case_number;
    const existing = db
      .prepare(
        `SELECT id FROM ${table} WHERE case_number = @ref AND deleted_at IS NULL`
      )
      .get({ ref: checkRef });

    if (existing) {
      console.log(
        `[cases.service] Reference ${checkRef} already exists, generating new one`
      );
      insertData.reference = generateReference();
      insertData.case_number = insertData.reference;
    } else {
      // Sync reference and case_number fields
      if (!insertData.reference) insertData.reference = insertData.case_number;
      if (!insertData.case_number)
        insertData.case_number = insertData.reference;
    }
  } else {
    // Generate new reference if none provided
    insertData.reference = generateReference();
    insertData.case_number = insertData.reference;
  }

  if (!insertData.opened_at) insertData.opened_at = new Date().toISOString();

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (
        reference,
        case_number,
        dossier_id,
        title,
        description,
        adversary,
        adversary_party,
        adversary_lawyer,
        court,
        filing_date,
        next_hearing,
        reference_number,
        status,
        priority,
        opened_at,
        closed_at
      ) VALUES (
        @reference,
        @case_number,
        @dossier_id,
        @title,
        @description,
        @adversary,
        @adversary_party,
        @adversary_lawyer,
        @court,
        @filing_date,
        @next_hearing,
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
    console.error("[cases.service] Create failed:", error.message);
    console.error(
      "[cases.service] Insert data:",
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

  // Only update case table if there are fields other than notes
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
    notesService.saveNotesForEntity("case", id, notesArray);
  }

  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");

  // Get the case to know which dossier to update
  const caseRecord = get(id);
  if (!caseRecord) return false;

  // Delete all history events for this case
  historyService.deleteByEntity("case", id);

  // Delete all notes for this case
  notesService.deleteNotesForEntity("case", id);

  // Delete the case
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
  const result = stmt.run({ id });

  // Add deletion event to parent dossier's history
  if (result.changes > 0 && caseRecord.dossier_id) {
    historyService.create({
      entity_type: "dossier",
      entity_id: caseRecord.dossier_id,
      action: "child_deleted",
      description: `Case "${caseRecord.title}" (${caseRecord.reference}) was deleted`,
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
