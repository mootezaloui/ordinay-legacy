"use strict";

const SUPPORTED_CITATION_MODES = Object.freeze(["inline", "footnote", "appendix"]);
const DEFAULT_CITATION_MODE = "footnote";
const RESEARCH_PROFILE_VALUE = "research";
const LOW_SOURCE_DENSITY_THRESHOLD = 2;
const LOW_SOURCE_DENSITY_DISCLAIMER =
  "Evidence coverage is limited for this answer. Please verify critical facts before relying on them.";

function createResearchPolicy(overrides = {}) {
  const normalized = normalizeOverrides(overrides);
  const defaultCitationMode = normalizeCitationMode(
    normalized.DEFAULT_CITATION_MODE,
    DEFAULT_CITATION_MODE,
  );
  const lowDensityThreshold = normalizePositiveInt(
    normalized.LOW_SOURCE_DENSITY_THRESHOLD,
    LOW_SOURCE_DENSITY_THRESHOLD,
  );

  return Object.freeze({
    SUPPORTED_CITATION_MODES,
    DEFAULT_CITATION_MODE: defaultCitationMode,
    RESEARCH_PROFILE_VALUE,
    LOW_SOURCE_DENSITY_THRESHOLD: lowDensityThreshold,
    LOW_SOURCE_DENSITY_DISCLAIMER:
      normalizeOptionalString(normalized.LOW_SOURCE_DENSITY_DISCLAIMER) ||
      LOW_SOURCE_DENSITY_DISCLAIMER,
  });
}

function isResearchMode(input, policy = createResearchPolicy()) {
  const metadata = toRecord(input?.metadata);
  const profile = String(metadata?.outputProfile || "").trim().toLowerCase();
  return profile === String(policy.RESEARCH_PROFILE_VALUE || RESEARCH_PROFILE_VALUE);
}

function resolveCitationMode(input, policy = createResearchPolicy()) {
  const metadata = toRecord(input?.metadata);
  const requested = metadata?.citationMode;
  return normalizeCitationMode(requested, policy.DEFAULT_CITATION_MODE || DEFAULT_CITATION_MODE);
}

function resolveShowCitations(input) {
  const metadata = toRecord(input?.metadata);
  return metadata?.showCitations === true;
}

function shouldAppendCitations({ researchMode, showCitations } = {}) {
  return Boolean(researchMode === true || showCitations === true);
}

function computeLowSourceDensity(sources, policy = createResearchPolicy()) {
  const rows = Array.isArray(sources) ? sources : [];
  return rows.length < policy.LOW_SOURCE_DENSITY_THRESHOLD;
}

function shouldShowLowSourceDisclaimer({
  lowSourceDensity,
  researchMode,
  showCitations,
} = {}) {
  if (!lowSourceDensity) {
    return false;
  }
  return shouldAppendCitations({ researchMode, showCitations });
}

function normalizeCitationMode(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (SUPPORTED_CITATION_MODES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeOverrides(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  SUPPORTED_CITATION_MODES,
  DEFAULT_CITATION_MODE,
  RESEARCH_PROFILE_VALUE,
  LOW_SOURCE_DENSITY_THRESHOLD,
  LOW_SOURCE_DENSITY_DISCLAIMER,
  createResearchPolicy,
  isResearchMode,
  resolveCitationMode,
  resolveShowCitations,
  shouldAppendCitations,
  computeLowSourceDensity,
  shouldShowLowSourceDisclaimer,
};
