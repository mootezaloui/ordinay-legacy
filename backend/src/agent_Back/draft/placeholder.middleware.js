"use strict";

const BRACKET_PLACEHOLDER_REGEX = /\[.*?\]/g;
const TEMPLATE_MARKER_REGEXES = [
  /\{\{.*?\}\}/g,
  /<<.*?>>/g,
  /__[^_\n]{2,}__/g,
  /\binsert\s+(?:here|text|value|details)\b/gi,
  /\bto\s+be\s+filled\b/gi,
];

function isBlankTemplateRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  return (
    /\b(blank|empty)\s+template\b/.test(text) ||
    /\btemplate\s+only\b/.test(text) ||
    /نموذج\s+فارغ/.test(text) ||
    /قالب\s+فارغ/.test(text)
  );
}

function _extractFromText(text) {
  const raw = String(text || "");
  if (!raw) return [];
  const findings = [];
  let match;
  BRACKET_PLACEHOLDER_REGEX.lastIndex = 0;
  while ((match = BRACKET_PLACEHOLDER_REGEX.exec(raw)) !== null) {
    const nextChar = raw[match.index + match[0].length];
    if (nextChar === "(") continue; // markdown link token [text](url)
    findings.push(match[0]);
  }
  for (const regex of TEMPLATE_MARKER_REGEXES) {
    regex.lastIndex = 0;
    while ((match = regex.exec(raw)) !== null) {
      findings.push(match[0]);
    }
  }
  return findings;
}

function scanForPlaceholders(value, path = "root", acc = []) {
  if (value === null || value === undefined) return acc;
  if (typeof value === "string") {
    const matches = _extractFromText(value);
    if (matches.length > 0) {
      acc.push({
        path,
        matches,
      });
    }
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      scanForPlaceholders(entry, `${path}[${index}]`, acc);
    });
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
  BRACKET_PLACEHOLDER_REGEX,
  isBlankTemplateRequest,
  scanForPlaceholders,
};

