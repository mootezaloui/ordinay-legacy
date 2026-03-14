"use strict";

const db = require("../../db/connection");

const SHARED_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  created_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_turns_session ON turns(session_id, created_at);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT,
  tool_name TEXT,
  content TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_history_session ON history(session_id, id);

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT,
  summary TEXT,
  args_json TEXT,
  created_at TEXT,
  requested_by_turn_id TEXT,
  risk TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_pending_session ON pending_actions(session_id);

CREATE TABLE IF NOT EXISTS audit_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT,
  event_type TEXT,
  timestamp TEXT,
  data_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_session_time ON audit_records(session_id, timestamp);
`;

const AGENT_SESSIONS_TABLE = "agent_sessions";

const AGENT_SESSIONS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${AGENT_SESSIONS_TABLE} (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  mode TEXT,
  created_at TEXT,
  updated_at TEXT,
  summary TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated_at ON ${AGENT_SESSIONS_TABLE}(updated_at);
`;

function createSQLiteClient() {
  runSchemaBootstrap();

  return {
    db,
    tables: resolvedTables,

    async exec(sql) {
      db.exec(String(sql || ""));
    },

    async run(sql, params = {}) {
      return db.prepare(String(sql || "")).run(params);
    },

    async get(sql, params = {}) {
      return db.prepare(String(sql || "")).get(params) || null;
    },

    async all(sql, params = {}) {
      return db.prepare(String(sql || "")).all(params);
    },

    async tx(work) {
      if (typeof work !== "function") {
        throw new Error("tx(work) requires a function");
      }

      const runner = db.transaction((ctx) => work(ctx));
      return runner({
        run: (sql, params = {}) => db.prepare(String(sql || "")).run(params),
        get: (sql, params = {}) => db.prepare(String(sql || "")).get(params) || null,
        all: (sql, params = {}) => db.prepare(String(sql || "")).all(params),
        exec: (sql) => db.exec(String(sql || "")),
      });
    },
  };
}

let schemaInitialized = false;
let resolvedTables = {
  sessions: "sessions",
  turns: "turns",
  history: "history",
  pendingActions: "pending_actions",
  auditRecords: "audit_records",
};

function runSchemaBootstrap() {
  if (schemaInitialized) {
    return;
  }

  db.exec(SHARED_SCHEMA_SQL);
  const sessionsTable = resolveSessionsTableName();
  ensureColumn(sessionsTable, "metadata_json", "TEXT");
  resolvedTables = {
    sessions: sessionsTable,
    turns: "turns",
    history: "history",
    pendingActions: "pending_actions",
    auditRecords: "audit_records",
  };
  schemaInitialized = true;
}

function resolveSessionsTableName() {
  if (isCompatibleAgentSessionsTable("sessions")) {
    return "sessions";
  }

  db.exec(AGENT_SESSIONS_SCHEMA_SQL);
  return AGENT_SESSIONS_TABLE;
}

function isCompatibleAgentSessionsTable(table) {
  const tableName = String(table || "").trim();
  if (!tableName) {
    return false;
  }

  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);
  if (!row) {
    return false;
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const required = ["id", "user_id", "mode", "created_at", "updated_at", "summary", "metadata_json"];
  const hasRequiredColumns = required.every((column) =>
    columns.some((entry) => String(entry.name || "").toLowerCase() === column),
  );
  if (!hasRequiredColumns) {
    return false;
  }

  const idColumn = columns.find((entry) => String(entry.name || "").toLowerCase() === "id");
  const idType = String(idColumn?.type || "").trim().toUpperCase();
  return idType !== "INTEGER";
}

function ensureColumn(table, column, definition) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = rows.some((row) => String(row.name) === String(column));
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = {
  createSQLiteClient,
};
