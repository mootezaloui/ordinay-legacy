"use strict";

const fs = require("fs");
const {
  detectDocumentType,
  extractNativeText,
  normalizeText,
} = require("../documentIngestion/extractText.ts");
const { runOcr } = require("../documentIngestion/ocr.ts");
const { rasterizePdfToPng, cleanupRasterTempDir } = require("./pdfRasterizer");
const { runVisionInterpretation } = require("./vision");

const NATIVE_MIN_LENGTH = Number.parseInt(process.env.DOCUMENT_TEXT_MIN_LENGTH || "40", 10);
const OCR_MIN_LENGTH = Number.parseInt(process.env.DOCUMENT_OCR_MIN_LENGTH || "1", 10);
const OCR_TIMEOUT_MS = Number.parseInt(process.env.DOCUMENT_OCR_TIMEOUT_MS || "120000", 10);
const OCR_LANG = process.env.DOCUMENT_OCR_LANG || "eng";

function shouldAcceptText(text, minLength) {
  const trimmed = String(text || "").trim();
  return trimmed.length >= minLength;
}

function classifyFailure(stage, reason) {
  if (!reason) return { failure_stage: null, failure_detail: null };
  return {
    failure_stage: stage,
    failure_detail: String(reason).slice(0, 1000),
  };
}

function buildUnreadable(reason, stage = "native") {
  return {
    status: "unreadable",
    text: null,
    source: null,
    failure_reason: reason || "unknown",
    text_length: null,
    analysis_status: "failed",
    analysis_provider: "local",
    analysis_confidence: 0,
    analysis_version: "v1",
    artifact_json: JSON.stringify({
      extracted_text: "",
      visual_summary: "",
      key_entities: [],
      risk_flags: [reason || "unknown"],
      provenance: { stage },
    }),
    ...classifyFailure(stage, reason),
  };
}

async function extractTextWithFallback({ filePath, mimeType, docType }) {
  const nativeTypes = ["pdf", "docx", "text", "xlsx", "pptx"];
  let extractedText = "";
  let source = null;
  let failureReason = null;

  if (nativeTypes.includes(docType)) {
    const native = extractNativeText(filePath, mimeType, docType);
    const cleaned = normalizeText(native.text || "").trim();
    if (shouldAcceptText(cleaned, NATIVE_MIN_LENGTH)) {
      return { text: cleaned, source: "native", failureReason: null, usedRasterizedPdf: false };
    }
    failureReason = native.error || "native_parse_failed";
    extractedText = cleaned;
    if (!["pdf"].includes(docType)) {
      return { text: extractedText, source: null, failureReason, usedRasterizedPdf: false };
    }
  }

  if (["image", "pdf"].includes(docType)) {
    if (docType === "pdf") {
      const direct = await runOcr(filePath, { timeoutMs: OCR_TIMEOUT_MS, lang: OCR_LANG });
      if (!direct.error) {
        const cleaned = normalizeText(direct.text || "").trim();
        if (shouldAcceptText(cleaned, OCR_MIN_LENGTH)) {
          return { text: cleaned, source: "ocr", failureReason: null, usedRasterizedPdf: false };
        }
      }

      const raster = rasterizePdfToPng(filePath, {});
      if (!raster.error && raster.images.length > 0) {
        const parts = [];
        for (const imagePath of raster.images) {
          const result = await runOcr(imagePath, { timeoutMs: OCR_TIMEOUT_MS, lang: OCR_LANG });
          if (!result.error && result.text) {
            parts.push(normalizeText(result.text));
          }
        }
        cleanupRasterTempDir(raster.tempDir);
        const merged = parts.join("\n\n").trim();
        if (shouldAcceptText(merged, OCR_MIN_LENGTH)) {
          return { text: merged, source: "ocr+rasterized_pdf", failureReason: null, usedRasterizedPdf: true };
        }
        return { text: extractedText, source: null, failureReason: "ocr_empty", usedRasterizedPdf: true };
      }
      cleanupRasterTempDir(raster.tempDir);
      return {
        text: extractedText,
        source: null,
        failureReason: raster.error || direct.error || failureReason || "ocr_failed",
        usedRasterizedPdf: false,
      };
    }

    const ocr = await runOcr(filePath, { timeoutMs: OCR_TIMEOUT_MS, lang: OCR_LANG });
    if (!ocr.error) {
      const cleaned = normalizeText(ocr.text || "").trim();
      if (shouldAcceptText(cleaned, OCR_MIN_LENGTH)) {
        return { text: cleaned, source: "ocr", failureReason: null, usedRasterizedPdf: false };
      }
      failureReason = "ocr_empty";
    } else {
      failureReason = ocr.error;
    }
  }

  return {
    text: extractedText,
    source,
    failureReason: failureReason || "unsupported_type",
    usedRasterizedPdf: false,
  };
}

async function understandDocument({ documentId, filePath, mimeType }) {
  if (!filePath) return buildUnreadable("missing_file_path", "native");
  if (!fs.existsSync(filePath)) return buildUnreadable("file_not_found", "native");

  const docType = detectDocumentType(filePath, mimeType);
  if (docType === "unknown") {
    return buildUnreadable("unsupported_type", "native");
  }

  const extraction = await extractTextWithFallback({ filePath, mimeType, docType });
  const extractedText = normalizeText(extraction.text || "").trim();

  const vision = await runVisionInterpretation({
    documentId,
    filePath,
    extractedText,
    docType,
  });

  const hasReadableText = shouldAcceptText(extractedText, OCR_MIN_LENGTH);
  const status = hasReadableText ? "readable" : "unreadable";

  const riskFlags = [];
  if (extraction.usedRasterizedPdf) riskFlags.push("pdf_rasterized_before_ocr");
  if (!hasReadableText) riskFlags.push(extraction.failureReason || "no_extractable_text");
  if (Array.isArray(vision.riskFlags)) riskFlags.push(...vision.riskFlags);

  const artifact = {
    extracted_text: hasReadableText ? extractedText : "",
    visual_summary: vision.visualSummary || "",
    key_entities: Array.isArray(vision.keyEntities) ? vision.keyEntities : [],
    risk_flags: [...new Set(riskFlags.filter(Boolean))],
    provenance: {
      doc_type: docType,
      text_source: extraction.source,
      vision_provider: vision.provider || "local",
      mode: vision.mode || "local-only",
    },
  };

  const confidence = Math.max(
    0,
    Math.min(
      1,
      hasReadableText
        ? Math.max(0.5, (vision.confidence || 0.6))
        : Math.min(0.49, vision.confidence || 0.45)
    )
  );

  return {
    status,
    text: hasReadableText ? extractedText : null,
    source: hasReadableText ? extraction.source || "native" : null,
    failure_reason: hasReadableText ? null : extraction.failureReason || "no_extractable_text",
    text_length: hasReadableText ? extractedText.length : null,
    analysis_status: status === "readable" ? "completed" : "failed",
    analysis_provider: vision.provider || "local",
    analysis_confidence: confidence,
    analysis_version: "v1",
    artifact_json: JSON.stringify(artifact),
    ...classifyFailure(hasReadableText ? null : "ocr", hasReadableText ? null : extraction.failureReason),
  };
}

module.exports = {
  understandDocument,
};
