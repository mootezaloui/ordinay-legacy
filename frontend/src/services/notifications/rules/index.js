import { TaskRules } from "./taskRules";
import { PersonalTaskRules } from "./personalTaskRules";
import { SessionRules } from "./sessionRules";
import { LawsuitRules } from "./lawsuitRules";
import { MissionRules } from "./missionRules";
import { FinancialRules } from "./financialRules";
import { DossierRules } from "./dossierRules";
import { ClientRules } from "./clientRules";
import { SystemRules } from "./systemRules";
import { entities, loadEntities } from "./shared/entityLoader";
import {
  wasNotificationRecentlySent,
  markNotificationSent,
  clearNotificationHistory,
} from "./shared/historyCache";

/**
 * Central Rule Registry
 * All rules organized by entity type
 */
export const RuleRegistry = {
  task: TaskRules,
  personalTask: PersonalTaskRules,
  session: SessionRules,
  lawsuit: LawsuitRules,
  mission: MissionRules,
  financial: FinancialRules,
  dossier: DossierRules,
  client: ClientRules,
  system: SystemRules,
};

/**
 * Execute all rules for a given entity
 * Returns array of notifications that should be triggered
 */
export function evaluateEntityRules(entityType, entity, context = {}) {
  loadEntities(context);
  const rules = RuleRegistry[entityType];
  if (!rules) return [];

  const notifications = [];

  // Execute each rule for this entity
  Object.keys(rules).forEach((ruleName) => {
    const rule = rules[ruleName];

    try {
      const result = rule(entity, context);

      if (result.shouldNotify) {
        // Check anti-spam: was this notification recently sent?
        const ruleId = `${entityType}_${ruleName}_${entity.id || "system"}`;
        if (!wasNotificationRecentlySent(ruleId, entity.id)) {
          notifications.push({
            ruleId,
            ruleName,
            entityType,
            entityId: entity.id,
            ...result,
          });
          // Mark as sent to prevent duplicates
          markNotificationSent(ruleId, entity.id);
        }
      }
    } catch (error) {
      console.error(
        `Error evaluating rule ${ruleName} for ${entityType}:`,
        error
      );
    }
  });

  return notifications;
}

/**
 * Evaluate all rules across all entities
 * This is called by the scheduler periodically
 */
export function evaluateAllRules(currentDate = new Date(), context = {}) {
  loadEntities(context);
  const allNotifications = [];

  const tasks = entities.tasks || [];
  const personalTasks = entities.personalTasks || [];
  const sessions = entities.sessions || [];
  const lawsuits = entities.lawsuits || [];
  const missions = entities.missions || [];
  const financialEntries = entities.financialEntries || [];
  const dossiers = entities.dossiers || [];
  const clients = entities.clients || [];

  // Evaluate task rules (overdue, upcoming deadlines)
  tasks.forEach((task) => {
    const taskNotifications = evaluateEntityRules("task", task, context);
    allNotifications.push(...taskNotifications);
  });

  // Evaluate personal task rules (upcoming deadlines, completion reminders)
  personalTasks.forEach((personalTask) => {
    const personalTaskNotifications = evaluateEntityRules(
      "personalTask",
      personalTask,
      context
    );
    allNotifications.push(...personalTaskNotifications);
  });

  // Evaluate session rules (upcoming hearings, hearing today)
  sessions.forEach((session) => {
    const sessionNotifications = evaluateEntityRules(
      "session",
      session,
      context
    );
    allNotifications.push(...sessionNotifications);
  });

  // Evaluate lawsuit/procès rules (missing hearings, status updates)
  lawsuits.forEach((lawsuitItem) => {
    const lawsuitNotifications = evaluateEntityRules("lawsuit", lawsuitItem, context);
    allNotifications.push(...lawsuitNotifications);
  });

  // Evaluate mission rules (upcoming deadlines, completion reminders)
  missions.forEach((mission) => {
    const missionNotifications = evaluateEntityRules(
      "mission",
      mission,
      context
    );
    allNotifications.push(...missionNotifications);
  });

  // Evaluate financial rules (upcoming payments, overdue payments)
  financialEntries.forEach((financialEntry) => {
    const financialNotifications = evaluateEntityRules(
      "financial",
      financialEntry,
      context
    );
    allNotifications.push(...financialNotifications);
  });

  // Evaluate dossier rules (inactivity, review, deadline)
  dossiers.forEach((dossier) => {
    const dossierNotifications = evaluateEntityRules(
      "dossier",
      dossier,
      context
    );
    allNotifications.push(...dossierNotifications);
  });

  // Evaluate client rules (60-day inactivity)
  clients.forEach((client) => {
    const clientNotifications = evaluateEntityRules("client", client, context);
    allNotifications.push(...clientNotifications);
  });

  return allNotifications;
}

const notificationRules = {
  TaskRules,
  PersonalTaskRules,
  SessionRules,
  LawsuitRules,
  MissionRules,
  FinancialRules,
  DossierRules,
  ClientRules,
  SystemRules,
  RuleRegistry,
  evaluateEntityRules,
  evaluateAllRules,
  markNotificationSent,
  clearNotificationHistory,
};

export default notificationRules;


