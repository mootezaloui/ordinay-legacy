/**
 * Predicate functions for notification type detection
 * Used by NotificationCenter to determine which quick actions to show
 */

/**
 * Check if notification is a client inactivity notification
 */
export function isClientInactiveNotification(notification) {
  return (
    notification?.entityType === "client" &&
    (notification?.subType === "inActiveClient" ||
      notification?.template_key === "content.client.inActive")
  );
}

/**
 * Check if notification is a dossier inactivity notification
 */
export function isDossierInactiveNotification(notification) {
  return (
    notification?.entityType === "dossier" &&
    (notification?.subType === "inactivityReminder" ||
      notification?.template_key === "content.dossier.inactivityReminder")
  );
}

/**
 * Check if notification is a hearing/session notification
 */
export function isHearingNotification(notification) {
  return (
    notification?.entityType === "session" &&
    (
      [
        "upcomingHearing",
        "participantReminder",
        "hearingToday",
        "today",
        "tomorrow",
        "preparation",
      ].includes(notification?.subType) ||
      [
        "content.session.upcomingHearing",
        "content.session.participantReminder",
        "content.session.hearingToday",
        "content.session.today",
        "content.session.todayNoTime",
        "content.session.tomorrow",
        "content.session.preparation",
      ].includes(notification?.template_key)
    )
  );
}

/**
 * Check if notification is a participant reminder notification
 */
export function isParticipantReminderNotification(notification) {
  return (
    notification?.entityType === "session" &&
    (notification?.subType === "participantReminder" ||
      notification?.template_key === "content.session.participantReminder")
  );
}

/**
 * Check if notification is a task deadline notification
 */
export function isTaskDeadlineNotification(notification) {
  return (
    notification?.entityType === "task" &&
    (
      [
        "overdue",
        "dueToday",
        "upcoming",
        "upcomingDeadline",
        "statusCheck",
      ].includes(notification?.subType) ||
      [
        "content.task.overdue",
        "content.task.dueToday",
        "content.task.upcomingDeadline",
        "content.task.statusCheck",
      ].includes(notification?.template_key)
    )
  );
}

/**
 * Check if notification is a mission notification
 */
export function isMissionNotification(notification) {
  return (
    notification?.entityType === "mission" &&
    (
      [
        "upcomingDeadline",
        "completionReminder",
        "dueToday",
        "upcoming",
        "completion",
      ].includes(notification?.subType) ||
      [
        "content.mission.upcomingDeadline",
        "content.mission.completionReminder",
        "content.mission.dueToday",
        "content.mission.upcoming",
        "content.mission.completion",
      ].includes(notification?.template_key)
    )
  );
}

/**
 * Check if notification is a financial entry notification
 */
export function isFinancialNotification(notification) {
  return (
    (
      notification?.entityType === "financial_entry" ||
      notification?.entityType === "financialEntry" ||
      notification?.type === "financial" ||
      notification?.type === "payment" ||
      notification?.type === "financialEntry"
    ) &&
    (
      [
        "upcomingPayment",
        "overduePayment",
        "paymentDue",
        "paymentDueToday",
        "paymentOverdue",
        "paymentReceivable",
        "followupRequired",
      ].includes(notification?.subType) ||
      [
        "content.financial.upcomingPayment",
        "content.financial.overduePayment",
        "content.financial.paymentDue",
        "content.financial.paymentDueToday",
        "content.financial.paymentOverdue",
        "content.financial.paymentReceivable",
        "content.financial.followupRequired",
      ].includes(notification?.template_key)
    )
  );
}

/**
 * Check if financial notification is for receivables (income/revenue)
 */
export function isReceivableFinancialNotification(notification) {
  const entryType =
    notification?.params?.entryType ||
    notification?.params?.entry_type ||
    notification?.params?.type ||
    "";
  const normalized = entryType.toString().trim().toLowerCase();
  return normalized === "income" || normalized === "revenue";
}

/**
 * Normalize status string for comparison
 */
export function normalizeStatus(status) {
  return (status || "").toString().trim().toLowerCase();
}

/**
 * Check if task status indicates done/completed
 */
export function isTaskDoneStatus(status) {
  return ["done", "completed", "terminee", "termine", "terminée"].includes(
    normalizeStatus(status)
  );
}

/**
 * Check if task status indicates cancelled
 */
export function isTaskCancelledStatus(status) {
  return ["cancelled", "canceled", "annule", "annulee", "annulée"].includes(
    normalizeStatus(status)
  );
}

/**
 * Check if session status indicates completed
 */
export function isSessionCompletedStatus(status) {
  return ["completed", "terminee", "termine", "terminée"].includes(
    normalizeStatus(status)
  );
}

/**
 * Check if session status indicates cancelled
 */
export function isSessionCancelledStatus(status) {
  return ["cancelled", "canceled", "annule", "annulee", "annulée"].includes(
    normalizeStatus(status)
  );
}


/**
 * Check if mission status indicates completed
 */
export function isMissionCompletedStatus(status) {
  return ["completed", "done", "terminee", "termine", "terminＦ"].includes(
    normalizeStatus(status)
  );
}

/**
 * Check if mission status indicates cancelled
 */
export function isMissionCancelledStatus(status) {
  return ["cancelled", "canceled", "annule", "annulee", "annulＦ"].includes(
    normalizeStatus(status)
  );
}





