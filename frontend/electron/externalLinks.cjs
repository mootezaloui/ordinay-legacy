/**
 * External link hardening utilities.
 * Centralizes URL validation and minimal audit logging before shell.openExternal.
 */

function buildAuditEntry({ context, normalizedUrl, allowed, reason }) {
  let hostname = null;
  try {
    hostname = new URL(normalizedUrl).hostname || null;
  } catch {
    hostname = null;
  }

  return {
    ts: new Date().toISOString(),
    context: String(context || "unknown"),
    hostname,
    allowed: Boolean(allowed),
    reason: reason || (allowed ? "allowed" : "blocked"),
  };
}

function auditExternalLink(entry) {
  const payload = JSON.stringify(entry);
  if (entry.allowed) {
    console.log(`[ExternalLink] ${payload}`);
  } else {
    console.warn(`[ExternalLink] ${payload}`);
  }
}

function parseAndValidateExternalUrl(rawUrl, options = {}) {
  const { allowMailto = false } = options;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { ok: false, error: "empty_url" };
  }

  const trimmed = rawUrl.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  const protocol = parsed.protocol.toLowerCase();
  const blockedSchemes = new Set(["javascript:", "data:", "file:", "vbscript:"]);
  if (blockedSchemes.has(protocol)) {
    return { ok: false, error: "blocked_scheme" };
  }

  if (protocol === "mailto:") {
    if (!allowMailto) {
      return { ok: false, error: "mailto_not_allowed" };
    }
    return { ok: true, normalizedUrl: parsed.toString(), protocol };
  }

  if (protocol !== "https:") {
    return { ok: false, error: "https_required" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "credentialed_url_blocked" };
  }

  return { ok: true, normalizedUrl: parsed.toString(), protocol };
}

module.exports = {
  parseAndValidateExternalUrl,
  auditExternalLink,
  buildAuditEntry,
};
