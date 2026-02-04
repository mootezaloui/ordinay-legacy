const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { dbFile } = require("../config/db.config");

const dbPath = dbFile;
const schemaPath = path.resolve(__dirname, "schema.sql");
const migrationsDir = path.resolve(__dirname, "..", "migrations");

function applyMigrations(db) {
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const appliedVersion = db.pragma("user_version", { simple: true });
  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/i.test(file))
    .map((file) => ({
      version: parseInt(file.split("_")[0], 10),
      file,
    }))
    .filter(({ version }) => Number.isInteger(version))
    .sort((a, b) => a.version - b.version);

  // Disable FK enforcement for the duration of structural migrations
  db.pragma("foreign_keys = OFF");
  try {
    migrations.forEach(({ version, file }) => {
      if (version <= appliedVersion) return;

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      try {
        db.exec("BEGIN");
        db.exec(sql);
        db.pragma(`user_version = ${version}`);
        db.exec("COMMIT");
        console.log(`[db] Applied migration ${file}`);
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        console.error(`[db] Failed migration ${file}:`, error.message);
        throw error;
      }
    });
  } finally {
    // Re-enable FK enforcement and verify integrity
    try {
      db.pragma("foreign_keys = ON");
      const violations = db.prepare("PRAGMA foreign_key_check").all();
      if (violations && violations.length) {
        console.error(
          `[db] Foreign key violations detected after migrations:`,
          violations
        );
        throw new Error("Foreign key violations detected after migrations");
      }
    } catch (e) {
      // Bubble up to caller so startup fails visibly
      throw e;
    }
  }
}

function initialize() {
  const db = new Database(dbPath);

  db.pragma("foreign_keys = ON");

  const hasClientsTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='clients'"
    )
    .get();

  if (!hasClientsTable) {
    const schema = fs.readFileSync(schemaPath, "utf8");
    db.exec(schema);
  }

  // Ensure dismissed_notifications exists even on older DBs (no migration needed)
  const hasDismissed = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='dismissed_notifications'"
    )
    .get();
  if (!hasDismissed) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dismissed_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        dedupe_key TEXT NOT NULL,
        dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, dedupe_key)
      );
      CREATE INDEX IF NOT EXISTS idx_dismissed_notifications_user ON dismissed_notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_dismissed_notifications_dedupe ON dismissed_notifications(dedupe_key);
    `);
  }

  // Ensure legacy_imports exists even on older DBs (no migration needed)
  const hasLegacyImports = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_imports'"
    )
    .get();
  if (!hasLegacyImports) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS legacy_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'dossier', 'lawsuit', 'task', 'session', 'mission', 'financial_entry', 'personal_task', 'officer', 'document')),
        payload TEXT NOT NULL,
        normalized_payload TEXT,
        validation_errors TEXT,
        import_source TEXT,
        imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        imported INTEGER NOT NULL DEFAULT 1,
        validated INTEGER NOT NULL DEFAULT 0,
        resolved_entity_id INTEGER,
        resolved_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_legacy_imports_entity_type ON legacy_imports(entity_type);
      CREATE INDEX IF NOT EXISTS idx_legacy_imports_validated ON legacy_imports(validated);
      CREATE INDEX IF NOT EXISTS idx_legacy_imports_imported_at ON legacy_imports(imported_at);
    `);
  }

  // Apply pending migrations (idempotent via PRAGMA user_version)
  applyMigrations(db);

  // Ensure operators table exists and default operator is seeded
  const hasOperatorsTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='operators'"
    )
    .get();

  if (!hasOperatorsTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS operators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        specialization TEXT,
        bar_number TEXT,
        office TEXT,
        bio TEXT,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Ensure new profile columns exist even if the table was created before the schema update
  const operatorColumns = db
    .prepare("PRAGMA table_info(operators)")
    .all()
    .map((col) => col.name);
  const ensureColumn = (name, definition, onAdd) => {
    if (!operatorColumns.includes(name)) {
      db.exec(`ALTER TABLE operators ADD COLUMN ${name} ${definition};`);
      if (typeof onAdd === "function") {
        onAdd(db);
      }
    }
  };

  ensureColumn("email", "TEXT");
  ensureColumn("phone", "TEXT");
  ensureColumn("fax", "TEXT");
  ensureColumn("mobile", "TEXT");
  ensureColumn("specialization", "TEXT");
  ensureColumn("title", "TEXT");
  ensureColumn("office_name", "TEXT");
  ensureColumn("office_address", "TEXT");
  ensureColumn("bar_id", "TEXT");
  ensureColumn("bar_number", "TEXT");
  ensureColumn("vpa", "TEXT");
  ensureColumn("office", "TEXT");
  ensureColumn("bio", "TEXT");
  // For older SQLite, avoid non-constant defaults in ALTER; backfill after creation
  ensureColumn("updated_at", "DATETIME", (database) => {
    database.exec(
      "UPDATE operators SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;"
    );
  });

  const ensureTableColumns = (table, columns) => {
    const hasTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=@name"
      )
      .get({ name: table });
    if (!hasTable) return;

    const existing = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((col) => col.name);

    columns.forEach(({ name, definition, onAdd }) => {
      if (!existing.includes(name)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
        if (typeof onAdd === "function") {
          onAdd(db);
        }
      }
    });
  };

  const importColumns = [
    { name: "imported", definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: "validated", definition: "INTEGER NOT NULL DEFAULT 1" },
    { name: "import_source", definition: "TEXT" },
    { name: "imported_at", definition: "DATETIME" },
  ];
  const lawsuitColumns = [
    { name: "adversary_name", definition: "TEXT" },
    { name: "judgment_number", definition: "TEXT" },
    { name: "judgment_date", definition: "DATE" },
  ];
  const dossierColumns = [{ name: "adversary_name", definition: "TEXT" }];
  const sessionColumns = [{ name: "session_date", definition: "DATE" }];
  const documentColumns = [
    { name: "copy_type", definition: "TEXT" },
    { name: "officer_id", definition: "INTEGER" },
    { name: "document_text", definition: "TEXT" },
    { name: "unreadable_text", definition: "INTEGER NOT NULL DEFAULT 0" },
  ];

  [
    "clients",
    "dossiers",
    "lawsuits",
    "tasks",
    "sessions",
    "missions",
    "officers",
    "personal_tasks",
    "financial_entries",
    "documents",
  ].forEach((table) => ensureTableColumns(table, importColumns));
  ensureTableColumns("lawsuits", lawsuitColumns);
  ensureTableColumns("dossiers", dossierColumns);
  ensureTableColumns("sessions", sessionColumns);
  ensureTableColumns("documents", documentColumns);

  // Ensure default operator exists
  const hasDefaultOperator = db
    .prepare("SELECT id FROM operators WHERE role = 'OWNER'")
    .get();

  if (!hasDefaultOperator) {
    db.prepare(
      `
      INSERT INTO operators (name, role, is_active)
      VALUES (?, ?, ?)
    `
    ).run("Principal Lawyer", "OWNER", 1);
  }

  return db;
}

const db = initialize();

module.exports = db;
