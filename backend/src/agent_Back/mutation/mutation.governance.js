"use strict";

const { detectReadIntent, detectDraftIntent } = require("../intent.classifier");
const adaptersRegistry = require("../entities/adapters");
const { getAdapter } = require("../engine/entityAdapters");
const { parseJsonResponse } = require("../llm/llm.validation");
const { resolveEntityTypeFromMessage, normalizeEntityType } = require("./mutation.entityTypeResolver");
const {
  getCompatibleParentTypes,
  getPayloadFieldForParent,
} = require("../context/scopeDomainRelations");
const { applyHierarchicalScopeBinding } = require("./hierarchicalScopeBinder");

const MUTATION_GOVERNANCE_CREATE_THRESHOLD = 0.72;
const MUTATION_GOVERNANCE_UPDATE_THRESHOLD = 0.75;

const ENTITY_SCOPE_KEY_BY_TYPE = Object.freeze({
  client: "clientId",
  dossier: "dossierId",
  lawsuit: "lawsuitId",
  task: "taskId",
  personal_task: "personalTaskId",
  session: "sessionId",
  mission: "missionId",
  officer: "officerId",
  financial_entry: "financialEntryId",
  document: "documentId",
  note: "noteId",
});

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function resolveDeepestScope(context = {}) {
  const order = [
    "task",
    "session",
    "mission",
    "financial_entry",
    "lawsuit",
    "dossier",
    "client",
    "note",
  ];
  for (const entityType of order) {
    const key = ENTITY_SCOPE_KEY_BY_TYPE[entityType];
    const id = toNumber(context?.[key]);
    if (id) return { entityType, entityId: id, scopeKey: key };
  }
  const resolvedType = normalizeEntityType(context?.resolvedEntity?.type);
  const resolvedId = toNumber(context?.resolvedEntity?.id);
  if (resolvedType && resolvedId) {
    return { entityType: resolvedType, entityId: resolvedId, scopeKey: null };
  }
  return null;
}

function hasPresentValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && !value.trim()) return false;
  return true;
}

function buildScopeIdByType(context = {}) {
  const byType = {};
  const deepest = resolveDeepestScope(context);
  if (deepest?.entityType && deepest?.entityId) {
    byType[deepest.entityType] = toNumber(deepest.entityId);
  }
  const resolvedType = normalizeEntityType(context?.resolvedEntity?.type);
  const resolvedId = toNumber(context?.resolvedEntity?.id);
  if (resolvedType && resolvedId && !byType[resolvedType]) {
    byType[resolvedType] = resolvedId;
  }
  for (const [entityType, scopeKey] of Object.entries(ENTITY_SCOPE_KEY_BY_TYPE)) {
    const id = toNumber(context?.[scopeKey]);
    if (id && !byType[entityType]) {
      byType[entityType] = id;
    }
  }
  return byType;
}

function hasFutureIntentStructure(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  const mutationAction =
    "(?:create|add|set|update|edit|change|mark|assign|schedule|delete|remove|rename|reschedule)";
  return (
    new RegExp(`\\b(?:will|shall)\\s+${mutationAction}\\b`).test(text) ||
    new RegExp(`\\b(?:am|is|are|was|were|be)\\s+going\\s+to\\s+${mutationAction}\\b`).test(
      text,
    ) ||
    new RegExp(`\\babout\\s+to\\s+${mutationAction}\\b`).test(text) ||
    new RegExp(`\\b(?:plan|intend|aim|expect|prepare)\\s+to\\s+${mutationAction}\\b`).test(
      text,
    )
  );
}

function hasMutationVerbStructure(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  return /\b(create|add|set|update|edit|change|mark|assign|schedule|delete|remove|rename|reschedule)\b/.test(
    text,
  );
}

function hasListPlanningIntent(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  if (/\b(create|make|build|prepare|give|show|suggest)\s+(me\s+)?(a\s+)?(list|checklist|plan)\b/.test(text)) {
    return true;
  }
  if (/\bwhat\s+should\s+we\s+do\b/.test(text)) return true;
  if (/\b(list|checklist|plan)\s+of\s+(tasks?|missions?|sessions?|steps?)\b/.test(text)) return true;
  return false;
}

function hasStrongReadRequest(message, readIntent) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  if (
    /\b(show|list|open|view|read|give|get|display|see|fetch|retrieve|find|lookup|look up)\b/.test(
      text,
    )
  ) {
    return true;
  }
  return Boolean(readIntent?.intent && String(readIntent.intent).toUpperCase().startsWith("LIST_"));
}

function extractScopeBoundFields(entityType, context = {}) {
  const payload = {};
  const deepestScope = resolveDeepestScope(context);
  const scopeIdByType = buildScopeIdByType(context);
  const resolvedType = normalizeEntityType(context?.resolvedEntity?.type);
  const resolvedId = toNumber(context?.resolvedEntity?.id);
  try {
    const adapter = getAdapter(entityType);
    const required = Array.isArray(adapter?.requiredCreateFields)
      ? adapter.requiredCreateFields
      : [];
    for (const field of required) {
      if (!/_id$/i.test(String(field || ""))) continue;
      const parentType = normalizeEntityType(String(field).replace(/_id$/i, ""));
      const scopeKey = ENTITY_SCOPE_KEY_BY_TYPE[parentType] || `${parentType}Id`;
      let id = toNumber(context?.[scopeKey]);
      if (!id && resolvedType === parentType && resolvedId) {
        id = resolvedId;
      }
      if (!id && deepestScope?.entityType === parentType && deepestScope?.entityId) {
        id = toNumber(deepestScope.entityId);
      }
      if (id) payload[field] = id;
    }

    // Generic child->parent binding even when parent fields are not adapter-required.
    const compatibleParentTypes = getCompatibleParentTypes({
      childEntityType: entityType,
      operation: "create",
    });
    if (Array.isArray(compatibleParentTypes) && compatibleParentTypes.length > 0) {
      const preferredParentType =
        (compatibleParentTypes.includes(deepestScope?.entityType) && deepestScope?.entityType) ||
        compatibleParentTypes.find((parentType) => hasPresentValue(scopeIdByType[parentType])) ||
        null;
      if (preferredParentType) {
        const payloadField = getPayloadFieldForParent({
          childEntityType: entityType,
          parentEntityType: preferredParentType,
        });
        const parentId = toNumber(scopeIdByType[preferredParentType]);
        if (payloadField && parentId && !hasPresentValue(payload[payloadField])) {
          payload[payloadField] = parentId;
        }
      }
    }
  } catch (_) {
    // Adapter may not exist for unsupported types.
  }
  return payload;
}

function extractDeterministicFields(message, entityType) {
  const text = String(message || "").trim();
  if (!text) return {};
  const fields = {};
  if (entityType !== "document") {
    const titleMatch =
      text.match(/\bfor\s+([^,.!?]{3,120})/i) ||
      text.match(/\babout\s+([^,.!?]{3,120})/i);
    if (titleMatch && String(titleMatch[1] || "").trim()) {
      fields.title = String(titleMatch[1]).trim();
    }
  }
  const statusMatch = text.match(/\bstatus\s+(?:to|as)\s+([a-z_ -]{2,40})\b/i);
  if (statusMatch && String(statusMatch[1] || "").trim()) {
    fields.status = String(statusMatch[1]).trim().toLowerCase();
  }
  return fields;
}

async function extractFieldsWithLLM({ llmExtractor, userMessage, entityType }) {
  if (typeof llmExtractor !== "function") return {};
  const prompt = [
    `Extract fields for entityType='${String(entityType || "").toLowerCase()}' from user message.`,
    'Return JSON only: {"fields":{}}',
    "Rules:",
    "- Best-effort extraction only.",
    "- Entity type is fixed and must not be changed.",
    "- Do not invent IDs.",
    "- Use canonical DB-style field names when possible (snake_case).",
    `message: ${String(userMessage || "")}`,
  ].join("\n");
  let raw = "";
  try {
    raw = await Promise.race([
      llmExtractor(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("MUTATION_GOVERNANCE_LLM_TIMEOUT")), 1500),
      ),
    ]);
  } catch (_) {
    return {};
  }
  const parsed = parseJsonResponse(raw);
  const fields = parsed?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
  return fields;
}

async function inferEntityAndFieldsWithLLM({ llmExtractor, userMessage, knownEntityTypes = [] }) {
  if (typeof llmExtractor !== "function") return { entityType: null, fields: {} };
  const prompt = [
    "Infer mutation entityType and extract fields from user message.",
    'Return JSON only: {"entityType":"string|null","fields":{}}',
    "Rules:",
    "- Best-effort extraction only.",
    "- Do not invent IDs.",
    "- Use canonical entityType from knownEntityTypes.",
    `knownEntityTypes: ${JSON.stringify(Array.isArray(knownEntityTypes) ? knownEntityTypes : [])}`,
    `message: ${String(userMessage || "")}`,
  ].join("\n");
  let raw = "";
  try {
    raw = await Promise.race([
      llmExtractor(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("MUTATION_GOVERNANCE_LLM_TIMEOUT")), 1500),
      ),
    ]);
  } catch (_) {
    return { entityType: null, fields: {} };
  }
  const parsed = parseJsonResponse(raw);
  const entityType = normalizeEntityType(parsed?.entityType || "");
  const fields =
    parsed?.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
      ? parsed.fields
      : {};
  return { entityType: entityType || null, fields };
}

function computeMissingRequiredFields(entityType, payload = {}) {
  const missing = [];
  try {
    const adapter = getAdapter(entityType);
    const required = Array.isArray(adapter?.requiredCreateFields)
      ? adapter.requiredCreateFields
      : [];
    missing.push(
      ...required.filter((field) => {
      const value = payload?.[field];
      if (value === null || value === undefined) return true;
      if (typeof value === "string" && !value.trim()) return true;
      return false;
      }),
    );
  } catch (_) {
    return missing;
  }
  // Generic parent-linking requirement (e.g., task/session/mission need dossier_id or lawsuit_id).
  const compatibleParentTypes = getCompatibleParentTypes({
    childEntityType: entityType,
    operation: "create",
  });
  const payloadParentFields = Array.from(
    new Set(
      (Array.isArray(compatibleParentTypes) ? compatibleParentTypes : [])
        .map((parentType) =>
          getPayloadFieldForParent({ childEntityType: entityType, parentEntityType: parentType }),
        )
        .filter(Boolean),
    ),
  );
  if (
    payloadParentFields.length > 0 &&
    !payloadParentFields.some((field) => hasPresentValue(payload?.[field]))
  ) {
    missing.push(...payloadParentFields);
  }
  return Array.from(new Set(missing));
}

async function evaluateMutationGovernance({
  userMessage,
  requestContext = {},
  executionContext = {},
  llmExtractor = null,
} = {}) {
  const text = String(userMessage || "").trim();
  const mergedContext = {
    ...(requestContext || {}),
    ...(executionContext || {}),
  };
  const deepestScope = resolveDeepestScope(mergedContext);
  const readIntent = detectReadIntent(text, mergedContext);
  const draftIntent = detectDraftIntent(text, mergedContext);
  const knownEntityTypes = Array.from(adaptersRegistry.keys()).map((v) =>
    normalizeEntityType(v),
  );
  const promotionLockedEntityType = normalizeEntityType(
    mergedContext?.promotionLockEntityType || "",
  );
  const hasPromotionEntityLock =
    Boolean(promotionLockedEntityType) && knownEntityTypes.includes(promotionLockedEntityType);
  const previousMutationContext =
    requestContext?.previousMutationContext ||
    executionContext?.previousMutationContext ||
    null;
  const entityTypeResolution = hasPromotionEntityLock
    ? {
        status: "resolved",
        entityType: promotionLockedEntityType,
        source: String(mergedContext?.promotionLockReason || "promotion_lock"),
        candidates: [promotionLockedEntityType],
      }
    : resolveEntityTypeFromMessage({
        userMessage: text,
        knownEntityTypes,
        previousMutationContext,
      });
  const futureSignal = hasFutureIntentStructure(text);
  const mutationSignal = hasMutationVerbStructure(text);
  const listPlanningIntent = hasListPlanningIntent(text);
  const strongRead = hasStrongReadRequest(text, readIntent);
  const strongMutation = (mutationSignal || futureSignal) && !listPlanningIntent;
  const effectiveStrongRead = strongRead && !strongMutation;
  const hasDeterministicEntityType =
    String(entityTypeResolution?.status || "").toLowerCase() === "resolved";
  if (
    draftIntent?.intent &&
    !strongMutation &&
    !hasDeterministicEntityType &&
    !hasPromotionEntityLock
  ) {
    return {
      intent: "draft_document",
      entityType: null,
      confidence: 0.9,
      scopeHints: { deepestScope },
      extractedFields: {},
      missingRequiredFields: [],
      dedupeQuery: null,
      reason: "draft_intent_detected",
      shouldBypassReadResolution: false,
      entityTypeResolution: {
        status: entityTypeResolution?.status || "none",
        source: entityTypeResolution?.source || "none",
        candidates: Array.isArray(entityTypeResolution?.candidates)
          ? entityTypeResolution.candidates
          : [],
      },
    };
  }

  const activeEntityType = normalizeEntityType(requestContext?.resolvedEntity?.type);
  const activeEntityId = toNumber(requestContext?.resolvedEntity?.id);

  let routedIntent = "message";
  let routedEntityType =
    String(entityTypeResolution?.status || "").toLowerCase() === "resolved"
      ? normalizeEntityType(entityTypeResolution.entityType)
      : "";
  let confidence = hasPromotionEntityLock ? 0.95 : 0.2;

  if (hasPromotionEntityLock) {
    routedIntent = "create";
  }

  const explicitUpdate = /\b(update|edit|change|set|mark|assign|reschedule|rename)\b/i.test(text);
  const explicitCreate = /\b(create|add|open|new)\b/i.test(text);
  const ambiguousEntityType =
    String(entityTypeResolution?.status || "").toLowerCase() === "ambiguous";

  if (!hasPromotionEntityLock && !effectiveStrongRead && ambiguousEntityType && strongMutation) {
    routedIntent = "create";
    routedEntityType = null;
    confidence = 0.78;
  } else if (!hasPromotionEntityLock && !effectiveStrongRead && routedEntityType) {
    if (
      explicitCreate ||
      futureSignal
    ) {
      routedIntent = "create";
      confidence = futureSignal ? 0.82 : explicitCreate ? 0.8 : 0.7;
    } else if (
      explicitUpdate ||
      (mutationSignal && activeEntityType && activeEntityType === routedEntityType && activeEntityId)
    ) {
      routedIntent = "update";
      confidence = activeEntityId ? 0.86 : 0.62;
    } else if (mutationSignal) {
      routedIntent = "create";
      confidence = 0.7;
    }
  }

  if (
    !hasPromotionEntityLock &&
    !routedEntityType &&
    !effectiveStrongRead &&
    strongMutation &&
    !ambiguousEntityType
  ) {
    const inferred = await inferEntityAndFieldsWithLLM({
      llmExtractor,
      userMessage: text,
      knownEntityTypes,
    });
    const inferredType = normalizeEntityType(inferred?.entityType || "");
    if (inferredType && knownEntityTypes.includes(inferredType)) {
      routedEntityType = inferredType;
      confidence = Math.max(confidence, 0.7);
    }
  }

  if (
    !hasPromotionEntityLock &&
    (!routedEntityType || (!ENTITY_SCOPE_KEY_BY_TYPE[routedEntityType] && !knownEntityTypes.includes(routedEntityType)))
  ) {
    if (readIntent?.intent && !(ambiguousEntityType && strongMutation)) routedIntent = "read";
    if (!readIntent?.intent && strongMutation) {
      routedIntent = "create";
      confidence = Math.max(confidence, 0.74);
    } else {
      confidence = Math.max(confidence, readIntent?.intent ? 0.75 : 0.2);
    }
  }

  if (!hasPromotionEntityLock && effectiveStrongRead && routedIntent !== "update") {
    routedIntent = "read";
    confidence = 0.88;
  }

  const deterministicFields = extractDeterministicFields(text, routedEntityType || "");
  let llmFields = {};
  if ((routedIntent === "create" || routedIntent === "update") && routedEntityType && !hasPromotionEntityLock) {
    llmFields = await extractFieldsWithLLM({
      llmExtractor,
      userMessage: text,
      entityType: routedEntityType,
    });
  } else if (
    (routedIntent === "create" || routedIntent === "update") &&
    !routedEntityType &&
    !hasPromotionEntityLock
  ) {
    const inferred = await inferEntityAndFieldsWithLLM({
      llmExtractor,
      userMessage: text,
      knownEntityTypes,
    });
    const inferredType = normalizeEntityType(inferred?.entityType || "");
    if (inferredType && knownEntityTypes.includes(inferredType)) {
      routedEntityType = inferredType;
      llmFields = inferred?.fields || {};
    }
  }
  const extractedFields = {
    ...deterministicFields,
    ...llmFields,
  };

  const scopeBoundFields =
    routedIntent === "create" && routedEntityType
      ? extractScopeBoundFields(routedEntityType, mergedContext)
      : {};
  const createPayload =
    routedIntent === "create"
      ? {
          ...extractedFields,
          ...scopeBoundFields,
        }
      : null;
  let parentResolution = null;
  let preparedCreatePayload = createPayload;
  if (routedIntent === "create" && routedEntityType && createPayload) {
    const hierarchical = applyHierarchicalScopeBinding({
      entityType: routedEntityType,
      payload: createPayload,
      activeScope: mergedContext,
    });
    preparedCreatePayload = hierarchical?.preparedPayload || createPayload;
    parentResolution = {
      status: String(hierarchical?.status || "ready"),
      source: String(hierarchical?.resolutionSource || "unknown"),
      missingParentFields: Array.isArray(hierarchical?.missingParentFields)
        ? hierarchical.missingParentFields
        : [],
      parentSelection:
        hierarchical?.parentSelection &&
        typeof hierarchical.parentSelection === "object"
          ? hierarchical.parentSelection
          : null,
    };
  }
  const missingRequiredFields =
    routedIntent === "create"
      ? routedEntityType
        ? computeMissingRequiredFields(routedEntityType, preparedCreatePayload)
        : ["entity_type"]
      : [];

  const dedupeQuery =
    routedIntent === "create" || routedIntent === "update"
      ? {
          entityType: routedEntityType,
          query:
            typeof extractedFields?.title === "string" && extractedFields.title.trim()
              ? extractedFields.title.trim()
              : null,
          scope: deepestScope
            ? { entityType: deepestScope.entityType, entityId: deepestScope.entityId }
            : null,
        }
      : null;

  return {
    intent: routedIntent === "message" && readIntent?.intent ? "read" : routedIntent,
    entityType: routedEntityType || null,
    confidence,
    scopeHints: {
      deepestScope,
      activeEntity:
        activeEntityType && activeEntityId
          ? { entityType: activeEntityType, entityId: activeEntityId }
          : null,
      scopeBoundFields,
    },
    extractedFields: preparedCreatePayload || extractedFields,
    parentResolution,
    parentSelection: parentResolution?.parentSelection || null,
    missingRequiredFields,
    dedupeQuery,
    signals: {
      futureSignal,
      mutationSignal,
      strongRead: effectiveStrongRead,
      promotionEntityLock: hasPromotionEntityLock,
      listPlanningIntent,
    },
    entityTypeResolution: {
      status: entityTypeResolution?.status || "none",
      source: entityTypeResolution?.source || "none",
      candidates: Array.isArray(entityTypeResolution?.candidates)
        ? entityTypeResolution.candidates
        : [],
    },
    shouldBypassReadResolution:
      hasPromotionEntityLock ||
      (routedIntent === "create" && confidence >= MUTATION_GOVERNANCE_CREATE_THRESHOLD) ||
      (routedIntent === "update" && confidence >= MUTATION_GOVERNANCE_UPDATE_THRESHOLD),
  };
}

module.exports = {
  evaluateMutationGovernance,
  MUTATION_GOVERNANCE_CREATE_THRESHOLD,
  MUTATION_GOVERNANCE_UPDATE_THRESHOLD,
};
