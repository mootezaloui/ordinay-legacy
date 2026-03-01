"use strict";

const path = require("path");

/**
 * Document Format Governance (single source of truth)
 *
 * Flow contract:
 *  1) Preview format (UI rendering):       DEFAULT_PREVIEW_FORMAT
 *  2) Canonical stored format (persisted): DEFAULT_CANONICAL_FORMAT
 *  3) Ingestion format (text/vision parse): SUPPORTED_INGEST_FORMATS
 *
 * Preview and canonical are intentionally distinct.
 */

const DocumentFormat = Object.freeze({
  PDF: "pdf",
  DOCX: "docx",
  XLSX: "xlsx",
  HTML: "html",
  MD: "md",
  TXT: "txt",
});

const DEFAULT_PREVIEW_FORMAT = DocumentFormat.HTML;
const DEFAULT_CANONICAL_FORMAT = DocumentFormat.PDF;
const DocumentOutputFormatPreference = Object.freeze({
  AUTO: "auto",
  PDF: DocumentFormat.PDF,
  DOCX: DocumentFormat.DOCX,
  XLSX: DocumentFormat.XLSX,
  HTML: DocumentFormat.HTML,
});
const DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE = DocumentOutputFormatPreference.AUTO;

const ArtifactKind = Object.freeze({
  DOCUMENT: "document",
  TABLE: "table",
  EMAIL: "email",
  LETTER: "letter",
  REPORT: "report",
  MEMO: "memo",
});

const SUPPORTED_CANONICAL_FORMATS = Object.freeze([
  DocumentFormat.PDF,
  DocumentFormat.DOCX,
  DocumentFormat.XLSX,
]);

const SUPPORTED_PREVIEW_FORMATS = Object.freeze([
  DocumentFormat.HTML,
  // Optional future read-only preview: DocumentFormat.PDF
]);

const IMAGE_INGEST_FORMATS = Object.freeze([
  "image",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "tif",
  "tiff",
  "heic",
  "heif",
]);

const TEXTUAL_INGEST_FORMATS = Object.freeze([
  "text",
  DocumentFormat.HTML,
  DocumentFormat.MD,
  DocumentFormat.TXT,
  "csv",
  "json",
  "rtf",
]);

const STRUCTURED_INGEST_FORMATS = Object.freeze([
  DocumentFormat.PDF,
  DocumentFormat.DOCX,
  DocumentFormat.XLSX,
  "pptx",
]);

const SUPPORTED_INGEST_FORMATS = Object.freeze([
  ...STRUCTURED_INGEST_FORMATS,
  ...TEXTUAL_INGEST_FORMATS,
  ...IMAGE_INGEST_FORMATS,
]);

const FORMAT_TO_MIME = Object.freeze({
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  html: "text/html",
  md: "text/markdown",
  txt: "text/plain",
  text: "text/plain",
  csv: "text/csv",
  json: "application/json",
  rtf: "application/rtf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  image: "application/octet-stream",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
});

const FORMAT_TO_EXTENSION = Object.freeze({
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  html: "html",
  md: "md",
  txt: "txt",
  text: "txt",
  csv: "csv",
  json: "json",
  rtf: "rtf",
  pptx: "pptx",
  image: "",
  png: "png",
  jpg: "jpg",
  jpeg: "jpeg",
  gif: "gif",
  bmp: "bmp",
  webp: "webp",
  tif: "tif",
  tiff: "tiff",
  heic: "heic",
  heif: "heif",
});

const MIME_TO_FORMAT = Object.freeze({
  "application/pdf": "pdf",
  "application/msword": "docx", // legacy .doc mapped to docx parser compatibility
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "image/heic": "heic",
  "image/heif": "heif",
});

const EXTENSION_TO_FORMAT = Object.freeze({
  pdf: "pdf",
  doc: "docx", // legacy .doc treated as docx-like for governance compatibility
  docx: "docx",
  xls: "xlsx",
  xlsx: "xlsx",
  pptx: "pptx",
  htm: "html",
  html: "html",
  md: "md",
  markdown: "md",
  txt: "txt",
  csv: "csv",
  json: "json",
  rtf: "rtf",
  png: "png",
  jpg: "jpg",
  jpeg: "jpeg",
  gif: "gif",
  bmp: "bmp",
  webp: "webp",
  tif: "tif",
  tiff: "tiff",
  heic: "heic",
  heif: "heif",
});

const FORMAT_ALIASES = Object.freeze({
  markdown: DocumentFormat.MD,
  text: DocumentFormat.TXT,
  htm: DocumentFormat.HTML,
});

function toNormalizedToken(input) {
  return String(input || "").trim().toLowerCase();
}

function toBareExtension(input) {
  const value = toNormalizedToken(input);
  return value.startsWith(".") ? value.slice(1) : value;
}

function normalizeFormat(input) {
  if (!input && input !== 0) return null;
  const raw = toNormalizedToken(input);
  if (!raw) return null;

  const fromMime = MIME_TO_FORMAT[raw] || null;
  const fromExtension = EXTENSION_TO_FORMAT[toBareExtension(raw)] || null;
  const resolved = FORMAT_ALIASES[raw] || fromMime || fromExtension || toBareExtension(raw);

  return Object.values(DocumentFormat).includes(resolved) ? resolved : null;
}

function normalizeOutputFormatPreference(input) {
  const normalized = toNormalizedToken(input);
  if (!normalized) return null;
  if (normalized === DocumentOutputFormatPreference.AUTO) {
    return DocumentOutputFormatPreference.AUTO;
  }
  const format = normalizeFormat(normalized);
  if (!format) return null;
  if (
    format === DocumentFormat.PDF ||
    format === DocumentFormat.DOCX ||
    format === DocumentFormat.XLSX ||
    format === DocumentFormat.HTML
  ) {
    return format;
  }
  return null;
}

function normalizeArtifactKind(input) {
  const normalized = toNormalizedToken(input);
  if (!normalized) return null;
  if (Object.values(ArtifactKind).includes(normalized)) return normalized;
  return null;
}

function normalizeStructureHints(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    hasTabularData: source.hasTabularData === true,
    requiresEditing: source.requiresEditing === true,
    intendedForFiling: source.intendedForFiling === true,
  };
}

function chooseOutputFormats({ preference, artifactKind, structureHints } = {}) {
  const normalizedPreference =
    normalizeOutputFormatPreference(preference) || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
  const normalizedArtifactKind = normalizeArtifactKind(artifactKind) || ArtifactKind.DOCUMENT;
  const hints = normalizeStructureHints(structureHints);
  const warnings = [];

  let canonicalFormat = DEFAULT_CANONICAL_FORMAT;
  let selectionMode = "auto";
  let selectionSource = "auto_rules";

  if (normalizedPreference !== DocumentOutputFormatPreference.AUTO) {
    selectionMode = "preference";
    selectionSource = "user_preference";
    if (isCanonicalFormat(normalizedPreference)) {
      canonicalFormat = normalizedPreference;
    } else {
      canonicalFormat = DEFAULT_CANONICAL_FORMAT;
      warnings.push({
        code: "PREFERENCE_NOT_CANONICAL",
        message: `Preferred format "${normalizedPreference}" is not canonical; falling back to "${DEFAULT_CANONICAL_FORMAT}".`,
      });
      selectionSource = "preference_fallback";
    }
  } else if (hints.hasTabularData || normalizedArtifactKind === ArtifactKind.TABLE) {
    canonicalFormat = DocumentFormat.XLSX;
  } else if (hints.requiresEditing) {
    canonicalFormat = DocumentFormat.DOCX;
  } else {
    canonicalFormat = DocumentFormat.PDF;
  }

  return {
    previewFormat: DEFAULT_PREVIEW_FORMAT,
    canonicalFormat,
    selectionMode,
    selectionSource,
    preference: normalizedPreference,
    artifactKind: normalizedArtifactKind,
    structureHints: hints,
    warnings,
  };
}

function normalizeIngestFormat(input) {
  if (!input && input !== 0) return null;
  const raw = toNormalizedToken(input);
  if (!raw) return null;

  if (SUPPORTED_INGEST_FORMATS.includes(raw)) return raw;

  const fromAlias = FORMAT_ALIASES[raw] || null;
  if (fromAlias && SUPPORTED_INGEST_FORMATS.includes(fromAlias)) return fromAlias;

  const fromMime = MIME_TO_FORMAT[raw] || null;
  if (fromMime && SUPPORTED_INGEST_FORMATS.includes(fromMime)) return fromMime;

  const fromExtension = EXTENSION_TO_FORMAT[toBareExtension(raw)] || null;
  if (fromExtension && SUPPORTED_INGEST_FORMATS.includes(fromExtension)) return fromExtension;

  return null;
}

function formatToMime(format) {
  const normalized = normalizeIngestFormat(format) || normalizeFormat(format);
  return (normalized && FORMAT_TO_MIME[normalized]) || "application/octet-stream";
}

function formatToExtension(format) {
  const normalized = normalizeIngestFormat(format) || normalizeFormat(format);
  return (normalized && FORMAT_TO_EXTENSION[normalized]) || "";
}

function mimeToFormat(mimeType) {
  return normalizeIngestFormat(mimeType);
}

function extensionToFormat(extension) {
  return normalizeIngestFormat(extension);
}

function detectIngestFormat({ format = null, mimeType = null, extension = null, filePath = null } = {}) {
  const byFormat = normalizeIngestFormat(format);
  if (byFormat) return byFormat;

  const byMime = normalizeIngestFormat(mimeType);
  if (byMime) return byMime;

  const explicitExtension = toBareExtension(extension || "");
  const byExtension = normalizeIngestFormat(explicitExtension);
  if (byExtension) return byExtension;

  const extFromPath = toBareExtension(path.extname(String(filePath || "")));
  return normalizeIngestFormat(extFromPath);
}

function toIngestionDocType(format) {
  const normalized = normalizeIngestFormat(format);
  if (!normalized) return "unknown";
  if (normalized === "pdf") return "pdf";
  if (normalized === "docx") return "docx";
  if (normalized === "xlsx") return "xlsx";
  if (normalized === "pptx") return "pptx";
  if (normalized === "text") return "text";
  if (IMAGE_INGEST_FORMATS.includes(normalized)) return "image";
  if (TEXTUAL_INGEST_FORMATS.includes(normalized)) return "text";
  return "unknown";
}

function resolveIngestionDocType({ format = null, mimeType = null, extension = null, filePath = null } = {}) {
  const detected = detectIngestFormat({ format, mimeType, extension, filePath });
  return toIngestionDocType(detected);
}

function isPreviewFormat(format) {
  const normalized = normalizeFormat(format);
  return Boolean(normalized && SUPPORTED_PREVIEW_FORMATS.includes(normalized));
}

function isCanonicalFormat(format) {
  const normalized = normalizeFormat(format);
  return Boolean(normalized && SUPPORTED_CANONICAL_FORMATS.includes(normalized));
}

function isIngestibleFormat(format) {
  return Boolean(normalizeIngestFormat(format));
}

function getFormatGovernanceSnapshot() {
  const ingestMimeTypes = SUPPORTED_INGEST_FORMATS.map((fmt) => formatToMime(fmt))
    .filter(Boolean)
    .filter((mime, index, arr) => arr.indexOf(mime) === index);
  const ingestExtensions = SUPPORTED_INGEST_FORMATS.map((fmt) => formatToExtension(fmt))
    .filter(Boolean)
    .filter((ext, index, arr) => arr.indexOf(ext) === index);
  const uploadAccept = ingestExtensions.map((ext) => `.${ext}`).join(",");

  return {
    documentFormats: DocumentFormat,
    outputFormatPreferences: DocumentOutputFormatPreference,
    artifactKinds: ArtifactKind,
    defaults: {
      previewFormat: DEFAULT_PREVIEW_FORMAT,
      canonicalFormat: DEFAULT_CANONICAL_FORMAT,
      documentOutputFormatPreference: DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
    },
    supported: {
      canonicalFormats: [...SUPPORTED_CANONICAL_FORMATS],
      previewFormats: [...SUPPORTED_PREVIEW_FORMATS],
      ingestFormats: [...SUPPORTED_INGEST_FORMATS],
      documentOutputFormatPreferences: [
        DocumentOutputFormatPreference.AUTO,
        DocumentOutputFormatPreference.PDF,
        DocumentOutputFormatPreference.DOCX,
        DocumentOutputFormatPreference.XLSX,
        DocumentOutputFormatPreference.HTML,
      ],
      artifactKinds: [...Object.values(ArtifactKind)],
      ingestMimeTypes,
      ingestExtensions,
      uploadAccept,
    },
    mappings: {
      mimeByFormat: { ...FORMAT_TO_MIME },
      extensionByFormat: { ...FORMAT_TO_EXTENSION },
    },
  };
}

module.exports = {
  DocumentFormat,
  ArtifactKind,
  DocumentOutputFormatPreference,
  DEFAULT_PREVIEW_FORMAT,
  DEFAULT_CANONICAL_FORMAT,
  DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  SUPPORTED_CANONICAL_FORMATS,
  SUPPORTED_PREVIEW_FORMATS,
  SUPPORTED_INGEST_FORMATS,
  normalizeFormat,
  normalizeOutputFormatPreference,
  normalizeArtifactKind,
  normalizeStructureHints,
  chooseOutputFormats,
  normalizeIngestFormat,
  mimeToFormat,
  extensionToFormat,
  detectIngestFormat,
  resolveIngestionDocType,
  toIngestionDocType,
  formatToMime,
  formatToExtension,
  isPreviewFormat,
  isCanonicalFormat,
  isIngestibleFormat,
  getFormatGovernanceSnapshot,
};
