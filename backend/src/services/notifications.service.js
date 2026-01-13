const db = require("../db/connection");
const { assert, filterPayload, buildUpdateClause } = require("./_utils");

const table = "notifications";
const allowedFields = [
  "type",
  "sub_type",
  "template_key",
  "payload",
  "severity",
  "status",
  "entity_type",
  "entity_id",
  "scheduled_at",
  "read_at",
  "dedupe_key",
];

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `"${key}":${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePayload(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {
      /* ignore parse error and fall back */
    }
  }
  return { value };
}

function computeDedupeKey(data) {
  const payloadObj = normalizePayload(data.payload);
  return [
    data.type || "",
    data.sub_type || "",
    data.template_key || "",
    data.entity_type || "",
    data.entity_id || "",
    stableStringify(payloadObj),
  ].join("|");
}

function dismissNotification(user_id, dedupe_key) {
  assert(user_id, "user_id is required");
  assert(dedupe_key, "dedupe_key is required");
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO dismissed_notifications (user_id, dedupe_key) VALUES (@user_id, @dedupe_key)`
  );
  stmt.run({ user_id, dedupe_key });
  return true;
}

// Bulk dismiss helper to persist suppression keys
function dismissMany(user_id, dedupeKeys = []) {
  if (!dedupeKeys || dedupeKeys.length === 0) return 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO dismissed_notifications (user_id, dedupe_key) VALUES (@user_id, @dedupe_key)`
  );
  const insertMany = db.transaction((keys) => {
    let total = 0;
    keys.forEach((dedupe_key) => {
      total += insert.run({ user_id, dedupe_key }).changes;
    });
    return total;
  });
  return insertMany(dedupeKeys.filter(Boolean));
}

// Check if a notification is dismissed for a user
function isNotificationDismissed(user_id, dedupe_key) {
  assert(user_id, "user_id is required");
  assert(dedupe_key, "dedupe_key is required");
  const row = db
    .prepare(
      `SELECT 1 FROM dismissed_notifications WHERE user_id = @user_id AND dedupe_key = @dedupe_key`
    )
    .get({ user_id, dedupe_key });
  return !!row;
}

function validateEntityPair(data) {
  const hasType = data.entity_type !== undefined && data.entity_type !== null;
  const hasId = data.entity_id !== undefined && data.entity_id !== null;
  if (hasType || hasId) {
    assert(
      hasType && hasId,
      "entity_type and entity_id must be provided together"
    );
  }
}

function list() {
  return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
}

function get(id) {
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
}

function create(payload) {
  const data = filterPayload(payload, allowedFields);
  const insertData = {
    type: null,
    sub_type: null,
    template_key: null,
    payload: {},
    entity_type: null,
    entity_id: null,
    scheduled_at: null,
    read_at: null,
    ...data,
  };
  assert(insertData.type, "type is required");
  assert(insertData.template_key, "template_key is required");
  insertData.payload = normalizePayload(insertData.payload);
  validateEntityPair(insertData);
  if (!insertData.severity) insertData.severity = "info";
  if (!insertData.status) insertData.status = "unread";
  const dedupeKey = insertData.dedupe_key || computeDedupeKey(insertData);
  const payloadString = stableStringify(insertData.payload);

  // Respect user dismissal: do not recreate a previously dismissed notification
  const dismissed = db
    .prepare(
      `SELECT 1 FROM dismissed_notifications WHERE dedupe_key = @dedupe_key`
    )
    .get({ dedupe_key: dedupeKey });
  if (dismissed) {
    return null;
  }

  // If a notification with the same dedupe_key already exists (even soft-deleted), reuse it
  const existingAny = db
    .prepare(
      `SELECT * FROM ${table} WHERE dedupe_key = @dedupe_key ORDER BY id DESC LIMIT 1`
    )
    .get({ dedupe_key: dedupeKey });
  if (existingAny) {
    // If it was deleted, respect the dismissal and do NOT revive
    if (existingAny.deleted_at) {
      return null;
    }

    // Update existing notification instead of creating a new one (bucket exhaustion)
    const updateStmt = db.prepare(
      `UPDATE ${table}
       SET type = @type,
           sub_type = @sub_type,
           template_key = @template_key,
           payload = @payload,
           severity = @severity,
           status = @status,
           entity_type = @entity_type,
           entity_id = @entity_id,
           scheduled_at = @scheduled_at,
           read_at = @read_at,
           updated_at = CURRENT_TIMESTAMP
       WHERE dedupe_key = @dedupe_key AND deleted_at IS NULL`
    );
    updateStmt.run({
      ...insertData,
      payload: payloadString,
      dedupe_key: dedupeKey,
    });
    return get(existingAny.id);
  }

  const stmt = db.prepare(
    `INSERT INTO ${table} (type, sub_type, template_key, payload, dedupe_key, severity, status, entity_type, entity_id, scheduled_at, read_at)
     VALUES (@type, @sub_type, @template_key, @payload, @dedupe_key, @severity, @status, @entity_type, @entity_id, @scheduled_at, @read_at)`
  );
  try {
    const result = stmt.run({
      ...insertData,
      payload: payloadString,
      dedupe_key: dedupeKey,
    });
    return get(result.lastInsertRowid);
  } catch (error) {
    if (
      error &&
      error.message &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      const existing = db
        .prepare(
          `SELECT * FROM ${table} WHERE dedupe_key = @dedupe_key AND deleted_at IS NULL`
        )
        .get({ dedupe_key: dedupeKey });
      if (existing) return existing;
    }
    throw error;
  }
}

function update(id, payload) {
  const data = filterPayload(payload, allowedFields);
  const updatable = {
    entity_type: null,
    entity_id: null,
    scheduled_at: null,
    read_at: null,
    ...data,
  };
  validateEntityPair(updatable);
  assert(Object.keys(data).length > 0, "No fields provided for update");
  if (data.payload !== undefined) {
    data.payload = stableStringify(normalizePayload(data.payload));
  }

  const setClause = buildUpdateClause(data);
  const stmt = db.prepare(
    `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ ...data, id });
  if (result.changes === 0) return null;
  return get(id);
}

function remove(id, user_id = 1) {
  const notification = get(id);
  if (!notification) return false;

  const stmt = db.prepare(
    `UPDATE ${table} SET status = 'archived', deleted_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ id });

  // Persist dismissal so generators do not recreate it
  dismissNotification(user_id, notification.dedupe_key);

  return result.changes > 0;
}

// Bulk clear notifications for a user or all
function clearAll(entity_type, entity_id, user_id = 1) {
  let baseWhere = `WHERE deleted_at IS NULL`;
  const params = {};
  if (entity_type && entity_id) {
    baseWhere += " AND entity_type = @entity_type AND entity_id = @entity_id";
    params.entity_type = entity_type;
    params.entity_id = entity_id;
  }

  const rows = db
    .prepare(`SELECT id, dedupe_key FROM ${table} ${baseWhere}`)
    .all(params);
  const dedupeKeys = rows.map((row) => row.dedupe_key);
  const dismissed = dismissMany(user_id, dedupeKeys);

  const updateStmt = db.prepare(
    `UPDATE ${table} SET status = 'archived', deleted_at = CURRENT_TIMESTAMP ${baseWhere}`
  );
  const result = updateStmt.run(params);

  return { cleared: result.changes, dismissed };
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  clearAll,
  dismissNotification,
  isNotificationDismissed,
};
