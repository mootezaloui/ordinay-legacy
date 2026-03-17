"use strict";

/**
 * Agent Session Documents Service
 *
 * Manages documents attached to agent conversation sessions.
 * Unlike entity-linked documents (client_id, dossier_id, etc.),
 * session documents are transient — bound to a conversation session
 * and used for agent reasoning about user-uploaded files.
 *
 * Architecture choices:
 * - Documents are stored in the main `documents` table via a virtual
 *   "agent_session" parent type using dedicated columns.
 * - An `agent_session_documents` junction table maps session IDs (strings)
 *   to document IDs and message IDs, preserving the conversation timeline.
 * - Document understanding is intentionally disabled in this backend revision.
 * - This service provides the agent engine with a unified view of session documents.
 */

const db = require("../db/connection");
const documentsService = require("./documents.service");
const documentStorage = require("./documentStorage");
const DOCUMENT_UNDERSTANDING_DISABLED_REASON = "document_understanding_disabled";
const DOCUMENT_UNDERSTANDING_DISABLED_ARTIFACT = JSON.stringify({
  extracted_text: "",
  visual_summary:
    "Document understanding is disabled. File storage remains available.",
  key_entities: [],
  risk_flags: [DOCUMENT_UNDERSTANDING_DISABLED_REASON],
  provenance: {
    stage: "disabled",
    mode: "disabled",
  },
  processingStats: {
    elapsedMs: 0,
    pagesProcessed: 0,
    totalPages: 0,
    cacheHit: false,
  },
  needsUserContinue: false,
  remainingPages: [],
});

// ============================================================================
// Schema Bootstrap — creates the junction table if not present
// ============================================================================

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_session_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      message_id TEXT,
      document_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'attachment',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_asd_session_id ON agent_session_documents(session_id);
    CREATE INDEX IF NOT EXISTS idx_asd_document_id ON agent_session_documents(document_id);
    CREATE INDEX IF NOT EXISTS idx_asd_message_id ON agent_session_documents(message_id);
  `);
}

// Run on module load — safe for SQLite (IF NOT EXISTS)
try {
  ensureSchema();
} catch (err) {
  console.error("[AgentDocuments] Schema bootstrap failed:", err.message);
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Upload a file and bind it to an agent session.
 *
 * Flow:
 *  1. Save raw file to disk via documentStorage
 *  2. Create a document record (using officer_id=1 as the "system" parent
 *     to satisfy the DB constraint, or any valid FK)
 *  3. Link it in the junction table
 *  4. Document understanding remains disabled; record is stored as unreadable
 *  5. Return full document metadata
 *
 * @param {Object} params
 * @param {string} params.sessionId - Agent conversation session ID
 * @param {string} [params.messageId] - The user message that carried this file
 * @param {string} params.filename - Original file name
 * @param {string} params.mimeType - MIME type
 * @param {string} params.dataBase64 - Base64-encoded file content
 * @returns {Object} Created document with session binding
 */
function uploadAndBind({
  sessionId,
  messageId,
  filename,
  mimeType,
  dataBase64,
}) {
  if (!sessionId)
    throw Object.assign(new Error("sessionId is required"), {
      code: "missing_session_id",
    });
  if (!filename)
    throw Object.assign(new Error("filename is required"), {
      code: "missing_filename",
    });
  if (!dataBase64)
    throw Object.assign(new Error("file data is required"), {
      code: "missing_file_data",
    });

  // 1. Save to disk
  const stored = documentStorage.saveUploadedDocument({
    originalName: filename,
    mimeType,
    dataBase64,
  });

  // 2. Create document record
  //    We need a valid FK parent. We'll check if officer_id=1 exists,
  //    otherwise we fall back to using a dedicated approach.
  //    For agent session docs, we store them with a special "agent_session" category.
  let document;
  try {
    // Try to find any existing officer to use as parent anchor
    const officer = db
      .prepare("SELECT id FROM officers WHERE deleted_at IS NULL LIMIT 1")
      .get();
    const parentKey = officer
      ? { officer_id: officer.id }
      : findAnyValidParent();

    document = documentsService.create({
      title: filename,
      file_path: stored.file_path,
      original_filename: stored.original_filename,
      mime_type: stored.mime_type || mimeType,
      size_bytes: stored.size_bytes,
      notes: `Agent session attachment [${sessionId}]`,
      ...parentKey,
    });
  } catch (createErr) {
    // If creation fails due to FK constraint, try a more lenient approach
    console.error(
      "[AgentDocuments] Document creation failed:",
      createErr.message,
    );
    throw Object.assign(new Error("Failed to store document"), {
      code: "document_creation_failed",
      cause: createErr,
    });
  }

  // 3. Bind to session
  const bindStmt = db.prepare(`
    INSERT INTO agent_session_documents (session_id, message_id, document_id, role)
    VALUES (@sessionId, @messageId, @documentId, @role)
  `);
  bindStmt.run({
    sessionId,
    messageId: messageId || null,
    documentId: document.id,
    role: "attachment",
  });

  // 4. Return enriched result
  return {
    ...document,
    session_id: sessionId,
    message_id: messageId || null,
    role: "attachment",
    bound: true,
  };
}

/**
 * Bind an existing system document to an agent session.
 * Used when user selects a document from their library.
 */
function bindExisting({ sessionId, messageId, documentId }) {
  if (!sessionId)
    throw Object.assign(new Error("sessionId is required"), {
      code: "missing_session_id",
    });
  if (!documentId)
    throw Object.assign(new Error("documentId is required"), {
      code: "missing_document_id",
    });

  // Verify document exists
  const document = documentsService.get(documentId);
  if (!document)
    throw Object.assign(new Error("Document not found"), {
      code: "document_not_found",
    });

  // Check if already bound
  const existing = db
    .prepare(
      "SELECT id FROM agent_session_documents WHERE session_id = @sessionId AND document_id = @documentId",
    )
    .get({ sessionId, documentId });

  if (!existing) {
    db.prepare(
      `
      INSERT INTO agent_session_documents (session_id, message_id, document_id, role)
      VALUES (@sessionId, @messageId, @documentId, @role)
    `,
    ).run({
      sessionId,
      messageId: messageId || null,
      documentId,
      role: "reference",
    });
  }

  return {
    ...document,
    session_id: sessionId,
    message_id: messageId || null,
    role: existing ? "reference" : "reference",
    bound: true,
  };
}

/**
 * Get all documents attached to an agent session.
 * Returns metadata + text status (not full text by default).
 */
function listBySession(sessionId, { includeText = false } = {}) {
  if (!sessionId) return [];

  const textColumn = includeText ? "d.document_text" : "NULL as document_text";

  const rows = db
    .prepare(
      `
    SELECT
      d.id,
      d.title,
      d.file_path,
      d.original_filename,
      d.category,
      d.mime_type,
      d.size_bytes,
      d.notes,
      d.text_status,
      d.text_source,
      d.text_failure_reason,
      d.analysis_status,
      d.analysis_provider,
      d.analysis_confidence,
      d.analysis_version,
      d.artifact_json,
      d.failure_stage,
      d.failure_detail,
      d.unreadable_text,
      COALESCE(d.text_length, LENGTH(d.document_text)) as text_length,
      ${textColumn},
      asd.session_id,
      asd.message_id,
      asd.role,
      asd.created_at as bound_at
    FROM agent_session_documents asd
    JOIN documents d ON d.id = asd.document_id AND d.deleted_at IS NULL
    WHERE asd.session_id = @sessionId
    ORDER BY asd.created_at ASC
  `,
    )
    .all({ sessionId });

  return rows.map((row) => ({
    document_id: row.id,
    title: row.title,
    file_path: row.file_path,
    original_filename: row.original_filename,
    category: row.category,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    notes: row.notes,
    text_status: row.text_status || "unreadable",
    text_source: row.text_source,
    text_failure_reason: row.text_failure_reason,
    analysis_status: row.analysis_status || null,
    analysis_provider: row.analysis_provider || null,
    understanding_confidence: Number.isFinite(row.analysis_confidence)
      ? row.analysis_confidence
      : null,
    analysis_version: row.analysis_version || null,
    artifacts: row.artifact_json ? safeJsonParse(row.artifact_json) : null,
    failure_stage: row.failure_stage || null,
    failure_detail: row.failure_detail || null,
    has_text: row.text_status === "readable" && (row.text_length || 0) > 0,
    unreadable_text: row.text_status === "unreadable",
    text_length: row.text_status === "readable" ? row.text_length : null,
    document_text:
      includeText && row.text_status === "readable" ? row.document_text : null,
    session_id: row.session_id,
    message_id: row.message_id,
    role: row.role,
    bound_at: row.bound_at,
  }));
}

/**
 * Get readable text for session documents.
 * This is what gets injected into agent context.
 */
function getSessionDocumentTexts(sessionId) {
  if (!sessionId) return [];

  const rows = db
    .prepare(
      `
    SELECT
      d.id,
      d.title,
      d.original_filename,
      d.mime_type,
      d.text_status,
      d.text_source,
      d.analysis_status,
      d.analysis_provider,
      d.analysis_confidence,
      d.analysis_version,
      d.artifact_json,
      d.document_text,
      COALESCE(d.text_length, LENGTH(d.document_text)) as text_length,
      asd.role,
      asd.message_id
    FROM agent_session_documents asd
    JOIN documents d ON d.id = asd.document_id AND d.deleted_at IS NULL
    WHERE asd.session_id = @sessionId
    ORDER BY asd.created_at ASC
  `,
    )
    .all({ sessionId });

  return rows.map((row) => ({
    document_id: row.id,
    title: row.title,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    text_status: row.text_status || "unreadable",
    text_source: row.text_source,
    analysis_status: row.analysis_status || null,
    analysis_provider: row.analysis_provider || null,
    understanding_confidence: Number.isFinite(row.analysis_confidence)
      ? row.analysis_confidence
      : null,
    analysis_version: row.analysis_version || null,
    artifacts: row.artifact_json ? safeJsonParse(row.artifact_json) : null,
    has_text:
      row.text_status === "readable" &&
      row.document_text &&
      row.document_text.length > 0,
    text_length: row.text_status === "readable" ? row.text_length : null,
    text: row.text_status === "readable" ? row.document_text : null,
    role: row.role,
    message_id: row.message_id,
  }));
}

/**
 * Build a document context descriptor for the agent engine.
 * This is the structured representation the agent sees.
 */
function buildAgentDocumentContext(sessionId) {
  if (!sessionId) return null;

  const docs = getSessionDocumentTexts(sessionId);
  if (docs.length === 0) return null;

  const readable = docs.filter((d) => d.has_text);
  const processing = docs.filter((d) => d.text_status === "processing");
  const unreadable = docs.filter((d) => d.text_status === "unreadable");

  return {
    sessionId,
    totalDocuments: docs.length,
    readableCount: readable.length,
    processingCount: processing.length,
    unreadableCount: unreadable.length,
    documents: docs.map((d) => {
      const artifact = d.artifacts && typeof d.artifacts === "object" ? d.artifacts : null;
      return {
        document_id: d.document_id,
        title: d.title,
        original_filename: d.original_filename,
        mime_type: d.mime_type,
        text_status: d.text_status,
        text_source: d.text_source,
        understanding_status: d.analysis_status || d.text_status,
        understanding_confidence: d.understanding_confidence,
        analysis_provider: d.analysis_provider,
        has_text: d.has_text,
        text_length: d.text_length,
        text: d.text,
        artifacts: d.artifacts,
        needs_user_continue: Boolean(artifact?.needsUserContinue),
        pages_processed: Array.isArray(artifact?.pages) ? artifact.pages.length : null,
        pages_total:
          artifact && artifact.processingStats && Number.isFinite(artifact.processingStats.totalPages)
            ? artifact.processingStats.totalPages
            : null,
        progress_stage: "disabled",
        role: d.role,
        supportedOperations: buildSupportedOperations(d),
      };
    }),
  };
}

/**
 * Determine what operations the agent can perform on a document.
 */
function buildSupportedOperations(doc) {
  const ops = ["reference_in_chat"];
  if (doc.text_status === "unreadable") {
    ops.push("analysis_disabled");
  }
  return ops;
}

/**
 * Remove a document binding from a session.
 */
function unbind(sessionId, documentId) {
  if (!sessionId || !documentId) return false;
  const result = db
    .prepare(
      "DELETE FROM agent_session_documents WHERE session_id = @sessionId AND document_id = @documentId",
    )
    .run({ sessionId, documentId: Number(documentId) });
  return result.changes > 0;
}

/**
 * Clean up all documents bound to a session.
 */
function clearSession(sessionId) {
  if (!sessionId) return 0;
  const result = db
    .prepare(
      "DELETE FROM agent_session_documents WHERE session_id = @sessionId",
    )
    .run({ sessionId });
  return result.changes;
}

function getDocumentArtifacts(sessionId, documentId) {
  if (!sessionId || !documentId) return null;
  const row = db
    .prepare(
      `SELECT d.id, d.title, d.original_filename, d.mime_type, d.text_status, d.text_source,
              d.analysis_status, d.analysis_provider, d.analysis_confidence, d.analysis_version,
              d.artifact_json, d.failure_stage, d.failure_detail
       FROM agent_session_documents asd
       JOIN documents d ON d.id = asd.document_id AND d.deleted_at IS NULL
       WHERE asd.session_id = @sessionId AND d.id = @documentId
       LIMIT 1`
    )
    .get({ sessionId, documentId: Number(documentId) });
  if (!row) return null;
  const artifacts = row.artifact_json ? safeJsonParse(row.artifact_json) : null;
  return {
    document_id: row.id,
    title: row.title,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    text_status: row.text_status || "unreadable",
    text_source: row.text_source || null,
    understanding_status: row.analysis_status || row.text_status || "disabled",
    understanding_confidence: Number.isFinite(row.analysis_confidence)
      ? row.analysis_confidence
      : null,
    analysis_provider: row.analysis_provider || null,
    analysis_version: row.analysis_version || null,
    failure_stage: row.failure_stage || null,
    failure_detail: row.failure_detail || null,
    artifacts,
    needs_user_continue: Boolean(artifacts?.needsUserContinue),
    pages_processed: Array.isArray(artifacts?.pages) ? artifacts.pages.length : null,
    pages_total:
      artifacts && artifacts.processingStats && Number.isFinite(artifacts.processingStats.totalPages)
        ? artifacts.processingStats.totalPages
        : null,
  };
}

function markDocumentAnalysisDisabled(documentId) {
  db.prepare(
    `UPDATE documents
     SET
       document_text = NULL,
       unreadable_text = 1,
       text_length = NULL,
       text_status = 'unreadable',
       text_source = NULL,
       text_failure_reason = @reason,
       analysis_status = 'disabled',
       analysis_provider = NULL,
       analysis_confidence = NULL,
       analysis_version = NULL,
       artifact_json = COALESCE(NULLIF(artifact_json, ''), @artifact),
       processing_finished_at = COALESCE(processing_finished_at, CURRENT_TIMESTAMP),
       failure_stage = 'disabled',
       failure_detail = @reason,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = @id AND deleted_at IS NULL`,
  ).run({
    id: Number(documentId),
    reason: DOCUMENT_UNDERSTANDING_DISABLED_REASON,
    artifact: DOCUMENT_UNDERSTANDING_DISABLED_ARTIFACT,
  });
}

function retryDocumentAnalysis(sessionId, documentId) {
  if (!sessionId || !documentId) return null;
  const row = db
    .prepare(
      `SELECT d.id, d.file_path, d.mime_type
       FROM agent_session_documents asd
       JOIN documents d ON d.id = asd.document_id AND d.deleted_at IS NULL
       WHERE asd.session_id = @sessionId AND d.id = @documentId
       LIMIT 1`
    )
    .get({ sessionId, documentId: Number(documentId) });
  if (!row) return null;
  markDocumentAnalysisDisabled(row.id);
  return getDocumentArtifacts(sessionId, row.id);
}

function continueDocumentAnalysis(sessionId, documentId) {
  if (!sessionId || !documentId) return null;
  const row = db
    .prepare(
      `SELECT d.id, d.file_path, d.mime_type
       FROM agent_session_documents asd
       JOIN documents d ON d.id = asd.document_id AND d.deleted_at IS NULL
       WHERE asd.session_id = @sessionId AND d.id = @documentId
       LIMIT 1`
    )
    .get({ sessionId, documentId: Number(documentId) });
  if (!row) return null;
  markDocumentAnalysisDisabled(row.id);
  return getDocumentArtifacts(sessionId, row.id);
}

function cancelDocumentAnalysis(sessionId, documentId) {
  if (!sessionId || !documentId) return false;
  const row = db
    .prepare(
      `SELECT d.id
       FROM agent_session_documents asd
       JOIN documents d ON d.id = asd.document_id AND d.deleted_at IS NULL
       WHERE asd.session_id = @sessionId AND d.id = @documentId
       LIMIT 1`
    )
    .get({ sessionId, documentId: Number(documentId) });
  if (!row) return false;
  markDocumentAnalysisDisabled(row.id);
  return true;
}

// ============================================================================
// Helpers
// ============================================================================

function findAnyValidParent() {
  // Try to find any valid FK target to satisfy the CHECK constraint
  const tables = [
    { table: "officers", key: "officer_id" },
    { table: "clients", key: "client_id" },
    { table: "dossiers", key: "dossier_id" },
  ];
  for (const { table, key } of tables) {
    try {
      const row = db
        .prepare(`SELECT id FROM ${table} WHERE deleted_at IS NULL LIMIT 1`)
        .get();
      if (row) return { [key]: row.id };
    } catch {
      continue;
    }
  }
  // Last resort: The DB constraint requires exactly one FK. This is a design issue.
  // For now, throw an explicit error.
  throw new Error(
    "No valid parent entity found for agent session document. At least one officer, client, or dossier must exist.",
  );
}

module.exports = {
  uploadAndBind,
  bindExisting,
  listBySession,
  getSessionDocumentTexts,
  buildAgentDocumentContext,
  unbind,
  clearSession,
  getDocumentArtifacts,
  retryDocumentAnalysis,
  continueDocumentAnalysis,
  cancelDocumentAnalysis,
  ensureSchema,
};

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
