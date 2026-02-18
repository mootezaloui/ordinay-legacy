"use strict";

const { parentPort } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");

let tesseractWorker = null;
let initializedLangs = new Set();
let currentLang = null;

function resolveLangPath() {
  const candidates = [];
  const explicit = process.env.DOC_INTEL_TESSDATA_PATH;
  if (explicit) candidates.push(explicit);
  const assetsRoot = process.env.ORDINAY_DOC_INTEL_ASSETS_PATH || "";
  if (assetsRoot) {
    candidates.push(path.join(assetsRoot, "tessdata"));
  }
  candidates.push(path.join(__dirname, "..", "tessdata"));

  const existing = [];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) existing.push(candidate);
    } catch {}
  }
  return { existing, searched: candidates };
}

function hasLocalLangPack(langPath, lang) {
  if (!langPath) return false;
  const normalized = String(lang || "eng").trim() || "eng";
  const gz = path.join(langPath, `${normalized}.traineddata.gz`);
  const raw = path.join(langPath, `${normalized}.traineddata`);
  return fs.existsSync(gz) || fs.existsSync(raw);
}

function ensureLocalLangPackOrThrow(langPathInfo, lang) {
  const existing = Array.isArray(langPathInfo?.existing)
    ? langPathInfo.existing
    : [];
  const allowRemote = process.env.DOC_INTEL_ALLOW_REMOTE_LANG_DOWNLOAD === "true";
  for (const candidate of existing) {
    if (hasLocalLangPack(candidate, lang)) {
      return { langPath: candidate, available: true };
    }
  }
  if (allowRemote) {
    // Keep a best-effort local path for cache/tessdata writes.
    return { langPath: existing[0], available: false };
  }
  const searched = Array.isArray(langPathInfo?.searched) ? langPathInfo.searched : [];
  const detail = searched.length ? searched.join(" | ") : "none";
  throw new Error(`ocr_language_pack_missing:${lang}:searched=${detail}`);
}

async function ensureWorker() {
  if (tesseractWorker) return tesseractWorker;
  const langPathInfo = resolveLangPath();
  const resolved = ensureLocalLangPackOrThrow(langPathInfo, "eng");
  const options = {
    logger: () => {},
  };
  if (resolved.langPath) {
    options.langPath = resolved.langPath;
  }
  tesseractWorker = await createWorker("eng", 1, {
    ...options,
  });
  initializedLangs.add("eng");
  currentLang = "eng";
  return tesseractWorker;
}

async function ensureLang(lang) {
  const safeLang = String(lang || "eng").trim() || "eng";
  const langPathInfo = resolveLangPath();
  ensureLocalLangPackOrThrow(langPathInfo, safeLang);
  const worker = await ensureWorker();
  if (!initializedLangs.has(safeLang)) {
    await worker.reinitialize(safeLang);
    initializedLangs.add(safeLang);
    currentLang = safeLang;
    return;
  }
  if (currentLang !== safeLang) {
    await worker.reinitialize(safeLang);
    currentLang = safeLang;
  }
}

async function handleOcr(payload) {
  const {
    imageBuffer,
    lang = "eng",
    pageIndex = 1,
  } = payload || {};
  if (!imageBuffer) {
    return { ok: false, error: "ocr_missing_image_buffer", pageIndex };
  }
  await ensureLang(lang);
  const worker = await ensureWorker();
  const result = await worker.recognize(Buffer.from(imageBuffer));
  const text = String(result?.data?.text || "").trim();
  const confidenceRaw = Number(result?.data?.confidence || 0);
  const confidence = Math.max(0, Math.min(1, confidenceRaw / 100));
  return {
    ok: true,
    pageIndex,
    text,
    confidence,
  };
}

parentPort.on("message", async (message) => {
  const { id, type, payload } = message || {};
  if (!id) return;
  try {
    if (type === "ocr") {
      const result = await handleOcr(payload || {});
      parentPort.postMessage({ id, ok: true, result });
      return;
    }
    if (type === "shutdown") {
      if (tesseractWorker) {
        await tesseractWorker.terminate();
      }
      parentPort.postMessage({ id, ok: true, result: { ok: true } });
      return;
    }
    parentPort.postMessage({
      id,
      ok: false,
      error: `unsupported_worker_message:${String(type || "unknown")}`,
    });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: String(error?.message || "ocr_worker_error"),
    });
  }
});
