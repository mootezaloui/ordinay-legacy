const db = require("../db/connection");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  ensureXor,
  normalizeData,
} = require("./_utils");
const notesService = require("./notes.service");
const { withTx } = require("../db/withTx");
const auditMutations = require("./auditMutations.service");

const table = "sessions";
const allowedFields = [
  "title",
  "session_type",
  "status",
  "scheduled_at",
  "session_date",
  "duration",
  "location",
  "court_room",
  "judge",
  "outcome",
  "description",
  "participants",
  "dossier_id",
  "lawsuit_id",
];

const parseParticipants = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  // If it already looks like JSON, parse it
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn(
        "[sessions.service] Failed to parse participants JSON",
        err.message
      );
      return [];
    }
  }

  // For plain text, wrap it as a single-element array
  // This handles legacy data that isn't JSON
  return [value];
};

const serializeParticipants = (value) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "string") return value;
  return null;
};

function list() {
  const sessions = db
    .prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`)
    .all();

  // Attach notes for each session so UI gets the persisted notes on initial load
  return sessions.map((session) => ({
    ...session,
    notes: notesService.getNotesForEntity("session", session.id),
    participants: parseParticipants(session.participants),
  }));
}

function listByDossier(dossierId) {
  if (!Number.isInteger(Number(dossierId))) {
    return [];
  }

  const sessions = db
    .prepare(
      `SELECT * FROM ${table} WHERE dossier_id = @dossierId AND deleted_at IS NULL ORDER BY id ASC`,
    )
    .all({ dossierId: Number(dossierId) });

  return sessions.map((session) => ({
    ...session,
    notes: notesService.getNotesForEntity("session", session.id),
    participants: parseParticipants(session.participants),
  }));
}

function listByLawsuit(lawsuitId) {
  if (!Number.isInteger(Number(lawsuitId))) {
    return [];
  }

  const sessions = db
    .prepare(
      `SELECT * FROM ${table} WHERE lawsuit_id = @lawsuitId AND deleted_at IS NULL ORDER BY id ASC`,
    )
    .all({ lawsuitId: Number(lawsuitId) });

  return sessions.map((session) => ({
    ...session,
    notes: notesService.getNotesForEntity("session", session.id),
    participants: parseParticipants(session.participants),
  }));
}

function listFiltered({
  query = null,
  status = null,
  dossierId = null,
  lawsuitId = null,
  timeframe = null,
  limit = 50,
} = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (Number.isInteger(Number(dossierId)) && Number(dossierId) > 0) {
    where.push("dossier_id = @dossierId");
    params.dossierId = Number(dossierId);
  }

  if (Number.isInteger(Number(lawsuitId)) && Number(lawsuitId) > 0) {
    where.push("lawsuit_id = @lawsuitId");
    params.lawsuitId = Number(lawsuitId);
  }

  if (status) {
    where.push("LOWER(COALESCE(status, '')) = @status");
    params.status = String(status).trim().toLowerCase();
  }

  if (query) {
    where.push(
      "(LOWER(COALESCE(title, '')) LIKE @query OR LOWER(COALESCE(session_type, '')) LIKE @query)",
    );
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const normalizedTimeframe = String(timeframe || "").trim().toLowerCase();
  if (normalizedTimeframe === "today") {
    where.push("scheduled_at IS NOT NULL AND DATE(scheduled_at) = DATE('now')");
  } else if (normalizedTimeframe === "this-week") {
    where.push(
      "scheduled_at IS NOT NULL AND DATETIME(scheduled_at) >= DATETIME('now') AND DATETIME(scheduled_at) <= DATETIME('now', '+7 days')",
    );
  } else if (normalizedTimeframe === "upcoming") {
    where.push("scheduled_at IS NOT NULL AND DATETIME(scheduled_at) >= DATETIME('now')");
  }

  const sessions = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(scheduled_at, created_at) DESC, id DESC
       LIMIT @limit`,
    )
    .all(params);

  return sessions.map((session) => ({
    ...session,
    notes: notesService.getNotesForEntity("session", session.id),
    participants: parseParticipants(session.participants),
  }));
}

function get(id) {
  const session = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!session) return null;

  // Load notes from notes table
  const notes = notesService.getNotesForEntity("session", id);
  session.notes = notes;
  session.participants = parseParticipants(session.participants);

  return session;
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    title: null,
    session_date: null,
    duration: null,
    location: null,
    court_room: null,
    judge: null,
    outcome: null,
    description: null,
    participants: null,
    dossier_id: null,
    lawsuit_id: null,
    ...data,
  };
  if (insertData.participants !== undefined) {
    insertData.participants = serializeParticipants(insertData.participants);
  }
  ensureXor(
    [insertData.dossier_id, insertData.lawsuit_id],
    "Provide either dossier_id or lawsuit_id (exclusive)"
  );
  assert(insertData.scheduled_at, "scheduled_at is required");
  if (!insertData.session_type) insertData.session_type = "hearing";
  if (!insertData.status) insertData.status = "scheduled";

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (title, session_type, status, scheduled_at, session_date, duration, location, court_room, judge, outcome, description, participants, dossier_id, lawsuit_id)
       VALUES (@title, @session_type, @status, @scheduled_at, @session_date, @duration, @location, @court_room, @judge, @outcome, @description, @participants, @dossier_id, @lawsuit_id)`
    );
    const result = stmt.run(insertData);
    const created = get(result.lastInsertRowid);
    if (payload?.notes !== undefined) {
      notesService.saveNotesForEntity("session", created.id, payload.notes);
      created.notes = notesService.getNotesForEntity("session", created.id);
    }
    return created;
  } catch (error) {
    console.error("[sessions.service] Create failed:", error.message);
    console.error(
      "[sessions.service] Insert data:",
      JSON.stringify(insertData, null, 2)
    );
    throw error;
  }
}

function update(id, payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  if (data.dossier_id !== undefined || data.lawsuit_id !== undefined) {
    ensureXor(
      [data.dossier_id, data.lawsuit_id],
      "Provide either dossier_id or lawsuit_id (exclusive)"
    );
  }

  const notesArray = payload?.notes;

  if (data.participants !== undefined) {
    data.participants = serializeParticipants(data.participants);
  }

  const hasDataFields = Object.keys(data).length > 0;
  if (!hasDataFields && notesArray === undefined) {
    throw new Error("No fields provided for update");
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
    notesService.saveNotesForEntity("session", id, notesArray);
  }

  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");

  // Get the session to know which parent to update
  const session = get(id);
  if (!session) return false;

  return withTx(db, () => {
    notesService.deleteNotesForEntity("session", id);

    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    if (result.changes === 0) return false;

    const sessionTitle = session.title || `Session (${session.session_type})`;
    historyService.create({
      entity_type: "session",
      entity_id: id,
      action: "entity_deleted",
      description: `Session "${sessionTitle}" was deleted`,
    });

    if (session.dossier_id) {
      historyService.create({
        entity_type: "dossier",
        entity_id: session.dossier_id,
        action: "child_deleted",
        description: `Session "${sessionTitle}" was deleted`,
      });
    } else if (session.lawsuit_id) {
      historyService.create({
        entity_type: "lawsuit",
        entity_id: session.lawsuit_id,
        action: "child_deleted",
        description: `Session "${sessionTitle}" was deleted`,
      });
    }

    auditMutations.append(
      {
        entity_type: "session",
        entity_id: id,
        operation: "delete",
        source: "rest_api",
        before: session,
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
  listByLawsuit,
  listFiltered,
  get,
  create,
  update,
  remove,
};

