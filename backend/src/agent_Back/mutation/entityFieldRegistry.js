"use strict";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function isoDatePlusDays(days = 0) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return isoDate(base);
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

function toDescriptionFromTitle(payload = {}, entityType = "entity") {
  const title = normalizeText(payload?.title || "");
  if (title) return `Details: ${title}`;
  return `${String(entityType || "entity").replace(/_/g, " ")} details`;
}

const SHARED_FIELDS = Object.freeze({
  status: { required: false, category: "structural" },
  priority: { required: false, category: "structural" },
});

const entityFieldRegistry = Object.freeze({
  client: Object.freeze({
    name: { required: true, category: "critical" },
    cin: { required: true, category: "critical" },
    email: { required: true, category: "critical" },
    phone: { required: true, category: "critical" },
    tax_id: { required: false, category: "critical" },
    status: { required: true, category: "structural", default: "active" },
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
    description: {
      required: true,
      category: "structural",
      default: ({ payload, entityType }) => toDescriptionFromTitle(payload, entityType),
    },
    category: { required: true, category: "structural", default: "General" },
    status: { required: true, category: "structural", default: "open" },
    priority: { required: true, category: "structural", default: "medium" },
    phase: { required: true, category: "structural", default: "Investigation" },
    opened_at: { required: true, category: "structural", default: () => isoDate() },
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
    court: { required: true, category: "structural", default: "Court of First Instance" },
    filing_date: { required: true, category: "structural", default: () => isoDate() },
    status: { required: true, category: "structural", default: "in progress" },
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
    assigned_to: { required: true, category: "structural", default: "Myself" },
    due_date: { required: true, category: "structural", default: () => isoDatePlusDays(3) },
    status: { required: true, category: "structural", default: "todo" },
    priority: { required: true, category: "structural", default: "medium" },
  }),
  personal_task: Object.freeze({
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    category: { required: true, category: "structural", default: "Administrative" },
    due_date: { required: true, category: "structural", default: () => isoDatePlusDays(3) },
    status: { required: true, category: "structural", default: "todo" },
    priority: { required: true, category: "structural", default: "medium" },
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
    officer_id: {
      required: true,
      category: "critical",
      default: ({ activeScope }) => resolveScopeId(activeScope, "officerId", "officer"),
    },
    mission_type: { required: true, category: "structural", default: "Service" },
    assign_date: { required: true, category: "structural", default: () => isoDate() },
    due_date: { required: true, category: "structural", default: () => isoDatePlusDays(3) },
    description: {
      required: true,
      category: "structural",
      default: ({ payload, entityType }) => toDescriptionFromTitle(payload, entityType),
    },
    status: { required: true, category: "structural", default: "planned" },
    priority: { required: true, category: "structural", default: "medium" },
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
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
    session_type: { required: true, category: "structural", default: "Audience" },
    scheduled_at: { required: true, category: "critical", default: () => `${isoDate()}T09:00:00.000Z` },
    duration: { required: true, category: "structural", default: "01:00" },
    location: { required: true, category: "structural", default: "Court" },
    status: { required: true, category: "structural", default: "scheduled" },
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
    scope: { required: true, category: "structural", default: "client" },
    entry_type: { required: true, category: "structural", default: "expense" },
    category: { required: true, category: "structural", default: "other" },
    amount: { required: true, category: "critical" },
    due_date: { required: true, category: "structural", default: () => isoDate() },
    status: { required: true, category: "structural", default: "confirmed" },
    title: {
      required: true,
      category: "structural",
      default: ({ entityType, activeScope }) => toTitleFromMessage(entityType, activeScope),
    },
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

function getRequiredFields(entityType = "") {
  const schema = getEntityFieldSchema(entityType);
  return Object.entries(schema)
    .filter(([, rule]) => rule?.required === true)
    .map(([field]) => field);
}

module.exports = {
  entityFieldRegistry,
  getEntityFieldSchema,
  getRequiredFields,
  SHARED_FIELDS,
};
