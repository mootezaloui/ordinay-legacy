"use strict";

/**
 * Agent Session Documents Routes
 *
 * Endpoints for managing documents attached to agent conversation sessions.
 * Mounted under /agent/sessions/:sessionId/documents
 */

const express = require("express");
const controller = require("../controllers/agentDocuments.controller");

const router = express.Router({ mergeParams: true });

// Upload a new file and bind to session
router.post("/upload", controller.upload);

// Bind an existing system document to session
router.post("/bind", controller.bind);

// List all documents in session
router.get("/", controller.list);

// Get agent-formatted document context
router.get("/context", controller.getContext);

// Remove a specific document from session
router.delete("/:documentId", controller.unbind);

// Get multimodal artifacts for one session document
router.get("/:documentId/artifacts", controller.getArtifacts);

// Retry ingestion/understanding for one session document
router.post("/:documentId/retry", controller.retryAnalysis);
router.post("/:documentId/continue", controller.continueAnalysis);
router.post("/:documentId/cancel", controller.cancelAnalysis);
router.get("/:documentId/progress", controller.progress);

// Clear all documents from session
router.delete("/", controller.clear);

module.exports = router;
