"use strict";

const fs = require("fs");

let pdfjs = null;
let canvasLib = null;
let initPromise = null;

async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  try {
    const esm = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs = esm && esm.default ? esm.default : esm;
    return pdfjs;
  } catch (firstError) {
    try {
      // Fallback for packaging variants that expose CJS legacy build.
      pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
      return pdfjs;
    } catch (secondError) {
      const detail = String(firstError?.message || secondError?.message || "missing");
      throw new Error(`doc_intel_dependency_missing:pdfjs_dist:${detail}`);
    }
  }
}

async function loadCanvas() {
  if (canvasLib) return canvasLib;
  try {
    canvasLib = require("@napi-rs/canvas");
    return canvasLib;
  } catch (error) {
    throw new Error(`doc_intel_dependency_missing:napi_rs_canvas:${String(error?.message || "missing")}`);
  }
}

async function lazyInit() {
  if (pdfjs && canvasLib) return;
  if (initPromise) return initPromise;
  initPromise = Promise.all([loadPdfJs(), loadCanvas()]).then(() => {});
  await initPromise;
}

async function getPdfPageCount(filePath) {
  await lazyInit();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableWorker: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  return pdf.numPages || 0;
}

async function* rasterizePdfPages({
  filePath,
  pageNumbers,
  scale = 2.0,
}) {
  await lazyInit();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableWorker: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages || 0;
  for (const pageNumber of pageNumbers) {
    if (pageNumber < 1 || pageNumber > totalPages) continue;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = canvasLib.createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "print",
    }).promise;
    const pngBuffer = canvas.toBuffer("image/png");
    page.cleanup();
    yield {
      pageIndex: pageNumber,
      totalPages,
      pngBuffer,
    };
  }
}

module.exports = {
  getPdfPageCount,
  rasterizePdfPages,
};
