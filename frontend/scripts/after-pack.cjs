const fs = require("node:fs");
const path = require("node:path");
const { rcedit } = require("rcedit");

function normalizeVersion(version) {
  const parts = String(version || "1.0.0")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isInteger(part) && part >= 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join(".");
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.resolve(
    context.packager.projectDir,
    "build",
    "Light_mode_icon.ico",
  );

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] Skipping rc edit; executable missing: ${exePath}`);
    return;
  }

  if (!fs.existsSync(iconPath)) {
    console.warn(`[afterPack] Skipping rc edit; icon missing: ${iconPath}`);
    return;
  }

  const normalizedVersion = normalizeVersion(context.packager.appInfo.version);
  await rcedit(exePath, {
    icon: iconPath,
    "file-version": normalizedVersion,
    "product-version": normalizedVersion,
    "version-string": {
      CompanyName: "Ordinay Team",
      FileDescription: "ORDINAY Desktop Application",
      ProductName: "ORDINAY",
      InternalName: "ORDINAY",
      OriginalFilename: "ORDINAY.exe",
      LegalCopyright: "Copyright © 2026 Ordinay Team",
    },
  });

  console.log(`[afterPack] Updated Windows executable metadata: ${exePath}`);
};
