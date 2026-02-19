"use strict";

const crypto = require("crypto");
const db = require("../../db/connection");

const PREVIEW_TTL_MS = Math.max(
  60 * 1000,
  parseInt(process.env.DOCUMENT_GENERATION_PREVIEW_TTL_MS || "300000", 10),
);

function nowIso() {
  return new Date().toISOString();
}

function makePreviewUid() {
  return `dgp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toPreviewArtifact(row) {
  const contentJson = parseJson(row.content_json) || {};
  return {
    type: "document_generation_preview",
    previewId: row.preview_uid,
    documentType: row.document_type,
    targetEntity: { type: row.target_type, id: row.target_id },
    language: row.language,
    format: row.format,
    templateKey: row.template_key,
    schemaVersion: row.schema_version,
    previewHtml: row.preview_html,
    contentMarkdown: String(contentJson?.content?.markdown || ""),
    structuredSummaryMetadata: {
      title: contentJson?.content?.title || null,
      generatedAt: row.created_at,
      expiresAt: row.expires_at,
      status: row.status,
    },
  };
}

function getPreviewByUid(previewUid) {
  const row = db
    .prepare(
      `SELECT * FROM document_generation_previews WHERE preview_uid = @preview_uid LIMIT 1`,
    )
    .get({ preview_uid: String(previewUid || "").trim() });
  if (!row) return null;
  return {
    ...row,
    content_json: parseJson(row.content_json),
  };
}

function expireIfNeeded(previewUid) {
  db.prepare(
    `UPDATE document_generation_previews
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE preview_uid = @preview_uid
       AND status = 'preview_ready'
       AND datetime(expires_at) <= datetime('now')`,
  ).run({ preview_uid: previewUid });
}

function createPreview(plan, context = {}) {
  const previewUid = makePreviewUid();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO document_generation_previews
      (preview_uid, conversation_id, session_id, created_by, target_type, target_id, document_type, language, format, template_key, schema_version, content_json, preview_html, status, expires_at)
     VALUES
      (@preview_uid, @conversation_id, @session_id, @created_by, @target_type, @target_id, @document_type, @language, @format, @template_key, @schema_version, @content_json, @preview_html, 'preview_ready', @expires_at)`,
  ).run({
    preview_uid: previewUid,
    conversation_id: context.conversationId || null,
    session_id: context.sessionId || null,
    created_by: context.createdBy || null,
    target_type: plan.target.type,
    target_id: plan.target.id,
    document_type: plan.documentType,
    language: plan.language,
    format: plan.format,
    template_key: plan.templateKey,
    schema_version: plan.schemaVersion,
    content_json: JSON.stringify(plan.contentJson || {}),
    preview_html: String(plan.previewHtml || ""),
    expires_at: expiresAt,
  });
  const row = db
    .prepare(
      `SELECT * FROM document_generation_previews WHERE preview_uid = @preview_uid LIMIT 1`,
    )
    .get({ preview_uid: previewUid });
  return toPreviewArtifact(row);
}

async function confirmPreview(previewUid, options = {}) {
  const uid = String(previewUid || "").trim();
  if (!uid) {
    const err = new Error("previewId is required");
    err.status = 400;
    err.code = "PREVIEW_ID_REQUIRED";
    throw err;
  }

  expireIfNeeded(uid);
  const preview = getPreviewByUid(uid);
  if (!preview) {
    const err = new Error("Preview not found");
    err.status = 404;
    err.code = "PREVIEW_NOT_FOUND";
    throw err;
  }
  if (preview.status !== "preview_ready") {
    const err = new Error(`Preview is not confirmable (status=${preview.status})`);
    err.status = 409;
    err.code = "PREVIEW_NOT_CONFIRMABLE";
    throw err;
  }
  if (typeof options.createProposal !== "function") {
    const err = new Error("createProposal callback is required");
    err.status = 500;
    err.code = "PROPOSAL_CALLBACK_MISSING";
    throw err;
  }

  const proposal = await options.createProposal({
    target: { type: preview.target_type, id: preview.target_id },
    payload: typeof options.transformPayload === "function"
      ? options.transformPayload(
          {
            documentType: preview.document_type,
            templateKey: preview.template_key,
            language: preview.language,
            format: preview.format,
            schemaVersion: preview.schema_version,
            contentJson: preview.content_json,
            title: preview.content_json?.content?.title || preview.document_type,
          },
          preview,
        )
      : {
      documentType: preview.document_type,
      templateKey: preview.template_key,
      language: preview.language,
      format: preview.format,
      schemaVersion: preview.schema_version,
      contentJson: preview.content_json,
      title: preview.content_json?.content?.title || preview.document_type,
    },
    preview,
  });

  db.prepare(
    `UPDATE document_generation_previews
     SET status = 'proposed', proposal_id = @proposal_id, updated_at = CURRENT_TIMESTAMP
     WHERE preview_uid = @preview_uid`,
  ).run({
    preview_uid: uid,
    proposal_id: proposal?.proposalId || null,
  });

  return proposal;
}

function cancelPreview(previewUid) {
  const uid = String(previewUid || "").trim();
  if (!uid) {
    const err = new Error("previewId is required");
    err.status = 400;
    err.code = "PREVIEW_ID_REQUIRED";
    throw err;
  }
  expireIfNeeded(uid);
  const preview = getPreviewByUid(uid);
  if (!preview) {
    const err = new Error("Preview not found");
    err.status = 404;
    err.code = "PREVIEW_NOT_FOUND";
    throw err;
  }
  if (preview.status === "cancelled") return { cancelled: true };
  if (preview.status === "proposed") {
    return { cancelled: false, reason: "already_proposed" };
  }

  db.prepare(
    `UPDATE document_generation_previews
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE preview_uid = @preview_uid`,
  ).run({ preview_uid: uid });
  return { cancelled: true };
}

module.exports = {
  createPreview,
  getPreviewByUid,
  confirmPreview,
  cancelPreview,
  toPreviewArtifact,
  PREVIEW_TTL_MS,
};
