/**
 * Domain Rules Internationalization Helper
 *
 * Provides centralized i18n message building for domain rules.
 * All user-facing messages from domain rules are translated here.
 */

import { i18nInstance } from "../i18n";
import { formatCurrency } from "../utils/currency";

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

  return (
    t(`dossier.close.blocked.${key}`, { count }) +
    incompleteTasks
      .slice(0, 3)
      .map((t) => `\n  • ${t.title} (${t.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` +
        t(`dossier.close.blocked.andMore${count - 3 > 1 ? "_plural" : ""}`, {
          count: count - 3,
        })
      : "")
  );
};

/**
 * Build blocker message for open lawsuits
 */
export const buildCasesBlocker = (openCases, entityType = "dossier") => {
  const count = openCases.length;
  const key = count > 1 ? "lawsuitsOpen_plural" : "lawsuitsOpen";

  return (
    t(`${entityType}.close.blocked.${key}`, { count }) +
    openCases
      .slice(0, 3)
      .map((c) => `\n  • ${c.lawsuitNumber} - ${c.title} (${c.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` +
        t(
          `${entityType}.close.blocked.andMore${
            count - 3 > 1 ? "_plural" : ""
          }`,
          { count: count - 3 }
        )
      : "")
  );
};

/**
 * Build blocker message for open dossiers
 */
export const buildDossiersBlocker = (openDossiers) => {
  const count = openDossiers.length;
  const key = count > 1 ? "dossiersOpen_plural" : "dossiersOpen";

  return (
    t(`client.archive.blocked.${key}`, { count }) +
    openDossiers
      .slice(0, 3)
      .map((d) => `\n  • ${d.lawsuitNumber} - ${d.title} (${d.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` +
        t(`client.archive.blocked.andMore${count - 3 > 1 ? "_plural" : ""}`, {
          count: count - 3,
        })
      : "")
  );
};

/**
 * Build blocker message for open sessions
 */
export const buildSessionsBlocker = (openSessions, entityType = "dossier") => {
  const count = openSessions.length;
  const key = count > 1 ? "sessionsOpen_plural" : "sessionsOpen";

  return (
    t(`${entityType}.close.blocked.${key}`, { count }) +
    openSessions
      .slice(0, 3)
      .map((s) => `\n  - ${s.type || "Hearing"} on ${s.date} (${s.status})`)
      .join("") +
    (count > 3
      ? `\n  - ` +
        t(
          `${entityType}.close.blocked.andMore${
            count - 3 > 1 ? "_plural" : ""
          }`,
          { count: count - 3 }
        )
      : "")
  );
};

/**
 * Build blocker message for active missions
 */
export const buildMissionsBlocker = (
  activeMissions,
  entityType = "dossier"
) => {
  const count = activeMissions.length;
  const key = count > 1 ? "missionsActive_plural" : "missionsActive";

  return (
    t(`${entityType}.close.blocked.${key}`, { count }) +
    activeMissions
      .slice(0, 3)
      .map((m) => `\n  • ${m.missionNumber} - ${m.title} (${m.status})`)
      .join("") +
    (count > 3
      ? `\n  • ` +
        t(
          `${entityType}.close.blocked.andMore${
            count - 3 > 1 ? "_plural" : ""
          }`,
          { count: count - 3 }
        )
      : "")
  );
};

/**
 * Build blocker message for unpaid balance
 */
export const buildUnpaidBalanceBlocker = (balance) => {
  return t("dossier.close.blocked.unpaidBalance", {
    amount: formatCurrency(Math.abs(balance)),
  });
};

/**
 * Build impact summary for relational changes
 */
export const buildImpactSummary = (changes, entityType) => {
  const impactSummary = [];

  changes.forEach((change) => {
    const changeKey =
      change.type === "reference_change"
        ? "reference"
        : change.type === "client_reassignment"
        ? "client"
        : change.type === "dossier_reassignment"
        ? "dossier"
        : change.type === "officer_reassignment"
        ? "officer"
        : change.type === "parent_reassignment"
        ? "parent"
        : change.type === "session_parent_reassignment"
        ? "parent"
        : "parent";

    const from =
      change.from ||
      t(`${entityType}.impact.${changeKey}.unknown`) ||
      "Not defined";
    const to =
      change.to ||
      t(`${entityType}.impact.${changeKey}.unknown`) ||
      "Not defined";

    impactSummary.push(
      t(`${entityType}.impact.${changeKey}.current`, { value: from })
    );
    impactSummary.push(
      t(`${entityType}.impact.${changeKey}.new`, { value: to })
    );
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
  const typeKeyMap = {
    financialEntries: "financials",
  };

  affectedEntities.forEach((entity) => {
    const count = entity.count;
    const type = entity.type;
    const translationType = typeKeyMap[type] || type;
    const key =
      count > 1
        ? `${translationType}WillDelete_plural`
        : `${translationType}WillDelete`;
    warnings.push(t(`${entityType}.delete.warning.${key}`, { count }));
  });

  return warnings;
};

/**
 * Build force delete message
 */
export const buildForceDeleteMessage = (totalCount, entityType) => {
  const key =
    totalCount > 1 ? "forceDeleteMessage_plural" : "forceDeleteMessage";
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
  lawsuit: {
    add: {
      noDossiers: () => t("lawsuit.add.blocked.noDossiers"),
      dossierNotFound: () => t("lawsuit.add.blocked.dossierNotFound"),
      dossierClosed: (status, lawsuitNumber, title) => [
        t("lawsuit.add.blocked.dossierClosed", { status: status.toLowerCase() }),
        t("lawsuit.add.blocked.dossierDetails", { lawsuitNumber, title }),
        t("lawsuit.add.blocked.reopenRequired"),
      ],
    },
    close: {
      lawsuitNotFound: () => t("lawsuit.close.blocked.lawsuitNotFound"),
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
      parentClosed: (parentType, status, lawsuitNumber, title) => [
        t(`task.add.blocked.${parentType}Closed`, {
          status: status.toLowerCase(),
        }),
        t(`task.add.blocked.${parentType}Details`, { lawsuitNumber, title }),
        t("task.add.blocked.reopenRequired", { parentType }),
      ],
    },
    edit: {
      taskNotFound: () => t("task.edit.blocked.taskNotFound"),
      dossierClosed: (lawsuitNumber, status) =>
        t("task.edit.blocked.dossierClosed", {
          lawsuitNumber,
          status: status.toLowerCase(),
        }),
      lawsuitClosed: (lawsuitNumber) =>
        t("task.edit.blocked.lawsuitClosed", { lawsuitNumber }),
    },
  },
  session: {
    add: {
      noDossiers: () => t("session.add.blocked.noDossiers"),
      parentClosed: (parentType, status, lawsuitNumber, title) => [
        t(`session.add.blocked.${parentType}Closed`, {
          status: status.toLowerCase(),
        }),
        t(`session.add.blocked.${parentType}Details`, { lawsuitNumber, title }),
        t("session.add.blocked.reopenRequired", { parentType }),
      ],
    },
    edit: {
      sessionNotFound: () => t("session.edit.blocked.sessionNotFound"),
      dossierClosed: (lawsuitNumber, status) =>
        t("session.edit.blocked.dossierClosed", {
          lawsuitNumber,
          status: status.toLowerCase(),
        }),
      lawsuitClosed: (lawsuitNumber) =>
        t("session.edit.blocked.lawsuitClosed", { lawsuitNumber }),
    },
  },
  mission: {
    add: {
      dossierNotFound: () => t("mission.add.blocked.dossierNotFound"),
      lawsuitNotFound: () => t("mission.add.blocked.lawsuitNotFound"),
      parentClosed: (parentType, status, lawsuitNumber, title) => [
        t(`mission.add.blocked.${parentType}Closed`, {
          status: status.toLowerCase(),
        }),
        t(`mission.add.blocked.${parentType}Details`, { lawsuitNumber, title }),
        t("mission.add.blocked.reopenRequired", { parentType }),
      ],
    },
    edit: {
      missionNotFound: () => t("mission.edit.blocked.missionNotFound"),
      dossierClosed: (lawsuitNumber, status) =>
        t("mission.edit.blocked.dossierClosed", {
          lawsuitNumber,
          status: status.toLowerCase(),
        }),
      lawsuitClosed: (lawsuitNumber) =>
        t("mission.edit.blocked.lawsuitClosed", { lawsuitNumber }),
    },
  },
  financialEntry: {
    add: {
      dossierClosed: (lawsuitNumber, status) =>
        t("financialEntry.add.blocked.dossierClosed", {
          lawsuitNumber,
          status: status.toLowerCase(),
        }),
      lawsuitClosed: (lawsuitNumber) =>
        t("financialEntry.add.blocked.lawsuitClosed", { lawsuitNumber }),
    },
    edit: {
      entryNotFound: () => t("financialEntry.edit.blocked.entryNotFound"),
      dossierClosed: (lawsuitNumber, status) =>
        t("financialEntry.edit.blocked.dossierClosed", {
          lawsuitNumber,
          status: status.toLowerCase(),
        }),
      lawsuitClosed: (lawsuitNumber) =>
        t("financialEntry.edit.blocked.lawsuitClosed", { lawsuitNumber }),
    },
    warning: {
      entryPaid: () => t("financialEntry.edit.warning.entryPaid"),
    },
    delete: {
      entryNotFound: () => t("financialEntry.delete.blocked.entryNotFound"),
    },
    warning: {
      entryPaid: () => t("financialEntry.delete.warning.entryPaid"),
    },
    changeStatus: {
      entryNotFound: () =>
        t("financialEntry.changeStatus.blocked.entryNotFound"),
      alreadyPaid: () => t("financialEntry.changeStatus.warning.alreadyPaid"),
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


