/**
 * Domain Rules Internationalization Helper
 *
 * Provides centralized i18n message building for domain rules.
 * All user-facing messages from domain rules are translated here.
 */

import { i18nInstance } from "../i18n";

// Translation helper
const t = (key, options = {}) => {
  return i18nInstance.t(key, { ns: "domain", ...options });
};

/**
 * Build blocker message for incomplete tasks
 */
export const buildTasksBlocker = (incompleteTasks) => {
  const count = incompleteTasks.length;
  const key = count > 1 ? "tasksOpen_plural" : "tasksOpen";

  return t(`dossier.close.blocked.${key}`, { count }) +
    incompleteTasks
      .slice(0, 3)
      .map((t) => `\n  • ${t.title} (${t.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` + t(`dossier.close.blocked.andMore${count - 3 > 1 ? "_plural" : ""}`, { count: count - 3 })
      : "");
};

/**
 * Build blocker message for open cases
 */
export const buildCasesBlocker = (openCases, entityType = "dossier") => {
  const count = openCases.length;
  const key = count > 1 ? "casesOpen_plural" : "casesOpen";

  return t(`${entityType}.close.blocked.${key}`, { count }) +
    openCases
      .slice(0, 3)
      .map((c) => `\n  • ${c.caseNumber} - ${c.title} (${c.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` + t(`${entityType}.close.blocked.andMore${count - 3 > 1 ? "_plural" : ""}`, { count: count - 3 })
      : "");
};

/**
 * Build blocker message for open dossiers
 */
export const buildDossiersBlocker = (openDossiers) => {
  const count = openDossiers.length;
  const key = count > 1 ? "dossiersOpen_plural" : "dossiersOpen";

  return t(`client.archive.blocked.${key}`, { count }) +
    openDossiers
      .slice(0, 3)
      .map((d) => `\n  • ${d.caseNumber} - ${d.title} (${d.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` + t(`client.archive.blocked.andMore${count - 3 > 1 ? "_plural" : ""}`, { count: count - 3 })
      : "");
};

/**
 * Build blocker message for open sessions
 */
export const buildSessionsBlocker = (openSessions, entityType = "dossier") => {
  const count = openSessions.length;
  const key = count > 1 ? "sessionsOpen_plural" : "sessionsOpen";

  return t(`${entityType}.close.blocked.${key}`, { count }) +
    openSessions
      .slice(0, 3)
      .map((s) => `\n  - ${s.type || "Hearing"} on ${s.date} (${s.status})`)
      .join("") +
    (count > 3
      ? `\n  - ` + t(`${entityType}.close.blocked.andMore${count - 3 > 1 ? "_plural" : ""}`, { count: count - 3 })
      : "");
};

/**
 * Build blocker message for active missions
 */
export const buildMissionsBlocker = (activeMissions, entityType = "dossier") => {
  const count = activeMissions.length;
  const key = count > 1 ? "missionsActive_plural" : "missionsActive";

  return t(`${entityType}.close.blocked.${key}`, { count }) +
    activeMissions
      .slice(0, 3)
      .map((m) => `\n  • ${m.missionNumber} - ${m.title} (${m.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` + t(`${entityType}.close.blocked.andMore${count - 3 > 1 ? "_plural" : ""}`, { count: count - 3 })
      : "");
};

/**
 * Build blocker message for unpaid balance
 */
export const buildUnpaidBalanceBlocker = (balance) => {
  return t("dossier.close.blocked.unpaidBalance", {
    amount: Math.abs(balance).toFixed(2)
  });
};

/**
 * Build impact summary for relational changes
 */
export const buildImpactSummary = (changes, entityType) => {
  const impactSummary = [];

  changes.forEach((change) => {
    const changeKey = change.type === "reference_change" ? "reference" :
                      change.type === "client_reassignment" ? "client" :
                      change.type === "dossier_reassignment" ? "dossier" :
                      change.type === "officer_reassignment" ? "officer" :
                      change.type === "parent_reassignment" ? "parent" :
                      change.type === "session_parent_reassignment" ? "parent" : "parent";

    const from = change.from || t(`${entityType}.impact.${changeKey}.unknown`) || "Not defined";
    const to = change.to || t(`${entityType}.impact.${changeKey}.unknown`) || "Not defined";

    impactSummary.push(t(`${entityType}.impact.${changeKey}.current`, { value: from }));
    impactSummary.push(t(`${entityType}.impact.${changeKey}.new`, { value: to }));
    impactSummary.push("");
    impactSummary.push(t(`${entityType}.impact.${changeKey}.impactTitle`));
    impactSummary.push(...change.impact);
    impactSummary.push("");
  });

  return impactSummary;
};

/**
 * Build delete warning messages
 */
export const buildDeleteWarnings = (affectedEntities, entityType) => {
  const warnings = [];

  affectedEntities.forEach(entity => {
    const count = entity.count;
    const type = entity.type;
    const key = count > 1 ? `${type}WillDelete_plural` : `${type}WillDelete`;
    warnings.push(t(`${entityType}.delete.warning.${key}`, { count }));
  });

  return warnings;
};

/**
 * Build force delete message
 */
export const buildForceDeleteMessage = (totalCount, entityType) => {
  const key = totalCount > 1 ? "forceDeleteMessage_plural" : "forceDeleteMessage";
  return t(`${entityType}.delete.${key}`, { count: totalCount });
};

/**
 * Build validator messages for specific actions
 */
export const validators = {
  dossier: {
    add: {
      noClients: () => t("dossier.add.blocked.noClients"),
      noClientSelected: () => t("dossier.add.blocked.noClientSelected"),
    },
    close: {
      dossierNotFound: () => t("dossier.delete.blocked.dossierNotFound"),
    },
  },
  case: {
    add: {
      noDossiers: () => t("case.add.blocked.noDossiers"),
      dossierNotFound: () => t("case.add.blocked.dossierNotFound"),
      dossierClosed: (status, caseNumber, title) => [
        t("case.add.blocked.dossierClosed", { status: status.toLowerCase() }),
        t("case.add.blocked.dossierDetails", { caseNumber, title }),
        t("case.add.blocked.reopenRequired")
      ],
    },
    close: {
      caseNotFound: () => t("case.close.blocked.caseNotFound"),
    },
  },
  client: {
    archive: {
      clientNotFound: () => t("client.archive.blocked.clientNotFound"),
    },
  },
  accounting: {
    edit: {
      readOnly: () => t("accounting.edit.blocked.readOnly"),
    },
  },
  task: {
    add: {
      noDossiers: () => t("task.add.blocked.noDossiers"),
      parentClosed: (parentType, status, caseNumber, title) => [
        t(`task.add.blocked.${parentType}Closed`, { status: status.toLowerCase() }),
        t(`task.add.blocked.${parentType}Details`, { caseNumber, title }),
        t("task.add.blocked.reopenRequired", { parentType })
      ],
    },
    edit: {
      taskNotFound: () => t("task.edit.blocked.taskNotFound"),
      dossierClosed: (caseNumber, status) =>
        t("task.edit.blocked.dossierClosed", { caseNumber, status: status.toLowerCase() }),
      caseClosed: (caseNumber) =>
        t("task.edit.blocked.caseClosed", { caseNumber }),
    },
  },
  session: {
    add: {
      noDossiers: () => t("session.add.blocked.noDossiers"),
      parentClosed: (parentType, status, caseNumber, title) => [
        t(`session.add.blocked.${parentType}Closed`, { status: status.toLowerCase() }),
        t(`session.add.blocked.${parentType}Details`, { caseNumber, title }),
        t("session.add.blocked.reopenRequired", { parentType })
      ],
    },
    edit: {
      sessionNotFound: () => t("session.edit.blocked.sessionNotFound"),
      dossierClosed: (caseNumber, status) =>
        t("session.edit.blocked.dossierClosed", { caseNumber, status: status.toLowerCase() }),
      caseClosed: (caseNumber) =>
        t("session.edit.blocked.caseClosed", { caseNumber }),
    },
  },
  mission: {
    add: {
      dossierNotFound: () => t("mission.add.blocked.dossierNotFound"),
      caseNotFound: () => t("mission.add.blocked.caseNotFound"),
      parentClosed: (parentType, status, caseNumber, title) => [
        t(`mission.add.blocked.${parentType}Closed`, { status: status.toLowerCase() }),
        t(`mission.add.blocked.${parentType}Details`, { caseNumber, title }),
        t("mission.add.blocked.reopenRequired", { parentType })
      ],
    },
    edit: {
      missionNotFound: () => t("mission.edit.blocked.missionNotFound"),
      dossierClosed: (caseNumber, status) =>
        t("mission.edit.blocked.dossierClosed", { caseNumber, status: status.toLowerCase() }),
      caseClosed: (caseNumber) =>
        t("mission.edit.blocked.caseClosed", { caseNumber }),
    },
  },
  financialEntry: {
    add: {
      dossierClosed: (caseNumber, status) =>
        t("financialEntry.add.blocked.dossierClosed", { caseNumber, status: status.toLowerCase() }),
      caseClosed: (caseNumber) =>
        t("financialEntry.add.blocked.caseClosed", { caseNumber }),
    },
    edit: {
      entryNotFound: () => t("financialEntry.edit.blocked.entryNotFound"),
      entryPaid: () => t("financialEntry.edit.blocked.entryPaid"),
      dossierClosed: (caseNumber, status) =>
        t("financialEntry.edit.blocked.dossierClosed", { caseNumber, status: status.toLowerCase() }),
      caseClosed: (caseNumber) =>
        t("financialEntry.edit.blocked.caseClosed", { caseNumber }),
    },
    delete: {
      entryNotFound: () => t("financialEntry.delete.blocked.entryNotFound"),
      entryPaid: () => t("financialEntry.delete.blocked.entryPaid"),
    },
    changeStatus: {
      entryNotFound: () => t("financialEntry.changeStatus.blocked.entryNotFound"),
      alreadyPaid: () => t("financialEntry.changeStatus.blocked.alreadyPaid"),
    },
  },
  officer: {
    delete: {
      activeMissions: (count) =>
        t("officer.delete.blocked.activeMissions", { count }),
      financialEntries: (count) => {
        const key = count > 1 ? "financialEntries_plural" : "financialEntries";
        return t(`officer.delete.blocked.${key}`, { count });
      },
    },
  },
};
