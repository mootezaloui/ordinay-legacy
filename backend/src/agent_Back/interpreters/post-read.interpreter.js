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

// ─── Entity Role Definitions ───────────────────────────────────

const ENTITY_ROLES = {
  client: {
    role: "parent",
    description: "Root entity that owns dossiers, tasks, accounting, and history",
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
    navigationContext: "Tasks are actionable items. They indicate pending work.",
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
    navigationContext: "Missions are delegated tasks with external dependencies.",
  },
  financial_entry: {
    role: "child",
    description: "Financial record linked to a client or dossier",
    typicalParent: "dossier",
    navigationContext: "Financial entries track billing and payments.",
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
  const readOutcome = context?._readOutcome;
  if (readOutcome === "error") {
    return [
      {
        level: "critical",
        statement: "Unable to retrieve the requested data.",
        implication: "Retry the query or verify data access permissions.",
      },
    ];
  }
  if (readOutcome === "ambiguous") {
    return [
      {
        level: "info",
        statement: "Multiple matches found for this request.",
        implication: "Specify the exact record to continue.",
      },
    ];
  }
  if (readOutcome === "incomplete") {
    return [
      {
        level: "info",
        statement: "More information is required to locate the record.",
        implication: "Provide an ID, reference, or exact name.",
      },
    ];
  }
  if (readOutcome === "not_found") {
    return [
      {
        level: "info",
        statement: `No ${entityType} record matched this request.`,
        implication: "Verify the identifier or broaden the search.",
      },
    ];
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
      interpretations.push(...interpretGenericState(entityType, entityData, context));
  }

  // Always add at least one interpretation
  if (interpretations.length === 0) {
    interpretations.push({
      level: "neutral",
      statement: `No immediate issues detected for this ${entityType}.`,
      implication: "No urgent action required. Review periodically to confirm.",
    });
  }

  return interpretations;
}

function interpretCollectionState(entityType, entities, context) {
  const interpretations = [];
  const count = entities.length;

  if (count === 0) {
    interpretations.push({
      level: "neutral",
      statement: `No ${entityType} records found.`,
      implication:
        "This may mean none exist yet, they fall outside the current scope, or they have not been recorded. Check filters or confirm the parent record.",
    });
    return interpretations;
  }

  interpretations.push({
    level: "info",
    statement: `${count} ${entityType} record(s) loaded.`,
    implication: "Review the list for priority and status changes.",
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

    if (overdue.length > 0) {
      interpretations.push({
        level: overdue.length > 3 ? "critical" : "warning",
        statement: `${overdue.length} task(s) are overdue in this list.`,
        implication: "Late tasks require immediate review and reprioritization.",
      });
    }
    if (blocked.length > 0) {
      interpretations.push({
        level: "warning",
        statement: `${blocked.length} task(s) are blocked.`,
        implication: "Resolve dependencies to unblock progress.",
      });
    }
    if (urgent.length > 0) {
      interpretations.push({
        level: "warning",
        statement: `${urgent.length} task(s) are marked urgent.`,
        implication: "Confirm urgent items have active owners and deadlines.",
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
      (dossier) => !["closed", "archived"].includes(normalizeStatus(dossier.status)),
    );

    if (blocked.length > 0) {
      interpretations.push({
        level: "critical",
        statement: `${blocked.length} dossier(s) are blocked.`,
        implication: "Investigate blockers before progress can resume.",
      });
    }
    if (onHold.length > 0) {
      interpretations.push({
        level: "warning",
        statement: `${onHold.length} dossier(s) are on hold.`,
        implication: "Confirm whether hold conditions still apply.",
      });
    }
    if (active.length > 0) {
      interpretations.push({
        level: "info",
        statement: `${active.length} dossier(s) are active.`,
        implication: "Monitor deadlines and task coverage across active cases.",
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
        statement: `${inactive.length} client(s) are inactive.`,
        implication: "Active engagement is limited; prioritize current clients.",
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
        statement: `${imminent.length} session(s) occur within 3 days.`,
        implication: "Finalize preparation and confirm attendance.",
      });
    } else if (upcoming.length > 0) {
      interpretations.push({
        level: "info",
        statement: `${upcoming.length} upcoming session(s) scheduled.`,
        implication: "Track preparation timelines and required filings.",
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
        statement: `${overdue.length} financial entry(ies) are overdue.`,
        implication: "Outstanding receivables require follow-up.",
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
        statement: `${pendingJudgment.length} lawsuit(s) await judgment.`,
        implication: "Prepare for outcomes and client communication.",
      });
    }
    if (active.length > 0) {
      interpretations.push({
        level: "info",
        statement: `${active.length} lawsuit(s) are active.`,
        implication: "Monitor hearing schedules and filing deadlines.",
      });
    }
  }

  return interpretations;
}

function interpretDossierState(dossier, context) {
  const interpretations = [];

  // Status-based interpretation
  if (dossier.status === "blocked") {
    interpretations.push({
      level: "critical",
      statement: "This dossier is BLOCKED.",
      implication: "Work cannot proceed. Identify and resolve the blocking issue immediately.",
    });
  } else if (dossier.status === "on_hold") {
    interpretations.push({
      level: "warning",
      statement: "This dossier is ON HOLD.",
      implication: "Active work is paused. Verify if hold conditions still apply.",
    });
  } else if (dossier.status === "closed") {
    interpretations.push({
      level: "neutral",
      statement: "This dossier is CLOSED.",
      implication: "No active work expected. Historical reference only.",
    });
  }

  // Priority + status mismatch
  if (dossier.priority === "high" && dossier.status === "pending") {
    interpretations.push({
      level: "warning",
      statement: "High priority dossier has not started.",
      implication: "This case is marked urgent but work hasn't begun. Review assignment.",
    });
  }

  // Deadline pressure
  if (dossier.next_deadline) {
    const deadline = new Date(dossier.next_deadline);
    const now = new Date();
    const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      interpretations.push({
        level: "critical",
        statement: `Deadline passed ${Math.abs(daysUntil)} days ago.`,
        implication: "Immediate review required. Assess consequences and next steps.",
      });
    } else if (daysUntil <= 3) {
      interpretations.push({
        level: "critical",
        statement: `Deadline in ${daysUntil} day(s).`,
        implication: "Urgent preparation needed. Verify all prerequisites are met.",
      });
    } else if (daysUntil <= 7) {
      interpretations.push({
        level: "warning",
        statement: `Deadline approaching in ${daysUntil} days.`,
        implication: "Plan final preparations. Review outstanding tasks.",
      });
    }
  } else {
    interpretations.push({
      level: "info",
      statement: "No deadline is set for this dossier.",
      implication: "Consider setting a milestone to maintain tracking discipline.",
    });
  }

  if (dossier.phase) {
    interpretations.push({
      level: "info",
      statement: `Dossier phase: ${dossier.phase}.`,
      implication: "Phase indicates the current procedural stage.",
    });
  }

  const taskSummary = context?.childSummary?.tasks;
  if (taskSummary) {
    const total = Number(taskSummary.total || 0);
    const active = Number(taskSummary.active || 0);
    const overdue = Number(taskSummary.overdue || 0);

    if (total > 0) {
      if (overdue > 0) {
        interpretations.push({
          level: overdue > 3 ? "critical" : "warning",
          statement: `${overdue} overdue task(s) exist in this dossier.`,
          implication: "Pending work is accumulating. Review task priorities.",
        });
      }

      if (active > 0) {
        interpretations.push({
          level: "info",
          statement: `${active} active task(s) for this dossier.`,
          implication: "Active work requires tracking and ownership.",
        });
      } else {
        interpretations.push({
          level: "neutral",
          statement: "No active tasks are open for this dossier.",
          implication: "Workload appears paused or completed.",
        });
      }
    } else {
      interpretations.push({
        level: "info",
        statement: "No tasks exist for this dossier.",
        implication: "Define the first tasks to begin progress.",
      });
    }
  }

  const sessionSummary = context?.childSummary?.sessions;
  if (sessionSummary) {
    const totalSessions = Number(sessionSummary.total || 0);
    if (totalSessions > 0) {
      interpretations.push({
        level: "info",
        statement: `${totalSessions} session(s) recorded for this dossier.`,
        implication: "Review session timeline for upcoming preparation.",
      });
    } else {
      interpretations.push({
        level: "info",
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
      statement: `${count} overdue task(s) exist in this dossier.`,
      implication: "Pending work is accumulating. Review task priorities.",
    });
  }

  // Unassigned
  if (!dossier.assigned_lawyer) {
    interpretations.push({
      level: "warning",
      statement: "No lawyer is assigned to this dossier.",
      implication: "Ownership unclear. Assign responsibility to ensure follow-through.",
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
      statement: "This client is marked INACTIVE.",
      implication: "No active engagement expected. Historical records only.",
    });
  }

  // Dossier overview
  const dossierSummary = context?.childSummary?.dossiers;
  if (Array.isArray(context.dossiers)) {
    if (context.dossiers.length > 0) {
      const activeDossiers = context.dossiers.filter(
        (d) => d.status !== "closed" && d.status !== "archived"
      );
      const blockedDossiers = context.dossiers.filter(
        (d) => d.status === "blocked"
      );

      if (blockedDossiers.length > 0) {
        interpretations.push({
          level: "critical",
          statement: `${blockedDossiers.length} dossier(s) are BLOCKED for this client.`,
          implication: "Active cases are stalled. Review blocking issues.",
        });
      }

      if (activeDossiers.length > 0) {
        interpretations.push({
          level: "info",
          statement: `${activeDossiers.length} active dossier(s) for this client.`,
          implication: "Ongoing case work exists. Review for priority and deadlines.",
        });
      } else {
        interpretations.push({
          level: "neutral",
          statement: "All dossiers for this client are closed or archived.",
          implication: "No active work. Client relationship is historical.",
        });
      }
    } else {
      interpretations.push({
        level: "info",
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
          statement: `${blocked} dossier(s) are BLOCKED for this client.`,
          implication: "Active cases are stalled. Review blocking issues.",
        });
      }

      if (active > 0) {
        interpretations.push({
          level: "info",
          statement: `${active} active dossier(s) for this client.`,
          implication: "Ongoing case work exists. Review for priority and deadlines.",
        });
      } else {
        interpretations.push({
          level: "neutral",
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
          statement: `Dossier priority mix: ${priorityParts.join(", ")}.`,
          implication: "Confirm urgent and high priority matters are resourced.",
        });
      }
    } else {
      interpretations.push({
        level: "info",
        statement: "No dossiers exist for this client.",
        implication: "New client or prospect. Consider intake process.",
      });
    }
  } else {
    interpretations.push({
      level: "info",
      statement: "No related records found for this client.",
      implication: "No active workload is recorded yet.",
    });
  }

  // Client-wide overdue tasks
  if (context.overdueTasks && context.overdueTasks.length > 0) {
    interpretations.push({
      level: "warning",
      statement: `${context.overdueTasks.length} overdue task(s) across this client's dossiers.`,
      implication: "Work is falling behind. Review resource allocation.",
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
      statement: `This task is ${daysOverdue} day(s) OVERDUE.`,
      implication: daysOverdue > 7
        ? "Significant delay. Escalate or reassess priority."
        : "Task is late. Complete soon or update deadline.",
    });
  }

  // Status interpretation
  if (status === "blocked") {
    interpretations.push({
      level: "warning",
      statement: "This task is BLOCKED.",
      implication: "Cannot proceed without resolving dependency. Identify blocker.",
    });
  } else if (status === "pending" && normalizePriority(task.priority) === "urgent") {
    interpretations.push({
      level: "critical",
      statement: "URGENT task has not started.",
      implication: "High priority work is waiting. Begin immediately or reassign.",
    });
  } else if (status === "in_progress") {
    interpretations.push({
      level: "info",
      statement: "Task is actively in progress.",
      implication: "Work is ongoing. Monitor for completion.",
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
      statement: `This task belongs to dossier/case "${parentRef}".`,
      implication: "Task progress affects the parent case. Consider case-level impact.",
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
      statement: "Lawsuit is awaiting judgment.",
      implication: "Outcome pending. Prepare for both scenarios.",
    });
  } else if (lawsuit.status === "active") {
    interpretations.push({
      level: "info",
      statement: "Lawsuit is ACTIVE.",
      implication: "Legal proceedings ongoing. Monitor court calendar.",
    });
  }

  // Session presence
  if (context.timeline && context.timeline.length > 0) {
    const now = new Date();
    const upcomingSessions = context.timeline.filter(
      (e) => e.type === "session" && new Date(e.date) > now
    );
    if (upcomingSessions.length === 0) {
      interpretations.push({
        level: "info",
        statement: "No upcoming court sessions scheduled.",
        implication: "Verify if scheduling is needed or case is between hearings.",
      });
    } else {
      const nextSession = upcomingSessions[0];
      const daysUntil = Math.ceil((new Date(nextSession.date) - now) / (1000 * 60 * 60 * 24));
      interpretations.push({
        level: daysUntil <= 7 ? "warning" : "info",
        statement: `Next court session in ${daysUntil} day(s).`,
        implication: daysUntil <= 7
          ? "Hearing approaching. Ensure preparation is complete."
          : "Session scheduled. Track preparation timeline.",
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
        statement: "This session has PASSED.",
        implication: "Review outcomes and follow-up tasks.",
      });

      // Check for incomplete follow-up
      if (context.tasks && context.tasks.length > 0) {
        const incompleteTasks = context.tasks.filter(
          (t) => t.status !== "completed" && t.status !== "done"
        );
        if (incompleteTasks.length > 0) {
          interpretations.push({
            level: "warning",
            statement: `${incompleteTasks.length} related task(s) remain incomplete.`,
            implication: "Post-session work pending. Complete follow-up items.",
          });
        }
      }
    } else {
      const daysUntil = Math.ceil((sessionDate - now) / (1000 * 60 * 60 * 24));
      interpretations.push({
        level: daysUntil <= 3 ? "critical" : daysUntil <= 7 ? "warning" : "info",
        statement: `Session scheduled in ${daysUntil} day(s).`,
        implication: daysUntil <= 3
          ? "Imminent. Final preparation required."
          : daysUntil <= 7
            ? "Approaching. Verify preparation status."
            : "Upcoming. Plan preparation timeline.",
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
      statement: `This session is linked to dossier/case "${parentRef}".`,
      implication: "Session outcomes affect the parent matter.",
    });
  }

  return interpretations;
}

function interpretGenericState(entityType, entityData, context) {
  const interpretations = [];

  interpretations.push({
    level: "neutral",
    statement: `${entityType} loaded successfully.`,
    implication: "Review details and navigate to related entities as needed.",
  });

  return interpretations;
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
          available = !!(context.financialEntries && context.financialEntries.length > 0);
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
    notification: entityData.id,
    history_event: entityData.id,
  };

  return byType[entityType] || entityData.id || entityData.name || null;
}

function resolveOriginEntity(entityType, entityData, context) {
  if (context?.activeEntityType && context?.activeEntityId) {
    return { type: context.activeEntityType, id: context.activeEntityId };
  }

  if (entityData && !Array.isArray(entityData) && entityData.id) {
    return { type: entityType, id: entityData.id };
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

  if (context?.clientData?.id) return { type: "client", id: context.clientData.id };
  if (context?.dossierData?.id) return { type: "dossier", id: context.dossierData.id };
  if (context?.lawsuitData?.id) return { type: "lawsuit", id: context.lawsuitData.id };

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

function resolveListItemLabel(entityType, item) {
  if (!item || typeof item !== "object") return null;
  const fallback =
    item.reference || item.title || item.name || item.subject || item.id;

  switch (entityType) {
    case "client":
      return item.name || item.reference || fallback;
    case "dossier":
      return item.reference || item.title || fallback;
    case "lawsuit":
      return item.reference || item.lawsuit_number || item.title || fallback;
    case "task":
    case "personal_task":
      return item.title || item.name || fallback;
    case "session":
      return item.title || item.session_type || item.reference || fallback;
    case "mission":
      return item.reference || item.title || fallback;
    case "financial_entry":
      return item.reference || item.title || fallback;
    case "notification":
      return item.title || item.subject || fallback;
    case "history_event":
      return item.action || item.title || fallback;
    default:
      return fallback;
  }
}

function formatEntityTypeLabel(entityType) {
  return String(entityType || "").replace(/_/g, " ").trim();
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

function resolveEntityLabel(entityType, entityId, entityData, context, navigation) {
  if (!entityType) return null;

  if (
    navigation?.parentPath &&
    navigation.parentPath.type === entityType &&
    navigation.parentPath.id !== undefined &&
    String(navigation.parentPath.id) === String(entityId)
  ) {
    return (
      navigation.parentPath.reference ||
      navigation.parentPath.name ||
      String(entityId)
    );
  }

  const candidate = resolveEntityDataForType(entityType, entityData, context);
  if (candidate) {
    if (
      entityId === null ||
      entityId === undefined ||
      candidate.id === undefined ||
      String(candidate.id) === String(entityId)
    ) {
      return resolveListItemLabel(entityType, candidate) || String(entityId);
    }
  }

  return entityId !== null && entityId !== undefined
    ? String(entityId)
    : null;
}

function buildEntityContext(
  entityType,
  entityId,
  entityData,
  context,
  navigation,
  labelOverride,
) {
  if (!entityType || entityId === null || entityId === undefined) return null;
  const fallbackLabel =
    entityId !== null && entityId !== undefined
      ? `${formatEntityTypeLabel(entityType)} ${entityId}`
      : formatEntityTypeLabel(entityType);
  const resolvedLabel =
    labelOverride ||
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

function buildSelectionFollowUps(entityType, entityData) {
  if (!Array.isArray(entityData)) return [];
  const readIntent = READ_INTENT_BY_ENTITY[entityType];
  if (!readIntent) return [];

  const candidates = entityData.filter(
    (item) => item && item.id !== null && item.id !== undefined,
  );

  return candidates.slice(0, 5).flatMap((item, idx) => {
    const scope = buildScopeForType(entityType, item.id);
    if (Object.keys(scope).length === 0) return [];
    const labelText = resolveListItemLabel(entityType, item) || `${entityType.replace(/_/g, " ")} ${item.id}`;
    const origin = { type: entityType, id: item.id };
    const target = {
      type: entityType,
      id: item.id,
      label: labelText,
    };
    return [
      {
        category: "selection",
        priority: idx,
        ...buildFollowUp({
          label: buildTargetLabel("Open", labelText, entityType),
          reason: "Select a specific record to continue.",
          labelKey: "open",
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
      entity: ENTITY_LABELS[origin.type] || String(origin.type || "").toUpperCase(),
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
      label: buildScopedLabel("List", qualifierLabel, parentContext?.label, entityType),
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
function generateFollowUps(entityType, entityData, context, interpretation, navigation) {
  const followUps = [];
  const resultCount = resolveResultCount(entityData, context);
  const isEmpty = resultCount === 0;
  const isMultiple = resultCount > 1;
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

  const addChildExploration = (candidates, scopeType, scopeId, originForFollowUp) => {
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
        navigation.parentPath.reference || navigation.parentPath.name,
      );
      parentFollowUp = {
        category: "navigation",
        priority: 1,
        ...buildFollowUp({
          label: buildTargetLabel("View", parentContext?.label, parentType),
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
          label: buildScopedLabel("List", listLabel, parentContext?.label, entityType),
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
      followUps.push(...buildSelectionFollowUps(entityType, entityData));
      if (followUps.length < 2 && listIntent && Object.keys(listFilters).length > 0) {
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
      followUps.sort((a, b) => a.priority - b.priority);
      return followUps.slice(0, 5).map(serializeFollowUp);
    }
  }

  // ── Result-count specific follow-up selection ──
  if (isMultiple) {
    followUps.push(...buildSelectionFollowUps(entityType, entityData));
    if (followUps.length < 2 && parentFollowUp) {
      followUps.push(parentFollowUp);
    }

    if (followUps.length < 2) {
      const originRole = ENTITY_ROLES[originType];
      const originChildren =
        (originRole?.typicalChildren || []).map((childType) => ({
          type: childType,
          count: null,
        }));
      addChildExploration(originChildren, originType, originId, origin);
    }

    followUps.sort((a, b) => a.priority - b.priority);
    return followUps.slice(0, 5).map(serializeFollowUp);
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
    const siblingCandidates = (ENTITY_ROLES[siblingParentType]?.typicalChildren || [])
      .filter((childType) => CHILD_TYPE_TO_ENTITY[childType] !== entityType)
      .map((childType) => ({ type: childType, count: null }));

    addChildExploration(siblingCandidates, siblingParentType, siblingParentId, origin);

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

    followUps.sort((a, b) => a.priority - b.priority);
    return followUps.slice(0, 5).map(serializeFollowUp);
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
    (i) => i.level === "critical" || i.level === "warning"
  );

  if (hasUrgentInterpretation) {
    // Add relevant follow-ups based on urgency
    if (entityType === "dossier" || entityType === "lawsuit") {
      if (context.overdueTasks && context.overdueTasks.length > 0) {
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
            reason: "Overdue work requires immediate attention.",
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
            label: buildScopedLabel(
              "List",
              "dossiers",
              parentContext?.label,
              "dossier",
            ),
            reason: "Dossiers show the full scope of client engagement.",
            labelKey: "list",
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
      followUps.push({
        category: "summary",
        priority: 3,
        ...buildFollowUp({
          label: buildTargetLabel(
            "Summarize",
            originLabel,
            "dossier",
          ),
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

  // Sort by priority and take top 5
  followUps.sort((a, b) => a.priority - b.priority);

  // Ensure at least 2 follow-ups always exist (single-result only)
  while (followUps.length < 2) {
    const explainIntent = EXPLAIN_INTENT_BY_ENTITY[originType];
    if (explainIntent && !followUps.some((f) => f.intent === explainIntent)) {
      followUps.push({
        category: "general",
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
        category: "general",
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
    break;
  }

  return followUps.slice(0, 5).map(serializeFollowUp);
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
    navigation
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
 */
function buildInterpretationSummary(interpretation, context) {
  const resultCount =
    typeof context?._resultCount === "number" ? context._resultCount : null;
  const readOutcome = context?._readOutcome;

  if (resultCount === 0 || readOutcome === "empty" || readOutcome === "not_found") {
    return "Empty result.";
  }
  const critical = interpretation.filter((i) => i.level === "critical");
  const warning = interpretation.filter((i) => i.level === "warning");

  if (critical.length > 0) {
    return `${critical.length} critical issue(s) require immediate attention.`;
  }
  if (warning.length > 0) {
    return `${warning.length} item(s) need review.`;
  }
  return "No critical issues detected in the current records.";
}

// ─── Exports ───────────────────────────────────────────────────

module.exports = {
  interpret,
  ENTITY_ROLES,
};
