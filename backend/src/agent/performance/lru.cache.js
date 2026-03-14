"use strict";

function createLRUCache({ max, name } = {}) {
  const normalizedMax = normalizePositiveInt(max, 128);
  const label = normalizeName(name);
  const entries = new Map();
  const state = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
  };

  function get(key) {
    const normalizedKey = toCacheKey(key);
    if (!entries.has(normalizedKey)) {
      state.misses += 1;
      return undefined;
    }

    const value = entries.get(normalizedKey);
    entries.delete(normalizedKey);
    entries.set(normalizedKey, value);
    state.hits += 1;
    return value;
  }

  function set(key, value) {
    const normalizedKey = toCacheKey(key);
    if (entries.has(normalizedKey)) {
      entries.delete(normalizedKey);
    }
    entries.set(normalizedKey, value);
    state.sets += 1;
    evictOverflow();
    return value;
  }

  function has(key) {
    return entries.has(toCacheKey(key));
  }

  function remove(key) {
    const normalizedKey = toCacheKey(key);
    const existed = entries.delete(normalizedKey);
    if (existed) {
      state.deletes += 1;
    }
    return existed;
  }

  function clear() {
    if (entries.size === 0) {
      return 0;
    }
    const removed = entries.size;
    entries.clear();
    state.deletes += removed;
    return removed;
  }

  function stats() {
    return {
      name: label,
      max: normalizedMax,
      size: entries.size,
      hits: state.hits,
      misses: state.misses,
      sets: state.sets,
      deletes: state.deletes,
      evictions: state.evictions,
    };
  }

  function evictOverflow() {
    while (entries.size > normalizedMax) {
      const oldestKey = entries.keys().next().value;
      if (typeof oldestKey === "undefined") {
        break;
      }
      entries.delete(oldestKey);
      state.evictions += 1;
    }
  }

  return {
    get,
    set,
    has,
    delete: remove,
    clear,
    stats,
  };
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeName(value) {
  const text = String(value || "").trim();
  return text || "lru_cache";
}

function toCacheKey(value) {
  const text = String(value ?? "");
  return text;
}

module.exports = {
  createLRUCache,
};
