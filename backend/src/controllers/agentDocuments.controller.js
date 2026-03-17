"use strict";

/**
 * Agent Session Documents Controller
 *
 * Handles HTTP endpoints for managing documents attached to agent sessions.
 * These documents are user-uploaded files bound to a conversation, not to
 * domain entities (clients, dossiers, etc.).
 */

const agentDocumentsService = require("../services/agentDocuments.service");
const extractionService = require("../services/documentExtraction.service");

/**
 * POST /agent/sessions/:sessionId/documents/upload
 * Upload a new file and bind it to the agent session.
 */
async function upload(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { filename, mime_type, data_base64, message_id } = req.body || {};

    if (!filename) {
      return res.status(400).json({ error: "filename is required" });
    }
    if (!data_base64) {
      return res.status(400).json({ error: "data_base64 is required" });
    }

    const document = agentDocumentsService.uploadAndBind({
      sessionId,
      messageId: message_id || null,
      filename,
      mimeType: mime_type,
      dataBase64: data_base64,
    });

    // Blocking: wait for extraction (+ OCR if needed) before responding,
    // so the document text is ready by the time the user sends a message.
    try {
      const ingested = await extractionService.ingestDocument(document.id);
      if (ingested && ingested.text_status === 'needs_ocr') {
        await extractionService.runOcr(document.id);
      }
    } catch (err) {
      console.error(`[extraction] failed for agent document ${document.id}:`, err.message);
    }

    // Return the latest state (with extraction results)
    const updated = agentDocumentsService.listBySession(sessionId, { includeText: false })
      .find(d => d.document_id === document.id) || document;
    res.status(201).json(updated);
  } catch (error) {
    if (error.code === "file_too_large") {
      return res.status(413).json({ error: "File too large" });
    }
    if (error.code === "missing_file_data") {
      return res.status(400).json({ error: "Missing file data" });
    }
    if (error.code === "missing_session_id") {
      return res.status(400).json({ error: "Session ID is required" });
    }
    next(error);
  }
}

/**
 * POST /agent/sessions/:sessionId/documents/bind
 * Bind an existing system document to the agent session.
 */
async function bind(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { document_id, message_id } = req.body || {};

    if (!document_id) {
      return res.status(400).json({ error: "document_id is required" });
    }

    const document = agentDocumentsService.bindExisting({
      sessionId,
      messageId: message_id || null,
      documentId: Number(document_id),
    });

    res.status(200).json(document);
  } catch (error) {
    if (error.code === "document_not_found") {
      return res.status(404).json({ error: "Document not found" });
    }
    next(error);
  }
}

/**
 * GET /agent/sessions/:sessionId/documents
 * List all documents attached to the session.
 */
async function list(req, res, next) {
  try {
    const { sessionId } = req.params;
    const includeText = req.query.include_text === "true";
    const documents = agentDocumentsService.listBySession(sessionId, {
      includeText,
    });
    res.json(documents);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agent/sessions/:sessionId/documents/context
 * Get the agent-formatted document context for this session.
 * This is what the agent engine receives.
 */
async function getContext(req, res, next) {
  try {
    const { sessionId } = req.params;
    const context = agentDocumentsService.buildAgentDocumentContext(sessionId);
    res.json(context || { sessionId, totalDocuments: 0, documents: [] });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agent/sessions/:sessionId/documents/:documentId
 * Remove a document binding from the session.
 */
async function unbind(req, res, next) {
  try {
    const { sessionId, documentId } = req.params;
    const removed = agentDocumentsService.unbind(sessionId, Number(documentId));
    if (!removed) {
      return res.status(404).json({ error: "Document binding not found" });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agent/sessions/:sessionId/documents
 * Clear all documents from the session.
 */
async function clear(req, res, next) {
  try {
    const { sessionId } = req.params;
    const count = agentDocumentsService.clearSession(sessionId);
    res.json({ cleared: count });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agent/sessions/:sessionId/documents/:documentId/artifacts
 * Get multimodal analysis artifacts for one document in session.
 */
async function getArtifacts(req, res, next) {
  try {
    const { sessionId, documentId } = req.params;
    const result = agentDocumentsService.getDocumentArtifacts(
      sessionId,
      Number(documentId),
    );
    if (!result) {
      return res.status(404).json({ error: "Document artifacts not found" });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /agent/sessions/:sessionId/documents/:documentId/retry
 * Keep API compatibility: mark analysis as disabled and return current artifacts.
 */
async function retryAnalysis(req, res, next) {
  try {
    const { sessionId, documentId } = req.params;
    const result = agentDocumentsService.retryDocumentAnalysis(
      sessionId,
      Number(documentId),
    );
    if (!result) {
      return res.status(404).json({ error: "Document not found in session" });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function continueAnalysis(req, res, next) {
  try {
    const { sessionId, documentId } = req.params;
    const result = agentDocumentsService.continueDocumentAnalysis(
      sessionId,
      Number(documentId),
    );
    if (!result) {
      return res.status(404).json({ error: "Document not found in session" });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function cancelAnalysis(req, res, next) {
  try {
    const { sessionId, documentId } = req.params;
    const cancelled = agentDocumentsService.cancelDocumentAnalysis(
      sessionId,
      Number(documentId),
    );
    if (!cancelled) {
      return res.status(404).json({ error: "Document not found in session" });
    }
    res.json({ cancelled: true });
  } catch (error) {
    next(error);
  }
}

async function progress(req, res, next) {
  try {
    const { sessionId, documentId } = req.params;
    const id = Number(documentId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid document id" });
    }
    const detail = agentDocumentsService.getDocumentArtifacts(sessionId, id);
    if (!detail) {
      return res.status(404).json({ error: "Document not found in session" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (typeof res.flush === "function") res.flush();
    };
    send({
      type: "stage_end",
      docId: id,
      stage: "analysis_disabled",
      elapsedMs: 0,
      timestamp: new Date().toISOString(),
    });
    send({
      type: "result",
      docId: id,
      summary: {
        status: detail.text_status || "unreadable",
        analysisDisabled: true,
        pagesProcessed: 0,
        totalPages: 0,
      },
      timestamp: new Date().toISOString(),
    });
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
      if (typeof res.flush === "function") res.flush();
    }, 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      res.end();
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  upload,
  bind,
  list,
  getContext,
  unbind,
  clear,
  getArtifacts,
  retryAnalysis,
  continueAnalysis,
  cancelAnalysis,
  progress,
};
