"use strict";

const {
  extractNativeText,
  normalizeText,
} = require("../services/documentIngestion/extractText.ts");

let pdfjs = null;

async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  try {
    const esm = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs = esm && esm.default ? esm.default : esm;
    return pdfjs;
  } catch (firstError) {
    try {
      pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
      return pdfjs;
    } catch (secondError) {
      const detail = String(firstError?.message || secondError?.message || "missing");
      throw new Error(`doc_intel_dependency_missing:pdfjs_dist:${detail}`);
    }
  }
}

function tokenize(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function computeSignal(text) {
  const normalized = normalizeText(text || "").trim();
  const tokens = tokenize(normalized);
  return {
    text: normalized,
    charLength: normalized.length,
    tokenCount: tokens.length,
    tokenDensity: normalized.length > 0 ? tokens.length / normalized.length : 0,
  };
}

async function extractPdfTextWithPdfJs(filePath) {
  const lib = await loadPdfJs();
  const fs = require("fs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = lib.getDocument({
    data,
    useSystemFonts: true,
    disableWorker: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const total = Number(pdf?.numPages || 0);
  const maxPages = Math.max(
    1,
    Number.parseInt(process.env.DOC_INTEL_PDF_TEXT_MAX_PAGES || "50", 10),
  );
  const pagesToRead = Math.min(total, maxPages);
  const chunks = [];
  for (let i = 1; i <= pagesToRead; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = Array.isArray(textContent?.items) ? textContent.items : [];
    const pageText = items
      .map((item) => String(item?.str || "").trim())
      .filter(Boolean)
      .join(" ");
    if (pageText) chunks.push(pageText);
    page.cleanup();
  }
  return normalizeText(chunks.join("\n")).trim();
}

async function extractEmbeddedPdfText(filePath, mimeType) {
  let parsed = "";
  let error = null;
  try {
    parsed = await extractPdfTextWithPdfJs(filePath);
  } catch (pdfjsError) {
    error = String(pdfjsError?.message || "pdf_text_extract_failed");
  }
  if (!parsed) {
    const native = extractNativeText(filePath, mimeType, "pdf");
    parsed = normalizeText(native.text || "").trim();
    if (!error) error = native.error || null;
  }
  const signal = computeSignal(parsed || "");
  return {
    text: signal.text,
    error,
    signal,
  };
}

function hasLowTextSignal(signal, options = {}) {
  const thresholdLength = Number.parseInt(
    options.thresholdLength || process.env.DOC_INTEL_PDF_TEXT_THRESHOLD_LENGTH || "120",
    10,
  );
  const thresholdDensity = Number.parseFloat(
    options.thresholdDensity ||
      process.env.DOC_INTEL_PDF_TEXT_THRESHOLD_DENSITY ||
      "0.15",
  );
  if (!signal) return true;
  return signal.charLength < thresholdLength || signal.tokenDensity < thresholdDensity;
}

module.exports = {
  extractEmbeddedPdfText,
  hasLowTextSignal,
};
