const db = require("../db/connection");
const { assert, filterPayload } = require("./_utils");

const table = "history_events";
const allowedFields = [
  "entity_type",
  "entity_id",
  "action",
  "description",
  "changed_fields",
  "actor",
];

const allowedEntityTypes = new Set([
  "client",
  "dossier",
  "lawsuit",
  "task",
  "session",
  "mission",
  "officer",
  "financial_entry",
  "document",
  "personal_task",
]);

const normalizeEntityType = (rawType) => {
  if (!rawType) return null;
  const map = {
    financialEntry: "financial_entry",
    financialentry: "financial_entry",
    personalTask: "personal_task",
    personaltask: "personal_task",
    // Legacy alias: normalize "case" to canonical "lawsuit"
    case: "lawsuit",
  };
  const lowered = String(rawType).toLowerCase();
  return map[rawType] || map[lowered] || lowered;
};

function list(filters = {}) {
  const { whereClause, params } = buildWhereClause(filters);
  return db
    .prepare(
      `SELECT * FROM ${table} ${whereClause} ORDER BY created_at DESC, id DESC`
    )
    .all(params);
}

function count(filters = {}) {
  const { whereClause, params } = buildWhereClause(filters);
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM ${table} ${whereClause}`)
    .get(params);
  return row?.count || 0;
}

function listFiltered({
  entityType = null,
  entityId = null,
  query = null,
  limit = 50,
} = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (entityType) {
    where.push("entity_type = @entityType");
    params.entityType = normalizeEntityType(entityType);
  }
  if (Number.isInteger(Number(entityId)) && Number(entityId) > 0) {
    where.push("entity_id = @entityId");
    params.entityId = Number(entityId);
  }
  if (query) {
    where.push(
      "(LOWER(COALESCE(action, '')) LIKE @query OR LOWER(COALESCE(description, '')) LIKE @query)",
    );
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const events = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT @limit`,
    )
    .all(params);

  return events.map(parseChangedFields);
}

function buildWhereClause(filters = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {};

  if (filters.entity_type) {
    where.push("entity_type = @entity_type");
    params.entity_type = filters.entity_type;
  }
  if (filters.entity_id !== undefined && filters.entity_id !== null) {
    where.push("entity_id = @entity_id");
    params.entity_id = filters.entity_id;
  }

  return {
    whereClause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

function get(id) {
  const event = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!event) return null;
  return parseChangedFields(event);
}

function create(payload) {
  const data = filterPayload(payload, allowedFields);
  const normalizedType = normalizeEntityType(data.entity_type);
  data.entity_type = allowedEntityTypes.has(normalizedType)
    ? normalizedType
    : "client";

  if (data.entity_id === undefined || data.entity_id === null) {
    data.entity_id = 0;
  }
  data.action = data.action || "log";
  data.description = data.description ?? null;
  data.changed_fields = data.changed_fields ?? null;
  data.actor = data.actor ?? null;

  if (data.changed_fields && typeof data.changed_fields === "object") {
    data.changed_fields = JSON.stringify(data.changed_fields);
  }

  // Check for duplicate within the last 2 seconds to prevent React StrictMode duplicates
  const recentDuplicate = db.prepare(
    `SELECT * FROM ${table}
     WHERE entity_type = @entity_type
     AND entity_id = @entity_id
     AND action = @action
     AND description = @description
     AND (julianday('now') - julianday(created_at)) * 86400 < 2
     ORDER BY created_at DESC LIMIT 1`
  ).get(data);

  if (recentDuplicate) {
    console.log("[history.service] Skipping duplicate event within 2 seconds", {
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      action: data.action,
      description: data.description
    });
    return recentDuplicate;
  }

  const stmt = db.prepare(
    `INSERT INTO ${table} (entity_type, entity_id, action, description, changed_fields, actor)
     VALUES (@entity_type, @entity_id, @action, @description, @changed_fields, @actor)`
  );
  try {
    const result = stmt.run(data);
    return db
      .prepare(`SELECT * FROM ${table} WHERE id = @id`)
      .get({ id: result.lastInsertRowid });
  } catch (err) {
    console.error("[history.service] Failed to insert history event", err, data);
    throw err;
  }
}

function deleteByEntity(entity_type, entity_id) {
  const stmt = db.prepare(
    `DELETE FROM ${table} WHERE entity_type = @entity_type AND entity_id = @entity_id`
  );
  const result = stmt.run({ entity_type, entity_id });
  return result.changes;
}

function remove(id) {
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
  const result = stmt.run({ id });
  return result.changes;
}

function parseChangedFields(event) {
  if (event.changed_fields && typeof event.changed_fields === "string") {
    try {
      event.changed_fields = JSON.parse(event.changed_fields);
    } catch (e) {
      event.changed_fields = null;
    }
  }
  return event;
}

// Wrap list to parse changed_fields
const originalList = list;
list = function (filters = {}) {
  const events = originalList(filters);
  return events.map(parseChangedFields);
};

module.exports = {
  list,
  listFiltered,
  count,
  get,
  create,
  deleteByEntity,
  remove,
};
