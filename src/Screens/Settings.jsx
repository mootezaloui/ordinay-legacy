import { useEffect, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { useSettings } from "../contexts/SettingsContext";
import { useTheme } from "../contexts/ThemeProvider";
import { updateNotificationPreferences } from "../utils/scheduledNotifications";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";

export default function Settings() {
  const { showToast } = useToast();
  const { settings: savedSettings, notificationPrefs: savedNotificationPrefs, updateSettings, updateNotificationPrefs } = useSettings();
  const { setThemePreference } = useTheme();

  const [settings, setSettings] = useState(savedSettings);
  const [notificationPrefs, setNotificationPrefs] = useState(savedNotificationPrefs);

  useEffect(() => {
    setSettings(savedSettings);
  }, [savedSettings]);

  useEffect(() => {
    setNotificationPrefs(savedNotificationPrefs);
  }, [savedNotificationPrefs]);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleNotificationPrefChange = (category, field, value) => {
    setNotificationPrefs(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const handleCancel = () => {
    setSettings(savedSettings);
    setNotificationPrefs(savedNotificationPrefs);
  };

  const handleSave = () => {
    updateSettings(settings);
    updateNotificationPrefs(notificationPrefs);
    updateNotificationPreferences("default", notificationPrefs);
    setThemePreference(settings.theme);
    showToast("Paramètres enregistrés avec succès!", "success");
  };

  return (
    <PageLayout>
      <PageHeader
        title="Paramètres"
        subtitle="Configurer les préférences de votre application"
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
                  Langue
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Choisissez la langue de l'interface
                </p>
              </div>
              <select
                value={settings.language}
                onChange={(e) => handleChange("language", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fr">Français</option>
                <option value="ar">Arabe</option>
                <option value="en">English</option>
              </select>
            </div>

            {/* Date Format */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Format de date
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Comment afficher les dates
                </p>
              </div>
              <select
                value={settings.dateFormat}
                onChange={(e) => handleChange("dateFormat", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
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
                  Activer les notifications
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Afficher les notifications dans l'application
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tâches</h3>
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
                      <span className="text-slate-700 dark:text-slate-300">Rappels pour tâches en retard</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Notification quotidienne pour les tâches en retard (jusqu'à 3 jours).
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
                        Rappels avant échéance
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Rappels: {notificationPrefs.tasks.reminderDays.join(", ")} jours avant l'échéance.
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tâches Personnelles</h3>
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
                        Rappels avant échéance
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Rappels: {notificationPrefs.personalTasks.reminderDays.join(", ")} jours avant l'échéance.
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
                      <span className="text-slate-700 dark:text-slate-300">Rappels de mise à jour après échéance</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Demande si la tâche a été accomplie après l'échéance.
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
                      <span className="text-slate-700 dark:text-slate-300 font-medium">Rappels de préparation</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 ml-5">
                      Rappels pour les audiences à venir: {notificationPrefs.sessions.reminderDays.join(", ")} jours avant l'audience.
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
                      <span className="text-slate-700 dark:text-slate-300 font-medium">Rappel le jour même</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 ml-5">
                      Notification critique le jour de l'audience pour éviter tout oubli.
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Procès</h3>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Basé sur la priorité du dossier parent
                </div>
              </div>
              <div className="ml-6 text-xs text-slate-600 dark:text-slate-400">
                <p className="mb-2">
                  <strong>Notifications automatiques:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Rappel si aucune audience programmée (fréquence selon priorité du dossier)</li>
                  <li>Suggestion de mise à jour après audiences/tâches terminées</li>
                </ul>
                <p className="mt-2 text-slate-500 dark:text-slate-500 italic">
                  Les procès héritent de la priorité de leur dossier parent pour déterminer la fréquence des rappels.
                </p>
              </div>
            </div>

            {/* Payments */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-dollar-sign text-green-600"></i>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Paiements</h3>
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
                    <span className="text-slate-700 dark:text-slate-300">Relances pour paiements en retard</span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    Rappels avant: {notificationPrefs.payments.reminderDays.join(", ")} jours
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    Relances après retard: {notificationPrefs.payments.overdueReminderFrequency.join(", ")} jours
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
                        Rappels avant échéance (Date limite)
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Rappels: {notificationPrefs.missions.reminderDays.join(", ")} jours avant l'échéance.
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
                      <span className="text-slate-700 dark:text-slate-300">Vérification après échéance</span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Demande si l'huissier a accompli la mission après l'échéance.
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
                        Rappel d'inactivité ({notificationPrefs.dossiers.inactivityDays} jours)
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Notification si le dossier n'a pas été mis à jour depuis {notificationPrefs.dossiers.inactivityDays} jours.
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
                        Rappel de révision (basé sur priorité)
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Haute priorité: tous les {notificationPrefs.dossiers.reviewIntervalHigh} jours
                      <br />
                      Moyenne priorité: tous les {notificationPrefs.dossiers.reviewIntervalMedium} jours
                      <br />
                      Basse priorité: tous les {notificationPrefs.dossiers.reviewIntervalLow} jours
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
                        Prochaine échéance (next_deadline)
                      </span>
                    </label>
                    <p className="text-slate-500 dark:text-slate-400 pl-6">
                      Rappels pour les échéances: 7 jours avant, 3 jours avant, le jour même, et en cas de retard.
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
                      Rappel d'inactivité ({notificationPrefs.clients.inactivityDays} jours sans activité)
                    </span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 pl-6">
                    Notification si le client n'a eu aucune activité (dossiers, tâches, séances, paiements) pendant {notificationPrefs.clients.inactivityDays} jours.
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
                  Authentification à deux facteurs
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Sécurité renforcée pour votre compte
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
                  Expiration de session
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Déconnexion automatique après inactivité
                </p>
              </div>
              <select
                value={settings.sessionTimeout}
                onChange={(e) => handleChange("sessionTimeout", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 heure</option>
                <option value="120">2 heures</option>
              </select>
            </div>

            {/* Change Password Button */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <button className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium transition-colors duration-200">
                <i className="fas fa-key mr-2"></i>
                Changer le mot de passe
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
                  Thème
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Choisissez le thème de l'application
                </p>
              </div>
              <select
                value={settings.theme}
                onChange={(e) => handleChange("theme", e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
                <option value="system">Système</option>
              </select>
            </div>
          </div>
        </ContentSection>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-4">
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-save"></i>
            Enregistrer les modifications
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
