const fs = require("fs");
const {
  detectDocumentType,
} = require("./extractText.ts");
const {
  isIngestibleFormat,
} = require("../../domain/documentFormatGovernance");
const { runDocumentIntel } = require("../../doc_intel/pipeline");
const { getOcrWorkerManager } = require("../../doc_intel/ocrTesseractWorker/manager");
const { emitDocumentEvent } = require("../../doc_intel/progressEvents");

const MAX_BYTES = Number.parseInt(
  process.env.DOCUMENT_INGESTION_MAX_BYTES || "25000000",
  10,
);
const OCR_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.DOCUMENT_OCR_CONCURRENCY || "1", 10),
);
const CACHE_LIMIT = Math.max(
  0,
  Number.parseInt(process.env.DOCUMENT_INGESTION_CACHE_SIZE || "50", 10),
);

const pendingJobs = [];
const activeJobs = new Map();
let queueScheduled = false;
const resultCache = new Map();

function buildResult({
  status,
  text,
  source,
  failureReason,
  analysisStatus = null,
  analysisProvider = null,
  analysisConfidence = null,
  analysisVersion = null,
  artifactJson = null,
  failureStage = null,
  failureDetail = null,
}) {
  const trimmed = String(text || "").trim();
  return {
    status,
    text: status === "readable" ? trimmed : null,
    source: status === "readable" ? source : null,
    failure_reason: status === "unreadable" ? failureReason || "unknown" : null,
    text_length: status === "readable" ? trimmed.length : null,
    analysis_status: analysisStatus,
    analysis_provider: analysisProvider,
    analysis_confidence:
      Number.isFinite(analysisConfidence) ? analysisConfidence : null,
    analysis_version: analysisVersion,
    artifact_json: artifactJson,
    failure_stage: failureStage,
    failure_detail: failureDetail,
  };
}

function buildFailure(reason) {
  return buildResult({
    status: "unreadable",
    text: null,
    source: null,
    failureReason: reason,
    analysisStatus: "failed",
    analysisProvider: "local",
    analysisConfidence: 0,
    analysisVersion: "v1",
    artifactJson: JSON.stringify({
      extracted_text: "",
      visual_summary: "",
      key_entities: [],
      risk_flags: [reason || "unknown"],
    }),
    failureStage: "native",
    failureDetail: reason || "unknown",
  });
}

function isSupportedType(type) {
  return isIngestibleFormat(type);
}

async function ingestDocument({ documentId, filePath, mimeType, options = {}, signal }) {
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

  const cacheKey = `${filePath}:${stats.size}:${stats.mtimeMs}`;
  const forceReprocess = options && options.force === true;
  const cached =
    !forceReprocess && CACHE_LIMIT && cacheKey
      ? resultCache.get(cacheKey) || null
      : null;
  if (cached) {
    return cached;
  }

  const full = await runDocumentIntel({
    documentId,
    filePath,
    mimeType,
    options,
    signal,
  });
  const result = buildResult({
    status: full.status,
    text: full.text,
    source: full.source,
    failureReason: full.failure_reason,
    analysisStatus: full.analysis_status,
    analysisProvider: full.analysis_provider,
    analysisConfidence: full.analysis_confidence,
    analysisVersion: full.analysis_version,
    artifactJson: full.artifact_json,
    failureStage: full.failure_stage,
    failureDetail: full.failure_detail,
  });
  if (CACHE_LIMIT && cacheKey && result && result.status === "readable") {
    if (resultCache.size >= CACHE_LIMIT) {
      const firstKey = resultCache.keys().next().value;
      if (firstKey) resultCache.delete(firstKey);
    }
    resultCache.set(cacheKey, result);
  }
  return result;
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

      const controller = new AbortController();
      activeJobs.set(job.documentId, { controller });
      emitDocumentEvent(job.documentId, "stage_start", {
        stage: "queued",
        docId: Number(job.documentId),
      });
      Promise.resolve()
        .then(() => ingestDocument({ ...job, signal: controller.signal }))
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

function cancelDocumentIngestion(documentId) {
  const id = Number(documentId);
  const active = activeJobs.get(id);
  if (active?.controller) {
    active.controller.abort();
  }
  const manager = getOcrWorkerManager();
  manager.cancelDocument(id);
  const pendingIndex = pendingJobs.findIndex((job) => Number(job.documentId) === id);
  if (pendingIndex >= 0) {
    pendingJobs.splice(pendingIndex, 1);
  }
  emitDocumentEvent(id, "error", {
    code: "cancelled_by_user",
    message: "Document analysis was cancelled by user.",
    recoverable: true,
    details: {},
  });
  return Boolean(active) || pendingIndex >= 0;
}

module.exports = {
  enqueueDocumentIngestion,
  cancelDocumentIngestion,
  ingestDocument,
  buildFailure,
};
