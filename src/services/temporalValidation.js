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

import {
  mockDossiers,
  mockCases,
  mockClients,
  mockTasks,
  mockSessions,
  getAllMissions,
} from "../utils/mockData";
import { financialLedger } from "../utils/financialData";
import { formatDateValue } from "../utils/dateFormat";

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
  if (!date) return "date invalide";

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
    client: mockClients,
    dossier: mockDossiers,
    case: mockCases,
    task: mockTasks,
    session: mockSessions,
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
    case "case": // Procès → Dossier
      return findEntity("dossier", entity.dossierId);

    case "session": // Session → Procès (or Dossier directly)
      if (entity.caseId) {
        return findEntity("case", entity.caseId);
      }
      if (entity.dossierId) {
        return findEntity("dossier", entity.dossierId);
      }
      return null;

    case "task": // Task → Dossier or Procès
      if (entity.parentType === "case" && entity.caseId) {
        return findEntity("case", entity.caseId);
      }
      if (entity.parentType === "dossier" && entity.dossierId) {
        return findEntity("dossier", entity.dossierId);
      }
      return null;

    case "mission": // Mission → Dossier or Procès
      if (entity.entityType === "dossier" && entity.entityId) {
        return findEntity("dossier", entity.entityId);
      }
      if (entity.entityType === "case" && entity.entityId) {
        return findEntity("case", entity.entityId);
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
  if (entity.caseNumber && entity.clientId) return "dossier";
  if (entity.caseNumber && entity.dossierId) return "case";
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
        `La date de naissance (${formatDate(
          clientData.dateOfBirth
        )}) ne peut pas être dans le futur.`
      );
    }

    // Warning: Birth date should be reasonable (not too far in past)
    const birthDate = parseDate(clientData.dateOfBirth);
    const yearDiff = new Date().getFullYear() - birthDate.getFullYear();
    if (yearDiff > 120) {
      warnings.push(
        `La date de naissance indique un âge de ${yearDiff} ans. Veuillez vérifier cette date.`
      );
    }

    // Warning: Minor client (under 18)
    if (yearDiff < 18) {
      warnings.push(
        `Le client serait mineur (${yearDiff} ans). Vérifiez qu'un tuteur légal est enregistré.`
      );
    }
  }

  // Rule: Join date should be in the past or today
  if (clientData.joinDate) {
    if (isInFuture(clientData.joinDate)) {
      blockers.push(
        `La date d'inscription (${formatDate(
          clientData.joinDate
        )}) ne peut pas être dans le futur.`
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

  // Rule: Open date should be in the past or today
  if (dossierData.openDate) {
    if (isInFuture(dossierData.openDate)) {
      blockers.push(
        `La date d'ouverture (${formatDate(
          dossierData.openDate
        )}) ne peut pas être dans le futur.`
      );
    }
  }

  // Rule: Open date should not be before client's join date
  if (dossierData.openDate && dossierData.clientId) {
    const client = findEntity("client", dossierData.clientId);
    if (client && client.joinDate) {
      if (compareDates(dossierData.openDate, client.joinDate) === -1) {
        blockers.push(
          `La date d'ouverture du dossier (${formatDate(
            dossierData.openDate
          )}) ne peut pas être antérieure à la date d'inscription du client (${formatDate(
            client.joinDate
          )}).`
        );
      }
    }
  }

  // Rule: Next deadline should be in the future (if set)
  if (dossierData.nextDeadline) {
    if (isInPast(dossierData.nextDeadline)) {
      warnings.push(
        `La prochaine échéance (${formatDate(
          dossierData.nextDeadline
        )}) est dans le passé. Considérez la mise à jour.`
      );
    }
  }

  // Rule: Close date should be after open date
  if (dossierData.closeDate && dossierData.openDate) {
    if (compareDates(dossierData.closeDate, dossierData.openDate) <= 0) {
      blockers.push(
        `La date de clôture (${formatDate(
          dossierData.closeDate
        )}) doit être postérieure à la date d'ouverture (${formatDate(
          dossierData.openDate
        )}).`
      );
    }
  }

  // Rule: If closing, check all child cases are closed
  if (
    action === "close" ||
    (dossierData.status === "Fermé" && context.data?.status !== "Fermé")
  ) {
    const childCases = mockCases.filter((c) => c.dossierId == dossierData.id);
    const openCases = childCases.filter(
      (c) => c.status !== "Terminé" && c.status !== "Fermé"
    );

    if (openCases.length > 0) {
      blockers.push(
        `Impossible de fermer le dossier : ${openCases.length} procès sont encore en cours.`
      );
    }
  }

  return validationResult(blockers.length === 0, blockers, warnings);
}

// ========================================
// CASE (PROCÈS) TEMPORAL VALIDATION
// ========================================

/**
 * Validate Case (Procès) date fields
 */
function validateCaseDates(caseData, action, context = {}) {
  const blockers = [];
  const warnings = [];

  // Rule: Filing date should be in the past or today
  if (caseData.filingDate) {
    if (isInFuture(caseData.filingDate)) {
      blockers.push(
        `La date de dépôt (${formatDate(
          caseData.filingDate
        )}) ne peut pas être dans le futur.`
      );
    }
  }

  // Rule: Filing date should not be before dossier open date
  if (caseData.filingDate && caseData.dossierId) {
    const dossier = findEntity("dossier", caseData.dossierId);
    if (dossier && dossier.openDate) {
      if (compareDates(caseData.filingDate, dossier.openDate) === -1) {
        blockers.push(
          `La date de dépôt du procès (${formatDate(
            caseData.filingDate
          )}) ne peut pas être antérieure à la date d'ouverture du dossier (${formatDate(
            dossier.openDate
          )}).`
        );
      }
    }
  }

  // Rule: Next hearing should be in the future
  if (caseData.nextHearing) {
    if (isInPast(caseData.nextHearing)) {
      warnings.push(
        `La prochaine audience (${formatDate(
          caseData.nextHearing
        )}) est dans le passé. Mettez à jour cette date.`
      );
    }
  }

  // Rule: Close date should be after filing date
  if (caseData.closeDate && caseData.filingDate) {
    if (compareDates(caseData.closeDate, caseData.filingDate) <= 0) {
      blockers.push(
        `La date de clôture (${formatDate(
          caseData.closeDate
        )}) doit être postérieure à la date de dépôt (${formatDate(
          caseData.filingDate
        )}).`
      );
    }
  }

  // Rule: Cannot have sessions after case is closed
  if (
    action === "close" ||
    (caseData.status === "Terminé" && context.data?.status !== "Terminé")
  ) {
    const futureSessions = mockSessions.filter(
      (s) =>
        s.caseId == caseData.id && isInFuture(s.date) && s.status !== "Annulée"
    );

    if (futureSessions.length > 0) {
      blockers.push(
        `Impossible de clore le procès : ${futureSessions.length} séance(s) future(s) sont encore programmées.`
      );
    }
  }

  // Rule: Judgment date should be after filing date
  if (caseData.judgmentDate && caseData.filingDate) {
    if (compareDates(caseData.judgmentDate, caseData.filingDate) === -1) {
      blockers.push(
        `La date du jugement (${formatDate(
          caseData.judgmentDate
        )}) ne peut pas être antérieure à la date de dépôt (${formatDate(
          caseData.filingDate
        )}).`
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
      (taskData.status !== "Terminée" && taskData.status !== "Annulée")
    ) {
      if (isInPast(taskData.dueDate)) {
        blockers.push(
          `La date d'échéance (${formatDate(
            taskData.dueDate
          )}) est dans le passé.`
        );
      }
    }
  }

  // Rule: Task deadline should not exceed next case hearing (if linked to case)
  if (taskData.dueDate && taskData.parentType === "case" && taskData.caseId) {
    const parentCase = findEntity("case", taskData.caseId);
    if (parentCase && parentCase.nextHearing) {
      if (compareDates(taskData.dueDate, parentCase.nextHearing) === 1) {
        warnings.push(
          `L'échéance de la tâche (${formatDate(
            taskData.dueDate
          )}) dépasse la prochaine audience du procès (${formatDate(
            parentCase.nextHearing
          )}). Vérifiez la cohérence.`
        );
      }
    }
  }

  // Rule: Cannot create task for closed parent
  if (action === "create") {
    let parent = null;
    let parentType = null;

    if (taskData.parentType === "case" && taskData.caseId) {
      parent = findEntity("case", taskData.caseId);
      parentType = "procès";
    } else if (taskData.parentType === "dossier" && taskData.dossierId) {
      parent = findEntity("dossier", taskData.dossierId);
      parentType = "dossier";
    }

    if (parent) {
      const isClosed =
        parent.status === "Fermé" ||
        parent.status === "Terminé" ||
        parent.status === "Clos";
      if (isClosed) {
        blockers.push(
          `Impossible de créer une tâche : le ${parentType} parent est déjà clos.`
        );
      }
    }
  }

  // Rule: Completion date should be after creation date
  if (taskData.completionDate && taskData.createdDate) {
    if (compareDates(taskData.completionDate, taskData.createdDate) === -1) {
      blockers.push(
        `La date d'achèvement (${formatDate(
          taskData.completionDate
        )}) ne peut pas être antérieure à la date de création (${formatDate(
          taskData.createdDate
        )}).`
      );
    }
  }

  // Rule: Start date should be before due date
  if (taskData.startDate && taskData.dueDate) {
    if (compareDates(taskData.startDate, taskData.dueDate) === 1) {
      blockers.push(
        `La date de début (${formatDate(
          taskData.startDate
        )}) doit être antérieure à la date d'échéance (${formatDate(
          taskData.dueDate
        )}).`
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
    if (sessionData.status !== "Terminée" && sessionData.status !== "Annulée") {
      if (isInPast(sessionData.date)) {
        blockers.push(
          `La date de la séance (${formatDate(
            sessionData.date
          )}) est dans le passé, mais son statut n'est pas "Terminée".`
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
        `L'heure de fin (${sessionData.endTime}) doit être postérieure à l'heure de début (${sessionData.time}).`
      );
    }
  }

  // Rule: Session cannot occur after closed parent case
  if (sessionData.caseId) {
    const parentCase = findEntity("case", sessionData.caseId);
    if (parentCase) {
      const isClosed =
        parentCase.status === "Terminé" || parentCase.status === "Fermé";

      if (isClosed && parentCase.closeDate && sessionData.date) {
        if (compareDates(sessionData.date, parentCase.closeDate) === 1) {
          blockers.push(
            `La séance ne peut pas être programmée après la clôture du procès (${formatDate(
              parentCase.closeDate
            )}).`
          );
        }
      }

      // Create action
      if (action === "create" && isClosed) {
        blockers.push(
          `Impossible de créer une séance : le procès parent est déjà clos.`
        );
      }
    }
  }

  // Rule: Session cannot occur after closed parent dossier
  if (sessionData.dossierId && !sessionData.caseId) {
    const parentDossier = findEntity("dossier", sessionData.dossierId);
    if (parentDossier) {
      const isClosed = parentDossier.status === "Fermé";

      if (isClosed && parentDossier.closeDate && sessionData.date) {
        if (compareDates(sessionData.date, parentDossier.closeDate) === 1) {
          blockers.push(
            `La séance ne peut pas être programmée après la clôture du dossier (${formatDate(
              parentDossier.closeDate
            )}).`
          );
        }
      }

      // Create action
      if (action === "create" && isClosed) {
        blockers.push(
          `Impossible de créer une séance : le dossier parent est déjà fermé.`
        );
      }
    }
  }

  // Rule: Session date should not contradict parent lifecycle
  if (sessionData.date && sessionData.caseId) {
    const parentCase = findEntity("case", sessionData.caseId);
    if (parentCase && parentCase.filingDate) {
      if (compareDates(sessionData.date, parentCase.filingDate) === -1) {
        blockers.push(
          `La date de la séance (${formatDate(
            sessionData.date
          )}) ne peut pas être antérieure à la date de dépôt du procès (${formatDate(
            parentCase.filingDate
          )}).`
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
        `La date d'assignation (${formatDate(
          missionData.assignDate
        )}) ne peut pas être dans le futur.`
      );
    }
  }

  // Rule: Due date should be after assign date
  if (missionData.dueDate && missionData.assignDate) {
    if (compareDates(missionData.dueDate, missionData.assignDate) <= 0) {
      blockers.push(
        `La date d'échéance (${formatDate(
          missionData.dueDate
        )}) doit être postérieure à la date d'assignation (${formatDate(
          missionData.assignDate
        )}).`
      );
    }
  }

  // Rule: Due date in the past should trigger warning (unless completed)
  if (
    missionData.dueDate &&
    missionData.status !== "Terminée" &&
    missionData.status !== "Annulée"
  ) {
    if (isInPast(missionData.dueDate)) {
      warnings.push(
        `L'échéance de la mission (${formatDate(
          missionData.dueDate
        )}) est dépassée. Statut actuel : ${missionData.status}.`
      );
    }
  }

  // Rule: Completion date should be after assign date
  if (missionData.completionDate && missionData.assignDate) {
    if (
      compareDates(missionData.completionDate, missionData.assignDate) === -1
    ) {
      blockers.push(
        `La date d'achèvement (${formatDate(
          missionData.completionDate
        )}) ne peut pas être antérieure à la date d'assignation (${formatDate(
          missionData.assignDate
        )}).`
      );
    }
  }

  // Rule: Mission cannot be assigned to a closed parent
  if (action === "create") {
    let parent = null;
    let parentType = null;

    if (missionData.entityType === "case" && missionData.entityId) {
      parent = findEntity("case", missionData.entityId);
      parentType = "procès";
    } else if (missionData.entityType === "dossier" && missionData.entityId) {
      parent = findEntity("dossier", missionData.entityId);
      parentType = "dossier";
    }

    if (parent) {
      const isClosed = parent.status === "Fermé" || parent.status === "Terminé";
      if (isClosed) {
        blockers.push(
          `Impossible de créer une mission : le ${parentType} parent est déjà clos.`
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
        `La date de l'écriture (${formatDate(
          financialData.date
        )}) ne peut pas être dans le futur.`
      );
    }
  }

  // Rule: Due date should be after entry date
  if (financialData.dueDate && financialData.date) {
    if (compareDates(financialData.dueDate, financialData.date) === -1) {
      blockers.push(
        `La date d'échéance (${formatDate(
          financialData.dueDate
        )}) doit être postérieure ou égale à la date de l'écriture (${formatDate(
          financialData.date
        )}).`
      );
    }
  }

  // Rule: Payment date should be after entry date
  if (financialData.paymentDate && financialData.date) {
    if (compareDates(financialData.paymentDate, financialData.date) === -1) {
      blockers.push(
        `La date de paiement (${formatDate(
          financialData.paymentDate
        )}) ne peut pas être antérieure à la date de l'écriture (${formatDate(
          financialData.date
        )}).`
      );
    }
  }

  // Rule: Overdue financial entries should trigger warning
  if (
    financialData.dueDate &&
    financialData.status !== "paid" &&
    financialData.status !== "Payée"
  ) {
    if (isInPast(financialData.dueDate)) {
      warnings.push(
        `Cette écriture est en retard. Échéance dépassée : ${formatDate(
          financialData.dueDate
        )}.`
      );
    }
  }

  // Rule: Financial entry cannot be created for a client before their join date
  if (financialData.date && financialData.clientId) {
    const client = findEntity("client", financialData.clientId);
    if (client && client.joinDate) {
      if (compareDates(financialData.date, client.joinDate) === -1) {
        blockers.push(
          `La date de l'écriture (${formatDate(
            financialData.date
          )}) ne peut pas être antérieure à la date d'inscription du client (${formatDate(
            client.joinDate
          )}).`
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
          `L'écriture est datée après la fermeture du dossier (${formatDate(
            dossier.closeDate
          )}). Vérifiez la cohérence.`
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
  if (personalTaskData.dueDate && personalTaskData.status !== "Terminée") {
    if (isInPast(personalTaskData.dueDate)) {
      blockers.push(
        `L'échéance (${formatDate(personalTaskData.dueDate)}) est dépassée.`
      );
    }
  }

  // Rule: Completion date should not be in the future
  if (personalTaskData.completionDate) {
    if (isInFuture(personalTaskData.completionDate)) {
      blockers.push(
        `La date d'achèvement (${formatDate(
          personalTaskData.completionDate
        )}) ne peut pas être dans le futur.`
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
 * @param {string} entityType - Type of entity (client, dossier, case, task, etc.)
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
  // No data to validate
  if (!entityData) {
    return validationResult(true);
  }

  // Route to specific validator
  const validators = {
    client: validateClientDates,
    dossier: validateDossierDates,
    case: validateCaseDates,
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
    return validationResult(false, [
      `Erreur de validation temporelle. Veuillez vérifier les dates saisies.`,
    ]);
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
