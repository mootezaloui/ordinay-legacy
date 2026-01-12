/**
 * Migration: Add 'type' column to notifications table
 *
 * This migration adds the missing 'type' column to existing databases.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'organia.db');
const db = new Database(dbPath);

console.log('Starting migration: Add type column to notifications table...');

try {
  // Check if type column exists
  const columns = db.prepare("PRAGMA table_info(notifications)").all();
  const hasTypeColumn = columns.some(col => col.name === 'type');

  if (hasTypeColumn) {
    console.log('✓ Type column already exists. No migration needed.');
    process.exit(0);
  }

  console.log('Adding type column...');

  // SQLite doesn't support ALTER TABLE ADD COLUMN with NOT NULL and no default
  // We need to recreate the table

  db.exec(`
    BEGIN TRANSACTION;

    -- Create new table with correct schema
    CREATE TABLE notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        sub_type TEXT,
        template_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
        status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
        entity_type TEXT CHECK (entity_type IN ('client', 'dossier', 'case', 'task', 'session', 'mission', 'financial_entry', 'personal_task', 'document')),
        entity_id INTEGER,
        scheduled_at DATETIME,
        read_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        CHECK ((entity_type IS NULL AND entity_id IS NULL) OR (entity_type IS NOT NULL AND entity_id IS NOT NULL))
    );

    -- Copy existing data (set type to entity_type or 'app' as default)
    INSERT INTO notifications_new (
        id, type, sub_type, template_key, payload, dedupe_key,
        severity, status, entity_type, entity_id, scheduled_at, read_at,
        created_at, updated_at, deleted_at
    )
    SELECT
        id,
        COALESCE(entity_type, 'app') as type,
        sub_type,
        template_key,
        payload,
        dedupe_key,
        severity,
        status,
        entity_type,
        entity_id,
        scheduled_at,
        read_at,
        created_at,
        updated_at,
        deleted_at
    FROM notifications;

    -- Drop old table
    DROP TABLE notifications;

    -- Rename new table
    ALTER TABLE notifications_new RENAME TO notifications;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key ON notifications(dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);

    COMMIT;
  `);

  console.log('✓ Migration completed successfully!');
  console.log('✓ Type column added to notifications table.');

} catch (error) {
  console.error('✗ Migration failed:', error.message);
  db.exec('ROLLBACK');
  process.exit(1);
} finally {
  db.close();
}
