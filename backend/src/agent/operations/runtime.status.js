"use strict";

async function getRuntimeStatus(runtime, context = {}) {
  const safeMode = context.safeMode;
  const debugFlags = context.debugFlags;
  const auditExplorer = context.auditExplorer;

  const memoryUsage = getMemoryUsage();
  const sessionCacheStats = readStats(runtime?.sessionStore, "getCacheStats");
  const retrievalCacheStats =
    readStats(runtime?.retrieval, "getCacheStats") || readStats(runtime?.retrieval, "getIndexStats");
  const observabilityMetrics = readStats(runtime?.observability, "snapshotMetrics") || {};

  const lastHealthSnapshot =
    auditExplorer && typeof auditExplorer.getHealthSnapshots === "function"
      ? firstOrNull(await safeCall(() => auditExplorer.getHealthSnapshots({ limit: 1 }), []))
      : null;

  const lastPerformanceSnapshot =
    auditExplorer && typeof auditExplorer.getPerformanceSnapshots === "function"
      ? firstOrNull(await safeCall(() => auditExplorer.getPerformanceSnapshots({ limit: 1 }), []))
      : null;

  return {
    generatedAt: new Date().toISOString(),
    featureFlags: normalizeFeatureFlags(context.flags),
    safeMode: safeMode && typeof safeMode.getSafeModeState === "function" ? safeMode.getSafeModeState() : {},
    debugFlags:
      debugFlags && typeof debugFlags.getDebugFlags === "function" ? debugFlags.getDebugFlags() : {},
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: memoryUsage,
    },
    caches: {
      session: sessionCacheStats,
      retrieval: retrievalCacheStats,
    },
    observability: {
      metrics: observabilityMetrics,
      turnCount:
        runtime?.observability && typeof runtime.observability.getTurnCount === "function"
          ? runtime.observability.getTurnCount()
          : 0,
    },
    snapshots: {
      health: compactSnapshot(lastHealthSnapshot),
      performance: compactSnapshot(lastPerformanceSnapshot),
    },
  };
}

function readStats(target, methodName) {
  if (!target || typeof target[methodName] !== "function") {
    return {};
  }
  try {
    return normalizeRecord(target[methodName]());
  } catch (error) {
    console.warn(`[agent.operations] runtime status read failed (${methodName}): ${safeErrorMessage(error)}`);
    return {};
  }
}

function normalizeFeatureFlags(flags) {
  const row = normalizeRecord(flags);
  if (normalizeRecord(row.values)) {
    return row.values;
  }
  return row;
}

function getMemoryUsage() {
  try {
    const usage = process.memoryUsage();
    return {
      rssMb: toMb(usage.rss),
      heapTotalMb: toMb(usage.heapTotal),
      heapUsedMb: toMb(usage.heapUsed),
      externalMb: toMb(usage.external),
      arrayBuffersMb: toMb(usage.arrayBuffers),
    };
  } catch {
    return {
      rssMb: 0,
      heapTotalMb: 0,
      heapUsedMb: 0,
      externalMb: 0,
      arrayBuffersMb: 0,
    };
  }
}

function toMb(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function compactSnapshot(row) {
  const value = normalizeRecord(row);
  if (!value || Object.keys(value).length === 0) {
    return null;
  }
  return {
    id: String(value.id || ""),
    eventType: String(value.eventType || ""),
    sessionId: String(value.sessionId || ""),
    turnId: String(value.turnId || ""),
    timestamp: String(value.timestamp || ""),
    dataKeys: Object.keys(normalizeRecord(value.data)).slice(0, 12),
  };
}

async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[agent.operations] async status read failed: ${safeErrorMessage(error)}`);
    return fallback;
  }
}

function firstOrNull(value) {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

function normalizeRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error || "unknown error");
}

module.exports = {
  getRuntimeStatus,
};
