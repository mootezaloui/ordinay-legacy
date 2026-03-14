"use strict";

function truncateDeterministic(value, maxChars) {
  const text = String(value || "");
  const limit = normalizePositiveInt(maxChars, text.length || 1);
  if (text.length <= limit) {
    return text;
  }
  if (limit <= 3) {
    return text.slice(0, limit);
  }
  return text.slice(0, limit - 3).trimEnd() + "...";
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeWhitespaceCached(value, cache) {
  if (!cache || typeof cache.get !== "function" || typeof cache.set !== "function") {
    return normalizeWhitespace(value);
  }

  const input = String(value || "");
  const key = buildDeterministicKey(["normalizeWhitespace", input]);
  const cached = cache.get(key);
  if (typeof cached === "string") {
    return cached;
  }

  const normalized = normalizeWhitespace(input);
  cache.set(key, normalized);
  return normalized;
}

function stableStringify(value) {
  return stableStringifyInternal(value, new Set());
}

function buildDeterministicKey(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  const serialized = list.map((part) => stableStringify(part)).join("|");
  return hashDeterministic(serialized);
}

function hashDeterministic(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function dedupeStringsPreserveOrder(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set();
  const output = [];
  for (const row of values) {
    const text = String(row || "").trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
  }
  return output;
}

function stableStringifyInternal(value, seen) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (seen.has(value)) {
    return '"[Circular]"';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const output = `[${value.map((row) => stableStringifyInternal(row, seen)).join(",")}]`;
    seen.delete(value);
    return output;
  }

  const keys = Object.keys(value).sort();
  const segments = [];
  for (const key of keys) {
    segments.push(`${JSON.stringify(key)}:${stableStringifyInternal(value[key], seen)}`);
  }
  seen.delete(value);
  return `{${segments.join(",")}}`;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  buildDeterministicKey,
  dedupeStringsPreserveOrder,
  hashDeterministic,
  normalizeWhitespace,
  normalizeWhitespaceCached,
  stableStringify,
  truncateDeterministic,
};
