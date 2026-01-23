import { SUPPORTED_CURRENCIES } from "../../utils/currency";

/**
 * Shared formatting helpers for notification UI components
 * Used by NotificationCenter and NotificationDropdown
 */

const currencyCodePattern = SUPPORTED_CURRENCIES.join("|");
const amountWithCurrencyRegex = new RegExp(
  `(\\d[\\d\\s.,]*)\\s*(${currencyCodePattern}|€|\\$|£)`,
  "gi"
);

/**
 * Format notification timestamp for display
 * @param {string} timestamp - ISO timestamp or SQLite format
 * @param {object} options - { t, formatDate, formatDateTime } from component context
 * @returns {string} Formatted time string
 */
export function formatTimestamp(timestamp, { t, formatDate, formatDateTime }) {
  // SQLite CURRENT_TIMESTAMP returns UTC format: "YYYY-MM-DD HH:MM:SS"
  // Add 'Z' to indicate UTC timezone for correct parsing
  const timestampStr = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
  const date = new Date(timestampStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("dropdown.time.justNow");
  if (diffMins < 60) return t("dropdown.time.minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("dropdown.time.hoursAgo", { count: diffHours });
  if (diffDays < 7) return t("dropdown.time.daysAgo", { count: diffDays });
  return formatDateTime(date);
}

/**
 * Format notification timestamp for NotificationCenter (extended format)
 * @param {string} timestamp - ISO timestamp or SQLite format
 * @param {object} options - { t, formatDate, formatDateTime } from component context
 * @returns {string} Formatted time string
 */
export function formatTimestampExtended(timestamp, { t, formatDate, formatDateTime }) {
  // SQLite CURRENT_TIMESTAMP returns UTC format: "YYYY-MM-DD HH:MM:SS"
  // Add 'Z' to indicate UTC timezone for correct parsing
  const timestampStr = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
  const date = new Date(timestampStr);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 24) {
    return formatDateTime(date);
  }
  if (diffDays < 7) {
    return t("center.time.dateAndTime", { date: formatDate(date), time: formatDateTime(date) });
  }
  return formatDate(date);
}

/**
 * Get priority badge styling for NotificationCenter
 * @param {string} priority - urgent, high, success, info
 * @param {Function} t - translation function
 * @returns {object} { bg, text, label }
 */
export function getPriorityBadge(priority, t) {
  const badges = {
    urgent: {
      bg: "bg-red-100 dark:bg-red-900/30",
      text: "text-red-700 dark:text-red-400",
      label: t("center.priority.urgent"),
    },
    high: {
      bg: "bg-orange-100 dark:bg-orange-900/30",
      text: "text-orange-700 dark:text-orange-400",
      label: t("center.priority.high"),
    },
    success: {
      bg: "bg-green-100 dark:bg-green-900/30",
      text: "text-green-700 dark:text-green-400",
      label: t("center.priority.success"),
    },
    info: {
      bg: "bg-blue-100 dark:bg-blue-900/30",
      text: "text-blue-700 dark:text-blue-400",
      label: t("center.priority.info"),
    },
  };
  return badges[priority] || badges.info;
}

/**
 * Get priority color class for NotificationDropdown
 * @param {string} priority - urgent, high, success, warning, error, info
 * @returns {string} Tailwind color classes
 */
export function getPriorityColor(priority) {
  const colors = {
    urgent: "text-red-600 dark:text-red-400",
    high: "text-orange-600 dark:text-orange-400",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  };
  return colors[priority] || colors.info;
}

/**
 * Get icon background class based on priority
 * @param {string} priority
 * @returns {string} Tailwind background classes
 */
export function getIconBackground(priority) {
  return priority === "urgent"
    ? "bg-red-100 dark:bg-red-900/30"
    : "bg-blue-100 dark:bg-blue-900/30";
}

/**
 * Parse and highlight ALL scan-critical data in notification messages
 * Covers: titles, names, dates, times, amounts, locations, durations, priorities, status, lawsuit numbers
 * Visual hierarchy: instant data extraction without reading full text
 * @param {string} message - Notification message text
 * @returns {string} HTML string with highlighted spans
 */
export function renderHighlightedMessage(message) {
  if (!message) return message;

  let result = message;

  // Order matters: more specific patterns first to avoid conflicts
  const patterns = [
    // === ENTITY NAMES / TITLES (in quotes) ===
    {
      regex: /"([^"]+)"/g,
      replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-slate-900 dark:text-white"><span>📌</span>"$1"</span>'
    },

    // === PRIORITY (FR + EN) ===
    {
      regex: /priorité\s+([A-Za-zÀ-ÿ]+)/gi,
      replacement: 'priorité <span class="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400"><span>⚡</span>$1</span>'
    },
    {
      regex: /Priority:\s*([A-Za-z]+)/gi,
      replacement: 'Priority: <span class="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400"><span>⚡</span>$1</span>'
    },
    {
      regex: /Priorité\s*:\s*([A-Za-zÀ-ÿ]+)/gi,
      replacement: 'Priorité : <span class="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400"><span>⚡</span>$1</span>'
    },

    // === LOCATION (FR + EN) ===
    {
      regex: /Lieu\s*:\s*([^\n.]+)/gi,
      replacement: 'Lieu : <span class="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"><span>📍</span>$1</span>'
    },
    {
      regex: /Location:\s*([^\n.]+)/gi,
      replacement: 'Location: <span class="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"><span>📍</span>$1</span>'
    },

    // === TIMES (à HH:MM / at HH:MM) ===
    {
      regex: /\bà\s+(\d{1,2}[h:]\d{2})/gi,
      replacement: 'à <span class="inline-flex items-center gap-0.5 font-semibold text-violet-600 dark:text-violet-400"><span>⏰</span>$1</span>'
    },
    {
      regex: /\bat\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)/gi,
      replacement: 'at <span class="inline-flex items-center gap-0.5 font-semibold text-violet-600 dark:text-violet-400"><span>⏰</span>$1</span>'
    },

    // === DATES ===
    // Dates in parentheses (dd/mm/yyyy)
    {
      regex: /\((\d{2}\/\d{2}\/\d{4})\)/g,
      replacement: '(<span class="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-400"><span>📅</span>$1</span>)'
    },
    // "le dd/mm/yyyy" or "on dd/mm/yyyy"
    {
      regex: /\b(le|on)\s+(\d{2}\/\d{2}\/\d{4})/gi,
      replacement: '$1 <span class="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-400"><span>📅</span>$2</span>'
    },
    // Standalone dates dd/mm/yyyy (not already wrapped)
    {
      regex: /(?<![>\/])(\b\d{2}\/\d{2}\/\d{4}\b)(?![<])/g,
      replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-400"><span>📅</span>$1</span>'
    },

    // === DURATION / COUNTDOWN (FR + EN) ===
    // "dans X jour(s)" / "in X day(s)"
    {
      regex: /dans\s+(\d+)\s+(jour|jours|heure|heures)/gi,
      replacement: 'dans <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
    },
    {
      regex: /in\s+(\d+)\s+(day|days|hour|hours)/gi,
      replacement: 'in <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
    },
    // "il y a X jour(s)" / "X day(s) ago"
    {
      regex: /il y a\s+(\d+)\s+(jour|jours)/gi,
      replacement: 'il y a <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
    },
    {
      regex: /(\d+)\s+(day|days)\s+ago/gi,
      replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span> ago'
    },
    // "depuis X jour(s)"
    {
      regex: /depuis\s+(\d+)\s+(jour|jours)/gi,
      replacement: 'depuis <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
    },

    // === AMOUNTS / MONEY ===
    // Amount + currency code/symbol
    {
      regex: amountWithCurrencyRegex,
      replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400"><span>💰</span>$1 $2</span>'
    },
    // Currency symbol first (€50, $100)
    {
      regex: /([€$£])\s?(\d[\d\s.,]*)/g,
      replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400"><span>💰</span>$1$2</span>'
    },

    // === STATUS KEYWORDS (FR + EN) ===
    {
      regex: /\b(en retard|overdue|urgent|URGENT)\b/gi,
      replacement: '<span class="inline-flex items-center gap-0.5 font-bold text-red-600 dark:text-red-400"><span>🔴</span>$1</span>'
    },
    {
      regex: /\b(aujourd'hui|today|demain|tomorrow)\b/gi,
      replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-red-500 dark:text-red-400"><span>📆</span>$1</span>'
    },

    // === LAWSUIT/DOSSIER NUMBERS ===
    {
      regex: /dossier\s+([A-Z0-9\-\/]+)/gi,
      replacement: 'dossier <span class="inline-flex items-center gap-0.5 font-semibold text-indigo-600 dark:text-indigo-400"><span>📁</span>$1</span>'
    },
    {
      regex: /\b(procès|proces)\s+([A-Z0-9\-\/]+)/gi,
      replacement: 'procès <span class="inline-flex items-center gap-0.5 font-semibold text-indigo-600 dark:text-indigo-400"><span>📁</span>$2</span>'
    },
    {
      regex: /lawsuit\s+([A-Z0-9\-\/]+)/gi,
      replacement: 'lawsuit <span class="inline-flex items-center gap-0.5 font-semibold text-indigo-600 dark:text-indigo-400"><span>📁</span>$1</span>'
    }
  ];

  patterns.forEach(({ regex, replacement }) => {
    result = result.replace(regex, replacement);
  });

  return result;
}
