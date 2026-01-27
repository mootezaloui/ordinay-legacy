import { useSettings } from "../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import ContentSection from "../layout/ContentSection";
import { updateNotificationPreferences } from "../../utils/scheduledNotifications";

export default function SettingsNotifications() {
  const { settings, notificationPrefs, updateSettings, updateNotificationPrefs } = useSettings();
  const { t } = useTranslation(["settings"]);

  const handleChange = (field, value) => {
    updateSettings({ [field]: value });
  };

  const handleNotificationPrefChange = (category, field, value) => {
    const updatedPrefs = {
      ...notificationPrefs,
      [category]: {
        ...notificationPrefs[category],
        [field]: value,
      },
    };

    updateNotificationPrefs(updatedPrefs);
    updateNotificationPreferences("default", updatedPrefs);
  };

  return (
    <div className="space-y-6">
      <ContentSection title={t("sections.notifications")}>
        <div className="p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-3">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                {t("notifications.desktop.title")}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t("notifications.desktop.description")}
              </p>
            </div>
            <button
              onClick={() => handleChange("desktopNotifications", !settings.desktopNotifications)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${settings.desktopNotifications ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.desktopNotifications ? "translate-x-6" : "translate-x-1"
                  }`}
              />
            </button>
          </div>
        </div>
      </ContentSection>

      <ContentSection title={t("sections.clientEmails", "Client Email Notifications")}>
        <div className="p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-3">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                {t("clientEmails.enabled.title", "Client Email Prompts")}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t("clientEmails.enabled.description", "Show a prompt to notify clients via email after relevant actions")}
              </p>
            </div>
            <button
              onClick={() => handleNotificationPrefChange("clientEmails", "enabled", !notificationPrefs.clientEmails?.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${
                notificationPrefs.clientEmails?.enabled !== false ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notificationPrefs.clientEmails?.enabled !== false ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {notificationPrefs.clientEmails?.enabled !== false && (
            <div className="ml-0 md:ml-6 space-y-3 text-xs border-t border-slate-200 dark:border-slate-700 pt-4">
              <p className="text-slate-500 dark:text-slate-400 mb-3">
                {t("clientEmails.categoriesDescription", "Choose which events can trigger client email prompts:")}
              </p>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificationPrefs.clientEmails?.dossiers !== false}
                  onChange={(e) => handleNotificationPrefChange("clientEmails", "dossiers", e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  {t("clientEmails.categories.dossiers", "Dossier updates (status changes, deadlines)")}
                </span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificationPrefs.clientEmails?.lawsuits !== false}
                  onChange={(e) => handleNotificationPrefChange("clientEmails", "lawsuits", e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  {t("clientEmails.categories.lawsuits", "Lawsuit updates (status, hearing dates)")}
                </span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificationPrefs.clientEmails?.sessions !== false}
                  onChange={(e) => handleNotificationPrefChange("clientEmails", "sessions", e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  {t("clientEmails.categories.sessions", "Hearing scheduling and changes")}
                </span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificationPrefs.clientEmails?.financial !== false}
                  onChange={(e) => handleNotificationPrefChange("clientEmails", "financial", e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  {t("clientEmails.categories.financial", "Financial entries")}
                </span>
              </label>
            </div>
          )}
        </div>
      </ContentSection>

      <ContentSection title={t("sections.appointments")}>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-tasks text-blue-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.tasks.title")}
                </h3>
              </div>
              <button
                onClick={() => handleNotificationPrefChange("tasks", "enabled", !notificationPrefs.tasks.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${notificationPrefs.tasks.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.tasks.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {notificationPrefs.tasks.enabled && (
              <div className="ml-0 md:ml-6 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.tasks.overdueReminders}
                      onChange={(e) => handleNotificationPrefChange("tasks", "overdueReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.tasks.overdue.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.tasks.overdue.description")}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.tasks.upcomingReminders}
                      onChange={(e) => handleNotificationPrefChange("tasks", "upcomingReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.tasks.upcoming.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.tasks.upcoming.description", {
                      days: notificationPrefs.tasks.reminderDays.join(", "),
                    })}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-user-check text-indigo-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.personalTasks.title")}
                </h3>
              </div>
              <button
                onClick={() => handleNotificationPrefChange("personalTasks", "enabled", !notificationPrefs.personalTasks.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${notificationPrefs.personalTasks.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.personalTasks.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {notificationPrefs.personalTasks.enabled && (
              <div className="ml-0 md:ml-6 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.personalTasks.upcomingReminders}
                      onChange={(e) => handleNotificationPrefChange("personalTasks", "upcomingReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.personalTasks.upcoming.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.personalTasks.upcoming.description", {
                      days: notificationPrefs.personalTasks.reminderDays.join(", "),
                    })}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.personalTasks.completionReminders}
                      onChange={(e) => handleNotificationPrefChange("personalTasks", "completionReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.personalTasks.completion.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.personalTasks.completion.description")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-gavel text-purple-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.sessions.title")}
                </h3>
              </div>
              <button
                onClick={() => handleNotificationPrefChange("sessions", "enabled", !notificationPrefs.sessions.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${notificationPrefs.sessions.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.sessions.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {notificationPrefs.sessions.enabled && (
              <div className="ml-0 md:ml-6 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.sessions.preparationReminders}
                      onChange={(e) => handleNotificationPrefChange("sessions", "preparationReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {t("appointments.sessions.preparation.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 ml-0 md:ml-5">
                    {t("appointments.sessions.preparation.description", {
                      days: notificationPrefs.sessions.reminderDays.join(", "),
                    })}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.sessions.dayOfReminder}
                      onChange={(e) => handleNotificationPrefChange("sessions", "dayOfReminder", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {t("appointments.sessions.dayOf.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 ml-0 md:ml-5">
                    {t("appointments.sessions.dayOf.description")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-balance-scale text-red-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.lawsuits.title")}
                </h3>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                {t("appointments.lawsuits.basedOnPriority")}
              </div>
            </div>
            <div className="ml-0 md:ml-6 text-xs text-slate-600 dark:text-slate-400">
              <p className="mb-2">
                <strong>{t("appointments.lawsuits.automaticTitle")}</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>{t("appointments.lawsuits.items.noSession")}</li>
                <li>{t("appointments.lawsuits.items.updateSuggestion")}</li>
              </ul>
              <p className="mt-2 text-slate-500 dark:text-slate-500 italic">
                {t("appointments.lawsuits.inherits")}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-dollar-sign text-green-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.payments.title")}
                </h3>
              </div>
              <button
                onClick={() => handleNotificationPrefChange("payments", "enabled", !notificationPrefs.payments.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${notificationPrefs.payments.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.payments.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {notificationPrefs.payments.enabled && (
              <div className="ml-0 md:ml-6 space-y-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notificationPrefs.payments.overdueReminders}
                    onChange={(e) => handleNotificationPrefChange("payments", "overdueReminders", e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {t("appointments.payments.overdue.label")}
                  </span>
                </label>
                <p className="text-slate-500 dark:text-slate-400 ml-0 md:ml-5">
                  {t("appointments.payments.overdue.before", {
                    days: notificationPrefs.payments.reminderDays.join(", "),
                  })}
                </p>
                <p className="text-slate-500 dark:text-slate-400 ml-0 md:ml-5">
                  {t("appointments.payments.overdue.frequency", {
                    days: notificationPrefs.payments.overdueReminderFrequency.join(", "),
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-briefcase text-orange-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.missions.title")}
                </h3>
              </div>
              <button
                onClick={() => handleNotificationPrefChange("missions", "enabled", !notificationPrefs.missions.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${notificationPrefs.missions.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.missions.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {notificationPrefs.missions.enabled && (
              <div className="ml-0 md:ml-6 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.missions.upcomingReminders}
                      onChange={(e) => handleNotificationPrefChange("missions", "upcomingReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.missions.upcoming.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.missions.upcoming.description", {
                      days: notificationPrefs.missions.reminderDays.join(", "),
                    })}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.missions.completionReminders}
                      onChange={(e) => handleNotificationPrefChange("missions", "completionReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.missions.completion.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.missions.completion.description")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-folder-open text-amber-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.dossiers.title")}
                </h3>
              </div>
              <button
                onClick={() => handleNotificationPrefChange("dossiers", "enabled", !notificationPrefs.dossiers.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${notificationPrefs.dossiers.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.dossiers.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {notificationPrefs.dossiers.enabled && (
              <div className="ml-0 md:ml-6 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.dossiers.inactivityReminder}
                      onChange={(e) => handleNotificationPrefChange("dossiers", "inactivityReminder", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.dossiers.inactivity.label", {
                        days: notificationPrefs.dossiers.inactivityDays,
                      })}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.dossiers.inactivity.description", {
                      days: notificationPrefs.dossiers.inactivityDays,
                    })}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.dossiers.reviewReminder}
                      onChange={(e) => handleNotificationPrefChange("dossiers", "reviewReminder", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.dossiers.review.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.dossiers.review.high", {
                      days: notificationPrefs.dossiers.reviewIntervalHigh,
                    })}
                    <br />
                    {t("appointments.dossiers.review.medium", {
                      days: notificationPrefs.dossiers.reviewIntervalMedium,
                    })}
                    <br />
                    {t("appointments.dossiers.review.low", {
                      days: notificationPrefs.dossiers.reviewIntervalLow,
                    })}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.dossiers.deadlineReminders}
                      onChange={(e) => handleNotificationPrefChange("dossiers", "deadlineReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {t("appointments.dossiers.deadline.label")}
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                    {t("appointments.dossiers.deadline.description")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-users text-purple-600"></i>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("appointments.clients.title")}
                </h3>
              </div>
              <button
                onClick={() => handleNotificationPrefChange("clients", "enabled", !notificationPrefs.clients.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors self-start md:self-auto ${notificationPrefs.clients.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.clients.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {notificationPrefs.clients.enabled && (
              <div className="ml-0 md:ml-6 space-y-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notificationPrefs.clients.inactivityReminder}
                    onChange={(e) => handleNotificationPrefChange("clients", "inactivityReminder", e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {t("appointments.clients.inactivity.label", {
                      days: notificationPrefs.clients.inactivityDays,
                    })}
                  </span>
                </label>
                <p className="text-slate-500 dark:text-slate-400 pl-0 md:pl-6">
                  {t("appointments.clients.inactivity.description", {
                    days: notificationPrefs.clients.inactivityDays,
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </ContentSection>
    </div>
  );
}
