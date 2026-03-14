"use strict";

const { DEFAULT_CITATION_MODE, SUPPORTED_CITATION_MODES } = require("./research.policy");

function buildCitations({ sources, mode } = {}) {
  const citationMode = normalizeCitationMode(mode);
  const records = normalizeSources(sources);
  const entries = records.map((source, index) => ({
    index: index + 1,
    sourceId: source.id,
    label: source.label,
    reference: source.reference,
    confidence: source.confidence,
  }));
  const markers = entries.reduce((acc, entry) => {
    acc[entry.sourceId] = `[${entry.index}]`;
    return acc;
  }, {});

  return {
    mode: citationMode,
    entries,
    markers,
    text: renderCitationText(entries, citationMode),
  };
}

function renderCitationText(entries, mode) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }

  if (mode === "inline") {
    const markerLine = entries.map((entry) => `[${entry.index}]`).join(" ");
    const detailLine = entries
      .map((entry) => `${entry.index}:${entry.label}`)
      .join(" | ");
    return `\n\nEvidence markers: ${markerLine}\nSources: ${detailLine}`;
  }

  if (mode === "appendix") {
    const lines = entries.map(
      (entry) =>
        `${entry.index}. ${entry.label} — ${entry.reference} (confidence: ${entry.confidence})`,
    );
    return `\n\nSource Appendix:\n${lines.join("\n")}`;
  }

  const footnotes = entries.map(
    (entry) =>
      `[${entry.index}] ${entry.label} — ${entry.reference} (confidence: ${entry.confidence})`,
  );
  return `\n\nSources:\n${footnotes.join("\n")}`;
}

function normalizeSources(sources) {
  const rows = Array.isArray(sources) ? sources : [];
  return rows
    .map((row) => normalizeSourceRecord(row))
    .filter(Boolean)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeSourceRecord(source) {
  const row = toRecord(source);
  if (!row) {
    return null;
  }

  const id = normalizeOptionalString(row.id);
  const type = normalizeOptionalString(row.type).toLowerCase();
  const label = normalizeOptionalString(row.label);
  const reference = normalizeOptionalString(row.reference);
  const confidence = normalizeConfidence(row.confidence);

  if (!id || !type || !label || !reference) {
    return null;
  }

  return { id, type, label, reference, confidence };
}

function normalizeCitationMode(value) {
  const mode = normalizeOptionalString(value).toLowerCase();
  return SUPPORTED_CITATION_MODES.includes(mode) ? mode : DEFAULT_CITATION_MODE;
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizeConfidence(value) {
  const normalized = normalizeOptionalString(value).toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  buildCitations,
};
