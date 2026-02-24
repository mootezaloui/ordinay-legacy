/**
 * Blocker Enrichment Utility
 *
 * Converts plain text blockers into structured, actionable blocker objects
 * with navigation and resolution actions.
 *
 * This module parses blocker messages from domainRules and enriches them
 * with metadata about related entities and available actions.
 *
 * Note: All data comes from the live entities provided via the context argument.
 */

import { i18nInstance } from "../i18n";
import { formatCurrency, getStoredCurrency } from "../utils/currency";

const t = (key, options) => i18nInstance.t(key, { ns: "common", ...options });
const tDomain = (key, options) =>
  i18nInstance.t(key, { ns: "domain", ...options });

const getData = (context = {}) => ({
  tasks: context.tasks || context.entities?.tasks || [],
  sessions: context.sessions || context.entities?.sessions || [],
  dossiers: context.dossiers || context.entities?.dossiers || [],
  lawsuits: context.lawsuits || context.entities?.lawsuits || [],
  missions: context.missions || context.entities?.missions || [],
  clients: context.clients || context.entities?.clients || [],
  officers: context.officers || context.entities?.officers || [],
  financialEntries:
    context.financialEntries || context.entities?.financialEntries || [],
});

/**
 * Enriches blockers with actionable metadata
 *
 * @param {string[]} blockers - Raw blocker messages from domainRules
 * @param {string} entityType - Type of entity being validated
 * @param {number|string} entityId - ID of entity being validated
 * @param {string} action - Action being attempted
 * @param {object} context - Additional context (must include entities snapshot)
 * @returns {Array<object>} Enriched blocker objects with actions
 */
export function enrichBlockers(
  blockers,
  entityType,
  entityId,
  action,
  context = {},
) {
  const data = getData(context);

  if (!blockers || blockers.length === 0) {
    return [];
  }

  return blockers.map((blocker) => {
    // Try to parse and enrich each blocker
    const enriched = parseBlocker(blocker, entityType, entityId, action, data);

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
function parseBlocker(blocker, entityType, entityId, action, data) {
  // Pattern 1: Incomplete tasks
  if (blocker.includes("task") && blocker.includes("not completed")) {
    return parseTaskBlocker(blocker, entityType, entityId, data);
  }
  if (blocker.includes("open Task")) {
    return parseTaskBlockerEnglish(blocker, entityType, entityId, data);
  }

  // Pattern 2: Open lawsuits
  if (
    blocker.includes("lawsuit not closed") ||
    (blocker.includes("lawsuit") && blocker.includes("which is closed"))
  ) {
    return parseCaseBlocker(blocker, entityType, entityId, data);
  }
  if (blocker.includes("open Lawsuit")) {
    return parseCaseBlockerEnglish(blocker, entityType, entityId, data);
  }

  // Pattern 2.5: Open Dossiers (English and French)
  if (
    blocker.includes("open Dossier") ||
    blocker.includes("dossier ouvert") ||
    blocker.includes("dossiers ouverts")
  ) {
    return parseDossierBlockerEnglish(blocker, entityType, entityId, data);
  }

  // Pattern 3: Upcoming/incomplete hearings
  if (
    blocker.includes("hearing") &&
    (blocker.includes("upcoming") || blocker.includes("not completed"))
  ) {
    return parseSessionBlocker(blocker, entityType, entityId, data);
  }
  if (blocker.includes("open Hearing")) {
    return parseSessionBlockerEnglish(blocker, entityType, entityId, data);
  }

  // Pattern 4: Active missions
  if (
    (blocker.includes("mission") && blocker.includes("in progress")) ||
    blocker.includes("active bailiff mission")
  ) {
    return parseMissionBlocker(blocker, entityType, entityId, data);
  }

  // Pattern 5: Unpaid financial balance
  if (blocker.includes("Balance") && blocker.includes("unpaid")) {
    return parseFinancialBlocker(blocker, entityType, entityId, data);
  }
  const normalizedBlocker = blocker.toLowerCase();
  const includesUnpaid = normalizedBlocker.includes("unpaid");
  const includesBalance = normalizedBlocker.includes("balance");
  const isEnglishFinancial = includesUnpaid && includesBalance;

  if (isEnglishFinancial) {
    return parseFinancialBlockerEnglish(blocker, entityType, entityId, data);
  }

  // Pattern 6: Parent is closed (edit restrictions)
  if (
    (blocker.includes("belongs to") && blocker.includes("closed")) ||
    (blocker.includes("parent Dossier") && blocker.includes("closed")) ||
    (blocker.includes("parent Lawsuit") && blocker.includes("closed"))
  ) {
    return parseClosedParentBlocker(blocker, entityType, entityId, data);
  }

  // Pattern 7: Cannot create under closed parent
  if (blocker.includes("Cannot create") && blocker.includes("closed")) {
    return parseCreateUnderClosedParentBlocker(blocker, entityType, entityId);
  }

  // Pattern 8: Paid financial entry
  if (blocker.includes("entry") && blocker.includes("paid")) {
    return parsePaidFinancialEntryBlocker(blocker, entityType, entityId);
  }

  // Pattern 9: Temporal validation errors (dates)
  if (
    blocker.includes("date") ||
    blocker.includes("Date") ||
    blocker.includes("deadline") ||
    blocker.includes("hearing") ||
    blocker.includes("future") ||
    blocker.includes("past") ||
    blocker.includes("before") ||
    blocker.includes("after")
  ) {
    return parseTemporalBlocker(blocker, entityType, entityId);
  }

  // Pattern 10: Inactive ancestor client / inactive client parent
  if (
    (normalizedBlocker.includes("linked client") && normalizedBlocker.includes("inactive")) ||
    (normalizedBlocker.includes("inactive client") && normalizedBlocker.includes("cannot"))
  ) {
    return parseInactiveClientBlocker(blocker, entityType, entityId, data);
  }

  // Pattern 11: Relationship mismatch blockers
  if (
    normalizedBlocker.includes("does not belong to the selected client") ||
    normalizedBlocker.includes("does not belong to the selected dossier") ||
    normalizedBlocker.includes("selected dossier was not found") ||
    normalizedBlocker.includes("selected lawsuit was not found") ||
    normalizedBlocker.includes("selected client was not found")
  ) {
    return parseRelationshipMismatchBlocker(blocker, entityType, entityId, data);
  }

  // Pattern 12: Officer/bailiff availability blockers
  if (
    (normalizedBlocker.includes("bailiff/officer") && normalizedBlocker.includes("inactive")) ||
    normalizedBlocker.includes("officer not found") ||
    normalizedBlocker.includes("active mission")
  ) {
    return parseOfficerAvailabilityBlocker(blocker, entityType, entityId, data);
  }

  return null;
}

/**
 * Parse incomplete tasks blocker
 */
function parseTaskBlocker(blocker, entityType, entityId, data) {
  let tasks = [];

  if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      const proceedings = data.lawsuits.filter(
        (c) => c.dossierId === dossier.id,
      );
      tasks = data.tasks
        .filter(
          (task) =>
            (task.parentType === "dossier" && task.dossierId == entityId) ||
            (task.parentType === "lawsuit" &&
              proceedings.some((p) => p.id == task.lawsuitId)),
        )
        .filter((task) => task.status !== "Done");
    }
  } else if (entityType === "lawsuit") {
    tasks = data.tasks.filter(
      (task) =>
        task.parentType === "lawsuit" &&
        task.lawsuitId == entityId &&
        task.status !== "Done",
    );
  }

  const items = tasks.slice(0, 5).map((task) => ({
    entityId: task.id,
    entityLabel: task.title,
    entityType: "task",
    status: task.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewTask"),
        type: "navigate",
        route: "/tasks",
        entityId: task.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.markComplete"),
        type: "inline-action",
        action: "complete",
        entityType: "task",
        entityId: task.id,
        icon: "fas fa-check",
        safe: true,
      },
    ],
  }));

  return {
    type: "task",
    reason: blocker,
    items,
    summary:
      tasks.length > 1
        ? t("detail.blocker.enrichment.summary.incompleteTasks", {
            count: tasks.length,
          })
        : t("detail.blocker.enrichment.summary.incompleteTask", {
            count: tasks.length,
          }),
    helpText:
      entityType === "dossier"
        ? t("detail.blocker.enrichment.helpText.closeDossierTasks")
        : t("detail.blocker.enrichment.helpText.closeLawsuitTasks"),
    actions: [],
  };
}

/**
 * Parse open lawsuits blocker
 */
function parseCaseBlocker(blocker, entityType, entityId, data) {
  let lawsuits = [];

  if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      const proceedings = data.lawsuits.filter(
        (c) => c.dossierId === dossier.id,
      );
      lawsuits = proceedings.filter((proc) => proc.status !== "Closed");
    }
  }

  if (blocker.includes("belongs to the lawsuit")) {
    return parseClosedParentBlocker(blocker, entityType, entityId, data);
  }

  const items = lawsuits.slice(0, 5).map((caseData) => ({
    entityId: caseData.id,
    entityLabel: `${caseData.lawsuitNumber} - ${caseData.title}`,
    entityType: "lawsuit",
    status: caseData.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewLawsuit"),
        type: "navigate",
        route: "/lawsuits",
        entityId: caseData.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.closeLawsuit"),
        type: "inline-action",
        action: "close",
        entityType: "lawsuit",
        entityId: caseData.id,
        icon: "fas fa-times-circle",
        safe: false,
        requiresConfirmation: true,
      },
    ],
  }));

  return {
    type: "lawsuit",
    reason: blocker,
    items,
    summary:
      lawsuits.length > 1
        ? t("detail.blocker.enrichment.summary.openLawsuits", {
            count: lawsuits.length,
          })
        : t("detail.blocker.enrichment.summary.openLawsuit", {
            count: lawsuits.length,
          }),
    helpText: t("detail.blocker.enrichment.helpText.closeDossierLawsuits"),
    actions: [],
  };
}

/**
 * Parse upcoming/incomplete sessions blocker
 */
function parseSessionBlocker(blocker, entityType, entityId, data) {
  let sessions = [];

  if (entityType === "lawsuit") {
    const today = new Date();
    sessions = data.sessions
      .filter((session) => session.lawsuitId == entityId)
      .filter((session) => {
        const sessionDate = new Date(session.date);
        return (
          sessionDate >= today &&
          session.status !== "Completed" &&
          session.status !== "Cancelled"
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
        label: t("detail.blocker.enrichment.actions.viewHearing"),
        type: "navigate",
        route: "/sessions",
        entityId: session.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.markComplete"),
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
    summary:
      sessions.length > 1
        ? t("detail.blocker.enrichment.summary.upcomingHearings", {
            count: sessions.length,
          })
        : t("detail.blocker.enrichment.summary.upcomingHearing", {
            count: sessions.length,
          }),
    helpText: t("detail.blocker.enrichment.helpText.closeLawsuitHearings"),
    actions: [],
  };
}

/**
 * Parse active missions blocker
 */
function parseMissionBlocker(blocker, entityType, entityId, data) {
  const allMissions = data.missions || [];
  let missions = [];

  if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      missions = allMissions.filter(
        (mission) =>
          mission.entityType === "dossier" &&
          mission.entityId === dossier.id &&
          mission.status !== "Completed" &&
          mission.status !== "Cancelled",
      );
    }
  } else if (entityType === "lawsuit") {
    const caseData = data.lawsuits.find((c) => c.id == entityId);
    if (caseData) {
      missions = allMissions.filter(
        (mission) =>
          mission.entityType === "lawsuit" &&
          mission.entityId === caseData.id &&
          mission.status !== "Completed" &&
          mission.status !== "Cancelled",
      );
    }
  }

  const items = missions.slice(0, 5).map((mission) => ({
    entityId: mission.id,
    entityLabel: `${mission.missionNumber || mission.id} - ${
      mission.title || t("detail.blocker.entityTypes.mission")
    }`,
    entityType: "mission",
    status: mission.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewMission"),
        type: "navigate",
        route: "/missions",
        entityId: mission.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.completeMission"),
        type: "inline-action",
        action: "complete",
        entityType: "mission",
        entityId: mission.id,
        icon: "fas fa-check",
        safe: true,
      },
    ],
  }));

  return {
    type: "mission",
    reason: blocker,
    items,
    summary:
      missions.length > 1
        ? t("detail.blocker.enrichment.summary.activeMissions", {
            count: missions.length,
          })
        : t("detail.blocker.enrichment.summary.activeMission", {
            count: missions.length,
          }),
    helpText:
      entityType === "dossier"
        ? t("detail.blocker.enrichment.helpText.closeDossierMissions")
        : t("detail.blocker.enrichment.helpText.closeLawsuitMissions"),
    actions: [],
  };
}

/**
 * Parse unpaid financial balance blocker
 *
 * FINANCIAL STABILIZATION (Phase 1):
 * - Only considers receivable entries (what client owes)
 * - Ignores payable/internal entries
 * - Provides clear, actionable messages
 */
function parseFinancialBlocker(blocker, entityType, entityId, data) {
  let entries = [];

  // Helper to check if entry is paid
  const isPaid = (entry) => {
    if (entry.isPaid) return true;
    if (entry.paidAt || entry.paid_at) return true;
    const status = String(entry.status || "").toLowerCase();
    return ["paid", "payé", "payée"].includes(status);
  };

  // Helper to check if entry is cancelled
  const isCancelled = (entry) => {
    const status = String(entry.status || "").toLowerCase();
    return ["void", "cancelled", "annulé"].includes(status);
  };

  // Helper to get direction (receivable vs payable)
  const getDirection = (entry) => {
    if (entry.direction) return entry.direction;
    if (entry.scope === "internal") return "payable";
    return "receivable";
  };

  if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      // Only receivable entries that are unpaid
      entries = data.financialEntries.filter(
        (entry) =>
          entry.clientId == dossier.clientId &&
          !isPaid(entry) &&
          !isCancelled(entry) &&
          getDirection(entry) === "receivable",
      );
    }
  } else if (entityType === "client") {
    // Only receivable entries that are unpaid
    entries = data.financialEntries.filter(
      (entry) =>
        entry.clientId == entityId &&
        !isPaid(entry) &&
        !isCancelled(entry) &&
        getDirection(entry) === "receivable",
    );
  }

  const items = entries.slice(0, 5).map((entry) => ({
    entityId: entry.id,
    entityLabel: `${entry.description || entry.title || t("detail.blocker.entityTypes.financialEntry")} - ${formatCurrency(entry.amount)}`,
    entityType: "financialEntry",
    status: entry.status,
    amount: entry.amount,
    currency: getStoredCurrency(),
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewEntry"),
        type: "navigate",
        route: "/accounting",
        entityId: entry.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.markAsPaid"),
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

  // Calculate total outstanding
  const totalOutstanding = entries.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  );

  // More specific help text
  let helpText = "";
  if (entityType === "dossier") {
    helpText = tDomain("financial.helpDossier");
  } else if (entityType === "client") {
    helpText = tDomain("financial.helpClient");
  }

  return {
    type: "financial",
    reason: blocker,
    items,
    summary: blocker,
    totalOutstanding,
    unpaidCount: entries.length,
    helpText,
    actions: [],
  };
}

/**
 * Parse closed parent blocker (for edit restrictions)
 */
function parseClosedParentBlocker(blocker, entityType, entityId, data) {
  let parentInfo = null;

  if (entityType === "task") {
    const task = data.tasks.find((t) => t.id == entityId);
    if (task) {
      if (task.parentType === "dossier") {
        const dossier = data.dossiers.find((d) => d.id == task.dossierId);
        if (dossier) {
          parentInfo = {
            entityType: "dossier",
            entityId: dossier.id,
            entityLabel: `${dossier.lawsuitNumber || dossier.id} - ${
              dossier.title
            }`,
            status: dossier.status,
          };
        }
      } else if (task.parentType === "lawsuit") {
        const caseData = data.lawsuits.find((c) => c.id == task.lawsuitId);
        if (caseData) {
          parentInfo = {
            entityType: "lawsuit",
            entityId: caseData.id,
            entityLabel: `${caseData.lawsuitNumber || caseData.id} - ${
              caseData.title
            }`,
            status: caseData.status,
          };
        }
      }
    }
  } else if (entityType === "session") {
    const session = data.sessions.find((s) => s.id == entityId);
    if (session) {
      if (session.lawsuitId) {
        const caseData = data.lawsuits.find((c) => c.id == session.lawsuitId);
        if (caseData) {
          parentInfo = {
            entityType: "lawsuit",
            entityId: caseData.id,
            entityLabel: `${caseData.lawsuitNumber || caseData.id} - ${
              caseData.title
            }`,
            status: caseData.status,
          };
        }
      } else if (session.dossierId) {
        const dossier = data.dossiers.find((d) => d.id == session.dossierId);
        if (dossier) {
          parentInfo = {
            entityType: "dossier",
            entityId: dossier.id,
            entityLabel: `${dossier.lawsuitNumber || dossier.id} - ${
              dossier.title
            }`,
            status: dossier.status,
          };
        }
      }
    }
  }

  const actions = [];
  if (parentInfo) {
    actions.push({
      label: t("detail.blocker.enrichment.actions.goTo", {
        entityType:
          parentInfo.entityType === "dossier"
            ? t("detail.blocker.entityTypes.dossier")
            : t("detail.blocker.entityTypes.lawsuit"),
      }),
      type: "navigate",
      route: parentInfo.entityType === "dossier" ? "/dossiers" : "/lawsuits",
      entityId: parentInfo.entityId,
      icon: "fas fa-external-link-alt",
    });

    if (parentInfo.status === "Closed") {
      actions.push({
        label: t("detail.blocker.enrichment.actions.reopen", {
          entityType:
            parentInfo.entityType === "dossier"
              ? t("detail.blocker.entityTypes.dossier")
              : t("detail.blocker.entityTypes.lawsuit"),
        }),
        type: "navigate",
        route: parentInfo.entityType === "dossier" ? "/dossiers" : "/lawsuits",
        entityId: parentInfo.entityId,
        icon: "fas fa-folder-open",
        description: t("detail.blocker.enrichment.helpText.closedParent"),
      });
    }
  }

  return {
    type: "closedParent",
    reason: blocker,
    // Placeholder item prevents UI from treating blocker as auto-resolved
    items: [
      {
        id: `closed-parent-${entityType}-${entityId}`,
        message: blocker,
      },
    ],
    parentInfo,
    actions,
    helpText: t("detail.blocker.enrichment.helpText.closedParent"),
  };
}

/**
 * Parse "cannot create under closed parent" blocker
 */
function parseCreateUnderClosedParentBlocker(blocker) {
  return {
    type: "closedParent",
    reason: blocker,
    // Placeholder item prevents UI from treating blocker as auto-resolved
    items: [{ id: "closed-parent-create", message: blocker }],
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.chooseAnotherParent"),
        type: "inline-action",
        action: "changeParent",
        icon: "fas fa-edit",
        description: t(
          "detail.blocker.enrichment.helpText.cannotCreateUnderClosed",
        ),
      },
    ],
    helpText: t("detail.blocker.enrichment.helpText.cannotCreateUnderClosed"),
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
        label: t("detail.blocker.enrichment.actions.viewEntry"),
        type: "navigate",
        route: "/accounting",
        entityId: entityId,
        icon: "fas fa-external-link-alt",
      },
    ],
    helpText: t("detail.blocker.enrichment.helpText.paidEntryLocked"),
  };
}

/**
 * Parse temporal validation blocker (date/time constraints)
 */
function parseTemporalBlocker(blocker, entityType, entityId) {
  return {
    type: "temporal",
    reason: blocker,
    // Temporal blockers are informational - user must manually correct dates
    // Add a placeholder item to prevent "resolved" status
    items: [{ id: "temporal-validation", message: blocker }],
    actions: [],
    warning: t("detail.blocker.enrichment.warnings.correctDates"),
    helpText: t("detail.blocker.enrichment.helpText.temporalConstraints"),
  };
}

function parseInactiveClientBlocker(blocker, entityType, entityId, data) {
  let client = null;
  if (entityType === "client") {
    client = (data.clients || []).find?.((c) => c.id == entityId) || null;
  }
  if (!client && entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    client = dossier ? (data.clients || []).find((c) => c.id == dossier.clientId) : null;
  }
  if (!client && (entityType === "lawsuit" || entityType === "task" || entityType === "session" || entityType === "mission")) {
    const lawsuit =
      entityType === "lawsuit"
        ? data.lawsuits.find((l) => l.id == entityId)
        : null;
    const dossierId = lawsuit?.dossierId || null;
    const dossier = dossierId ? data.dossiers.find((d) => d.id == dossierId) : null;
    client = dossier ? (data.clients || []).find((c) => c.id == dossier.clientId) : null;
  }

  const actions = [];
  if (client) {
    actions.push({
      label: t("detail.blocker.enrichment.actions.goTo", {
        entityType: "Client",
      }),
      type: "navigate",
      route: "/clients",
      entityId: client.id,
      icon: "fas fa-external-link-alt",
    });
  }

  return {
    type: "inactiveClient",
    reason: blocker,
    items: [{ id: `inactive-client-${entityType}-${entityId}`, message: blocker }],
    actions,
    helpText: "Reactivate the client or move the record to an active client before retrying.",
  };
}

function parseRelationshipMismatchBlocker(blocker, entityType, entityId) {
  return {
    type: "relationshipMismatch",
    reason: blocker,
    items: [{ id: `relationship-mismatch-${entityType}-${entityId}`, message: blocker }],
    actions: [],
    helpText: "Check the selected parent-child links and make sure the records belong to each other.",
  };
}

function parseOfficerAvailabilityBlocker(blocker, entityType, entityId, data) {
  const actions = [];
  if (entityType === "mission") {
    actions.push({
      label: t("detail.blocker.enrichment.actions.viewMission"),
      type: "navigate",
      route: "/missions",
      entityId,
      icon: "fas fa-external-link-alt",
    });
  } else if (entityType === "officer") {
    actions.push({
      label: t("detail.blocker.enrichment.actions.goTo", { entityType: "Bailiff" }),
      type: "navigate",
      route: "/officers",
      entityId,
      icon: "fas fa-external-link-alt",
    });
    const activeMissions = data.missions.filter(
      (m) =>
        m.officerId == entityId &&
        !["completed", "cancelled", "closed"].includes(String(m.status || "").toLowerCase()),
    );
    for (const m of activeMissions.slice(0, 5)) {
      actions.push({
        label: `${t("detail.blocker.enrichment.actions.viewMission")} #${m.id}`,
        type: "navigate",
        route: "/missions",
        entityId: m.id,
        icon: "fas fa-briefcase",
      });
    }
  }

  return {
    type: "officerAvailability",
    reason: blocker,
    items: [{ id: `officer-availability-${entityType}-${entityId}`, message: blocker }],
    actions,
    helpText: "Assign an active bailiff/officer or finish active missions before retrying.",
  };
}

/**
 * Parse open Dossiers blocker (English)
 */
function parseDossierBlockerEnglish(blocker, entityType, entityId, data) {
  let dossiers = [];

  if (entityType === "client") {
    dossiers = data.dossiers.filter(
      (d) => d.clientId == entityId && d.status !== "Closed",
    );
  }

  const items = dossiers.slice(0, 5).map((dossier) => ({
    entityId: dossier.id,
    entityLabel: `${dossier.lawsuitNumber} - ${dossier.title}`,
    entityType: "dossier",
    status: dossier.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewDossier"),
        type: "navigate",
        route: "/dossiers",
        entityId: dossier.id,
        icon: "fas fa-external-link-alt",
      },
    ],
  }));

  return {
    type: "dossier",
    reason: blocker,
    items,
    summary:
      dossiers.length > 1
        ? t("detail.blocker.enrichment.summary.openDossiers", {
            count: dossiers.length,
          })
        : t("detail.blocker.enrichment.summary.openDossier", {
            count: dossiers.length,
          }),
    helpText: t("detail.blocker.enrichment.helpText.inactivateClientDossiers"),
    actions: [],
  };
}

/**
 * Parse open Lawsuits blocker (English)
 */
function parseCaseBlockerEnglish(blocker, entityType, entityId, data) {
  let lawsuits = [];

  if (entityType === "client") {
    const clientDossiers = data.dossiers.filter((d) => d.clientId == entityId);
    lawsuits = data.lawsuits.filter(
      (c) =>
        clientDossiers.some((d) => d.id === c.dossierId) &&
        c.status !== "Closed",
    );
  } else if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      lawsuits = data.lawsuits.filter(
        (c) => c.dossierId === dossier.id && c.status !== "Closed",
      );
    }
  }

  const items = lawsuits.slice(0, 5).map((caseData) => ({
    entityId: caseData.id,
    entityLabel: `${caseData.lawsuitNumber} - ${caseData.title}`,
    entityType: "lawsuit",
    status: caseData.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewLawsuit"),
        type: "navigate",
        route: "/lawsuits",
        entityId: caseData.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.closeLawsuit"),
        type: "inline-action",
        action: "close",
        entityType: "lawsuit",
        entityId: caseData.id,
        icon: "fas fa-times-circle",
        safe: false,
        requiresConfirmation: true,
      },
    ],
  }));

  // Context-aware helpText
  let helpText = t("detail.blocker.enrichment.helpText.closeDossierLawsuits");
  if (entityType === "dossier") {
    helpText = t("detail.blocker.enrichment.helpText.closeDossierLawsuits");
  } else if (entityType === "client") {
    helpText = t("detail.blocker.enrichment.helpText.inactivateClientLawsuits");
  }

  return {
    type: "lawsuit",
    reason: blocker,
    items,
    summary:
      lawsuits.length > 1
        ? t("detail.blocker.enrichment.summary.openLawsuits", {
            count: lawsuits.length,
          })
        : t("detail.blocker.enrichment.summary.openLawsuit", {
            count: lawsuits.length,
          }),
    helpText,
    actions: [],
  };
}

/**
 * Parse open Tasks blocker (English)
 */
function parseTaskBlockerEnglish(blocker, entityType, entityId, data) {
  let tasks = [];

  if (entityType === "client") {
    const clientDossiers = data.dossiers.filter((d) => d.clientId == entityId);
    const clientCases = data.lawsuits.filter((c) =>
      clientDossiers.some((d) => d.id === c.dossierId),
    );

    tasks = data.tasks.filter((task) => {
      if (task.dossierId) {
        return (
          clientDossiers.some((d) => d.id === task.dossierId) &&
          task.status !== "Done" &&
          task.status !== "Cancelled"
        );
      }
      if (task.lawsuitId && task.parentType === "lawsuit") {
        return (
          clientCases.some((c) => c.id === task.lawsuitId) &&
          task.status !== "Done" &&
          task.status !== "Cancelled"
        );
      }
      return false;
    });
  } else if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      const proceedings = data.lawsuits.filter(
        (c) => c.dossierId === dossier.id,
      );
      tasks = data.tasks
        .filter(
          (task) =>
            (task.parentType === "dossier" && task.dossierId == entityId) ||
            (task.parentType === "lawsuit" &&
              proceedings.some((p) => p.id == task.lawsuitId)),
        )
        .filter(
          (task) => task.status !== "Done" && task.status !== "Cancelled",
        );
    }
  } else if (entityType === "lawsuit") {
    tasks = data.tasks.filter(
      (task) =>
        task.parentType === "lawsuit" &&
        task.lawsuitId == entityId &&
        task.status !== "Done" &&
        task.status !== "Cancelled",
    );
  }

  const items = tasks.slice(0, 5).map((task) => ({
    entityId: task.id,
    entityLabel: task.title,
    entityType: "task",
    status: task.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewTask"),
        type: "navigate",
        route: "/tasks",
        entityId: task.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.markComplete"),
        type: "inline-action",
        action: "complete",
        entityType: "task",
        entityId: task.id,
        icon: "fas fa-check",
        safe: true,
      },
    ],
  }));

  let helpText = t("detail.blocker.enrichment.helpText.closeDossierTasks");
  if (entityType === "dossier") {
    helpText = t("detail.blocker.enrichment.helpText.closeDossierTasks");
  } else if (entityType === "lawsuit") {
    helpText = t("detail.blocker.enrichment.helpText.closeLawsuitTasks");
  } else if (entityType === "client") {
    helpText = t("detail.blocker.enrichment.helpText.inactivateClientTasks");
  }

  return {
    type: "task",
    reason: blocker,
    items,
    summary:
      tasks.length > 1
        ? t("detail.blocker.enrichment.summary.openTasks", {
            count: tasks.length,
          })
        : t("detail.blocker.enrichment.summary.openTask", {
            count: tasks.length,
          }),
    helpText,
    actions: [],
  };
}

/**
 * Parse open Hearings blocker (English)
 */
function parseSessionBlockerEnglish(blocker, entityType, entityId, data) {
  let sessions = [];

  if (entityType === "client") {
    const clientDossiers = data.dossiers.filter((d) => d.clientId == entityId);
    const clientCases = data.lawsuits.filter((c) =>
      clientDossiers.some((d) => d.id === c.dossierId),
    );

    sessions = data.sessions.filter((session) => {
      if (session.dossierId) {
        return (
          clientDossiers.some((d) => d.id === session.dossierId) &&
          session.status !== "Completed" &&
          session.status !== "Cancelled"
        );
      }
      if (session.lawsuitId) {
        return (
          clientCases.some((c) => c.id === session.lawsuitId) &&
          session.status !== "Completed" &&
          session.status !== "Cancelled"
        );
      }
      return false;
    });
  } else if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      const today = new Date();
      const proceedings = data.lawsuits.filter(
        (c) => c.dossierId === dossier.id,
      );

      sessions = data.sessions.filter((session) => {
        const sessionDate = new Date(session.date);
        const isFuture = sessionDate >= today;
        const isNotComplete =
          session.status !== "Completed" && session.status !== "Cancelled";

        if (session.dossierId == entityId) {
          return isFuture && isNotComplete;
        }
        if (
          session.lawsuitId &&
          proceedings.some((p) => p.id == session.lawsuitId)
        ) {
          return isFuture && isNotComplete;
        }
        return false;
      });
    }
  } else if (entityType === "lawsuit") {
    const today = new Date();
    sessions = data.sessions
      .filter((session) => session.lawsuitId == entityId)
      .filter((session) => {
        const sessionDate = new Date(session.date);
        return (
          sessionDate >= today &&
          session.status !== "Completed" &&
          session.status !== "Cancelled"
        );
      });
  }

  const items = sessions.slice(0, 5).map((session) => ({
    entityId: session.id,
    entityLabel: `${session.type || t("detail.blocker.entityTypes.session")} - ${session.date}`,
    entityType: "session",
    status: session.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewHearing"),
        type: "navigate",
        route: "/sessions",
        entityId: session.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.markComplete"),
        type: "inline-action",
        action: "complete",
        entityType: "session",
        entityId: session.id,
        icon: "fas fa-check",
        safe: true,
      },
    ],
  }));

  let helpText = t("detail.blocker.enrichment.helpText.closeLawsuitHearings");
  if (entityType === "dossier") {
    helpText = t("detail.blocker.enrichment.helpText.closeDossierHearings");
  } else if (entityType === "lawsuit") {
    helpText = t("detail.blocker.enrichment.helpText.closeLawsuitHearings");
  } else if (entityType === "client") {
    helpText = t("detail.blocker.enrichment.helpText.inactivateClientHearings");
  }

  return {
    type: "session",
    reason: blocker,
    items,
    summary:
      sessions.length > 1
        ? t("detail.blocker.enrichment.summary.upcomingHearings", {
            count: sessions.length,
          })
        : t("detail.blocker.enrichment.summary.upcomingHearing", {
            count: sessions.length,
          }),
    helpText,
    actions: [],
  };
}

/**
 * Parse unpaid balance blocker (English)
 */
function parseFinancialBlockerEnglish(blocker, entityType, entityId, data) {
  let entries = [];

  if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      const allClientEntries = data.financialEntries.filter(
        (entry) => entry.clientId == dossier.clientId,
      );

      entries = data.financialEntries.filter(
        (entry) =>
          entry.clientId == dossier.clientId &&
          entry.status !== "paid" &&
          entry.status !== "Paid" &&
          entry.status !== "void",
      );
    }
  } else if (entityType === "client") {
    entries = data.financialEntries.filter(
      (entry) =>
        entry.clientId == entityId &&
        entry.status !== "paid" &&
        entry.status !== "Payée" &&
        entry.status !== "void",
    );
  }

  const items = entries.slice(0, 5).map((entry) => ({
    entityId: entry.id,
    entityLabel: `${entry.description || t("detail.blocker.entityTypes.financialEntry")} - ${formatCurrency(entry.amount)}`,
    entityType: "financialEntry",
    status: entry.status,
    actions: [
      {
        label: t("detail.blocker.enrichment.actions.viewEntry"),
        type: "navigate",
        route: "/accounting",
        entityId: entry.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: t("detail.blocker.enrichment.actions.markAsPaid"),
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

  // Context-aware helpText
  let helpText = tDomain("financial.helpDossier");
  if (entityType === "dossier") {
    helpText = tDomain("financial.helpDossier");
  } else if (entityType === "client") {
    helpText = tDomain("financial.helpClient");
  }

  return {
    type: "financial",
    reason: blocker,
    items,
    summary: blocker,
    helpText,
    actions: [],
  };
}

/**
 * Get route for entity type
 */
export function getEntityRoute(entityType) {
  const routes = {
    dossier: "/dossiers",
    lawsuit: "/lawsuits",
    task: "/tasks",
    session: "/sessions",
    client: "/clients",
    officer: "/officers",
    mission: "/missions",
    financialEntry: "/accounting",
  };

  return routes[entityType] || "/";
}
