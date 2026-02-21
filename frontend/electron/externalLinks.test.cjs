const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAndValidateExternalUrl } = require("./externalLinks.cjs");

test("allows valid https url", () => {
  const result = parseAndValidateExternalUrl("https://example.com/path?q=1");
  assert.equal(result.ok, true);
  assert.equal(result.protocol, "https:");
});

test("blocks javascript/file/data schemes", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,<h1>x</h1>",
  ]) {
    const result = parseAndValidateExternalUrl(url);
    assert.equal(result.ok, false);
  }
});

test("rejects credentialed https urls", () => {
  const result = parseAndValidateExternalUrl("https://user:pass@example.com");
  assert.equal(result.ok, false);
  assert.equal(result.error, "credentialed_url_blocked");
});

test("enforces mailto split by context option", () => {
  const denied = parseAndValidateExternalUrl("mailto:test@example.com");
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "mailto_not_allowed");

  const allowed = parseAndValidateExternalUrl("mailto:test@example.com", {
    allowMailto: true,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.protocol, "mailto:");
});
