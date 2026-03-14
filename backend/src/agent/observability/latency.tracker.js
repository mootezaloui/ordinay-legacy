"use strict";

function createLatencyTracker() {
  const active = new Map();
  const buckets = new Map();

  function start(label) {
    const key = normalizeLabel(label);
    if (!key) {
      return;
    }
    const stack = active.get(key) || [];
    stack.push(nowMs());
    active.set(key, stack);
  }

  function end(label) {
    const key = normalizeLabel(label);
    if (!key) {
      return 0;
    }

    const stack = active.get(key);
    if (!Array.isArray(stack) || stack.length === 0) {
      return 0;
    }

    const startedAt = stack.pop();
    if (stack.length === 0) {
      active.delete(key);
    } else {
      active.set(key, stack);
    }

    const duration = Math.max(0, nowMs() - Number(startedAt || 0));
    const bucket = buckets.get(key) || { totalMs: 0, count: 0, lastMs: 0 };
    bucket.totalMs += duration;
    bucket.count += 1;
    bucket.lastMs = duration;
    buckets.set(key, bucket);
    return duration;
  }

  function measure(label, fn) {
    const key = normalizeLabel(label);
    if (!key || typeof fn !== "function") {
      return fn();
    }

    start(key);
    try {
      const result = fn();
      if (isPromiseLike(result)) {
        return result.then(
          (value) => {
            end(key);
            return value;
          },
          (error) => {
            end(key);
            throw error;
          },
        );
      }
      end(key);
      return result;
    } catch (error) {
      end(key);
      throw error;
    }
  }

  function snapshot() {
    const keys = Array.from(new Set([...buckets.keys(), ...active.keys()])).sort();
    const durationsMs = {};
    const counts = {};
    const openSpans = {};

    for (const key of keys) {
      const bucket = buckets.get(key) || { totalMs: 0, count: 0, lastMs: 0 };
      const stack = active.get(key) || [];
      durationsMs[key] = roundTo3(bucket.totalMs);
      counts[key] = bucket.count;
      openSpans[key] = stack.length;
    }

    return { durationsMs, counts, openSpans };
  }

  return {
    start,
    end,
    measure,
    snapshot,
  };
}

function nowMs() {
  return Date.now();
}

function roundTo3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function normalizeLabel(value) {
  const text = String(value || "").trim();
  return text || "";
}

function isPromiseLike(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.then === "function"
  );
}

module.exports = {
  createLatencyTracker,
};
