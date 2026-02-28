"use strict";

function sanitizeObject(value, allowedKeys = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const key of allowedKeys) {
    out[key] = value[key] ?? null;
  }
  return out;
}

function buildDocumentSafeContext(documentContext = {}) {
  const safeSystem = sanitizeObject(documentContext.system, ["today"]) || { today: null };

  return {
    lawyer: sanitizeObject(documentContext.lawyer, [
      "fullName",
      "title",
      "firmName",
      "officeAddress",
      "email",
      "phone",
      "licenseNumber",
    ]),
    client: sanitizeObject(documentContext.client, ["fullName", "email", "phone"]),
    dossier: sanitizeObject(documentContext.dossier, ["reference", "title", "status"]),
    system: { today: safeSystem.today || null },
  };
}

module.exports = {
  buildDocumentSafeContext,
};

