"use strict";

const { validatePayload } = require("../../engine/entityAdapters");
const { validateAndPrepareFields } = require("../fieldGovernance");
const { INFERENCE_CLASS, getInferenceProfile } = require("./inferenceProfileRegistry");
const strategyLibrary = require("./strategyLibrary");

const INFERENCE_ORIGIN = Object.freeze({
  EXPLICIT: "explicit",
  DEFAULT_STRUCTURAL: "default_structural",
  INHERITED_CONTEXTUAL: "inherited_contextual",
  INFERRED_SEMANTIC: "inferred_semantic",
  ESTIMATED_TEMPORAL: "estimated_temporal",
  CORRECTED_DETERMINISTIC: "corrected_deterministic",
});

function deepClone(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return { ...value };
  }
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && !value.trim()) return false;
  return true;
}

function normalizeConfidence(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(3));
}

function computeConfidenceScore(candidate = {}) {
  const positiveSignals = Array.isArray(candidate?.confidenceSignals) ? candidate.confidenceSignals : [];
  const penalties = Array.isArray(candidate?.penalties) ? candidate.penalties : [];

  const positive = positiveSignals.reduce((sum, signal) => sum + (Number(signal?.weight) || 0), 0);
  const negative = penalties.reduce((sum, signal) => sum + (Number(signal?.weight) || 0), 0);

  const normalized = normalizeConfidence(positive - negative);
  return {
    score: normalized,
    trace: {
      positiveSignals,
      penalties,
      rawScore: positive - negative,
      normalizedScore: normalized,
    },
  };
}

function createEmptyTrace() {
  return {
    explicitFields: [],
    defaultedFields: [],
    inheritedFields: [],
    inferredFields: [],
    correctedFields: [],
    warnings: [],
    fieldDecisionMap: {},
    confidenceTrace: {},
    inferenceSummary: {
      countsByOrigin: {
        explicit: 0,
        default_structural: 0,
        inherited_contextual: 0,
        inferred_semantic: 0,
        estimated_temporal: 0,
        corrected_deterministic: 0,
      },
      warningCount: 0,
    },
  };
}

function recordDecision(trace, field, detail) {
  trace.fieldDecisionMap[field] = {
    ...(trace.fieldDecisionMap[field] || {}),
    ...detail,
  };
}

function recordOriginCount(trace, origin) {
  if (!trace.inferenceSummary.countsByOrigin[origin]) {
    trace.inferenceSummary.countsByOrigin[origin] = 0;
  }
  trace.inferenceSummary.countsByOrigin[origin] += 1;
}

function runContextualInheritance({ payload, profile, activeScope, trace, explicitFields }) {
  const inheritable = Array.isArray(profile?.inheritableFields) ? profile.inheritableFields : [];
  for (const field of inheritable) {
    const existing = payload[field];
    if (hasValue(existing)) continue;

    const fieldProfile = profile?.fields?.[field] || {};
    if (fieldProfile.class === INFERENCE_CLASS.NEVER_AUTO) continue;

    const candidate = strategyLibrary.inheritFromScope({ field, payload, activeScope });
    if (!candidate || !hasValue(candidate.value)) continue;

    payload[field] = candidate.value;
    trace.inheritedFields.push({
      field,
      value: candidate.value,
      strategyId: candidate.strategyId,
    });
    recordOriginCount(trace, INFERENCE_ORIGIN.INHERITED_CONTEXTUAL);
    recordDecision(trace, field, {
      class: fieldProfile.class || INFERENCE_CLASS.AUTO_IF_CONTEXTUAL,
      origin: INFERENCE_ORIGIN.INHERITED_CONTEXTUAL,
      written: true,
      reason: "inherited_from_scope",
    });
  }

  for (const key of Object.keys(payload)) {
    if (explicitFields.has(key)) continue;
    if (!inheritable.includes(key)) continue;
    if (!trace.inheritedFields.find((entry) => entry.field === key)) {
      trace.inheritedFields.push({
        field: key,
        value: payload[key],
        strategyId: "scopeBinder",
      });
      recordOriginCount(trace, INFERENCE_ORIGIN.INHERITED_CONTEXTUAL);
      recordDecision(trace, key, {
        class: profile?.fields?.[key]?.class || INFERENCE_CLASS.AUTO_IF_CONTEXTUAL,
        origin: INFERENCE_ORIGIN.INHERITED_CONTEXTUAL,
        written: true,
        reason: "inherited_prebound",
      });
    }
  }
}

function applyHighConfidenceCandidate({
  payload,
  profile,
  field,
  candidate,
  trace,
  origin,
}) {
  if (!candidate || !hasValue(candidate.value)) return;

  const fieldProfile = profile?.fields?.[field] || {};
  const threshold =
    Number(fieldProfile?.threshold) ||
    Number(profile?.thresholds?.[field]) ||
    Number(profile?.thresholds?.global) ||
    0.72;
  const confidence = computeConfidenceScore(candidate);

  trace.confidenceTrace[field] = confidence.trace;
  const isHighConfidence = confidence.score >= threshold;
  if (!isHighConfidence) {
    trace.warnings.push(
      `Skipped ${field}: insufficient_confidence (${confidence.score} < ${threshold})`,
    );
    recordDecision(trace, field, {
      class: fieldProfile.class || INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE,
      origin,
      confidence: confidence.score,
      written: false,
      reason: "insufficient_confidence",
    });
    return;
  }

  payload[field] = candidate.value;
  trace.inferredFields.push({
    field,
    value: candidate.value,
    origin,
    confidence: confidence.score,
    strategyId: candidate.strategyId,
  });
  recordOriginCount(trace, origin);
  recordDecision(trace, field, {
    class: fieldProfile.class || INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE,
    origin,
    confidence: confidence.score,
    written: true,
    reason: "confidence_threshold_met",
  });
}

function runSemanticInference({ payload, profile, trace }) {
  for (const [field, fieldProfile] of Object.entries(profile?.fields || {})) {
    if (fieldProfile.class !== INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE) continue;
    if (hasValue(payload[field])) continue;
    const semanticStrategyRefs = Array.isArray(fieldProfile.semanticStrategyRefs)
      ? fieldProfile.semanticStrategyRefs
      : [];
    for (const strategyRef of semanticStrategyRefs) {
      const strategy = strategyLibrary[strategyRef];
      if (typeof strategy !== "function") continue;
      const candidate = strategy({ payload, profile, field });
      if (!candidate) continue;
      applyHighConfidenceCandidate({
        payload,
        profile,
        field,
        candidate,
        trace,
        origin: INFERENCE_ORIGIN.INFERRED_SEMANTIC,
      });
      if (hasValue(payload[field])) break;
    }
  }
}

function runTemporalInference({ payload, profile, trace }) {
  for (const [field, fieldProfile] of Object.entries(profile?.fields || {})) {
    if (fieldProfile.class !== INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE) continue;
    if (hasValue(payload[field])) continue;
    const temporalRefs = Array.isArray(fieldProfile.temporalStrategyRefs)
      ? fieldProfile.temporalStrategyRefs
      : [];
    for (const strategyRef of temporalRefs) {
      const strategy = strategyLibrary[strategyRef];
      if (typeof strategy !== "function") continue;
      const candidate = strategy({ payload, profile, field });
      if (!candidate) continue;
      applyHighConfidenceCandidate({
        payload,
        profile,
        field,
        candidate,
        trace,
        origin: INFERENCE_ORIGIN.ESTIMATED_TEMPORAL,
      });
      if (hasValue(payload[field])) break;
    }
  }
}

function runDeterministicCorrections({ payload, profile, trace }) {
  for (const [field, fieldProfile] of Object.entries(profile?.fields || {})) {
    if (!hasValue(payload[field])) continue;
    if (fieldProfile.correctionPolicy !== "enum_normalize") continue;
    const normalized = strategyLibrary.normalizeStatusByEnum({
      field,
      value: payload[field],
      allowedValues: fieldProfile.allowedValues || [],
    });
    if (!normalized) continue;
    if (normalized.corrected !== true) continue;
    const previous = payload[field];
    payload[field] = normalized.normalized;
    trace.correctedFields.push({
      field,
      from: previous,
      to: normalized.normalized,
      ruleId: normalized.strategyId,
    });
    recordOriginCount(trace, INFERENCE_ORIGIN.CORRECTED_DETERMINISTIC);
    recordDecision(trace, field, {
      class: fieldProfile.class || INFERENCE_CLASS.AUTO_SAFE,
      origin: INFERENCE_ORIGIN.CORRECTED_DETERMINISTIC,
      written: true,
      reason: "enum_normalization",
    });
  }
}

function tagExplicitFields(trace, explicitPayload = {}, profile = {}) {
  for (const field of Object.keys(explicitPayload || {})) {
    if (!hasValue(explicitPayload[field])) continue;
    trace.explicitFields.push(field);
    recordOriginCount(trace, INFERENCE_ORIGIN.EXPLICIT);
    recordDecision(trace, field, {
      class: profile?.fields?.[field]?.class || INFERENCE_CLASS.NEVER_AUTO,
      origin: INFERENCE_ORIGIN.EXPLICIT,
      written: true,
      reason: "provided_explicitly",
    });
  }
}

function runStructuralCompletion({ entityType, payload, activeScope, trace, explicitFields }) {
  const before = deepClone(payload);
  const governance = validateAndPrepareFields({
    entityType,
    payload,
    activeScope,
  });
  const preparedPayload = governance.preparedPayload;
  const appliedDefaults = Array.isArray(governance.appliedDefaults) ? governance.appliedDefaults : [];

  for (const item of appliedDefaults) {
    if (!item?.field) continue;
    trace.defaultedFields.push({
      field: item.field,
      value: item.value,
    });
    recordOriginCount(trace, INFERENCE_ORIGIN.DEFAULT_STRUCTURAL);
    recordDecision(trace, item.field, {
      class: INFERENCE_CLASS.AUTO_SAFE,
      origin: INFERENCE_ORIGIN.DEFAULT_STRUCTURAL,
      written: true,
      reason: "structural_default",
    });
  }

  for (const [field, value] of Object.entries(preparedPayload)) {
    const hadBefore = hasValue(before[field]);
    if (!hadBefore && !explicitFields.has(field) && !trace.defaultedFields.find((entry) => entry.field === field)) {
      trace.defaultedFields.push({ field, value });
      recordOriginCount(trace, INFERENCE_ORIGIN.DEFAULT_STRUCTURAL);
      recordDecision(trace, field, {
        class: INFERENCE_CLASS.AUTO_SAFE,
        origin: INFERENCE_ORIGIN.DEFAULT_STRUCTURAL,
        written: true,
        reason: "structural_completion",
      });
    }
  }

  return {
    payload: preparedPayload,
    governance,
  };
}

function enrichStepPayload({
  operation,
  entityType,
  payload,
  explicitPayload,
  activeScope = {},
}) {
  const normalizedOperation = String(operation || "").trim().toUpperCase();
  const normalizedEntityType = String(entityType || "").trim().toLowerCase();
  const profile = getInferenceProfile(normalizedEntityType);
  const trace = createEmptyTrace();
  const safePayload = deepClone(payload);
  const explicitSource = deepClone(explicitPayload || payload || {});
  const explicitFields = new Set(Object.keys(explicitSource).map((key) => String(key || "").trim().toLowerCase()));

  tagExplicitFields(trace, explicitSource, profile);

  let governance = { status: "ready", missingCriticalFields: [], missingRequiredFields: [] };
  if (normalizedOperation === "CREATE_ENTITY") {
    const structural = runStructuralCompletion({
      entityType: normalizedEntityType,
      payload: safePayload,
      activeScope,
      trace,
      explicitFields,
    });
    governance = structural.governance;
    Object.assign(safePayload, structural.payload);
    runContextualInheritance({
      payload: safePayload,
      profile,
      activeScope,
      trace,
      explicitFields,
    });
    runSemanticInference({ payload: safePayload, profile, trace });
    runTemporalInference({ payload: safePayload, profile, trace });
    runDeterministicCorrections({ payload: safePayload, profile, trace });
  } else if (normalizedOperation === "UPDATE_ENTITY") {
    runDeterministicCorrections({ payload: safePayload, profile, trace });
    runSemanticInference({ payload: safePayload, profile, trace });
    runTemporalInference({ payload: safePayload, profile, trace });
  }

  trace.inferenceSummary.warningCount = trace.warnings.length;

  return {
    profile,
    payload: safePayload,
    governance,
    trace,
  };
}

function normalizeScopeKey(payload = {}, entityType = "") {
  const normalizedType = String(entityType || "").trim().toLowerCase();
  const clientId = Number(payload?.client_id || 0) || 0;
  const dossierId = Number(payload?.dossier_id || 0) || 0;
  const lawsuitId = Number(payload?.lawsuit_id || 0) || 0;
  return `${normalizedType}|c:${clientId || "-"}|d:${dossierId || "-"}|l:${lawsuitId || "-"}`;
}

function applyBatchInference({ steps = [], activeScope = {} }) {
  const list = Array.isArray(steps) ? steps : [];
  const duplicateIndex = new Map();
  const batchWarnings = [];

  const enrichedSteps = list.map((step, index) => {
    const actionType = String(step?.actionType || "").trim().toUpperCase();
    const params =
      step?.params && typeof step.params === "object" && !Array.isArray(step.params)
        ? deepClone(step.params)
        : {};
    const entityType = String(params?.entityType || "").trim().toLowerCase();

    if (actionType !== "CREATE_ENTITY" && actionType !== "UPDATE_ENTITY") {
      return { ...step, params, uis: { trace: createEmptyTrace() } };
    }

    const payload =
      actionType === "UPDATE_ENTITY"
        ? (params?.changes && typeof params.changes === "object" ? params.changes : {})
        : (params?.payload && typeof params.payload === "object" ? params.payload : params);

    const inferred = enrichStepPayload({
      operation: actionType,
      entityType,
      payload,
      explicitPayload: payload,
      activeScope: {
        ...(activeScope && typeof activeScope === "object" ? activeScope : {}),
        batchIndex: index,
      },
    });

    if (actionType === "CREATE_ENTITY") {
      params.payload = inferred.payload;
    } else {
      params.changes = inferred.payload;
    }

    if (actionType === "CREATE_ENTITY") {
      const title = String(inferred.payload?.title || "").trim().toLowerCase();
      if (title) {
        const key = `${normalizeScopeKey(inferred.payload, entityType)}|${title}`;
        const seen = duplicateIndex.get(key);
        if (seen === undefined) {
          duplicateIndex.set(key, index);
        } else {
          const baseTitle = String(inferred.payload.title || "").trim();
          const corrected = `${baseTitle} (${index + 1})`;
          params.payload.title = corrected;
          inferred.trace.correctedFields.push({
            field: "title",
            from: baseTitle,
            to: corrected,
            ruleId: "batch_duplicate_title_first_writer",
          });
          inferred.trace.warnings.push(
            `Duplicate title in batch detected (same scope as step ${seen + 1}); renamed deterministically.`,
          );
          inferred.trace.inferenceSummary.warningCount = inferred.trace.warnings.length;
          batchWarnings.push(
            `Step ${index + 1}: duplicate title matched step ${seen + 1}; title was adjusted.`,
          );
        }
      }
    }

    return {
      ...step,
      params,
      uis: {
        trace: inferred.trace,
      },
    };
  });

  return {
    steps: enrichedSteps,
    batchWarnings,
  };
}

function enforceExecutionGuard({ actionType, entityType, payload, activeScope = {} }) {
  const normalizedAction = String(actionType || "").trim().toUpperCase();
  if (normalizedAction !== "CREATE_ENTITY" && normalizedAction !== "UPDATE_ENTITY") {
    return { payload, trace: createEmptyTrace() };
  }

  const inferred = enrichStepPayload({
    operation: normalizedAction,
    entityType,
    payload,
    explicitPayload: payload,
    activeScope,
  });

  validatePayload(entityType, normalizedAction === "CREATE_ENTITY" ? "create" : "update", inferred.payload);

  return {
    payload: inferred.payload,
    trace: inferred.trace,
  };
}

module.exports = {
  INFERENCE_CLASS,
  INFERENCE_ORIGIN,
  computeConfidenceScore,
  enrichStepPayload,
  applyBatchInference,
  enforceExecutionGuard,
};
