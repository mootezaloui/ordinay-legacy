/**
 * TEMPORAL VALIDATION SYSTEM
 *
 * Global date & time validation layer that enforces temporal coherence
 * across all entities based on real-world legal logic and entity relationships.
 *
 * DESIGN PRINCIPLES:
 * - Entity-aware (Client, Dossier, Procès, Task, Session, Mission, Financial entries, etc.)
 * - Relationship-aware (parent/child, linked entities)
 * - Time-aware (past, future, relative ordering)
 * - Extensible (easy to add future rules)
 *
 * VALIDATION OCCURS ON:
 * - Create
 * - Edit
 * - Any date mutation
 *
 * INTEGRATION:
 * - Integrates with existing domainRules.js via canPerformAction
 * - Returns standard validation result format
 *
 * CONSTRAINTS:
 * - Hard blockers (violations that prevent action)
 * - Soft warnings (unusual but allowed situations)
 */

import { formatDateValue } from "../utils/dateFormat";
import { i18nInstance } from "../i18n";

// Live entities are injected via the context parameter.
let entities = {
  clients: [],
  dossiers: [],
  lawsuits: [],
  tasks: [],
  sessions: [],
  missions: [],
  financialEntries: [],
};

const loadEntities = (context = {}) => {
  entities = {
    clients: context.entities?.clients || [],
    dossiers: context.entities?.dossiers || [],
    lawsuits: context.entities?.lawsuits || [],
    tasks: context.entities?.tasks || [],
    sessions: context.entities?.sessions || [],
    missions: context.entities?.missions || [],
    financialEntries: context.entities?.financialEntries || [],
  };
};

const getAllMissions = () => entities.missions || [];

const tCommon = (key, options = {}) =>
  i18nInstance.t(key, { ns: "common", ...options });
const tTemporal = (key, options = {}) =>
  tCommon(`detail.blocker.enrichment.temporal.${key}`, options);

// ========================================
// CORE DATE UTILITIES
// ========================================

/**
 * Parse date string to Date object
 * Handles various formats: YYYY-MM-DD, ISO strings, Date objects
 */
function parseDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return dateInput;

  // Handle ISO date strings and simple date strings
  const date = new Date(dateInput);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize date to start of day (00:00:00) for comparison
 */
function normalizeDate(dateInput) {
  const date = parseDate(dateInput);
  if (!date) return null;

  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Get current date normalized to start of day
 */
function today() {
  return normalizeDate(new Date());
}

/**
 * Compare two dates
 * Returns: -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
function compareDates(date1, date2) {
  const d1 = normalizeDate(date1);
  const d2 = normalizeDate(date2);

  if (!d1 || !d2) return null;

  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * Check if date is in the past (before today)
 */
function isInPast(dateInput) {
  return compareDates(dateInput, today()) === -1;
}

/**
 * Check if date is in the future (after today)
 */
function isInFuture(dateInput) {
  return compareDates(dateInput, today()) === 1;
}

/**
 * Check if date is today
 */
function isToday(dateInput) {
  return compareDates(dateInput, today()) === 0;
}

/**
 * Combine date and time strings into a single Date object
 */
function combineDateAndTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;

  const date = parseDate(dateStr);
  if (!date) return null;

  const [hours, minutes] = timeStr.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;

  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

/**
 * Format date for error messages
 */
function formatDate(dateInput) {
  const date = parseDate(dateInput);
  if (!date) return tTemporal("invalidDate");

  return formatDateValue(date);
}

// ========================================
// VALIDATION RESULT BUILDER
// ========================================

/**
 * Create validation result object
 */
function validationResult(allowed = true, blockers = [], warnings = []) {
  return {
    allowed,
    blockers: blockers.filter(Boolean),
    warnings: warnings.filter(Boolean),
  };
}

/**
 * Merge multiple validation results
 */
function mergeResults(...results) {
  const merged = {
    allowed: true,
    blockers: [],
    warnings: [],
  };

  for (const result of results) {
    if (!result) continue;

    if (!result.allowed) {
      merged.allowed = false;
    }

    if (result.blockers) {
      merged.blockers.push(...result.blockers);
    }

    if (result.warnings) {
      merged.warnings.push(...result.warnings);
    }
  }

  return merged;
}

// ========================================
// ENTITY LOOKUP HELPERS
// ========================================

/**
 * Find entity by ID
 */
function findEntity(entityType, entityId) {
  const lookupMap = {
    client: entities.clients,
    dossier: entities.dossiers,
    lawsuit: entities.lawsuits,
    task: entities.tasks,
    session: entities.sessions,
    mission: getAllMissions(),
  };

  const collection = lookupMap[entityType];
  if (!collection) return null;

  return collection.find((e) => e.id == entityId);
}

/**
 * Get parent entity for a given entity
 */
function getParentEntity(entityType, entity) {
  if (!entity) return null;

  switch (entityType) {
    case "lawsuit": // Procès → Dossier
      return findEntity("dossier", entity.dossierId);

    case "session": // Session → Procès (or Dossier directly)
      if (entity.lawsuitId) {
        return findEntity("lawsuit", entity.lawsuitId);
      }
      if (entity.dossierId) {
        return findEntity("dossier", entity.dossierId);
      }
      return null;

    case "task": // Task → Dossier or Procès
      if (entity.parentType === "lawsuit" && entity.lawsuitId) {
        return findEntity("lawsuit", entity.lawsuitId);
      }
      if (entity.parentType === "dossier" && entity.dossierId) {
        return findEntity("dossier", entity.dossierId);
      }
      return null;

    case "mission": // Mission → Dossier or Procès
      if (entity.entityType === "dossier" && entity.entityId) {
        return findEntity("dossier", entity.entityId);
      }
      if (entity.entityType === "lawsuit" && entity.entityId) {
        return findEntity("lawsuit", entity.entityId);
      }
      return null;

    case "dossier": // Dossier → Client
      return findEntity("client", entity.clientId);

    default:
      return null;
  }
}

/**
 * Get client for any entity (traverse up the hierarchy)
 */
function getClientForEntity(entityType, entity) {
  if (!entity) return null;

  // Direct client reference
  if (entity.clientId) {
    return findEntity("client", entity.clientId);
  }

  // Traverse up to find client
  const parent = getParentEntity(entityType, entity);
  if (!parent) return null;

  // Recursively find client
  const parentType = determineEntityType(parent);
  return getClientForEntity(parentType, parent);
}

/**
 * Determine entity type from entity object
 */
function determineEntityType(entity) {
  if (!entity) return null;

  // Check distinctive fields
  if (entity.lawsuitNumber && entity.clientId) return "dossier";
  if (entity.lawsuitNumber && entity.dossierId) return "lawsuit";
  if (entity.parentType !== undefined) return "task";
  if (entity.missionNumber) return "mission";
  if (entity.dateOfBirth !== undefined) return "client";
  if (entity.time !== undefined) return "session";

  return null;
}

// ========================================
// CLIENT TEMPORAL VALIDATION
// ========================================

/**
 * Validate Client date fields
 */
function validateClientDates(clientData, action, context = {}) {
  const blockers = [];
  const warnings = [];

  // Rule: Birth date must be in the past
  if (clientData.dateOfBirth) {
    if (isInFuture(clientData.dateOfBirth)) {
      blockers.push(
        tTemporal("birthDateFuture", {
          date: formatDate(clientData.dateOfBirth),
        })
      );
    }

    // Warning: Birth date should be reasonable (not too far in past)
    const birthDate = parseDate(clientData.dateOfBirth);
    const yearDiff = new Date().getFullYear() - birthDate.getFullYear();
    if (yearDiff > 120) {
      warnings.push(
        tTemporal("birthDateAgeUnusual", { years: yearDiff })
      );
    }

    // Warning: Minor client (under 18)
    if (yearDiff < 18) {
      warnings.push(
        tTemporal("birthDateMinor", { years: yearDiff })
      );
    }
  }

  // Rule: Join date should be in the past or today
  if (clientData.joinDate) {
    if (isInFuture(clientData.joinDate)) {
      blockers.push(
        tTemporal("registrationDateFuture", {
          date: formatDate(clientData.joinDate),
        })
      );
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// DOSSIER TEMPORAL VALIDATION
// ========================================

/**
 * Validate Dossier date fields
 */
function validateDossierDates(dossierData, action, context = {}) {
  const blockers = [];
  const warnings = [];
  const lawsuits = context.lawsuits || [];

  // Rule: Open date should be in the past or today
  if (dossierData.openDate) {
    if (isInFuture(dossierData.openDate)) {
      blockers.push(
        tTemporal("openingDateFuture", {
          date: formatDate(dossierData.openDate),
        })
      );
    }
  }

  // Rule: Open date should not be before client's join date
  // Skip this check if we're editing and only reassigning to a new client (openDate unchanged)
  const isClientReassignment = action === 'edit' && context.data &&
    context.data.openDate === dossierData.openDate &&
    context.data.clientId !== dossierData.clientId;

  if (dossierData.openDate && dossierData.clientId && !isClientReassignment) {
    const client = findEntity("client", dossierData.clientId);
    if (client && client.joinDate) {
      if (compareDates(dossierData.openDate, client.joinDate) === -1) {
        blockers.push(
          tTemporal("dossierOpenBeforeClient", {
            openDate: formatDate(dossierData.openDate),
            joinDate: formatDate(client.joinDate),
          })
        );
      }
    }
  }

  // Rule: Next deadline should be in the future (if set)
  if (dossierData.nextDeadline) {
    if (isInPast(dossierData.nextDeadline)) {
      warnings.push(
        tTemporal("nextDeadlinePast", {
          date: formatDate(dossierData.nextDeadline),
        })
      );
    }
  }

  // Rule: Close date should be after open date
  if (dossierData.closeDate && dossierData.openDate) {
    if (compareDates(dossierData.closeDate, dossierData.openDate) <= 0) {
      blockers.push(
        tTemporal("closingDateAfterOpening", {
          closeDate: formatDate(dossierData.closeDate),
          openDate: formatDate(dossierData.openDate),
        })
      );
    }
  }

  // Rule: If closing, check all child lawsuits are closed
  if (
    action === "close" ||
    (dossierData.status === "Closed" && context.data?.status !== "Closed")
  ) {
    const childLawsuits = lawsuits.filter((c) => c.dossierId == dossierData.id);
    const openLawsuits = childLawsuits.filter(
      (c) => c.status !== "Completed" && c.status !== "Closed"
    );

    if (openLawsuits.length > 0) {
      blockers.push(
        tTemporal("cannotCloseDossierOpenLawsuits", { count: openLawsuits.length })
      );
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// LAWSUIT (PROCÈS) TEMPORAL VALIDATION
// ========================================

/**
 * Validate Lawsuit (Procès) date fields
 */
function validateLawsuitDates(lawsuitData, action, context = {}) {
  const blockers = [];
  const warnings = [];
  const sessions = context.sessions || [];

  // Rule: Filing date should be in the past or today
  if (lawsuitData.filingDate) {
    if (isInFuture(lawsuitData.filingDate)) {
      blockers.push(
        tTemporal("filingDateFuture", {
          date: formatDate(lawsuitData.filingDate),
        })
      );
    }
  }

  // Rule: Filing date should not be before dossier open date
  if (lawsuitData.filingDate && lawsuitData.dossierId) {
    const dossier = findEntity("dossier", lawsuitData.dossierId);
    if (dossier && dossier.openDate) {
      if (compareDates(lawsuitData.filingDate, dossier.openDate) === -1) {
        blockers.push(
          tTemporal("filingBeforeDossierOpen", {
            filingDate: formatDate(lawsuitData.filingDate),
            openDate: formatDate(dossier.openDate),
          })
        );
      }
    }
  }

  // Rule: Next hearing should be in the future
  if (lawsuitData.nextHearing) {
    if (isInPast(lawsuitData.nextHearing)) {
      warnings.push(
        tTemporal("nextHearingPast", {
          date: formatDate(lawsuitData.nextHearing),
        })
      );
    }
  }

  // Rule: Close date should be after filing date
  if (lawsuitData.closeDate && lawsuitData.filingDate) {
    if (compareDates(lawsuitData.closeDate, lawsuitData.filingDate) <= 0) {
      blockers.push(
        tTemporal("closingDateAfterFiling", {
          closeDate: formatDate(lawsuitData.closeDate),
          filingDate: formatDate(lawsuitData.filingDate),
        })
      );
    }
  }

  // Rule: Cannot have sessions after lawsuit is closed
  if (
    action === "close" ||
    (lawsuitData.status === "Completed" && context.data?.status !== "Completed")
  ) {
    const futureSessions = sessions.filter(
      (s) =>
        s.lawsuitId == lawsuitData.id &&
        isInFuture(s.date) &&
        s.status !== "Cancelled"
    );

    if (futureSessions.length > 0) {
      blockers.push(
        tTemporal("cannotCloseLawsuitFutureHearings", {
          count: futureSessions.length,
        })
      );
    }
  }

  // Rule: Judgment date should be after filing date
  if (lawsuitData.judgmentDate && lawsuitData.filingDate) {
    if (compareDates(lawsuitData.judgmentDate, lawsuitData.filingDate) === -1) {
      blockers.push(
        tTemporal("judgmentBeforeFiling", {
          judgmentDate: formatDate(lawsuitData.judgmentDate),
          filingDate: formatDate(lawsuitData.filingDate),
        })
      );
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// TASK TEMPORAL VALIDATION
// ========================================

/**
 * Validate Task date fields
 */
function validateTaskDates(taskData, action, context = {}) {
  const blockers = [];
  const warnings = [];

  // Rule: Due date should not be in the past (for new/open tasks)
  if (taskData.dueDate) {
    if (
      action === "create" ||
      (taskData.status !== "Completed" && taskData.status !== "Cancelled")
    ) {
      if (isInPast(taskData.dueDate)) {
        blockers.push(
          tTemporal("dueDatePast", {
            date: formatDate(taskData.dueDate),
          })
        );
      }
    }
  }

  // Rule: Task deadline should not exceed next lawsuit hearing (if linked to lawsuit)
  if (taskData.dueDate && taskData.parentType === "lawsuit" && taskData.lawsuitId) {
    const parentLawsuit = findEntity("lawsuit", taskData.lawsuitId);
    if (parentLawsuit && parentLawsuit.nextHearing) {
      if (compareDates(taskData.dueDate, parentLawsuit.nextHearing) === 1) {
        warnings.push(
          tTemporal("taskDueAfterHearing", {
            dueDate: formatDate(taskData.dueDate),
            hearingDate: formatDate(parentLawsuit.nextHearing),
          })
        );
      }
    }
  }

  // Rule: Cannot create task for closed parent
  if (action === "create") {
    let parent = null;
    let parentType = null;

    if (taskData.parentType === "lawsuit" && taskData.lawsuitId) {
      parent = findEntity("lawsuit", taskData.lawsuitId);
      parentType = "lawsuit";
    } else if (taskData.parentType === "dossier" && taskData.dossierId) {
      parent = findEntity("dossier", taskData.dossierId);
      parentType = "dossier";
    }

    if (parent) {
      const isClosed =
        parent.status === "Closed" ||
        parent.status === "Completed" ||
        parent.status === "Clos";
      if (isClosed) {
        blockers.push(
          tTemporal("taskParentClosed", { parentType })
        );
      }
    }
  }

  // Rule: Completion date should be after creation date
  if (taskData.completionDate && taskData.createdDate) {
    if (compareDates(taskData.completionDate, taskData.createdDate) === -1) {
      blockers.push(
        tTemporal("completionBeforeCreation", {
          completionDate: formatDate(taskData.completionDate),
          createdDate: formatDate(taskData.createdDate),
        })
      );
    }
  }

  // Rule: Start date should be before due date
  if (taskData.startDate && taskData.dueDate) {
    if (compareDates(taskData.startDate, taskData.dueDate) === 1) {
      blockers.push(
        tTemporal("startAfterDue", {
          startDate: formatDate(taskData.startDate),
          dueDate: formatDate(taskData.dueDate),
        })
      );
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// SESSION TEMPORAL VALIDATION
// ========================================

/**
 * Validate Session date and time fields
 */
function validateSessionDates(sessionData, action, context = {}) {
  const blockers = [];
  const warnings = [];

  // Rule: Session date should not be in the distant past (unless already completed)
  if (sessionData.date) {
    if (
      sessionData.status !== "Completed" &&
      sessionData.status !== "Cancelled"
    ) {
      if (isInPast(sessionData.date)) {
        blockers.push(
          tTemporal("hearingDatePastStatus", {
            date: formatDate(sessionData.date),
          })
        );
      }
    }
  }

  // Rule: End time must be after start time
  if (sessionData.date && sessionData.time && sessionData.endTime) {
    const startDateTime = combineDateAndTime(
      sessionData.date,
      sessionData.time
    );
    const endDateTime = combineDateAndTime(
      sessionData.date,
      sessionData.endTime
    );

    if (startDateTime && endDateTime && endDateTime <= startDateTime) {
      blockers.push(
        tTemporal("endTimeBeforeStart", {
          endTime: sessionData.endTime,
          startTime: sessionData.time,
        })
      );
    }
  }

  // Rule: Session cannot occur after closed parent lawsuit
  if (sessionData.lawsuitId) {
    const parentLawsuit = findEntity("lawsuit", sessionData.lawsuitId);
    if (parentLawsuit) {
      const isClosed =
        parentLawsuit.status === "Completed" || parentLawsuit.status === "Closed";

      if (isClosed && parentLawsuit.closeDate && sessionData.date) {
        if (compareDates(sessionData.date, parentLawsuit.closeDate) === 1) {
          blockers.push(
            tTemporal("hearingAfterLawsuitClosed", {
              closeDate: formatDate(parentLawsuit.closeDate),
            })
          );
        }
      }

      // Create action
      if (action === "create" && isClosed) {
        blockers.push(
          tTemporal("hearingCreateClosedLawsuit")
        );
      }
    }
  }

  // Rule: Session cannot occur after closed parent dossier
  if (sessionData.dossierId && !sessionData.lawsuitId) {
    const parentDossier = findEntity("dossier", sessionData.dossierId);
    if (parentDossier) {
      const isClosed = parentDossier.status === "Closed";

      if (isClosed && parentDossier.closeDate && sessionData.date) {
        if (compareDates(sessionData.date, parentDossier.closeDate) === 1) {
          blockers.push(
            tTemporal("hearingAfterDossierClosed", {
              closeDate: formatDate(parentDossier.closeDate),
            })
          );
        }
      }

      // Create action
      if (action === "create" && isClosed) {
        blockers.push(
          tTemporal("hearingCreateClosedDossier")
        );
      }
    }
  }

  // Rule: Session date should not contradict parent lifecycle
  if (sessionData.date && sessionData.lawsuitId) {
    const parentLawsuit = findEntity("lawsuit", sessionData.lawsuitId);
    if (parentLawsuit && parentLawsuit.filingDate) {
      if (compareDates(sessionData.date, parentLawsuit.filingDate) === -1) {
        blockers.push(
          tTemporal("hearingBeforeFiling", {
            date: formatDate(sessionData.date),
            filingDate: formatDate(parentLawsuit.filingDate),
          })
        );
      }
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// MISSION (HUISSIER) TEMPORAL VALIDATION
// ========================================

/**
 * Validate Mission date fields
 */
function validateMissionDates(missionData, action, context = {}) {
  const blockers = [];
  const warnings = [];

  // Rule: Assign date should be in the past or today
  if (missionData.assignDate) {
    if (isInFuture(missionData.assignDate)) {
      blockers.push(
        tTemporal("assignmentDateFuture", {
          date: formatDate(missionData.assignDate),
        })
      );
    }
  }

  // Rule: Due date should be after assign date
  if (missionData.dueDate && missionData.assignDate) {
    if (compareDates(missionData.dueDate, missionData.assignDate) <= 0) {
      blockers.push(
        tTemporal("missionDueAfterAssign", {
          dueDate: formatDate(missionData.dueDate),
          assignDate: formatDate(missionData.assignDate),
        })
      );
    }
  }

  // Rule: Due date in the past should trigger warning (unless completed)
  if (
    missionData.dueDate &&
    missionData.status !== "Completed" &&
    missionData.status !== "Cancelled"
  ) {
    if (isInPast(missionData.dueDate)) {
      warnings.push(
        tTemporal("missionDueOverdue", {
          dueDate: formatDate(missionData.dueDate),
          status: missionData.status,
        })
      );
    }
  }

  // Rule: Completion date should be after assign date
  if (missionData.completionDate && missionData.assignDate) {
    if (
      compareDates(missionData.completionDate, missionData.assignDate) === -1
    ) {
      blockers.push(
        tTemporal("missionCompletionBeforeAssign", {
          completionDate: formatDate(missionData.completionDate),
          assignDate: formatDate(missionData.assignDate),
        })
      );
    }
  }

  // Rule: Mission cannot be assigned to a closed parent
  if (action === "create") {
    let parent = null;
    let parentType = null;

    if (missionData.entityType === "lawsuit" && missionData.entityId) {
      parent = findEntity("lawsuit", missionData.entityId);
      parentType = "lawsuit";
    } else if (missionData.entityType === "dossier" && missionData.entityId) {
      parent = findEntity("dossier", missionData.entityId);
      parentType = "dossier";
    }

    if (parent) {
      const isClosed =
        parent.status === "Closed" || parent.status === "Completed";
      if (isClosed) {
        blockers.push(
          tTemporal("missionParentClosed", { parentType })
        );
      }
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// FINANCIAL ENTRY TEMPORAL VALIDATION
// ========================================

/**
 * Validate Financial Entry date fields
 */
function validateFinancialDates(financialData, action, context = {}) {
  const blockers = [];
  const warnings = [];

  // Rule: Entry date should be in the past or today
  if (financialData.date) {
    if (isInFuture(financialData.date)) {
      blockers.push(
        tTemporal("entryDateFuture", { date: formatDate(financialData.date) })
      );
    }
  }

  // Rule: Due date should be after entry date
  if (financialData.dueDate && financialData.date) {
    if (compareDates(financialData.dueDate, financialData.date) === -1) {
      blockers.push(
        tTemporal("financialDueBeforeEntry", {
          dueDate: formatDate(financialData.dueDate),
          entryDate: formatDate(financialData.date),
        })
      );
    }
  }

  // Rule: Payment date should be after entry date
  if (financialData.paymentDate && financialData.date) {
    if (compareDates(financialData.paymentDate, financialData.date) === -1) {
      blockers.push(
        tTemporal("paymentBeforeEntry", {
          paymentDate: formatDate(financialData.paymentDate),
          entryDate: formatDate(financialData.date),
        })
      );
    }
  }

  // Rule: Overdue financial entries should trigger warning
  if (
    financialData.dueDate &&
    financialData.status !== "paid" &&
    financialData.status !== "Paid"
  ) {
    if (isInPast(financialData.dueDate)) {
      warnings.push(
        tTemporal("entryOverdue", {
          dueDate: formatDate(financialData.dueDate),
        })
      );
    }
  }

  // Rule: Financial entry cannot be created for a client before their join date
  if (financialData.date && financialData.clientId) {
    const client = findEntity("client", financialData.clientId);
    if (client && client.joinDate) {
      if (compareDates(financialData.date, client.joinDate) === -1) {
        blockers.push(
          tTemporal("entryBeforeClientJoin", {
            entryDate: formatDate(financialData.date),
            joinDate: formatDate(client.joinDate),
          })
        );
      }
    }
  }

  // Rule: Financial entry should not be dated after parent dossier closure
  if (financialData.date && financialData.dossierId) {
    const dossier = findEntity("dossier", financialData.dossierId);
    if (dossier && dossier.closeDate) {
      if (compareDates(financialData.date, dossier.closeDate) === 1) {
        warnings.push(
          tTemporal("entryAfterDossierClose", {
            closeDate: formatDate(dossier.closeDate),
          })
        );
      }
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// PERSONAL TASK TEMPORAL VALIDATION
// ========================================

/**
 * Validate Personal Task date fields
 */
function validatePersonalTaskDates(personalTaskData, action, context = {}) {
  const blockers = [];
  const warnings = [];

  // Rule: Due date in the past should block (unless completed)
  if (personalTaskData.dueDate && personalTaskData.status !== "Completed") {
    if (isInPast(personalTaskData.dueDate)) {
      blockers.push(
        tTemporal("personalTaskDueOverdue", {
          date: formatDate(personalTaskData.dueDate),
        })
      );
    }
  }

  // Rule: Completion date should not be in the future
  if (personalTaskData.completionDate) {
    if (isInFuture(personalTaskData.completionDate)) {
      blockers.push(
        tTemporal("personalTaskCompletionFuture", {
          date: formatDate(personalTaskData.completionDate),
        })
      );
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// MAIN VALIDATION ENTRY POINT
// ========================================

/**
 * Main validation function - validates all date fields for any entity
 *
 * @param {string} entityType - Type of entity (client, dossier, lawsuit, task, etc.)
 * @param {object} entityData - Entity data to validate
 * @param {string} action - Action being performed (create, edit, close, etc.)
 * @param {object} context - Additional context (current data, etc.)
 * @returns {object} Validation result { allowed, blockers, warnings }
 */
export function validateTemporalConstraints(
  entityType,
  entityData,
  action = "edit",
  context = {}
) {
  // Refresh entity snapshot from live data
  loadEntities(context);

  // No data to validate
  if (!entityData) {
    return validationResult(true);
  }

  // Route to specific validator
  const validators = {
    client: validateClientDates,
    dossier: validateDossierDates,
    lawsuit: validateLawsuitDates,
    task: validateTaskDates,
    session: validateSessionDates,
    mission: validateMissionDates,
    financial: validateFinancialDates,
    personalTask: validatePersonalTaskDates,
    invoice: validateFinancialDates, // Alias for financial
    accounting: validateFinancialDates, // Alias for financial
  };

  const validator = validators[entityType];

  if (!validator) {
    // No specific validator - no temporal constraints
    return validationResult(true);
  }

  try {
    return validator(entityData, action, context);
  } catch (error) {
    console.error(`Error in temporal validation for ${entityType}:`, error);
    return validationResult(false, [tTemporal("genericError")]);
  }
}

// ========================================
// EXPORT UTILITIES FOR EXTERNAL USE
// ========================================

export const TemporalUtils = {
  parseDate,
  normalizeDate,
  today,
  compareDates,
  isInPast,
  isInFuture,
  isToday,
  combineDateAndTime,
  formatDate,
};




