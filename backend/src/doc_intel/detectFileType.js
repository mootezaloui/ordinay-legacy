"use strict";

const {
  detectIngestFormat,
  resolveIngestionDocType,
  isIngestibleFormat,
} = require("../domain/documentFormatGovernance");

function detectFileType(filePath, mimeType) {
  const normalized = detectIngestFormat({ filePath, mimeType });
  if (!isIngestibleFormat(normalized)) return "unknown";
  return resolveIngestionDocType({ format: normalized });
}

module.exports = {
  detectFileType,
};
