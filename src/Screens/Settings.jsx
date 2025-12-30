import { useSettings } from "../contexts/SettingsContext";
import { useTheme } from "../contexts/ThemeProvider";
import { updateNotificationPreferences } from "../utils/scheduledNotifications";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";

export default function Settings() {
  const { settings, notificationPrefs, updateSettings, updateNotificationPrefs } = useSettings();
  const { setThemePreference } = useTheme();

  const handleChange = (field, value) => {
    // Immediately save to context (which auto-persists to localStorage)
    updateSettings({ [field]: value });

    // Apply theme immediately if changed
    if (field === "theme") {
      setThemePreference(value);
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
        title="Settings"
        subtitle="Configure your application preferences"
        icon="fas fa-cog"
      />

      <div className="space-y-6">
        {/* General Settings */}
        <ContentSection title="Paramètres généraux">
          <div className="p-6 space-y-6">
            {/* Language */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Language
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Choose the interface language
                </p>
              </div>
              <select
                value={settings.language}
                onChange={(e) => handleChange("language", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>

            {/* Date Format */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Date Format
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  How to display dates
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
        <ContentSection title="Notifications">
          <div className="p-6 space-y-4">
            {/* Desktop Notifications Toggle */}
            <div className="flex items-center justify-between py-3">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Enable Notifications
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Show notifications within the app
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
        <ContentSection title="Rappels Automatiques">
          <div className="p-6 space-y-6">
            {/* Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-tasks text-blue-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tasks</h3>
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
                      <span className="text-slate-700 dark:text-slate-300">Reminders for overdue tasks</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Daily notification for overdue tasks (up to 3 days).
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
                        Upcoming deadline reminders
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Reminders: {notificationPrefs.tasks.reminderDays.join(", ")} days before the deadline.
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Personal Tasks</h3>
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
                        Upcoming deadline reminders
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Reminders: {notificationPrefs.personalTasks.reminderDays.join(", ")} days before the deadline.
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
                      <span className="text-slate-700 dark:text-slate-300">Completion reminders after deadline</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Asks if the task was completed after the deadline.
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Audiences</h3>
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
                      <span className="text-slate-700 dark:text-slate-300 font-medium">Preparation reminders</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 ml-5">
                      Reminders for upcoming sessions: {notificationPrefs.sessions.reminderDays.join(", ")} days before the session.
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
                      <span className="text-slate-700 dark:text-slate-300 font-medium">Day-of reminder</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 ml-5">
                      Critical notification on the day of the session to prevent any oversight.
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Lawsuits</h3>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Based on parent case priority
                </div>
              </div>
              <div className="ml-6 text-xs text-slate-600 dark:text-slate-400">
                <p className="mb-2">
                  <strong>Automatic notifications:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Reminder if no session scheduled (frequency based on parent case priority)</li>
                  <li>Update suggestion after sessions/tasks completed</li>
                </ul>
                <p className="mt-2 text-slate-500 dark:text-slate-500 italic">
                  Lawsuits inherit the priority of their parent case to determine the frequency of reminders.
                </p>
              </div>
            </div>

            {/* Payments */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-dollar-sign text-green-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Payments</h3>
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
                    <span className="text-slate-700 dark:text-slate-300">Overdue payment reminders</span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    Reminders before: {notificationPrefs.payments.reminderDays.join(", ")} days
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    Overdue reminders: {notificationPrefs.payments.overdueReminderFrequency.join(", ")} days
                  </p>
                </div>
              )}
            </div>

            {/* Missions */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-briefcase text-orange-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Missions</h3>
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
                        Reminders before mission deadlines
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Reminders: {notificationPrefs.missions.reminderDays.join(", ")} days before the deadline.
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
                      <span className="text-slate-700 dark:text-slate-300">VVerification after deadline</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Request if the bailiff has completed the mission after the deadline.
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Dossiers</h3>
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
                        Inactivity reminder ({notificationPrefs.dossiers.inactivityDays} days)
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Notification if the case has not been updated for {notificationPrefs.dossiers.inactivityDays} days.
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
                        Review reminder (based on priority)
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      High priority: every {notificationPrefs.dossiers.reviewIntervalHigh} days
                      <br />
                      Medium priority: every {notificationPrefs.dossiers.reviewIntervalMedium} days
                      <br />
                      Low priority: every {notificationPrefs.dossiers.reviewIntervalLow} days
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
                        Next deadline (next_deadline)
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Reminders for deadlines: 7 days before, 3 days before, on the day, and in case of delay.
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Clients</h3>
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
                      Inactivity reminder ({notificationPrefs.clients.inactivityDays} days without activity)
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-6">
                    Notification if the client has had no activity (cases, tasks, sessions, payments) for {notificationPrefs.clients.inactivityDays} days.
                  </p>
                </div>
              )}
            </div>
          </div>
        </ContentSection>

        {/* Security Settings */}
        <ContentSection title="Sécurité">
          <div className="p-6 space-y-6">
            {/* Two Factor Auth */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Two-Factor Authentication
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enhanced security for your account
                </p>
              </div>
              <button
                onClick={() => handleChange("twoFactorAuth", !settings.twoFactorAuth)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.twoFactorAuth ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.twoFactorAuth ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>

            {/* Session Timeout */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Session Timeout
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Automatic logout after inactivity
                </p>
              </div>
              <select
                value={settings.sessionTimeout}
                onChange={(e) => handleChange("sessionTimeout", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
              </select>
            </div>

            {/* Change Password Button */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <button className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium transition-colors duration-200">
                <i className="fas fa-key mr-2"></i>
                Change Password
              </button>
            </div>
          </div>
        </ContentSection>

        {/* Appearance Settings */}
        <ContentSection title="Apparence">
          <div className="p-6 space-y-6">
            {/* Theme */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Theme
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Choose the app's theme
                </p>
              </div>
              <select
                value={settings.theme}
                onChange={(e) => handleChange("theme", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </ContentSection>
      </div>
    </PageLayout>
  );
}
