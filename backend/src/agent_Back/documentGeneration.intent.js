"use strict";

const db = require("../db/connection");

function normalizeRefText(value) {
  return String(value || "").replace(/[\u2010-\u2015\u2212]/g, "-");
}

function canonicalizeReferenceToken(value) {
  return normalizeRefText(value)
    .toUpperCase()
    .replace(/[^\w-]/g, "")
    .replace(/_+/g, "")
    .trim();
}

function canonicalizeSqlRefExpr(columnName) {
  return `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${columnName}), ' ', ''), '–', '-'), '—', '-'), '−', '-'), '.', ''))`;
}

async function resolveGenerationTargetFromReference(text) {
  const dossierRefMatch = text.match(/\bDOS-\d{4}-\d+\b/i);
  if (dossierRefMatch) {
    const reference = canonicalizeReferenceToken(String(dossierRefMatch[0]));
    const normalizedExpr = canonicalizeSqlRefExpr("reference");
    const dossier = db
      .prepare(
        `SELECT id
         FROM dossiers
         WHERE ${normalizedExpr} = @reference
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .get({ reference });
    if (dossier?.id) return { type: "dossier", id: Number(dossier.id) };
  }

  const lawsuitRefMatch = text.match(/\bL-\d{4}-\d+\b/i);
  if (lawsuitRefMatch) {
    const reference = canonicalizeReferenceToken(String(lawsuitRefMatch[0]));
    const normalizedExpr = canonicalizeSqlRefExpr("reference");
    const lawsuit = db
      .prepare(
        `SELECT id
         FROM lawsuits
         WHERE ${normalizedExpr} = @reference
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .get({ reference });
    if (lawsuit?.id) return { type: "lawsuit", id: Number(lawsuit.id) };
  }

  return null;
}

function inferTargetFromActiveEntity(context = {}) {
  const active = context?.activeEntity;
  const type = String(active?.type || "").toLowerCase();
  const id = Number(active?.id);
  if (!type || !Number.isInteger(id) || id <= 0) return null;
  if (!["client", "dossier", "lawsuit", "mission", "task", "session"].includes(type)) {
    return null;
  }
  return { type, id };
}

function resolveSingleOpenDossierForClient(clientId) {
  const id = Number(clientId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = db
    .prepare(
      `SELECT id
       FROM dossiers
       WHERE client_id = @client_id
         AND deleted_at IS NULL
         AND LOWER(COALESCE(status, '')) IN ('open', 'active', 'pending', 'in_progress')
       ORDER BY id DESC
       LIMIT 2`,
    )
    .all({ client_id: id });
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  return { type: "dossier", id: Number(rows[0].id) };
}

function extractTargetHints(text) {
  const hintedTypeMatch = text.match(/\b(client|dossier|lawsuit|mission|task|session)\b/i);
  const dossierRefMatch = text.match(/\bDOS-\d{4}-\d+\b/i);
  const lawsuitRefMatch = text.match(/\bL-\d{4}-\d+\b/i);
  return {
    hintedType: hintedTypeMatch ? String(hintedTypeMatch[1]).toLowerCase() : null,
    reference: dossierRefMatch
      ? canonicalizeReferenceToken(String(dossierRefMatch[0]))
      : lawsuitRefMatch
        ? canonicalizeReferenceToken(String(lawsuitRefMatch[0]))
        : null,
  };
}

async function detectDocumentGenerationIntent(message, context = {}) {
  const text = String(message || "").trim();
  if (!text) return null;
  const canonicalText = normalizeRefText(text);
  const low = canonicalText.toLowerCase();
  const hasGenerateVerb =
    /\b(generate|create|draft|prepare|write)\b/i.test(canonicalText) ||
    /(?:إنشاء|توليد|تحضير|صياغة)/.test(canonicalText);
  if (!hasGenerateVerb) return null;
  if (
    !/\b(document|letter|opinion|memo|summary|pdf|docx|html)\b/i.test(low) &&
    !/(مذكرة|خطاب|ملخص|وثيقة)/.test(canonicalText)
  ) {
    return null;
  }

  let documentType = null;
  if (
    /\b(court|postpone|postponement|motion|request letter|official request|official document|petition|application|parenting plan)\b/i.test(
      low,
    ) ||
    /(طلب\s+رسمي|وثيقة\s+رسمية|خطة\s+(الحضانة|الوصاية))/.test(canonicalText)
  ) {
    documentType = "COURT_REQUEST_LETTER";
  } else if (/\b(legal opinion|opinion)\b/i.test(low)) {
    documentType = "LEGAL_OPINION";
  } else if (/\b(task memo|memo)\b/i.test(low) || /(مذكرة مهمة)/.test(canonicalText)) {
    documentType = "TASK_MEMO";
  } else if (
    /\b(session summary|hearing summary|session)\b/i.test(low) ||
    /(ملخص جلسة)/.test(canonicalText)
  ) {
    documentType = "SESSION_SUMMARY";
  }
  if (!documentType) return null;

  let format = "pdf";
  if (/\bdocx\b/i.test(low)) format = "docx";
  if (/\bhtml\b/i.test(low)) format = "html";

  const language = /\b(arabic|arab|العربية|عربي)\b/i.test(canonicalText) ? "ar" : "en";

  const explicit = canonicalText.match(
    /\b(client|dossier|lawsuit|mission|task|session)\s*#?\s*(\d+)\b/i,
  );
  let target = null;
  if (explicit) {
    target = { type: explicit[1].toLowerCase(), id: Number(explicit[2]) };
  } else if (inferTargetFromActiveEntity(context)) {
    target = inferTargetFromActiveEntity(context);
  } else if (context?.lawsuitId) {
    target = { type: "lawsuit", id: Number(context.lawsuitId) };
  } else if (context?.dossierId) {
    target = { type: "dossier", id: Number(context.dossierId) };
  } else if (context?.taskId) {
    target = { type: "task", id: Number(context.taskId) };
  } else if (context?.sessionId) {
    target = { type: "session", id: Number(context.sessionId) };
  } else if (context?.clientId) {
    target = { type: "client", id: Number(context.clientId) };
  } else if (context?.missionId) {
    target = { type: "mission", id: Number(context.missionId) };
  }

  if (String(target?.type || "").toLowerCase() === "client" && context?.clientId) {
    const inferredDossier = resolveSingleOpenDossierForClient(context.clientId);
    if (inferredDossier) {
      target = inferredDossier;
    }
  }

  if (!target?.type || !Number.isInteger(target?.id) || target.id <= 0) {
    target = await resolveGenerationTargetFromReference(canonicalText);
  }

  const hasValidTarget = Boolean(target?.type) && Number.isInteger(target?.id) && target.id > 0;
  if (!hasValidTarget) {
    return {
      target: null,
      targetHints: extractTargetHints(canonicalText),
      documentType,
      language,
      format,
      instructions: text,
    };
  }

  return {
    target,
    documentType,
    language,
    format,
    instructions: text,
  };
}

module.exports = {
  detectDocumentGenerationIntent,
};
