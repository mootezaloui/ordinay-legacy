"use strict";

const path = require("path");

const MIME_TO_TYPE = new Map([
  ["application/pdf", "pdf"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["text/plain", "text"],
  ["text/markdown", "text"],
  ["text/csv", "text"],
  ["application/json", "text"],
]);

const IMAGE_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

function detectFileType(filePath, mimeType) {
  const mime = String(mimeType || "").toLowerCase().trim();
  if (mime.startsWith("image/")) return "image";
  if (MIME_TO_TYPE.has(mime)) return MIME_TO_TYPE.get(mime);

  const ext = String(path.extname(filePath || "")).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (IMAGE_EXT.has(ext)) return "image";
  if ([".txt", ".md", ".csv", ".json", ".rtf"].includes(ext)) return "text";
  return "unknown";
}

module.exports = {
  detectFileType,
};

