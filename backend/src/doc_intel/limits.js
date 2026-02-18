"use strict";

const os = require("os");

function getHardwareProfile() {
  const cpuCount = Math.max(1, (os.cpus() || []).length || 1);
  const totalMem = Math.max(1, Number(os.totalmem() || 0));
  const totalMemGb = totalMem / (1024 * 1024 * 1024);
  const weak = cpuCount <= 4 || totalMemGb <= 8;
  return {
    cpuCount,
    totalMemBytes: totalMem,
    totalMemGb,
    profile: weak ? "weak" : "normal",
  };
}

function getDocumentIntelLimits() {
  const hw = getHardwareProfile();
  const weak = hw.profile === "weak";
  return {
    ...hw,
    maxConcurrentPages: weak ? 1 : 2,
    maxPagesAuto: Number.parseInt(process.env.DOC_INTEL_MAX_PAGES_AUTO || "5", 10),
    maxPagesHard: Number.parseInt(process.env.DOC_INTEL_MAX_PAGES_HARD || "25", 10),
    renderScale: Number.parseFloat(
      process.env.DOC_INTEL_RENDER_SCALE || (weak ? "1.6" : "2.0"),
    ),
    workerTimeoutMs: Number.parseInt(
      process.env.DOC_INTEL_WORKER_TIMEOUT_MS || (weak ? "60000" : "45000"),
      10,
    ),
    memoryStopThreshold: Number.parseFloat(
      process.env.DOC_INTEL_MEMORY_STOP_THRESHOLD || "0.70",
    ),
  };
}

function isMemoryOverThreshold(limits = getDocumentIntelLimits()) {
  const usage = process.memoryUsage();
  const ratio = usage.rss / Math.max(1, limits.totalMemBytes);
  return {
    exceeded: ratio >= limits.memoryStopThreshold,
    ratio,
  };
}

module.exports = {
  getHardwareProfile,
  getDocumentIntelLimits,
  isMemoryOverThreshold,
};

