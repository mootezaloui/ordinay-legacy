"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function resolvePdftoppmCommand() {
  const explicit = process.env.PDFTOPPM_PATH;
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  return "pdftoppm";
}

function rasterizePdfToPng(filePath, options = {}) {
  const maxPages = Number.parseInt(process.env.DOCUMENT_OCR_PDF_MAX_PAGES || "5", 10);
  const dpi = Number.parseInt(process.env.DOCUMENT_OCR_PDF_DPI || "220", 10);
  const cmd = resolvePdftoppmCommand();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-raster-"));
  const outPrefix = path.join(tempDir, "page");

  const args = ["-f", "1", "-l", String(options.maxPages || maxPages), "-png", "-r", String(options.dpi || dpi), filePath, outPrefix];
  const result = spawnSync(cmd, args, {
    windowsHide: true,
    encoding: "utf8",
    timeout: Number.parseInt(process.env.DOCUMENT_OCR_PDF_RASTER_TIMEOUT_MS || "120000", 10),
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      return { images: [], error: "pdf_raster_engine_missing", tempDir };
    }
    return { images: [], error: `pdf_raster_failed:${result.error.message}`, tempDir };
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown_error").trim();
    return { images: [], error: `pdf_raster_failed:${detail}`, tempDir };
  }

  const images = fs
    .readdirSync(tempDir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(tempDir, name));

  if (!images.length) {
    return { images: [], error: "pdf_raster_no_pages", tempDir };
  }

  return { images, error: null, tempDir };
}

function cleanupRasterTempDir(tempDir) {
  if (!tempDir) return;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}

module.exports = {
  rasterizePdfToPng,
  cleanupRasterTempDir,
};
