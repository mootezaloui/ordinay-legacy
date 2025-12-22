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
            {/* Email Notifications */}
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Notifications par email
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Recevoir des notifications par email
                </p>
              </div>
              <button
                onClick={() => handleChange("emailNotifications", !settings.emailNotifications)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotifications ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotifications ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Notifications push
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Notifications dans le navigateur
                </p>
              </div>
              <button
                onClick={() => handleChange("pushNotifications", !settings.pushNotifications)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.pushNotifications ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.pushNotifications ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>

            {/* New Client Notification */}
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Nouveau client
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Notifier lors de l'ajout d'un nouveau client
                </p>
              </div>
              <button
                onClick={() => handleChange("notifyNewClient", !settings.notifyNewClient)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifyNewClient ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifyNewClient ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>

            {/* New Case Notification */}
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Nouveau dossier
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Notifier lors de la création d'un dossier
                </p>
              </div>
              <button
                onClick={() => handleChange("notifyNewCase", !settings.notifyNewCase)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifyNewCase ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifyNewCase ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>

            {/* Deadline Notification */}
            <div className="flex items-center justify-between py-3">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Échéances
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Rappel des échéances importantes
                </p>
              </div>
              <button
                onClick={() => handleChange("notifyDeadlines", !settings.notifyDeadlines)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifyDeadlines ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifyDeadlines ? "translate-x-6" : "translate-x-1"
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
                <div className="ml-6 space-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.tasks.overdueReminders}
                      onChange={(e) => handleNotificationPrefChange("tasks", "overdueReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Rappels pour tâches en retard</span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    Rappels avant échéance: {notificationPrefs.tasks.beforeDeadline.join(", ")} jours
                  </p>
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
                <div className="ml-6 space-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.sessions.preparationReminders}
                      onChange={(e) => handleNotificationPrefChange("sessions", "preparationReminders", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Rappels de préparation</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.sessions.dayOfReminder}
                      onChange={(e) => handleNotificationPrefChange("sessions", "dayOfReminder", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Rappel le jour même</span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    Rappels: {notificationPrefs.sessions.reminderDays.join(", ")} jours avant
                  </p>
                </div>
              )}
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
                <div className="ml-6 space-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.missions.completionCheck}
                      onChange={(e) => handleNotificationPrefChange("missions", "completionCheck", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Vérification après mission terminée</span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 ml-5">
                    Rappels: {notificationPrefs.missions.reminderDays.join(", ")} jours avant
                  </p>
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
                <div className="ml-6 space-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.dossiers.inactivityReminder}
                      onChange={(e) => handleNotificationPrefChange("dossiers", "inactivityReminder", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Rappel d'inactivité ({notificationPrefs.dossiers.inactivityDays} jours)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.dossiers.reviewReminder}
                      onChange={(e) => handleNotificationPrefChange("dossiers", "reviewReminder", e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Rappel de révision (tous les {notificationPrefs.dossiers.reviewInterval} jours)</span>
                  </label>
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
