/**
 * Enhanced status color mapping with specific colors for each status
 */
const STATUS_COLORS = {
  // Client/Officer statuses
  Active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Available:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Inactive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  inactive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  inActive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  Busy: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",

  // Dossier/Case statuses
  Open: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "In Progress":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "On Hold":
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Closed: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",

  // Session statuses
  Scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Confirmed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Completed:
    "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
  Cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",

  // Task statuses
  "Not Started":
    "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
  Blocked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  Done: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",

  // Mission statuses
  Planned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",

  // Financial statuses
  Draft: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
  Posted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  Void: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
};

/**
 * Get status color classes for a given status
 * Returns specific colors or falls back to generic color based on keywords
 */
export const getStatusColor = (status = "") => {
  const statusStr = (status || "").toString();

  // Try exact match first
  if (STATUS_COLORS[statusStr]) {
    return STATUS_COLORS[statusStr];
  }

  // Fallback to keyword matching for legacy/unknown statuses
  const key = statusStr.toLowerCase();

  if (
    key.includes("act") ||
    key.includes("open") ||
    key.includes("available") ||
    key.includes("confirmed")
  ) {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  }

  if (
    key.includes("progress") ||
    key.includes("scheduled") ||
    key.includes("planned")
  ) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  }

  if (key.includes("pending") || key.includes("hold") || key.includes("busy")) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  }

  if (
    key.includes("blocked") ||
    key.includes("overdue") ||
    key.includes("cancelled")
  ) {
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  }

  if (
    key.includes("closed") ||
    key.includes("completed") ||
    key.includes("done") ||
    key.includes("inactive") ||
    key.includes("paid") ||
    key.includes("void")
  ) {
    return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
  }

  return "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200";
};

/**
 * Get icon for a given status
 */
export const getStatusIcon = (status = "") => {
  const statusStr = (status || "").toString();
  const key = statusStr.toLowerCase();

  // Active/Open states
  if (
    key.includes("active") ||
    key.includes("open") ||
    key.includes("available")
  ) {
    return "fas fa-check-circle";
  }

  // In Progress states
  if (key.includes("progress") || key.includes("planned")) {
    return "fas fa-spinner";
  }

  // Scheduled/Confirmed
  if (key.includes("scheduled")) {
    return "fas fa-calendar";
  }
  if (key.includes("confirmed")) {
    return "fas fa-check";
  }

  // Pending/Hold/Busy
  if (key.includes("pending") || key.includes("hold") || key.includes("busy")) {
    return "fas fa-clock";
  }

  // Blocked/Overdue/Cancelled
  if (key.includes("blocked")) {
    return "fas fa-ban";
  }
  if (key.includes("overdue")) {
    return "fas fa-exclamation-triangle";
  }
  if (key.includes("cancelled")) {
    return "fas fa-times-circle";
  }

  // Completed/Done/Closed/Paid
  if (
    key.includes("completed") ||
    key.includes("done") ||
    key.includes("closed") ||
    key.includes("paid")
  ) {
    return "fas fa-check-circle";
  }

  // Inactive/Void
  if (key.includes("inactive") || key.includes("void")) {
    return "fas fa-circle";
  }

  // Not Started
  if (key.includes("not started")) {
    return "fas fa-circle";
  }

  return "fas fa-circle";
};
