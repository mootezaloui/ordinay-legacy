// Electron Main Process for Organia
// Desktop Foundation Layer

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");

// ============================================================
// CONFIGURATION
// ============================================================

const isDev = !app.isPackaged;

// Persistent paths using Electron's userData directory
const USER_DATA_PATH = app.getPath("userData");
const DB_PATH = path.join(USER_DATA_PATH, "organia.db");
const DOCUMENTS_PATH = path.join(USER_DATA_PATH, "documents");
const LICENSE_PATH = path.join(USER_DATA_PATH, "organia_license.json");

// Backend configuration
let backendProcess = null;
let backendPort = null;
let mainWindow = null;

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
    // In production on Windows, use bundled node or system node
    // For simplicity, we'll use the node that comes with Electron
    return "node";
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
            new Error(`Backend failed to start after ${maxAttempts} attempts`)
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
    },
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
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
 * Resolve a window icon for development runs.
 * In production, the packaged app icon is used by the OS.
 */
function resolveWindowIcon() {
  if (!isDev) {
    return null;
  }

  if (process.platform === "win32") {
    const iconPath = path.join(__dirname, "..", "build", "icon.ico");
    return fs.existsSync(iconPath) ? iconPath : null;
  }

  return null;
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

// ============================================================
// APP LIFECYCLE
// ============================================================

// Handle app ready
app.whenReady().then(async () => {
  console.log("[Electron] App ready");
  console.log(
    `[Electron] Running in ${isDev ? "development" : "production"} mode`
  );

  try {
    // Ensure directories exist
    ensureDirectories();

    // Set up IPC handlers
    setupIPC();

    // Start the backend
    await startBackend();

    // Create the main window
    createWindow();
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
    reason
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
