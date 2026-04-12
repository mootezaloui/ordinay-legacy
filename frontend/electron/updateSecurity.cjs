"use strict";

const crypto = require("crypto");
const fs = require("fs");

const DEV_DEFAULT_FEED_URL = "http://localhost:5174/updates/latest.json";

function isLocalHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:") return false;
    const hostname = String(parsed.hostname || "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isAllowedUpdateUrl(value, { isDev = false, allowDevUpdates = false } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  if (normalized.startsWith("https://")) return true;
  return Boolean(isDev && allowDevUpdates && isLocalHttpUrl(normalized));
}

function resolveUpdateFeedUrl({
  rawUpdateUrl = "",
  isDev = false,
  allowDevUpdates = false,
  defaultDevFeedUrl = DEV_DEFAULT_FEED_URL,
} = {}) {
  const raw = String(rawUpdateUrl || "").trim();
  if (!raw) {
    if (isDev && allowDevUpdates) {
      return String(defaultDevFeedUrl || "").trim();
    }
    return "";
  }
  return isAllowedUpdateUrl(raw, { isDev, allowDevUpdates }) ? raw : "";
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function serializeManifestForSigning(manifest) {
  return JSON.stringify(sortValue(manifest));
}

function decodePublicKey(publicKeyInput) {
  const value = String(publicKeyInput || "").trim();
  if (!value) return null;
  if (value.includes("BEGIN PUBLIC KEY")) {
    return crypto.createPublicKey(value);
  }
  const raw = Buffer.from(value, "base64");
  return crypto.createPublicKey({
    key: raw,
    format: "der",
    type: "spki",
  });
}

function verifyManifestSignature({
  manifest,
  signatureBase64,
  publicKey,
} = {}) {
  try {
    const keyObject = decodePublicKey(publicKey);
    if (!keyObject) return false;
    const signature = Buffer.from(String(signatureBase64 || ""), "base64");
    if (signature.length === 0) return false;
    const payload = Buffer.from(serializeManifestForSigning(manifest), "utf8");

    // Ed25519/Ed448 signatures verify with null digest parameter.
    const edResult = crypto.verify(null, payload, keyObject, signature);
    if (edResult) return true;

    // Backward compatibility for digest-based signatures (e.g. RSA).
    return crypto.verify("sha256", payload, keyObject, signature);
  } catch {
    return false;
  }
}

function normalizeSha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return null;
  return normalized;
}

function resolveFeedField(feed, pathCandidates) {
  for (const path of pathCandidates) {
    let cursor = feed;
    let found = true;
    for (const segment of path) {
      if (!cursor || typeof cursor !== "object" || !(segment in cursor)) {
        found = false;
        break;
      }
      cursor = cursor[segment];
    }
    if (found) return cursor;
  }
  return undefined;
}

function extractPlatformCandidate(feed, platformKey) {
  const manifest = resolveFeedField(feed, [["manifest"], ["signed_manifest"]]);
  const signatureBase64 = resolveFeedField(feed, [
    ["manifest_signature"],
    ["manifestSignature"],
    ["signature"],
  ]);

  const versionRaw =
    resolveFeedField(feed, [["version"]]) ??
    resolveFeedField(manifest, [["version"]]) ??
    null;
  const version = String(versionRaw || "").trim();

  const downloadUrlRaw =
    resolveFeedField(manifest, [["downloads", platformKey]]) ??
    resolveFeedField(feed, [["downloads", platformKey]]) ??
    null;
  const downloadUrl =
    typeof downloadUrlRaw === "string" ? downloadUrlRaw.trim() : "";

  const checksumRaw =
    resolveFeedField(manifest, [["sha256", platformKey]]) ??
    resolveFeedField(manifest, [["checksums", "sha256", platformKey]]) ??
    resolveFeedField(feed, [["sha256", platformKey]]) ??
    resolveFeedField(feed, [["checksums", "sha256", platformKey]]) ??
    null;
  const sha256 = normalizeSha256(checksumRaw);

  return {
    manifest,
    signatureBase64,
    version,
    downloadUrl,
    sha256,
  };
}

function evaluateFeedSecurity({
  feed,
  platformKey,
  isDev = false,
  allowDevUpdates = false,
  requireSignedManifest = false,
  publicKey = "",
} = {}) {
  const candidate = extractPlatformCandidate(feed, platformKey);

  if (!candidate.version) {
    return { ok: false, error: "feed_missing_version" };
  }

  if (!candidate.downloadUrl) {
    return { ok: false, error: "feed_missing_platform_download" };
  }

  if (!isAllowedUpdateUrl(candidate.downloadUrl, { isDev, allowDevUpdates })) {
    return { ok: false, error: "feed_rejected_download_url" };
  }

  let signatureVerified = false;
  if (requireSignedManifest) {
    if (!candidate.manifest || typeof candidate.manifest !== "object") {
      return { ok: false, error: "feed_missing_signed_manifest" };
    }
    if (!candidate.signatureBase64) {
      return { ok: false, error: "feed_missing_manifest_signature" };
    }
    if (!String(publicKey || "").trim()) {
      return { ok: false, error: "feed_missing_public_key" };
    }
    signatureVerified = verifyManifestSignature({
      manifest: candidate.manifest,
      signatureBase64: candidate.signatureBase64,
      publicKey,
    });
    if (!signatureVerified) {
      return { ok: false, error: "feed_manifest_signature_invalid" };
    }
    if (!candidate.sha256) {
      return { ok: false, error: "feed_missing_platform_checksum" };
    }
  }

  return {
    ok: true,
    version: candidate.version,
    downloadUrl: candidate.downloadUrl,
    sha256: candidate.sha256,
    signatureVerified,
  };
}

function computeFileSha256(filePath) {
  const hasher = crypto.createHash("sha256");
  const buffer = fs.readFileSync(filePath);
  hasher.update(buffer);
  return hasher.digest("hex");
}

function verifyFileSha256(filePath, expectedSha256) {
  const expected = normalizeSha256(expectedSha256);
  if (!expected) {
    return {
      ok: false,
      error: "missing_expected_sha256",
      actualSha256: null,
      expectedSha256: null,
    };
  }

  const actual = computeFileSha256(filePath);
  const matches = actual === expected;
  return {
    ok: matches,
    error: matches ? null : "sha256_mismatch",
    actualSha256: actual,
    expectedSha256: expected,
  };
}

module.exports = {
  DEV_DEFAULT_FEED_URL,
  isLocalHttpUrl,
  isAllowedUpdateUrl,
  resolveUpdateFeedUrl,
  serializeManifestForSigning,
  verifyManifestSignature,
  evaluateFeedSecurity,
  computeFileSha256,
  verifyFileSha256,
};
