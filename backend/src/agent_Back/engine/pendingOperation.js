"use strict";

const crypto = require("crypto");

const DEFAULT_PENDING_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.AGENT_PENDING_OPERATION_TTL_MS || `${30 * 60 * 1000}`, 10),
);

const PENDING_STATUS = Object.freeze({
  AWAITING_RESOLUTION: "awaiting_resolution",
  READY_TO_RESUME: "ready_to_resume",
  RESUMED: "resumed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

function nowIso() {
  return new Date().toISOString();
}

function addMsIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function generatePendingOperationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `pop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function clone(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeResolutionInput(userMessage = "", followUpIntent = null) {
  const normalizedMessage = String(userMessage || "").trim();
  const payload = {
    raw: normalizedMessage,
    id: null,
    reference: null,
    name: null,
    entityType:
      String(
        followUpIntent?.resolutionInput?.entityType ||
          followUpIntent?.resolvedEntity?.type ||
          followUpIntent?.entityType ||
          "",
      ).toLowerCase() || null,
  };

  const resolutionInput = followUpIntent?.resolutionInput || null;
  if (resolutionInput && resolutionInput.id !== undefined && resolutionInput.id !== null) {
    const idNum = Number(resolutionInput.id);
    if (Number.isFinite(idNum) && idNum > 0) payload.id = idNum;
  }

  if (!payload.id && followUpIntent?.resolvedEntity?.id !== undefined) {
    const idNum = Number(followUpIntent.resolvedEntity.id);
    if (Number.isFinite(idNum) && idNum > 0) payload.id = idNum;
  }

  const rawRef =
    resolutionInput?.reference ||
    followUpIntent?.resolvedEntity?.label ||
    normalizedMessage;
  const refMatch = String(rawRef || "").match(/([A-Z]{2,10}-\d{2,8}(?:-\d{1,8})?)/i);
  if (refMatch) payload.reference = refMatch[1].toUpperCase();

  if (!payload.id && normalizedMessage) {
    const asNumber = Number(normalizedMessage);
    if (Number.isFinite(asNumber) && asNumber > 0) payload.id = asNumber;
  }

  if (!payload.reference && resolutionInput?.reference) {
    payload.reference = String(resolutionInput.reference).trim().toUpperCase() || null;
  }

  if (!payload.id && !payload.reference) {
    payload.name =
      (resolutionInput?.name && String(resolutionInput.name).trim()) ||
      (normalizedMessage || null);
  }

  return payload;
}

function _resolveStoreKey(requestContext = {}) {
  const conversationId =
    requestContext?.conversationId || requestContext?.agentSessionId || requestContext?.sessionId || "global";
  const userId = requestContext?.userId || "default";
  return { conversationId: String(conversationId), userId: String(userId) };
}

function _getOperationalStore(engine) {
  const store = engine?.contextStore?._operationalStore;
  return store && typeof store.get === "function" && typeof store.update === "function"
    ? store
    : null;
}

function getPendingOperation(requestContext = {}, { includeExpired = false } = {}) {
  const store = _getOperationalStore(this);
  if (!store) return null;
  const { conversationId, userId } = _resolveStoreKey(requestContext);
  const context = store.get(userId, conversationId);
  const pending = context?.pendingOperation || null;
  if (!pending) return null;

  const expired = pending.expiresAt && new Date(pending.expiresAt).getTime() <= Date.now();
  if (expired && !includeExpired) {
    this.clearPendingOperation(requestContext, "expired");
    return null;
  }
  return clone(pending);
}

function beginPendingOperation(requestContext = {}, descriptor = {}) {
  const store = _getOperationalStore(this);
  if (!store) return null;
  const { conversationId, userId } = _resolveStoreKey(requestContext);
  const existing = this.getPendingOperation(requestContext, { includeExpired: true });
  const id = descriptor.id || existing?.id || generatePendingOperationId();
  const createdAt = existing?.createdAt || nowIso();
  const ttlMs =
    Number.isFinite(Number(descriptor.ttlMs)) && Number(descriptor.ttlMs) > 0
      ? Number(descriptor.ttlMs)
      : DEFAULT_PENDING_TTL_MS;

  const pending = {
    id,
    status: descriptor.status || PENDING_STATUS.AWAITING_RESOLUTION,
    operationType: descriptor.operationType || existing?.operationType || "generic",
    lockedCapability: descriptor.lockedCapability || existing?.lockedCapability || null,
    originalIntent: descriptor.originalIntent || existing?.originalIntent || null,
    originalMessage: descriptor.originalMessage || existing?.originalMessage || null,
    policyVersion: descriptor.policyVersion || existing?.policyVersion || null,
    requiredBindings: Array.isArray(descriptor.requiredBindings)
      ? clone(descriptor.requiredBindings, [])
      : clone(existing?.requiredBindings, []),
    resolvedBindings: clone(descriptor.resolvedBindings, clone(existing?.resolvedBindings, {})),
    executionDescriptor: clone(
      descriptor.executionDescriptor,
      clone(existing?.executionDescriptor, {}),
    ),
    auditMeta: clone(descriptor.auditMeta, clone(existing?.auditMeta, {})),
    createdAt,
    updatedAt: nowIso(),
    expiresAt: addMsIso(ttlMs),
  };

  store.update(userId, conversationId, { pendingOperation: pending });
  this.ledger.record({
    type: "pending_operation_created",
    pendingOperationId: pending.id,
    operationType: pending.operationType,
    status: pending.status,
    conversationId,
    userId,
    timestamp: nowIso(),
  });
  return pending;
}

function clearPendingOperation(requestContext = {}, reason = "cleared") {
  const store = _getOperationalStore(this);
  if (!store) return null;
  const { conversationId, userId } = _resolveStoreKey(requestContext);
  const existing = store.get(userId, conversationId)?.pendingOperation || null;
  if (!existing) return null;

  store.update(userId, conversationId, { pendingOperation: null });
  this.ledger.record({
    type: "pending_operation_cleared",
    pendingOperationId: existing.id || null,
    operationType: existing.operationType || null,
    reason,
    conversationId,
    userId,
    timestamp: nowIso(),
  });
  return existing;
}

async function applyResolutionInput(requestContext = {}, userMessage = "", followUpIntent = null) {
  const pending = this.getPendingOperation(requestContext);
  if (!pending || pending.status === PENDING_STATUS.RESUMED) return null;

  const normalized = normalizeResolutionInput(userMessage, followUpIntent);
  const nextResolved = clone(pending.resolvedBindings, {});
  const requiredBindings = Array.isArray(pending.requiredBindings)
    ? pending.requiredBindings
    : [];

  for (const binding of requiredBindings) {
    const entityType = String(binding?.entityType || "").toLowerCase();
    if (!entityType) continue;
    if (nextResolved[entityType] && nextResolved[entityType].id) continue;

    const explicitType = normalized.entityType;
    const typeMatches = !explicitType || explicitType === entityType;
    if (!typeMatches) continue;

    const tryId = normalized.id;
    const tryRef = normalized.reference;
    const tryName = normalized.name;

    let resolution = null;
    if (tryId) {
      resolution = await this.resolveEntity(
        { entityType, identifier: tryId, mode: "id" },
        this._resolvePolicy(pending.policyVersion || "v3"),
      );
    } else if (tryRef) {
      resolution = await this.resolveEntity(
        { entityType, identifier: tryRef, mode: "name" },
        this._resolvePolicy(pending.policyVersion || "v3"),
      );
    } else if (tryName) {
      resolution = await this.resolveEntity(
        { entityType, identifier: tryName, mode: "name" },
        this._resolvePolicy(pending.policyVersion || "v3"),
      );
    }

    if (resolution?.found && resolution?.entityId) {
      nextResolved[entityType] = {
        type: resolution.entityType || entityType,
        id: Number(resolution.entityId),
        label: resolution.entityLabel || null,
      };
    }
  }

  const ready = this.canResumePendingOperation({
    ...pending,
    resolvedBindings: nextResolved,
  });
  const updated = this.beginPendingOperation(requestContext, {
    ...pending,
    resolvedBindings: nextResolved,
    status: ready ? PENDING_STATUS.READY_TO_RESUME : PENDING_STATUS.AWAITING_RESOLUTION,
  });

  this.ledger.record({
    type: "pending_operation_binding_updated",
    pendingOperationId: pending.id,
    operationType: pending.operationType,
    resolvedBindingCount: Object.keys(nextResolved || {}).length,
    readyToResume: ready,
    timestamp: nowIso(),
  });

  return updated;
}

function canResumePendingOperation(pendingOperation = null) {
  const pending = pendingOperation || null;
  if (!pending) return false;
  const required = Array.isArray(pending.requiredBindings) ? pending.requiredBindings : [];
  if (required.length === 0) return true;
  const resolved = pending.resolvedBindings || {};
  return required.every((binding) => {
    const entityType = String(binding?.entityType || "").toLowerCase();
    if (!entityType) return true;
    return Boolean(resolved[entityType] && Number(resolved[entityType].id) > 0);
  });
}

function _injectResolvedBindingsIntoDescriptor(pendingOperation) {
  const descriptor = clone(pendingOperation?.executionDescriptor, {});
  const resolved = pendingOperation?.resolvedBindings || {};
  if (!descriptor || typeof descriptor !== "object") return {};

  if (!descriptor.target && resolved.dossier) {
    descriptor.target = {
      type: "dossier",
      id: Number(resolved.dossier.id),
    };
  }

  if (descriptor.target && !descriptor.target.id) {
    for (const [entityType, entity] of Object.entries(resolved)) {
      if (descriptor.target.type === entityType && entity?.id) {
        descriptor.target.id = Number(entity.id);
      }
    }
  }

  return descriptor;
}

async function resumePendingOperation(requestContext = {}, handlers = {}) {
  const pending = this.getPendingOperation(requestContext);
  if (!pending) return null;
  if (!this.canResumePendingOperation(pending)) return null;

  const descriptor = _injectResolvedBindingsIntoDescriptor(pending);
  const operationType = String(pending.operationType || "").toLowerCase();
  const handler = handlers[operationType] || handlers.default;
  if (typeof handler !== "function") {
    return { pendingOperation: pending, executionDescriptor: descriptor, deferred: true };
  }

  const result = await handler({
    pendingOperation: pending,
    executionDescriptor: descriptor,
    requestContext,
  });

  this.beginPendingOperation(requestContext, {
    ...pending,
    status: PENDING_STATUS.RESUMED,
    resolvedBindings: pending.resolvedBindings || {},
  });
  this.clearPendingOperation(requestContext, "resumed");
  this.ledger.record({
    type: "pending_operation_resumed",
    pendingOperationId: pending.id,
    operationType: pending.operationType,
    timestamp: nowIso(),
  });
  return result;
}

module.exports = {
  PENDING_STATUS,
  beginPendingOperation,
  getPendingOperation,
  applyResolutionInput,
  canResumePendingOperation,
  resumePendingOperation,
  clearPendingOperation,
};

