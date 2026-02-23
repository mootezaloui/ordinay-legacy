CREATE TABLE IF NOT EXISTS audit_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete','cancel')),
  actor_id TEXT,
  source TEXT NOT NULL DEFAULT 'rest_api',
  route TEXT,
  before_json TEXT,
  after_json TEXT,
  metadata_json TEXT,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_mutations_entity
ON audit_mutations(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_mutations_occurred_at
ON audit_mutations(occurred_at);

CREATE INDEX IF NOT EXISTS idx_audit_mutations_operation
ON audit_mutations(operation);
