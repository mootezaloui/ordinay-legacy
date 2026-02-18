"use strict";

const path = require("path");

function inferBasicEntities(text) {
  const entities = [];
  const dateMatches = String(text || "").match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g) || [];
  if (dateMatches.length) {
    entities.push({ type: "date", values: [...new Set(dateMatches)].slice(0, 10) });
  }
  const amountMatches =
    String(text || "").match(/\b\d+[\.,]?\d*\s?(?:TND|EUR|USD|MAD|DZD)\b/gi) || [];
  if (amountMatches.length) {
    entities.push({ type: "amount", values: [...new Set(amountMatches)].slice(0, 10) });
  }
  return entities;
}

function localVisualSummary(filePath, docType) {
  const name = path.basename(filePath || "file");
  if (docType === "image") {
    return `Image attachment analyzed locally (${name}). OCR text and file context were extracted.`;
  }
  if (docType === "pdf") {
    return `PDF analyzed locally (${name}). Extracted text and page context were merged.`;
  }
  if (docType === "xlsx") {
    return `Spreadsheet analyzed locally (${name}). Sheet rows were extracted for reasoning.`;
  }
  if (docType === "pptx") {
    return `Presentation analyzed locally (${name}). Slide text was extracted for reasoning.`;
  }
  return `Document analyzed locally (${name}).`;
}

async function runVisionInterpretation({ filePath, extractedText, docType }) {
  // TODO(offline-v1): Cloud vision path intentionally disabled.
  // Future re-enable must be behind an explicit compile-time/runtime flag.
  return {
    provider: "local",
    visualSummary: localVisualSummary(filePath, docType),
    keyEntities: inferBasicEntities(extractedText),
    riskFlags: extractedText ? [] : ["limited_text_signal"],
    confidence: extractedText ? 0.62 : 0.48,
    mode: "offline-local-only",
    error: null,
  };
}

module.exports = {
  runVisionInterpretation,
};

