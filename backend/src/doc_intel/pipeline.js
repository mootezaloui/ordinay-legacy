"use strict";

const fs = require("fs");
const path = require("path");
const {
  extractNativeText,
  normalizeText,
} = require("../services/documentIngestion/extractText.ts");
const { detectFileType } = require("./detectFileType");
const { extractEmbeddedPdfText, hasLowTextSignal } = require("./extractTextPdf");
const { getPdfPageCount, rasterizePdfPages } = require("./rasterizePdfPdfjs");
const { getDocumentIntelLimits, isMemoryOverThreshold } = require("./limits");
const { getOcrWorkerManager } = require("./ocrTesseractWorker/manager");
const { emitDocumentEvent } = require("./progressEvents");
const { buildArtifact } = require("./normalizeContext");
const { deriveContentHash, readCache, writeCache, deleteCache } = require("./cache");

const PIPELINE_VERSION = "offline-v2";
const OCR_MIN_LENGTH = Number.parseInt(process.env.DOCUMENT_OCR_MIN_LENGTH || "1", 10);
const SUBSTANTIVE_MIN_ALNUM = Number.parseInt(
  process.env.DOC_INTEL_SUBSTANTIVE_MIN_ALNUM || "12",
  10,
);
const SUBSTANTIVE_MIN_RATIO = Number.parseFloat(
  process.env.DOC_INTEL_SUBSTANTIVE_MIN_RATIO || "0.2",
);

function nowMs() {
  return Date.now();
}

function asFailure(reason, stage = "doc_intel") {
  return {
    status: "unreadable",
    text: null,
    source: null,
    failure_reason: reason,
    text_length: null,
    analysis_status: "failed",
    analysis_provider: "local",
    analysis_confidence: 0,
    analysis_version: PIPELINE_VERSION,
    artifact_json: JSON.stringify({
      extracted_text: "",
      visual_summary: "",
      key_entities: [],
      risk_flags: [reason],
      provenance: { stage, pipeline_version: PIPELINE_VERSION },
    }),
    failure_stage: stage,
    failure_detail: reason,
  };
}

function shouldReadable(text) {
  return String(text || "").trim().length >= OCR_MIN_LENGTH;
}

function countAlphaNumeric(text) {
  const matches = String(text || "").match(/[\p{L}\p{N}]/gu);
  return Array.isArray(matches) ? matches.length : 0;
}

function hasSubstantiveText(text) {
  const normalized = String(text || "").trim();
  if (!shouldReadable(normalized)) return false;
  const alnumCount = countAlphaNumeric(normalized);
  if (alnumCount < SUBSTANTIVE_MIN_ALNUM) return false;
  const ratio = alnumCount / Math.max(1, normalized.length);
  return ratio >= SUBSTANTIVE_MIN_RATIO;
}

function buildPageRange(totalPages, mode, limits, specificPages = []) {
  const hardCap = Math.max(1, limits.maxPagesHard);
  if (mode === "pages" && Array.isArray(specificPages) && specificPages.length > 0) {
    const filtered = specificPages
      .map((p) => Number(p))
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= totalPages)
      .slice(0, hardCap);
    return {
      pages: filtered,
      needsUserContinue: false,
      remainingPages: [],
    };
  }
  if (mode === "full") {
    const max = Math.min(totalPages, hardCap);
    const pages = Array.from({ length: max }, (_, i) => i + 1);
    const remainingPages = totalPages > max
      ? Array.from({ length: totalPages - max }, (_, i) => max + i + 1)
      : [];
    return {
      pages,
      needsUserContinue: remainingPages.length > 0,
      remainingPages,
    };
  }

  const autoMax = Math.max(1, limits.maxPagesAuto);
  const max = Math.min(totalPages, autoMax);
  const pages = Array.from({ length: max }, (_, i) => i + 1);
  const remainingPages = totalPages > max
    ? Array.from({ length: totalPages - max }, (_, i) => max + i + 1)
    : [];
  return {
    pages,
    needsUserContinue: remainingPages.length > 0,
    remainingPages,
  };
}

function stageStart(documentId, stage) {
  return { stage, startedAt: nowMs(), docId: documentId };
}

function stageEnd(documentId, stageCtx) {
  emitDocumentEvent(documentId, "stage_end", {
    stage: stageCtx.stage,
    elapsedMs: nowMs() - stageCtx.startedAt,
  });
}

function emitStageStart(documentId, stage) {
  emitDocumentEvent(documentId, "stage_start", {
    stage,
    docId: Number(documentId),
  });
  return stageStart(documentId, stage);
}

async function runDocumentIntel({
  documentId,
  filePath,
  mimeType,
  options = {},
  signal,
}) {
  const limits = getDocumentIntelLimits();
  const startedAt = nowMs();
  const docId = Number(documentId);
  const filename = path.basename(String(filePath || ""));
  const forceReprocess = options && options.force === true;
  const ocrManager = getOcrWorkerManager();
  ocrManager.clearDocumentCancel(docId);

  if (!filePath || !fs.existsSync(filePath)) {
    return asFailure("file_not_found", "detect_type");
  }

  let docType = "unknown";
  let nativeText = "";
  let textSource = null;
  let needsUserContinue = false;
  let remainingPages = [];
  const warnings = [];
  const limitations = [];
  const pages = [];

  try {
    const detectCtx = emitStageStart(docId, "detect_type");
    docType = detectFileType(filePath, mimeType);
    stageEnd(docId, detectCtx);
    if (docType === "unknown") {
      return asFailure("unsupported_type", "detect_type");
    }

    const optionsSignature = JSON.stringify({
      mode: options.mode || "auto",
      pages: Array.isArray(options.pages) ? options.pages : [],
      lang: options.lang || process.env.DOC_INTEL_DEFAULT_LANG || "eng",
      scale: options.renderScale || limits.renderScale,
    });
    const cacheCtx = emitStageStart(docId, "cache_lookup");
    const contentHash = deriveContentHash(filePath);
    const cached = forceReprocess
      ? null
      : readCache({
          contentHash,
          pipelineVersion: PIPELINE_VERSION,
          optionsSignature,
        });
    stageEnd(docId, cacheCtx);
    if (cached && cached.status === "readable") {
      emitDocumentEvent(docId, "result", {
        summary: cached,
        cache_hit: true,
      });
      return cached;
    }
    if (cached && cached.status !== "readable") {
      // Never reuse stale failure cache entries.
      try {
        deleteCache({ contentHash, pipelineVersion: PIPELINE_VERSION, optionsSignature });
      } catch {}
    }

    const extractCtx = emitStageStart(docId, "extract_embedded_text");
    if (docType === "pdf") {
      const pdfExtract = await extractEmbeddedPdfText(filePath, mimeType);
      nativeText = pdfExtract.text || "";
      const lowSignal = hasLowTextSignal(pdfExtract.signal, {});
      if (lowSignal) {
        warnings.push("low_text_signal");
      }
      // Fallback to legacy parser when embedded-text signal is weak or empty.
      if (!shouldReadable(nativeText) || lowSignal) {
        const legacy = extractNativeText(filePath, mimeType, "pdf");
        const legacyText = normalizeText(legacy.text || "").trim();
        if (legacyText.length > String(nativeText || "").trim().length) {
          nativeText = legacyText;
          warnings.push("native_pdf_fallback_used");
        }
      }
      if (hasSubstantiveText(nativeText)) {
        textSource = "native";
      }
    } else if (docType === "docx" || docType === "text") {
      const native = extractNativeText(filePath, mimeType, docType);
      nativeText = normalizeText(native.text || "").trim();
      if (shouldReadable(nativeText)) {
        textSource = "native";
      }
    }
    stageEnd(docId, extractCtx);

    const evalCtx = emitStageStart(docId, "evaluate_text_signal");
    const requiresOcr =
      docType === "image" ||
      (docType === "pdf" && !hasSubstantiveText(nativeText));
    stageEnd(docId, evalCtx);

    if (requiresOcr) {
      if (docType === "image") {
        const ocrCtx = emitStageStart(docId, "ocr_pages");
        const result = await ocrManager.executeOCR({
          documentId: docId,
          pageIndex: 1,
          imageBuffer: fs.readFileSync(filePath),
          lang: options.lang || process.env.DOC_INTEL_DEFAULT_LANG || "eng",
          timeoutMs: limits.workerTimeoutMs,
        });
        pages.push({
          pageIndex: 1,
          source: "ocr",
          extractedText: "",
          ocrText: result.text || "",
          confidence: Number.isFinite(result.confidence) ? result.confidence : 0,
          warnings: [],
        });
        nativeText = normalizeText(result.text || "").trim();
        textSource = "ocr";
        emitDocumentEvent(docId, "page_progress", {
          pageIndex: 1,
          totalPages: 1,
          stage: "ocr_pages",
          percent: 100,
        });
        stageEnd(docId, ocrCtx);
      } else if (docType === "pdf") {
        const totalPages = await getPdfPageCount(filePath);
        const range = buildPageRange(totalPages, options.mode || "auto", limits, options.pages);
        needsUserContinue = range.needsUserContinue;
        remainingPages = range.remainingPages;
        if (needsUserContinue) {
          emitDocumentEvent(docId, "warning", {
            code: "max_pages_auto_reached",
            message: "Processed first pages only. Continue OCR to process remaining pages.",
          });
        }

        const rasterCtx = emitStageStart(docId, "rasterize_pdf");
        const ocrCtx = emitStageStart(docId, "ocr_pages");
        const ocrParts = [];
        let processed = 0;
        for await (const page of rasterizePdfPages({
          filePath,
          pageNumbers: range.pages,
          scale: Number(options.renderScale || limits.renderScale),
        })) {
          if (signal?.aborted) throw new Error("cancelled_by_user");
          const mem = isMemoryOverThreshold(limits);
          if (mem.exceeded) {
            needsUserContinue = true;
            warnings.push("memory_guard_triggered");
            limitations.push("memory_guard_triggered");
            emitDocumentEvent(docId, "warning", {
              code: "memory_guard_triggered",
              message: `Memory threshold reached (${Math.round(mem.ratio * 100)}%). Stopping safely.`,
            });
            break;
          }
          const ocr = await ocrManager.executeOCR({
            documentId: docId,
            pageIndex: page.pageIndex,
            imageBuffer: page.pngBuffer,
            lang: options.lang || process.env.DOC_INTEL_DEFAULT_LANG || "eng",
            timeoutMs: limits.workerTimeoutMs,
          });
          const pageText = normalizeText(ocr.text || "").trim();
          if (pageText) ocrParts.push(pageText);
          pages.push({
            pageIndex: page.pageIndex,
            source: "ocr",
            extractedText: "",
            ocrText: pageText,
            confidence: Number.isFinite(ocr.confidence) ? ocr.confidence : 0,
            warnings: [],
          });
          processed += 1;
          emitDocumentEvent(docId, "page_progress", {
            pageIndex: processed,
            totalPages: range.pages.length,
            stage: "ocr_pages",
            percent: Math.round((processed / Math.max(1, range.pages.length)) * 100),
          });
        }
        stageEnd(docId, rasterCtx);
        stageEnd(docId, ocrCtx);
        const merged = normalizeText(ocrParts.join("\n\n")).trim();
        if (hasSubstantiveText(merged)) {
          nativeText = merged;
          textSource = "ocr+rasterized_pdf";
        } else if (pages.length > 0) {
          warnings.push("ocr_empty_all_pages");
        }
      }
    } else if (hasSubstantiveText(nativeText)) {
      pages.push({
        pageIndex: 1,
        source: "embedded_text",
        extractedText: nativeText,
        ocrText: "",
        confidence: 0.85,
        warnings: [],
      });
    }

    const mergeCtx = emitStageStart(docId, "merge_context");
    const combinedText = normalizeText(nativeText || "").trim();
    const readable = hasSubstantiveText(combinedText);
    const artifact = buildArtifact({
      docId,
      docType,
      combinedText,
      pages,
      warnings,
      limitations,
      provenance: {
        pipelineVersion: PIPELINE_VERSION,
        ocrEngine: "tesseract.js",
        pdfRasterizer: "pdfjs-dist",
        textSource: textSource || null,
      },
      processingStats: {
        elapsedMs: nowMs() - startedAt,
        pagesProcessed: pages.length,
        totalPages: pages.length + remainingPages.length,
        cacheHit: false,
      },
      needsUserContinue,
      remainingPages,
      filename,
    });
    stageEnd(docId, mergeCtx);

    const output = {
      status: readable ? "readable" : "unreadable",
      text: readable ? combinedText : null,
      source: readable ? textSource || "native" : null,
      failure_reason:
        readable
          ? null
          : pages.length > 0
            ? "ocr_empty_all_pages"
            : "no_extractable_text",
      text_length: readable ? combinedText.length : null,
      analysis_status: readable ? "completed" : "failed",
      analysis_provider: "local",
      analysis_confidence: readable ? 0.7 : 0.45,
      analysis_version: PIPELINE_VERSION,
      artifact_json: JSON.stringify(artifact),
      failure_stage: readable ? null : "ocr_pages",
      failure_detail:
        readable
          ? null
          : pages.length > 0
            ? "ocr_empty_all_pages"
            : "no_extractable_text",
    };
    if (output.status === "readable") {
      try {
        writeCache({
          contentHash,
          pipelineVersion: PIPELINE_VERSION,
          optionsSignature,
          context: output,
        });
      } catch {
        warnings.push("cache_write_failed");
      }
    }
    emitDocumentEvent(docId, "result", {
      summary: {
        status: output.status,
        needsUserContinue,
        pagesProcessed: pages.length,
        totalPages: pages.length + remainingPages.length,
      },
    });
    return output;
  } catch (error) {
    const code = String(error?.message || "doc_intel_failed");
    emitDocumentEvent(docId, "error", {
      code,
      message: code,
      recoverable: code !== "unsupported_type",
      details: { stage: "pipeline" },
    });
    return asFailure(code, "pipeline");
  }
}

module.exports = {
  runDocumentIntel,
  PIPELINE_VERSION,
  _internals: {
    buildPageRange,
    shouldReadable,
    hasSubstantiveText,
  },
};
