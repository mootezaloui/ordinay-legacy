"use strict";

const DEFAULT_LABELS = Object.freeze({
  client: "Client",
  dossier: "Dossier",
  lawsuit: "Lawsuit",
  task: "Task",
  personal_task: "Personal task",
  session: "Session",
  mission: "Mission",
  financial_entry: "Financial entry",
  document: "Document",
  web_search: "Web Search",
  deep_search: "Deep Search",
  notification: "Notification",
  history_event: "History event",
});

const DEFAULT_MAX_LABEL_LENGTH = 80;

function cleanLabel(value) {
  if (value === null || value === undefined) return null;
  const label = String(value).trim();
  return label.length > 0 ? label : null;
}

function truncateLabel(value, maxLength = DEFAULT_MAX_LABEL_LENGTH) {
  const label = cleanLabel(value);
  if (!label) return null;
  if (label.length <= maxLength) return label;
  if (maxLength <= 3) return label.slice(0, maxLength);
  return `${label.slice(0, maxLength - 3)}...`;
}

function pickFirst(...values) {
  for (const value of values) {
    const cleaned = cleanLabel(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function joinParts(parts, separator = " - ") {
  const cleanedParts = parts.map(cleanLabel).filter(Boolean);
  if (cleanedParts.length === 0) return null;
  return cleanedParts.join(separator);
}

function isLikelyInternalId(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (normalized.length === 0) return false;
  if (/^\d+$/.test(normalized)) return true;
  if (/^[0-9a-f]{24}$/i.test(normalized)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
}

function formatEntityTypeLabel(entityType) {
  return String(entityType || "").replace(/_/g, " ").trim();
}

function defaultLabelForType(entityType) {
  return DEFAULT_LABELS[entityType] || formatEntityTypeLabel(entityType) || "Record";
}

function formatDateLabel(value) {
  const raw = cleanLabel(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function resolveClientLabel(data) {
  const name =
    pickFirst(
      data.full_name,
      data.name,
      data.display_name,
      data.preferred_name,
    ) || null;
  if (name) return truncateLabel(name);

  const first = cleanLabel(data.first_name);
  const last = cleanLabel(data.last_name);
  const combined =
    [first, last].filter(Boolean).join(" ").trim() || null;
  if (combined) return truncateLabel(combined);

  const organization = pickFirst(
    data.organization,
    data.organization_name,
    data.company,
    data.company_name,
  );
  if (organization) return truncateLabel(organization);

  return pickFirst(data.reference, data.client_reference);
}

function resolveDossierLabel(data) {
  const reference = pickFirst(
    data.reference,
    data.dossier_reference,
    data.case_reference,
    data.code,
  );
  const title = pickFirst(data.title, data.name, data.subject);
  if (reference && title) {
    return `${reference} - ${truncateLabel(title, 60)}`;
  }
  if (reference) return reference;
  if (title) return truncateLabel(title);
  return null;
}

function resolveLawsuitLabel(data) {
  const reference = pickFirst(
    data.reference,
    data.lawsuit_number,
    data.case_number,
    data.docket_number,
    data.number,
  );
  const title = pickFirst(data.title, data.name, data.subject);
  if (reference && title) {
    return `${reference} - ${truncateLabel(title, 60)}`;
  }
  if (reference) return reference;
  if (title) return truncateLabel(title);
  return null;
}

function resolveTaskLabel(data) {
  const title = pickFirst(data.title, data.name, data.subject);
  if (title) return truncateLabel(title, 70);
  const description = pickFirst(
    data.short_description,
    data.description,
    data.summary,
    data.details,
  );
  if (description) return truncateLabel(description, 70);
  return null;
}

function resolveSessionLabel(data) {
  const dateLabel = formatDateLabel(
    data.scheduled_at ||
      data.session_date ||
      data.date ||
      data.starts_at ||
      data.start_at,
  );
  const court = pickFirst(
    data.court,
    data.court_name,
    data.courtroom,
    data.location,
  );
  const type = pickFirst(data.session_type, data.type, data.title);
  const composite = joinParts([dateLabel, court, type]);
  if (composite) return truncateLabel(composite);

  const fallback = pickFirst(data.reference, data.title, data.session_type, data.type);
  return fallback ? truncateLabel(fallback) : null;
}

function resolveMissionLabel(data) {
  const reference = pickFirst(data.reference, data.code);
  const title = pickFirst(data.title, data.name, data.subject);
  if (reference && title) {
    return `${reference} - ${truncateLabel(title, 60)}`;
  }
  if (reference) return reference;
  if (title) return truncateLabel(title);
  return null;
}

function resolveFinancialEntryLabel(data) {
  const reference = pickFirst(
    data.reference,
    data.invoice_number,
    data.receipt_number,
  );
  const title = pickFirst(data.title, data.name);
  const description = pickFirst(data.description, data.summary);
  if (reference && title) {
    return `${reference} - ${truncateLabel(title, 60)}`;
  }
  if (reference) return reference;
  if (title) return truncateLabel(title);
  if (description) return truncateLabel(description, 70);
  return null;
}

function resolveDocumentLabel(data) {
  const filename = pickFirst(
    data.file_name,
    data.filename,
    data.fileName,
    data.original_filename,
    data.name,
  );
  if (filename) return truncateLabel(filename, 70);
  return pickFirst(data.title, data.subject);
}

function resolveNotificationLabel(data) {
  const title = pickFirst(data.title, data.subject);
  if (title) return truncateLabel(title, 70);
  return null;
}

function resolveHistoryEventLabel(data) {
  const action = pickFirst(data.action, data.title);
  if (action) return truncateLabel(action, 70);
  const description = pickFirst(data.description, data.summary);
  if (description) return truncateLabel(description, 70);
  return null;
}

function resolveEntityDisplayLabel(entityType, entityData, options = {}) {
  if (!entityType) return null;
  const type = String(entityType).toLowerCase();
  const data = entityData && typeof entityData === "object" ? entityData : {};
  const fallback = options.fallback || defaultLabelForType(type);

  let label = null;
  switch (type) {
    case "client":
      label = resolveClientLabel(data);
      break;
    case "dossier":
      label = resolveDossierLabel(data);
      break;
    case "lawsuit":
      label = resolveLawsuitLabel(data);
      break;
    case "task":
    case "personal_task":
      label = resolveTaskLabel(data);
      break;
    case "session":
      label = resolveSessionLabel(data);
      break;
    case "mission":
      label = resolveMissionLabel(data);
      break;
    case "financial_entry":
      label = resolveFinancialEntryLabel(data);
      break;
    case "document":
      label = resolveDocumentLabel(data);
      break;
    case "notification":
      label = resolveNotificationLabel(data);
      break;
    case "history_event":
      label = resolveHistoryEventLabel(data);
      break;
    default:
      label = pickFirst(
        data.reference,
        data.title,
        data.name,
        data.subject,
        data.description,
      );
      if (label) label = truncateLabel(label, 70);
      break;
  }

  const cleaned = cleanLabel(label);
  if (!cleaned) return fallback;
  if (isLikelyInternalId(cleaned)) return fallback;
  return cleaned;
}

module.exports = {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
  truncateLabel,
};
