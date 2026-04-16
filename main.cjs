// Electron Main Process for Ordinay
// Desktop Foundation Layer

const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  nativeImage,
} = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");
const http = require("http");
const fs = require("fs");
const dns = require("dns").promises;
const https = require("https");
const {
  parseAndValidateExternalUrl,
  auditExternalLink,
  buildAuditEntry,
} = require("./externalLinks.cjs");
const {
  resolveUpdateFeedUrl,
  evaluateFeedSecurity,
  verifyFileSha256,
} = require("./updateSecurity.cjs");

// ============================================================
// CONFIGURATION
// ============================================================
// Windows firewall/protocol prompts pull app branding from the packaged
// package.json metadata (productName/description/author) via electron-builder.

const isDev = !app.isPackaged;
// DevTools are enabled in development only by default.
// In packaged builds, they remain disabled unless explicitly enabled by ORDINAY_DEVTOOLS=1.
const ALLOW_DEVTOOLS = isDev || process.env.ORDINAY_DEVTOOLS === "1";
const APP_USER_MODEL_ID = "com.ordinay.desktop";
const STARTUP_LOG_DIR = path.join(
  process.env.APPDATA || process.cwd(),
  "ORDINAY",
);
const STARTUP_LOG_PATH = path.join(STARTUP_LOG_DIR, "startup.log");

function persistMainLog(message, error = null) {
  try {
    fs.mkdirSync(STARTUP_LOG_DIR, { recursive: true });
    const stamp = new Date().toISOString();
    const base = `[${stamp}] ${message}`;
    const details = error
      ? `\n${error?.stack || error?.message || String(error)}`
      : "";
    fs.appendFileSync(STARTUP_LOG_PATH, `${base}${details}\n`, "utf8");
  } catch {
    // Avoid throwing from logging.
  }
}

// Ensure Chromium uses non-overlay scrollbars so CSS styling applies.
app.commandLine.appendSwitch(
  "disable-features",
  "OverlayScrollbar,OverlayScrollbarWinStyle,OverlayScrollbarMacStyle,OverlayScrollbarFluentScrollbar",
);

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

if (!isDev && !ALLOW_DEVTOOLS) {
  // Harden production against DevTools access even if a window slips through.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("before-input-event", (event, input) => {
      const isCtrlOrCmd = input.control || input.meta;
      const isShift = input.shift;
      if (
        (isCtrlOrCmd && isShift && input.key?.toLowerCase() === "i") ||
        input.key === "F12"
      ) {
        event.preventDefault();
      }
    });
    contents.on("context-menu", (event) => {
      event.preventDefault();
    });
    contents.openDevTools = () => undefined;
    contents.on("devtools-opened", () => {
      contents.closeDevTools();
    });
  });
}

// Persistent paths using Electron's userData directory
const USER_DATA_PATH = app.getPath("userData");
const DB_PATH = path.join(USER_DATA_PATH, "ordinay.db");
const DOCUMENTS_PATH = path.join(USER_DATA_PATH, "documents");
const LICENSE_PATH = path.join(USER_DATA_PATH, "ordinay_license.json");
const DEVICE_ID_PATH = path.join(USER_DATA_PATH, "ordinay_device_id.txt");
const AGENT_TOKEN_CACHE_PATH = path.join(
  USER_DATA_PATH,
  "ordinay_agent_token.json",
);
const ACTIVATION_PROTOCOL = "ordinay";
// Queue for protocol URLs received before the renderer is ready (e.g. fresh launch via deep link on Windows)
let deferredProtocolUrl = null;
const UPDATE_CACHE_PATH = path.join(USER_DATA_PATH, "updates");
const ALLOW_DEV_UPDATES = process.env.ORDINAY_DEV_UPDATES === "1";
const RAW_UPDATE_URL = String(process.env.ORDINAY_UPDATE_URL || "").trim();
const UPDATE_MANIFEST_PUBLIC_KEY = String(
  process.env.ORDINAY_UPDATE_MANIFEST_PUBLIC_KEY ||
    process.env.ORDINAY_UPDATE_PUBLIC_KEY ||
    "",
).trim();
const REQUIRE_SIGNED_UPDATE_MANIFEST = !isDev;
const UPDATE_FEED_URL = resolveUpdateFeedUrl({
  rawUpdateUrl: RAW_UPDATE_URL,
  isDev,
  allowDevUpdates: ALLOW_DEV_UPDATES,
});
if (RAW_UPDATE_URL && !UPDATE_FEED_URL) {
  console.warn(`[Updater] Ignoring insecure update feed URL: ${RAW_UPDATE_URL}`);
}

// Backend configuration
let backendProcess = null;
let backendPort = null; // kept for legacy/dev fallback; null when using named pipe
let backendPipePath = null; // named pipe (Windows) or Unix socket path
let mainWindow = null;
let resetting = false;
let updateDownloadUrl = null;
let downloadedUpdatePath = null;
let updateExpectedSha256 = null;
let updateState = {
  status: "idle",
  version: app.getVersion(),
  availableVersion: null,
  progress: null,
  lastCheckedAt: null,
  lastError: null,
  updatesEnabled: Boolean(UPDATE_FEED_URL) && (!isDev || ALLOW_DEV_UPDATES),
};
let lastUpdateAction = null;

const CHROMIUM_UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
  79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
  135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530,
  531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719,
  1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667,
  6668, 6669, 6697, 10080,
]);

function isBrowserUnsafePort(port) {
  const parsed = Number.parseInt(String(port || ""), 10);
  return Number.isInteger(parsed) && CHROMIUM_UNSAFE_PORTS.has(parsed);
}

const MAX_AGENT_TOKEN_LENGTH = 16_384;

function normalizeAgentTokenCacheRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const token = typeof value.token === "string" ? value.token.trim() : "";
  const expiresAt = Number(value.expiresAt);
  if (!token || token.length > MAX_AGENT_TOKEN_LENGTH) {
    return null;
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return { token, expiresAt };
}

function readAgentTokenCacheFromDisk() {
  if (!fs.existsSync(AGENT_TOKEN_CACHE_PATH)) {
    return { exists: false };
  }

  try {
    const raw = fs.readFileSync(AGENT_TOKEN_CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeAgentTokenCacheRecord(parsed);
    if (!normalized) {
      fs.unlinkSync(AGENT_TOKEN_CACHE_PATH);
      return { exists: false };
    }
    return {
      exists: true,
      token: normalized.token,
      expiresAt: normalized.expiresAt,
    };
  } catch (error) {
    console.warn(
      "[Security] Failed to read agent token cache:",
      error?.message || error,
    );
    return { exists: false };
  }
}

function writeAgentTokenCacheToDisk(token, expiresAt) {
  const normalized = normalizeAgentTokenCacheRecord({ token, expiresAt });
  if (!normalized) {
    return { ok: false, error: "Invalid token cache payload." };
  }

  try {
    const payload = JSON.stringify(normalized, null, 2);
    fs.writeFileSync(AGENT_TOKEN_CACHE_PATH, payload, {
      encoding: "utf-8",
      mode: 0o600,
    });
    return { ok: true };
  } catch (error) {
    console.warn(
      "[Security] Failed to write agent token cache:",
      error?.message || error,
    );
    return { ok: false, error: "Failed to write agent token cache." };
  }
}

function clearAgentTokenCacheFromDisk() {
  try {
    if (fs.existsSync(AGENT_TOKEN_CACHE_PATH)) {
      fs.unlinkSync(AGENT_TOKEN_CACHE_PATH);
    }
    return { ok: true };
  } catch (error) {
    console.warn(
      "[Security] Failed to clear agent token cache:",
      error?.message || error,
    );
    return { ok: false, error: "Failed to clear agent token cache." };
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Find an available port dynamically (used only in dev/fallback mode)
 * @returns {Promise<number>} Available port number
 */
function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * Generate a named-pipe path (Windows) or Unix socket path.
 * Named pipes do not open a TCP port and therefore do NOT trigger
 * Windows Firewall "allow access" prompts.
 * @returns {string}
 */
function generatePipePath() {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\ordinay-backend-${process.pid}`;
  }
  // Unix socket in the userData directory (avoids /tmp permission issues)
  return path.join(USER_DATA_PATH, `ordinay-backend-${process.pid}.sock`);
}

/**
 * Proxy an API request from the renderer through the backend via named pipe.
 * This replaces direct HTTP fetch() from the renderer, eliminating the need
 * for the renderer to connect to localhost (and avoiding firewall prompts).
 *
 * @param {string} method   HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param {string} urlPath  API path including query string, e.g. "/clients?status=active"
 * @param {*}      [body]   Request body (will be JSON-stringified)
 * @returns {Promise<{status: number, data: *}>}
 */
function proxyApiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const requestPath = `/api${urlPath}`;
    const bodyStr =
      body !== undefined && body !== null ? JSON.stringify(body) : null;

    const options = {
      method,
      path: requestPath,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    // Route to named pipe or TCP depending on how the backend was started
    if (backendPipePath) {
      options.socketPath = backendPipePath;
    } else if (backendPort) {
      options.hostname = "127.0.0.1";
      options.port = backendPort;
    } else {
      return reject(new Error("Backend not started"));
    }

    if (bodyStr) {
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        let data = null;
        if (raw.length > 0) {
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
        }
        resolve({ status: res.statusCode, data });
      });
    });

    req.on("error", (err) => reject(err));

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * Ensure required directories exist
 */
  function ensureDirectories() {
  // Ensure userData directory exists
  if (!fs.existsSync(USER_DATA_PATH)) {
    fs.mkdirSync(USER_DATA_PATH, { recursive: true });
  }

  // Ensure documents directory exists for future use
    if (!fs.existsSync(DOCUMENTS_PATH)) {
      fs.mkdirSync(DOCUMENTS_PATH, { recursive: true });
    }
  console.log("[Electron] Persistent paths:");
  console.log(`  userData: ${USER_DATA_PATH}`);
  console.log(`  database: ${DB_PATH}`);
  console.log(`  documents: ${DOCUMENTS_PATH}`);
}

/**
 * Get the path to the backend directory
 * @returns {string} Path to backend
 */
  function getBackendPath() {
    if (isDev) {
      // In development, backend is a sibling folder
      return path.join(__dirname, "..", "..", "backend");
    } else {
      // In production, backend is packaged with the app
      // It should be in resources/backend (outside asar)
      return path.join(process.resourcesPath, "backend");
    }
  }

  function isPathWithinDocuments(filePath) {
    if (!filePath) return false;
    const resolvedRoot = path.resolve(DOCUMENTS_PATH);
    const resolvedPath = path.resolve(filePath);
    return resolvedPath.startsWith(resolvedRoot + path.sep);
  }

/**
 * Get the path to Node.js executable
 * @returns {string} Path to node
 */
function getNodePath() {
  if (isDev) {
    // In development, use system Node
    return process.execPath.includes("electron") ? "node" : process.execPath;
  } else {
    // In production, never assume a system Node install (many users won't have one).
    const nodeBinaryName = process.platform === "win32" ? "node.exe" : "node";
    const bundledNodePath = path.join(getBackendPath(), nodeBinaryName);

    if (!fs.existsSync(bundledNodePath)) {
      throw new Error(
        `[Electron] Bundled Node.js not found at: ${bundledNodePath}`,
      );
    }

    return bundledNodePath;
  }
}

// ============================================================
// BACKEND PROCESS MANAGEMENT
// ============================================================

/**
 * Start the backend server as a child process.
 * In production (and by default in dev), the backend listens on a named pipe
 * instead of a TCP port so that no inbound network port is opened and Windows
 * Firewall prompts are avoided entirely.
 *
 * @returns {Promise<void>}
 */
async function startBackend() {
  // Clean up any leftover Unix socket file from a previous crash (not needed on Windows named pipes)
  backendPipePath = generatePipePath();
  if (process.platform !== "win32" && fs.existsSync(backendPipePath)) {
    fs.unlinkSync(backendPipePath);
  }

  // Pick a port for HTTP streaming (localhost only, won't trigger firewall).
  // Allow explicit override via env, otherwise choose a free local port to avoid EADDRINUSE.
  const configuredPortRaw = process.env.ORDINAY_STREAM_HTTP_PORT;
  const configuredPort = configuredPortRaw ? Number.parseInt(configuredPortRaw, 10) : NaN;
  if (Number.isInteger(configuredPort) && configuredPort > 0) {
    if (isBrowserUnsafePort(configuredPort)) {
      backendPort = await findAvailablePort();
      console.warn(
        `[Electron] ORDINAY_STREAM_HTTP_PORT=${configuredPort} is blocked by Chromium (unsafe port). Using ${backendPort} instead.`,
      );
    } else {
      backendPort = configuredPort;
    }
  } else {
    backendPort = await findAvailablePort();
  }

  const backendPath = getBackendPath();
  const serverScript = path.join(backendPath, "src", "server.js");

  console.log(`[Electron] Starting backend on pipe ${backendPipePath}`);
  persistMainLog(`[Electron] Starting backend on pipe ${backendPipePath}`);
  console.log(
    `[Electron] Backend will also listen on HTTP port ${backendPort} for streaming`,
  );
  console.log(`[Electron] Backend path: ${backendPath}`);
  console.log(`[Electron] Server script: ${serverScript}`);

  // Check if server script exists
  if (!fs.existsSync(serverScript)) {
    persistMainLog(`[Electron] Backend server script missing: ${serverScript}`);
    throw new Error(`Backend server script not found: ${serverScript}`);
  }

  const devDocIntelAssets = path.join(__dirname, "..", "build", "doc-intel");
  const prodDocIntelAssets = path.join(process.resourcesPath, "doc-intel");
  const resolvedDocIntelAssets = fs.existsSync(
    isDev ? devDocIntelAssets : prodDocIntelAssets,
  )
    ? isDev
      ? devDocIntelAssets
      : prodDocIntelAssets
    : "";

  // Agent v2 route is env-gated on the backend and defaults to disabled.
  // Packaged desktop builds do not ship backend/.env, so ensure it is enabled
  // unless the operator explicitly set the flag.
  const v2FlagInput = String(
    process.env.FEATURE_AGENT_V2_STREAM ||
      process.env.FEATURE_AI_AGENT_V2 ||
      "",
  ).trim();
  const defaultFeatureFlags =
    v2FlagInput.length > 0
      ? {}
      : {
          FEATURE_AGENT_V2_STREAM: "1",
          FEATURE_AI_AGENT_V2: "1",
        };

  // Environment variables for the backend
    const env = {
      ...process.env,
      ...defaultFeatureFlags,
      ORDINAY_PIPE: backendPipePath,
      PORT: backendPort.toString(),
      DB_FILE: DB_PATH,
      ORDINAY_USER_DATA: USER_DATA_PATH,
      ORDINAY_DOCUMENTS_PATH: DOCUMENTS_PATH,
      ...(resolvedDocIntelAssets
        ? { ORDINAY_DOC_INTEL_ASSETS_PATH: resolvedDocIntelAssets }
        : {}),
      NODE_ENV: isDev ? "development" : "production",
    };

  // Spawn the backend process
  const nodePath = getNodePath();

  backendProcess = spawn(nodePath, [serverScript], {
    cwd: backendPath,
    env: env,
    stdio: ["ignore", "pipe", "pipe"],
    // On Windows, we need shell: false to properly handle process termination
    shell: false,
    // Detached: false ensures child is killed when parent exits
    detached: false,
  });

  // Handle backend stdout
  backendProcess.stdout.on("data", (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
    persistMainLog(`[Backend] ${data.toString().trim()}`);
  });

  // Handle backend stderr
  backendProcess.stderr.on("data", (data) => {
    console.error(`[Backend Error] ${data.toString().trim()}`);
    persistMainLog(`[Backend Error] ${data.toString().trim()}`);
  });

  // Handle backend exit
  backendProcess.on("exit", (code, signal) => {
    console.log(`[Backend] Process exited with code ${code}, signal ${signal}`);
    persistMainLog(
      `[Backend] Process exited with code ${String(code)}, signal ${String(signal)}`,
    );
    backendProcess = null;
  });

  // Handle backend error
  backendProcess.on("error", (err) => {
    console.error(`[Backend] Failed to start: ${err.message}`);
    persistMainLog("[Backend] Failed to start child process", err);
    backendProcess = null;
  });

  // Wait for backend to be ready
  await waitForBackend(120);

  console.log(
    `[Electron] Backend started successfully on pipe ${backendPipePath}`,
  );
  persistMainLog(
    `[Electron] Backend started successfully on pipe ${backendPipePath}`,
  );
  // No port is returned — communication goes through the named pipe
}

/**
 * Wait for the backend to be ready by probing the named pipe (or TCP port fallback).
 * @param {number} maxAttempts - Maximum number of attempts
 * @returns {Promise<void>}
 */
function waitForBackend(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const connectionOpts = backendPipePath
      ? { path: backendPipePath }
      : { port: backendPort };

    const check = () => {
      attempts++;

      const client = net.createConnection(connectionOpts, () => {
        client.end();
        resolve();
      });

      client.on("error", () => {
        if (attempts >= maxAttempts) {
          reject(
            new Error(`Backend failed to start after ${maxAttempts} attempts`),
          );
        } else {
          setTimeout(check, 200);
        }
      });
    };

    check();
  });
}

function openExternalSafe(rawUrl, context, options = {}) {
  const validation = parseAndValidateExternalUrl(rawUrl, options);
  if (!validation.ok) {
    auditExternalLink(
      buildAuditEntry({
        context,
        normalizedUrl: String(rawUrl || ""),
        allowed: false,
        reason: validation.error,
      }),
    );
    return { ok: false, error: validation.error };
  }

  auditExternalLink(
    buildAuditEntry({
      context,
      normalizedUrl: validation.normalizedUrl,
      allowed: true,
      reason: "allowed",
    }),
  );

  shell.openExternal(validation.normalizedUrl).catch((error) => {
    console.warn("[ExternalLink] shell.openExternal failed:", error?.message || error);
  });

  return { ok: true };
}

function setupWindowSecurityGuards(window) {
  if (!window || !window.webContents) return;

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url, "window_open", { allowMailto: false });
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (!url || url === currentUrl) return;

    const current = (() => {
      try {
        return new URL(currentUrl);
      } catch {
        return null;
      }
    })();

    const next = (() => {
      try {
        return new URL(url);
      } catch {
        return null;
      }
    })();

    if (!next) {
      event.preventDefault();
      return;
    }

    // Allow same-origin navigation in dev server.
    if (isDev && current && next.origin === current.origin) {
      return;
    }

    // Allow local file navigation used by packaged renderer internals.
    if (next.protocol === "file:") {
      return;
    }

    event.preventDefault();
    openExternalSafe(url, "will_navigate", { allowMailto: false });
  });
}

function setupSessionPermissionGuards() {
  const { session } = require("electron");
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  session.defaultSession.setPermissionCheckHandler(() => false);
}

/**
 * Stop the backend server gracefully
 */
function stopBackend() {
  if (backendProcess) {
    console.log("[Electron] Stopping backend process...");

    // On Windows, we need to kill the process tree
    if (process.platform === "win32") {
      // Use taskkill to ensure all child processes are killed
      spawn("taskkill", ["/pid", backendProcess.pid.toString(), "/f", "/t"], {
        shell: true,
        stdio: "ignore",
      });
    } else {
      // On Unix-like systems, send SIGTERM
      backendProcess.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (backendProcess) {
          backendProcess.kill("SIGKILL");
        }
      }, 3000);
    }

    backendProcess = null;
  }

  // Clean up Unix socket file (not needed on Windows named pipes)
  if (backendPipePath && process.platform !== "win32") {
    try {
      if (fs.existsSync(backendPipePath)) fs.unlinkSync(backendPipePath);
    } catch {
      /* best effort */
    }
  }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deleteIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
  }
}

async function resetBackendData() {
  if (resetting) return;
  resetting = true;

  stopBackend();
  await waitFor(500);

  const deleteTargets = [DB_PATH, DOCUMENTS_PATH];
  for (const target of deleteTargets) {
    let attempts = 0;
    while (attempts < 5) {
      try {
        deleteIfExists(target);
        break;
      } catch (error) {
        attempts += 1;
        if (attempts >= 5) {
          throw error;
        }
        await waitFor(300);
      }
    }
  }

  ensureDirectories();
  await startBackend();
  resetting = false;
}

// ============================================================
// UPDATE MANAGEMENT
// ============================================================

function updatesEnabled() {
  return Boolean(UPDATE_FEED_URL) && (!isDev || ALLOW_DEV_UPDATES);
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", updateState);
  }
}

function getPlatformKey() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

function compareVersions(a, b) {
  const normalize = (value) =>
    String(value || "")
      .split(/[.+-]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const aParts = normalize(a);
  const bParts = normalize(b);
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }
  return 0;
}

async function canReachUpdateHost(timeoutMs = 1500) {
  if (!UPDATE_FEED_URL) return false;
  let hostname = "";
  try {
    hostname = new URL(UPDATE_FEED_URL).hostname;
  } catch {
    return false;
  }

  try {
    await Promise.race([
      dns.lookup(hostname),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function fetchUpdateFeed() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(UPDATE_FEED_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Update feed failed: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function mapFeedSecurityError(errorCode) {
  switch (String(errorCode || "")) {
    case "feed_missing_version":
      return "Update feed is missing a valid version.";
    case "feed_missing_platform_download":
      return "Update feed does not provide a download URL for this platform.";
    case "feed_rejected_download_url":
      return "Update feed provided an insecure download URL.";
    case "feed_missing_signed_manifest":
      return "Signed manifest is required but missing.";
    case "feed_missing_manifest_signature":
      return "Manifest signature is missing.";
    case "feed_missing_public_key":
      return "Updater public key is not configured.";
    case "feed_manifest_signature_invalid":
      return "Manifest signature verification failed.";
    case "feed_missing_platform_checksum":
      return "SHA-256 checksum for this platform is missing.";
    default:
      return "Update feed failed security validation.";
  }
}

function mapChecksumError(result) {
  if (!result || result.error === "missing_expected_sha256") {
    return "Expected SHA-256 checksum is missing.";
  }
  if (result.error === "sha256_mismatch") {
    return "Downloaded update failed checksum verification.";
  }
  return "Downloaded update integrity verification failed.";
}

async function checkForUpdates({ userInitiated = false } = {}) {
  if (!updatesEnabled()) return updateState;
  const online = await canReachUpdateHost();
  if (!online) return updateState;
  lastUpdateAction = "check";
  try {
    if (userInitiated) {
      setUpdateState({ status: "checking", progress: null, lastError: null });
    }

    const feed = await fetchUpdateFeed();
    const feedVersion = String(feed?.version || feed?.manifest?.version || "").trim();
    const platformKey = getPlatformKey();
    const currentVersion = app.getVersion();
    const versionCompare = compareVersions(feedVersion, currentVersion);

    updateDownloadUrl = null;
    updateExpectedSha256 = null;
    downloadedUpdatePath = null;
    if (versionCompare > 0) {
      const security = evaluateFeedSecurity({
        feed,
        platformKey,
        isDev,
        allowDevUpdates: ALLOW_DEV_UPDATES,
        requireSignedManifest: REQUIRE_SIGNED_UPDATE_MANIFEST,
        publicKey: UPDATE_MANIFEST_PUBLIC_KEY,
      });

      if (!security.ok) {
        const message = mapFeedSecurityError(security.error);
        setUpdateState({
          status: "update-check-failed",
          availableVersion: null,
          progress: null,
          lastCheckedAt: new Date().toISOString(),
          lastError: message,
        });
        console.warn(`[Updater] Feed rejected: ${message}`);
        return updateState;
      }

      updateDownloadUrl = security.downloadUrl;
      updateExpectedSha256 = security.sha256 || null;
      setUpdateState({
        status: "update-available",
        availableVersion: feedVersion,
        progress: null,
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      });
    } else {
      setUpdateState({
        status: "up-to-date",
        availableVersion: null,
        progress: null,
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      });
    }
  } catch (error) {
    setUpdateState({
      status: "update-check-failed",
      progress: null,
      lastError: error?.message || "Update check failed.",
    });
    console.warn("[Updater] Check failed:", error?.message || error);
  } finally {
    lastUpdateAction = null;
  }
  return updateState;
}

async function downloadToFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      const total = Number.parseInt(
        response.headers["content-length"] || "0",
        10,
      );
      let received = 0;
      const fileStream = fs.createWriteStream(targetPath);
      response.on("data", (chunk) => {
        received += chunk.length;
        if (total > 0) {
          const percent = Math.round((received / total) * 100);
          setUpdateState({ status: "downloading", progress: percent });
        }
      });
      response.on("error", (error) => {
        fileStream.close();
        reject(error);
      });
      fileStream.on("finish", () => {
        fileStream.close(() => resolve());
      });
      fileStream.on("error", (error) => {
        response.destroy();
        fileStream.close();
        reject(error);
      });
      response.pipe(fileStream);
    });

    request.on("error", (error) => reject(error));
    request.on("timeout", () => {
      request.destroy(new Error("Download timeout"));
    });
  });
}

async function downloadUpdate() {
  if (!updatesEnabled()) return updateState;
  const online = await canReachUpdateHost();
  if (!online) return updateState;
  if (!updateDownloadUrl) return updateState;
  lastUpdateAction = "download";
  try {
    if (!fs.existsSync(UPDATE_CACHE_PATH)) {
      fs.mkdirSync(UPDATE_CACHE_PATH, { recursive: true });
    }
    const fileName = path.basename(new URL(updateDownloadUrl).pathname);
    const targetPath = path.join(UPDATE_CACHE_PATH, fileName);
    setUpdateState({ status: "downloading", progress: 0, lastError: null });
    await downloadToFile(updateDownloadUrl, targetPath);

    const shouldVerifyDownload =
      REQUIRE_SIGNED_UPDATE_MANIFEST || Boolean(updateExpectedSha256);
    if (shouldVerifyDownload) {
      const checksum = verifyFileSha256(targetPath, updateExpectedSha256);
      if (!checksum.ok) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          // ignore cleanup failure
        }
        downloadedUpdatePath = null;
        const message = mapChecksumError(checksum);
        setUpdateState({
          status: "verification-failed",
          progress: null,
          lastError: message,
        });
        console.warn(`[Updater] ${message}`);
        return updateState;
      }
    }

    downloadedUpdatePath = targetPath;
    setUpdateState({
      status: "downloaded",
      availableVersion: updateState.availableVersion,
      progress: 100,
      lastError: null,
    });
  } catch (error) {
    setUpdateState({
      status: "download-failed",
      progress: null,
      lastError: error?.message || "Download failed.",
    });
    console.warn("[Updater] Download failed:", error?.message || error);
  } finally {
    lastUpdateAction = null;
  }
  return updateState;
}

function installUpdate() {
  if (!updatesEnabled()) return { ok: false, error: "updates_disabled" };
  if (!downloadedUpdatePath) {
    return { ok: false, error: "no_downloaded_update" };
  }
  if (process.platform !== "win32") {
    return { ok: false, error: "install_not_supported_platform" };
  }

  const shouldVerifyBeforeInstall =
    REQUIRE_SIGNED_UPDATE_MANIFEST || Boolean(updateExpectedSha256);
  if (shouldVerifyBeforeInstall) {
    const checksum = verifyFileSha256(downloadedUpdatePath, updateExpectedSha256);
    if (!checksum.ok) {
      const message = mapChecksumError(checksum);
      setUpdateState({
        status: "install-blocked",
        progress: null,
        lastError: message,
      });
      console.warn(`[Updater] Install blocked: ${message}`);
      return { ok: false, error: "checksum_verification_failed" };
    }
  }

  try {
    spawn(downloadedUpdatePath, [], {
      detached: true,
      stdio: "ignore",
    }).unref();
    app.quit();
    return { ok: true };
  } catch (error) {
    setUpdateState({
      status: "install-blocked",
      progress: null,
      lastError: error?.message || "Install failed.",
    });
    console.warn("[Updater] Install failed:", error?.message || error);
    return { ok: false, error: "install_spawn_failed" };
  }
}

// ============================================================
// WINDOW MANAGEMENT
// ============================================================

/**
 * Create the main application window
 */
function createWindow() {
  const windowIcon = resolveWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: "Ordinay",
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    icon: windowIcon ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Disable DevTools in production unless explicitly re-enabled for internal builds.
      devTools: ALLOW_DEVTOOLS,
    },
    show: false, // Don't show until ready
  });

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  // Show window when ready to prevent visual flash
  mainWindow.once("ready-to-show", () => {
    if (windowIcon) {
      mainWindow.setIcon(windowIcon);
    }
    mainWindow.show();
    setUpdateState({ version: app.getVersion() });
  });

  // Load the frontend
  if (isDev) {
    // In development, load from Vite dev server
    const devServerUrl =
      process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    console.log(`[Electron] Loading dev server: ${devServerUrl}`);
    mainWindow.loadURL(devServerUrl);

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    console.log(`[Electron] Loading production build: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  // Deliver any protocol URL that was queued before the renderer was ready
  mainWindow.webContents.once("did-finish-load", () => {
    if (deferredProtocolUrl) {
      handleActivationUrl(deferredProtocolUrl);
      deferredProtocolUrl = null;
    }
  });

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  setupWindowSecurityGuards(mainWindow);
}

/**
 * Resolve the window icon for BrowserWindow.
 *
 * Icon Configuration Overview:
 * ----------------------------
 * Windows icons are configured in three places:
 * 1. electron-builder.json → win.icon: Embeds icon into the .exe (Start Menu, Desktop, Explorer)
 * 2. electron-builder.json → nsis.installerIcon: Icon for the installer .exe
 * 3. main.cjs → BrowserWindow.icon: Runtime icon for taskbar and window thumbnail
 *
 * All three must be set to ensure Ordinay branding appears everywhere.
 * The Light_mode_icon.ico file at build/Light_mode_icon.ico contains multiple resolutions (16-256px).
 */
function resolveWindowIcon() {
  if (process.platform !== "win32") {
    // macOS uses the app bundle icon automatically
    // Linux uses the icon specified in electron-builder.json
    return null;
  }

  if (isDev) {
    // Development: try ICO first, fall back to PNG if needed
    const icoPath = path.resolve(
      __dirname,
      "..",
      "build",
      "Light_mode_icon.ico",
    );
    const pngPath = path.resolve(
      __dirname,
      "..",
      "build",
      "icons",
      "256x256.png",
    );

    console.log(`[Electron] Attempting to load dev icon...`);

    // Try ICO first
    if (fs.existsSync(icoPath)) {
      console.log(`[Electron] Found ICO at: ${icoPath}`);
      const iconImage = nativeImage.createFromPath(icoPath);
      if (!iconImage.isEmpty()) {
        console.log(`[Electron] ICO loaded successfully`);
        return iconImage;
      }
      console.warn(`[Electron] ICO loaded but is empty, trying PNG fallback`);
    }

    // Fall back to PNG (more reliable in some Electron versions)
    if (fs.existsSync(pngPath)) {
      console.log(`[Electron] Found PNG at: ${pngPath}`);
      const iconImage = nativeImage.createFromPath(pngPath);
      if (!iconImage.isEmpty()) {
        console.log(`[Electron] PNG loaded successfully`);
        return iconImage;
      }
      console.warn(`[Electron] PNG loaded but is empty`);
    }

    console.warn(`[Electron] No valid icon found for development mode`);
    return null;
  }

  // Production: icon is copied to resources via extraResources in electron-builder.json
  const resourcesIconPath = path.join(process.resourcesPath, "icon.ico");
  if (!fs.existsSync(resourcesIconPath)) return null;
  const iconImage = nativeImage.createFromPath(resourcesIconPath);
  return iconImage.isEmpty() ? null : iconImage;
}

/**
 * Register Content Security Policy handler once per app lifecycle.
 *
 * Most API traffic uses IPC in desktop mode. Agent streaming still uses
 * direct HTTP to the local backend endpoint, so localhost must remain allowed
 * in production connect-src.
 */
function registerContentSecurityPolicyHandler() {
  const { session } = require("electron");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspDirectives = isDev
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for Vite HMR in dev
          "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for styled-components/CSS-in-JS
          "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com",
          "font-src 'self' data:",
          "connect-src 'self' http://localhost:* ws://localhost:* http://192.168.1.175:* ws://192.168.1.175:* http://169.254.9.207:* ws://169.254.9.207:*", // Vite HMR + LAN dev
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ]
      : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'", // unsafe-inline still needed for CSS-in-JS in production
          "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com",
          "font-src 'self' data:",
          "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://ordinay.app https://*.ordinay.app",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ];

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [cspDirectives.join("; ")],
      },
    });
  });
}

// ============================================================
// IPC HANDLERS
// ============================================================

/**
 * Set up IPC handlers for renderer communication
 */
function setupIPC() {
  // Handler to get backend configuration.
  // With the IPC migration the renderer no longer needs a URL; it uses
  // window.electronAPI.apiRequest() instead.  We still return the shape
  // for backwards-compatibility of any code that reads the config.
  ipcMain.handle("get-backend-config", () => {
    return {
      port: backendPort ?? 0,
      baseUrl: backendPipePath
        ? `pipe://${backendPipePath}`
        : `http://localhost:${backendPort}`,
      apiUrl: backendPipePath ? "ipc" : `http://localhost:${backendPort}/api`,
      httpApiUrl: `http://localhost:${backendPort}/api`, // Always provide HTTP URL for streaming
      useIPC: true, // signals to renderer that IPC transport is available
    };
  });

  // ---------------------------------------------------------------
  // Generic API request proxy (replaces all renderer HTTP fetch calls)
  // The renderer sends { method, url, body } and this handler routes
  // the request to the backend via named pipe / TCP, then returns the
  // response to the renderer.
  // ---------------------------------------------------------------
  ipcMain.handle("api-request", async (_event, { method, url, body }) => {
    try {
      const result = await proxyApiRequest(method, url, body);
      return result;
    } catch (error) {
      console.error(
        `[IPC api-request] ${method} ${url} failed:`,
        error?.message || error,
      );
      return {
        status: 500,
        data: { message: error?.message || "Internal proxy error" },
      };
    }
  });

  // Handler to get app paths
  ipcMain.handle("get-app-paths", () => {
    return {
      userData: USER_DATA_PATH,
      documents: DOCUMENTS_PATH,
      database: DB_PATH,
    };
  });

  // Handler to check if app is packaged
  ipcMain.handle("is-packaged", () => {
    return !isDev;
  });

  // Handler to read local license file
  ipcMain.handle("read-license-file", () => {
    if (!fs.existsSync(LICENSE_PATH)) {
      return { exists: false };
    }

    const contents = fs.readFileSync(LICENSE_PATH, "utf-8");
    return { exists: true, contents };
  });

  // Handler to write local signed license file (overwrite any existing file)
  ipcMain.handle("write-license-file", (_event, licenseData) => {
    const payload = JSON.stringify(licenseData, null, 2);
    fs.writeFileSync(LICENSE_PATH, payload, "utf-8");
    return { ok: true };
  });

  // Handler to read device id
  ipcMain.handle("read-device-id", () => {
    if (!fs.existsSync(DEVICE_ID_PATH)) {
      return { exists: false };
    }
    const deviceId = fs.readFileSync(DEVICE_ID_PATH, "utf-8").trim();
    return { exists: true, deviceId };
  });

  // Handler to write device id
  ipcMain.handle("write-device-id", (_event, deviceId) => {
    fs.writeFileSync(DEVICE_ID_PATH, String(deviceId), "utf-8");
    return { ok: true };
  });

  // Handlers for secure agent token cache persisted outside renderer storage.
  ipcMain.handle("read-agent-token-cache", () => {
    return readAgentTokenCacheFromDisk();
  });

  ipcMain.handle("write-agent-token-cache", (_event, payload) => {
    const token = payload?.token;
    const expiresAt = payload?.expiresAt;
    return writeAgentTokenCacheToDisk(token, expiresAt);
  });

  ipcMain.handle("clear-agent-token-cache", () => {
    return clearAgentTokenCacheFromDisk();
  });

  // Handler to open external web URLs (https-only)
  ipcMain.handle("open-external-web-url", (_event, url) => {
    return openExternalSafe(url, "renderer_web_link", { allowMailto: false });
  });

  // Handler to open external mailto URLs (mailto-only usage)
  ipcMain.handle("open-external-mailto", (_event, url) => {
    return openExternalSafe(url, "mailto_notification", { allowMailto: true });
  });

  // Deprecated broad handler for backwards compatibility.
  ipcMain.handle("open-external-url", (_event, url) => {
    const raw = typeof url === "string" ? url : "";
    const isMailto = raw.trim().toLowerCase().startsWith("mailto:");
    return openExternalSafe(raw, "deprecated_open_external", {
      allowMailto: isMailto,
    });
  });

  ipcMain.handle("updates-get-status", () => updateState);

  ipcMain.handle("updates-check", async () => {
    await checkForUpdates({ userInitiated: true });
    return updateState;
  });

  ipcMain.handle("updates-download", async () => {
    await downloadUpdate();
    return updateState;
  });

  ipcMain.handle("updates-install", () => {
    return installUpdate();
  });

  ipcMain.handle("reset-app-data", async () => {
    try {
      await resetBackendData();
      return { ok: true };
    } catch (error) {
      console.error("[Electron] Reset app data failed:", error);
      return { ok: false, error: error?.message || "Reset failed" };
    }
  });

  ipcMain.handle("file-exists", (_event, filePath) => {
    if (!isPathWithinDocuments(filePath)) {
      return { exists: false, error: "outside_documents_dir" };
    }
    try {
      return { exists: fs.existsSync(filePath) };
    } catch (error) {
      return { exists: false, error: error?.message || "fs_error" };
    }
  });

  ipcMain.handle("file-open", async (_event, filePath) => {
    if (!isPathWithinDocuments(filePath)) {
      return { ok: false, error: "outside_documents_dir" };
    }
    try {
      const result = await shell.openPath(filePath);
      if (result) {
        return { ok: false, error: result };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "open_failed" };
    }
  });

  ipcMain.handle("file-reveal", (_event, filePath) => {
    if (!isPathWithinDocuments(filePath)) {
      return { ok: false, error: "outside_documents_dir" };
    }
    try {
      shell.showItemInFolder(filePath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "reveal_failed" };
    }
  });

  ipcMain.handle("file-download", (_event, payload) => {
    const filePath = payload?.filePath;
    const fileName = payload?.fileName;
    if (!isPathWithinDocuments(filePath)) {
      return { ok: false, error: "outside_documents_dir" };
    }
    try {
      const downloadsPath = app.getPath("downloads");
      const safeName = fileName || path.basename(filePath);
      const target = path.join(downloadsPath, safeName);
      fs.copyFileSync(filePath, target);
      return { ok: true, path: target };
    } catch (error) {
      return { ok: false, error: error?.message || "download_failed" };
    }
  });

  ipcMain.handle("file-delete", (_event, filePath) => {
    if (!isPathWithinDocuments(filePath)) {
      return { ok: false, error: "outside_documents_dir" };
    }
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "delete_failed" };
    }
  });

  // Window control handlers
  ipcMain.on("window-minimize", () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on("window-close", () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle("window-is-maximized", () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });
}

function handleActivationUrl(url) {
  if (!url) return;
  if (!mainWindow) {
    // Window not ready yet — queue for delivery once the renderer loads
    deferredProtocolUrl = url;
    return;
  }
  mainWindow.webContents.send("activation-url", url);
}

// ============================================================
// APP LIFECYCLE
// ============================================================

// Handle app ready
app.whenReady().then(async () => {
  console.log("[Electron] App ready");
  persistMainLog("[Electron] App ready");
  console.log(
    `[Electron] Running in ${isDev ? "development" : "production"} mode`,
  );
  persistMainLog(
    `[Electron] Running in ${isDev ? "development" : "production"} mode`,
  );

  try {
    // Ensure directories exist
    ensureDirectories();

    // Set up IPC handlers
    setupIPC();

    // Start the backend
    await startBackend();

    // Configure Content Security Policy handler (register once)
    registerContentSecurityPolicyHandler();
    setupSessionPermissionGuards();

    // Create the main window
    createWindow();

    // Initialize update checks (non-blocking, offline-safe)
    if (updatesEnabled()) {
      setTimeout(() => {
        checkForUpdates().catch(() => null);
      }, 1500);
    }

    // Guardrail: confirm no TCP port is being used
    if (backendPipePath && !backendPort) {
      console.log(
        "[Electron] Backend transport: named pipe (no TCP port opened)",
      );
    } else if (backendPort) {
      console.warn(
        "[Electron] Backend transport: TCP port",
        backendPort,
        "(firewall prompt may appear)",
      );
    }

    // Register custom protocol for activation deep link
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(ACTIVATION_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    } else {
      app.setAsDefaultProtocolClient(ACTIVATION_PROTOCOL);
    }

    // On Windows/Linux, when the app is launched fresh via a protocol URL (e.g. ordinay://install?ref=...),
    // the URL is passed as a command-line argument. Queue it for delivery once the renderer is ready.
    const protocolArg = process.argv.find((arg) =>
      arg.startsWith(`${ACTIVATION_PROTOCOL}://`),
    );
    if (protocolArg) {
      deferredProtocolUrl = protocolArg;
    }
  } catch (error) {
    console.error("[Electron] Failed to initialize:", error);
    persistMainLog("[Electron] Failed to initialize", error);
    app.quit();
  }
});

// Handle all windows closed
app.on("window-all-closed", () => {
  // On macOS, apps typically stay active until explicitly quit
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle app activation (macOS)
app.on("activate", () => {
  // Re-create window if none exists (macOS behavior)
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleActivationUrl(url);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const urlArg = argv.find((arg) =>
      arg.startsWith(`${ACTIVATION_PROTOCOL}://`),
    );
    if (urlArg) {
      handleActivationUrl(urlArg);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Handle app quit
app.on("before-quit", () => {
  console.log("[Electron] App quitting...");
  stopBackend();
});

// Handle app will quit
app.on("will-quit", () => {
  stopBackend();
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("[Electron] Uncaught exception:", error);
  persistMainLog("[Electron] Uncaught exception", error);
  stopBackend();
  app.quit();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "[Electron] Unhandled rejection at:",
    promise,
    "reason:",
    reason,
  );
  persistMainLog("[Electron] Unhandled rejection", reason);
});

// Handle SIGTERM
process.on("SIGTERM", () => {
  console.log("[Electron] Received SIGTERM");
  stopBackend();
  app.quit();
});

// Handle SIGINT
process.on("SIGINT", () => {
  console.log("[Electron] Received SIGINT");
  stopBackend();
  app.quit();
});
