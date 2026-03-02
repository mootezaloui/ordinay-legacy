function assert(condition, message, status = 400) {
  if (!condition) {
    const err = new Error(message);
    err.status = status;
    throw err;
  }
}

function filterPayload(payload, allowed) {
  return Object.entries(payload || {}).reduce((acc, [key, value]) => {
    if (allowed.includes(key) && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function buildUpdateClause(filteredPayload) {
  const entries = Object.keys(filteredPayload).map((key) => `${key}=@${key}`);
  return entries.join(", ");
}

function ensureXor(fields, message) {
  const truthyCount = fields.filter(
    (v) => v !== null && v !== undefined
  ).length;
  assert(truthyCount === 1, message);
}

function ensureAtLeastOne(fields, message) {
  const truthyCount = fields.filter(
    (v) => v !== null && v !== undefined
  ).length;
  assert(truthyCount >= 1, message);
}

/**
 * Normalize frontend values to database format
 * Frontend sends capitalized values (e.g., "Active", "Open", "High")
 * Database expects lowercase values (e.g., "active", "open", "high")
 */
function normalizeData(data) {
  const normalized = { ...data };

  // Status value mappings for special values
  const statusMappings = {
    // Client statuses
    Active: "active",
    active: "active",
    Inactive: "inactive",
    inactive: "inactive",

    // Officer statuses (officers use 'inActive' with camelCase!)
    Available: "active", // "Available" maps to "active" in database
    Busy: "busy",
    busy: "busy",
    inActive: "inActive", // Officers use camelCase 'inActive', PRESERVE it exactly as sent!

    // Dossier/Lawsuit statuses (shared)
    Open: "open",
    open: "open",
    "In Progress": "in_progress",
    in_progress: "in_progress",
    "On Hold": "on_hold", // ✅ For dossiers/lawsuits
    on_hold: "on_hold",
    Closed: "closed",
    closed: "closed",

    // Dossier legacy mappings
    Pending: "in_progress", // Map old dossier "Pending" to "in_progress"
    Suspended: "on_hold", // Map old "Suspended" to "on_hold"
    suspended: "on_hold",

    // Session statuses
    Scheduled: "scheduled",
    scheduled: "scheduled",
    Confirmed: "confirmed",
    confirmed: "confirmed",
    Pending: "pending",
    pending: "pending",
    Completed: "completed",
    completed: "completed",
    Cancelled: "cancelled",
    cancelled: "cancelled",

    // Task statuses (also used for personal tasks)
    "Not Started": "todo",
    "Not started": "todo", // Handle lowercase variation
    "Non commencee": "todo",
    "Non commencée": "todo",
    todo: "todo",
    Todo: "todo",
    "In Progress": "in_progress",
    in_progress: "in_progress",
    Blocked: "blocked",
    blocked: "blocked",
    Done: "done",
    done: "done",
    Cancelled: "cancelled",
    cancelled: "cancelled",

    // Mission statuses
    Planned: "planned",
    planned: "planned",

    // Financial statuses
    Draft: "draft",
    draft: "draft",
    Paid: "paid",
    paid: "paid",
    Overdue: "pending", // Map "Overdue" to "pending" for now
  };

  // Normalize status field (if present)
  if (normalized.status && typeof normalized.status === "string") {
    // First check if there's a direct mapping
    if (statusMappings[normalized.status]) {
      normalized.status = statusMappings[normalized.status];
    } else {
      // Otherwise, apply default normalization (lowercase + spaces to underscores)
      normalized.status = normalized.status.toLowerCase().replace(/ /g, "_");
    }
  }

  // Normalize priority field (if present)
  if (normalized.priority && typeof normalized.priority === "string") {
    const priorityMappings = {
      Urgent: "urgent",
      urgente: "urgent",
      High: "high",
      Haute: "high",
      Medium: "medium",
      Moyenne: "medium",
      Low: "low",
      Basse: "low",
    };
    normalized.priority = priorityMappings[normalized.priority] || normalized.priority.toLowerCase();
  }

  // Normalize category field (if present) to lowercase
  if (normalized.category && typeof normalized.category === "string") {
    normalized.category = normalized.category.toLowerCase();
  }

  return normalized;
}

module.exports = {
  assert,
  filterPayload,
  buildUpdateClause,
  ensureXor,
  ensureAtLeastOne,
  normalizeData,
};
