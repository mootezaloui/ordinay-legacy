const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync, spawn } = require("child_process");

const LOG_PREFIX = "[Ollama]";

let _lastLoggedStatus = null;

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

// ── Exports ────────────────────────────────────────────────

module.exports = {
  normalizeOllamaBaseUrl,
  isLocalOllamaHost,
  checkIfInstalled,
  checkIfRunning,
  tryStartOllama,
  waitUntilReady,
  getModels,
};
