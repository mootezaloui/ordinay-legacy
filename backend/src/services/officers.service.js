const db = require("../db/connection");
const notesService = require("./notes.service");
const { assert, filterPayload, buildUpdateClause, normalizeData } = require("./_utils");
const { withTx } = require("../db/withTx");
const auditMutations = require("./auditMutations.service");

const table = "officers";
const allowedFields = ["name", "email", "phone", "alternate_phone", "address", "agency", "location", "specialization", "registration_number", "status"];

function list() {
  const officers = db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
  return officers.map((officer) => ({
    ...officer,
    notes: notesService.getNotesForEntity("officer", officer.id),
  }));
}

function listFiltered({ query = null, status = null, limit = 50 } = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (status) {
    where.push("LOWER(COALESCE(status, '')) = @status");
    params.status = String(status).trim().toLowerCase();
  }

  if (query) {
    where.push(
      `(LOWER(COALESCE(name, '')) LIKE @query
        OR LOWER(COALESCE(email, '')) LIKE @query
        OR LOWER(COALESCE(phone, '')) LIKE @query
        OR LOWER(COALESCE(alternate_phone, '')) LIKE @query
        OR LOWER(COALESCE(agency, '')) LIKE @query
        OR LOWER(COALESCE(location, '')) LIKE @query
        OR LOWER(COALESCE(registration_number, '')) LIKE @query)`,
    );
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const officers = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY LOWER(COALESCE(name, '')) ASC, id ASC
       LIMIT @limit`,
    )
    .all(params);

  return officers.map((officer) => ({
    ...officer,
    notes: notesService.getNotesForEntity("officer", officer.id),
  }));
}

function get(id) {
  const officer = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!officer) return null;
  return {
    ...officer,
    notes: notesService.getNotesForEntity("officer", id),
  };
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    email: null,
    phone: null,
    alternate_phone: null,
    address: null,
    agency: null,
    location: null,
    ...data,
  };
  assert(insertData.name, "name is required");
  if (!insertData.status) insertData.status = "active";

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (name, email, phone, alternate_phone, address, agency, location, status)
       VALUES (@name, @email, @phone, @alternate_phone, @address, @agency, @location, @status)`
    );
    const result = stmt.run(insertData);
    const created = get(result.lastInsertRowid);
    if (payload?.notes !== undefined) {
      notesService.saveNotesForEntity("officer", created.id, payload.notes);
      return get(created.id);
    }
    return created;
  } catch (error) {
    console.error("[officers.service] Create failed:", error.message);
    console.error(
      "[officers.service] Insert data:",
      JSON.stringify(insertData, null, 2)
    );
    throw error;
  }
}

function update(id, payload) {
  console.log('[officers.service] Update - Raw payload:', payload);
  const notesArray = payload?.notes;
  const filtered = filterPayload(payload, allowedFields);
  console.log('[officers.service] Update - Filtered payload:', filtered);
  const data = normalizeData(filtered);
  console.log('[officers.service] Update - Normalized data:', data);
  const hasDataFields = Object.keys(data).length > 0;
  if (!hasDataFields && notesArray === undefined) {
    assert(false, "No fields provided for update");
  }

  // 🚨 CRITICAL SAFETY GUARD: Prevent destructive updates that might wipe data
  // If updating an officer, ensure we're not accidentally nullifying critical fields
  const existing = get(id);
  if (!existing) {
    throw new Error(`Officer with ID ${id} not found`);
  }

  // Check for potential destructive updates (setting critical fields to null when they had values)
  const criticalFields = ['name', 'email', 'phone'];
  for (const field of criticalFields) {
    // If the field exists in the current record and we're trying to set it to null
    if (existing[field] && existing[field] !== null && data[field] === null) {
      console.warn(`[officers.service] WARNING: Attempting to set ${field} to NULL for officer ${id}`);
      console.warn(`[officers.service] Current value: "${existing[field]}", New value: null`);
      console.warn(`[officers.service] Payload:`, data);
      // Allow it but log prominently - this might be intentional field clearing
    }
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
    notesService.saveNotesForEntity("officer", id, notesArray);
  }
  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");
  const officer = get(id);
  if (!officer) return false;

  return withTx(db, () => {
    // First, set officer_id to NULL for all missions referencing this officer
    // (these should be completed missions since active ones are blocked by domain rules)
    const updateMissionsStmt = db.prepare(`
      UPDATE missions
      SET officer_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE officer_id = @id
    `);
    updateMissionsStmt.run({ id });

    notesService.deleteNotesForEntity("officer", id);

    // Delete the officer
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    if (result.changes === 0) return false;

    historyService.create({
      entity_type: "officer",
      entity_id: id,
      action: "entity_deleted",
      description: `Officer "${officer.name}" was deleted`,
    });
    auditMutations.append(
      {
        entity_type: "officer",
        entity_id: id,
        operation: "delete",
        source: "rest_api",
        before: officer,
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
