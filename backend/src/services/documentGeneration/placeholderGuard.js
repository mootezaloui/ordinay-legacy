"use strict";

const PLACEHOLDER_PATTERNS = [
  /\{\{[^{}]+\}\}/g,
  /<<[^<>]+>>/g,
  /\[[^\]]+\]/g,
  /\bTBD\b/gi,
  /\bTO_BE_FILLED\b/gi,
];

function scanString(value) {
  const findings = [];
  const text = String(value || "");
  for (const regex of PLACEHOLDER_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      findings.push(match[0]);
    }
  }
  return findings;
}

function scanForPlaceholders(value, path = "root", acc = []) {
  if (value === null || value === undefined) return acc;

  if (typeof value === "string") {
    const matches = scanString(value);
    if (matches.length > 0) {
      acc.push({ path, matches });
    }
    return acc;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForPlaceholders(entry, `${path}[${index}]`, acc));
    return acc;
  }

  if (typeof value === "object") {
    Object.keys(value).forEach((key) => {
      scanForPlaceholders(value[key], `${path}.${key}`, acc);
    });
  }

  return acc;
}

module.exports = {
  scanForPlaceholders,
};
