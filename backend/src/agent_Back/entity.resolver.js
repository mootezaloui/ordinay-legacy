"use strict";

const MAX_SHORTLIST = 10;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stripArabicDiacritics(value) {
  return String(value || "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "");
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  let text = stripArabicDiacritics(stripDiacritics(value));
  text = text.toLowerCase();
  text = text.replace(/['’`´]/g, "");
  text = text.replace(/[^\p{L}\p{N}@.\s-]/gu, " ");
  text = text.replace(/[_-]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function normalizeEmail(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

function normalizePhone(value) {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}

function normalizeReference(value) {
  const normalized = normalizeText(value);
  return normalized.replace(/\s+/g, "");
}

function normalizeDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseNumericId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function uniqueById(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item && item.id !== null && item.id !== undefined) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

function finalizeMatches(matches) {
  const unique = uniqueById(matches);
  if (unique.length === 0) return { kind: "none" };
  if (unique.length === 1) {
    return { kind: "one", id: unique[0].id, entity: unique[0] };
  }
  const overflow = unique.length > MAX_SHORTLIST;
  return {
    kind: "many",
    candidates: unique.slice(0, MAX_SHORTLIST),
    total: unique.length,
    overflow,
  };
}

function resolveClientQuery(queryText, clients = []) {
  if (!queryText) return { kind: "none" };
  const normalized = normalizeText(queryText);
  const normalizedEmail = normalizeEmail(queryText);
  const normalizedPhone = normalizePhone(queryText);
  const numericId = parseNumericId(queryText);

  const exactMatches = clients.filter((client) => {
    if (!client) return false;
    if (numericId !== null && client.id === numericId) return true;
    if (normalized && normalizeText(client.name) === normalized) return true;
    if (normalized && normalizeText(client.company) === normalized) return true;
    if (normalizedEmail && normalizeEmail(client.email) === normalizedEmail) return true;
    if (normalizedPhone && normalizePhone(client.phone) === normalizedPhone) return true;
    if (normalizedPhone && normalizePhone(client.alternate_phone) === normalizedPhone)
      return true;
    return false;
  });

  if (exactMatches.length > 0) {
    return finalizeMatches(exactMatches);
  }

  if (!normalized && !normalizedEmail && !normalizedPhone && numericId === null) {
    return { kind: "none" };
  }

  const fuzzyMatches = clients.filter((client) => {
    if (!client) return false;
    if (normalized && normalizeText(client.name).includes(normalized)) return true;
    if (normalized && normalizeText(client.company).includes(normalized)) return true;
    if (normalizedEmail && normalizeEmail(client.email).includes(normalizedEmail))
      return true;
    if (normalizedPhone && normalizePhone(client.phone).includes(normalizedPhone))
      return true;
    if (
      normalizedPhone &&
      normalizePhone(client.alternate_phone).includes(normalizedPhone)
    )
      return true;
    return false;
  });

  return finalizeMatches(fuzzyMatches);
}

function resolveDossierQuery(queryText, dossiers = []) {
  if (!queryText) return { kind: "none" };
  const normalized = normalizeText(queryText);
  const ref = normalizeReference(queryText);
  const numericId = parseNumericId(queryText);

  const exactMatches = dossiers.filter((dossier) => {
    if (!dossier) return false;
    if (numericId !== null && dossier.id === numericId) return true;
    if (ref && normalizeReference(dossier.reference) === ref) return true;
    if (ref && normalizeReference(dossier.code) === ref) return true;
    if (normalized && normalizeText(dossier.title) === normalized) return true;
    return false;
  });

  if (exactMatches.length > 0) {
    return finalizeMatches(exactMatches);
  }

  if (!normalized && !ref && numericId === null) return { kind: "none" };

  const fuzzyMatches = dossiers.filter((dossier) => {
    if (!dossier) return false;
    if (normalized && normalizeText(dossier.title).includes(normalized)) return true;
    if (ref && normalizeReference(dossier.reference).includes(ref)) return true;
    if (normalized && normalizeText(dossier.reference).includes(normalized)) return true;
    return false;
  });

  return finalizeMatches(fuzzyMatches);
}

function resolveTaskQuery(queryText, tasks = []) {
  if (!queryText) return { kind: "none" };
  const normalized = normalizeText(queryText);
  const numericId = parseNumericId(queryText);

  const exactMatches = tasks.filter((task) => {
    if (!task) return false;
    if (numericId !== null && task.id === numericId) return true;
    if (normalized && normalizeText(task.title) === normalized) return true;
    return false;
  });

  if (exactMatches.length > 0) {
    return finalizeMatches(exactMatches);
  }

  if (!normalized && numericId === null) return { kind: "none" };

  const fuzzyMatches = tasks.filter((task) => {
    if (!task) return false;
    if (normalized && normalizeText(task.title).includes(normalized)) return true;
    return false;
  });

  return finalizeMatches(fuzzyMatches);
}

function extractDateKey(queryText) {
  if (!queryText) return null;
  const raw = String(queryText).trim();
  if (!raw) return null;
  if (DATE_REGEX.test(raw)) return raw;
  return normalizeDateKey(raw);
}

function resolveSessionQuery(queryText, sessions = []) {
  if (!queryText) return { kind: "none" };
  const normalized = normalizeText(queryText);
  const numericId = parseNumericId(queryText);
  const dateKey = extractDateKey(queryText);

  const exactMatches = sessions.filter((session) => {
    if (!session) return false;
    if (numericId !== null && session.id === numericId) return true;
    if (normalized && normalizeText(session.title) === normalized) return true;
    if (normalized && normalizeText(session.session_type) === normalized) return true;
    if (
      dateKey &&
      (normalizeDateKey(session.scheduled_at) === dateKey ||
        normalizeDateKey(session.session_date) === dateKey)
    )
      return true;
    return false;
  });

  if (exactMatches.length > 0) {
    return finalizeMatches(exactMatches);
  }

  if (!normalized && !dateKey && numericId === null) return { kind: "none" };

  const fuzzyMatches = sessions.filter((session) => {
    if (!session) return false;
    if (normalized && normalizeText(session.title).includes(normalized)) return true;
    if (normalized && normalizeText(session.session_type).includes(normalized))
      return true;
    if (
      dateKey &&
      (normalizeDateKey(session.scheduled_at) === dateKey ||
        normalizeDateKey(session.session_date) === dateKey)
    )
      return true;
    return false;
  });

  return finalizeMatches(fuzzyMatches);
}

module.exports = {
  resolveClientQuery,
  resolveDossierQuery,
  resolveTaskQuery,
  resolveSessionQuery,
  normalizeText,
};
