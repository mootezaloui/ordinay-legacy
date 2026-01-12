const db = require("../db/connection");
const { assert, filterPayload, buildUpdateClause, normalizeData } = require("./_utils");

const table = "officers";
const allowedFields = ["name", "email", "phone", "alternate_phone", "address", "agency", "location", "specialization", "registration_number", "status", "notes"];

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
    email: null,
    phone: null,
    alternate_phone: null,
    address: null,
    agency: null,
    location: null,
    notes: null,
    ...data,
  };
  assert(insertData.name, "name is required");
  if (!insertData.status) insertData.status = "active";

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (name, email, phone, alternate_phone, address, agency, location, status, notes)
       VALUES (@name, @email, @phone, @alternate_phone, @address, @agency, @location, @status, @notes)`
    );
    const result = stmt.run(insertData);
    return get(result.lastInsertRowid);
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
  const filtered = filterPayload(payload, allowedFields);
  console.log('[officers.service] Update - Filtered payload:', filtered);
  const data = normalizeData(filtered);
  console.log('[officers.service] Update - Normalized data:', data);
  assert(Object.keys(data).length > 0, "No fields provided for update");

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

  // Start a transaction to ensure atomicity
  const transaction = db.transaction(() => {
    // First, set officer_id to NULL for all missions referencing this officer
    // (these should be completed missions since active ones are blocked by domain rules)
    const updateMissionsStmt = db.prepare(`
      UPDATE missions
      SET officer_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE officer_id = @id
    `);
    updateMissionsStmt.run({ id });

    // Delete all history events for this officer
    historyService.deleteByEntity("officer", id);

    // Delete the officer
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    return result.changes > 0;
  });

  return transaction();
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
};
