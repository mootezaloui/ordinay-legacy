const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync, spawn } = require("child_process");

const LOG_PREFIX = "[Ollama]";

let _lastLoggedStatus = null;
let _hardwareProfileCache = null;
const _libraryVariantsCache = new Map();

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

// Only logs when the message differs from the last poll log — avoids flooding
function logOnChange(key, ...args) {
  const sig = key + ":" + args.join(" ");
  if (sig === _lastLoggedStatus) return;
  _lastLoggedStatus = sig;
  log(...args);
}

// ── Utility ────────────────────────────────────────────────

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeOllamaBaseUrl(value) {
  return normalizeBaseUrl(value)
    .replace(/\/v1$/i, "")
    .replace(/\/\/localhost([:\/]|$)/i, "//127.0.0.1$1");
}

function isLocalOllamaHost(baseUrl) {
  const normalized = normalizeOllamaBaseUrl(baseUrl);
  try {
    const parsed = new URL(normalized);
    const host = String(parsed.hostname || "").trim().toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return (
      normalized.includes("localhost") ||
      normalized.includes("127.0.0.1") ||
      normalized.includes("::1")
    );
  }
}

function getOllamaExecutableCandidates() {
  const candidates = [];
  const homeDir = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "";

  if (process.platform === "win32") {
    if (localAppData) {
      candidates.push(path.join(localAppData, "Programs", "Ollama", "ollama.exe"));
    }
    if (homeDir) {
      candidates.push(
        path.join(homeDir, "AppData", "Local", "Programs", "Ollama", "ollama.exe")
      );
    }
    if (programFiles) {
      candidates.push(path.join(programFiles, "Ollama", "ollama.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Ollama.app/Contents/MacOS/Ollama");
  } else {
    candidates.push("/usr/bin/ollama", "/usr/local/bin/ollama");
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function toNumberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function bytesToGb(bytes) {
  return Number((toNumberOrZero(bytes) / (1024 ** 3)).toFixed(1));
}

function parseModelSizeBillions(modelName) {
  const text = String(modelName || "").toLowerCase();
  const match = text.match(/(?:^|[:\-])(\d+(?:\.\d+)?)b(?:[^a-z0-9]|$)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function isAggregateErrorLike(error) {
  return (
    error &&
    (error.name === "AggregateError" ||
      String(error?.message || "").toLowerCase().includes("aggregateerror") ||
      Array.isArray(error?.errors))
  );
}

function flattenAggregateErrors(error) {
  const nested = Array.isArray(error?.errors) ? error.errors : [];
  if (nested.length === 0) return [error];
  return nested.filter(Boolean);
}

function detectWindowsGpus() {
  try {
    const probe = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 6000,
      },
    );

    if (probe.status !== 0 || !String(probe.stdout || "").trim()) {
      return [];
    }

    const parsed = JSON.parse(String(probe.stdout || "[]"));
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((row) => ({
        name: String(row?.Name || "").trim(),
        vram_gb: bytesToGb(row?.AdapterRAM || 0),
      }))
      .filter((gpu) => gpu.name || gpu.vram_gb > 0);
  } catch {
    return [];
  }
}

function getHardwareProfile() {
  const now = Date.now();
  if (_hardwareProfileCache && now - _hardwareProfileCache.at < 60_000) {
    return _hardwareProfileCache.profile;
  }

  const ramGb = bytesToGb(os.totalmem());
  const cpuCores = Array.isArray(os.cpus()) ? os.cpus().length : 0;
  const gpus = process.platform === "win32" ? detectWindowsGpus() : [];
  const gpuMaxVramGb = gpus.reduce((max, gpu) => Math.max(max, toNumberOrZero(gpu.vram_gb)), 0);

  const profile = {
    ram_gb: ramGb,
    cpu_cores: cpuCores,
    gpus,
    gpu_max_vram_gb: Number(gpuMaxVramGb.toFixed(1)),
  };

  _hardwareProfileCache = { at: now, profile };
  return profile;
}

function evaluateModelCompatibility(modelName, source, hardwareProfile) {
  if (source === "cloud") {
    return {
      level: "cloud",
      message: "Runs on Ollama Cloud; local hardware is not required.",
      estimated_min_ram_gb: null,
      estimated_min_vram_gb: null,
      param_b: null,
    };
  }

  const paramB = parseModelSizeBillions(modelName);
  if (paramB === null) {
    return {
      level: "unknown",
      message: "Unknown model size; compatibility estimate is unavailable.",
      estimated_min_ram_gb: null,
      estimated_min_vram_gb: null,
      param_b: null,
    };
  }

  // Conservative local heuristic for quantized Ollama models.
  const estimatedMinRamGb = Number(Math.max(6, paramB * 0.8).toFixed(1));
  const estimatedMinVramGb = Number(Math.max(4, paramB * 0.5).toFixed(1));
  const ramGb = toNumberOrZero(hardwareProfile?.ram_gb);
  const vramGb = toNumberOrZero(hardwareProfile?.gpu_max_vram_gb);

  let level = "good";
  let message = `Estimated minimum RAM ~${estimatedMinRamGb} GB.`;

  if (ramGb < estimatedMinRamGb * 0.7) {
    level = "unlikely";
    message = `Your RAM (${ramGb} GB) is likely too low for this model locally (est. ${estimatedMinRamGb} GB+).`;
  } else if (ramGb < estimatedMinRamGb) {
    level = "limited";
    message = `Model may run with reduced performance. RAM ${ramGb} GB vs estimated ${estimatedMinRamGb} GB.`;
  }

  if (vramGb > 0 && vramGb < estimatedMinVramGb * 0.6) {
    message += ` GPU VRAM (${vramGb} GB) may be insufficient for acceleration.`;
  }

  return {
    level,
    message,
    estimated_min_ram_gb: estimatedMinRamGb,
    estimated_min_vram_gb: estimatedMinVramGb,
    param_b: paramB,
  };
}

// ── Private helpers ────────────────────────────────────────

function tryWhereOllama() {
  if (process.platform !== "win32") return null;
  try {
    const whereProbe = spawnSync("where", ["ollama"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 4000,
    });
    if (whereProbe.status === 0) {
      const foundPath = String(whereProbe.stdout || "").trim().split(/\r?\n/)[0];
      if (foundPath) {
        log("Installed (where ollama →", foundPath, ")");
        return { installed: true, executable_path: foundPath };
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function probeOpenAiCompatibleEndpoint(baseUrl) {
  const endpoint = `${normalizeOllamaBaseUrl(baseUrl)}/v1/models`;
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return { reachable: false };
    }
    return { reachable: true };
  } catch {
    return { reachable: false };
  }
}

// ── 1. checkIfInstalled ────────────────────────────────────

function checkIfInstalled() {
  try {
    const diskCandidate = getOllamaExecutableCandidates().find((candidate) =>
      fs.existsSync(candidate)
    );

    const probe = spawnSync("ollama", ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 4000,
    });

    if (probe.error) {
      const whereResult = tryWhereOllama();
      if (whereResult) return whereResult;

      if (diskCandidate) {
        logOnChange("install", "Installed (found on disk:", diskCandidate, ")");
        return { installed: true, executable_path: diskCandidate };
      }
      logOnChange("install", "Not installed:", probe.error.message || String(probe.error));
      return {
        installed: false,
        error: probe.error.message || String(probe.error),
      };
    }

    if (probe.status === 0) {
      logOnChange("install", "Installed (ollama --version OK)");
      return { installed: true, executable_path: "ollama" };
    }

    const whereResult = tryWhereOllama();
    if (whereResult) return whereResult;

    if (diskCandidate) {
      logOnChange("install", "Installed (found on disk:", diskCandidate, ")");
      return { installed: true, executable_path: diskCandidate };
    }

    const stderr = String(probe.stderr || probe.stdout || "").trim();
    logOnChange("install", "Not installed:", stderr || `exit code ${probe.status}`);
    return {
      installed: false,
      error: stderr || `ollama --version exited with code ${String(probe.status)}`,
    };
  } catch (error) {
    logOnChange("install", "Installation check error:", error?.message);
    return {
      installed: false,
      error: error?.message || String(error || "Unknown error"),
    };
  }
}

// ── 2. checkIfRunning ──────────────────────────────────────

async function checkIfRunning(baseUrl) {
  const normalized = normalizeOllamaBaseUrl(baseUrl);
  const endpoint = `${normalized}/api/tags`;

  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(endpoint);
    } catch {
      return resolve({
        running: false,
        status: "not_running",
        models: [],
        error: "Invalid Ollama URL.",
      });
    }

    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || 11434,
        path: parsed.pathname + parsed.search,
        timeout: 4000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", async () => {
          if (res.statusCode === 404) {
            const openAiProbe = await probeOpenAiCompatibleEndpoint(normalized);
            if (openAiProbe.reachable) {
              return resolve({
                running: false,
                status: "api_mismatch",
                models: [],
                error:
                  "Endpoint is reachable but does not expose Ollama API. It looks like a non-Ollama server.",
              });
            }
            return resolve({
              running: false,
              status: "not_running",
              models: [],
              error:
                body && body.length < 250
                  ? body
                  : `Ollama endpoint returned HTTP ${res.statusCode}`,
            });
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return resolve({
              running: false,
              status: "not_running",
              models: [],
              error:
                body && body.length < 250
                  ? body
                  : `Ollama endpoint returned HTTP ${res.statusCode}`,
            });
          }

          let payload = {};
          try {
            payload = JSON.parse(body);
          } catch {}
          const models = Array.isArray(payload?.models) ? payload.models : [];
          const names = models
            .map((entry) => String(entry?.name || entry?.model || "").trim())
            .filter(Boolean);

          logOnChange("runtime", "Running, models:", names.length);
          resolve({
            running: true,
            status: names.length > 0 ? "ready" : "running_no_models",
            models: names,
          });
        });
      },
    );

    req.on("error", (error) => {
      if (isAggregateErrorLike(error)) {
        const nested = flattenAggregateErrors(error);
        const nestedCodes = nested
          .map((item) => String(item?.code || "").trim().toUpperCase())
          .filter(Boolean);
        const nestedMessages = nested
          .map((item) => String(item?.message || "").trim())
          .filter(Boolean);

        if (nestedCodes.includes("ECONNREFUSED")) {
          return resolve({
            running: false,
            status: "not_running",
            models: [],
            error: "Ollama is not running.",
          });
        }

        if (nestedCodes.includes("ENOTFOUND")) {
          return resolve({
            running: false,
            status: "not_running",
            models: [],
            error: "Host not found. Check Ollama URL.",
          });
        }

        return resolve({
          running: false,
          status: "not_running",
          models: [],
          error:
            nestedMessages[0] ||
            error?.message ||
            "Failed to contact Ollama endpoint (network aggregate error).",
        });
      }

      if (error?.code === "ECONNREFUSED") {
        return resolve({
          running: false,
          status: "not_running",
          models: [],
          error: "Ollama is not running.",
        });
      }
      if (error?.code === "ENOTFOUND") {
        return resolve({
          running: false,
          status: "not_running",
          models: [],
          error: "Host not found. Check Ollama URL.",
        });
      }
      resolve({
        running: false,
        status: "not_running",
        models: [],
        error: error?.message || String(error || "Unknown runtime error"),
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        running: false,
        status: "not_running",
        models: [],
        error: "Connection timed out while contacting Ollama.",
      });
    });
  });
}

// ── 3. tryStartOllama ──────────────────────────────────────

function getOllamaDesktopAppPath() {
  // On Windows, the desktop/tray app is "ollama app.exe" (with space) —
  // distinct from "ollama.exe" (the CLI).
  if (process.platform !== "win32") return null;
  const localAppData = process.env.LOCALAPPDATA || "";
  const homeDir = os.homedir();
  const candidates = [];
  if (localAppData) {
    candidates.push(path.join(localAppData, "Programs", "Ollama", "ollama app.exe"));
  }
  if (homeDir) {
    candidates.push(path.join(homeDir, "AppData", "Local", "Programs", "Ollama", "ollama app.exe"));
  }
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function tryStartOllama() {
  log("Attempting to start");
  const installedProbe = checkIfInstalled();
  const attempts = [];

  // Strategy 1 — `ollama serve` (headless, works on all platforms)
  if (installedProbe.executable_path) {
    const cmd = installedProbe.executable_path !== "ollama"
      ? installedProbe.executable_path
      : "ollama";
    attempts.push({ command: cmd, args: ["serve"], launched: "serve" });
  }

  // Strategy 2 (Windows) — Fallback: launch "ollama app.exe" desktop/tray app
  if (process.platform === "win32") {
    const desktopApp = getOllamaDesktopAppPath();
    if (desktopApp) {
      attempts.push({ command: desktopApp, args: [], launched: "desktop" });
    }
  }

  // Strategy 3 (macOS) — Fallback: launch Ollama.app
  if (process.platform === "darwin") {
    const macApp = "/Applications/Ollama.app/Contents/MacOS/Ollama";
    if (fs.existsSync(macApp)) {
      attempts.push({ command: macApp, args: [], launched: "desktop" });
    }
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const child = spawn(attempt.command, attempt.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      log("Launched via", attempt.launched, "(command:", attempt.command, attempt.args.join(" "), ")");
      return { ok: true, launched: attempt.launched };
    } catch (error) {
      lastError = error?.message || String(error || "Unknown spawn error");
      log("Attempt failed:", attempt.command, attempt.args.join(" "), "—", lastError);
    }
  }

  if (!installedProbe.installed) {
    log("Failed to start — not installed");
    return {
      ok: false,
      not_installed: true,
      error:
        installedProbe.error ||
        "Ollama app was not found. Install Ollama first, then try again.",
    };
  }

  log("Failed to start:", lastError);
  return {
    ok: false,
    error: lastError || "Failed to launch ollama command",
  };
}

// ── 4. waitUntilReady ──────────────────────────────────────

async function waitUntilReady(baseUrl, { intervalMs = 1000, timeoutMs = 15000 } = {}) {
  log("Waiting for readiness (timeout:", timeoutMs + "ms)");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const probe = await checkIfRunning(baseUrl);
    if (probe.running) {
      const elapsed = Date.now() - start;
      log("Ready after", elapsed + "ms");
      return { ready: true, elapsed_ms: elapsed, models: probe.models, status: probe.status };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const elapsed = Date.now() - start;
  log("Failed to become ready within", timeoutMs + "ms");
  return { ready: false, elapsed_ms: elapsed, models: [], status: "not_running" };
}

// ── 5. getModels ───────────────────────────────────────────

async function getModels(baseUrl) {
  log("Fetching models");
  const probe = await checkIfRunning(baseUrl);
  if (!probe.running) {
    return { ok: false, models: [], error: probe.error || "Ollama is not running" };
  }
  return { ok: true, models: probe.models };
}

function decodeHtmlText(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

function extractCloudModelNamesFromSearchHtml(html) {
  const text = String(html || "");
  const matches = text.matchAll(/x-test-search-response-title[^>]*>([^<]+)</gi);
  const names = [];
  for (const match of matches) {
    const decoded = decodeHtmlText(match?.[1] || "");
    if (decoded) names.push(decoded);
  }
  return names;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Known capability tags emitted by Ollama library pages.
 * Size-like tags (e.g. "8b", "26b") are variant shortcuts, not capabilities.
 */
const KNOWN_CAPABILITY_TAGS = new Set([
  "vision", "tools", "thinking", "audio", "cloud", "code", "embedding",
]);

function isCapabilityTag(tag) {
  return KNOWN_CAPABILITY_TAGS.has(String(tag || "").trim().toLowerCase());
}

/**
 * Parse variant metadata from an Ollama library page HTML.
 *
 * Ollama uses two layouts per variant row:
 *
 * 1) Mobile: <p class="flex text-neutral-500">6.6GB · 256K context window · Text, Image · ...</p>
 *    Appears inside an <a href="/library/model:tag"> block with class "sm:hidden".
 *
 * 2) Desktop: CSS grid row (<div class="sm:grid sm:grid-cols-12">) with:
 *    - <a href="/library/model:tag"> for the name (col-span-6)
 *    - <p class="col-span-2 text-neutral-500"> for size, context, input (3 cells)
 *
 * We parse the mobile layout as it's simpler and always present.
 * Format: "{size} · {context} context window · {input} · {date}"
 *
 * Returns an array of { name, size_label, context_length, input_modalities }.
 */
function parseVariantTableFromHtml(html, baseModelName) {
  const rows = [];
  const base = String(baseModelName || "").trim().toLowerCase();
  if (!html || !base) return rows;
  const seen = new Set();

  // Strategy 1: Parse the mobile summary lines.
  // Each variant has: <a href="/library/base:tag" class="sm:hidden ...">
  //   <p ...>name</p>
  //   <p class="flex text-neutral-500">6.6GB · 256K context window · Text, Image · 1 month ago</p>
  // </a>
  const mobileBlockPattern = new RegExp(
    `<a\\s[^>]*href=["']/library/${escapeRegex(base)}:([a-z0-9._-]+)["'][^>]*class=["'][^"']*sm:hidden[^"']*["'][^>]*>[\\s\\S]*?</a>`,
    "gi",
  );

  for (const blockMatch of html.matchAll(mobileBlockPattern)) {
    const tag = String(blockMatch[1] || "").trim().toLowerCase();
    const variantName = `${base}:${tag}`;
    if (seen.has(variantName)) continue;
    seen.add(variantName);

    const blockHtml = blockMatch[0] || "";
    // Find the summary line: "6.6GB · 256K context window · Text, Image · ..."
    // Must target text-neutral-500 specifically (not text-neutral-800 which is the name)
    const summaryMatch = blockHtml.match(/<p[^>]*text-neutral-500[^>]*>([^<]+)/i);
    const summaryText = String(summaryMatch?.[1] || "").trim();
    const parts = summaryText.split("·").map((s) => s.trim());

    // Normal: parts[0]=size, parts[1]=context, parts[2]=input
    // Cloud (no size): parts[0]=context, parts[1]=input
    let sizeRaw, contextRaw, inputRaw;
    if (/context\s*window/i.test(parts[0] || "")) {
      sizeRaw = "";
      contextRaw = String(parts[0] || "").replace(/\s*context\s*window\s*/i, "").trim();
      inputRaw = String(parts[1] || "").trim();
    } else {
      sizeRaw = String(parts[0] || "").trim();
      contextRaw = String(parts[1] || "").replace(/\s*context\s*window\s*/i, "").trim();
      inputRaw = String(parts[2] || "").trim();
    }

    rows.push({
      name: variantName,
      size_label: sizeRaw && sizeRaw !== "—" && sizeRaw !== "-" ? sizeRaw : null,
      context_length: contextRaw || null,
      input_modalities: inputRaw || null,
    });
  }

  if (rows.length > 0) return rows;

  // Strategy 2: Parse desktop grid rows if mobile blocks weren't found.
  // Desktop rows: <div class="... sm:grid sm:grid-cols-12 ...">
  //   <span class="col-span-6"><a href="/library/base:tag">...</a></span>
  //   <p class="col-span-2 text-neutral-500">6.6GB</p>
  //   <p class="col-span-2 text-neutral-500">256K</p>
  //   <p class="col-span-2 text-neutral-500">Text, Image</p>
  // </div>
  const desktopRowPattern = new RegExp(
    `<div[^>]*sm:grid[^>]*>[\\s\\S]*?href=["']/library/${escapeRegex(base)}:([a-z0-9._-]+)["'][\\s\\S]*?</div>\\s*</div>`,
    "gi",
  );
  const colSpanPattern = /<p[^>]*col-span-2[^>]*>([\s\S]*?)<\/p>/gi;

  for (const rowMatch of html.matchAll(desktopRowPattern)) {
    const tag = String(rowMatch[1] || "").trim().toLowerCase();
    const variantName = `${base}:${tag}`;
    if (seen.has(variantName)) continue;
    seen.add(variantName);

    const rowHtml = rowMatch[0] || "";
    const cells = [];
    for (const cellMatch of rowHtml.matchAll(colSpanPattern)) {
      const cellText = String(cellMatch[1] || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      cells.push(cellText);
    }

    const sizeRaw = String(cells[0] || "").trim();
    const contextRaw = String(cells[1] || "").trim();
    const inputRaw = String(cells[2] || "").trim();

    rows.push({
      name: variantName,
      size_label: sizeRaw && sizeRaw !== "—" && sizeRaw !== "-" ? sizeRaw : null,
      context_length: contextRaw || null,
      input_modalities: inputRaw || null,
    });
  }

  return rows;
}

/**
 * Extract capability tags from an Ollama library page.
 * Tags like "vision tools thinking audio cloud" appear as text tokens
 * in the page body before the variant table.
 */
function parseCapabilityTagsFromHtml(html) {
  const capabilities = [];
  if (!html) return capabilities;

  // Capability tags appear as space-separated tokens in the page.
  // We look for sequences of known capability words.
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

  const seen = new Set();
  for (const tag of KNOWN_CAPABILITY_TAGS) {
    // Match as a standalone word in the page text
    const pattern = new RegExp(`\\b${escapeRegex(tag)}\\b`, "i");
    if (pattern.test(text) && !seen.has(tag)) {
      seen.add(tag);
      capabilities.push(tag);
    }
  }

  return capabilities;
}

async function fetchLibraryVariants(baseModelName) {
  const base = String(baseModelName || "").trim().toLowerCase();
  if (!base || base.includes(":")) return { variants: [], capabilities: [] };

  const cached = _libraryVariantsCache.get(base);
  const now = Date.now();
  if (cached && now - cached.at < 15 * 60 * 1000) {
    return {
      variants: Array.isArray(cached.variants) ? cached.variants : [],
      capabilities: Array.isArray(cached.capabilities) ? cached.capabilities : [],
    };
  }

  const url = `https://ollama.com/library/${encodeURIComponent(base)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);

  if (!response || !response.ok) {
    _libraryVariantsCache.set(base, { at: now, variants: [], capabilities: [] });
    return { variants: [], capabilities: [] };
  }

  const html = await response.text().catch(() => "");
  if (!html) {
    _libraryVariantsCache.set(base, { at: now, variants: [], capabilities: [] });
    return { variants: [], capabilities: [] };
  }

  const capabilities = parseCapabilityTagsFromHtml(html);
  const tableVariants = parseVariantTableFromHtml(html, base);

  // If table parsing yielded results, use structured data.
  // Otherwise fall back to regex name extraction for backward compat.
  let variants;
  if (tableVariants.length > 0) {
    variants = tableVariants;
  } else {
    // Strict fallback: only trust explicit library links, not free-text regex,
    // to avoid synthetic/invalid tags from unrelated page text.
    const linkPattern = new RegExp(`/library/${escapeRegex(base)}:([a-z0-9._-]+)`, "gi");
    const names = Array.from(
      new Set(
        Array.from(html.matchAll(linkPattern))
          .map((m) => `${base}:${String(m?.[1] || "").trim().toLowerCase()}`)
          .filter(Boolean),
      ),
    );
    variants = names.map((name) => ({
      name,
      size_label: null,
      context_length: null,
      input_modalities: null,
    }));
  }

  _libraryVariantsCache.set(base, { at: now, variants, capabilities });
  return { variants, capabilities };
}

async function expandCloudModelNamesToVariants(names, { maxFetches = 12 } = {}) {
  const input = Array.isArray(names) ? names : [];
  const direct = [];
  const basesToResolve = [];

  for (const nameRaw of input) {
    const name = String(nameRaw || "").trim().toLowerCase();
    if (!name) continue;
    if (name.includes(":")) {
      direct.push({ name, size_label: null, context_length: null, input_modalities: null, capabilities: [] });
      continue;
    }
    basesToResolve.push(name);
  }

  const resolved = [...direct];
  const seen = new Set(resolved.map((v) => v.name));
  const cap = Number.isFinite(Number(maxFetches))
    ? Math.min(Math.max(Number(maxFetches), 0), 30)
    : 12;

  for (let i = 0; i < basesToResolve.length; i += 1) {
    const base = basesToResolve[i];
    let libraryResult = { variants: [], capabilities: [] };
    if (i < cap) {
      libraryResult = await fetchLibraryVariants(base);
    }
    let variants = Array.isArray(libraryResult.variants) ? libraryResult.variants : [];
    const capabilities = Array.isArray(libraryResult.capabilities) ? libraryResult.capabilities : [];
    // If variants cannot be fetched, keep a concrete best-effort default.
    if (variants.length === 0) {
      variants = [{ name: `${base}:latest`, size_label: null, context_length: null, input_modalities: null }];
    }
    for (const variant of variants) {
      const variantName = String(typeof variant === "string" ? variant : variant?.name || "").trim().toLowerCase();
      if (!variantName || seen.has(variantName)) continue;
      seen.add(variantName);
      resolved.push({
        name: variantName,
        size_label: variant?.size_label || null,
        context_length: variant?.context_length || null,
        input_modalities: variant?.input_modalities || null,
        capabilities,
      });
    }
  }

  return resolved;
}

async function fetchCloudModelsFromSearch({ query = "", maxPages = 12, maxModels = 300 } = {}) {
  const pagesLimit = Number.isFinite(Number(maxPages))
    ? Math.min(Math.max(Number(maxPages), 1), 20)
    : 12;
  const modelsLimit = Number.isFinite(Number(maxModels))
    ? Math.min(Math.max(Number(maxModels), 1), 1000)
    : 300;
  const names = [];

  for (let page = 1; page <= pagesLimit; page += 1) {
    const params = new URLSearchParams();
    params.set("c", "cloud");
    params.set("page", String(page));
    if (query) params.set("q", query);
    const url = `https://ollama.com/search?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    }).catch(() => null);

    if (!response || !response.ok) break;
    const html = await response.text().catch(() => "");
    if (!html) break;

    const pageNames = extractCloudModelNamesFromSearchHtml(html);
    if (pageNames.length === 0) break;
    if (pageNames.length > 0) names.push(...pageNames);
    if (names.length >= modelsLimit) break;
  }

  return Array.from(new Set(names.map((name) => String(name || "").trim()).filter(Boolean)));
}

// ── 6. getCatalogModels (remote library) ──────────────────

async function getCatalogModels({ query = "", limit = 80, installedModels = [] } = {}) {
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 200)
    : 80;

  try {
    const response = await fetch("https://ollama.com/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: `Failed to fetch Ollama catalog (HTTP ${response.status})`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    const rows = Array.isArray(payload?.models) ? payload.models : [];
    const names = rows
      .map((row) => String(row?.name || row?.model || "").trim())
      .filter(Boolean);

    const normalizedQuery = String(query || "").trim().toLowerCase();
    const filtered = normalizedQuery
      ? names.filter((name) => name.toLowerCase().includes(normalizedQuery))
      : names;

    const deduped = Array.from(new Set(filtered));
    const hardware = getHardwareProfile();
    const installedSet = new Set(
      (Array.isArray(installedModels) ? installedModels : [])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    );

    // Enrich local catalog entries with library variant data.
    // The API returns base names (e.g. "gemma4"); we fetch their library page
    // to get per-variant metadata (size, context, modalities, capabilities).
    const localBaseNames = deduped
      .map((n) => String(n || "").split(":")[0].trim().toLowerCase())
      .filter(Boolean);
    const uniqueLocalBases = Array.from(new Set(localBaseNames));
    const localLibraryData = new Map();
    const localFetchCap = Math.min(uniqueLocalBases.length, normalizedQuery ? 20 : 8);
    for (let i = 0; i < localFetchCap; i += 1) {
      const base = uniqueLocalBases[i];
      const libraryResult = await fetchLibraryVariants(base);
      if (libraryResult.variants.length > 0 || libraryResult.capabilities.length > 0) {
        localLibraryData.set(base, libraryResult);
      }
    }

    const localEntries = [];
    for (const name of deduped) {
      const baseName = String(name || "").split(":")[0].trim().toLowerCase();
      const libraryInfo = localLibraryData.get(baseName);
      if (libraryInfo && libraryInfo.variants.length > 0) {
        // Expand to individual variants instead of just the base name
        for (const variant of libraryInfo.variants) {
          const variantName = String(variant?.name || "").trim();
          if (!variantName) continue;
          localEntries.push({
            name: variantName,
            source: /-cloud$/i.test(variantName) ? "cloud" : "local",
            downloadable: !/-cloud$/i.test(variantName),
            installed: installedSet.has(variantName.toLowerCase()),
            size_label: variant?.size_label || null,
            context_length: variant?.context_length || null,
            input_modalities: variant?.input_modalities || null,
            capabilities: libraryInfo.capabilities || [],
          });
        }
      } else {
        localEntries.push({
          name,
          source: "local",
          downloadable: true,
          installed: installedSet.has(String(name).toLowerCase()),
          size_label: null,
          context_length: null,
          input_modalities: null,
          capabilities: [],
        });
      }
    }

    const cloudDynamicBase = await fetchCloudModelsFromSearch({
      query: normalizedQuery,
      maxPages: Math.ceil(safeLimit / 20) + 4,
      maxModels: safeLimit * 2,
    });
    const cloudDynamicVariants = await expandCloudModelNamesToVariants(cloudDynamicBase, {
      maxFetches: normalizedQuery ? 20 : 12,
    });
    const cloudEntries = cloudDynamicVariants.map((variant) => {
      const name = String(variant?.name || "").trim();
      const isCloudVariant = /-cloud$/i.test(name);
      return {
        name,
        source: isCloudVariant ? "cloud" : "local",
        downloadable: !isCloudVariant,
        installed: installedSet.has(name.toLowerCase()),
        size_label: variant?.size_label || null,
        context_length: variant?.context_length || null,
        input_modalities: variant?.input_modalities || null,
        capabilities: Array.isArray(variant?.capabilities) ? variant.capabilities : [],
      };
    });

    const mergedByName = new Map();
    for (const entry of [...localEntries, ...cloudEntries]) {
      if (!entry.name) continue;
      const key = entry.name.toLowerCase();
      if (!mergedByName.has(key)) {
        mergedByName.set(key, entry);
      } else {
        const prev = mergedByName.get(key);
        mergedByName.set(key, {
          ...prev,
          downloadable: prev.downloadable || entry.downloadable,
          installed: prev.installed || entry.installed,
          // Prefer local when available so UI keeps download/install flow.
          source: prev.source === "local" || entry.source === "local" ? "local" : "cloud",
          // Preserve richer metadata from cloud variant entries
          size_label: prev.size_label || entry.size_label || null,
          context_length: prev.context_length || entry.context_length || null,
          input_modalities: prev.input_modalities || entry.input_modalities || null,
          capabilities: (prev.capabilities && prev.capabilities.length > 0)
            ? prev.capabilities
            : (entry.capabilities || []),
        });
      }
    }

    const queryFiltered = Array.from(mergedByName.values()).filter((entry) =>
      entry.name.toLowerCase().includes(normalizedQuery),
    );

    const withCompatibility = queryFiltered.map((entry) => ({
      ...entry,
      compatibility: evaluateModelCompatibility(entry.name, entry.source, hardware),
    }));

    withCompatibility.sort((a, b) => {
      if (a.installed !== b.installed) return a.installed ? -1 : 1;
      if (a.source !== b.source) return a.source === "local" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      ok: true,
      models: withCompatibility.slice(0, safeLimit),
      hardware,
    };
  } catch (error) {
    return {
      ok: false,
      models: [],
      error: error?.message || String(error || "Failed to fetch Ollama catalog"),
      hardware: getHardwareProfile(),
    };
  }
}

// ── 7. pullModel (local runtime pull with progress callback) ───────────────

async function pullModel(baseUrl, model, onProgress) {
  const normalizedBase = normalizeOllamaBaseUrl(baseUrl || "http://127.0.0.1:11434");
  const modelName = String(model || "").trim();
  if (!modelName) {
    return { ok: false, error: "model is required" };
  }

  const response = await fetch(`${normalizedBase}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, stream: true }),
    signal: AbortSignal.timeout(1000 * 60 * 60), // up to 1h for large pulls
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    const err = response?._fetchError;
    return {
      ok: false,
      error: err?.message || String(err || "Failed to connect to Ollama runtime"),
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: body || `Ollama pull failed (HTTP ${response.status})`,
    };
  }

  if (!response.body) {
    return { ok: false, error: "Ollama pull stream was empty" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;
  let lastStatus = "pulling";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!trimmed) continue;

      let row = null;
      try {
        row = JSON.parse(trimmed);
      } catch {
        row = null;
      }
      if (!row || typeof row !== "object") continue;

      const status = String(row.status || "").trim();
      const total = Number(row.total || 0);
      const completed = Number(row.completed || 0);
      const digest = String(row.digest || "").trim();
      const errorMessage = String(row.error || "").trim();
      const rowDone = row.done === true;

      if (status) lastStatus = status;
      if (typeof onProgress === "function") {
        onProgress({
          status: status || lastStatus,
          total: Number.isFinite(total) ? total : 0,
          completed: Number.isFinite(completed) ? completed : 0,
          digest,
          done: rowDone,
          error: errorMessage || null,
        });
      }

      if (errorMessage) {
        return { ok: false, error: errorMessage };
      }

      if (rowDone) {
        sawDone = true;
      }
    }
  }

  if (!sawDone) {
    return {
      ok: false,
      error: "Ollama pull ended before completion signal",
    };
  }

  return { ok: true, status: lastStatus || "success" };
}

// ── Exports ────────────────────────────────────────────────

module.exports = {
  normalizeOllamaBaseUrl,
  isLocalOllamaHost,
  checkIfInstalled,
  checkIfRunning,
  tryStartOllama,
  waitUntilReady,
  getModels,
  getCatalogModels,
  pullModel,
};
