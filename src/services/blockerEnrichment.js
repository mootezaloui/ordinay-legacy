/**
 * Blocker Enrichment Utility
 *
 * Converts plain text blockers into structured, actionable blocker objects
 * with navigation and resolution actions.
 *
 * This module parses blocker messages from domainRules and enriches them
 * with metadata about related entities and available actions.
 */

import {
  mockTasks,
  mockSessions,
  mockDossiers,
  mockCases,
  getAllMissions,
} from "../utils/mockData";
import { financialLedger } from "../utils/financialData";

/**
 * Enriches blockers with actionable metadata
 *
 * @param {string[]} blockers - Raw blocker messages from domainRules
 * @param {string} entityType - Type of entity being validated
 * @param {number|string} entityId - ID of entity being validated
 * @param {string} action - Action being attempted
 * @param {object} context - Additional context
 * @returns {Array<object>} Enriched blocker objects with actions
 */
export function enrichBlockers(
  blockers,
  entityType,
  entityId,
  action,
  context = {}
) {
  if (!blockers || blockers.length === 0) {
    return [];
  }

  return blockers.map((blocker) => {
    // Try to parse and enrich each blocker
    const enriched = parseBlocker(
      blocker,
      entityType,
      entityId,
      action,
      context
    );

    // If we couldn't enrich it, return as plain blocker
    if (!enriched) {
      return {
        type: "other",
        reason: blocker,
        actions: [],
      };
    }

    return enriched;
  });
}

/**
 * Parse a blocker message and extract actionable metadata
 */
function parseBlocker(blocker, entityType, entityId, action, context) {
  // Pattern 1: Incomplete tasks
  if (blocker.includes("tâche") && blocker.includes("non terminée")) {
    return parseTaskBlocker(blocker, entityType, entityId);
  }

  // Pattern 2: Open cases (procès)
  if (
    blocker.includes("procès non clos") ||
    (blocker.includes("procès") && blocker.includes("qui est clos"))
  ) {
    return parseCaseBlocker(blocker, entityType, entityId);
  }

  // Pattern 3: Upcoming/incomplete sessions
  if (
    blocker.includes("séance") &&
    (blocker.includes("à venir") || blocker.includes("non terminée"))
  ) {
    return parseSessionBlocker(blocker, entityType, entityId);
  }

  // Pattern 4: Active missions
  if (blocker.includes("mission") && blocker.includes("en cours")) {
    return parseMissionBlocker(blocker, entityType, entityId);
  }

  // Pattern 5: Unpaid financial balance
  if (blocker.includes("Solde") && blocker.includes("impayé")) {
    return parseFinancialBlocker(blocker, entityType, entityId);
  }

  // Pattern 6: Parent is closed (edit restrictions)
  if (
    blocker.includes("appartient") &&
    (blocker.includes("fermé") || blocker.includes("clos"))
  ) {
    return parseClosedParentBlocker(blocker, entityType, entityId);
  }

  // Pattern 7: Cannot create under closed parent
  if (
    blocker.includes("Impossible de créer") &&
    (blocker.includes("fermé") || blocker.includes("clos"))
  ) {
    return parseCreateUnderClosedParentBlocker(blocker, entityType, entityId);
  }

  // Pattern 8: Paid financial entry
  if (blocker.includes("écriture") && blocker.includes("payée")) {
    return parsePaidFinancialEntryBlocker(blocker, entityType, entityId);
  }

  // Pattern 9: Temporal validation errors (dates)
  if (
    blocker.includes("date") ||
    blocker.includes("Date") ||
    blocker.includes("échéance") ||
    blocker.includes("audience") ||
    blocker.includes("futur") ||
    blocker.includes("passé") ||
    blocker.includes("antérieure") ||
    blocker.includes("postérieure")
  ) {
    return parseTemporalBlocker(blocker, entityType, entityId);
  }

  return null;
}

/**
 * Parse incomplete tasks blocker
 */
function parseTaskBlocker(blocker, entityType, entityId) {
  // Extract task IDs from the blocker context
  let tasks = [];

  if (entityType === "dossier") {
    const dossier = mockDossiers.find((d) => d.id == entityId);
    if (dossier) {
      tasks = mockTasks
        .filter(
          (task) =>
            (task.parentType === "dossier" && task.dossierId == entityId) ||
            (task.parentType === "case" &&
              dossier.proceedings?.some((p) => p.id == task.caseId))
        )
        .filter((task) => task.status !== "Terminée");
    }
  } else if (entityType === "case") {
    tasks = mockTasks.filter(
      (task) =>
        task.parentType === "case" &&
        task.caseId == entityId &&
        task.status !== "Terminée"
    );
  }

  // Create action items for each incomplete task
  const items = tasks.slice(0, 5).map((task) => ({
    entityId: task.id,
    entityLabel: task.title,
    entityType: "task",
    status: task.status,
    actions: [
      {
        label: "Voir la tâche",
        type: "navigate",
        route: "/tasks",
        entityId: task.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Marquer terminée",
        type: "inline-action",
        action: "complete",
        entityType: "task",
        entityId: task.id,
        icon: "fas fa-check",
        safe: true, // Safe inline action
      },
    ],
  }));

  return {
    type: "task",
    reason: blocker,
    items,
    summary: `${tasks.length} tâche${tasks.length > 1 ? "s" : ""} non terminée${
      tasks.length > 1 ? "s" : ""
    }`,
    actions: [],
  };
}

/**
 * Parse open cases blocker
 */
function parseCaseBlocker(blocker, entityType, entityId) {
  let cases = [];

  if (entityType === "dossier") {
    const dossier = mockDossiers.find((d) => d.id == entityId);
    if (dossier && dossier.proceedings) {
      cases = dossier.proceedings.filter(
        (proc) => proc.status !== "Clos" && proc.status !== "Terminé"
      );
    }
  }

  // For case blockers, we should check the parent
  if (blocker.includes("appartient au procès")) {
    // This is a different pattern - child entity blocked by closed parent
    return parseClosedParentBlocker(blocker, entityType, entityId);
  }

  const items = cases.slice(0, 5).map((caseData) => ({
    entityId: caseData.id,
    entityLabel: `${caseData.caseNumber} - ${caseData.title}`,
    entityType: "case",
    status: caseData.status,
    actions: [
      {
        label: "Voir le procès",
        type: "navigate",
        route: "/cases",
        entityId: caseData.id,
        icon: "fas fa-external-link-alt",
      },
    ],
  }));

  return {
    type: "case",
    reason: blocker,
    items,
    summary: `${cases.length} procès non clos`,
    actions: [],
  };
}

/**
 * Parse upcoming/incomplete sessions blocker
 */
function parseSessionBlocker(blocker, entityType, entityId) {
  let sessions = [];

  if (entityType === "case") {
    const today = new Date();
    sessions = mockSessions
      .filter((session) => session.caseId == entityId)
      .filter((session) => {
        const sessionDate = new Date(session.date);
        return (
          sessionDate >= today &&
          session.status !== "Terminée" &&
          session.status !== "Annulée"
        );
      });
  }

  const items = sessions.slice(0, 5).map((session) => ({
    entityId: session.id,
    entityLabel: `${session.title} - ${session.date}`,
    entityType: "session",
    status: session.status,
    actions: [
      {
        label: "Voir la séance",
        type: "navigate",
        route: "/sessions",
        entityId: session.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Marquer terminée",
        type: "inline-action",
        action: "complete",
        entityType: "session",
        entityId: session.id,
        icon: "fas fa-check",
        safe: true,
      },
    ],
  }));

  return {
    type: "session",
    reason: blocker,
    items,
    summary: `${sessions.length} séance${
      sessions.length > 1 ? "s" : ""
    } à venir`,
    actions: [],
  };
}

/**
 * Parse active missions blocker
 */
function parseMissionBlocker(blocker, entityType, entityId) {
  const allMissions = getAllMissions();
  let missions = [];

  if (entityType === "dossier") {
    const dossier = mockDossiers.find((d) => d.id == entityId);
    if (dossier) {
      missions = allMissions.filter(
        (mission) =>
          mission.entityType === "dossier" &&
          mission.entityReference === dossier.caseNumber &&
          mission.status !== "Terminée" &&
          mission.status !== "Annulée"
      );
    }
  } else if (entityType === "case") {
    const caseData = mockCases.find((c) => c.id == entityId);
    if (caseData) {
      missions = allMissions.filter(
        (mission) =>
          mission.entityType === "case" &&
          mission.entityReference === caseData.caseNumber &&
          mission.status !== "Terminée" &&
          mission.status !== "Annulée"
      );
    }
  }

  const items = missions.slice(0, 5).map((mission) => ({
    entityId: mission.id,
    entityLabel: `${mission.missionNumber} - ${mission.title}`,
    entityType: "mission",
    status: mission.status,
    actions: [
      {
        label: "Voir la mission",
        type: "navigate",
        route: `/officers/${mission.officerId}`,
        tab: "missions",
        entityId: mission.id,
        icon: "fas fa-external-link-alt",
      },
    ],
  }));

  return {
    type: "mission",
    reason: blocker,
    items,
    summary: `${missions.length} mission${
      missions.length > 1 ? "s" : ""
    } en cours`,
    actions: [],
  };
}

/**
 * Parse unpaid financial balance blocker
 */
function parseFinancialBlocker(blocker, entityType, entityId) {
  let entries = [];

  if (entityType === "dossier") {
    const dossier = mockDossiers.find((d) => d.id == entityId);
    if (dossier) {
      entries = financialLedger.filter(
        (entry) =>
          entry.clientId == dossier.clientId &&
          entry.status !== "paid" &&
          entry.status !== "Payée"
      );
    }
  } else if (entityType === "client") {
    entries = financialLedger.filter(
      (entry) =>
        entry.clientId == entityId &&
        entry.status !== "paid" &&
        entry.status !== "Payée"
    );
  }

  const items = entries.slice(0, 5).map((entry) => ({
    entityId: entry.id,
    entityLabel: `${entry.description || "Écriture"} - ${entry.amount} TND`,
    entityType: "financialEntry",
    status: entry.status,
    actions: [
      {
        label: "Voir l'écriture",
        type: "navigate",
        route: "/accounting",
        entityId: entry.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Marquer payée",
        type: "inline-action",
        action: "markPaid",
        entityType: "financialEntry",
        entityId: entry.id,
        icon: "fas fa-check-circle",
        safe: true,
        requiresConfirmation: true,
      },
    ],
  }));

  return {
    type: "financial",
    reason: blocker,
    items,
    summary: blocker,
    actions: [],
  };
}

/**
 * Parse closed parent blocker (for edit restrictions)
 */
function parseClosedParentBlocker(blocker, entityType, entityId) {
  let parentInfo = null;

  // Extract parent information based on entity type
  if (entityType === "task") {
    const task = mockTasks.find((t) => t.id == entityId);
    if (task) {
      if (task.parentType === "dossier") {
        const dossier = mockDossiers.find((d) => d.id == task.dossierId);
        if (dossier) {
          parentInfo = {
            entityType: "dossier",
            entityId: dossier.id,
            entityLabel: `${dossier.caseNumber} - ${dossier.title}`,
            status: dossier.status,
          };
        }
      } else if (task.parentType === "case") {
        const caseData = mockCases.find((c) => c.id == task.caseId);
        if (caseData) {
          parentInfo = {
            entityType: "case",
            entityId: caseData.id,
            entityLabel: `${caseData.caseNumber} - ${caseData.title}`,
            status: caseData.status,
          };
        }
      }
    }
  } else if (entityType === "session") {
    const session = mockSessions.find((s) => s.id == entityId);
    if (session) {
      if (session.caseId) {
        const caseData = mockCases.find((c) => c.id == session.caseId);
        if (caseData) {
          parentInfo = {
            entityType: "case",
            entityId: caseData.id,
            entityLabel: `${caseData.caseNumber} - ${caseData.title}`,
            status: caseData.status,
          };
        }
      } else if (session.dossierId) {
        const dossier = mockDossiers.find((d) => d.id == session.dossierId);
        if (dossier) {
          parentInfo = {
            entityType: "dossier",
            entityId: dossier.id,
            entityLabel: `${dossier.caseNumber} - ${dossier.title}`,
            status: dossier.status,
          };
        }
      }
    }
  }

  const actions = [];
  if (parentInfo) {
    actions.push({
      label: `Aller au ${
        parentInfo.entityType === "dossier" ? "dossier" : "procès"
      }`,
      type: "navigate",
      route: parentInfo.entityType === "dossier" ? "/dossiers" : "/cases",
      entityId: parentInfo.entityId,
      icon: "fas fa-external-link-alt",
    });

    // Offer to reopen if it's just closed (not deleted/archived)
    if (parentInfo.status === "Fermé" || parentInfo.status === "Clos") {
      actions.push({
        label: `Rouvrir le ${
          parentInfo.entityType === "dossier" ? "dossier" : "procès"
        }`,
        type: "navigate",
        route: parentInfo.entityType === "dossier" ? "/dossiers" : "/cases",
        entityId: parentInfo.entityId,
        icon: "fas fa-folder-open",
        description: "Vous devez rouvrir le parent pour modifier cet élément",
      });
    }
  }

  return {
    type: "closedParent",
    reason: blocker,
    parentInfo,
    actions,
  };
}

/**
 * Parse "cannot create under closed parent" blocker
 */
function parseCreateUnderClosedParentBlocker(blocker, entityType, entityId) {
  // Extract parent ID from context - this would come from the form data
  // For now, we'll just provide navigation help
  return {
    type: "closedParent",
    reason: blocker,
    actions: [
      {
        label: "Choisir un autre parent",
        type: "inline-action",
        action: "changeParent",
        icon: "fas fa-edit",
        description: "Vous devez sélectionner un parent actif",
      },
    ],
  };
}

/**
 * Parse paid financial entry blocker
 */
function parsePaidFinancialEntryBlocker(blocker, entityType, entityId) {
  return {
    type: "financialIntegrity",
    reason: blocker,
    actions: [
      {
        label: "Voir l'écriture",
        type: "navigate",
        route: "/accounting",
        entityId: entityId,
        icon: "fas fa-external-link-alt",
      },
    ],
    warning:
      "Les écritures payées ne peuvent pas être modifiées pour garantir l'intégrité financière.",
  };
}

/**
 * Parse temporal validation blocker (date/time constraints)
 */
function parseTemporalBlocker(blocker, entityType, entityId) {
  return {
    type: "temporal",
    reason: blocker,
    actions: [],
    warning:
      "Veuillez corriger les dates pour respecter la chronologie légale.",
  };
}

/**
 * Get route for entity type
 */
export function getEntityRoute(entityType) {
  const routes = {
    dossier: "/dossiers",
    case: "/cases",
    task: "/tasks",
    session: "/sessions",
    client: "/clients",
    officer: "/officers",
    mission: "/officers", // missions are under officers
    financialEntry: "/accounting",
  };

  return routes[entityType] || "/";
}
