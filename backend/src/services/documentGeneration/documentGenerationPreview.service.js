"use strict";

const crypto = require("crypto");
const db = require("../../db/connection");
const {
  DEFAULT_CANONICAL_FORMAT,
  DEFAULT_PREVIEW_FORMAT,
  normalizeFormat,
  isCanonicalFormat,
  isPreviewFormat,
} = require("../../domain/documentFormatGovernance");
const {
  StorageHint,
  normalizeActiveScope,
  normalizeStorageHint,
  resolveStorageTarget,
} = require("../../domain/document.storage.resolver");

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

function parseJsonObject(value) {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}

function resolveGovernedFormats({
  canonicalFormat = null,
  previewFormat = null,
  formatSelection = null,
} = {}) {
  const normalizedCanonical = normalizeFormat(canonicalFormat) || DEFAULT_CANONICAL_FORMAT;
  const normalizedPreview = normalizeFormat(previewFormat) || DEFAULT_PREVIEW_FORMAT;
  if (!isCanonicalFormat(normalizedCanonical)) {
    const err = new Error(`Unsupported canonical format: ${normalizedCanonical}`);
    err.status = 400;
    err.code = "UNSUPPORTED_CANONICAL_FORMAT";
    throw err;
  }
  if (!isPreviewFormat(normalizedPreview)) {
    const err = new Error(`Unsupported preview format: ${normalizedPreview}`);
    err.status = 400;
    err.code = "UNSUPPORTED_PREVIEW_FORMAT";
    throw err;
  }
  const normalizedFormatSelection =
    formatSelection && typeof formatSelection === "object" && !Array.isArray(formatSelection)
      ? {
          ...formatSelection,
          canonicalFormat: normalizedCanonical,
          previewFormat: normalizedPreview,
        }
      : {
          canonicalFormat: normalizedCanonical,
          previewFormat: normalizedPreview,
        };
  return {
    canonicalFormat: normalizedCanonical,
    previewFormat: normalizedPreview,
    formatSelection: normalizedFormatSelection,
  };
}

function extractRowGovernedFormats(row, contentJson = {}) {
  const governance =
    parseJsonObject(row?.format_governance_json) ||
    contentJson?._formatGovernance ||
    {};
  return resolveGovernedFormats({
    canonicalFormat: governance.canonicalFormat || row?.format || null,
    previewFormat: governance.previewFormat || null,
    formatSelection: governance,
  });
}

function resolveStorageGovernance({ storageGovernance = null, target = null } = {}) {
  const source =
    storageGovernance &&
    typeof storageGovernance === "object" &&
    !Array.isArray(storageGovernance)
      ? storageGovernance
      : {};
  const fallbackScope = target
    ? { entityType: target.type, entityId: target.id }
    : {};
  const activeScope = normalizeActiveScope({
    ...fallbackScope,
    ...(source.activeScope || {}),
  });
  const storageHint = normalizeStorageHint(source.storageHint) || StorageHint.INHERIT;
  const scopeDiscoveryHint =
    source.scopeDiscoveryHint &&
    typeof source.scopeDiscoveryHint === "object" &&
    !Array.isArray(source.scopeDiscoveryHint)
      ? {
          queryText: String(source.scopeDiscoveryHint.queryText || source.scopeDiscoveryHint.query || "").trim() || null,
          preferredScopeLevels: Array.isArray(source.scopeDiscoveryHint.preferredScopeLevels)
            ? source.scopeDiscoveryHint.preferredScopeLevels
                .map((value) => String(value || "").trim().toLowerCase())
                .filter(Boolean)
            : [],
        }
      : null;
  const hasScopeBinding =
    source.hasScopeBinding === true;

  try {
    const resolvedTarget = resolveStorageTarget({
      activeScope,
      storageHint,
    });
    return {
      storageHint,
      activeScope,
      resolvedTarget: {
        entityType: resolvedTarget.entityType,
        entityId: resolvedTarget.entityId,
      },
      resolutionMode: resolvedTarget.resolutionMode,
      status: "resolved",
      message: null,
      hasScopeBinding,
      scopeDiscoveryHint,
    };
  } catch (error) {
    if (String(error?.code || "") === "STORAGE_SCOPE_MISSING") {
      return {
        storageHint,
        activeScope,
        resolvedTarget: null,
        resolutionMode: storageHint === StorageHint.INHERIT ? "inherit" : "hint",
        status: "missing",
        message:
          String(error?.message || "").trim() ||
          "I need a resolved scope before storing this document.",
        hasScopeBinding,
        scopeDiscoveryHint,
      };
    }
    throw error;
  }
}

function extractRowStorageGovernance(row, contentJson = {}) {
  const governance =
    parseJsonObject(row?.storage_governance_json) ||
    contentJson?._storageGovernance ||
    {};
  return resolveStorageGovernance({
    storageGovernance: governance,
    target: { type: row?.target_type, id: row?.target_id },
  });
}

function toPreviewArtifact(row) {
  const contentJson = parseJson(row.content_json) || {};
  const { canonicalFormat, previewFormat, formatSelection } = extractRowGovernedFormats(
    row,
    contentJson,
  );
  const storageDecision = extractRowStorageGovernance(row, contentJson);
  return {
    type: "document_generation_preview",
    previewId: row.preview_uid,
    documentType: row.document_type,
    targetEntity: { type: row.target_type, id: row.target_id },
    language: row.language,
    canonicalFormat,
    previewFormat,
    formatSelection,
    storageDecision,
    // Backward compatibility for clients that still read `format`.
    format: canonicalFormat,
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
  const { canonicalFormat, previewFormat, formatSelection } = resolveGovernedFormats({
    canonicalFormat: plan.canonicalFormat || plan.format,
    previewFormat: plan.previewFormat,
    formatSelection: plan.formatSelection,
  });
  const governedContentJson = {
    ...(plan.contentJson || {}),
  };
  const resolvedStorageGovernance = resolveStorageGovernance({
    storageGovernance: plan.storageGovernance,
    target: plan.target,
  });
  const formatGovernance = {
    ...formatSelection,
    canonicalFormat,
    previewFormat,
  };
  const previewUid = makePreviewUid();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO document_generation_previews
      (preview_uid, conversation_id, session_id, created_by, target_type, target_id, document_type, language, format, template_key, schema_version, content_json, format_governance_json, storage_governance_json, preview_html, status, expires_at)
     VALUES
      (@preview_uid, @conversation_id, @session_id, @created_by, @target_type, @target_id, @document_type, @language, @format, @template_key, @schema_version, @content_json, @format_governance_json, @storage_governance_json, @preview_html, 'preview_ready', @expires_at)`,
  ).run({
    preview_uid: previewUid,
    conversation_id: context.conversationId || null,
    session_id: context.sessionId || null,
    created_by: context.createdBy || null,
    target_type: plan.target.type,
    target_id: plan.target.id,
    document_type: plan.documentType,
    language: plan.language,
    format: canonicalFormat,
    template_key: plan.templateKey,
    schema_version: plan.schemaVersion,
    content_json: JSON.stringify(governedContentJson),
    format_governance_json: JSON.stringify(formatGovernance),
    storage_governance_json: JSON.stringify(resolvedStorageGovernance),
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

  const { canonicalFormat, previewFormat, formatSelection } = extractRowGovernedFormats(
    preview,
    preview.content_json || {},
  );
  const storageGovernance = extractRowStorageGovernance(preview, preview.content_json || {});
  const basePayload = {
    documentType: preview.document_type,
    templateKey: preview.template_key,
    language: preview.language,
    canonicalFormat,
    previewFormat,
    formatSelection,
    // Backward compatibility for proposal/legacy callers.
    format: canonicalFormat,
    schemaVersion: preview.schema_version,
    contentJson: preview.content_json,
    storageGovernance,
    title: preview.content_json?.content?.title || preview.document_type,
  };
  const transformedPayload =
    typeof options.transformPayload === "function"
      ? options.transformPayload(basePayload, preview)
      : basePayload;
  const resolvedPayloadFormats = resolveGovernedFormats({
    canonicalFormat: transformedPayload?.canonicalFormat || transformedPayload?.format,
    previewFormat: transformedPayload?.previewFormat || previewFormat,
    formatSelection: transformedPayload?.formatSelection || formatSelection,
  });
  const resolvedPayloadStorage = resolveStorageGovernance({
    storageGovernance: transformedPayload?.storageGovernance || storageGovernance,
    target: { type: preview.target_type, id: preview.target_id },
  });
  const proposalTarget =
    resolvedPayloadStorage.status === "resolved" && resolvedPayloadStorage.resolvedTarget
      ? {
          type: resolvedPayloadStorage.resolvedTarget.entityType,
          id: resolvedPayloadStorage.resolvedTarget.entityId,
        }
      : { type: preview.target_type, id: preview.target_id };

  const proposal = await options.createProposal({
    target: proposalTarget,
    payload: {
      ...transformedPayload,
      canonicalFormat: resolvedPayloadFormats.canonicalFormat,
      previewFormat: resolvedPayloadFormats.previewFormat,
      formatSelection: resolvedPayloadFormats.formatSelection,
      storageGovernance: resolvedPayloadStorage,
      format: resolvedPayloadFormats.canonicalFormat,
    },
    preview,
  });

  if (proposal && typeof proposal === "object" && proposal.type === "context_suggestion") {
    return proposal;
  }

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
