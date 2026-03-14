"use strict";

const { buildCitations } = require("./citation.builder");
const {
  LOW_SOURCE_DENSITY_DISCLAIMER,
  createResearchPolicy,
  computeLowSourceDensity,
  isResearchMode,
  resolveCitationMode,
  resolveShowCitations,
  shouldAppendCitations,
  shouldShowLowSourceDisclaimer,
} = require("./research.policy");
const { createSourceTracker } = require("./source.tracker");
const { wrapGroundedContext } = require("./context.wrapper");

function createGroundingRuntime({ policyOverrides = {} } = {}) {
  const policy = createResearchPolicy(policyOverrides);
  const tracker = createSourceTracker();

  function safe(label, fallback, fn) {
    try {
      return fn();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown grounding error");
      console.warn(`[agent.grounding] ${label} failed: ${message}`);
      return fallback;
    }
  }

  return {
    policy,
    beginTurn(turnId) {
      return safe("beginTurn", undefined, () => tracker.beginTurn(turnId));
    },
    registerRetrievalMatches(params) {
      return safe("registerRetrievalMatches", [], () => tracker.registerRetrievalMatches(params));
    },
    registerToolOutputs(params) {
      return safe("registerToolOutputs", [], () => tracker.registerToolOutputs(params));
    },
    registerSummary(params) {
      return safe("registerSummary", [], () => tracker.registerSummary(params));
    },
    wrapContext(params) {
      return safe("wrapContext", { text: "", sectionSourceIds: {} }, () =>
        wrapGroundedContext(params),
      );
    },
    attachSectionSourceIds(turnId, sectionSourceIds) {
      return safe("attachSectionSourceIds", undefined, () =>
        tracker.attachSectionSourceIds(turnId, sectionSourceIds),
      );
    },
    getTurnSources(turnId) {
      return safe("getTurnSources", [], () => tracker.getTurnSources(turnId));
    },
    getTurnSectionSourceIds(turnId) {
      return safe("getTurnSectionSourceIds", {}, () => tracker.getTurnSectionSourceIds(turnId));
    },
    getAllSources() {
      return safe("getAllSources", [], () => tracker.getAllSources());
    },
    buildCitations(params) {
      return safe("buildCitations", { mode: "footnote", entries: [], markers: {}, text: "" }, () =>
        buildCitations(params),
      );
    },
    isResearchMode(input) {
      return safe("isResearchMode", false, () => isResearchMode(input, policy));
    },
    resolveCitationMode(input) {
      return safe("resolveCitationMode", policy.DEFAULT_CITATION_MODE || "footnote", () =>
        resolveCitationMode(input, policy),
      );
    },
    resolveShowCitations(input) {
      return safe("resolveShowCitations", false, () => resolveShowCitations(input));
    },
    shouldAppendCitations(params) {
      return safe("shouldAppendCitations", false, () => shouldAppendCitations(params));
    },
    computeLowSourceDensity(sources) {
      return safe("computeLowSourceDensity", true, () => computeLowSourceDensity(sources, policy));
    },
    shouldShowLowSourceDisclaimer(params) {
      return safe("shouldShowLowSourceDisclaimer", false, () =>
        shouldShowLowSourceDisclaimer(params),
      );
    },
    getLowSourceDensityDisclaimer() {
      return (
        policy.LOW_SOURCE_DENSITY_DISCLAIMER ||
        LOW_SOURCE_DENSITY_DISCLAIMER
      );
    },
  };
}

module.exports = {
  createGroundingRuntime,
  createResearchPolicy,
  createSourceTracker,
  buildCitations,
  wrapGroundedContext,
};
