import { useSettings } from "../contexts/SettingsContext";
import { useTheme } from "../contexts/ThemeProvider";
import { updateNotificationPreferences } from "../utils/scheduledNotifications";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import { LANGUAGE_REGISTRY } from "../i18n/config";
import { useTranslation } from "react-i18next";

export default function Settings() {
  const { settings, notificationPrefs, updateSettings, updateNotificationPrefs } = useSettings();
  const { setThemePreference } = useTheme();
  const { t } = useTranslation("settings");

  const handleChange = (field, value) => {
    // Immediately save to context (which auto-persists to localStorage)
    updateSettings({ [field]: value });

    // Apply theme immediately if changed
    if (field === "theme") {
      setThemePreference(value);
    }

    // Reload page when language changes to re-initialize all static translations
    if (field === "language") {
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  const handleNotificationPrefChange = (category, field, value) => {
    // Immediately save to context
    const updatedPrefs = {
      ...notificationPrefs,
      [category]: {
        ...notificationPrefs[category],
        [field]: value
      }
    };

    updateNotificationPrefs(updatedPrefs);
    updateNotificationPreferences("default", updatedPrefs);
  };

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={t("page.subtitle")}
        icon="fas fa-cog"
      />

      <div className="space-y-6">
        {/* General Settings */}
        <ContentSection title={t("sections.general")}>
          <div className="p-6 space-y-6">
            {/* Language */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  {t("general.language.label")}
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t("general.language.description")}
                </p>
              </div>
              <select
                value={settings.language}
                onChange={(e) => handleChange("language", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LANGUAGE_REGISTRY.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Format */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  {t("general.dateFormat.label")}
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t("general.dateFormat.description")}
                </p>
              </div>
              <select
                value={settings.dateFormat}
                onChange={(e) => handleChange("dateFormat", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                <option value="MM-DD-YYYY">MM-DD-YYYY</option>
              </select>
            </div>
          </div>
        </ContentSection>

        {/* Notification Settings */}
        <ContentSection title={t("sections.notifications")}>
          <div className="p-6 space-y-4">
            {/* Desktop Notifications Toggle */}
            <div className="flex items-center justify-between py-3">
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
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.desktopNotifications ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
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

        {/* Date-Related Notification Preferences */}
        <ContentSection title={t("sections.appointments")}>
          <div className="p-6 space-y-6">
            {/* Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-tasks text-blue-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.tasks.title")}
                  </h3>
                </div>
                <button
                  onClick={() => handleNotificationPrefChange("tasks", "enabled", !notificationPrefs.tasks.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationPrefs.tasks.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.tasks.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {notificationPrefs.tasks.enabled && (
                <div className="ml-6 space-y-3 text-xs">
                  {/* Overdue Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.tasks.overdue.description")}
                    </p>
                  </div>

                  {/* Upcoming Deadline Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.tasks.upcoming.description", {
                        days: notificationPrefs.tasks.reminderDays.join(", "),
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Personal Tasks */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-user-check text-indigo-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.personalTasks.title")}
                  </h3>
                </div>
                <button
                  onClick={() => handleNotificationPrefChange("personalTasks", "enabled", !notificationPrefs.personalTasks.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationPrefs.personalTasks.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.personalTasks.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {notificationPrefs.personalTasks.enabled && (
                <div className="ml-6 space-y-3 text-xs">
                  {/* Upcoming Deadline Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.personalTasks.upcoming.description", {
                        days: notificationPrefs.personalTasks.reminderDays.join(", "),
                      })}
                    </p>
                  </div>

                  {/* Completion Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.personalTasks.completion.description")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sessions */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-gavel text-purple-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.sessions.title")}
                  </h3>
                </div>
                <button
                  onClick={() => handleNotificationPrefChange("sessions", "enabled", !notificationPrefs.sessions.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationPrefs.sessions.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.sessions.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {notificationPrefs.sessions.enabled && (
                <div className="ml-6 space-y-3 text-xs">
                  {/* Preparation Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 ml-5">
                      {t("appointments.sessions.preparation.description", {
                        days: notificationPrefs.sessions.reminderDays.join(", "),
                      })}
                    </p>
                  </div>

                  {/* Day-of Reminder */}
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
                    <p className="text-slate-500 dark:text-slate-400 ml-5">
                      {t("appointments.sessions.dayOf.description")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Cases/Procès - Note: Cases don't have their own notification preferences */}
            {/* Case notifications are controlled by parent dossier priority */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-balance-scale text-red-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.cases.title")}
                  </h3>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                  {t("appointments.cases.basedOnPriority")}
                </div>
              </div>
              <div className="ml-6 text-xs text-slate-600 dark:text-slate-400">
                <p className="mb-2">
                  <strong>{t("appointments.cases.automaticTitle")}</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>{t("appointments.cases.items.noSession")}</li>
                  <li>{t("appointments.cases.items.updateSuggestion")}</li>
                </ul>
                <p className="mt-2 text-slate-500 dark:text-slate-500 italic">
                  {t("appointments.cases.inherits")}
                </p>
              </div>
            </div>

            {/* Payments */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-dollar-sign text-green-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.payments.title")}
                  </h3>
                </div>
                <button
                  onClick={() => handleNotificationPrefChange("payments", "enabled", !notificationPrefs.payments.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationPrefs.payments.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.payments.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {notificationPrefs.payments.enabled && (
                <div className="ml-6 space-y-2 text-xs">
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
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    {t("appointments.payments.overdue.before", {
                      days: notificationPrefs.payments.reminderDays.join(", "),
                    })}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    {t("appointments.payments.overdue.frequency", {
                      days: notificationPrefs.payments.overdueReminderFrequency.join(", "),
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Missions */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-briefcase text-orange-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.missions.title")}
                  </h3>
                </div>
                <button
                  onClick={() => handleNotificationPrefChange("missions", "enabled", !notificationPrefs.missions.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationPrefs.missions.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.missions.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {notificationPrefs.missions.enabled && (
                <div className="ml-6 space-y-3 text-xs">
                  {/* Upcoming Deadline Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.missions.upcoming.description", {
                        days: notificationPrefs.missions.reminderDays.join(", "),
                      })}
                    </p>
                  </div>

                  {/* Completion Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.missions.completion.description")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Dossiers */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-folder-open text-amber-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.dossiers.title")}
                  </h3>
                </div>
                <button
                  onClick={() => handleNotificationPrefChange("dossiers", "enabled", !notificationPrefs.dossiers.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationPrefs.dossiers.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.dossiers.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {notificationPrefs.dossiers.enabled && (
                <div className="ml-6 space-y-3 text-xs">
                  {/* Inactivity Reminder */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.dossiers.inactivity.description", {
                        days: notificationPrefs.dossiers.inactivityDays,
                      })}
                    </p>
                  </div>

                  {/* Review Reminder */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
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

                  {/* Deadline Reminders */}
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
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      {t("appointments.dossiers.deadline.description")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Clients */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-users text-purple-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("appointments.clients.title")}
                  </h3>
                </div>
                <button
                  onClick={() => handleNotificationPrefChange("clients", "enabled", !notificationPrefs.clients.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationPrefs.clients.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationPrefs.clients.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {notificationPrefs.clients.enabled && (
                <div className="ml-6 space-y-2 text-xs">
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
                  <p className="text-slate-500 dark:text-slate-400 pl-6">
                    {t("appointments.clients.inactivity.description", {
                      days: notificationPrefs.clients.inactivityDays,
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </ContentSection>

        {/* Account & Security (desktop honest messaging + future SaaS placeholders) */}
        <ContentSection title={t("sections.accountSecurity")}>
          <div className="p-6 space-y-6">
            {/* Current desktop reality */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("security.current.title")}
              </h3>
              <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <i className="fas fa-desktop text-blue-500 mt-0.5"></i>
                  <span>{t("security.current.localOperator")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fas fa-globe text-slate-500 mt-0.5"></i>
                  <span>{t("security.current.noOnlineAuth")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fas fa-user-shield text-emerald-600 mt-0.5"></i>
                  <span>{t("security.current.osControlled")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fas fa-database text-amber-600 mt-0.5"></i>
                  <span>{t("security.current.localData")}</span>
                </li>
              </ul>
            </div>

            {/* Future SaaS features, disabled for now */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("security.comingSoon.title")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("security.comingSoon.caption")}
              </p>
              <div className="space-y-3">
                {[
                  "twoFactor",
                  "sessionTimeout",
                  "changePassword",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-800/40 opacity-60 cursor-not-allowed"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {t(`security.comingSoon.items.${item}.label`)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t(`security.comingSoon.items.${item}.description`)}
                      </p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {t("security.comingSoon.badge")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ContentSection>

        {/* Appearance Settings */}
        <ContentSection title={t("sections.appearance")}>
          <div className="p-6 space-y-6">
            {/* Theme */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  {t("appearance.theme.label")}
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t("appearance.theme.description")}
                </p>
              </div>
              <select
                value={settings.theme}
                onChange={(e) => handleChange("theme", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">{t("appearance.theme.options.light")}</option>
                <option value="dark">{t("appearance.theme.options.dark")}</option>
                <option value="system">{t("appearance.theme.options.system")}</option>
              </select>
            </div>
          </div>
        </ContentSection>
      </div>
    </PageLayout>
  );
}
