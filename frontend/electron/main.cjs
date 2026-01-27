// Electron Main Process for Organia
// Desktop Foundation Layer

const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const dns = require("dns").promises;
const https = require("https");

// ============================================================
// CONFIGURATION
// ============================================================

const isDev = !app.isPackaged;
// Allow DevTools in packaged builds by default; set ORGANIA_DEVTOOLS=0 to disable.
const ALLOW_DEVTOOLS = process.env.ORGANIA_DEVTOOLS !== "0";
const APP_USER_MODEL_ID = "com.organia.desktop";

// Ensure Chromium uses non-overlay scrollbars so CSS styling applies.
app.commandLine.appendSwitch(
  "disable-features",
  "OverlayScrollbar,OverlayScrollbarWinStyle,OverlayScrollbarMacStyle,OverlayScrollbarFluentScrollbar"
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
const DB_PATH = path.join(USER_DATA_PATH, "organia.db");
const DOCUMENTS_PATH = path.join(USER_DATA_PATH, "documents");
const LICENSE_PATH = path.join(USER_DATA_PATH, "organia_license.json");
const DEVICE_ID_PATH = path.join(USER_DATA_PATH, "organia_device_id.txt");
const ACTIVATION_PROTOCOL = "organia";
const UPDATE_CACHE_PATH = path.join(USER_DATA_PATH, "updates");
const RAW_UPDATE_URL = (
  process.env.ORGANIA_UPDATE_URL || "http://localhost:5174/updates/latest.json"
).trim();
const isLocalHttpUrl = (value) =>
  value.startsWith("http://localhost") || value.startsWith("http://127.0.0.1");
const UPDATE_FEED_URL =
  RAW_UPDATE_URL.startsWith("https://") || isLocalHttpUrl(RAW_UPDATE_URL)
    ? RAW_UPDATE_URL
    : "";
const ALLOW_DEV_UPDATES = process.env.ORGANIA_DEV_UPDATES === "1";

// Backend configuration
let backendProcess = null;
let backendPort = null;
let mainWindow = null;
let resetting = false;
let updateDownloadUrl = null;
let downloadedUpdatePath = null;
let updateState = {
  status: "idle",
  version: app.getVersion(),
  availableVersion: null,
  progress: null,
  lastCheckedAt: null,
  updatesEnabled: Boolean(UPDATE_FEED_URL) && (!isDev || ALLOW_DEV_UPDATES),
};
let updateStatusBeforeCheck = null;
let lastUpdateAction = null;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Find an available port dynamically
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
        `[Electron] Bundled Node.js not found at: ${bundledNodePath}`
      );
    }

    return bundledNodePath;
  }
}

// ============================================================
// BACKEND PROCESS MANAGEMENT
// ============================================================

/**
 * Start the backend server as a child process
 * @returns {Promise<number>} The port the backend is running on
 */
async function startBackend() {
  // Find an available port
  backendPort = await findAvailablePort();

  const backendPath = getBackendPath();
  const serverScript = path.join(backendPath, "src", "server.js");

  console.log(`[Electron] Starting backend on port ${backendPort}`);
  console.log(`[Electron] Backend path: ${backendPath}`);
  console.log(`[Electron] Server script: ${serverScript}`);

  // Check if server script exists
  if (!fs.existsSync(serverScript)) {
    throw new Error(`Backend server script not found: ${serverScript}`);
  }

  // Environment variables for the backend
  const env = {
    ...process.env,
    PORT: backendPort.toString(),
    DB_FILE: DB_PATH,
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
  });

  // Handle backend stderr
  backendProcess.stderr.on("data", (data) => {
    console.error(`[Backend Error] ${data.toString().trim()}`);
  });

  // Handle backend exit
  backendProcess.on("exit", (code, signal) => {
    console.log(`[Backend] Process exited with code ${code}, signal ${signal}`);
    backendProcess = null;
  });

  // Handle backend error
  backendProcess.on("error", (err) => {
    console.error(`[Backend] Failed to start: ${err.message}`);
    backendProcess = null;
  });

  // Wait for backend to be ready (simple polling)
  await waitForBackend(backendPort);

  console.log(`[Electron] Backend started successfully on port ${backendPort}`);
  return backendPort;
}

/**
 * Wait for the backend to be ready
 * @param {number} port - Port to check
 * @param {number} maxAttempts - Maximum number of attempts
 * @returns {Promise<void>}
 */
function waitForBackend(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;

      const client = net.createConnection({ port }, () => {
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

function resolveDownloadUrl(feed) {
  const platformKey = getPlatformKey();
  const downloads = feed?.downloads || {};
  const url = downloads[platformKey];
  if (typeof url !== "string") {
    return null;
  }
  if (url.startsWith("https://")) {
    return url;
  }
  if (isLocalHttpUrl(url)) {
    return url;
  }
  return null;
}

async function checkForUpdates({ userInitiated = false } = {}) {
  if (!updatesEnabled()) return updateState;
  const online = await canReachUpdateHost();
  if (!online) return updateState;
  updateStatusBeforeCheck = updateState.status;
  lastUpdateAction = "check";
  try {
    if (userInitiated) {
      setUpdateState({ status: "checking", progress: null });
    }
    const feed = await fetchUpdateFeed();
    const feedVersion = feed?.version;
    const currentVersion = app.getVersion();
    const versionCompare = compareVersions(feedVersion, currentVersion);
    updateDownloadUrl = versionCompare > 0 ? resolveDownloadUrl(feed) : null;
    downloadedUpdatePath = null;
    if (versionCompare > 0 && updateDownloadUrl) {
      setUpdateState({
        status: "update-available",
        availableVersion: feedVersion,
        progress: null,
        lastCheckedAt: new Date().toISOString(),
      });
    } else {
      setUpdateState({
        status: "up-to-date",
        availableVersion: null,
        progress: null,
        lastCheckedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    if (updateStatusBeforeCheck) {
      setUpdateState({ status: updateStatusBeforeCheck });
    } else {
      setUpdateState({ status: "idle" });
    }
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
    setUpdateState({ status: "downloading", progress: 0 });
    await downloadToFile(updateDownloadUrl, targetPath);
    downloadedUpdatePath = targetPath;
    setUpdateState({
      status: "downloaded",
      availableVersion: updateState.availableVersion,
      progress: 100,
    });
  } catch (error) {
    setUpdateState({ status: "download-failed", progress: null });
    console.warn("[Updater] Download failed:", error?.message || error);
  } finally {
    lastUpdateAction = null;
  }
  return updateState;
}

function installUpdate() {
  if (!updatesEnabled()) return;
  if (!downloadedUpdatePath) return;
  if (process.platform !== "win32") return;
  try {
    spawn(downloadedUpdatePath, [], {
      detached: true,
      stdio: "ignore",
    }).unref();
    app.quit();
  } catch (error) {
    console.warn("[Updater] Install failed:", error?.message || error);
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
    title: "Organia",
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    icon: windowIcon ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Disable DevTools in production to protect internal logic and license state.
      devTools: isDev || ALLOW_DEVTOOLS,
    },
    show: false, // Don't show until ready
  });

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  // Show window when ready to prevent visual flash
  mainWindow.once("ready-to-show", () => {
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

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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
 * All three must be set to ensure Organia branding appears everywhere.
 * The Light_mode_icon.ico file at build/Light_mode_icon.ico contains multiple resolutions (16-256px).
 */
function resolveWindowIcon() {
  if (process.platform !== "win32") {
    // macOS uses the app bundle icon automatically
    // Linux uses the icon specified in electron-builder.json
    return null;
  }

  if (isDev) {
    // Development: load from build directory
    const iconPath = path.join(__dirname, "..", "build", "Light_mode_icon.ico");
    return fs.existsSync(iconPath) ? iconPath : null;
  }

  // Production: icon is copied to resources via extraResources in electron-builder.json
  const resourcesIconPath = path.join(process.resourcesPath, "icon.ico");
  if (fs.existsSync(resourcesIconPath)) {
    return resourcesIconPath;
  }

  return null;
}

/**
 * Register Content Security Policy handler once per app lifecycle.
 */
function registerContentSecurityPolicyHandler() {
  const { session } = require("electron");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const connectSrcExtras = [
      "https://organia.app",
      "https://*.organia.app",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];
    const cspDirectives = isDev
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for Vite HMR in dev
          "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for styled-components/CSS-in-JS
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' http://localhost:* ws://localhost:*", // Allow backend + Vite HMR
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ]
      : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'", // unsafe-inline still needed for CSS-in-JS in production
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          `connect-src 'self' http://localhost:${backendPort} ${connectSrcExtras.join(" ")}`, // Backend + activation/referral
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
  // Handler to get backend configuration
  ipcMain.handle("get-backend-config", () => {
    return {
      port: backendPort,
      baseUrl: `http://localhost:${backendPort}`,
      apiUrl: `http://localhost:${backendPort}/api`,
    };
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

  // Handler to write local license file (overwrite any existing file)
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

  // Handler to open external URLs (activation flow)
  ipcMain.handle("open-external-url", (_event, url) => {
    return shell.openExternal(url);
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
    installUpdate();
    return { ok: true };
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
  if (!mainWindow || !url) return;
  mainWindow.webContents.send("activation-url", url);
}

// ============================================================
// APP LIFECYCLE
// ============================================================

// Handle app ready
app.whenReady().then(async () => {
  console.log("[Electron] App ready");
  console.log(
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

    // Create the main window
    createWindow();

    // Initialize update checks (non-blocking, offline-safe)
    if (updatesEnabled()) {
      setTimeout(() => {
        checkForUpdates().catch(() => null);
      }, 1500);
    }

    // Register custom protocol for activation deep link
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(ACTIVATION_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    } else {
      app.setAsDefaultProtocolClient(ACTIVATION_PROTOCOL);
    }
  } catch (error) {
    console.error("[Electron] Failed to initialize:", error);
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
