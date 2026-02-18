"use strict";

const path = require("path");
const crypto = require("crypto");
const db = require("../../db/connection");
const documentsService = require("../documents.service");
const documentStorage = require("../documentStorage");
const plannerService = require("./planner.service");
const { renderDocument } = require("./renderer.service");
const { ENTITY_COLUMN_MAP } = require("./constants");
const {
  emitGenerationEvent,
  getLatestGenerationEvent,
  subscribeGenerationEvents,
} = require("./progressEvents");

function ensureGenerationsTable() {
  db.exec(`
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
  `);
}

ensureGenerationsTable();

function makeGenerationUid() {
  return `gen_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function generationExtension(format) {
  if (format === "pdf") return "pdf";
  if (format === "docx") return "docx";
  return "html";
}

function createGenerationRecord(input) {
  const uid = makeGenerationUid();
  db.prepare(
    `INSERT INTO document_generations
      (generation_uid, target_type, target_id, document_type, schema_version, template_key, language, format, content_json, status, created_by)
     VALUES (@generation_uid, @target_type, @target_id, @document_type, @schema_version, @template_key, @language, @format, @content_json, @status, @created_by)`
  ).run({
    generation_uid: uid,
    target_type: input.target.type,
    target_id: input.target.id,
    document_type: input.documentType,
    schema_version: input.schemaVersion,
    template_key: input.templateKey,
    language: input.language,
    format: input.format,
    content_json: JSON.stringify(input.contentJson),
    status: input.status || "planned",
    created_by: input.createdBy || null,
  });
  return getGenerationByUid(uid);
}

function updateGeneration(generationUid, patch = {}) {
  const allowed = [
    "document_id",
    "status",
    "error_code",
    "error_message",
  ];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (keys.length === 0) return getGenerationByUid(generationUid);

  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(
    `UPDATE document_generations SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE generation_uid = @generation_uid`
  ).run({ generation_uid: generationUid, ...patch });

  return getGenerationByUid(generationUid);
}

function getGenerationByUid(generationUid) {
  const row = db
    .prepare(`SELECT * FROM document_generations WHERE generation_uid = @generation_uid`)
    .get({ generation_uid: generationUid });
  if (!row) return null;
  return {
    ...row,
    content_json: safeJsonParse(row.content_json),
  };
}

function getGeneration(id) {
  const row = db
    .prepare(`SELECT * FROM document_generations WHERE id = @id`)
    .get({ id: Number(id) });
  if (!row) return null;
  return {
    ...row,
    content_json: safeJsonParse(row.content_json),
  };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function generateFromReadyPlan(plan, { createdBy } = {}) {
  const record = createGenerationRecord({ ...plan, createdBy, status: "planned" });
  emitGenerationEvent(record.id, "planning", { status: "planned" });

  const extension = generationExtension(plan.format);
  const fileNameBase = `${record.generation_uid}.${extension}`;
  const outputDir = path.join(documentStorage.ensureDocumentsRoot(), "generated", new Date().toISOString().slice(0, 10));
  const outputPath = path.join(outputDir, fileNameBase);

  try {
    emitGenerationEvent(record.id, "rendering", { status: "rendering" });
    updateGeneration(record.generation_uid, { status: "rendering" });

    const rendered = await renderDocument({
      documentType: plan.documentType,
      language: plan.language,
      schemaVersion: plan.schemaVersion,
      contentJson: plan.contentJson,
      format: plan.format,
      outputPath,
    });

    emitGenerationEvent(record.id, "persisting", { status: "persisting" });

    const entityColumn = ENTITY_COLUMN_MAP[plan.target.type];
    const title =
      plan.contentJson?.content?.title ||
      `${plan.documentType} ${plan.target.type}#${plan.target.id}`;

    const artifactJson = JSON.stringify({
      generation_uid: record.generation_uid,
      templateKey: plan.templateKey,
      schemaVersion: plan.schemaVersion,
      documentType: plan.documentType,
      language: plan.language,
      format: plan.format,
      contentHash: crypto
        .createHash("sha256")
        .update(JSON.stringify(plan.contentJson))
        .digest("hex"),
    });

    const document = documentsService.create({
      title,
      file_path: rendered.file_path,
      original_filename: `${title}.${extension}`,
      mime_type: rendered.mime_type,
      size_bytes: rendered.size_bytes,
      notes: `Generated ${plan.documentType}`,
      copy_type: "generated",
      [entityColumn]: plan.target.id,
    });

    db.prepare("UPDATE documents SET artifact_json = @artifact_json, updated_at = CURRENT_TIMESTAMP WHERE id = @id")
      .run({ id: document.id, artifact_json: artifactJson });

    updateGeneration(record.generation_uid, {
      status: "completed",
      document_id: document.id,
      error_code: null,
      error_message: null,
    });

    emitGenerationEvent(record.id, "completed", {
      status: "completed",
      documentId: document.id,
    });

    return {
      generationId: record.id,
      generationUid: record.generation_uid,
      documentId: document.id,
      downloadUrl: `/documents/${document.id}/download`,
      metadata: {
        templateKey: plan.templateKey,
        schemaVersion: plan.schemaVersion,
        documentType: plan.documentType,
        language: plan.language,
        format: plan.format,
      },
    };
  } catch (error) {
    updateGeneration(record.generation_uid, {
      status: "failed",
      error_code: error.code || "GENERATION_FAILED",
      error_message: error.message || "Generation failed",
    });
    emitGenerationEvent(record.id, "failed", {
      status: "failed",
      error: error.message || "Generation failed",
      code: error.code || "GENERATION_FAILED",
    });
    throw error;
  }
}

function planDocument(input) {
  return plannerService.planDocument(input);
}

async function generateDocument(input, options = {}) {
  const plan = plannerService.planDocument(input);
  if (plan.status !== "ready") {
    const err = new Error("Cannot generate document while required fields are missing");
    err.status = 400;
    err.code = "MISSING_REQUIRED_FIELDS";
    err.details = plan.missingFields;
    throw err;
  }
  return generateFromReadyPlan(plan, options);
}

async function generateFromAttachmentPayload({ target, payload, createdBy }) {
  const plan = {
    status: "ready",
    target,
    documentType: payload.documentType,
    language: payload.language,
    format: payload.format,
    schemaVersion: payload.schemaVersion,
    templateKey: payload.templateKey,
    contentJson: payload.contentJson,
  };
  return generateFromReadyPlan(plan, { createdBy });
}

module.exports = {
  planDocument,
  generateDocument,
  generateFromAttachmentPayload,
  getGeneration,
  subscribeGenerationEvents,
  getLatestGenerationEvent,
};
