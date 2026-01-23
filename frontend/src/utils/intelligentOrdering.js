/**
 * intelligentOrdering.js
 *
 * Domain-aware intelligent ordering utilities for entity tables.
 *
 * PHILOSOPHY:
 * "Attention is a limited resource. Tables should respect it."
 *
 * These utilities implement professional worklist behavior, not spreadsheet behavior.
 * Each entity type has unique ordering logic based on real legal workflow needs.
 *
 * DESIGN PRINCIPLES:
 * 1. Important/urgent items surface first
 * 2. Active work comes before completed work
 * 3. Completed/archived items sink to bottom but remain visible
 * 4. Ordering is deterministic and predictable
 * 5. User manual sorting always takes precedence
 */

// ============================================================================
// IMPORTANCE WEIGHT CONSTANTS
// These define the relative weight of different factors in ordering.
// Higher values = more important = appears first
// ============================================================================

const WEIGHTS = {
  // Status-based weights (primary factor)
  STATUS: {
    CRITICAL: 1000, // Blocked, overdue, urgent action needed
    ACTIVE: 800, // In Progress, Currently being worked
    PENDING: 600, // Scheduled, Confirmed, Awaiting action
    NEW: 500, // Not Started, Draft, Fresh items
    ON_HOLD: 300, // Paused but not completed
    COMPLETED: 100, // Done, Paid, Closed
    CANCELLED: 50, // Cancelled, Archived
  },

  // Priority modifiers (secondary factor)
  PRIORITY: {
    HIGH: 200,
    MEDIUM: 100,
    LOW: 0,
  },

  // Deadline urgency modifiers
  DEADLINE: {
    OVERDUE: 500, // Past due date
    TODAY: 400, // Due today
    THIS_WEEK: 200, // Due within 7 days
    THIS_MONTH: 100, // Due within 30 days
    FUTURE: 0, // Due later
    NONE: 0, // No deadline
  },

  // Activity recency modifiers
  ACTIVITY: {
    TODAY: 50, // Activity today
    THIS_WEEK: 30, // Activity within 7 days
    THIS_MONTH: 10, // Activity within 30 days
    OLDER: 0, // Older activity
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate days until a date (negative = overdue)
 */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((date - today) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days since a date
 */
function daysSince(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((today - date) / (1000 * 60 * 60 * 24));
}

/**
 * Get deadline urgency weight
 */
function getDeadlineWeight(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return WEIGHTS.DEADLINE.NONE;
  if (days < 0) return WEIGHTS.DEADLINE.OVERDUE;
  if (days === 0) return WEIGHTS.DEADLINE.TODAY;
  if (days <= 7) return WEIGHTS.DEADLINE.THIS_WEEK;
  if (days <= 30) return WEIGHTS.DEADLINE.THIS_MONTH;
  return WEIGHTS.DEADLINE.FUTURE;
}

/**
 * Get activity recency weight
 */
function getActivityWeight(dateStr) {
  const days = daysSince(dateStr);
  if (days === null) return WEIGHTS.ACTIVITY.OLDER;
  if (days === 0) return WEIGHTS.ACTIVITY.TODAY;
  if (days <= 7) return WEIGHTS.ACTIVITY.THIS_WEEK;
  if (days <= 30) return WEIGHTS.ACTIVITY.THIS_MONTH;
  return WEIGHTS.ACTIVITY.OLDER;
}

/**
 * Get priority weight
 */
function getPriorityWeight(priority) {
  switch (priority?.toLowerCase?.() || priority) {
    case "High":
    case "high":
      return WEIGHTS.PRIORITY.HIGH;
    case "Medium":
    case "medium":
      return WEIGHTS.PRIORITY.MEDIUM;
    case "Low":
    case "low":
    default:
      return WEIGHTS.PRIORITY.LOW;
  }
}

// ============================================================================
// ENTITY-SPECIFIC IMPORTANCE CALCULATORS
// Each function returns an importance score for one item.
// Higher score = more important = appears first in list.
// ============================================================================

/**
 * CLIENT IMPORTANCE
 *
 * Domain Logic:
 * - Active clients are always more important than inactive
 * - Recently joined clients get slight boost (new relationships need attention)
 * - Clients with recent activity are more prominent
 *
 * Order: Active → Inactive
 * Within status: Recent activity → Older activity
 */
export function calculateClientImportance(client) {
  let score = 0;

  // Primary: Status
  if (client.status === "Active") {
    score += WEIGHTS.STATUS.ACTIVE;
  } else if (client.status === "Inactive") {
    score += WEIGHTS.STATUS.COMPLETED;
  }

  // Secondary: Recent join date (new clients need attention)
  const joinDays = daysSince(client.joinDate);
  if (joinDays !== null && joinDays <= 30) {
    score += 50; // New client boost
  }

  // Tertiary: Recent activity (if tracked)
  if (client.lastActivity) {
    score += getActivityWeight(client.lastActivity);
  }

  return score;
}

/**
 * DOSSIER IMPORTANCE
 *
 * Domain Logic:
 * - Open/Active dossiers need attention
 * - High priority dossiers are more urgent
 * - On Hold is secondary to active work
 * - Closed dossiers sink to bottom
 *
 * Order: Open (High → Medium → Low) → In Progress → On Hold → Closed
 */
export function calculateDossierImportance(dossier) {
  let score = 0;

  // Primary: Status
  switch (dossier.status) {
    case "Open":
      score += WEIGHTS.STATUS.ACTIVE;
      break;
    case "In Progress":
      score += WEIGHTS.STATUS.ACTIVE - 50; // Slightly below Open
      break;
    case "On Hold":
      score += WEIGHTS.STATUS.ON_HOLD;
      break;
    case "Closed":
      score += WEIGHTS.STATUS.COMPLETED;
      break;
    default:
      score += WEIGHTS.STATUS.NEW;
  }

  // Secondary: Priority
  score += getPriorityWeight(dossier.priority);

  // Tertiary: Recent open date (newer dossiers slightly higher)
  const openDays = daysSince(dossier.openDate);
  if (openDays !== null && openDays <= 7) {
    score += 30; // Recently opened
  }

  return score;
}

/**
 * TASK IMPORTANCE
 *
 * Domain Logic:
 * - Overdue tasks are CRITICAL - must be addressed
 * - Blocked tasks need attention to unblock
 * - In Progress tasks are actively being worked
 * - Tasks due soon are more urgent
 * - Completed/Cancelled tasks sink to bottom
 *
 * Order: Overdue → Blocked → In Progress → Due Soon → Not Started → Done → Cancelled
 */
export function calculateTaskImportance(task) {
  let score = 0;

  // Check if overdue (regardless of status, except completed)
  const isCompleted = ["Completed", "Done", "Cancelled"].includes(task.status);
  const daysUntilDue = daysUntil(task.dueDate);
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0 && !isCompleted;

  if (isOverdue) {
    score += WEIGHTS.STATUS.CRITICAL;
  }

  // Primary: Status
  switch (task.status) {
    case "Blocked":
      score += WEIGHTS.STATUS.CRITICAL - 100; // Just below overdue
      break;
    case "In Progress":
      score += WEIGHTS.STATUS.ACTIVE;
      break;
    case "Not Started":
      score += WEIGHTS.STATUS.NEW;
      break;
    case "On Hold":
      score += WEIGHTS.STATUS.ON_HOLD;
      break;
    case "Completed":
    case "Done":
      score += WEIGHTS.STATUS.COMPLETED;
      break;
    case "Cancelled":
      score += WEIGHTS.STATUS.CANCELLED;
      break;
    default:
      score += WEIGHTS.STATUS.NEW;
  }

  // Secondary: Priority (only for non-completed)
  if (!isCompleted) {
    score += getPriorityWeight(task.priority);
  }

  // Tertiary: Due date urgency (only for non-completed)
  if (!isCompleted && !isOverdue) {
    score += getDeadlineWeight(task.dueDate);
  }

  return score;
}

/**
 * PERSONAL TASK IMPORTANCE
 *
 * Same logic as regular tasks, but without legal-specific considerations.
 * These are administrative/personal items.
 */
export function calculatePersonalTaskImportance(task) {
  // Use same logic as regular tasks
  return calculateTaskImportance(task);
}

/**
 * CASE (LAWSUIT/PROCÈS) IMPORTANCE
 *
 * Domain Logic:
 * - Cases with upcoming hearings are CRITICAL
 * - Active lawsuits need attention
 * - On Hold lawsuits are secondary
 * - Closed lawsuits sink to bottom
 *
 * Order: Hearing Today → Hearing This Week → In Progress → On Hold → Closed
 */
export function calculateCaseImportance(caseItem) {
  let score = 0;

  // Primary: Upcoming hearing (computedNextHearing or nextHearing)
  const nextHearing =
    caseItem.computedNextHearing?.date || caseItem.nextHearing;
  if (nextHearing) {
    const daysToHearing = daysUntil(nextHearing);
    if (daysToHearing !== null) {
      if (daysToHearing === 0) {
        score += WEIGHTS.DEADLINE.TODAY + 200; // Hearing today is CRITICAL
      } else if (daysToHearing > 0 && daysToHearing <= 7) {
        score += WEIGHTS.DEADLINE.THIS_WEEK + 100; // Hearing this week
      } else if (daysToHearing > 0 && daysToHearing <= 30) {
        score += WEIGHTS.DEADLINE.THIS_MONTH;
      }
    }
  }

  // Secondary: Status
  switch (caseItem.status) {
    case "In Progress":
      score += WEIGHTS.STATUS.ACTIVE;
      break;
    case "On Hold":
    case "Suspended":
      score += WEIGHTS.STATUS.ON_HOLD;
      break;
    case "Closed":
    case "Completed":
      score += WEIGHTS.STATUS.COMPLETED;
      break;
    default:
      score += WEIGHTS.STATUS.NEW;
  }

  return score;
}

/**
 * SESSION (HEARING/APPOINTMENT) IMPORTANCE
 *
 * Domain Logic:
 * - Sessions today are CRITICAL
 * - Upcoming sessions this week need preparation
 * - Confirmed sessions are more certain than Scheduled
 * - Completed/Cancelled sessions sink to bottom
 *
 * Order: Today → This Week → Confirmed → Scheduled → Pending → Completed → Cancelled
 */
export function calculateSessionImportance(session) {
  let score = 0;

  // Check if session is in the past
  const sessionDate = session.date;
  const daysToSession = daysUntil(sessionDate);
  const isPast = daysToSession !== null && daysToSession < 0;
  const isCompleted = ["Completed", "Cancelled"].includes(session.status);

  // Primary: Date proximity (for future sessions)
  if (!isPast && !isCompleted) {
    if (daysToSession === 0) {
      score += WEIGHTS.DEADLINE.TODAY + 300; // TODAY IS CRITICAL
    } else if (daysToSession <= 7) {
      score += WEIGHTS.DEADLINE.THIS_WEEK + 100;
    } else if (daysToSession <= 30) {
      score += WEIGHTS.DEADLINE.THIS_MONTH;
    }
  }

  // Secondary: Status
  switch (session.status) {
    case "Confirmed":
      score += WEIGHTS.STATUS.ACTIVE;
      break;
    case "Scheduled":
      score += WEIGHTS.STATUS.PENDING;
      break;
    case "Pending":
      score += WEIGHTS.STATUS.PENDING - 50;
      break;
    case "On Hold":
      score += WEIGHTS.STATUS.ON_HOLD;
      break;
    case "Completed":
      score += WEIGHTS.STATUS.COMPLETED;
      break;
    case "Cancelled":
      score += WEIGHTS.STATUS.CANCELLED;
      break;
    default:
      score += WEIGHTS.STATUS.NEW;
  }

  // Past sessions get pushed down unless they're still "active" status
  if (isPast && !isCompleted) {
    score -= 200; // Past but not marked complete - needs attention but lower than future
  }

  return score;
}

/**
 * OFFICER (HUISSIER) IMPORTANCE
 *
 * Domain Logic:
 * - Available officers are ready for work
 * - Busy officers are actively engaged
 * - Inactive officers sink to bottom
 *
 * Order: Available → Busy → Inactive
 */
export function calculateOfficerImportance(officer) {
  let score = 0;

  switch (officer.status) {
    case "Available":
      score += WEIGHTS.STATUS.ACTIVE;
      break;
    case "Busy":
      score += WEIGHTS.STATUS.PENDING;
      break;
    case "Inactive":
      score += WEIGHTS.STATUS.COMPLETED;
      break;
    default:
      score += WEIGHTS.STATUS.NEW;
  }

  return score;
}

/**
 * MISSION IMPORTANCE
 *
 * Domain Logic:
 * - In Progress missions are actively being worked
 * - Pending missions need to start
 * - Missions with approaching deadlines are urgent
 * - Completed/Cancelled missions sink to bottom
 *
 * Order: In Progress → Pending (by deadline) → On Hold → Completed → Cancelled
 */
export function calculateMissionImportance(mission) {
  let score = 0;

  const isCompleted = ["Completed", "Cancelled", "Done"].includes(
    mission.status
  );

  // Primary: Status
  switch (mission.status) {
    case "In Progress":
      score += WEIGHTS.STATUS.ACTIVE;
      break;
    case "Pending":
    case "Assigned":
      score += WEIGHTS.STATUS.PENDING;
      break;
    case "On Hold":
      score += WEIGHTS.STATUS.ON_HOLD;
      break;
    case "Completed":
    case "Done":
      score += WEIGHTS.STATUS.COMPLETED;
      break;
    case "Cancelled":
      score += WEIGHTS.STATUS.CANCELLED;
      break;
    default:
      score += WEIGHTS.STATUS.NEW;
  }

  // Secondary: Deadline (if exists and not completed)
  if (!isCompleted && mission.deadline) {
    score += getDeadlineWeight(mission.deadline);
  }

  return score;
}

/**
 * FINANCIAL ENTRY IMPORTANCE
 *
 * Domain Logic:
 * - Draft entries need review/confirmation
 * - Confirmed but unpaid need collection
 * - Recent entries need attention
 * - Paid/Cancelled entries sink to bottom
 * - Larger amounts slightly more important (business impact)
 *
 * Order: Draft → Confirmed → Recent Paid → Older Paid → Cancelled
 */
export function calculateFinancialImportance(entry) {
  let score = 0;

  // Primary: Status
  switch (entry.status) {
    case "draft":
      score += WEIGHTS.STATUS.NEW + 100; // Drafts need review
      break;
    case "confirmed":
      score += WEIGHTS.STATUS.PENDING; // Confirmed needs collection/payment
      break;
    case "paid":
      score += WEIGHTS.STATUS.COMPLETED;
      break;
    case "cancelled":
      score += WEIGHTS.STATUS.CANCELLED;
      break;
    default:
      score += WEIGHTS.STATUS.NEW;
  }

  // Secondary: Recency of entry
  score += getActivityWeight(entry.date);

  // Tertiary: Amount impact (logarithmic scale to prevent huge amounts dominating)
  // Only for unpaid entries
  if (entry.status !== "paid" && entry.status !== "cancelled") {
    const amount = Math.abs(parseFloat(entry.amount) || 0);
    if (amount > 0) {
      // Add 1-50 points based on amount (logarithmic)
      score += Math.min(50, Math.floor(Math.log10(amount + 1) * 10));
    }
  }

  return score;
}

// ============================================================================
// VISUAL EMPHASIS CLASSIFICATION
// Returns a classification string used for CSS styling.
// ============================================================================

/**
 * Get visual emphasis class for a row based on entity state.
 *
 * Returns:
 * - 'prominent': Active, urgent, needs attention (full opacity, may have accent)
 * - 'normal': Standard active item (full opacity)
 * - 'subdued': Completed or inactive (reduced opacity)
 * - 'archived': Cancelled or very old (very reduced opacity)
 */
export function getRowEmphasis(entityType, entity) {
  switch (entityType) {
    case "client":
      return getClientEmphasis(entity);
    case "dossier":
      return getDossierEmphasis(entity);
    case "task":
    case "personalTask":
      return getTaskEmphasis(entity);
    case "lawsuit":
      return getCaseEmphasis(entity);
    case "session":
      return getSessionEmphasis(entity);
    case "officer":
      return getOfficerEmphasis(entity);
    case "mission":
      return getMissionEmphasis(entity);
    case "financial":
    case "financialEntry":
      return getFinancialEmphasis(entity);
    default:
      return "normal";
  }
}

function getClientEmphasis(client) {
  if (client.status === "Active") return "normal";
  if (client.status === "Inactive") return "subdued";
  return "normal";
}

function getDossierEmphasis(dossier) {
  if (dossier.priority === "High" && dossier.status !== "Closed")
    return "prominent";
  if (dossier.status === "Open" || dossier.status === "In Progress")
    return "normal";
  if (dossier.status === "On Hold") return "subdued";
  if (dossier.status === "Closed") return "subdued";
  return "normal";
}

function getTaskEmphasis(task) {
  const isCompleted = ["Completed", "Done", "Cancelled"].includes(task.status);
  const daysUntilDue = daysUntil(task.dueDate);
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0 && !isCompleted;

  if (isOverdue) return "prominent"; // Overdue = urgent visual
  if (task.status === "Blocked") return "prominent";
  if (task.status === "In Progress") return "normal";
  if (task.status === "Not Started" && task.priority === "High")
    return "normal";
  if (task.status === "Completed" || task.status === "Done") return "subdued";
  if (task.status === "Cancelled") return "archived";
  if (task.status === "On Hold") return "subdued";
  return "normal";
}

function getCaseEmphasis(caseItem) {
  const nextHearing =
    caseItem.computedNextHearing?.date || caseItem.nextHearing;
  const daysToHearing = nextHearing ? daysUntil(nextHearing) : null;

  // Hearing today or this week = prominent
  if (daysToHearing !== null && daysToHearing >= 0 && daysToHearing <= 7) {
    return "prominent";
  }

  if (caseItem.status === "In Progress") return "normal";
  if (caseItem.status === "On Hold" || caseItem.status === "Suspended")
    return "subdued";
  if (caseItem.status === "Closed" || caseItem.status === "Completed")
    return "subdued";
  return "normal";
}

function getSessionEmphasis(session) {
  const daysToSession = daysUntil(session.date);
  const isPast = daysToSession !== null && daysToSession < 0;

  // Today = prominent
  if (daysToSession === 0) return "prominent";

  // This week = normal with slight emphasis
  if (daysToSession !== null && daysToSession > 0 && daysToSession <= 7) {
    return session.status === "Confirmed" ? "prominent" : "normal";
  }

  if (session.status === "Completed") return "subdued";
  if (session.status === "Cancelled") return "archived";
  if (isPast && session.status !== "Completed") return "subdued"; // Past but not marked done

  return "normal";
}

function getOfficerEmphasis(officer) {
  if (officer.status === "Available") return "normal";
  if (officer.status === "Busy") return "normal";
  if (officer.status === "Inactive") return "subdued";
  return "normal";
}

function getMissionEmphasis(mission) {
  if (mission.status === "In Progress") return "normal";
  if (mission.status === "Pending" || mission.status === "Assigned")
    return "normal";
  if (mission.status === "On Hold") return "subdued";
  if (mission.status === "Completed" || mission.status === "Done")
    return "subdued";
  if (mission.status === "Cancelled") return "archived";
  return "normal";
}

function getFinancialEmphasis(entry) {
  if (entry.status === "draft") return "normal"; // Needs action
  if (entry.status === "confirmed") return "normal"; // Needs collection
  if (entry.status === "paid") return "subdued";
  if (entry.status === "cancelled") return "archived";
  return "normal";
}

// ============================================================================
// SORTING FUNCTION FACTORY
// Creates a comparator function for array.sort()
// ============================================================================

/**
 * Create a sort comparator for intelligent ordering.
 *
 * @param {string} entityType - Type of entity being sorted
 * @param {function} importanceCalculator - Function to calculate importance score
 * @returns {function} Comparator function for Array.sort()
 */
export function createIntelligentComparator(entityType, importanceCalculator) {
  return (a, b) => {
    const scoreA = importanceCalculator(a);
    const scoreB = importanceCalculator(b);

    // Higher score = more important = appears first
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // Tie-breaker: use ID for stable sorting
    if (a.id && b.id) {
      return String(a.id).localeCompare(String(b.id));
    }

    return 0;
  };
}

/**
 * Get the importance calculator for a given entity type.
 */
export function getImportanceCalculator(entityType) {
  switch (entityType) {
    case "client":
      return calculateClientImportance;
    case "dossier":
      return calculateDossierImportance;
    case "task":
      return calculateTaskImportance;
    case "personalTask":
      return calculatePersonalTaskImportance;
    case "lawsuit":
      return calculateCaseImportance;
    case "session":
      return calculateSessionImportance;
    case "officer":
      return calculateOfficerImportance;
    case "mission":
      return calculateMissionImportance;
    case "financial":
    case "financialEntry":
      return calculateFinancialImportance;
    default:
      // Default: no intelligent ordering, maintain original order
      return () => 0;
  }
}

/**
 * Apply intelligent ordering to an array of entities.
 * This is the main function used by components.
 *
 * @param {Array} data - Array of entities to sort
 * @param {string} entityType - Type of entity
 * @returns {Array} Sorted array (new array, original unchanged)
 */
export function applyIntelligentOrdering(data, entityType) {
  if (!Array.isArray(data) || data.length === 0) {
    return data;
  }

  const calculator = getImportanceCalculator(entityType);
  const comparator = createIntelligentComparator(entityType, calculator);

  // Create a new sorted array
  return [...data].sort(comparator);
}

// ============================================================================
// CSS CLASS HELPERS
// ============================================================================

/**
 * Get CSS classes for row emphasis.
 * These are applied to TableRow components.
 */
export function getEmphasisClasses(emphasis) {
  switch (emphasis) {
    case "prominent":
      return "table-row-prominent";
    case "normal":
      return "table-row-normal";
    case "subdued":
      return "table-row-subdued";
    case "archived":
      return "table-row-archived";
    default:
      return "table-row-normal";
  }
}

/**
 * Check if entity is in a "completed" state (for any entity type)
 */
export function isEntityCompleted(entityType, entity) {
  switch (entityType) {
    case "client":
      return entity.status === "Inactive";
    case "dossier":
      return entity.status === "Closed";
    case "task":
    case "personalTask":
      return ["Completed", "Done", "Cancelled"].includes(entity.status);
    case "lawsuit":
      return ["Closed", "Completed"].includes(entity.status);
    case "session":
      return ["Completed", "Cancelled"].includes(entity.status);
    case "officer":
      return entity.status === "Inactive";
    case "mission":
      return ["Completed", "Done", "Cancelled"].includes(entity.status);
    case "financial":
    case "financialEntry":
      return ["paid", "cancelled"].includes(entity.status);
    default:
      return false;
  }
}

/**
 * Check if entity is in an "urgent" state (for any entity type)
 */
export function isEntityUrgent(entityType, entity) {
  switch (entityType) {
    case "dossier":
      return entity.priority === "High" && entity.status !== "Closed";
    case "task":
    case "personalTask": {
      const isCompleted = ["Completed", "Done", "Cancelled"].includes(
        entity.status
      );
      if (isCompleted) return false;
      if (entity.status === "Blocked") return true;
      const days = daysUntil(entity.dueDate);
      return days !== null && days < 0; // Overdue
    }
    case "lawsuit": {
      const nextHearing =
        entity.computedNextHearing?.date || entity.nextHearing;
      const days = nextHearing ? daysUntil(nextHearing) : null;
      return days !== null && days >= 0 && days <= 3;
    }
    case "session": {
      const days = daysUntil(entity.date);
      return days !== null && days >= 0 && days <= 1;
    }
    default:
      return false;
  }
}

export default {
  applyIntelligentOrdering,
  getRowEmphasis,
  getEmphasisClasses,
  getImportanceCalculator,
  createIntelligentComparator,
  isEntityCompleted,
  isEntityUrgent,

  // Individual calculators (for custom use)
  calculateClientImportance,
  calculateDossierImportance,
  calculateTaskImportance,
  calculatePersonalTaskImportance,
  calculateCaseImportance,
  calculateSessionImportance,
  calculateOfficerImportance,
  calculateMissionImportance,
  calculateFinancialImportance,
};


