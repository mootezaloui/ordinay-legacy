"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  resolveUpdateFeedUrl,
  serializeManifestForSigning,
  evaluateFeedSecurity,
  verifyFileSha256,
} = require("./updateSecurity.cjs");

function buildSignedFixture({
  version = "9.9.9",
  downloadUrl = "https://updates.example.com/ordinay/windows/OrdinaySetup.exe",
  checksum = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const manifest = {
    version,
    downloads: { windows: downloadUrl },
    sha256: { windows: checksum },
    released_at: "2026-04-12T00:00:00.000Z",
  };
  const payload = Buffer.from(serializeManifestForSigning(manifest), "utf8");
  const signature = crypto.sign(null, payload, privateKey).toString("base64");
  const publicKeyPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();

  return {
    feed: {
      version,
      manifest,
      manifest_signature: signature,
    },
    publicKeyPem,
    privateKey,
  };
}

test("production feed URL policy rejects insecure URLs", () => {
  const rejected = resolveUpdateFeedUrl({
    rawUpdateUrl: "http://updates.example.com/latest.json",
    isDev: false,
    allowDevUpdates: false,
  });
  assert.equal(rejected, "");

  const accepted = resolveUpdateFeedUrl({
    rawUpdateUrl: "https://updates.example.com/latest.json",
    isDev: false,
    allowDevUpdates: false,
  });
  assert.equal(accepted, "https://updates.example.com/latest.json");
});

test("signed manifest is accepted when signature and checksum are valid", () => {
  const fixture = buildSignedFixture();
  const result = evaluateFeedSecurity({
    feed: fixture.feed,
    platformKey: "windows",
    isDev: false,
    allowDevUpdates: false,
    requireSignedManifest: true,
    publicKey: fixture.publicKeyPem,
  });

  assert.equal(result.ok, true);
  assert.equal(result.version, "9.9.9");
  assert.equal(
    result.downloadUrl,
    "https://updates.example.com/ordinay/windows/OrdinaySetup.exe",
  );
  assert.equal(
    result.sha256,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
});

test("tampered manifest signature is rejected", () => {
  const fixture = buildSignedFixture();
  fixture.feed.manifest.downloads.windows =
    "https://updates.example.com/ordinay/windows/tampered.exe";

  const result = evaluateFeedSecurity({
    feed: fixture.feed,
    platformKey: "windows",
    isDev: false,
    allowDevUpdates: false,
    requireSignedManifest: true,
    publicKey: fixture.publicKeyPem,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "feed_manifest_signature_invalid");
});

test("missing platform checksum is rejected when signed manifest is required", () => {
  const fixture = buildSignedFixture();
  delete fixture.feed.manifest.sha256.windows;

  const payload = Buffer.from(
    serializeManifestForSigning(fixture.feed.manifest),
    "utf8",
  );
  fixture.feed.manifest_signature = crypto
    .sign(null, payload, fixture.privateKey)
    .toString("base64");

  const result = evaluateFeedSecurity({
    feed: fixture.feed,
    platformKey: "windows",
    isDev: false,
    allowDevUpdates: false,
    requireSignedManifest: true,
    publicKey: fixture.publicKeyPem,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "feed_missing_platform_checksum");
});

test("artifact checksum mismatch is rejected", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase4-updater-"));
  const artifactPath = path.join(tempRoot, "artifact.bin");
  try {
    fs.writeFileSync(artifactPath, "original-bytes", "utf8");
    const expected = crypto
      .createHash("sha256")
      .update("different-bytes")
      .digest("hex");

    const result = verifyFileSha256(artifactPath, expected);
    assert.equal(result.ok, false);
    assert.equal(result.error, "sha256_mismatch");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("artifact checksum match is accepted", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase4-updater-"));
  const artifactPath = path.join(tempRoot, "artifact.bin");
  try {
    fs.writeFileSync(artifactPath, "signed-update-binary", "utf8");
    const expected = crypto
      .createHash("sha256")
      .update("signed-update-binary")
      .digest("hex");

    const result = verifyFileSha256(artifactPath, expected);
    assert.equal(result.ok, true);
    assert.equal(result.error, null);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
