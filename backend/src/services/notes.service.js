const db = require("../db/connection");
const { withTx } = require("../db/withTx");
const auditMutations = require("./auditMutations.service");

const ENTITY_TYPE_ALIASES = {
  financial_entry: ["financial_entry", "financialEntry"],
  personal_task: ["personal_task", "personalTask"],
};

function canonicalizeEntityType(rawType) {
  if (!rawType) return null;
  const value = String(rawType).trim();
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (value === "financialEntry" || lowered === "financialentry") {
    return "financial_entry";
  }
  if (value === "personalTask" || lowered === "personaltask") {
    return "personal_task";
  }
  return lowered;
}

function expandReadEntityTypes(rawType) {
  const canonical = canonicalizeEntityType(rawType);
  if (!canonical) return [];
  const aliases = ENTITY_TYPE_ALIASES[canonical] || [canonical];
  return [...new Set(aliases)];
}

function buildEntityTypeInClause(entityTypes) {
  return entityTypes.map((_, index) => `@t${index}`).join(", ");
}

function buildEntityTypeParams(entityTypes, extra = {}) {
  const params = { ...extra };
  entityTypes.forEach((value, index) => {
    params[`t${index}`] = value;
  });
  return params;
}

function getNotesForEntityFromDb(database, entityType, entityId) {
  const readTypes = expandReadEntityTypes(entityType);
  if (!readTypes.length) return [];
  const inClause = buildEntityTypeInClause(readTypes);
  const params = buildEntityTypeParams(readTypes, { entity_id: Number(entityId) });
  return database
    .prepare(
      `
      SELECT
        id,
        entity_type,
        entity_id,
        content,
        created_by,
        created_at,
        updated_at,
        deleted_at
      FROM notes
      WHERE entity_type IN (${inClause})
        AND entity_id = @entity_id
        AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      `
    )
    .all(params);
}

function getNotesForEntity(entityType, entityId) {
  return getNotesForEntityFromDb(db, entityType, entityId);
}

function listByEntity(entityType, entityId) {
  return getNotesForEntity(entityType, entityId);
}

function get(id) {
  return db
    .prepare(
      `
      SELECT
        id,
        entity_type,
        entity_id,
        content,
        created_by,
        created_at,
        updated_at,
        deleted_at
      FROM notes
      WHERE id = @id AND deleted_at IS NULL
      `
    )
    .get({ id: Number(id) });
}

function create(payload = {}) {
  const entityType = canonicalizeEntityType(payload.entity_type);
  const entityId = Number(payload.entity_id);
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  const createdBy =
    payload.created_by === undefined || payload.created_by === null
      ? null
      : String(payload.created_by);

  if (!entityType || !Number.isFinite(entityId) || entityId <= 0 || !content) {
    const err = new Error("entity_type, entity_id, and content are required");
    err.status = 400;
    throw err;
  }

  const result = db
    .prepare(
      `INSERT INTO notes (entity_type, entity_id, content, created_by)
       VALUES (@entity_type, @entity_id, @content, @created_by)`
    )
    .run({
      entity_type: entityType,
      entity_id: entityId,
      content,
      created_by: createdBy,
    });

  return get(result.lastInsertRowid);
}

function update(id, payload = {}) {
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!content) {
    const err = new Error("content is required");
    err.status = 400;
    throw err;
  }

  const result = db
    .prepare(
      `
      UPDATE notes
      SET content = @content, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND deleted_at IS NULL
      `
    )
    .run({ id: Number(id), content });

  if (result.changes === 0) return null;
  return get(id);
}

function remove(id) {
  const stmt = db.prepare(`DELETE FROM notes WHERE id = @id`);
  const result = stmt.run({ id: Number(id) });
  return result.changes > 0;
}

function isPersistedNoteId(note) {
  return Boolean(note && note.id && typeof note.id === "number" && note.id < 1000000);
}

function saveNotesForEntity(entityType, entityId, notesArray, options = {}) {
  if (!Array.isArray(notesArray)) {
    throw new Error("Notes must be an array");
  }

  const canonicalType = canonicalizeEntityType(entityType);
  const numericEntityId = Number(entityId);
  if (!canonicalType || !Number.isFinite(numericEntityId) || numericEntityId <= 0) {
    throw new Error("Valid entityType and entityId are required");
  }

  return withTx(db, () => {
    const before = getNotesForEntityFromDb(db, canonicalType, numericEntityId);
    const readTypes = expandReadEntityTypes(canonicalType);
    const inClause = buildEntityTypeInClause(readTypes);
    const params = buildEntityTypeParams(readTypes, { entity_id: numericEntityId });

    const existingNotes = db
      .prepare(
        `SELECT id FROM notes
         WHERE entity_type IN (${inClause})
           AND entity_id = @entity_id
           AND deleted_at IS NULL`
      )
      .all(params);

    const existingIds = existingNotes.map((n) => n.id);
    const incomingIds = notesArray.filter(isPersistedNoteId).map((n) => n.id);

    existingIds.forEach((noteId) => {
      if (!incomingIds.includes(noteId)) {
        db.prepare(`DELETE FROM notes WHERE id = ?`).run(noteId);
      }
    });

    const insertStmt = db.prepare(`
      INSERT INTO notes (entity_type, entity_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE notes
      SET content = ?, updated_at = ?
      WHERE id = ?
    `);

    notesArray.forEach((note) => {
      const content = typeof note?.content === "string" ? note.content.trim() : "";
      if (!content) return;
      if (isPersistedNoteId(note)) {
        updateStmt.run(note.content, note.updatedAt || new Date().toISOString(), note.id);
        return;
      }
      insertStmt.run(
        canonicalType,
        numericEntityId,
        content,
        note.createdAt || new Date().toISOString(),
        note.updatedAt || new Date().toISOString()
      );
    });

    const after = getNotesForEntityFromDb(db, canonicalType, numericEntityId);
    auditMutations.append(
      {
        entity_type: canonicalType,
        entity_id: numericEntityId,
        operation: "update",
        actor_id: options.actor_id || options.actorId || null,
        source: options.source || "rest_api",
        route: options.route || null,
        before,
        after,
        metadata: {
          mode: "bulk_sync",
          note_count: after.length,
        },
      },
      db
    );

    return after;
  });
}

function deleteNotesForEntity(entityType, entityId) {
  const readTypes = expandReadEntityTypes(entityType);
  if (!readTypes.length) return 0;
  const inClause = buildEntityTypeInClause(readTypes);
  const params = buildEntityTypeParams(readTypes, { entity_id: Number(entityId) });
  const result = db
    .prepare(
      `DELETE FROM notes
       WHERE entity_type IN (${inClause})
         AND entity_id = @entity_id`
    )
    .run(params);
  return result.changes;
}

module.exports = {
  canonicalizeEntityType,
  expandReadEntityTypes,
  listByEntity,
  get,
  create,
  update,
  remove,
  getNotesForEntity,
  saveNotesForEntity,
  deleteNotesForEntity,
};
