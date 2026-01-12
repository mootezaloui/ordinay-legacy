/**
 * deadlineUtils.js
 *
 * Utilities for calculating and managing deadlines across entities
 *
 * Provides:
 * - Automatic next deadline calculation from related entities
 * - Support for sessions, tasks, financial entries
 * - Smart date parsing and comparison
 * - Navigation helpers for deadline sources
 */

import { formatDateValue } from "./dateFormat.js";

/**
 * Calculate the next upcoming hearing/session for a case (procès)
 *
 * @param {Object} caseEntity - The case/procès object
 * @param {Array} relatedSessions - Sessions linked to this case
 * @returns {Object|null} - { date, type, label, entityId, entity } or null if no upcoming sessions
 */
export function calculateNextHearing(caseEntity, relatedSessions = []) {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today

  const candidates = [];

  // Extract upcoming sessions
  relatedSessions.forEach((session) => {
    if (session.date) {
      const sessionDate = parseDate(session.date);
      if (sessionDate && sessionDate >= now) {
        // Combine date and time for more accurate sorting
        let sessionDateTime = sessionDate;
        if (session.time) {
          const timeParts = session.time.split(":");
          if (timeParts.length === 2) {
            sessionDateTime = new Date(sessionDate);
            sessionDateTime.setHours(
              parseInt(timeParts[0], 10),
              parseInt(timeParts[1], 10),
              0,
              0
            );
          }
        }

        candidates.push({
          date: sessionDate,
          datetime: sessionDateTime,
          time: session.time,
          type: "session",
          label: session.title || "Audience",
          location: session.location,
          entityId: session.id,
          entity: session,
          sortKey: sessionDateTime.getTime(),
        });
      }
    }
  });

  // Include manual next_hearing if set
  if (caseEntity.nextHearing) {
    const manualHearing = parseDate(caseEntity.nextHearing);
    if (manualHearing && manualHearing >= now) {
      candidates.push({
        date: manualHearing,
        datetime: manualHearing,
        time: null,
        type: "manual",
        label: "Audience programmée",
        location: null,
        entityId: null,
        entity: null,
        sortKey: manualHearing.getTime(),
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.sortKey - b.sortKey);
  return candidates[0];
}

/**
 * Calculate the next upcoming deadline from all related entities
 *
 * @param {Object} dossier - The dossier object
 * @param {Array} relatedSessions - Sessions linked to this dossier or its cases
 * @param {Array} relatedTasks - Tasks linked to this dossier or its cases
 * @param {Array} relatedFinancialEntries - Financial entries linked to this dossier
 * @returns {Object|null} - { date, type, label, entityId, entity } or null if no upcoming deadlines
 */
export function calculateNextDeadline(
  dossier,
  relatedSessions = [],
  relatedTasks = [],
  relatedFinancialEntries = []
) {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today

  const candidates = [];

  // 1. Extract deadlines from sessions
  relatedSessions.forEach((session) => {
    if (session.date) {
      const sessionDate = parseDate(session.date);
      if (sessionDate && sessionDate >= now) {
        candidates.push({
          date: sessionDate,
          type: "session",
          label: `Audience – ${session.title || "Session"}`,
          entityId: session.id,
          entity: session,
          sortKey: sessionDate.getTime(),
        });
      }
    }
  });

  // 2. Extract deadlines from tasks
  relatedTasks.forEach((task) => {
    if (task.dueDate) {
      const taskDate = parseDate(task.dueDate);
      if (taskDate && taskDate >= now) {
        candidates.push({
          date: taskDate,
          type: "task",
          label: `Tâche – ${task.title || "Task"}`,
          entityId: task.id,
          entity: task,
          sortKey: taskDate.getTime(),
        });
      }
    }
  });

  // 3. Extract deadlines from financial entries (payment deadlines)
  relatedFinancialEntries.forEach((entry) => {
    if (entry.date && entry.type === "expense" && entry.status !== "paid") {
      const entryDate = parseDate(entry.date);
      if (entryDate && entryDate >= now) {
        candidates.push({
          date: entryDate,
          type: "financial",
          label: `Échéance de paiement – ${entry.description || "Payment"}`,
          entityId: entry.id,
          entity: entry,
          sortKey: entryDate.getTime(),
        });
      }
    }
  });

  // 4. Include manual next deadline if set
  if (dossier.nextDeadline) {
    const manualDeadline = parseDate(dossier.nextDeadline);
    if (manualDeadline && manualDeadline >= now) {
      candidates.push({
        date: manualDeadline,
        type: "manual",
        label: "Manual deadline",
        entityId: null,
        entity: null,
        sortKey: manualDeadline.getTime(),
      });
    }
  }

  // 5. Sort by date and return the earliest
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.sortKey - b.sortKey);
  return candidates[0];
}

/**
 * Get all upcoming deadlines (not just the next one)
 * Useful for displaying a list of upcoming events
 *
 * @param {Object} dossier - The dossier object
 * @param {Array} relatedSessions - Sessions linked to this dossier or its cases
 * @param {Array} relatedTasks - Tasks linked to this dossier or its cases
 * @param {Array} relatedFinancialEntries - Financial entries linked to this dossier
 * @param {number} limit - Maximum number of deadlines to return (default: 5)
 * @returns {Array} - Array of deadline objects sorted by date
 */
export function getAllUpcomingDeadlines(
  dossier,
  relatedSessions = [],
  relatedTasks = [],
  relatedFinancialEntries = [],
  limit = 5
) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const candidates = [];

  // Extract all deadlines (same logic as calculateNextDeadline)
  relatedSessions.forEach((session) => {
    if (session.date) {
      const sessionDate = parseDate(session.date);
      if (sessionDate && sessionDate >= now) {
        candidates.push({
          date: sessionDate,
          type: "session",
          label: `Audience – ${session.title || "Session"}`,
          entityId: session.id,
          entity: session,
          sortKey: sessionDate.getTime(),
        });
      }
    }
  });

  relatedTasks.forEach((task) => {
    if (task.dueDate) {
      const taskDate = parseDate(task.dueDate);
      if (taskDate && taskDate >= now) {
        candidates.push({
          date: taskDate,
          type: "task",
          label: `Tâche – ${task.title || "Task"}`,
          entityId: task.id,
          entity: task,
          sortKey: taskDate.getTime(),
        });
      }
    }
  });

  relatedFinancialEntries.forEach((entry) => {
    if (entry.date && entry.type === "expense" && entry.status !== "paid") {
      const entryDate = parseDate(entry.date);
      if (entryDate && entryDate >= now) {
        candidates.push({
          date: entryDate,
          type: "financial",
          label: `Échéance de paiement – ${entry.description || "Payment"}`,
          entityId: entry.id,
          entity: entry,
          sortKey: entryDate.getTime(),
        });
      }
    }
  });

  if (dossier.nextDeadline) {
    const manualDeadline = parseDate(dossier.nextDeadline);
    if (manualDeadline && manualDeadline >= now) {
      candidates.push({
        date: manualDeadline,
        type: "manual",
        label: "Manual deadline",
        entityId: null,
        entity: null,
        sortKey: manualDeadline.getTime(),
      });
    }
  }

  candidates.sort((a, b) => a.sortKey - b.sortKey);
  return candidates.slice(0, limit);
}

/**
 * Parse date from various formats (ISO, YYYY-MM-DD, Date object)
 *
 * @param {string|Date} dateValue - Date value to parse
 * @returns {Date|null} - Parsed Date object or null if invalid
 */
function parseDate(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }

  if (typeof dateValue === "string") {
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Format a deadline object for display
 *
 * @param {Object} deadline - Deadline object from calculateNextDeadline
 * @returns {string} - Formatted string for display
 */
export function formatDeadline(deadline) {
  if (!deadline) return "Aucune échéance";

  const dateStr = formatDate(deadline.date);
  return `${deadline.label} (${dateStr})`;
}

/**
 * Format date as DD/MM/YYYY
 *
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
export function formatDate(date) {
  if (!date) return "";

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";

  // Use formatDateValue to respect user date format settings
  return formatDateValue(d);
}

/**
 * Get the navigation path for a deadline's source entity
 *
 * @param {Object} deadline - Deadline object from calculateNextDeadline
 * @param {number} dossierId - Current dossier ID
 * @returns {string|null} - Navigation path or null
 */
export function getDeadlineNavigationPath(deadline, dossierId) {
  if (!deadline || !deadline.entityId) return null;

  switch (deadline.type) {
    case "session":
      return `/sessions/${deadline.entityId}`;
    case "task":
      return `/tasks/${deadline.entityId}`;
    case "financial":
      return `/financial/${deadline.entityId}`;
    case "manual":
      // Stay on current dossier, just switch to overview tab
      return `/dossiers/${dossierId}?tab=overview`;
    default:
      return null;
  }
}

/**
 * Check if a deadline is overdue
 *
 * @param {Object} deadline - Deadline object
 * @returns {boolean} - true if overdue
 */
export function isDeadlineOverdue(deadline) {
  if (!deadline || !deadline.date) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const deadlineDate =
    deadline.date instanceof Date ? deadline.date : new Date(deadline.date);
  return deadlineDate < now;
}

/**
 * Get urgency level based on days until deadline
 *
 * @param {Object} deadline - Deadline object
 * @returns {string} - 'critical' | 'urgent' | 'soon' | 'normal'
 */
export function getDeadlineUrgency(deadline) {
  if (!deadline || !deadline.date) return "normal";

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const deadlineDate =
    deadline.date instanceof Date ? deadline.date : new Date(deadline.date);
  const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) return "critical"; // Overdue
  if (daysUntil === 0) return "critical"; // Today
  if (daysUntil <= 3) return "urgent"; // Within 3 days
  if (daysUntil <= 7) return "soon"; // Within a week
  return "normal";
}
