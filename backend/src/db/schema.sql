-- Track dismissed notifications per user (prevents re-generation)
CREATE TABLE IF NOT EXISTS dismissed_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    dedupe_key TEXT NOT NULL,
    dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_dismissed_notifications_user ON dismissed_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_dismissed_notifications_dedupe ON dismissed_notifications(dedupe_key);
PRAGMA foreign_keys = ON;

-- Core entities
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    alternate_phone TEXT,
    address TEXT,
    status TEXT NOT NULL CHECK (status IN ('active','inActive')),
    cin TEXT,
    date_of_birth DATE,
    profession TEXT,
    company TEXT,
    tax_id TEXT,
    missing_fields TEXT,
    join_date DATE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS dossiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    phase TEXT,
    adversary_name TEXT,
    adversary_party TEXT,
    adversary_lawyer TEXT,
    estimated_value NUMERIC,
    court_reference TEXT,
    assigned_lawyer TEXT,
    status TEXT NOT NULL CHECK (status IN ('open','in_progress','on_hold','closed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
    opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    next_deadline DATETIME,
    closed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME,
    CHECK (reference IS NOT NULL AND length(reference) > 0),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_dossiers_client_id ON dossiers(client_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_status ON dossiers(status);
CREATE INDEX IF NOT EXISTS idx_dossiers_priority ON dossiers(priority);
CREATE INDEX IF NOT EXISTS idx_dossiers_next_deadline ON dossiers(next_deadline);

CREATE TABLE IF NOT EXISTS lawsuits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    lawsuit_number TEXT UNIQUE,
    dossier_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    adversary_name TEXT,
    adversary TEXT,
    adversary_party TEXT,
    adversary_lawyer TEXT,
    court TEXT,
    filing_date DATE,
    next_hearing DATE,
    judgment_number TEXT,
    judgment_date DATE,
    reference_number TEXT,
    status TEXT NOT NULL CHECK (status IN ('open','in_progress','on_hold','closed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
    opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME,
    CHECK (reference IS NOT NULL AND length(reference) > 0),
    FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_lawsuits_dossier_id ON lawsuits(dossier_id);
CREATE INDEX IF NOT EXISTS idx_lawsuits_status ON lawsuits(status);
CREATE INDEX IF NOT EXISTS idx_lawsuits_priority ON lawsuits(priority);
CREATE INDEX IF NOT EXISTS idx_lawsuits_next_hearing ON lawsuits(next_hearing);

CREATE TABLE IF NOT EXISTS officers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    alternate_phone TEXT,
    address TEXT,
    agency TEXT,
    location TEXT,
    specialization TEXT,
    registration_number TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','busy','inActive')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    mission_number TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    mission_type TEXT,
    status TEXT NOT NULL CHECK (status IN ('planned','in_progress','completed','cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
    assign_date DATETIME,
    due_date DATETIME,
    completion_date DATETIME,
    closed_at DATETIME,
    result TEXT,
    notes TEXT,
    dossier_id INTEGER,
    lawsuit_id INTEGER,
    officer_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME,
    CHECK (reference IS NOT NULL AND length(reference) > 0),
    CHECK ((dossier_id IS NOT NULL AND lawsuit_id IS NULL) OR (dossier_id IS NULL AND lawsuit_id IS NOT NULL)),
    FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT,
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE RESTRICT,
    FOREIGN KEY (officer_id) REFERENCES officers(id)
);
CREATE INDEX IF NOT EXISTS idx_missions_dossier_id ON missions(dossier_id);
CREATE INDEX IF NOT EXISTS idx_missions_lawsuit_id ON missions(lawsuit_id);
CREATE INDEX IF NOT EXISTS idx_missions_officer_id ON missions(officer_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_priority ON missions(priority);
CREATE INDEX IF NOT EXISTS idx_missions_assign_date ON missions(assign_date);
CREATE INDEX IF NOT EXISTS idx_missions_due_date ON missions(due_date);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id INTEGER,
    lawsuit_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT,
    status TEXT NOT NULL CHECK (status IN ('todo','in_progress','blocked','done','cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
    due_date DATETIME,
    estimated_time TEXT,
    completed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME,
    CHECK ((dossier_id IS NOT NULL AND lawsuit_id IS NULL) OR (lawsuit_id IS NOT NULL AND dossier_id IS NULL)),
    FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT,
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_tasks_dossier_id ON tasks(dossier_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lawsuit_id ON tasks(lawsuit_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    session_type TEXT NOT NULL CHECK (session_type IN ('hearing','consultation','mediation','expertise','phone','other')),
    status TEXT NOT NULL CHECK (status IN ('scheduled','confirmed','pending','completed','cancelled')),
    scheduled_at DATETIME NOT NULL,
    session_date DATE,
    duration TEXT,
    location TEXT,
    court_room TEXT,
    judge TEXT,
    outcome TEXT,
    description TEXT,
    participants TEXT,
    dossier_id INTEGER,
    lawsuit_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME,
    CHECK ((lawsuit_id IS NOT NULL AND dossier_id IS NULL) OR (lawsuit_id IS NULL AND dossier_id IS NOT NULL)),
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE RESTRICT,
    FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_sessions_lawsuit_id ON sessions(lawsuit_id);
CREATE INDEX IF NOT EXISTS idx_sessions_dossier_id ON sessions(dossier_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled_at ON sessions(scheduled_at);

CREATE TABLE IF NOT EXISTS personal_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    status TEXT NOT NULL CHECK (status IN ('todo','in_progress','blocked','done','cancelled','scheduled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
    due_date DATETIME,
    completed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_status ON personal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_due_date ON personal_tasks(due_date);

CREATE TABLE IF NOT EXISTS financial_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL DEFAULT 'client' CHECK (scope IN ('client','internal')),
    client_id INTEGER,
    dossier_id INTEGER,
    lawsuit_id INTEGER,
    mission_id INTEGER,
    task_id INTEGER,
    personal_task_id INTEGER,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('income','expense','revenue')),
    status TEXT NOT NULL CHECK (status IN ('draft','confirmed','cancelled','paid','pending','posted','void')),
    category TEXT,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'TND',
    occurred_at DATETIME,
    due_date DATETIME,
    paid_at DATETIME,
    title TEXT,
    description TEXT,
    reference TEXT,
    direction TEXT DEFAULT NULL CHECK (direction IS NULL OR direction IN ('receivable','payable')),
    cancelled_at DATETIME DEFAULT NULL,
    cancellation_reason TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME,
    CHECK ((dossier_id IS NULL) OR (lawsuit_id IS NULL)),
    CHECK ((scope = 'client' AND client_id IS NOT NULL) OR (scope = 'internal' AND client_id IS NULL)),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT,
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE RESTRICT,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_financial_entries_client_id ON financial_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_dossier_id ON financial_entries(dossier_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_lawsuit_id ON financial_entries(lawsuit_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_mission_id ON financial_entries(mission_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_task_id ON financial_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_personal_task_id ON financial_entries(personal_task_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_status ON financial_entries(status);
CREATE INDEX IF NOT EXISTS idx_financial_entries_entry_type ON financial_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_financial_entries_occurred_at ON financial_entries(occurred_at);
CREATE INDEX IF NOT EXISTS idx_financial_entries_direction ON financial_entries(direction);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    original_filename TEXT,
    category TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    notes TEXT,
    document_text TEXT,
    unreadable_text INTEGER NOT NULL DEFAULT 0,
    text_length INTEGER,
    text_status TEXT NOT NULL DEFAULT 'processing',
    text_source TEXT,
    text_failure_reason TEXT,
    analysis_status TEXT,
    analysis_provider TEXT,
    analysis_confidence REAL,
    analysis_version TEXT,
    artifact_json TEXT,
    processing_started_at DATETIME,
    processing_finished_at DATETIME,
    failure_stage TEXT,
    failure_detail TEXT,
    copy_type TEXT,
    uploaded_by TEXT,
    client_id INTEGER,
    dossier_id INTEGER,
    lawsuit_id INTEGER,
    mission_id INTEGER,
    task_id INTEGER,
    session_id INTEGER,
    personal_task_id INTEGER,
    financial_entry_id INTEGER,
    officer_id INTEGER,
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported INTEGER NOT NULL DEFAULT 0,
    validated INTEGER NOT NULL DEFAULT 1,
    import_source TEXT,
    imported_at DATETIME,
    deleted_at DATETIME,
    CHECK (
        (client_id IS NOT NULL) +
        (dossier_id IS NOT NULL) +
        (lawsuit_id IS NOT NULL) +
        (mission_id IS NOT NULL) +
        (task_id IS NOT NULL) +
        (session_id IS NOT NULL) +
        (personal_task_id IS NOT NULL) +
        (financial_entry_id IS NOT NULL) +
        (officer_id IS NOT NULL) = 1
    ),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT,
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE RESTRICT,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE RESTRICT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT,
    FOREIGN KEY (personal_task_id) REFERENCES personal_tasks(id) ON DELETE RESTRICT,
    FOREIGN KEY (financial_entry_id) REFERENCES financial_entries(id) ON DELETE RESTRICT,
    FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_dossier_id ON documents(dossier_id);
CREATE INDEX IF NOT EXISTS idx_documents_lawsuit_id ON documents(lawsuit_id);
CREATE INDEX IF NOT EXISTS idx_documents_mission_id ON documents(mission_id);
CREATE INDEX IF NOT EXISTS idx_documents_task_id ON documents(task_id);
CREATE INDEX IF NOT EXISTS idx_documents_session_id ON documents(session_id);
CREATE INDEX IF NOT EXISTS idx_documents_personal_task_id ON documents(personal_task_id);
CREATE INDEX IF NOT EXISTS idx_documents_financial_entry_id ON documents(financial_entry_id);
CREATE INDEX IF NOT EXISTS idx_documents_officer_id ON documents(officer_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);

CREATE TABLE IF NOT EXISTS document_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_uid TEXT NOT NULL UNIQUE,
    document_id INTEGER,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    template_key TEXT NOT NULL,
    language TEXT NOT NULL,
    format TEXT NOT NULL,
    content_json TEXT NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_document_generations_target ON document_generations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_document_generations_document_id ON document_generations(document_id);
CREATE INDEX IF NOT EXISTS idx_document_generations_status ON document_generations(status);

CREATE TABLE IF NOT EXISTS document_generation_previews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preview_uid TEXT NOT NULL UNIQUE,
    conversation_id TEXT,
    session_id TEXT,
    created_by TEXT,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    language TEXT NOT NULL,
    format TEXT NOT NULL,
    template_key TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    content_json TEXT NOT NULL,
    preview_html TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('preview_ready', 'proposed', 'cancelled', 'expired', 'failed')),
    proposal_id TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_document_generation_previews_uid ON document_generation_previews(preview_uid);
CREATE INDEX IF NOT EXISTS idx_document_generation_previews_status_expires ON document_generation_previews(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_document_generation_previews_session_created ON document_generation_previews(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    sub_type TEXT,
    template_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
    entity_type TEXT CHECK (entity_type IN ('client', 'dossier', 'lawsuit', 'task', 'session', 'mission', 'financial_entry', 'personal_task', 'document')),
    entity_id INTEGER,
    scheduled_at DATETIME,
    read_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    CHECK ((entity_type IS NULL AND entity_id IS NULL) OR (entity_type IS NOT NULL AND entity_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key ON notifications(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'dossier', 'lawsuit', 'task', 'session', 'mission', 'officer', 'financial_entry', 'document', 'personal_task')),
    entity_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    CHECK (entity_type IS NOT NULL AND entity_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);

CREATE TABLE IF NOT EXISTS operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,
    office_name TEXT,
    office_address TEXT,
    email TEXT,
    phone TEXT,
    fax TEXT,
    mobile TEXT,
    specialization TEXT,
    bar_id TEXT,
    bar_number TEXT,
    vpa TEXT,
    office TEXT,
    bio TEXT,
    role TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS history_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'dossier', 'lawsuit', 'task', 'session', 'mission', 'officer', 'financial_entry', 'document', 'personal_task')),
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    changed_fields TEXT,
    actor TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_history_events_entity ON history_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS audit_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    operation TEXT NOT NULL,
    actor_id TEXT,
    source TEXT NOT NULL DEFAULT 'rest_api',
    route TEXT,
    before_json TEXT,
    after_json TEXT,
    metadata_json TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_mutations_entity ON audit_mutations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_mutations_created_at ON audit_mutations(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_mutations_operation ON audit_mutations(operation);

CREATE TABLE IF NOT EXISTS legacy_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client')),
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

CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    chunk_order INTEGER NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    chunk_text TEXT NOT NULL,
    token_estimate INTEGER,
    chunk_type TEXT NOT NULL DEFAULT 'text',
    sheet_name TEXT,
    metadata_json TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_document_chunks USING fts5(
    chunk_text,
    content='document_chunks',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS document_chunks_ai AFTER INSERT ON document_chunks BEGIN
    INSERT INTO fts_document_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
END;

CREATE TRIGGER IF NOT EXISTS document_chunks_ad AFTER DELETE ON document_chunks BEGIN
    INSERT INTO fts_document_chunks(fts_document_chunks, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
END;

CREATE TRIGGER IF NOT EXISTS document_chunks_au AFTER UPDATE ON document_chunks BEGIN
    INSERT INTO fts_document_chunks(fts_document_chunks, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
    INSERT INTO fts_document_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
END;
