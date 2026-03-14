"use strict";

function getMemoryStats() {
  if (!process || typeof process.memoryUsage !== "function") {
    return {
      available: false,
      rssBytes: 0,
      heapTotalBytes: 0,
      heapUsedBytes: 0,
      externalBytes: 0,
      arrayBuffersBytes: 0,
      rssMb: 0,
      heapTotalMb: 0,
      heapUsedMb: 0,
      externalMb: 0,
      arrayBuffersMb: 0,
    };
  }

  const usage = process.memoryUsage();
  const rssBytes = normalizeNumber(usage.rss);
  const heapTotalBytes = normalizeNumber(usage.heapTotal);
  const heapUsedBytes = normalizeNumber(usage.heapUsed);
  const externalBytes = normalizeNumber(usage.external);
  const arrayBuffersBytes = normalizeNumber(usage.arrayBuffers);

  return {
    available: true,
    rssBytes,
    heapTotalBytes,
    heapUsedBytes,
    externalBytes,
    arrayBuffersBytes,
    rssMb: toMb(rssBytes),
    heapTotalMb: toMb(heapTotalBytes),
    heapUsedMb: toMb(heapUsedBytes),
    externalMb: toMb(externalBytes),
    arrayBuffersMb: toMb(arrayBuffersBytes),
  };
}

function shouldTrimCaches(policy, { memoryStats, cacheStats } = {}) {
  const stats = memoryStats && typeof memoryStats === "object" ? memoryStats : getMemoryStats();
  if (!stats.available) {
    return false;
  }

  const thresholdMb = normalizePositiveInt(policy?.MEMORY_WARNING_HEAP_MB, 0);
  if (thresholdMb <= 0) {
    return false;
  }

  const heapUsedMb = normalizeNumber(stats.heapUsedMb);
  if (heapUsedMb >= thresholdMb) {
    return true;
  }

  const normalizedCacheStats = cacheStats && typeof cacheStats === "object" ? cacheStats : {};
  const aggregateEntries = Object.values(normalizedCacheStats).reduce((sum, row) => {
    const size = normalizeNumber(row?.size);
    return sum + (size > 0 ? size : 0);
  }, 0);

  if (heapUsedMb >= thresholdMb * 0.9 && aggregateEntries > 0) {
    return true;
  }

  return false;
}

function toMb(value) {
  return Math.round((normalizeNumber(value) / (1024 * 1024)) * 100) / 100;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

module.exports = {
  getMemoryStats,
  shouldTrimCaches,
};
