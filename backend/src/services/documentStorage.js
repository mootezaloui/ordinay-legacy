const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {
  formatToExtension,
  mimeToFormat,
} = require("../domain/documentFormatGovernance");

const MAX_BYTES = Number.parseInt(
  process.env.DOCUMENT_INGESTION_MAX_BYTES || "25000000",
  10,
);

function resolveUserDataPath() {
  if (process.env.ORDINAY_USER_DATA) {
    return process.env.ORDINAY_USER_DATA;
  }
  try {
    // When running inside Electron main process
    const electron = require("electron");
    const app = electron?.app || electron?.remote?.app;
    if (app && app.getPath) {
      return app.getPath("userData");
    }
  } catch {
    // ignore
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "Ordinay");
  }
  return path.join(os.homedir(), ".ordinay");
}

function getDocumentsRoot() {
  if (process.env.ORDINAY_DOCUMENTS_PATH) {
    return process.env.ORDINAY_DOCUMENTS_PATH;
  }
  return path.join(resolveUserDataPath(), "documents");
}

function isPathInside(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveManagedDocumentPath(filePath, { mustExist = false } = {}) {
  if (!filePath || typeof filePath !== "string") {
    return null;
  }

  const root = path.resolve(getDocumentsRoot());
  const candidate = path.resolve(filePath);
  const effectiveCandidate =
    fs.existsSync(candidate) ? fs.realpathSync.native(candidate) : candidate;
  const effectiveRoot = fs.existsSync(root) ? fs.realpathSync.native(root) : root;

  if (!isPathInside(effectiveRoot, effectiveCandidate)) {
    return null;
  }
  if (mustExist && !fs.existsSync(effectiveCandidate)) {
    return null;
  }
  return effectiveCandidate;
}

function ensureDocumentsRoot() {
  const root = getDocumentsRoot();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

function sanitizeExtension(ext) {
  if (!ext) return "";
  const safe = ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (safe.startsWith(".")) return safe;
  return safe ? `.${safe}` : "";
}

function extensionFromMime(mimeType) {
  const format = mimeToFormat(mimeType);
  const ext = formatToExtension(format);
  return ext ? `.${ext}` : "";
}

function decodeBase64Payload(payload) {
  if (!payload) return Buffer.alloc(0);
  const value = String(payload);
  const base64Index = value.indexOf("base64,");
  const clean = base64Index >= 0 ? value.slice(base64Index + 7) : value;
  return Buffer.from(clean, "base64");
}

function saveUploadedDocument({ originalName, mimeType, dataBase64 }) {
  if (!dataBase64) {
    const err = new Error("Missing file data");
    err.code = "missing_file_data";
    throw err;
  }

  const buffer = decodeBase64Payload(dataBase64);
  if (Number.isFinite(MAX_BYTES) && buffer.length > MAX_BYTES) {
    const err = new Error("File too large");
    err.code = "file_too_large";
    throw err;
  }

  const root = ensureDocumentsRoot();
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const ext =
    sanitizeExtension(path.extname(originalName || "")) ||
    extensionFromMime(mimeType) ||
    "";
  const filename = `${hash}${ext}`;
  const targetPath = path.join(root, filename);

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, buffer);
  }

  return {
    file_path: targetPath,
    original_filename: originalName || filename,
    mime_type: mimeType || null,
    size_bytes: buffer.length,
    filename,
  };
}

module.exports = {
  getDocumentsRoot,
  ensureDocumentsRoot,
  resolveManagedDocumentPath,
  saveUploadedDocument,
};
