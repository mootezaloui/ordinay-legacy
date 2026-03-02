"use strict";

const { EventEmitter } = require("events");

const ENTITY_MUTATION_SUCCESS_EVENT = "ENTITY_MUTATION_SUCCESS";
const INTERNAL_EMITTER_EVENT = "entity-mutation-success";
const emitter = new EventEmitter();

function normalizeOperation(value, fallback = "update") {
  const op = String(value || fallback).trim().toLowerCase();
  if (op === "create" || op === "update" || op === "delete" || op === "attach") return op;
  return fallback;
}

function normalizeEntityType(value) {
  return String(value || "").trim().toLowerCase() || null;
}

function normalizeEntityId(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return null;
}

function pickScopeNumber(...candidates) {
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function inferScopeFromPayload(payload = {}) {
  return {
    clientId: pickScopeNumber(payload.clientId, payload.client_id),
    dossierId: pickScopeNumber(payload.dossierId, payload.dossier_id),
    lawsuitId: pickScopeNumber(payload.lawsuitId, payload.lawsuit_id),
    parentEntityType:
      normalizeEntityType(payload.parentEntityType || payload.parent_entity_type) || undefined,
    parentEntityId: pickScopeNumber(payload.parentEntityId, payload.parent_entity_id),
  };
}

function inferScopeFromMutationResult(result = {}, params = {}, operation = "update") {
  const data =
    result?.after ||
    result?.updatedRow ||
    result?.createdRow ||
    result?.linkedTo ||
    result?.attachmentSummary?.target ||
    {};
  const scope = inferScopeFromPayload({
    ...params,
    ...data,
    ...(params?.target && typeof params.target === "object"
      ? {
          parentEntityType: params.target.type,
          parentEntityId: params.target.id,
        }
      : {}),
  });
  if (operation === "attach") {
    if (!scope.parentEntityType && params?.target?.type) {
      scope.parentEntityType = normalizeEntityType(params.target.type) || undefined;
    }
    if (!scope.parentEntityId && params?.target?.id) {
      scope.parentEntityId = normalizeEntityId(params.target.id) || undefined;
    }
  }
  return scope;
}

function buildMutationEventsFromExecution({
  proposal = null,
  executionResult = null,
  sessionId = null,
  source = "agent",
} = {}) {
  const action = executionResult?.executedActions?.[0] || null;
  const rootResult = action?.result || null;
  const actionType = String(action?.actionType || proposal?.actionType || "").toUpperCase();
  const params = proposal?.params || {};
  const events = [];

  const emit = ({ entityType, entityId, operation, scope = {} }) => {
    const normalizedType = normalizeEntityType(entityType);
    if (!normalizedType) return;
    events.push({
      type: ENTITY_MUTATION_SUCCESS_EVENT,
      entityType: normalizedType,
      entityId: normalizeEntityId(entityId),
      operation: normalizeOperation(operation),
      scope: {
        clientId: scope.clientId,
        dossierId: scope.dossierId,
        lawsuitId: scope.lawsuitId,
        parentEntityType: scope.parentEntityType,
        parentEntityId: scope.parentEntityId,
      },
      sessionId: sessionId || null,
      source,
      timestamp: new Date().toISOString(),
    });
  };

  if (actionType === "EXECUTE_MUTATION_WORKFLOW" && Array.isArray(rootResult?.stepResults)) {
    for (const step of rootResult.stepResults) {
      if (!step || step.ok !== true || !step.result || step.result.ok !== true) continue;
      const stepActionType = String(step.actionType || "").toUpperCase();
      const stepOp =
        stepActionType === "CREATE_ENTITY"
          ? "create"
          : stepActionType === "DELETE_ENTITY"
            ? "delete"
            : stepActionType === "ATTACH_TO_ENTITY"
              ? "attach"
              : "update";
      emit({
        entityType: step.result.entityType,
        entityId: step.result.entityId || step.result.id,
        operation: step.result.operation || stepOp,
        scope: inferScopeFromMutationResult(step.result, step.params || params, stepOp),
      });
    }
    return events;
  }

  const operation =
    actionType === "CREATE_ENTITY"
      ? "create"
      : actionType === "DELETE_ENTITY"
        ? "delete"
        : actionType === "ATTACH_TO_ENTITY"
          ? "attach"
          : "update";
  emit({
    entityType:
      rootResult?.entityType ||
      params?.entityType ||
      params?.target?.type ||
      params?.sourceType ||
      null,
    entityId:
      rootResult?.entityId ||
      rootResult?.id ||
      params?.entityId ||
      params?.target?.id ||
      params?.sourceId ||
      null,
    operation,
    scope: inferScopeFromMutationResult(rootResult, params, operation),
  });
  return events;
}

function emitEntityMutationSuccess(event) {
  if (!event || event.type !== ENTITY_MUTATION_SUCCESS_EVENT) return;
  emitter.emit(INTERNAL_EMITTER_EVENT, event);
}

function emitEntityMutationEventsFromExecution(payload = {}) {
  const events = buildMutationEventsFromExecution(payload);
  for (const event of events) {
    emitEntityMutationSuccess(event);
  }
  return events;
}

function subscribeEntityMutationSuccess(listener) {
  if (typeof listener !== "function") return () => {};
  emitter.on(INTERNAL_EMITTER_EVENT, listener);
  return () => emitter.off(INTERNAL_EMITTER_EVENT, listener);
}

module.exports = {
  ENTITY_MUTATION_SUCCESS_EVENT,
  buildMutationEventsFromExecution,
  emitEntityMutationEventsFromExecution,
  subscribeEntityMutationSuccess,
};
