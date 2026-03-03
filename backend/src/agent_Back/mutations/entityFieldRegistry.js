"use strict";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toTitleFromMessage(entityType, activeScope = {}) {
  const raw =
    activeScope?.userMessage ||
    activeScope?.originalUserMessage ||
    activeScope?.message ||
    "";
  const text = normalizeText(raw);
  if (!text) {
    return `${String(entityType || "entity").replace(/_/g, " ")} draft`;
  }

  const cleaned = normalizeText(
    text
      .replace(/^(please\s+)?(create|add|open|make|start|set up|setup)\b/i, "")
      .replace(new RegExp(`^${String(entityType || "").replace(/_/g, "[\\s_-]*")}\\b`, "i"), "")
      .replace(/[.!?]+$/g, ""),
  );
  if (!cleaned) {
    return `${String(entityType || "entity").replace(/_/g, " ")} draft`;
  }
  return cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned;
}

function resolveScopeId(activeScope = {}, scopeKey = "", resolvedType = null) {
  const idFromScope = Number(activeScope?.[scopeKey]);
  if (Number.isInteger(idFromScope) && idFromScope > 0) return idFromScope;

  const resolved = activeScope?.resolvedEntity;
  const resolvedEntityType = String(resolved?.type || "").toLowerCase();
  const resolvedEntityId = Number(resolved?.id);
  if (
    resolvedType &&
    resolvedEntityType === String(resolvedType).toLowerCase() &&
    Number.isInteger(resolvedEntityId) &&
    resolvedEntityId > 0
  ) {
    return resolvedEntityId;
  }
  return null;
}

const SHARED_FIELDS = Object.freeze({
  status: { required: false, category: "structural" },
  priority: { required: false, category: "structural" },
});

const entityFieldRegistry = Object.freeze({
  client: Object.freeze({
    name: { required: true, category: "critical" },
    cin: { required: true, category: "critical" },
    email: { required: false, category: "critical" },
    tax_id: { required: false, category: "critical" },
    status: { required: false, category: "structural", default: "active" },
    priority: { required: false, category: "structural", default: "medium" },
  }),
  dossier: Object.freeze({
    client_id: {
      required: true,
      category: "structural",
      default: ({ activeScope }) => resolveScopeId(activeScope, "clientId", "client"),
    },
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    status: { required: false, category: "structural", default: "open" },
    priority: { required: false, category: "structural", default: "medium" },
    phase: { required: false, category: "structural", default: "initiation" },
  }),
  lawsuit: Object.freeze({
    dossier_id: {
      required: true,
      category: "structural",
      default: ({ activeScope }) => resolveScopeId(activeScope, "dossierId", "dossier"),
    },
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    status: { required: false, category: "structural", default: "open" },
    priority: { required: false, category: "structural", default: "medium" },
  }),
  task: Object.freeze({
    dossier_id: {
      required: false,
      category: "structural",
      default: ({ activeScope, payload }) =>
        payload?.lawsuit_id
          ? null
          : resolveScopeId(activeScope, "dossierId", "dossier"),
    },
    lawsuit_id: {
      required: false,
      category: "structural",
      default: ({ activeScope, payload }) =>
        payload?.dossier_id
          ? null
          : resolveScopeId(activeScope, "lawsuitId", "lawsuit"),
    },
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    status: { required: false, category: "structural", default: "pending" },
    priority: { required: false, category: "structural", default: "medium" },
  }),
  personal_task: Object.freeze({
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    status: { required: false, category: "structural", default: "pending" },
    priority: { required: false, category: "structural", default: "medium" },
  }),
  mission: Object.freeze({
    dossier_id: {
      required: false,
      category: "structural",
      default: ({ activeScope, payload }) =>
        payload?.lawsuit_id
          ? null
          : resolveScopeId(activeScope, "dossierId", "dossier"),
    },
    lawsuit_id: {
      required: false,
      category: "structural",
      default: ({ activeScope, payload }) =>
        payload?.dossier_id
          ? null
          : resolveScopeId(activeScope, "lawsuitId", "lawsuit"),
    },
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    status: { required: false, category: "structural", default: "planned" },
    priority: { required: false, category: "structural", default: "medium" },
  }),
  session: Object.freeze({
    dossier_id: {
      required: false,
      category: "structural",
      default: ({ activeScope, payload }) =>
        payload?.lawsuit_id
          ? null
          : resolveScopeId(activeScope, "dossierId", "dossier"),
    },
    lawsuit_id: {
      required: false,
      category: "structural",
      default: ({ activeScope, payload }) =>
        payload?.dossier_id
          ? null
          : resolveScopeId(activeScope, "lawsuitId", "lawsuit"),
    },
    scheduled_at: { required: true, category: "critical" },
    status: { required: false, category: "structural", default: "scheduled" },
    priority: { required: false, category: "structural", default: "medium" },
  }),
  document: Object.freeze({
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    file_path: { required: true, category: "critical" },
  }),
  financial_entry: Object.freeze({
    entry_type: { required: true, category: "critical" },
    amount: { required: true, category: "critical" },
    priority: { required: false, category: "structural", default: "medium" },
  }),
  officer: Object.freeze({
    name: { required: true, category: "critical" },
    email: { required: false, category: "critical" },
    registration_number: { required: false, category: "critical" },
  }),
  note: Object.freeze({
    entity_type: { required: true, category: "structural" },
    entity_id: { required: true, category: "structural" },
    content: { required: true, category: "critical" },
  }),
  notification: Object.freeze({
    type: { required: true, category: "structural" },
    template_key: { required: true, category: "structural" },
    payload: { required: true, category: "structural" },
    dedupe_key: { required: true, category: "critical" },
    severity: { required: true, category: "structural" },
  }),
});

function getEntityFieldSchema(entityType = "") {
  const normalized = String(entityType || "").toLowerCase();
  return entityFieldRegistry[normalized] || {};
}

module.exports = {
  entityFieldRegistry,
  getEntityFieldSchema,
  SHARED_FIELDS,
};
