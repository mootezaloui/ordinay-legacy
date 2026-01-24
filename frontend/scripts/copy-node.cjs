const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const buildDir = path.join(projectRoot, "build");
const isWin = process.platform === "win32";
const nodeBinaryName = isWin ? "node.exe" : "node";
const sourceNodePath = process.execPath;
const destNodePath = path.join(buildDir, nodeBinaryName);

fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(sourceNodePath, destNodePath);

if (!isWin) {
  // Ensure the bundled binary is executable on macOS/Linux.
  fs.chmodSync(destNodePath, 0o755);
}

console.log(`[prepare:node] Copied ${sourceNodePath} -> ${destNodePath}`);
