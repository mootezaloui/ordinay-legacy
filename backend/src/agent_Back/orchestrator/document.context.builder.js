"use strict";

const operatorsService = require("../../services/operators.service");

function normalizeLawyer(operator) {
  if (!operator || typeof operator !== "object") return null;
  return {
    fullName: operator.name || null,
    title: operator.title || operator.role || null,
    firmName: operator.office_name || operator.office || null,
    officeAddress: operator.office_address || null,
    email: operator.email || null,
    phone: operator.phone || operator.mobile || null,
    licenseNumber: operator.bar_number || operator.bar_id || null,
  };
}

function normalizeClient(client) {
  if (!client || typeof client !== "object") return null;
  return {
    fullName: client.name || null,
    email: client.email || null,
    phone: client.phone || client.alternate_phone || null,
  };
}

function normalizeDossier(dossier) {
  if (!dossier || typeof dossier !== "object") return null;
  return {
    reference: dossier.reference || dossier.code || null,
    title: dossier.title || null,
    status: dossier.status || null,
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function safeRead(readTool, toolName, params) {
  if (typeof readTool !== "function") return null;
  try {
    const result = await readTool(toolName, params);
    return result && typeof result === "object" ? result : null;
  } catch (_) {
    return null;
  }
}

async function buildDocumentContext({ activeScope, readTool } = {}) {
  const context = {
    lawyer: null,
    client: null,
    dossier: null,
    system: { today: todayIsoDate() },
    internal: { clientDbId: null },
  };

  try {
    context.lawyer = normalizeLawyer(operatorsService.getCurrentOperator());
  } catch (_) {
    context.lawyer = null;
  }

  const scopeType = String(activeScope?.entityType || "").toLowerCase();
  const scopeId = Number(activeScope?.entityId || 0);
  if (!scopeType || !Number.isInteger(scopeId) || scopeId <= 0) {
    return context;
  }

  if (scopeType === "client") {
    const row = await safeRead(readTool, "getClient", { clientId: scopeId });
    const client = row?.client || null;
    context.client = normalizeClient(client);
    context.internal.clientDbId = Number(client?.id) > 0 ? Number(client.id) : null;
    return context;
  }

  if (scopeType === "dossier") {
    const row = await safeRead(readTool, "getDossier", { dossierId: scopeId });
    const dossier = row?.dossier || null;
    context.dossier = normalizeDossier(dossier);

    const clientId = Number(dossier?.client_id || 0);
    if (Number.isInteger(clientId) && clientId > 0) {
      const clientRow = await safeRead(readTool, "getClient", { clientId });
      const client = clientRow?.client || null;
      context.client = normalizeClient(client);
      context.internal.clientDbId = Number(client?.id) > 0 ? Number(client.id) : clientId;
    }
    return context;
  }

  return context;
}

module.exports = {
  buildDocumentContext,
};

