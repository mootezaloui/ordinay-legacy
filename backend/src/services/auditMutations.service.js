const db = require("../db/connection");

const table = "audit_mutations";

function stableJson(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function append(payload = {}, database = db) {
  const row = {
    entity_type: String(payload.entity_type || "").trim() || "unknown",
    entity_id:
      payload.entity_id === undefined || payload.entity_id === null
        ? null
        : Number(payload.entity_id),
    operation: String(payload.operation || "").trim() || "update",
    actor_id:
      payload.actor_id === undefined || payload.actor_id === null
        ? null
        : String(payload.actor_id),
    source: String(payload.source || "rest_api"),
    route:
      payload.route === undefined || payload.route === null
        ? null
        : String(payload.route),
    before_json: stableJson(payload.before),
    after_json: stableJson(payload.after),
    metadata_json: stableJson(payload.metadata),
  };

  const stmt = database.prepare(
    `INSERT INTO ${table} (
      entity_type,
      entity_id,
      operation,
      actor_id,
      source,
      route,
      before_json,
      after_json,
      metadata_json
    ) VALUES (
      @entity_type,
      @entity_id,
      @operation,
      @actor_id,
      @source,
      @route,
      @before_json,
      @after_json,
      @metadata_json
    )`
  );

  const result = stmt.run(row);
  return database
    .prepare(`SELECT * FROM ${table} WHERE id = @id`)
    .get({ id: result.lastInsertRowid });
}

function appendMany(rows = [], database = db) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row) => append(row, database));
}

function listByEntity(entity_type, entity_id, database = db) {
  return database
    .prepare(
      `SELECT * FROM ${table}
       WHERE entity_type = @entity_type AND entity_id = @entity_id
       ORDER BY id ASC`
    )
    .all({ entity_type, entity_id });
}

module.exports = {
  append,
  appendMany,
  listByEntity,
};
