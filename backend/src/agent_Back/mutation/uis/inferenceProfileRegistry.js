"use strict";

const { getAdapter } = require("../../engine/entityAdapters");
const { getRequiredFields } = require("../entityFieldRegistry");
const { TASK_ALLOWED_PRIORITIES, TASK_ALLOWED_STATUSES } = require("../../../domain/taskMutationNormalization");

const INFERENCE_CLASS = Object.freeze({
  AUTO_SAFE: "AUTO_SAFE",
  AUTO_IF_CONTEXTUAL: "AUTO_IF_CONTEXTUAL",
  AUTO_IF_HIGH_CONFIDENCE: "AUTO_IF_HIGH_CONFIDENCE",
  NEVER_AUTO: "NEVER_AUTO",
});

const DEFAULT_THRESHOLD = 0.72;

const ENTITY_OVERRIDES = Object.freeze({
  task: {
    thresholds: {
      priority: 0.74,
      due_date: 0.78,
      description: 0.72,
      estimated_time: 0.75,
    },
    fields: {
      title: { class: INFERENCE_CLASS.AUTO_SAFE },
      status: {
        class: INFERENCE_CLASS.AUTO_SAFE,
        correctionPolicy: "enum_normalize",
        allowedValues: TASK_ALLOWED_STATUSES,
      },
      priority: {
        class: INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE,
        semanticStrategyRefs: ["classifyTaskCategoryFromTitle"],
        temporalStrategyRefs: ["derivePriorityFromDeadline"],
        allowedValues: TASK_ALLOWED_PRIORITIES,
      },
      due_date: {
        class: INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE,
        temporalStrategyRefs: ["applyTemporalWindowPolicy"],
      },
      description: {
        class: INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE,
        semanticStrategyRefs: ["inferTaskDescriptionFromTitle"],
      },
      estimated_time: {
        class: INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE,
        semanticStrategyRefs: ["estimateTaskEffortFromTitle"],
      },
      dossier_id: {
        class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL,
        contextSources: ["dossierId", "resolvedEntity:dossier"],
      },
      lawsuit_id: {
        class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL,
        contextSources: ["lawsuitId", "resolvedEntity:lawsuit"],
      },
      assigned_to: { class: INFERENCE_CLASS.NEVER_AUTO },
      completed_at: { class: INFERENCE_CLASS.NEVER_AUTO },
    },
    requiredFields: ["title"],
    inheritableFields: ["dossier_id", "lawsuit_id"],
  },
  mission: {
    fields: {
      title: { class: INFERENCE_CLASS.AUTO_SAFE },
      status: { class: INFERENCE_CLASS.AUTO_SAFE },
      priority: { class: INFERENCE_CLASS.AUTO_SAFE },
      dossier_id: { class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL },
      lawsuit_id: { class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL },
      officer_id: { class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL, contextSources: ["officerId"] },
      result: { class: INFERENCE_CLASS.NEVER_AUTO },
    },
    requiredFields: ["title"],
    inheritableFields: ["dossier_id", "lawsuit_id", "officer_id"],
  },
  session: {
    fields: {
      status: { class: INFERENCE_CLASS.AUTO_SAFE },
      scheduled_at: {
        class: INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE,
        temporalStrategyRefs: ["applyTemporalWindowPolicy"],
        threshold: 0.85,
      },
      dossier_id: { class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL },
      lawsuit_id: { class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL },
      participants: { class: INFERENCE_CLASS.NEVER_AUTO },
    },
    requiredFields: ["scheduled_at"],
    inheritableFields: ["dossier_id", "lawsuit_id"],
  },
  lawsuit: {
    fields: {
      dossier_id: { class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL },
      title: { class: INFERENCE_CLASS.AUTO_SAFE },
      status: { class: INFERENCE_CLASS.AUTO_SAFE },
      priority: { class: INFERENCE_CLASS.AUTO_SAFE },
    },
    requiredFields: ["dossier_id", "title"],
    inheritableFields: ["dossier_id"],
  },
  dossier: {
    fields: {
      client_id: { class: INFERENCE_CLASS.AUTO_IF_CONTEXTUAL },
      title: { class: INFERENCE_CLASS.AUTO_SAFE },
      status: { class: INFERENCE_CLASS.AUTO_SAFE },
      priority: { class: INFERENCE_CLASS.AUTO_SAFE },
      phase: { class: INFERENCE_CLASS.AUTO_SAFE },
    },
    requiredFields: ["client_id", "title"],
    inheritableFields: ["client_id"],
  },
});

function toKeySet(entries) {
  return new Set(Array.isArray(entries) ? entries.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean) : []);
}

function getBaseClass(fieldName) {
  const field = String(fieldName || "").trim().toLowerCase();
  if (!field) return INFERENCE_CLASS.NEVER_AUTO;
  if (field.endsWith("_id")) return INFERENCE_CLASS.AUTO_IF_CONTEXTUAL;
  if (field === "status" || field === "priority") return INFERENCE_CLASS.AUTO_SAFE;
  if (field === "title" || field === "name") return INFERENCE_CLASS.AUTO_SAFE;
  if (field === "due_date" || field === "scheduled_at") return INFERENCE_CLASS.AUTO_IF_HIGH_CONFIDENCE;
  return INFERENCE_CLASS.NEVER_AUTO;
}

function buildFieldDefinition(fieldName, override = {}) {
  const inferenceClass = override.class || getBaseClass(fieldName);
  return {
    class: inferenceClass,
    strategyRefs: Array.isArray(override.strategyRefs) ? override.strategyRefs : [],
    semanticStrategyRefs: Array.isArray(override.semanticStrategyRefs) ? override.semanticStrategyRefs : [],
    temporalStrategyRefs: Array.isArray(override.temporalStrategyRefs) ? override.temporalStrategyRefs : [],
    threshold: Number.isFinite(Number(override.threshold)) ? Number(override.threshold) : undefined,
    contextSources: Array.isArray(override.contextSources) ? override.contextSources : [],
    correctionPolicy: override.correctionPolicy || null,
    neverAutoReason: override.neverAutoReason || null,
    allowedValues: Array.isArray(override.allowedValues) ? override.allowedValues : [],
  };
}

function getInferenceProfile(entityType) {
  const normalizedType = String(entityType || "").trim().toLowerCase();
  if (!normalizedType) return null;

  const adapter = getAdapter(normalizedType);
  const createFields = toKeySet(adapter?.allowedFields || []);
  const updateFields = toKeySet(adapter?.allowedUpdateFields || []);
  const mutableFields = new Set([...createFields, ...updateFields]);

  const override = ENTITY_OVERRIDES[normalizedType] || {};
  const overrideFields = override.fields && typeof override.fields === "object" ? override.fields : {};
  for (const fieldName of Object.keys(overrideFields)) {
    mutableFields.add(String(fieldName || "").trim().toLowerCase());
  }

  const fields = {};
  for (const fieldName of mutableFields) {
    fields[fieldName] = buildFieldDefinition(fieldName, overrideFields[fieldName] || {});
  }

  return {
    entityType: normalizedType,
    requiredFields: Array.from(
      new Set([
        ...(Array.isArray(override.requiredFields) ? override.requiredFields : (adapter?.requiredCreateFields || [])),
        ...getRequiredFields(normalizedType),
      ]),
    ),
    inheritableFields: Array.isArray(override.inheritableFields) ? override.inheritableFields : Object.keys(fields).filter((field) => field.endsWith("_id")),
    validationBindings: {
      adapterValidation: true,
      domainValidation: true,
    },
    thresholds: {
      global: DEFAULT_THRESHOLD,
      ...(override.thresholds && typeof override.thresholds === "object" ? override.thresholds : {}),
    },
    fields,
  };
}

module.exports = {
  INFERENCE_CLASS,
  DEFAULT_THRESHOLD,
  getInferenceProfile,
};
