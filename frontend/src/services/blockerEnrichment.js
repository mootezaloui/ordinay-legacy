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

const t = (key, options) => i18nInstance.t(key, { ns: "common", ...options });

const getData = (context = {}) => ({
  tasks: context.tasks || context.entities?.tasks || [],
  sessions: context.sessions || context.entities?.sessions || [],
  dossiers: context.dossiers || context.entities?.dossiers || [],
  cases: context.cases || context.entities?.cases || [],
  missions: context.missions || context.entities?.missions || [],
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
  context = {}
) {
  const data = getData(context);

  console.log("[enrichBlockers] All blockers:", blockers);

  if (!blockers || blockers.length === 0) {
    return [];
  }

  return blockers.map((blocker) => {
    console.log("[enrichBlockers] Processing blocker:", blocker);
    // Try to parse and enrich each blocker
    const enriched = parseBlocker(blocker, entityType, entityId, action, data);
    console.log("[enrichBlockers] Enriched to:", enriched?.type);

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
  if (blocker.includes("mission") && blocker.includes("in progress")) {
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

  console.log("[parseBlocker] Checking financial:", {
    blocker,
    includesUnpaid,
    includesBalance,
    includesUnpaidBalance: blocker.includes("Unpaid balance"),
    includesUnpaidClientBalance: blocker.includes("Unpaid client balance"),
  });
  if (isEnglishFinancial) {
    return parseFinancialBlockerEnglish(blocker, entityType, entityId, data);
  }

  // Pattern 6: Parent is closed (edit restrictions)
  if (blocker.includes("belongs to") && blocker.includes("closed")) {
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
      const proceedings = data.cases.filter((c) => c.dossierId === dossier.id);
      tasks = data.tasks
        .filter(
          (task) =>
            (task.parentType === "dossier" && task.dossierId == entityId) ||
            (task.parentType === "case" &&
              proceedings.some((p) => p.id == task.caseId))
        )
        .filter((task) => task.status !== "Done");
    }
  } else if (entityType === "case") {
    tasks = data.tasks.filter(
      (task) =>
        task.parentType === "case" &&
        task.caseId == entityId &&
        task.status !== "Done"
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
 * Parse open cases blocker
 */
function parseCaseBlocker(blocker, entityType, entityId, data) {
  let cases = [];

  if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      const proceedings = data.cases.filter((c) => c.dossierId === dossier.id);
      cases = proceedings.filter((proc) => proc.status !== "Closed");
    }
  }

  if (blocker.includes("belongs to the lawsuit")) {
    return parseClosedParentBlocker(blocker, entityType, entityId, data);
  }

  const items = cases.slice(0, 5).map((caseData) => ({
    entityId: caseData.id,
    entityLabel: `${caseData.caseNumber} - ${caseData.title}`,
    entityType: "case",
    status: caseData.status,
    actions: [
      {
        label: "View Lawsuit",
        type: "navigate",
        route: "/cases",
        entityId: caseData.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Close Lawsuit",
        type: "inline-action",
        action: "close",
        entityType: "case",
        entityId: caseData.id,
        icon: "fas fa-times-circle",
        safe: false,
        requiresConfirmation: true,
      },
    ],
  }));

  return {
    type: "case",
    reason: blocker,
    items,
    summary: `${cases.length} open Lawsuit${cases.length > 1 ? "s" : ""}`,
    helpText:
      "To close this dossier, all related lawsuits must be closed first. You can close each lawsuit individually.",
    actions: [],
  };
}

/**
 * Parse upcoming/incomplete sessions blocker
 */
function parseSessionBlocker(blocker, entityType, entityId, data) {
  let sessions = [];

  if (entityType === "case") {
    const today = new Date();
    sessions = data.sessions
      .filter((session) => session.caseId == entityId)
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
        label: "View Hearing",
        type: "navigate",
        route: "/sessions",
        entityId: session.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Mark Complete",
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
    summary: `${sessions.length} upcoming Hearing${
      sessions.length > 1 ? "s" : ""
    }`,
    helpText:
      "To close this lawsuit, all upcoming hearings must be completed or cancelled first. You can mark hearings as complete individually.",
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
          mission.status !== "Cancelled"
      );
    }
  } else if (entityType === "case") {
    const caseData = data.cases.find((c) => c.id == entityId);
    if (caseData) {
      missions = allMissions.filter(
        (mission) =>
          mission.entityType === "case" &&
          mission.entityId === caseData.id &&
          mission.status !== "Completed" &&
          mission.status !== "Cancelled"
      );
    }
  }

  const items = missions.slice(0, 5).map((mission) => ({
    entityId: mission.id,
    entityLabel: `${mission.missionNumber || mission.id} - ${
      mission.title || "Mission"
    }`,
    entityType: "mission",
    status: mission.status,
    actions: [
      {
        label: "View Mission",
        type: "navigate",
        route: `/officers/${mission.officerId}`,
        tab: "missions",
        entityId: mission.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Complete Mission",
        type: "navigate",
        route: `/officers/${mission.officerId}`,
        tab: "missions",
        entityId: mission.id,
        icon: "fas fa-check",
        description: "Change the mission status to Completed",
      },
    ],
  }));

  return {
    type: "mission",
    reason: blocker,
    items,
    summary: `${missions.length} active Mission${
      missions.length > 1 ? "s" : ""
    }`,
    helpText:
      entityType === "dossier"
        ? "To close this dossier, all active missions must be completed or cancelled first. You can complete each mission individually."
        : "To close this lawsuit, all active missions must be completed or cancelled first. You can complete each mission individually.",
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
          getDirection(entry) === "receivable"
      );
    }
  } else if (entityType === "client") {
    // Only receivable entries that are unpaid
    entries = data.financialEntries.filter(
      (entry) =>
        entry.clientId == entityId &&
        !isPaid(entry) &&
        !isCancelled(entry) &&
        getDirection(entry) === "receivable"
    );
  }

  const items = entries.slice(0, 5).map((entry) => ({
    entityId: entry.id,
    entityLabel: `${entry.description || entry.title || "Financial entry"} - ${
      entry.amount
    } ${entry.currency || "TND"}`,
    entityType: "financialEntry",
    status: entry.status,
    amount: entry.amount,
    currency: entry.currency || "TND",
    actions: [
      {
        label: "View Entry",
        type: "navigate",
        route: "/accounting",
        entityId: entry.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Mark as Paid",
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
    0
  );

  // More specific help text
  let helpText = "";
  if (entityType === "dossier") {
    helpText =
      entries.length === 1
        ? `This dossier cannot be closed because the client has 1 outstanding receivable (${totalOutstanding.toFixed(
            2
          )} TND). Mark the entry as paid or cancel it to proceed.`
        : `This dossier cannot be closed because the client has ${
            entries.length
          } outstanding receivables (${totalOutstanding.toFixed(
            2
          )} TND total). All amounts owed by the client must be settled.`;
  } else if (entityType === "client") {
    helpText =
      entries.length === 1
        ? `This client cannot be archived because they have 1 outstanding receivable (${totalOutstanding.toFixed(
            2
          )} TND). Mark the entry as paid or cancel it to proceed.`
        : `This client cannot be archived because they have ${
            entries.length
          } outstanding receivables (${totalOutstanding.toFixed(
            2
          )} TND total). All amounts owed by the client must be settled.`;
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
            entityLabel: `${dossier.caseNumber || dossier.id} - ${
              dossier.title
            }`,
            status: dossier.status,
          };
        }
      } else if (task.parentType === "case") {
        const caseData = data.cases.find((c) => c.id == task.caseId);
        if (caseData) {
          parentInfo = {
            entityType: "case",
            entityId: caseData.id,
            entityLabel: `${caseData.caseNumber || caseData.id} - ${
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
      if (session.caseId) {
        const caseData = data.cases.find((c) => c.id == session.caseId);
        if (caseData) {
          parentInfo = {
            entityType: "case",
            entityId: caseData.id,
            entityLabel: `${caseData.caseNumber || caseData.id} - ${
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
            entityLabel: `${dossier.caseNumber || dossier.id} - ${
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
      label: `Go to ${
        parentInfo.entityType === "dossier" ? "Dossier" : "Lawsuit"
      }`,
      type: "navigate",
      route: parentInfo.entityType === "dossier" ? "/dossiers" : "/cases",
      entityId: parentInfo.entityId,
      icon: "fas fa-external-link-alt",
    });

    if (parentInfo.status === "Closed") {
      actions.push({
        label: `Reopen ${
          parentInfo.entityType === "dossier" ? "Dossier" : "Lawsuit"
        }`,
        type: "navigate",
        route: parentInfo.entityType === "dossier" ? "/dossiers" : "/cases",
        entityId: parentInfo.entityId,
        icon: "fas fa-folder-open",
        description: "You must reopen the parent to edit this item",
      });
    }
  }

  return {
    type: "closedParent",
    reason: blocker,
    parentInfo,
    actions,
    helpText:
      "This item belongs to a closed parent entity and cannot be modified. You must reopen the parent first.",
  };
}

/**
 * Parse "cannot create under closed parent" blocker
 */
function parseCreateUnderClosedParentBlocker(blocker) {
  return {
    type: "closedParent",
    reason: blocker,
    actions: [
      {
        label: "Choose Another Parent",
        type: "inline-action",
        action: "changeParent",
        icon: "fas fa-edit",
        description: "You must select an active parent",
      },
    ],
    helpText:
      "You cannot create items under a closed parent entity. Please select an active parent or reopen the closed one.",
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
        label: "View Entry",
        type: "navigate",
        route: "/accounting",
        entityId: entityId,
        icon: "fas fa-external-link-alt",
      },
    ],
    warning:
      "This paid entry requires a confirmation and will be fully audited if changed.",
    helpText:
      "Paid entries stay editable. Any change will be recorded with the previous amount and status, and balances will be recomputed.",
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
    warning: "Please correct the dates to comply with legal chronology.",
    helpText:
      "The dates entered violate temporal constraints. Ensure all dates follow proper chronological order and legal requirements.",
  };
}

/**
 * Parse open Dossiers blocker (English)
 */
function parseDossierBlockerEnglish(blocker, entityType, entityId, data) {
  let dossiers = [];

  if (entityType === "client") {
    dossiers = data.dossiers.filter(
      (d) => d.clientId == entityId && d.status !== "Closed"
    );
  }

  const items = dossiers.slice(0, 5).map((dossier) => ({
    entityId: dossier.id,
    entityLabel: `${dossier.caseNumber} - ${dossier.title}`,
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
  let cases = [];

  if (entityType === "client") {
    const clientDossiers = data.dossiers.filter((d) => d.clientId == entityId);
    cases = data.cases.filter(
      (c) =>
        clientDossiers.some((d) => d.id === c.dossierId) &&
        c.status !== "Closed"
    );
  } else if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      cases = data.cases.filter(
        (c) => c.dossierId === dossier.id && c.status !== "Closed"
      );
    }
  }

  const items = cases.slice(0, 5).map((caseData) => ({
    entityId: caseData.id,
    entityLabel: `${caseData.caseNumber} - ${caseData.title}`,
    entityType: "case",
    status: caseData.status,
    actions: [
      {
        label: "View Lawsuit",
        type: "navigate",
        route: "/cases",
        entityId: caseData.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Close Lawsuit",
        type: "inline-action",
        action: "close",
        entityType: "case",
        entityId: caseData.id,
        icon: "fas fa-times-circle",
        safe: false,
        requiresConfirmation: true,
      },
    ],
  }));

  // Context-aware helpText
  let helpText = "All related lawsuits must be closed first...";
  if (entityType === "dossier") {
    helpText =
      "To close this dossier, all related lawsuits must be closed first. You can close each lawsuit individually.";
  } else if (entityType === "client") {
    helpText =
      "To mark this client as inactive, all related lawsuits must be closed first. You can close each lawsuit individually.";
  }

  return {
    type: "case",
    reason: blocker,
    items,
    summary: `${cases.length} open Lawsuit${cases.length > 1 ? "s" : ""}`,
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
    const clientCases = data.cases.filter((c) =>
      clientDossiers.some((d) => d.id === c.dossierId)
    );

    tasks = data.tasks.filter((task) => {
      if (task.dossierId) {
        return (
          clientDossiers.some((d) => d.id === task.dossierId) &&
          task.status !== "Done" &&
          task.status !== "Cancelled"
        );
      }
      if (task.caseId && task.parentType === "case") {
        return (
          clientCases.some((c) => c.id === task.caseId) &&
          task.status !== "Done" &&
          task.status !== "Cancelled"
        );
      }
      return false;
    });
  } else if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    if (dossier) {
      const proceedings = data.cases.filter((c) => c.dossierId === dossier.id);
      tasks = data.tasks
        .filter(
          (task) =>
            (task.parentType === "dossier" && task.dossierId == entityId) ||
            (task.parentType === "case" &&
              proceedings.some((p) => p.id == task.caseId))
        )
        .filter(
          (task) => task.status !== "Done" && task.status !== "Cancelled"
        );
    }
  } else if (entityType === "case") {
    tasks = data.tasks.filter(
      (task) =>
        task.parentType === "case" &&
        task.caseId == entityId &&
        task.status !== "Done" &&
        task.status !== "Cancelled"
    );
  }

  const items = tasks.slice(0, 5).map((task) => ({
    entityId: task.id,
    entityLabel: task.title,
    entityType: "task",
    status: task.status,
    actions: [
      {
        label: "View Task",
        type: "navigate",
        route: "/tasks",
        entityId: task.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Mark Complete",
        type: "inline-action",
        action: "complete",
        entityType: "task",
        entityId: task.id,
        icon: "fas fa-check",
        safe: true,
      },
    ],
  }));

  let helpText =
    "All related tasks must be completed first. You can mark tasks as complete individually.";
  if (entityType === "dossier") {
    helpText =
      "To close this dossier, all related tasks must be completed first. You can mark tasks as complete individually.";
  } else if (entityType === "case") {
    helpText =
      "To close this lawsuit, all related tasks must be completed first. You can mark tasks as complete individually.";
  } else if (entityType === "client") {
    helpText =
      "To mark this client as inactive, all related tasks must be completed first. You can mark tasks as complete individually.";
  }

  return {
    type: "task",
    reason: blocker,
    items,
    summary: `${tasks.length} open Task${tasks.length > 1 ? "s" : ""}`,
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
    const clientCases = data.cases.filter((c) =>
      clientDossiers.some((d) => d.id === c.dossierId)
    );

    sessions = data.sessions.filter((session) => {
      if (session.dossierId) {
        return (
          clientDossiers.some((d) => d.id === session.dossierId) &&
          session.status !== "Completed" &&
          session.status !== "Cancelled"
        );
      }
      if (session.caseId) {
        return (
          clientCases.some((c) => c.id === session.caseId) &&
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
      const proceedings = data.cases.filter((c) => c.dossierId === dossier.id);

      sessions = data.sessions.filter((session) => {
        const sessionDate = new Date(session.date);
        const isFuture = sessionDate >= today;
        const isNotComplete =
          session.status !== "Completed" && session.status !== "Cancelled";

        if (session.dossierId == entityId) {
          return isFuture && isNotComplete;
        }
        if (session.caseId && proceedings.some((p) => p.id == session.caseId)) {
          return isFuture && isNotComplete;
        }
        return false;
      });
    }
  } else if (entityType === "case") {
    const today = new Date();
    sessions = data.sessions
      .filter((session) => session.caseId == entityId)
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
    entityLabel: `${session.type || "Hearing"} on ${session.date}`,
    entityType: "session",
    status: session.status,
    actions: [
      {
        label: "View Hearing",
        type: "navigate",
        route: "/sessions",
        entityId: session.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Mark Complete",
        type: "inline-action",
        action: "complete",
        entityType: "session",
        entityId: session.id,
        icon: "fas fa-check",
        safe: true,
      },
    ],
  }));

  let helpText =
    "All related hearings must be completed first. You can mark hearings as complete individually.";
  if (entityType === "dossier") {
    helpText =
      "To close this dossier, all upcoming hearings must be completed or cancelled first. You can mark hearings as complete individually.";
  } else if (entityType === "case") {
    helpText =
      "To close this lawsuit, all upcoming hearings must be completed or cancelled first. You can mark hearings as complete individually.";
  } else if (entityType === "client") {
    helpText =
      "To mark this client as inactive, all related hearings must be completed first. You can mark hearings as complete individually.";
  }

  return {
    type: "session",
    reason: blocker,
    items,
    summary: `${sessions.length} open Hearing${sessions.length > 1 ? "s" : ""}`,
    helpText,
    actions: [],
  };
}

/**
 * Parse unpaid balance blocker (English)
 */
function parseFinancialBlockerEnglish(blocker, entityType, entityId, data) {
  let entries = [];

  console.log("[parseFinancialBlockerEnglish] Called with:", {
    blocker,
    entityType,
    entityId,
    hasFinancialEntries: !!data.financialEntries,
    financialEntriesCount: data.financialEntries?.length,
  });

  if (entityType === "dossier") {
    const dossier = data.dossiers.find((d) => d.id == entityId);
    console.log("[parseFinancialBlockerEnglish] Dossier found:", dossier);
    if (dossier) {
      const allClientEntries = data.financialEntries.filter(
        (entry) => entry.clientId == dossier.clientId
      );
      console.log(
        "[parseFinancialBlockerEnglish] All client entries:",
        allClientEntries
      );

      entries = data.financialEntries.filter(
        (entry) =>
          entry.clientId == dossier.clientId &&
          entry.status !== "paid" &&
          entry.status !== "Paid" &&
          entry.status !== "void"
      );
      console.log(
        "[parseFinancialBlockerEnglish] Filtered unpaid entries:",
        entries
      );
    }
  } else if (entityType === "client") {
    entries = data.financialEntries.filter(
      (entry) =>
        entry.clientId == entityId &&
        entry.status !== "paid" &&
        entry.status !== "Payée" &&
        entry.status !== "void"
    );
  }

  const items = entries.slice(0, 5).map((entry) => ({
    entityId: entry.id,
    entityLabel: `${entry.description || "Financial entry"} - ${entry.amount} ${
      entry.currency || "TND"
    }`,
    entityType: "financialEntry",
    status: entry.status,
    actions: [
      {
        label: "View Entry",
        type: "navigate",
        route: "/accounting",
        entityId: entry.id,
        icon: "fas fa-external-link-alt",
      },
      {
        label: "Mark as Paid",
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
  let helpText = "All financial balances must be settled first...";
  if (entityType === "dossier") {
    helpText =
      "To close this dossier, all financial balances must be settled. You can mark entries as paid or create new payment entries to balance the account.";
  } else if (entityType === "client") {
    helpText =
      "To mark this client as inactive, all financial balances must be settled. You can mark entries as paid or create new payment entries to balance the account.";
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
