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
  ensureColumn("specialization", "TEXT");
  ensureColumn("bar_number", "TEXT");
  ensureColumn("office", "TEXT");
  ensureColumn("bio", "TEXT");
  // For older SQLite, avoid non-constant defaults in ALTER; backfill after creation
  ensureColumn("updated_at", "DATETIME", (database) => {
    database.exec(
      "UPDATE operators SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;"
    );
  });

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
