const fs = require("fs");
const {
  detectDocumentType,
  extractNativeText,
  normalizeText,
} = require("./extractText");
const { runOcr } = require("./ocr");

const MAX_BYTES = Number.parseInt(
  process.env.DOCUMENT_INGESTION_MAX_BYTES || "25000000",
  10,
);
const NATIVE_MIN_LENGTH = Number.parseInt(
  process.env.DOCUMENT_TEXT_MIN_LENGTH || "40",
  10,
);
const OCR_MIN_LENGTH = Number.parseInt(
  process.env.DOCUMENT_OCR_MIN_LENGTH || "1",
  10,
);
const OCR_TIMEOUT_MS = Number.parseInt(
  process.env.DOCUMENT_OCR_TIMEOUT_MS || "120000",
  10,
);
const OCR_LANG = process.env.DOCUMENT_OCR_LANG || "eng";
const OCR_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.DOCUMENT_OCR_CONCURRENCY || "1", 10),
);
const CACHE_LIMIT = Math.max(
  0,
  Number.parseInt(process.env.DOCUMENT_INGESTION_CACHE_SIZE || "50", 10),
);

const pendingJobs = [];
const activeJobs = new Set();
let queueScheduled = false;
const resultCache = new Map();

function buildResult({ status, text, source, failureReason }) {
  const normalized = normalizeText(text || "");
  const trimmed = normalized.trim();
  return {
    status,
    text: status === "readable" ? trimmed : null,
    source: status === "readable" ? source : null,
    failure_reason: status === "unreadable" ? failureReason || "unknown" : null,
    text_length: status === "readable" ? trimmed.length : null,
  };
}

function buildFailure(reason) {
  return buildResult({
    status: "unreadable",
    text: null,
    source: null,
    failureReason: reason,
  });
}

function isSupportedType(type) {
  return ["pdf", "docx", "image", "text"].includes(type);
}

function buildCacheKey(filePath, stats) {
  if (!stats) return filePath;
  return `${filePath}:${stats.size}:${stats.mtimeMs}`;
}

function getCachedResult(cacheKey) {
  if (!CACHE_LIMIT || !cacheKey) return null;
  return resultCache.get(cacheKey) || null;
}

function setCachedResult(cacheKey, result) {
  if (!CACHE_LIMIT || !cacheKey || !result) return;
  if (resultCache.size >= CACHE_LIMIT) {
    const firstKey = resultCache.keys().next().value;
    if (firstKey) resultCache.delete(firstKey);
  }
  resultCache.set(cacheKey, result);
}

function shouldAcceptText(text, minLength) {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.length >= minLength;
}

async function ingestDocument({ filePath, mimeType }) {
  if (!filePath) return buildFailure("missing_file_path");

  if (!fs.existsSync(filePath)) {
    return buildFailure("file_not_found");
  }

  let stats = null;
  try {
    stats = fs.statSync(filePath);
  } catch {
    return buildFailure("file_stat_failed");
  }

  if (!stats.isFile()) {
    return buildFailure("not_a_file");
  }

  if (Number.isFinite(MAX_BYTES) && stats.size > MAX_BYTES) {
    return buildFailure("file_too_large");
  }

  const docType = detectDocumentType(filePath, mimeType);
  if (!isSupportedType(docType)) {
    return buildFailure("unsupported_type");
  }

  const cacheKey = buildCacheKey(filePath, stats);
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  if (["pdf", "docx", "text"].includes(docType)) {
    const nativeResult = extractNativeText(filePath, mimeType, docType);
    if (shouldAcceptText(nativeResult.text, NATIVE_MIN_LENGTH)) {
      const result = buildResult({
        status: "readable",
        text: nativeResult.text,
        source: "native",
        failureReason: null,
      });
      setCachedResult(cacheKey, result);
      return result;
    }

    if (docType !== "pdf") {
      return buildFailure(nativeResult.error || "no_extractable_text");
    }
  }

  if (["pdf", "image"].includes(docType)) {
    const ocrResult = await runOcr(filePath, {
      timeoutMs: OCR_TIMEOUT_MS,
      lang: OCR_LANG,
    });
    if (ocrResult.error) {
      return buildFailure(ocrResult.error);
    }
    const cleaned = normalizeText(ocrResult.text || "");
    if (shouldAcceptText(cleaned, OCR_MIN_LENGTH)) {
      const result = buildResult({
        status: "readable",
        text: cleaned,
        source: "ocr",
        failureReason: null,
      });
      setCachedResult(cacheKey, result);
      return result;
    }
    return buildFailure("ocr_empty");
  }

  return buildFailure("no_extractable_text");
}

function processQueue() {
  if (queueScheduled) return;
  queueScheduled = true;
  setImmediate(async () => {
    queueScheduled = false;
    while (activeJobs.size < OCR_CONCURRENCY && pendingJobs.length > 0) {
      const job = pendingJobs.shift();
      if (!job) continue;
      if (activeJobs.has(job.documentId)) continue;

      activeJobs.add(job.documentId);
      Promise.resolve()
        .then(() => ingestDocument(job))
        .then((result) => job.onComplete && job.onComplete(result))
        .catch((error) => {
          const failure = buildFailure(`ingestion_error:${error.message}`);
          if (job.onComplete) job.onComplete(failure);
        })
        .finally(() => {
          activeJobs.delete(job.documentId);
          processQueue();
        });
    }
  });
}

function enqueueDocumentIngestion(job) {
  if (!job || !job.documentId) return false;
  if (activeJobs.has(job.documentId)) return false;
  if (pendingJobs.some((item) => item.documentId === job.documentId)) return false;
  pendingJobs.push(job);
  processQueue();
  return true;
}

module.exports = {
  enqueueDocumentIngestion,
  ingestDocument,
  buildFailure,
};
