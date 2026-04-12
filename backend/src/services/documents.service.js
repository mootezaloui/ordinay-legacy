const db = require('../db/connection');
const { assert, filterPayload, buildUpdateClause } = require('./_utils');
const documentStorage = require('./documentStorage');

const table = 'documents';
const DOCUMENT_UNDERSTANDING_DISABLED_REASON = 'document_understanding_disabled';
const DOCUMENT_ENTITY_COLUMNS = {
  client: 'client_id',
  dossier: 'dossier_id',
  lawsuit: 'lawsuit_id',
  mission: 'mission_id',
  task: 'task_id',
  session: 'session_id',
  personal_task: 'personal_task_id',
  financial_entry: 'financial_entry_id',
  officer: 'officer_id',
};
const allowedFields = [
  'title',
  'file_path',
  'original_filename',
  'mime_type',
  'size_bytes',
  'notes',
  'copy_type',
  'client_id',
  'dossier_id',
  'lawsuit_id',
  'mission_id',
  'task_id',
  'session_id',
  'personal_task_id',
  'financial_entry_id',
  'officer_id',
];

function validateTarget(data) {
  const targets = [
    data.client_id,
    data.dossier_id,
    data.lawsuit_id,
    data.mission_id,
    data.task_id,
    data.session_id,
    data.personal_task_id,
    data.financial_entry_id,
    data.officer_id,
  ];
  const count = targets.filter((v) => v !== null && v !== undefined).length;
  assert(count === 1, 'Exactly one parent reference is required for documents');
}

function normalizeManagedFilePath(filePath) {
  const resolved = documentStorage.resolveManagedDocumentPath(String(filePath || ''));
  assert(
    resolved,
    'file_path must resolve inside the managed documents directory',
  );
  return resolved;
}

function resolveTextStatus(document) {
  if (document && document.text_status) return document.text_status;
  if (document && document.unreadable_text) return 'unreadable';
  if (
    document &&
    typeof document.document_text === 'string' &&
    document.document_text.length > 0
  ) {
    return 'readable';
  }
  return 'unreadable';
}

function buildDisabledArtifact() {
  return {
    extracted_text: '',
    visual_summary:
      'Document understanding is disabled. File storage remains available.',
    key_entities: [],
    risk_flags: [DOCUMENT_UNDERSTANDING_DISABLED_REASON],
    provenance: {
      stage: 'disabled',
      mode: 'disabled',
    },
    processingStats: {
      elapsedMs: 0,
      pagesProcessed: 0,
      totalPages: 0,
      cacheHit: false,
    },
    needsUserContinue: false,
    remainingPages: [],
  };
}

function buildPendingIngestionState() {
  const now = new Date().toISOString();
  return {
    document_text: null,
    unreadable_text: 1,
    text_length: null,
    text_status: 'unreadable',
    text_source: null,
    text_failure_reason: DOCUMENT_UNDERSTANDING_DISABLED_REASON,
    analysis_status: 'disabled',
    analysis_provider: null,
    analysis_confidence: null,
    analysis_version: null,
    artifact_json: JSON.stringify(buildDisabledArtifact()),
    processing_started_at: now,
    processing_finished_at: now,
    failure_stage: 'disabled',
    failure_detail: DOCUMENT_UNDERSTANDING_DISABLED_REASON,
  };
}

function scheduleIngestion() {
  return false;
}

function disableLegacyIngestionState() {
  const unreadableExpr =
    `COALESCE(LENGTH(document_text), 0) = 0 OR COALESCE(unreadable_text, 0) = 1`;
  try {
    db.prepare(
      `UPDATE ${table}
       SET
         text_status = CASE
           WHEN ${unreadableExpr} THEN 'unreadable'
           ELSE 'readable'
         END,
         unreadable_text = CASE
           WHEN ${unreadableExpr} THEN 1
           ELSE 0
         END,
         text_source = CASE
           WHEN ${unreadableExpr} THEN NULL
           ELSE COALESCE(NULLIF(text_source, ''), 'native')
         END,
         text_failure_reason = CASE
           WHEN ${unreadableExpr} THEN COALESCE(NULLIF(text_failure_reason, ''), @reason)
           ELSE NULL
         END,
         analysis_status = CASE
           WHEN ${unreadableExpr} THEN 'disabled'
           ELSE COALESCE(NULLIF(analysis_status, ''), 'completed')
         END,
         analysis_provider = CASE
           WHEN ${unreadableExpr} THEN NULL
           ELSE analysis_provider
         END,
         analysis_confidence = CASE
           WHEN ${unreadableExpr} THEN NULL
           ELSE analysis_confidence
         END,
         analysis_version = CASE
           WHEN ${unreadableExpr} THEN NULL
           ELSE analysis_version
         END,
         artifact_json = CASE
           WHEN ${unreadableExpr} THEN COALESCE(NULLIF(artifact_json, ''), @artifact)
           ELSE artifact_json
         END,
         processing_finished_at = COALESCE(processing_finished_at, CURRENT_TIMESTAMP),
         failure_stage = CASE
           WHEN ${unreadableExpr} THEN COALESCE(NULLIF(failure_stage, ''), 'disabled')
           ELSE NULL
         END,
         failure_detail = CASE
           WHEN ${unreadableExpr} THEN COALESCE(NULLIF(failure_detail, ''), @reason)
           ELSE NULL
         END,
         updated_at = CURRENT_TIMESTAMP
       WHERE deleted_at IS NULL
         AND (
           LOWER(COALESCE(text_status, '')) = 'processing'
           OR LOWER(COALESCE(analysis_status, '')) = 'processing'
         )`,
    ).run({
      reason: DOCUMENT_UNDERSTANDING_DISABLED_REASON,
      artifact: JSON.stringify(buildDisabledArtifact()),
    });
  } catch (error) {
    console.error(
      '[DocumentsService] Failed to normalize legacy document processing state:',
      error.message,
    );
  }
}

disableLegacyIngestionState();

function resolveLinkedEntity(document) {
  if (document.client_id !== null && document.client_id !== undefined) {
    return { type: 'client', id: document.client_id };
  }
  if (document.dossier_id !== null && document.dossier_id !== undefined) {
    return { type: 'dossier', id: document.dossier_id };
  }
  if (document.lawsuit_id !== null && document.lawsuit_id !== undefined) {
    return { type: 'lawsuit', id: document.lawsuit_id };
  }
  if (document.mission_id !== null && document.mission_id !== undefined) {
    return { type: 'mission', id: document.mission_id };
  }
  if (document.task_id !== null && document.task_id !== undefined) {
    return { type: 'task', id: document.task_id };
  }
  if (document.session_id !== null && document.session_id !== undefined) {
    return { type: 'session', id: document.session_id };
  }
  if (document.personal_task_id !== null && document.personal_task_id !== undefined) {
    return { type: 'personal_task', id: document.personal_task_id };
  }
  if (document.financial_entry_id !== null && document.financial_entry_id !== undefined) {
    return { type: 'financial_entry', id: document.financial_entry_id };
  }
  if (document.officer_id !== null && document.officer_id !== undefined) {
    return { type: 'officer', id: document.officer_id };
  }

  return { type: null, id: null };
}

function decorateDocument(document) {
  if (!document) return document;
  const linked = resolveLinkedEntity(document);
  const status = resolveTextStatus(document);
  const hasText =
    status === 'readable' &&
    typeof document.document_text === 'string' &&
    document.document_text.length > 0;
  return {
    ...document,
    document_id: document.id,
    linked_entity_type: linked.type,
    linked_entity_id: linked.id,
    has_text: hasText,
    text_status: status,
    text_source: document.text_source || null,
    text_failure_reason: document.text_failure_reason || null,
    analysis_status: document.analysis_status || null,
    analysis_provider: document.analysis_provider || null,
    analysis_confidence:
      Number.isFinite(document.analysis_confidence) ? document.analysis_confidence : null,
    analysis_version: document.analysis_version || null,
    artifact_json: document.artifact_json || null,
    processing_started_at: document.processing_started_at || null,
    processing_finished_at: document.processing_finished_at || null,
    failure_stage: document.failure_stage || null,
    failure_detail: document.failure_detail || null,
    unreadable_text: status === 'unreadable',
    text_length: hasText ? document.text_length || document.document_text.length : null,
    status,
    source: hasText ? document.text_source || null : null,
    failure_reason: status === 'unreadable' ? document.text_failure_reason : null,
  };
}

function listMetadataByEntity(entityType, entityId, options = {}) {
  const column = DOCUMENT_ENTITY_COLUMNS[entityType];
  if (!column || !entityId) return [];

  const previewLength =
    Number.isInteger(options.previewLength) && options.previewLength > 0
      ? options.previewLength
      : 0;
  const previewSelect =
    previewLength > 0
      ? "CASE WHEN text_status = 'readable' THEN substr(document_text, 1, @previewLength) ELSE NULL END as document_preview"
      : "NULL as document_preview";

  const rows = db
    .prepare(
      `
      SELECT
        id,
        title,
        file_path,
        original_filename,
        category,
        mime_type,
        size_bytes,
        notes,
        copy_type,
        uploaded_by,
        uploaded_at,
        updated_at,
        unreadable_text,
        text_status,
        text_source,
        text_failure_reason,
        analysis_status,
        analysis_provider,
        analysis_confidence,
        analysis_version,
        artifact_json,
        processing_started_at,
        processing_finished_at,
        failure_stage,
        failure_detail,
        ${previewSelect},
        CASE WHEN text_status = 'readable' AND COALESCE(text_length, LENGTH(document_text)) > 0 THEN 1 ELSE 0 END as has_text,
        COALESCE(text_length, LENGTH(document_text)) as text_length,
        client_id,
        dossier_id,
        lawsuit_id,
        mission_id,
        task_id,
        session_id,
        personal_task_id,
        financial_entry_id,
        officer_id
      FROM ${table}
      WHERE deleted_at IS NULL AND ${column} = @entityId
    `,
    )
    .all({ entityId, previewLength });

  return rows.map((row) => {
    const linked = resolveLinkedEntity(row);
    const status = resolveTextStatus(row);
    const hasText =
      status === 'readable' &&
      typeof row.text_length === 'number' &&
      row.text_length > 0;
    const unreadable = status === 'unreadable';
    return {
      document_id: row.id,
      title: row.title,
      file_path: row.file_path,
      original_filename: row.original_filename,
      category: row.category,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      notes: row.notes,
      copy_type: row.copy_type,
      uploaded_by: row.uploaded_by,
      uploaded_at: row.uploaded_at,
      updated_at: row.updated_at,
      linked_entity_type: linked.type,
      linked_entity_id: linked.id,
      has_text: hasText,
      unreadable_text: unreadable,
      text_status: status,
      text_source: row.text_source || null,
      text_failure_reason: row.text_failure_reason || null,
      analysis_status: row.analysis_status || null,
      analysis_provider: row.analysis_provider || null,
      analysis_confidence: Number.isFinite(row.analysis_confidence) ? row.analysis_confidence : null,
      analysis_version: row.analysis_version || null,
      artifact_json: row.artifact_json || null,
      processing_started_at: row.processing_started_at || null,
      processing_finished_at: row.processing_finished_at || null,
      failure_stage: row.failure_stage || null,
      failure_detail: row.failure_detail || null,
      status,
      source: hasText ? row.text_source || null : null,
      failure_reason: unreadable ? row.text_failure_reason || null : null,
      text_length: hasText ? row.text_length : null,
      document_preview: hasText && !unreadable ? row.document_preview : null,
    };
  });
}

function listTextsByIds(documentIds = []) {
  const ids = Array.isArray(documentIds)
    ? documentIds.filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (ids.length === 0) return [];

  const params = {};
  const placeholders = ids
    .map((id, index) => {
      const key = `id${index}`;
      params[key] = id;
      return `@${key}`;
    })
    .join(', ');

  const rows = db
    .prepare(
      `
      SELECT
        id,
        title,
        document_text,
        unreadable_text,
        text_status,
        text_source,
        text_failure_reason,
        analysis_status,
        analysis_provider,
        analysis_confidence,
        analysis_version,
        artifact_json,
        processing_started_at,
        processing_finished_at,
        failure_stage,
        failure_detail,
        COALESCE(text_length, LENGTH(document_text)) as text_length,
        client_id,
        dossier_id,
        lawsuit_id,
        mission_id,
        task_id,
        session_id,
        personal_task_id,
        financial_entry_id,
        officer_id
      FROM ${table}
      WHERE deleted_at IS NULL AND id IN (${placeholders})
    `,
    )
    .all(params);

  return rows.map((row) => {
    const linked = resolveLinkedEntity(row);
    const status = resolveTextStatus(row);
    const hasText =
      status === 'readable' &&
      typeof row.document_text === 'string' &&
      row.document_text.length > 0;
    return {
      document_id: row.id,
      name: row.title || null,
      linked_entity_type: linked.type,
      linked_entity_id: linked.id,
      has_text: hasText,
      unreadable_text: status === 'unreadable',
      text_status: status,
      text_source: row.text_source || null,
      text_failure_reason: row.text_failure_reason || null,
      analysis_status: row.analysis_status || null,
      analysis_provider: row.analysis_provider || null,
      analysis_confidence: Number.isFinite(row.analysis_confidence) ? row.analysis_confidence : null,
      analysis_version: row.analysis_version || null,
      artifact_json: row.artifact_json || null,
      processing_started_at: row.processing_started_at || null,
      processing_finished_at: row.processing_finished_at || null,
      failure_stage: row.failure_stage || null,
      failure_detail: row.failure_detail || null,
      status,
      source: hasText ? row.text_source || null : null,
      failure_reason: status === 'unreadable' ? row.text_failure_reason || null : null,
      text_length: hasText ? row.text_length : null,
      document_text: hasText ? row.document_text : null,
      text: hasText ? row.document_text : null,
    };
  });
}

function list(filters = {}) {
  let sql = `SELECT * FROM ${table} WHERE deleted_at IS NULL`;
  const params = {};

  sql = appendEntityFilters(sql, params, filters);

  return db.prepare(sql).all(params).map(decorateDocument);
}

function listFiltered({
  query = null,
  textStatus = null,
  limit = 50,
  ...filters
} = {}) {
  let sql = `SELECT * FROM ${table} WHERE deleted_at IS NULL`;
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  sql = appendEntityFilters(sql, params, filters);

  if (textStatus) {
    sql += ` AND LOWER(COALESCE(text_status, '')) = @textStatus`;
    params.textStatus = String(textStatus).trim().toLowerCase();
  }

  if (query) {
    sql += ` AND (
      LOWER(COALESCE(title, '')) LIKE @query
      OR LOWER(COALESCE(original_filename, '')) LIKE @query
      OR LOWER(COALESCE(notes, '')) LIKE @query
    )`;
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  sql += ` ORDER BY uploaded_at DESC, id DESC LIMIT @limit`;

  return db.prepare(sql).all(params).map(decorateDocument);
}

function count(filters = {}) {
  let sql = `SELECT COUNT(*) as count FROM ${table} WHERE deleted_at IS NULL`;
  const params = {};
  sql = appendEntityFilters(sql, params, filters);
  const row = db.prepare(sql).get(params);
  return row?.count || 0;
}

function listByClient(clientId) {
  return listByScope("client_id", clientId);
}

function listByDossier(dossierId) {
  return listByScope("dossier_id", dossierId);
}

function listByLawsuit(lawsuitId) {
  return listByScope("lawsuit_id", lawsuitId);
}

function listByTask(taskId) {
  return listByScope("task_id", taskId);
}

function listByMission(missionId) {
  return listByScope("mission_id", missionId);
}

function listBySession(sessionId) {
  return listByScope("session_id", sessionId);
}

function listByScope(column, id) {
  if (!Number.isInteger(Number(id))) {
    return [];
  }
  return list({ [column]: Number(id) });
}

function appendEntityFilters(sql, params, filters = {}) {
  // Entity filtering for scoped queries
  if (filters.client_id !== undefined) {
    sql += ` AND client_id = @client_id`;
    params.client_id = filters.client_id;
  }
  if (filters.dossier_id !== undefined) {
    sql += ` AND dossier_id = @dossier_id`;
    params.dossier_id = filters.dossier_id;
  }
  if (filters.lawsuit_id !== undefined) {
    sql += ` AND lawsuit_id = @lawsuit_id`;
    params.lawsuit_id = filters.lawsuit_id;
  }
  if (filters.mission_id !== undefined) {
    sql += ` AND mission_id = @mission_id`;
    params.mission_id = filters.mission_id;
  }
  if (filters.task_id !== undefined) {
    sql += ` AND task_id = @task_id`;
    params.task_id = filters.task_id;
  }
  if (filters.session_id !== undefined) {
    sql += ` AND session_id = @session_id`;
    params.session_id = filters.session_id;
  }
  if (filters.personal_task_id !== undefined) {
    sql += ` AND personal_task_id = @personal_task_id`;
    params.personal_task_id = filters.personal_task_id;
  }
  if (filters.financial_entry_id !== undefined) {
    sql += ` AND financial_entry_id = @financial_entry_id`;
    params.financial_entry_id = filters.financial_entry_id;
  }
  if (filters.officer_id !== undefined) {
    sql += ` AND officer_id = @officer_id`;
    params.officer_id = filters.officer_id;
  }
  return sql;
}

function get(id) {
  return decorateDocument(
    db.prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`).get({ id })
  );
}

function create(payload) {
  const data = filterPayload(payload, allowedFields);
  const insertData = {
    mime_type: null,
    size_bytes: null,
    notes: null,
    original_filename: null,
    copy_type: null,
    client_id: null,
    dossier_id: null,
    lawsuit_id: null,
    mission_id: null,
    task_id: null,
    session_id: null,
    personal_task_id: null,
    financial_entry_id: null,
    officer_id: null,
    ...buildPendingIngestionState(),
    ...data,
  };
  assert(insertData.title, 'title is required');
  assert(insertData.file_path, 'file_path is required');
  insertData.file_path = normalizeManagedFilePath(insertData.file_path);
  validateTarget(insertData);

  const stmt = db.prepare(
    `INSERT INTO ${table} (title, file_path, original_filename, mime_type, size_bytes, notes, document_text, unreadable_text, text_length, text_status, text_source, text_failure_reason, analysis_status, analysis_provider, analysis_confidence, analysis_version, artifact_json, processing_started_at, processing_finished_at, failure_stage, failure_detail, copy_type, client_id, dossier_id, lawsuit_id, mission_id, task_id, session_id, personal_task_id, financial_entry_id, officer_id)
     VALUES (@title, @file_path, @original_filename, @mime_type, @size_bytes, @notes, @document_text, @unreadable_text, @text_length, @text_status, @text_source, @text_failure_reason, @analysis_status, @analysis_provider, @analysis_confidence, @analysis_version, @artifact_json, @processing_started_at, @processing_finished_at, @failure_stage, @failure_detail, @copy_type, @client_id, @dossier_id, @lawsuit_id, @mission_id, @task_id, @session_id, @personal_task_id, @financial_entry_id, @officer_id)`
  );
  const result = stmt.run(insertData);
  return get(result.lastInsertRowid);
}

function update(id, payload) {
  const data = filterPayload(payload, allowedFields);
  const updatable = {
    mime_type: null,
    size_bytes: null,
    notes: null,
    original_filename: null,
    client_id: null,
    dossier_id: null,
    lawsuit_id: null,
    mission_id: null,
    task_id: null,
    session_id: null,
    personal_task_id: null,
    financial_entry_id: null,
    officer_id: null,
    ...data,
  };
  if (
    data.client_id !== undefined ||
    data.dossier_id !== undefined ||
    data.lawsuit_id !== undefined ||
    data.mission_id !== undefined ||
    data.task_id !== undefined ||
    data.session_id !== undefined ||
    data.personal_task_id !== undefined ||
    data.financial_entry_id !== undefined ||
    data.officer_id !== undefined
  ) {
    validateTarget(updatable);
  }
  assert(Object.keys(data).length > 0, 'No fields provided for update');

  if (data.file_path !== undefined) {
    data.file_path = normalizeManagedFilePath(data.file_path);
  }

  let ingestionState = null;
  if (data.file_path !== undefined || data.mime_type !== undefined) {
    ingestionState = buildPendingIngestionState();
  }

  const setClause = buildUpdateClause({
    ...data,
    ...(ingestionState ? ingestionState : {}),
  });
  const stmt = db.prepare(
    `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({
    ...data,
    ...(ingestionState ? ingestionState : {}),
    id,
  });
  if (result.changes === 0) return null;
  return get(id);
}

function remove(id) {
  const stmt = db.prepare(
    `UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ id });
  return result.changes > 0;
}

module.exports = {
  scheduleIngestion,
  listMetadataByEntity,
  listTextsByIds,
  list,
  listFiltered,
  count,
  listByClient,
  listByDossier,
  listByLawsuit,
  listByTask,
  listByMission,
  listBySession,
  get,
  create,
  update,
  remove,
};

