/**
 * Rebuild notifications table with new i18n-friendly schema
 *
 * WARNING: This script DROPS and recreates the notifications table.
 * All existing notifications will be LOST.
 *
 * Use this for development/testing only.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'organia.db');
const db = new Database(dbPath);

console.log('⚠️  WARNING: This will DELETE all existing notifications!');
console.log('Rebuilding notifications table with new schema...\n');

try {
  db.exec(`
    BEGIN TRANSACTION;

    -- Drop old table and indexes
    DROP TABLE IF EXISTS notifications;

    -- Create new table with i18n-friendly schema
    CREATE TABLE notifications (
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

    -- Recreate indexes
    CREATE INDEX idx_notifications_status ON notifications(status);
    CREATE UNIQUE INDEX idx_notifications_dedupe_key ON notifications(dedupe_key);
    CREATE INDEX idx_notifications_entity ON notifications(entity_type, entity_id);

    COMMIT;
  `);

  console.log('✅ Success! Notifications table rebuilt with new schema:');
  console.log('   - Removed: title, message (localized text)');
  console.log('   - Added: type, sub_type, template_key, payload, dedupe_key');
  console.log('   - Language-neutral storage enabled');
  console.log('   - On-demand translation ready\n');

  const columns = db.prepare("PRAGMA table_info(notifications)").all();
  console.log('New schema columns:');
  columns.forEach(col => {
    console.log(`   - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}`);
  });

} catch (error) {
  console.error('✗ Failed to rebuild table:', error.message);
  db.exec('ROLLBACK');
  process.exit(1);
} finally {
  db.close();
}
