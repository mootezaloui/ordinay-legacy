/**
 * Rebuild native modules in the backend for the bundled Node.js version.
 * This ensures better-sqlite3 works on machines where the app is installed.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const projectRoot = path.join(__dirname, "..");
const backendDir = path.join(projectRoot, "..", "backend");
const buildDir = path.join(projectRoot, "build");
const isWin = process.platform === "win32";
const nodeBinaryName = isWin ? "node.exe" : "node";
const bundledNodePath = path.join(buildDir, nodeBinaryName);

// Get the Node.js version from the bundled binary
function getBundledNodeVersion() {
  if (!fs.existsSync(bundledNodePath)) {
    throw new Error(`Bundled Node.js not found at: ${bundledNodePath}. Run "npm run prepare:node" first.`);
  }

  const version = execSync(`"${bundledNodePath}" --version`, { encoding: "utf-8" }).trim();
  return version; // e.g., "v20.18.1"
}

// Rebuild better-sqlite3 for the bundled Node.js version
function rebuildNativeModules() {
  const nodeVersion = getBundledNodeVersion();
  const systemNodeVersion = process.version;

  console.log(`[rebuild] Bundled Node.js version: ${nodeVersion}`);
  console.log(`[rebuild] System Node.js version: ${systemNodeVersion}`);
  console.log(`[rebuild] Backend directory: ${backendDir}`);

  // Check if versions match - if they do, the existing build should work
  if (nodeVersion === systemNodeVersion) {
    console.log("[rebuild] Node versions match - rebuilding to ensure fresh native modules...");
  } else {
    console.log("[rebuild] WARNING: Node version mismatch! Ensure you use the same Node version for building.");
  }

  try {
    // Clean and reinstall better-sqlite3 to get fresh native bindings
    console.log("[rebuild] Reinstalling better-sqlite3 to get correct native bindings...");

    const betterSqlite3Path = path.join(backendDir, "node_modules", "better-sqlite3");
    if (fs.existsSync(betterSqlite3Path)) {
      fs.rmSync(betterSqlite3Path, { recursive: true, force: true });
      console.log("[rebuild] Removed existing better-sqlite3");
    }

    // Reinstall better-sqlite3
    execSync("npm install better-sqlite3@9.6.0", {
      cwd: backendDir,
      stdio: "inherit",
    });

    // Build the Agent v2 runtime artifacts required by packaged desktop backend.
    console.log("[rebuild] Building backend Agent v2 runtime artifacts...");
    execSync("npm run build:agent", {
      cwd: backendDir,
      stdio: "inherit",
    });

    console.log("[rebuild] Native modules rebuilt successfully!");
  } catch (error) {
    console.error("[rebuild] Failed to rebuild native modules:", error.message);
    console.error("[rebuild] Make sure you have build tools installed:");
    console.error("[rebuild]   - Windows: npm install -g windows-build-tools");
    console.error("[rebuild]   - Or install Visual Studio Build Tools");
    process.exit(1);
  }
}

rebuildNativeModules();
