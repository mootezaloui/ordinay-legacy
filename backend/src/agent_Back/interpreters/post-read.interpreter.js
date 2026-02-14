/**
 * Post-Read Interpreter — Mandatory Interpretation Layer
 *
 * This module executes AFTER every entity read, BEFORE rendering the response.
 * It transforms raw entity data into structured assistance.
 *
 * EVERY read response MUST pass through this interpreter.
 * This is NOT optional. This is NOT just adding extra fields.
 * This fundamentally changes what the agent produces.
 *
 * Output structure (MANDATORY):
 *   - facts: what was read (structured data points)
 *   - interpretation: why it matters now (state analysis)
 *   - navigation: entity role context (parent/child awareness)
 *   - followUps: guided next steps (read-only only)
 */

"use strict";

const { READ_INTENTS } = require("../intents");
const {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
} = require("../utils/entityDisplay");

// ─── Entity Role Definitions ───────────────────────────────────

const ENTITY_ROLES = {
  client: {
    role: "parent",
    description:
      "Root entity that owns dossiers, tasks, accounting, and history",
    typicalChildren: ["dossiers", "financial_entries"],
    navigationContext:
      "Clients are the starting point. They contain dossiers, tasks, and accounting history.",
  },
  dossier: {
    role: "parent",
    description: "Case container that owns tasks, sessions, and lawsuits",
    typicalChildren: ["tasks", "sessions", "lawsuits", "financial_entries"],
    typicalParent: "client",
    navigationContext:
      "Dossiers represent active cases. They own tasks, sessions, and cases.",
  },
  lawsuit: {
    role: "child",
    description: "Legal proceeding linked to a dossier",
    typicalChildren: ["sessions", "tasks"],
    typicalParent: "dossier",
    navigationContext: "Lawsuits are formal proceedings within a dossier.",
  },
  task: {
    role: "child",
    description: "Work item that belongs to a dossier",
    typicalParent: "dossier",
    navigationContext:
      "Tasks are actionable items. They indicate pending work.",
  },
  session: {
    role: "child",
    description: "Court session or meeting linked to a dossier or lawsuit",
    typicalParent: "dossier",
    navigationContext: "Sessions are scheduled events requiring preparation.",
  },
  mission: {
    role: "child",
    description: "Delegated work item",
    typicalParent: "dossier",
    navigationContext:
      "Missions are delegated tasks with external dependencies.",
  },
  financial_entry: {
    role: "child",
    description: "Financial record linked to a client or dossier",
    typicalParent: "dossier",
    navigationContext: "Financial entries track billing and payments.",
  },
  document: {
    role: "child",
    description: "Uploaded file attached to a record",
    typicalParent: "dossier",
    navigationContext:
      "Documents capture evidence or supporting material for a record.",
  },
  web_search: {
    role: "unknown",
    description: "Explicit web search results",
    navigationContext:
      "Web Search returns public web sources only when explicitly requested.",
  },
  deep_search: {
    role: "unknown",
    description: "Explicit deep legal research results",
    navigationContext:
      "Deep Search runs legal research with citations only when explicitly requested.",
  },
};

const ENTITY_LABELS = Object.freeze({
  client: "CLIENT",
  dossier: "DOSSIER",
  lawsuit: "LAWSUIT",
  task: "TASK",
  personal_task: "PERSONAL_TASK",
  session: "SESSION",
  mission: "MISSION",
  financial_entry: "FINANCIAL_ENTRY",
  document: "DOCUMENT",
  web_search: "WEB_SEARCH",
  deep_search: "DEEP_SEARCH",
  notification: "NOTIFICATION",
  history_event: "HISTORY_EVENT",
});

const SCOPE_KEYS = Object.freeze({
  client: "clientId",
  dossier: "dossierId",
  lawsuit: "lawsuitId",
  task: "taskId",
  personal_task: "personalTaskId",
  session: "sessionId",
  mission: "missionId",
  financial_entry: "financialEntryId",
});

const READ_INTENT_BY_ENTITY = Object.freeze({
  client: READ_INTENTS.READ_CLIENT,
  dossier: READ_INTENTS.READ_DOSSIER,
  lawsuit: READ_INTENTS.READ_LAWSUIT,
  task: READ_INTENTS.READ_TASK,
  personal_task: READ_INTENTS.READ_PERSONAL_TASK,
  session: READ_INTENTS.READ_SESSION,
  mission: READ_INTENTS.READ_MISSION,
  financial_entry: READ_INTENTS.READ_FINANCIAL_ENTRY,
  document: READ_INTENTS.SUMMARIZE_DOCUMENT,
  web_search: READ_INTENTS.WEB_SEARCH,
  deep_search: READ_INTENTS.DEEP_SEARCH,
});

const EXPLAIN_INTENT_BY_ENTITY = Object.freeze({
  client: READ_INTENTS.EXPLAIN_CLIENT_STATE,
  dossier: READ_INTENTS.EXPLAIN_DOSSIER_STATE,
  lawsuit: READ_INTENTS.EXPLAIN_LAWSUIT_STATE,
  task: READ_INTENTS.EXPLAIN_TASK_STATE,
  personal_task: READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE,
  session: READ_INTENTS.EXPLAIN_SESSION_STATE,
  mission: READ_INTENTS.EXPLAIN_MISSION_STATE,
  financial_entry: READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE,
});

const SUMMARY_INTENT_BY_ENTITY = Object.freeze({
  client: READ_INTENTS.SUMMARIZE_CLIENT,
  dossier: READ_INTENTS.SUMMARIZE_DOSSIER,
  lawsuit: READ_INTENTS.SUMMARIZE_LAWSUIT,
  task: READ_INTENTS.SUMMARIZE_TASK,
  personal_task: READ_INTENTS.SUMMARIZE_PERSONAL_TASK,
  session: READ_INTENTS.SUMMARIZE_SESSION,
  mission: READ_INTENTS.SUMMARIZE_MISSION,
  financial_entry: READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY,
  document: READ_INTENTS.SUMMARIZE_DOCUMENT,
});

const LIST_INTENT_BY_ENTITY = Object.freeze({
  client: READ_INTENTS.LIST_CLIENTS,
  dossier: READ_INTENTS.LIST_DOSSIERS,
  lawsuit: READ_INTENTS.LIST_LAWSUITS,
  task: READ_INTENTS.LIST_TASKS,
  personal_task: READ_INTENTS.LIST_PERSONAL_TASKS,
  session: READ_INTENTS.LIST_SESSIONS,
  mission: READ_INTENTS.LIST_MISSIONS,
  financial_entry: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
  notification: READ_INTENTS.LIST_NOTIFICATIONS,
  history_event: READ_INTENTS.LIST_HISTORY_EVENTS,
});

const ENTITY_PLURAL_LABELS = Object.freeze({
  client: "clients",
  dossier: "dossiers",
  lawsuit: "lawsuits",
  task: "tasks",
  personal_task: "personal tasks",
  session: "sessions",
  mission: "missions",
  financial_entry: "financial entries",
  document: "documents",
  web_search: "web search results",
  deep_search: "deep search results",
  notification: "notifications",
  history_event: "history events",
});

const CHILD_LIST_INTENTS = Object.freeze({
  dossiers: READ_INTENTS.LIST_DOSSIERS,
  tasks: READ_INTENTS.LIST_TASKS,
  sessions: READ_INTENTS.LIST_SESSIONS,
  lawsuits: READ_INTENTS.LIST_LAWSUITS,
  financial_entries: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
});

const CHILD_TYPE_TO_ENTITY = Object.freeze({
  dossiers: "dossier",
  tasks: "task",
  sessions: "session",
  lawsuits: "lawsuit",
  financial_entries: "financial_entry",
});

// ─── State Interpretation Rules ────────────────────────────────

const COMPLETED_STATUSES = new Set([
  "done",
  "completed",
  "closed",
  "cancelled",
]);

const normalizeStatus = (value) => String(value || "").toLowerCase();
const normalizePriority = (value) => String(value || "").toLowerCase();
const coerceDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Interprets the current state of an entity and what it implies.
 * Returns structured interpretation with urgency and implications.
 */
function interpretEntityState(entityType, entityData, context) {
  const readOutcome = String(context?._readOutcome || "").toLowerCase();
  const groundedEntityRetrieved = Boolean(
    context?._grounding?.entityRetrieved ||
    (Array.isArray(entityData)
      ? entityData.length > 0
      : entityData && typeof entityData === "object"),
  );
  const dossierWorkModeActive = Boolean(
    context?._grounding?.workMode?.dossier || context?._dossierWorkMode,
  );
  const workSnapshotActive = Boolean(
    context?._workSnapshotActive ||
      (context?.workSnapshot &&
        String(context.workSnapshot.entityType || "").toLowerCase() === "dossier"),
  );
  const effectiveReadOutcome =
    groundedEntityRetrieved &&
    (readOutcome === "not_found" || readOutcome === "incomplete")
      ? "success"
      : readOutcome;

  if (
    dossierWorkModeActive &&
    workSnapshotActive &&
    !groundedEntityRetrieved &&
    entityType === "dossier"
  ) {
    return [
      {
        level: "info",
        signal: "work_snapshot_uncertain",
        statement:
          "Dossier Work Snapshot is active, but this turn is missing complete snapshot fields.",
        implication:
          "Prior snapshot facts remain authoritative. Say \"refresh dossier\" to reload current data.",
      },
    ];
  }

  // Work-mode continuity: once dossier work mode is active with grounded data,
  // generic retrieval fallbacks are disabled to prevent contradictions.
  if (!dossierWorkModeActive || !groundedEntityRetrieved) {
    if (effectiveReadOutcome === "error") {
      if (entityType === "document") {
        const readSummary = String(context?._readSummary || "").toLowerCase();
        const readDetails = Array.isArray(context?._readDetails)
          ? context._readDetails.join(" ").toLowerCase()
          : "";
        const combined = `${readSummary} ${readDetails}`;

        if (combined.includes("unsupported file type")) {
          return [
            {
              level: "warning",
              statement:
                "This file type is not supported for document reading.",
              implication:
                "Upload a supported file format such as PDF, DOCX, TXT, or an image.",
            },
          ];
        }
        if (
          combined.includes("pdf-to-image converter") ||
          combined.includes("pdf reading is not supported")
        ) {
          return [
            {
              level: "warning",
              statement:
                "Document text could not be extracted in the current OCR setup.",
              implication:
                "Enable PDF-to-image OCR conversion, or upload a text-based file and retry.",
            },
          ];
        }
        if (combined.includes("tesseract")) {
          return [
            {
              level: "warning",
              statement: "OCR is unavailable on this machine.",
              implication:
                "Install and configure Tesseract OCR, then retry the document summary.",
            },
          ];
        }
        if (
          combined.includes("contains no readable text") ||
          combined.includes("ocr produced no readable text")
        ) {
          return [
            {
              level: "info",
              statement: "No readable text was found in this document.",
              implication:
                "Try a clearer scan, a higher-resolution file, or a text-based source document.",
            },
          ];
        }
        return [
          {
            level: "warning",
            statement:
              "Document text could not be extracted in the current OCR setup.",
            implication:
              "Use a text-based document (DOCX/TXT) or enable PDF-to-image OCR conversion, then retry.",
          },
        ];
      }
      return [
        {
          level: "critical",
          statement: "Unable to retrieve the requested data.",
          implication: "Retry the query or verify data access permissions.",
        },
      ];
    }
    if (effectiveReadOutcome === "ambiguous") {
      return [
        {
          level: "info",
          statement: "Multiple matches found for this request.",
          implication: "Specify the exact record to continue.",
        },
      ];
    }
    if (effectiveReadOutcome === "incomplete") {
      return [
        {
          level: "info",
          statement: "More information is required to locate the record.",
          implication: "Provide a reference or exact name.",
        },
      ];
    }
    if (effectiveReadOutcome === "processing") {
      return [
        {
          level: "info",
          statement:
            entityType === "document"
              ? "Document text extraction is still in progress."
              : "Requested data is still being processed.",
          implication:
            entityType === "document"
              ? "Please wait a moment, then retry the document summary."
              : "Please wait and retry shortly.",
        },
      ];
    }
    if (effectiveReadOutcome === "not_found") {
      const entityLabel = ENTITY_LABELS[entityType] || entityType;
      return [
        {
          level: "info",
          statement: `The specified ${entityLabel.toLowerCase()} could not be located.`,
          implication:
            "The reference may be incorrect, or the record may not exist in the system. Try a different identifier or check the parent entity.",
        },
      ];
    }
  }

  if (Array.isArray(entityData)) {
    return interpretCollectionState(entityType, entityData, context);
  }

  const interpretations = [];

  switch (entityType) {
    case "dossier":
      interpretations.push(...interpretDossierState(entityData, context));
      break;
    case "client":
      interpretations.push(...interpretClientState(entityData, context));
      break;
    case "task":
      interpretations.push(...interpretTaskState(entityData, context));
      break;
    case "personal_task":
      interpretations.push(...interpretTaskState(entityData, context));
      break;
    case "lawsuit":
      interpretations.push(...interpretLawsuitState(entityData, context));
      break;
    case "session":
      interpretations.push(...interpretSessionState(entityData, context));
      break;
    default:
      interpretations.push(
        ...interpretGenericState(entityType, entityData, context),
      );
  }

  // Always add at least one interpretation
  return interpretations;
}

function interpretCollectionState(entityType, entities, context) {
  const interpretations = [];
  const count = entities.length;

  if (count === 0) {
    // Frame absence as "no activity yet" rather than "not found" (error-like)
    const entityLabel =
      ENTITY_PLURAL_LABELS[entityType] || `${entityType} records`;
    interpretations.push({
      level: "neutral",
      signal: "empty_collection",
      statement: `No ${entityLabel} in the current scope.`,
      implication:
        "This indicates no activity has been recorded yet, or the scope may need adjustment. Consider whether this is expected or if records should be created.",
    });
    return interpretations;
  }

  interpretations.push({
    level: "info",
    signal: "collection_loaded",
    statement: `${count} ${entityType} record(s) loaded.`,
    implication: "Review the list for priority and status changes.",
    dataPoints: { count },
  });

  const now = new Date();

  if (entityType === "task") {
    const active = entities.filter(
      (task) => !COMPLETED_STATUSES.has(normalizeStatus(task.status)),
    );
    const overdue = active.filter((task) => {
      const due = coerceDate(task.due_date);
      return due && due < now;
    });
    const blocked = active.filter(
      (task) => normalizeStatus(task.status) === "blocked",
    );
    const urgent = active.filter(
      (task) => normalizePriority(task.priority) === "urgent",
    );
    const unassigned = active.filter((task) => !task.assigned_to);

    if (overdue.length > 0) {
      // Detect overdue clustering by parent dossier
      const byDossier = {};
      for (const task of overdue) {
        const did = task.dossier_id || "unknown";
        if (!byDossier[did]) byDossier[did] = [];
        byDossier[did].push(task);
      }
      const clusters = Object.entries(byDossier).filter(
        ([, tasks]) => tasks.length >= 2,
      );

      if (clusters.length > 0) {
        const [clusteredDossierId, clusteredTasks] = clusters[0];
        const totalDelayDays = clusteredTasks.reduce((sum, task) => {
          const due = coerceDate(task.due_date);
          return (
            sum + (due ? Math.ceil((now - due) / (1000 * 60 * 60 * 24)) : 0)
          );
        }, 0);
        interpretations.push({
          level: "critical",
          signal: "overdue_cluster",
          statement: `${clusteredTasks.length} overdue tasks are concentrated in the same dossier.`,
          implication: `This suggests the dossier itself may be stalled. Combined delay is ${totalDelayDays} days. Downstream work may also be blocked.`,
          dataPoints: {
            clusteredTasks: clusteredTasks.length,
            dossierId: clusteredDossierId,
            totalDelayDays,
          },
        });
      }

      interpretations.push({
        level: overdue.length > 3 ? "critical" : "warning",
        signal: "overdue_tasks",
        statement: `${overdue.length} task(s) are overdue in this list.`,
        implication:
          "Late tasks require immediate review and reprioritization.",
        dataPoints: {
          overdueTasks: overdue.length,
          activeTasks: active.length,
        },
      });
    }
    if (blocked.length > 0) {
      interpretations.push({
        level: "warning",
        signal: "blocked_tasks",
        statement: `${blocked.length} task(s) are blocked.`,
        implication: "Resolve dependencies to unblock progress.",
        dataPoints: { blockedTasks: blocked.length },
      });
    }
    if (urgent.length > 0) {
      interpretations.push({
        level: "warning",
        signal: "urgent_tasks",
        statement: `${urgent.length} task(s) are marked urgent.`,
        implication: "Confirm urgent items have active owners and deadlines.",
        dataPoints: { urgentTasks: urgent.length },
      });
    }
    if (unassigned.length > 0) {
      interpretations.push({
        level: unassigned.length > 2 ? "warning" : "info",
        signal: "unassigned_work",
        statement: `${unassigned.length} task(s) have no assigned owner.`,
        implication:
          "These tasks will not appear in anyone's daily priorities until assigned.",
        dataPoints: {
          unassignedTasks: unassigned.length,
          activeTasks: active.length,
        },
      });
    }
  }

  if (entityType === "dossier") {
    const blocked = entities.filter(
      (dossier) => normalizeStatus(dossier.status) === "blocked",
    );
    const onHold = entities.filter(
      (dossier) => normalizeStatus(dossier.status) === "on_hold",
    );
    const active = entities.filter(
      (dossier) =>
        !["closed", "archived"].includes(normalizeStatus(dossier.status)),
    );

    if (blocked.length > 0) {
      interpretations.push({
        level: "critical",
        signal: "blocked_dossiers",
        statement: `${blocked.length} dossier(s) are blocked.`,
        implication: "Investigate blockers before progress can resume.",
        dataPoints: { blockedDossiers: blocked.length },
      });
    }
    if (onHold.length > 0) {
      interpretations.push({
        level: "warning",
        signal: "on_hold_dossiers",
        statement: `${onHold.length} dossier(s) are on hold.`,
        implication: "Confirm whether hold conditions still apply.",
        dataPoints: { onHoldDossiers: onHold.length },
      });
    }
    if (active.length > 0) {
      interpretations.push({
        level: "info",
        signal: "active_dossiers",
        statement: `${active.length} dossier(s) are active.`,
        implication: "Monitor deadlines and task coverage across active cases.",
        dataPoints: { activeDossiers: active.length },
      });
    }
  }

  if (entityType === "client") {
    const inactive = entities.filter(
      (client) => normalizeStatus(client.status) === "inactive",
    );
    if (inactive.length > 0) {
      interpretations.push({
        level: "info",
        signal: "inactive_clients",
        statement: `${inactive.length} client(s) are inactive.`,
        implication:
          "Active engagement is limited; prioritize current clients.",
        dataPoints: { inactiveClients: inactive.length },
      });
    }
  }

  if (entityType === "session") {
    const upcoming = entities.filter((session) => {
      const scheduled = coerceDate(
        session.scheduled_at || session.session_date || session.date,
      );
      return scheduled && scheduled >= now;
    });
    const imminent = upcoming.filter((session) => {
      const scheduled = coerceDate(
        session.scheduled_at || session.session_date || session.date,
      );
      return (
        scheduled && Math.ceil((scheduled - now) / (1000 * 60 * 60 * 24)) <= 3
      );
    });

    if (imminent.length > 0) {
      interpretations.push({
        level: "warning",
        signal: "imminent_sessions",
        statement: `${imminent.length} session(s) occur within 3 days.`,
        implication: "Finalize preparation and confirm attendance.",
        dataPoints: { imminentSessions: imminent.length },
      });
    } else if (upcoming.length > 0) {
      interpretations.push({
        level: "info",
        signal: "upcoming_sessions",
        statement: `${upcoming.length} upcoming session(s) scheduled.`,
        implication: "Track preparation timelines and required filings.",
        dataPoints: { upcomingSessions: upcoming.length },
      });
    }
  }

  if (entityType === "financial_entry") {
    const overdue = entities.filter((entry) => {
      const due = coerceDate(entry.due_date);
      return due && !entry.paid_at && due < now;
    });
    if (overdue.length > 0) {
      interpretations.push({
        level: overdue.length > 3 ? "critical" : "warning",
        signal: "overdue_financial",
        statement: `${overdue.length} financial entry(ies) are overdue.`,
        implication: "Outstanding receivables require follow-up.",
        dataPoints: { overdueEntries: overdue.length },
      });
    }
  }

  if (entityType === "lawsuit") {
    const pendingJudgment = entities.filter(
      (lawsuit) => normalizeStatus(lawsuit.status) === "pending_judgment",
    );
    const active = entities.filter(
      (lawsuit) => normalizeStatus(lawsuit.status) === "active",
    );

    if (pendingJudgment.length > 0) {
      interpretations.push({
        level: "warning",
        signal: "pending_judgment",
        statement: `${pendingJudgment.length} lawsuit(s) await judgment.`,
        implication: "Prepare for outcomes and client communication.",
        dataPoints: { pendingJudgment: pendingJudgment.length },
      });
    }
    if (active.length > 0) {
      interpretations.push({
        level: "info",
        signal: "active_lawsuits",
        statement: `${active.length} lawsuit(s) are active.`,
        implication: "Monitor hearing schedules and filing deadlines.",
        dataPoints: { activeLawsuits: active.length },
      });
    }
  }

  return interpretations;
}

function interpretDossierState(dossier, context) {
  const interpretations = [];
  const snapshotTimestamp =
    context?._workSnapshotTimestamp || context?.workSnapshot?.snapshotAt || null;
  const snapshotClock = snapshotTimestamp ? new Date(snapshotTimestamp) : null;
  const referenceNow =
    snapshotClock && !Number.isNaN(snapshotClock.getTime())
      ? snapshotClock
      : new Date();
  const taskSummary = context?.childSummary?.tasks;
  const totalTasks = taskSummary ? Number(taskSummary.total || 0) : 0;
  const activeTasks = taskSummary ? Number(taskSummary.active || 0) : 0;
  const overdueTasks = taskSummary ? Number(taskSummary.overdue || 0) : 0;
  const normalizedStatus = normalizeStatus(dossier.status);
  const normalizedPriority = normalizePriority(dossier.priority);
  const phaseLabel = dossier.phase ? String(dossier.phase) : "not specified";
  const urgencyLevel = (() => {
    if (normalizedStatus === "blocked" || overdueTasks > 0) return "critical";
    if (dossier.next_deadline) {
      const deadline = new Date(dossier.next_deadline);
      if (!Number.isNaN(deadline.getTime())) {
        const daysUntil = Math.ceil(
          (deadline.getTime() - referenceNow.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysUntil <= 3) return "critical";
        if (daysUntil <= 7) return "high";
      }
    }
    if (normalizedPriority === "urgent" || normalizedPriority === "high")
      return "high";
    return "normal";
  })();

  interpretations.push({
    level: "info",
    signal: "dossier_work_mode",
    statement: "Dossier Work Mode is active for this dossier.",
    implication:
      urgencyLevel === "critical" || overdueTasks > 0
        ? `Ongoing work in phase "${phaseLabel}" with ${urgencyLevel} urgency. Active pressure from blockers or overdue work detected. No data changes without explicit confirmation.`
        : activeTasks > 0
          ? `Ongoing work in phase "${phaseLabel}" with ${urgencyLevel} urgency. ${activeTasks} active task(s) in current workload. No data changes without explicit confirmation.`
          : `Ongoing work in phase "${phaseLabel}" with ${urgencyLevel} urgency. No active tasks yet. No data changes without explicit confirmation.`,
    dataPoints: {
      phase: phaseLabel,
      urgency: urgencyLevel,
      activeTasks,
      overdueTasks,
    },
  });

  // Status-based interpretation
  if (normalizedStatus === "blocked") {
    const blockedData = { status: "blocked" };
    if (activeTasks > 0) blockedData.dependentTasks = activeTasks;
    interpretations.push({
      level: "critical",
      signal: "status_blocked",
      statement: "This dossier is BLOCKED.",
      implication:
        activeTasks > 0
          ? `Work cannot proceed. ${activeTasks} dependent task(s) are waiting on this dossier.`
          : "Work cannot proceed. Identify and resolve the blocking issue immediately.",
      dataPoints: blockedData,
    });
  } else if (normalizedStatus === "on_hold") {
    interpretations.push({
      level: "warning",
      signal: "status_on_hold",
      statement: "This dossier is ON HOLD.",
      implication:
        "Active work is paused. Verify if hold conditions still apply.",
      dataPoints: { status: "on_hold" },
    });
  } else if (normalizedStatus === "closed") {
    interpretations.push({
      level: "neutral",
      signal: "status_closed",
      statement: "This dossier is CLOSED.",
      implication: "No active work expected. Historical reference only.",
      dataPoints: { status: "closed" },
    });
  }

  // Stagnation detection — dossier not updated for extended period
  if (
    dossier.updated_at &&
    normalizedStatus !== "closed" &&
    normalizedStatus !== "archived"
  ) {
    const updatedAt = new Date(dossier.updated_at);
    const daysSinceUpdate = Math.floor(
      (referenceNow - updatedAt) / (1000 * 60 * 60 * 24),
    );
    if (
      daysSinceUpdate > 7 &&
      (normalizedStatus === "blocked" || normalizedStatus === "on_hold")
    ) {
      const stagnationImplication =
        activeTasks > 0
          ? `This dossier has not been updated in ${daysSinceUpdate} days while ${activeTasks} task(s) remain active.`
          : `This dossier has not been updated in ${daysSinceUpdate} days. Review whether it requires attention or can be closed.`;
      interpretations.push({
        level: daysSinceUpdate > 14 ? "critical" : "warning",
        signal: "stagnation",
        statement: `This dossier has been in '${normalizedStatus}' status for ${daysSinceUpdate} days without updates.`,
        implication: stagnationImplication,
        dataPoints: { daysSinceUpdate, status: normalizedStatus, activeTasks },
      });
    } else if (daysSinceUpdate > 14 && (activeTasks > 0 || overdueTasks > 0)) {
      interpretations.push({
        level: daysSinceUpdate > 21 ? "critical" : "warning",
        signal: "stagnation",
        statement: `No dossier update for ${daysSinceUpdate} days while work is still active.`,
        implication: `Progress appears stalled. Re-sequence tasks and confirm accountability before delays spread.`,
        dataPoints: { daysSinceUpdate, activeTasks, overdueTasks },
      });
    }
  }

  // Priority + status mismatch
  if (
    (normalizedPriority === "high" || normalizedPriority === "urgent") &&
    (normalizedStatus === "pending" || normalizedStatus === "todo")
  ) {
    interpretations.push({
      level: "warning",
      signal: "priority_mismatch",
      statement: "High priority dossier has not started.",
      implication:
        "This case is marked urgent but work hasn't begun. Review assignment.",
      dataPoints: { priority: normalizedPriority, status: normalizedStatus },
    });
  }

  // Deadline pressure
  if (dossier.next_deadline) {
    const deadline = new Date(dossier.next_deadline);
    const daysUntil = Math.ceil((deadline - referenceNow) / (1000 * 60 * 60 * 24));
    const taskContext =
      activeTasks > 0 ? ` ${activeTasks} task(s) are still open.` : "";

    if (daysUntil < 0) {
      interpretations.push({
        level: "critical",
        signal: "deadline_pressure",
        statement: `Deadline passed ${Math.abs(daysUntil)} days ago.`,
        implication: `Immediate review required. Assess consequences and next steps.${taskContext}`,
        dataPoints: { daysOverdue: Math.abs(daysUntil), activeTasks },
      });
    } else if (daysUntil <= 3) {
      interpretations.push({
        level: "critical",
        signal: "deadline_pressure",
        statement: `Deadline in ${daysUntil} day(s).`,
        implication: `Urgent preparation needed.${taskContext}`,
        dataPoints: { daysUntil, activeTasks },
      });
    } else if (daysUntil <= 7) {
      interpretations.push({
        level: "warning",
        signal: "deadline_pressure",
        statement: `Deadline approaching in ${daysUntil} days.`,
        implication: `Plan final preparations.${taskContext}`,
        dataPoints: { daysUntil, activeTasks },
      });
    }
  } else {
    interpretations.push({
      level: "info",
      signal: "no_deadline",
      statement: "No deadline is set for this dossier.",
      implication:
        "Consider setting a milestone to maintain tracking discipline.",
    });
  }

  if (dossier.phase) {
    interpretations.push({
      level: "info",
      signal: "phase_info",
      statement: `Dossier phase: ${dossier.phase}.`,
      implication: "Phase indicates the current procedural stage.",
    });
  } else {
    interpretations.push({
      level: "warning",
      signal: "missing_phase",
      statement: "Dossier phase is not defined.",
      implication:
        "Set a phase to align tone, urgency, and next-step planning.",
    });
  }

  if (taskSummary) {
    if (totalTasks > 0) {
      if (overdueTasks > 0) {
        interpretations.push({
          level: overdueTasks > 3 ? "critical" : "warning",
          signal: "overdue_tasks",
          statement: `${overdueTasks} overdue task(s) exist in this dossier.`,
          implication: "Pending work is accumulating. Review task priorities.",
          dataPoints: { overdueTasks, totalTasks, activeTasks },
        });
      }

      if (activeTasks > 0) {
        interpretations.push({
          level: "info",
          signal: "active_tasks",
          statement: `${activeTasks} active task(s) for this dossier.`,
          implication: "Active work requires tracking and ownership.",
          dataPoints: { activeTasks, totalTasks },
        });
      } else {
        interpretations.push({
          level: "neutral",
          signal: "no_active_tasks",
          statement: "No active tasks are open for this dossier.",
          implication: "Workload appears paused or completed.",
        });
      }
    } else {
      interpretations.push({
        level: "info",
        signal: "no_tasks",
        statement: "No tasks exist for this dossier.",
        implication: "Define the first tasks to begin progress.",
      });
    }
  }

  const sessionSummary = context?.childSummary?.sessions;
  let totalSessions = 0;
  if (sessionSummary) {
    totalSessions = Number(sessionSummary.total || 0);
    if (totalSessions > 0) {
      interpretations.push({
        level: "info",
        signal: "sessions_recorded",
        statement: `${totalSessions} session(s) recorded for this dossier.`,
        implication: "Review session timeline for upcoming preparation.",
        dataPoints: { totalSessions },
      });
    } else {
      interpretations.push({
        level: "info",
        signal: "no_sessions",
        statement: "No sessions are recorded for this dossier.",
        implication: "Confirm whether sessions should be scheduled.",
      });
    }
  }

  // Overdue tasks
  if (context.overdueTasks && context.overdueTasks.length > 0) {
    const count = context.overdueTasks.length;
    interpretations.push({
      level: count > 3 ? "critical" : "warning",
      signal: "overdue_tasks",
      statement: `${count} overdue task(s) exist in this dossier.`,
      implication: "Pending work is accumulating. Review task priorities.",
      dataPoints: { overdueTasks: count },
    });
  }

  const structureGaps = [];
  if (!dossier.next_deadline) structureGaps.push("deadline");
  if (!dossier.phase) structureGaps.push("phase");
  if (taskSummary && totalTasks === 0) structureGaps.push("task_plan");
  if (sessionSummary && totalSessions === 0) structureGaps.push("session_plan");

  if (structureGaps.length >= 2) {
    interpretations.push({
      level: "warning",
      signal: "missing_structure",
      statement: `Missing structure detected: ${structureGaps.join(", ")}.`,
      implication:
        "Add milestones and executable work items to keep the dossier moving.",
      dataPoints: { structureGaps: structureGaps.length },
    });
  }

  return interpretations;
}

function interpretClientState(client, context) {
  const interpretations = [];

  // Client status
  if (client.status === "inactive") {
    interpretations.push({
      level: "info",
      signal: "status_inactive",
      statement: "This client is marked INACTIVE.",
      implication: "No active engagement expected. Historical records only.",
      dataPoints: { status: "inactive" },
    });
  }

  // Dossier overview
  const dossierSummary = context?.childSummary?.dossiers;
  if (Array.isArray(context.dossiers)) {
    if (context.dossiers.length > 0) {
      const activeDossiers = context.dossiers.filter(
        (d) => d.status !== "closed" && d.status !== "archived",
      );
      const blockedDossiers = context.dossiers.filter(
        (d) => d.status === "blocked",
      );

      if (blockedDossiers.length > 0) {
        interpretations.push({
          level: "critical",
          signal: "blocked_dossiers",
          statement: `${blockedDossiers.length} dossier(s) are BLOCKED for this client.`,
          implication: "Active cases are stalled. Review blocking issues.",
          dataPoints: {
            blockedDossiers: blockedDossiers.length,
            totalDossiers: context.dossiers.length,
          },
        });
      }

      if (activeDossiers.length > 0) {
        const highPriority = activeDossiers.filter(
          (d) => d.priority === "urgent" || d.priority === "high",
        );
        const activeImplication =
          highPriority.length > 0
            ? `Ongoing case work exists. ${highPriority.length} dossier(s) are high priority or urgent.`
            : "Ongoing case work exists. Review for priority and deadlines.";
        interpretations.push({
          level: "info",
          signal: "active_dossiers",
          statement: `${activeDossiers.length} active dossier(s) for this client.`,
          implication: activeImplication,
          dataPoints: {
            activeDossiers: activeDossiers.length,
            highPriority: highPriority.length,
          },
        });
      } else {
        interpretations.push({
          level: "neutral",
          signal: "no_active_dossiers",
          statement: "All dossiers for this client are closed or archived.",
          implication: "No active work. Client relationship is historical.",
        });
      }
    } else {
      interpretations.push({
        level: "info",
        signal: "no_dossiers",
        statement: "No dossiers exist for this client.",
        implication: "New client or prospect. Consider intake process.",
      });
    }
  } else if (dossierSummary) {
    const total = Number(dossierSummary.total || 0);
    const active = Number(dossierSummary.active || 0);
    const blocked = Number(dossierSummary.blocked || 0);
    const priorities = dossierSummary.priorities || {};

    if (total > 0) {
      if (blocked > 0) {
        interpretations.push({
          level: "critical",
          signal: "blocked_dossiers",
          statement: `${blocked} dossier(s) are BLOCKED for this client.`,
          implication: "Active cases are stalled. Review blocking issues.",
          dataPoints: { blockedDossiers: blocked, totalDossiers: total },
        });
      }

      if (active > 0) {
        const urgentCount = Number(priorities.urgent || 0);
        const highCount = Number(priorities.high || 0);
        const highPriorityTotal = urgentCount + highCount;
        const activeImplication =
          highPriorityTotal > 0
            ? `Ongoing case work exists. ${highPriorityTotal} dossier(s) are high priority or urgent.`
            : "Ongoing case work exists. Review for priority and deadlines.";
        interpretations.push({
          level: "info",
          signal: "active_dossiers",
          statement: `${active} active dossier(s) for this client.`,
          implication: activeImplication,
          dataPoints: {
            activeDossiers: active,
            highPriority: highPriorityTotal,
          },
        });
      } else {
        interpretations.push({
          level: "neutral",
          signal: "no_active_dossiers",
          statement: "All dossiers for this client are closed or archived.",
          implication: "No active work. Client relationship is historical.",
        });
      }

      const priorityParts = [
        ["urgent", "urgent"],
        ["high", "high"],
        ["medium", "medium"],
        ["low", "low"],
      ]
        .map(([key, label]) => {
          const value = Number(priorities[key] || 0);
          return value > 0 ? `${value} ${label}` : null;
        })
        .filter(Boolean);

      if (priorityParts.length > 0) {
        interpretations.push({
          level: "info",
          signal: "priority_mix",
          statement: `Dossier priority mix: ${priorityParts.join(", ")}.`,
          implication:
            "Confirm urgent and high priority matters are resourced.",
        });
      }
    } else {
      interpretations.push({
        level: "info",
        signal: "no_dossiers",
        statement: "No dossiers exist for this client.",
        implication: "New client or prospect. Consider intake process.",
      });
    }
  }

  // Client-wide overdue tasks
  if (context.overdueTasks && context.overdueTasks.length > 0) {
    const overdueCount = context.overdueTasks.length;
    interpretations.push({
      level: "warning",
      signal: "overdue_tasks",
      statement: `${overdueCount} overdue task(s) across this client's dossiers.`,
      implication: "Work is falling behind. Review resource allocation.",
      dataPoints: { overdueTasks: overdueCount },
    });
  }

  return interpretations;
}

function interpretTaskState(task, context) {
  const interpretations = [];

  // Overdue
  const now = new Date();
  const dueDate = coerceDate(task.due_date);
  const status = normalizeStatus(task.status);
  const computedOverdue =
    dueDate && !COMPLETED_STATUSES.has(status) && dueDate < now;
  const daysOverdue = task.days_overdue
    ? Math.round(task.days_overdue)
    : computedOverdue && dueDate
      ? Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24))
      : 0;

  if (daysOverdue > 0) {
    interpretations.push({
      level: daysOverdue > 7 ? "critical" : "warning",
      signal: "overdue",
      statement: `This task is ${daysOverdue} day(s) OVERDUE.`,
      implication:
        daysOverdue > 7
          ? "Significant delay. Escalate or reassess priority."
          : "Task is late. Complete soon or update deadline.",
      dataPoints: { daysOverdue },
    });
  }

  // Status interpretation
  if (status === "blocked") {
    interpretations.push({
      level: "warning",
      signal: "status_blocked",
      statement: "This task is BLOCKED.",
      implication:
        "Cannot proceed without resolving dependency. Identify blocker.",
      dataPoints: { status: "blocked" },
    });
  } else if (
    status === "pending" &&
    normalizePriority(task.priority) === "urgent"
  ) {
    interpretations.push({
      level: "critical",
      signal: "priority_mismatch",
      statement: "URGENT task has not started.",
      implication:
        "High priority work is waiting. Begin immediately or reassign.",
      dataPoints: { priority: "urgent", status: "pending" },
    });
  } else if (status === "in_progress") {
    interpretations.push({
      level: "info",
      signal: "in_progress",
      statement: "Task is actively in progress.",
      implication: "Work is ongoing. Monitor for completion.",
      dataPoints: { status: "in_progress" },
    });
  }

  // Unassigned task
  if (!task.assigned_to && !COMPLETED_STATUSES.has(status)) {
    interpretations.push({
      level: "warning",
      signal: "ownership_gap",
      statement: "This task has no assigned owner.",
      implication:
        "It will not appear in anyone's daily priorities until assigned.",
      dataPoints: { assignedTo: null },
    });
  }

  // Parent context
  const parentRef =
    context.dossierData?.title ||
    context.dossierData?.reference ||
    task.dossier_id ||
    task.lawsuit_id;
  if (parentRef) {
    interpretations.push({
      level: "neutral",
      signal: "parent_context",
      statement: `This task belongs to dossier/case "${parentRef}".`,
      implication:
        "Task progress affects the parent case. Consider case-level impact.",
    });
  }

  return interpretations;
}

function interpretLawsuitState(lawsuit, context) {
  const interpretations = [];

  // Status
  if (lawsuit.status === "pending_judgment") {
    interpretations.push({
      level: "warning",
      signal: "pending_judgment",
      statement: "Lawsuit is awaiting judgment.",
      implication: "Outcome pending. Prepare for both scenarios.",
      dataPoints: { status: "pending_judgment" },
    });
  } else if (lawsuit.status === "active") {
    interpretations.push({
      level: "info",
      signal: "status_active",
      statement: "Lawsuit is ACTIVE.",
      implication: "Legal proceedings ongoing. Monitor court calendar.",
      dataPoints: { status: "active" },
    });
  }

  // Session presence
  if (context.timeline && context.timeline.length > 0) {
    const now = new Date();
    const upcomingSessions = context.timeline.filter(
      (e) => e.type === "session" && new Date(e.date) > now,
    );
    if (upcomingSessions.length === 0) {
      interpretations.push({
        level: "info",
        signal: "no_upcoming_sessions",
        statement: "No upcoming court sessions scheduled.",
        implication:
          "Verify if scheduling is needed or case is between hearings.",
      });
    } else {
      const nextSession = upcomingSessions[0];
      const daysUntil = Math.ceil(
        (new Date(nextSession.date) - now) / (1000 * 60 * 60 * 24),
      );
      interpretations.push({
        level: daysUntil <= 7 ? "warning" : "info",
        signal: "hearing_proximity",
        statement: `Next court session in ${daysUntil} day(s).`,
        implication:
          daysUntil <= 7
            ? "Hearing approaching. Ensure preparation is complete."
            : "Session scheduled. Track preparation timeline.",
        dataPoints: { daysUntil, upcomingSessions: upcomingSessions.length },
      });
    }
  }

  return interpretations;
}

function interpretSessionState(session, context) {
  const interpretations = [];

  const sessionDate = coerceDate(
    session.scheduled_at || session.session_date || session.date,
  );
  const now = new Date();

  if (sessionDate) {
    if (sessionDate < now) {
      interpretations.push({
        level: "info",
        signal: "session_passed",
        statement: "This session has PASSED.",
        implication: "Review outcomes and follow-up tasks.",
      });

      // Check for incomplete follow-up
      if (context.tasks && context.tasks.length > 0) {
        const incompleteTasks = context.tasks.filter(
          (t) => t.status !== "completed" && t.status !== "done",
        );
        if (incompleteTasks.length > 0) {
          interpretations.push({
            level: "warning",
            signal: "incomplete_followup",
            statement: `${incompleteTasks.length} related task(s) remain incomplete.`,
            implication: "Post-session work pending. Complete follow-up items.",
            dataPoints: { incompleteTasks: incompleteTasks.length },
          });
        }
      }
    } else {
      const daysUntil = Math.ceil((sessionDate - now) / (1000 * 60 * 60 * 24));
      interpretations.push({
        level:
          daysUntil <= 3 ? "critical" : daysUntil <= 7 ? "warning" : "info",
        signal: "hearing_proximity",
        statement: `Session scheduled in ${daysUntil} day(s).`,
        implication:
          daysUntil <= 3
            ? "Imminent. Final preparation required."
            : daysUntil <= 7
              ? "Approaching. Verify preparation status."
              : "Upcoming. Plan preparation timeline.",
        dataPoints: { daysUntil },
      });
    }
  }

  const parentRef =
    context.dossierData?.reference ||
    context.dossierData?.title ||
    session.dossier_id ||
    session.lawsuit_id;
  if (parentRef) {
    interpretations.push({
      level: "neutral",
      signal: "parent_context",
      statement: `This session is linked to dossier/case "${parentRef}".`,
      implication: "Session outcomes affect the parent matter.",
    });
  }

  return interpretations;
}

function interpretGenericState(entityType, entityData, context) {
  return [];
}

// ─── Navigation Context Builder ────────────────────────────────

/**
 * Builds navigation context based on entity role (parent/child).
 */
function buildNavigationContext(entityType, entityData, context) {
  const roleInfo = ENTITY_ROLES[entityType] || {
    role: "unknown",
    navigationContext: "Entity role not defined.",
  };

  const navigation = {
    entityRole: roleInfo.role,
    roleDescription: roleInfo.description || `${entityType} entity`,
    contextStatement: roleInfo.navigationContext,
    parentPath: null,
    childrenAvailable: [],
  };

  // Build parent path
  if (roleInfo.typicalParent) {
    if (roleInfo.typicalParent === "dossier" && context.dossierData) {
      navigation.parentPath = {
        type: "dossier",
        id: context.dossierData.id,
        reference: context.dossierData.reference || context.dossierData.title,
      };
    } else if (roleInfo.typicalParent === "client" && context.clientData) {
      navigation.parentPath = {
        type: "client",
        id: context.clientData.id,
        name: context.clientData.name,
      };
    }
  }

  if (!navigation.parentPath && entityData && !Array.isArray(entityData)) {
    const dossierId = entityData.dossier_id || entityData.dossierId;
    const clientId = entityData.client_id || entityData.clientId;
    const lawsuitId = entityData.lawsuit_id || entityData.lawsuitId;

    if (entityType === "dossier" && clientId) {
      navigation.parentPath = {
        type: "client",
        id: clientId,
      };
    }

    if (entityType === "task") {
      if (dossierId) {
        navigation.parentPath = {
          type: "dossier",
          id: dossierId,
        };
      } else if (lawsuitId) {
        navigation.parentPath = {
          type: "lawsuit",
          id: lawsuitId,
        };
      }
    }

    if (entityType === "lawsuit" && dossierId) {
      navigation.parentPath = {
        type: "dossier",
        id: dossierId,
      };
    }

    if (entityType === "session") {
      if (lawsuitId) {
        navigation.parentPath = {
          type: "lawsuit",
          id: lawsuitId,
        };
      } else if (dossierId) {
        navigation.parentPath = {
          type: "dossier",
          id: dossierId,
        };
      }
    }

    if (entityType === "mission" && dossierId) {
      navigation.parentPath = {
        type: "dossier",
        id: dossierId,
      };
    }

    if (entityType === "financial_entry") {
      if (dossierId) {
        navigation.parentPath = {
          type: "dossier",
          id: dossierId,
        };
      } else if (clientId) {
        navigation.parentPath = {
          type: "client",
          id: clientId,
        };
      }
    }

    if (entityType === "document") {
      if (entityData.linked_entity_type && entityData.linked_entity_id) {
        navigation.parentPath = {
          type: entityData.linked_entity_type,
          id: entityData.linked_entity_id,
          reference: entityData.linked_entity_label || null,
        };
      } else if (dossierId) {
        navigation.parentPath = {
          type: "dossier",
          id: dossierId,
        };
      } else if (clientId) {
        navigation.parentPath = {
          type: "client",
          id: clientId,
        };
      } else if (lawsuitId) {
        navigation.parentPath = {
          type: "lawsuit",
          id: lawsuitId,
        };
      }
    }
  }

  // Identify available children
  if (roleInfo.typicalChildren) {
    roleInfo.typicalChildren.forEach((childType) => {
      let available = false;
      let count = 0;

      switch (childType) {
        case "dossiers":
          if (Array.isArray(context.dossiers)) {
            available = context.dossiers.length > 0;
            count = context.dossiers.length;
          } else if (context?.childSummary?.dossiers) {
            count = Number(context.childSummary.dossiers.total || 0);
            available = count > 0;
          }
          break;
        case "tasks":
          if (Array.isArray(context.tasks)) {
            available = context.tasks.length > 0;
            count = context.tasks.length;
          } else if (context?.childSummary?.tasks) {
            count = Number(context.childSummary.tasks.total || 0);
            available = count > 0;
          }
          break;
        case "sessions":
          if (context.timeline) {
            available =
              context.timeline.filter((e) => e.type === "session").length > 0;
            count = context.timeline.filter((e) => e.type === "session").length;
          } else if (context?.childSummary?.sessions) {
            count = Number(context.childSummary.sessions.total || 0);
            available = count > 0;
          }
          break;
        case "financial_entries":
          available = !!(
            context.financialEntries && context.financialEntries.length > 0
          );
          count = context.financialEntries?.length || 0;
          break;
        default:
          // Check if context has this data
          available = !!(context[childType] && context[childType].length > 0);
          count = context[childType]?.length || 0;
      }

      if (available) {
        navigation.childrenAvailable.push({ type: childType, count });
      }
    });
  }

  return navigation;
}

// ─── Follow-Up Generator ───────────────────────────────────────

function resolveEntityReference(entityType, entityData) {
  if (!entityData || Array.isArray(entityData)) return null;

  const byType = {
    dossier: entityData.reference || entityData.id,
    lawsuit: entityData.reference || entityData.lawsuit_number || entityData.id,
    client: entityData.id || entityData.name,
    task: entityData.id || entityData.title,
    personal_task: entityData.id || entityData.title,
    session: entityData.id || entityData.title || entityData.session_type,
    mission: entityData.reference || entityData.id,
    financial_entry: entityData.id || entityData.reference,
    document: entityData.document_id || entityData.id || entityData.title,
    notification: entityData.id,
    history_event: entityData.id,
  };

  return byType[entityType] || entityData.id || entityData.name || null;
}

function resolveOriginEntity(entityType, entityData, context) {
  const groundedEntityRetrieved = Boolean(
    context?._grounding?.entityRetrieved ||
    (Array.isArray(entityData)
      ? entityData.length > 0
      : entityData && typeof entityData === "object"),
  );
  if (
    groundedEntityRetrieved &&
    entityData &&
    !Array.isArray(entityData) &&
    entityData.id
  ) {
    return { type: entityType, id: entityData.id };
  }
  if (
    groundedEntityRetrieved &&
    Array.isArray(entityData) &&
    entityData.length === 1
  ) {
    const candidate = entityData[0];
    const candidateId =
      candidate?.id ??
      candidate?.[`${entityType}_id`] ??
      candidate?.[`${entityType}Id`] ??
      null;
    if (candidateId !== null && candidateId !== undefined) {
      return { type: entityType, id: candidateId };
    }
  }

  if (context?.activeEntityType && context?.activeEntityId) {
    return { type: context.activeEntityType, id: context.activeEntityId };
  }

  if (entityData && !Array.isArray(entityData) && entityData.id) {
    return { type: entityType, id: entityData.id };
  }

  if (Array.isArray(entityData) && entityData.length === 1) {
    const candidate = entityData[0];
    const candidateId =
      candidate?.id ??
      candidate?.[`${entityType}_id`] ??
      candidate?.[`${entityType}Id`] ??
      null;
    if (candidateId !== null && candidateId !== undefined) {
      return { type: entityType, id: candidateId };
    }
  }

  const scopeType = String(context?.scope || "").toLowerCase();
  const scopeIdMap = {
    client: context?.clientId,
    dossier: context?.dossierId,
    lawsuit: context?.lawsuitId,
    session: context?.sessionId,
    task: context?.taskId,
    mission: context?.missionId,
    personal_task: context?.personalTaskId,
    financial_entry: context?.financialEntryId,
  };

  if (scopeType && scopeIdMap[scopeType]) {
    return { type: scopeType, id: scopeIdMap[scopeType] };
  }

  if (context?.clientData?.id)
    return { type: "client", id: context.clientData.id };
  if (context?.dossierData?.id)
    return { type: "dossier", id: context.dossierData.id };
  if (context?.lawsuitData?.id)
    return { type: "lawsuit", id: context.lawsuitData.id };

  const fallbackId = resolveEntityReference(entityType, entityData);
  return { type: entityType, id: fallbackId || "unknown" };
}

function formatChildLabel(childType, count = null) {
  const label = childType.replace(/_/g, " ");
  if (typeof count === "number") {
    return `${label} (${count})`;
  }
  return label;
}

function buildScopeForType(entityType, entityId) {
  const key = SCOPE_KEYS[entityType];
  if (!key || entityId === null || entityId === undefined) return {};
  const normalizedId =
    typeof entityId === "number"
      ? entityId
      : typeof entityId === "string" && /^\d+$/.test(entityId)
        ? parseInt(entityId, 10)
        : null;
  if (!normalizedId) return {};
  return { [key]: normalizedId };
}

function resolveResultCount(entityData, context) {
  if (context && typeof context._resultCount === "number") {
    return context._resultCount;
  }
  if (Array.isArray(entityData)) return entityData.length;
  if (entityData) return 1;
  return 0;
}

function resolveEntityDataForType(entityType, entityData, context) {
  if (entityData && !Array.isArray(entityData) && entityType) {
    return entityData;
  }

  const byType = {
    client: context?.clientData,
    dossier: context?.dossierData,
    lawsuit: context?.lawsuitData,
    task: context?.taskData,
    personal_task: context?.personalTaskData,
    session: context?.sessionData,
    mission: context?.missionData,
    financial_entry: context?.financialEntryData,
  };

  return byType[entityType] || null;
}

function resolveEntityLabel(
  entityType,
  entityId,
  entityData,
  context,
  navigation,
) {
  if (!entityType) return null;

  const candidates = [];
  if (entityData && typeof entityData === "object") {
    candidates.push(entityData);
  }
  if (navigation?.parentPath && navigation.parentPath.type === entityType) {
    candidates.push(navigation.parentPath);
  }
  const contextData = resolveEntityDataForType(entityType, entityData, context);
  if (contextData && contextData !== entityData) {
    candidates.push(contextData);
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    if (
      entityId === null ||
      entityId === undefined ||
      candidate.id === undefined ||
      String(candidate.id) === String(entityId)
    ) {
      const label = resolveEntityDisplayLabel(entityType, candidate);
      if (label) return label;
    }
  }

  return null;
}

function buildEntityContext(
  entityType,
  entityId,
  entityData,
  context,
  navigation,
) {
  if (!entityType || entityId === null || entityId === undefined) return null;
  const fallbackLabel = formatEntityTypeLabel(entityType);
  const resolvedLabel =
    resolveEntityLabel(entityType, entityId, entityData, context, navigation) ||
    fallbackLabel;
  return {
    type: entityType,
    id: entityId,
    label: resolvedLabel,
  };
}

function buildTargetLabel(verb, targetLabel, fallbackType) {
  const resolvedTarget = targetLabel || formatEntityTypeLabel(fallbackType);
  if (!resolvedTarget) return String(verb || "").trim();
  return `${verb} ${resolvedTarget}`;
}

function buildScopedLabel(verb, targetLabel, parentLabel, fallbackType) {
  const resolvedTarget = targetLabel || formatEntityTypeLabel(fallbackType);
  if (!resolvedTarget) return String(verb || "").trim();
  if (parentLabel) return `${verb} ${resolvedTarget} for ${parentLabel}`;
  return `${verb} ${resolvedTarget}`;
}

function buildSelectionFollowUps(entityType, entityData, options = {}) {
  if (!Array.isArray(entityData)) return [];
  const readIntent = READ_INTENT_BY_ENTITY[entityType];
  if (!readIntent) return [];
  const context = options.context || {};
  const activeEntityType = String(context?.activeEntityType || "").toLowerCase();
  const activeEntityId = context?.activeEntityId;
  const dossierWorkModeActive = Boolean(
    context?._grounding?.workMode?.dossier ||
      context?._dossierWorkMode ||
      (activeEntityType === "dossier" &&
        activeEntityId !== null &&
        activeEntityId !== undefined),
  );

  const candidates = entityData.filter(
    (item) => item && item.id !== null && item.id !== undefined,
  );
  const resolveClientName = (item) => {
    const direct =
      item?.clientName ||
      item?.client_name ||
      item?.client?.name ||
      item?.client ||
      null;
    if (direct) return String(direct).trim();
    const scopedClientName = context?.clientData?.name;
    if (scopedClientName) return String(scopedClientName).trim();
    return null;
  };

  return candidates.slice(0, 5).flatMap((item, idx) => {
    const isActiveCandidate =
      activeEntityType === entityType &&
      activeEntityId !== null &&
      activeEntityId !== undefined &&
      String(activeEntityId) === String(item.id);
    if (isActiveCandidate) {
      if (dossierWorkModeActive && entityType === "dossier") {
        const taskSummary = context?.childSummary?.tasks || {};
        const activeTaskCount = Number(taskSummary.active || 0);
        const origin = { type: entityType, id: item.id };
        return [
          {
            category: "planning",
            priority: idx,
            ...buildFollowUp(
              activeTaskCount > 0
                ? {
                    label: `Review active tasks (${activeTaskCount})`,
                    reason:
                      "Continue dossier work using the currently active task workload.",
                    labelKey: "review_active_tasks",
                    intent: READ_INTENTS.LIST_TASKS,
                    scopeType: "dossier",
                    scopeId: item.id,
                    origin,
                    target: { type: "task" },
                    filters: { activity: "active" },
                  }
                : {
                    label: "Draft action plan for this dossier",
                    reason:
                      "Continue work mode with a concrete read-only action plan.",
                    labelKey: "draft_action_plan",
                    intent: SUMMARY_INTENT_BY_ENTITY.dossier,
                    scopeType: "dossier",
                    scopeId: item.id,
                    origin,
                    target: { type: "dossier", id: item.id },
                  },
            ),
          },
        ];
      }
      return [];
    }

    const scope = buildScopeForType(entityType, item.id);
    if (Object.keys(scope).length === 0) return [];
    const rawLabelText =
      resolveEntityDisplayLabel(entityType, item, {
        fallback: formatEntityTypeLabel(entityType),
      }) || formatEntityTypeLabel(entityType);
    const displayLabel =
      entityType === "dossier" || entityType === "lawsuit"
        ? String(rawLabelText).replace(
            /^[A-Z]{2,10}-\d{2,8}(?:-\d{1,8})?\s*-\s*/i,
            "",
          ) || rawLabelText
        : rawLabelText;
    const origin = { type: entityType, id: item.id };
    const target = {
      type: entityType,
      id: item.id,
      label: rawLabelText,
      clientName: resolveClientName(item),
    };
    return [
      {
        category: "selection",
        priority: idx,
        ...buildFollowUp({
          label: `Review ${formatEntityTypeLabel(entityType)} context: ${displayLabel}`,
          reason: "Select the most relevant record to continue work.",
          labelKey: "review_context",
          intent: readIntent,
          scopeType: entityType,
          scopeId: item.id,
          origin,
          target,
        }),
      },
    ];
  });
}

function buildFollowUp({
  label,
  reason,
  intent,
  scopeType,
  scopeId,
  origin,
  filters,
  labelKey,
  labelParams,
  target,
  parent,
}) {
  const followUp = {
    label,
    reason,
    intent,
    entityType: origin.type,
    entityId: origin.id,
    origin: {
      entity:
        ENTITY_LABELS[origin.type] || String(origin.type || "").toUpperCase(),
      entityId: origin.id,
    },
    scope: buildScopeForType(scopeType, scopeId),
  };
  if (labelKey) followUp.labelKey = labelKey;
  if (labelParams && typeof labelParams === "object") {
    followUp.labelParams = labelParams;
  }
  if (target) followUp.target = target;
  if (parent) followUp.parent = parent;
  if (filters && typeof filters === "object") {
    followUp.filters = filters;
  }
  return followUp;
}

function serializeFollowUp(followUp) {
  const output = {
    label: followUp.label,
    reason: followUp.reason,
    intent: followUp.intent,
    entityType: followUp.entityType,
    entityId: followUp.entityId,
    origin: followUp.origin,
    scope: followUp.scope,
  };
  if (followUp.labelKey) output.labelKey = followUp.labelKey;
  if (followUp.labelParams) output.labelParams = followUp.labelParams;
  if (followUp.target) output.target = followUp.target;
  if (followUp.parent) output.parent = followUp.parent;
  if (followUp.filters) output.filters = followUp.filters;
  if (followUp.category) output.category = followUp.category;
  return output;
}

function formatTimeframeLabel(timeframe) {
  if (!timeframe) return null;
  if (timeframe === "this-week") return "this week";
  return String(timeframe).replace(/_/g, " ");
}

function buildAggregateLabel(entityType, filters) {
  const labelBase =
    ENTITY_PLURAL_LABELS[entityType] || `${entityType.replace(/_/g, " ")}s`;
  if (!filters || typeof filters !== "object") return labelBase;

  const parts = [];
  if (filters.status) parts.push(String(filters.status).replace(/_/g, " "));
  if (!filters.status && filters.activity === "active") parts.push("active");
  if (filters.paymentStatus)
    parts.push(String(filters.paymentStatus).replace(/_/g, " "));
  if (filters.priority)
    parts.push(`${String(filters.priority).replace(/_/g, " ")} priority`);
  if (filters.overdue) parts.push("overdue");
  if (filters.timeframe) parts.push(formatTimeframeLabel(filters.timeframe));

  if (parts.length === 0) return labelBase;
  return `${parts.join(" ")} ${labelBase}`;
}

function resolveAggregateScope(entityType, context) {
  const scopeType = String(context?.scope || "").toLowerCase();
  const allowedScopes = {
    dossier: ["client"],
    lawsuit: ["dossier"],
    task: ["dossier", "lawsuit"],
    personal_task: [],
    session: ["dossier", "lawsuit"],
    mission: ["dossier", "lawsuit"],
    financial_entry: [
      "client",
      "dossier",
      "lawsuit",
      "mission",
      "task",
      "personal_task",
    ],
    notification: [
      "client",
      "dossier",
      "lawsuit",
      "session",
      "task",
      "mission",
      "personal_task",
      "financial_entry",
    ],
    history_event: [
      "client",
      "dossier",
      "lawsuit",
      "session",
      "task",
      "mission",
      "personal_task",
      "financial_entry",
    ],
  };

  if (!allowedScopes[entityType]?.includes(scopeType)) {
    return { scopeType: null, scopeId: null };
  }

  const key = SCOPE_KEYS[scopeType];
  const scopeId = key ? context?.[key] : null;
  return { scopeType, scopeId };
}

function buildPriorityBreakdownFollowUp(
  entityType,
  entityData,
  origin,
  scopeType,
  scopeId,
  filters,
  parentContext,
) {
  const prioritySupported = new Set([
    "task",
    "personal_task",
    "mission",
    "dossier",
  ]);
  if (!prioritySupported.has(entityType)) return null;
  if (!Array.isArray(entityData)) return null;
  if (filters?.priority) return null;

  const priorities = new Set(
    entityData
      .map((item) => String(item.priority || "").toLowerCase())
      .filter(Boolean),
  );
  const priorityOrder = ["urgent", "high", "medium", "low"];
  const selected = priorityOrder.find((p) => priorities.has(p));
  if (!selected) return null;

  const listIntent = LIST_INTENT_BY_ENTITY[entityType];
  if (!listIntent) return null;

  const labelBase =
    ENTITY_PLURAL_LABELS[entityType] || `${entityType.replace(/_/g, " ")}s`;
  const target = { type: entityType };
  const qualifierLabel = `${selected} priority ${labelBase}`;

  return {
    category: "summary",
    priority: 2,
    ...buildFollowUp({
      label: buildScopedLabel(
        "List",
        qualifierLabel,
        parentContext?.label,
        entityType,
      ),
      reason: "Focus on the highest priority items in this summary.",
      labelKey: "list",
      intent: listIntent,
      scopeType,
      scopeId,
      origin,
      target,
      parent: parentContext,
      filters: { ...(filters || {}), priority: selected },
    }),
  };
}

/**
 * Generates mandatory follow-up suggestions based on entity type and state.
 * These are NOT optional. Every read MUST have follow-ups.
 */
function generateFollowUps(
  entityType,
  entityData,
  context,
  interpretation,
  navigation,
) {
  const followUps = [];
  const resultCount = resolveResultCount(entityData, context);
  const isEmpty = resultCount === 0;
  const isMultiple = resultCount > 1;
  const readOutcome = context?._readOutcome;
  const origin = resolveOriginEntity(entityType, entityData, context);
  const originType = origin.type;
  const originId = origin.id;
  const originEntityData =
    originType === entityType && entityData && !Array.isArray(entityData)
      ? entityData
      : null;
  const originContext = buildEntityContext(
    originType,
    originId,
    originEntityData,
    context,
    navigation,
  );
  const originLabel = originContext?.label || null;
  const resolveEntityDataForScope = (type) =>
    type === entityType && entityData && !Array.isArray(entityData)
      ? entityData
      : null;
  const isAggregateSummary = Boolean(context?._aggregateSummary);
  const aggregateFilters =
    context?._aggregateFilters && typeof context._aggregateFilters === "object"
      ? context._aggregateFilters
      : {};
  const dossierWorkModeActive = Boolean(
    (context?._grounding?.workMode?.dossier || context?._dossierWorkMode) &&
    originType === "dossier" &&
    originId !== null &&
    originId !== undefined &&
    !isEmpty,
  );

  if (entityType === "web_search" || entityType === "deep_search") {
    const query = String(
      context?._searchQuery || aggregateFilters.query || "",
    ).trim();
    const sameIntent =
      entityType === "web_search"
        ? READ_INTENTS.WEB_SEARCH
        : READ_INTENTS.DEEP_SEARCH;
    const complementaryIntent =
      entityType === "web_search"
        ? READ_INTENTS.DEEP_SEARCH
        : READ_INTENTS.WEB_SEARCH;
    const sameLabel =
      entityType === "web_search" ? "Repeat web search" : "Repeat deep search";
    const complementLabel =
      entityType === "web_search"
        ? "Run deep search on this topic"
        : "Run web search on this topic";
    const baseFilters = query ? { query } : undefined;
    const targetType = entityType;
    const target = {
      type: targetType,
      label: originLabel || formatEntityTypeLabel(targetType),
    };

    return [
      serializeFollowUp({
        category: "search",
        priority: 1,
        ...buildFollowUp({
          label: sameLabel,
          reason: "Rerun the same explicit search request.",
          labelKey: "repeat_search",
          intent: sameIntent,
          scopeType: null,
          scopeId: null,
          origin,
          target,
          filters: baseFilters,
        }),
      }),
      serializeFollowUp({
        category: "search",
        priority: 2,
        ...buildFollowUp({
          label: complementLabel,
          reason: "Switch search depth while keeping explicit user control.",
          labelKey: "switch_search_mode",
          intent: complementaryIntent,
          scopeType: null,
          scopeId: null,
          origin,
          target: {
            type:
              complementaryIntent === READ_INTENTS.WEB_SEARCH
                ? "web_search"
                : "deep_search",
          },
          filters: baseFilters,
        }),
      }),
    ];
  }

  const addChildExploration = (
    candidates,
    scopeType,
    scopeId,
    originForFollowUp,
  ) => {
    candidates.forEach((child, idx) => {
      if (followUps.length >= 5) return;
      const childIntent = CHILD_LIST_INTENTS[child.type];
      if (!childIntent) return;
      const childEntityType = CHILD_TYPE_TO_ENTITY[child.type] || child.type;
      const parentContext = buildEntityContext(
        scopeType,
        scopeId,
        resolveEntityDataForScope(scopeType),
        context,
        navigation,
      );
      const target = {
        type: childEntityType,
        count: typeof child.count === "number" ? child.count : undefined,
      };
      const targetLabel = formatChildLabel(child.type, child.count);
      followUps.push({
        category: "exploration",
        priority: 2 + idx,
        ...buildFollowUp({
          label: buildScopedLabel(
            "List",
            targetLabel,
            parentContext?.label,
            childEntityType,
          ),
          reason:
            typeof child.count === "number"
              ? `${child.count} ${child.type.replace(/_/g, " ")} available for review.`
              : `Explore related ${child.type.replace(/_/g, " ")} for more context.`,
          labelKey: "list",
          intent: childIntent,
          scopeType,
          scopeId,
          origin: originForFollowUp,
          target,
          parent: parentContext,
        }),
      });
    });
  };

  const ensureMinimumFollowUps = () => {
    while (followUps.length < 2) {
      if (dossierWorkModeActive) {
        const dossierTaskSummary = context?.childSummary?.tasks || {};
        const activeTaskCount = Number(dossierTaskSummary.active || 0);
        const overdueTaskCount = Number(dossierTaskSummary.overdue || 0);
        const hasCriticalSignal =
          interpretation.some((i) => i.level === "critical") ||
          overdueTaskCount > 0;
        if (
          !followUps.some(
            (f) =>
              f.category === "planning" &&
              f.intent === EXPLAIN_INTENT_BY_ENTITY.dossier,
          )
        ) {
          followUps.push({
            category: "planning",
            priority: 9,
            ...buildFollowUp({
              label: hasCriticalSignal
                ? "Review immediate dossier priorities"
                : "Review dossier next-step context",
              reason: hasCriticalSignal
                ? `Current dossier pressure is elevated${overdueTaskCount > 0 ? ` with ${overdueTaskCount} overdue task(s)` : ""}. Focus the next-step plan on immediate risks.`
                : activeTaskCount > 0
                  ? `Use the ${activeTaskCount} active task(s) to shape the next-step plan for this dossier.`
                  : "Define a focused next-step plan before opening additional work.",
              intent: EXPLAIN_INTENT_BY_ENTITY.dossier,
              scopeType: "dossier",
              scopeId: originId,
              origin,
              target: originContext,
            }),
          });
          continue;
        }
        if (
          !followUps.some(
            (f) =>
              f.intent === READ_INTENTS.LIST_TASKS &&
              f.filters &&
              f.filters.activity === "active",
          )
        ) {
          followUps.push({
            category: "planning",
            priority: 10,
            ...buildFollowUp({
              label:
                overdueTaskCount > 0
                  ? "Inspect active and overdue workload"
                  : "Inspect active workload",
              reason:
                overdueTaskCount > 0
                  ? `${overdueTaskCount} overdue task(s) need sequencing within the active workload.`
                  : activeTaskCount > 0
                    ? `Review ${activeTaskCount} active task(s) to confirm current progress pacing.`
                    : "Review active workload to confirm current progress pacing.",
              intent: READ_INTENTS.LIST_TASKS,
              scopeType: "dossier",
              scopeId: originId,
              origin,
              target: { type: "task" },
              parent: originContext,
              filters: { activity: "active" },
            }),
          });
          continue;
        }
        break;
      }

      if (originType === "document") {
        const target = originContext || {
          type: "document",
          id: originId,
          label: originLabel || "document",
        };
        if (
          !followUps.some(
            (f) =>
              f.intent === READ_INTENTS.SUMMARIZE_DOCUMENT &&
              f.labelKey === "review_details",
          )
        ) {
          followUps.push({
            category: "guidance",
            priority: 10,
            ...buildFollowUp({
              label: originLabel
                ? `Review ${originLabel} details`
                : "Review document details",
              reason:
                readOutcome === "processing"
                  ? "Check whether text extraction has completed."
                  : "Review the attached document status and details.",
              labelKey: "review_details",
              intent: READ_INTENTS.SUMMARIZE_DOCUMENT,
              scopeType: originType,
              scopeId: originId,
              origin,
              target,
            }),
          });
          continue;
        }
        if (
          !followUps.some(
            (f) =>
              f.intent === READ_INTENTS.SUMMARIZE_DOCUMENT &&
              f.labelKey === "summarize",
          )
        ) {
          followUps.push({
            category: "guidance",
            priority: 11,
            ...buildFollowUp({
              label: "Retry document summary",
              reason:
                readOutcome === "processing"
                  ? "Text extraction may complete shortly."
                  : "Retry after OCR setup or with a text-based document.",
              labelKey: "summarize",
              intent: READ_INTENTS.SUMMARIZE_DOCUMENT,
              scopeType: originType,
              scopeId: originId,
              origin,
              target,
            }),
          });
          continue;
        }
        break;
      }

      const explainIntent = EXPLAIN_INTENT_BY_ENTITY[originType];
      if (explainIntent && !followUps.some((f) => f.intent === explainIntent)) {
        followUps.push({
          category: "guidance",
          priority: 10,
          ...buildFollowUp({
            label: originLabel
              ? `Explain status for ${originLabel}`
              : "Explain status",
            reason: "Clarify the current state and implications.",
            labelKey: "explain_status",
            intent: explainIntent,
            scopeType: originType,
            scopeId: originId,
            origin,
            target: originContext,
          }),
        });
        continue;
      }
      const readIntent = READ_INTENT_BY_ENTITY[originType];
      if (readIntent && !followUps.some((f) => f.intent === readIntent)) {
        followUps.push({
          category: "guidance",
          priority: 11,
          ...buildFollowUp({
            label: originLabel
              ? `Review ${originLabel} details`
              : "Review details",
            reason: "Return to the primary record view.",
            labelKey: "review_details",
            intent: readIntent,
            scopeType: originType,
            scopeId: originId,
            origin,
            target: originContext,
          }),
        });
        continue;
      }
      if (!followUps.some((f) => f.intent === READ_INTENTS.LIST_CLIENTS)) {
        followUps.push({
          category: "guidance",
          priority: 12,
          ...buildFollowUp({
            label: "List clients",
            reason: "Return to a known starting point.",
            labelKey: "list",
            intent: READ_INTENTS.LIST_CLIENTS,
            scopeType: null,
            scopeId: null,
            origin,
            target: { type: "client" },
          }),
        });
        continue;
      }
      if (!followUps.some((f) => f.intent === READ_INTENTS.LIST_DOSSIERS)) {
        followUps.push({
          category: "guidance",
          priority: 13,
          ...buildFollowUp({
            label: "List dossiers",
            reason: "Review the case list to regain context.",
            labelKey: "list",
            intent: READ_INTENTS.LIST_DOSSIERS,
            scopeType: null,
            scopeId: null,
            origin,
            target: { type: "dossier" },
          }),
        });
        continue;
      }
      break;
    }
  };

  const finalizeFollowUps = () => {
    ensureMinimumFollowUps();
    followUps.sort((a, b) => a.priority - b.priority);

    // Schema safety: filter out any follow-ups with invalid categories
    // Allowed: urgency, accountability, planning, exploration, summary, selection, search, navigation, guidance
    const VALID_CATEGORIES = new Set([
      "urgency", "accountability", "planning", "exploration", "summary",
      "selection", "search", "navigation", "guidance",
    ]);
    const validFollowUps = followUps.filter((f) => {
      if (!VALID_CATEGORIES.has(f.category)) {
        console.warn(`[PostReadInterpreter] Dropped follow-up with invalid category: "${f.category}" (label: "${f.label}")`);
        return false;
      }
      return true;
    });

    return validFollowUps.slice(0, 5).map(serializeFollowUp);
  };

  // Parent navigation (if child entity)
  let parentFollowUp = null;
  if (navigation.parentPath) {
    const parentType = navigation.parentPath.type;
    const parentIntent = READ_INTENT_BY_ENTITY[parentType];
    if (parentIntent) {
      const parentContext = buildEntityContext(
        parentType,
        navigation.parentPath.id,
        null,
        context,
        navigation,
      );
      parentFollowUp = {
        category: "navigation",
        priority: 1,
        ...buildFollowUp({
          label: buildTargetLabel("Review", parentContext?.label, parentType),
          reason: "Understanding parent context clarifies this entity's role.",
          labelKey: "view",
          intent: parentIntent,
          scopeType: parentType,
          scopeId: navigation.parentPath.id,
          origin,
          target: parentContext,
        }),
      };
    }
  }

  if (isAggregateSummary) {
    const listIntent = LIST_INTENT_BY_ENTITY[entityType];
    const { scopeType, scopeId } = resolveAggregateScope(entityType, context);
    const listFilters = isEmpty ? {} : aggregateFilters;
    const listLabel = buildAggregateLabel(entityType, listFilters);
    const parentContext =
      scopeType && scopeId !== null && scopeId !== undefined
        ? buildEntityContext(
            scopeType,
            scopeId,
            resolveEntityDataForScope(scopeType),
            context,
            navigation,
          )
        : null;
    const listTarget = { type: entityType };
    if (listIntent) {
      followUps.push({
        category: "summary",
        priority: 1,
        ...buildFollowUp({
          label: buildScopedLabel(
            "List",
            listLabel,
            parentContext?.label,
            entityType,
          ),
          reason: "Review the collection that matches this summary.",
          labelKey: "list",
          intent: listIntent,
          scopeType,
          scopeId,
          origin,
          target: listTarget,
          parent: parentContext,
          filters: listFilters || {},
        }),
      });
    }

    const priorityFollowUp = buildPriorityBreakdownFollowUp(
      entityType,
      entityData,
      origin,
      scopeType,
      scopeId,
      aggregateFilters,
      parentContext,
    );
    if (priorityFollowUp) {
      followUps.push(priorityFollowUp);
    }

    if (!isEmpty) {
      followUps.push(
        ...buildSelectionFollowUps(entityType, entityData, { context }),
      );
      if (
        followUps.length < 2 &&
        listIntent &&
        Object.keys(listFilters).length > 0
      ) {
        const fallbackLabel = buildAggregateLabel(entityType, {});
        followUps.push({
          category: "summary",
          priority: 3,
          ...buildFollowUp({
            label: buildScopedLabel(
              "List",
              fallbackLabel,
              parentContext?.label,
              entityType,
            ),
            reason: "Broaden the scope if you need the full collection.",
            labelKey: "list",
            intent: listIntent,
            scopeType,
            scopeId,
            origin,
            target: listTarget,
            parent: parentContext,
          }),
        });
      }
      if (followUps.length < 2 && parentFollowUp) {
        followUps.push(parentFollowUp);
      }
      return finalizeFollowUps();
    }
  }

  // ── Result-count specific follow-up selection ──
  if (isMultiple) {
    followUps.push(
      ...buildSelectionFollowUps(entityType, entityData, { context }),
    );
    if (followUps.length < 2 && parentFollowUp) {
      followUps.push(parentFollowUp);
    }

    if (followUps.length < 2) {
      const originRole = ENTITY_ROLES[originType];
      const originChildren = (originRole?.typicalChildren || []).map(
        (childType) => ({
          type: childType,
          count: null,
        }),
      );
      addChildExploration(originChildren, originType, originId, origin);
    }

    return finalizeFollowUps();
  }

  if (isEmpty) {
    if (parentFollowUp) {
      followUps.push({
        ...parentFollowUp,
        reason: "Creation is usually recorded under the parent entity.",
      });
    }

    const siblingParentType = navigation.parentPath?.type || originType;
    const siblingParentId = navigation.parentPath?.id || originId;
    const siblingCandidates = (
      ENTITY_ROLES[siblingParentType]?.typicalChildren || []
    )
      .filter((childType) => CHILD_TYPE_TO_ENTITY[childType] !== entityType)
      .map((childType) => ({ type: childType, count: null }));

    addChildExploration(
      siblingCandidates,
      siblingParentType,
      siblingParentId,
      origin,
    );

    if (followUps.length < 2) {
      const explainIntent = EXPLAIN_INTENT_BY_ENTITY[originType];
      if (explainIntent) {
        const creationTarget = { type: entityType };
        followUps.push({
          category: "guidance",
          priority: 6,
          ...buildFollowUp({
            label: `How ${formatEntityTypeLabel(entityType)} records are created`,
            reason: "Clarifies the usual creation path and required context.",
            labelKey: "how_created",
            intent: explainIntent,
            scopeType: originType,
            scopeId: originId,
            origin,
            target: creationTarget,
          }),
        });
      }
    }

    if (followUps.length < 2) {
      const readIntent = READ_INTENT_BY_ENTITY[originType];
      if (readIntent) {
        followUps.push({
          category: "guidance",
          priority: 7,
          ...buildFollowUp({
            label: `Review ${originLabel || formatEntityTypeLabel(originType)} context`,
            reason: "Verify the scope and parent context before retrying.",
            labelKey: "review_context",
            intent: readIntent,
            scopeType: originType,
            scopeId: originId,
            origin,
            target: originContext,
          }),
        });
      }
    }

    return finalizeFollowUps();
  }

  // Child exploration (if parent entity with children)
  if (parentFollowUp) {
    followUps.push(parentFollowUp);
  }
  const roleInfo = ENTITY_ROLES[entityType];
  const childCandidates =
    navigation.childrenAvailable.length > 0
      ? navigation.childrenAvailable
      : (roleInfo?.typicalChildren || []).map((childType) => ({
          type: childType,
          count: null,
        }));

  addChildExploration(childCandidates, originType, originId, origin);

  // State-driven follow-ups
  const hasUrgentInterpretation = interpretation.some(
    (i) => i.level === "critical" || i.level === "warning",
  );

  if (hasUrgentInterpretation) {
    // Add relevant follow-ups based on urgency
    if (entityType === "dossier" || entityType === "lawsuit") {
      if (context.overdueTasks && context.overdueTasks.length > 0) {
        const overdueCount = context.overdueTasks.length;
        const parentContext = originContext;
        const target = { type: "task" };
        followUps.push({
          category: "urgency",
          priority: 0,
          ...buildFollowUp({
            label: buildScopedLabel(
              "Show",
              "overdue tasks",
              parentContext?.label,
              "task",
            ),
            reason: `${overdueCount} overdue task(s) need review to prevent further delay.`,
            labelKey: "show",
            intent: READ_INTENTS.LIST_OVERDUE_TASKS,
            scopeType: entityType,
            scopeId: originId,
            origin,
            target,
            parent: parentContext,
            filters: { overdue: true },
          }),
        });
      }
    }

    // Accountability follow-up for ownership gaps
    const hasOwnershipGap = interpretation.some(
      (i) => i.signal === "ownership_gap",
    );
    if (
      hasOwnershipGap &&
      (entityType === "dossier" || entityType === "task")
    ) {
      const ownershipSignal = interpretation.find(
        (i) => i.signal === "ownership_gap",
      );
      followUps.push({
        category: "accountability",
        priority: 1,
        ...buildFollowUp({
          label:
            entityType === "dossier"
              ? "Review dossier assignment"
              : "Review task assignment",
          reason: ownershipSignal
            ? ownershipSignal.implication
            : "No accountable owner assigned.",
          labelKey: "review_assignment",
          intent:
            entityType === "dossier"
              ? READ_INTENTS.READ_DOSSIER
              : READ_INTENTS.READ_TASK,
          scopeType: entityType,
          scopeId: originId,
          origin,
          target: originContext,
        }),
      });
    }
  }

  // Entity-specific standard follow-ups
  switch (entityType) {
    case "client":
      if (!followUps.some((f) => f.label.includes("dossiers"))) {
        const parentContext = originContext;
        const target = { type: "dossier" };
        followUps.push({
          category: "exploration",
          priority: 3,
          ...buildFollowUp({
            label: "Review client dossiers",
            reason: "Dossiers show the full scope of client engagement.",
            labelKey: "review_client_dossiers",
            intent: READ_INTENTS.LIST_DOSSIERS,
            scopeType: "client",
            scopeId: originId,
            origin,
            target,
            parent: parentContext,
          }),
        });
      }
      break;

    case "dossier":
      {
        const dossierPhase = entityData?.phase
          ? String(entityData.phase)
          : "current";
        const dossierTaskSummary = context?.childSummary?.tasks || {};
        const activeTaskCount = Number(dossierTaskSummary.active || 0);
        const overdueTaskCount = Number(dossierTaskSummary.overdue || 0);
        const isCritical = interpretation.some((i) => i.level === "critical");
        const isWarning = interpretation.some((i) => i.level === "warning");
        const urgencyLabel =
          isCritical || overdueTaskCount > 0
            ? "urgent"
            : isWarning
              ? "high-priority"
              : "standard";
        const planningLabel =
          urgencyLabel === "urgent"
            ? "Review immediate dossier priorities"
            : activeTaskCount > 0
              ? "Map near-term dossier steps"
              : "Draft dossier work plan";
        const planningReason =
          urgencyLabel === "urgent"
            ? `Start an ${urgencyLabel} work-session plan for phase "${dossierPhase}" with priority on blockers, deadlines, and overdue work.`
            : activeTaskCount > 0
              ? `Build the next-step plan for phase "${dossierPhase}" around ${activeTaskCount} active task(s).`
              : `Set a practical next-step plan for phase "${dossierPhase}" before adding more work.`;
        followUps.push({
          category: "planning",
          priority: 0.5,
          ...buildFollowUp({
            label: planningLabel,
            reason: planningReason,
            intent: EXPLAIN_INTENT_BY_ENTITY.dossier,
            scopeType: "dossier",
            scopeId: originId,
            origin,
            target: originContext,
          }),
        });
        if (activeTaskCount > 0 || overdueTaskCount > 0) {
          followUps.push({
            category: "planning",
            priority: 1.5,
            ...buildFollowUp({
              label:
                overdueTaskCount > 0
                  ? "Inspect active and overdue workload"
                  : "Inspect active workload",
              reason:
                overdueTaskCount > 0
                  ? `${overdueTaskCount} overdue task(s) need to be sequenced within active work.`
                  : `Review ${activeTaskCount} active task(s) to confirm delivery pace and dependencies.`,
              intent: READ_INTENTS.LIST_TASKS,
              scopeType: "dossier",
              scopeId: originId,
              origin,
              target: { type: "task" },
              parent: originContext,
              filters: { activity: "active" },
            }),
          });
        }
        if (
          entityData?.client_id &&
          !followUps.some(
            (f) =>
              f.intent === READ_INTENTS.READ_CLIENT &&
              f.scope?.clientId === Number(entityData.client_id),
          )
        ) {
          followUps.push({
            category: "planning",
            priority: 2.5,
            ...buildFollowUp({
              label: "Review client context",
              reason:
                "Keep dossier decisions aligned with the parent client profile.",
              labelKey: "review_client_context",
              intent: READ_INTENTS.READ_CLIENT,
              scopeType: "client",
              scopeId: entityData.client_id,
              origin,
              target: { type: "client", id: entityData.client_id },
            }),
          });
        }
        const sessionCount = Number(context?.childSummary?.sessions?.total || 0);
        if (
          sessionCount > 0 &&
          !followUps.some(
            (f) =>
              f.intent === READ_INTENTS.LIST_SESSIONS &&
              f.scope?.dossierId === Number(originId),
          )
        ) {
          followUps.push({
            category: "planning",
            priority: 3.5,
            ...buildFollowUp({
              label: "Prepare for upcoming hearing",
              reason:
                "Review upcoming sessions to prepare near-term legal actions.",
              labelKey: "prepare_upcoming_hearing",
              intent: READ_INTENTS.LIST_SESSIONS,
              scopeType: "dossier",
              scopeId: originId,
              origin,
              target: { type: "session" },
              parent: originContext,
              filters: { timeframe: "upcoming" },
            }),
          });
        }
      }
      followUps.push({
        category: "summary",
        priority: 4,
        ...buildFollowUp({
          label: buildTargetLabel("Summarize", originLabel, "dossier"),
          reason: "Get a comprehensive overview of the case.",
          labelKey: "summarize",
          intent: SUMMARY_INTENT_BY_ENTITY.dossier,
          scopeType: "dossier",
          scopeId: originId,
          origin,
          target: originContext,
        }),
      });
      break;

    case "task":
      break;

    case "lawsuit":
      {
        const parentContext = originContext;
        const target = { type: "session" };
        followUps.push({
          category: "exploration",
          priority: 2,
          ...buildFollowUp({
            label: buildScopedLabel(
              "List",
              "sessions",
              parentContext?.label,
              "session",
            ),
            reason: "Court sessions drive lawsuit timeline.",
            labelKey: "list",
            intent: READ_INTENTS.LIST_SESSIONS,
            scopeType: "lawsuit",
            scopeId: originId,
            origin,
            target,
            parent: parentContext,
          }),
        });
      }
      break;
  }

  return finalizeFollowUps();
}

// ─── Main Interpreter Function ─────────────────────────────────

/**
 * MANDATORY post-read interpretation.
 *
 * This function MUST be called for every entity read.
 * It transforms raw data into structured assistance.
 *
 * @param {string} entityType - The type of entity (client, dossier, task, etc.)
 * @param {object} entityData - The primary entity data
 * @param {object} context - Enriched context with related data
 * @returns {object} Interpretation result with facts, interpretation, navigation, followUps
 */
function interpret(entityType, entityData, context) {
  // 1. Build interpretation (why it matters now)
  const interpretation = interpretEntityState(entityType, entityData, context);

  // 2. Build navigation context (parent/child awareness)
  const navigation = buildNavigationContext(entityType, entityData, context);

  // 3. Generate follow-ups (guided next steps)
  const followUps = generateFollowUps(
    entityType,
    entityData,
    context,
    interpretation,
    navigation,
  );

  return {
    // Interpretation block — what the state means
    interpretation: {
      statements: interpretation,
      summary: buildInterpretationSummary(interpretation, context),
    },

    // Navigation context — entity role awareness
    navigation: {
      role: navigation.entityRole,
      roleDescription: navigation.roleDescription,
      contextStatement: navigation.contextStatement,
      parentPath: navigation.parentPath,
      childrenAvailable: navigation.childrenAvailable,
    },

    // Follow-ups — mandatory guided next steps
    followUps,
  };
}

/**
 * Builds a one-line summary of interpretation.
 *
 * SEMANTIC CONTRACT:
 * - The summary should reflect what the data MEANS, not just its presence/absence
 * - Empty results are meaningful ("no pending tasks" ≠ "error")
 * - Always use the interpretation statements when available
 * - Never return generic "Empty result." - that's a fact, not an interpretation
 */
function buildInterpretationSummary(interpretation, context) {
  const resultCount =
    typeof context?._resultCount === "number" ? context._resultCount : null;
  const readOutcome = context?._readOutcome;

  // Check for critical/warning issues first (these always take priority)
  // Use the actual statement text to preserve grounded entity counts.
  // Counting statements would produce misleading numbers (e.g. "1 item needs review"
  // when the single statement says "3 dossier(s) are on hold").
  const critical = interpretation.filter((i) => i.level === "critical");
  const warning = interpretation.filter((i) => i.level === "warning");

  if (critical.length > 0) {
    return critical.map((i) => i.statement).join(" ");
  }
  if (warning.length > 0) {
    return warning.map((i) => i.statement).join(" ");
  }

  // For empty/not_found results, use the interpretation statements
  // The interpretation array already contains meaningful context from interpretEntityState()
  if (
    resultCount === 0 ||
    readOutcome === "empty" ||
    readOutcome === "not_found"
  ) {
    // Look for a meaningful interpretation statement (neutral or info level)
    const meaningful = interpretation.find(
      (i) => i.level === "neutral" || i.level === "info",
    );
    if (meaningful && meaningful.statement) {
      return meaningful.statement;
    }
    // Fallback: provide contextual message based on entity type if available
    const entityType = context?.activeEntityType || context?.scope;
    if (entityType) {
      return `No ${entityType} activity in the current scope.`;
    }
    return "No matching records in the current scope.";
  }

  // Default for successful results with no issues
  const meaningful = interpretation.find(
    (i) => i.level === "neutral" || i.level === "info",
  );
  return meaningful?.statement || "";
}

// ─── Exports ───────────────────────────────────────────────────

module.exports = {
  interpret,
  ENTITY_ROLES,
};
