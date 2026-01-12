const db = require("../db/connection");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  ensureXor,
  normalizeData,
} = require("./_utils");
const notesService = require("./notes.service");

const table = "sessions";
const allowedFields = [
  "title",
  "session_type",
  "status",
  "scheduled_at",
  "duration",
  "location",
  "court_room",
  "judge",
  "outcome",
  "description",
  "notes",
  "participants",
  "dossier_id",
  "case_id",
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
    duration: null,
    location: null,
    court_room: null,
    judge: null,
    outcome: null,
    description: null,
    notes: null,
    participants: null,
    dossier_id: null,
    case_id: null,
    ...data,
  };
  if (insertData.participants !== undefined) {
    insertData.participants = serializeParticipants(insertData.participants);
  }
  ensureXor(
    [insertData.dossier_id, insertData.case_id],
    "Provide either dossier_id or case_id (exclusive)"
  );
  assert(insertData.scheduled_at, "scheduled_at is required");
  if (!insertData.session_type) insertData.session_type = "hearing";
  if (!insertData.status) insertData.status = "scheduled";

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (title, session_type, status, scheduled_at, duration, location, court_room, judge, outcome, description, notes, participants, dossier_id, case_id)
       VALUES (@title, @session_type, @status, @scheduled_at, @duration, @location, @court_room, @judge, @outcome, @description, @notes, @participants, @dossier_id, @case_id)`
    );
    const result = stmt.run(insertData);
    return get(result.lastInsertRowid);
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
  if (data.dossier_id !== undefined || data.case_id !== undefined) {
    ensureXor(
      [data.dossier_id, data.case_id],
      "Provide either dossier_id or case_id (exclusive)"
    );
  }

  // Handle notes separately - save to notes table
  let notesArray = null;
  if (data.notes !== undefined) {
    notesArray = data.notes;
    delete data.notes; // Remove from main update
  }

  if (data.participants !== undefined) {
    data.participants = serializeParticipants(data.participants);
  }

  // Only update session table if there are fields other than notes
  if (Object.keys(data).length > 0) {
    const setClause = buildUpdateClause(data);
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
    );
    const result = stmt.run({ ...data, id });
    if (result.changes === 0) return null;
  }

  // Save notes if provided
  if (notesArray !== null) {
    notesService.saveNotesForEntity("session", id, notesArray);
  }

  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");

  // Get the session to know which parent to update
  const session = get(id);
  if (!session) return false;

  // Delete all history events for this session
  historyService.deleteByEntity("session", id);

  // Delete all notes for this session
  notesService.deleteNotesForEntity("session", id);

  // Delete the session
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
  const result = stmt.run({ id });

  // Add deletion event to parent's history (dossier or case)
  if (result.changes > 0) {
    const sessionTitle = session.title || `Session (${session.session_type})`;
    if (session.dossier_id) {
      historyService.create({
        entity_type: "dossier",
        entity_id: session.dossier_id,
        action: "child_deleted",
        description: `Session "${sessionTitle}" was deleted`,
      });
    } else if (session.case_id) {
      historyService.create({
        entity_type: "case",
        entity_id: session.case_id,
        action: "child_deleted",
        description: `Session "${sessionTitle}" was deleted`,
      });
    }
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
