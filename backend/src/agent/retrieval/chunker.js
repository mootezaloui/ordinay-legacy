"use strict";

const { RETRIEVAL_CHUNK_OVERLAP, RETRIEVAL_CHUNK_SIZE } = require("./retrieval.policy");

function chunkText({
  documentId,
  sourceId,
  text,
  metadata,
  chunkSize = RETRIEVAL_CHUNK_SIZE,
  chunkOverlap = RETRIEVAL_CHUNK_OVERLAP,
} = {}) {
  const normalizedText = String(text || "");
  if (!normalizedText.trim()) {
    return [];
  }

  const safeChunkSize = normalizePositiveInt(chunkSize, RETRIEVAL_CHUNK_SIZE);
  const safeChunkOverlap = normalizeChunkOverlap(chunkOverlap, safeChunkSize, RETRIEVAL_CHUNK_OVERLAP);
  const step = Math.max(safeChunkSize - safeChunkOverlap, 1);
  const safeMetadata = isRecord(metadata) ? metadata : {};
  const safeDocumentId = normalizeId(documentId, "document");
  const safeSourceId = normalizeId(sourceId, safeDocumentId);

  const chunks = [];
  let chunkIndex = 0;

  for (let start = 0; start < normalizedText.length; start += step) {
    const end = Math.min(start + safeChunkSize, normalizedText.length);
    const slice = normalizedText.slice(start, end);
    if (!slice.trim()) {
      if (end >= normalizedText.length) {
        break;
      }
      continue;
    }

    const { charStart, charEnd } = trimSliceBounds(normalizedText, start, end);
    if (charStart >= charEnd) {
      if (end >= normalizedText.length) {
        break;
      }
      continue;
    }

    chunks.push({
      documentId: safeDocumentId,
      sourceId: safeSourceId,
      chunkIndex,
      text: normalizedText.slice(charStart, charEnd),
      charStart,
      charEnd,
      metadata: safeMetadata,
    });
    chunkIndex += 1;

    if (end >= normalizedText.length) {
      break;
    }
  }

  return chunks;
}

function trimSliceBounds(sourceText, start, end) {
  let charStart = start;
  let charEnd = end;

  while (charStart < charEnd && /\s/.test(sourceText[charStart])) {
    charStart += 1;
  }
  while (charEnd > charStart && /\s/.test(sourceText[charEnd - 1])) {
    charEnd -= 1;
  }

  return { charStart, charEnd };
}

function normalizeId(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeChunkOverlap(value, chunkSize, fallback) {
  const parsed = normalizePositiveInt(value, fallback);
  return Math.max(1, Math.min(parsed, Math.max(chunkSize - 1, 1)));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  chunkText,
};
