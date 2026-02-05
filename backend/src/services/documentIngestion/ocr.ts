const { spawn } = require("child_process");

const DEFAULT_LANG = process.env.DOCUMENT_OCR_LANG || "eng";
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.DOCUMENT_OCR_TIMEOUT_MS || "120000",
  10,
);
const DEFAULT_PSM = process.env.DOCUMENT_OCR_PSM
  ? Number.parseInt(process.env.DOCUMENT_OCR_PSM, 10)
  : null;
const DEFAULT_OEM = process.env.DOCUMENT_OCR_OEM
  ? Number.parseInt(process.env.DOCUMENT_OCR_OEM, 10)
  : null;
const DEFAULT_DPI = process.env.DOCUMENT_OCR_DPI || "300";

function buildTesseractArgs(filePath, options) {
  const args = [filePath, "stdout"];
  const lang = options.lang || DEFAULT_LANG;
  if (lang) {
    args.push("-l", lang);
  }
  if (options.psm || DEFAULT_PSM) {
    args.push("--psm", String(options.psm || DEFAULT_PSM));
  }
  if (options.oem || DEFAULT_OEM) {
    args.push("--oem", String(options.oem || DEFAULT_OEM));
  }
  if (options.dpi || DEFAULT_DPI) {
    args.push("--dpi", String(options.dpi || DEFAULT_DPI));
  }
  return args;
}

function runOcr(filePath, options = {}) {
  if (!filePath) {
    return Promise.resolve({ text: "", error: "missing_file_path" });
  }

  const tesseractCmd =
    options.tesseractPath || process.env.TESSERACT_PATH || "tesseract";
  const args = buildTesseractArgs(filePath, options);
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(tesseractCmd, args, {
      windowsHide: true,
    });

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve({ text: "", error: "ocr_timeout" });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve({ text: "", error: `ocr_spawn_failed:${error.message}` });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (code !== 0) {
        const detail = stderr.trim() || `exit_${code}`;
        resolve({ text: "", error: `ocr_failed:${detail}` });
        return;
      }
      resolve({ text: stdout, error: null });
    });
  });
}

module.exports = {
  runOcr,
};
