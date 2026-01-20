import { useSettings } from "../../contexts/SettingsContext";
import { useTheme } from "../../contexts/ThemeProvider";
import { useTranslation } from "react-i18next";
import ContentSection from "../layout/ContentSection";
import { LANGUAGE_REGISTRY } from "../../i18n/config";

export default function SettingsGeneral() {
  const { settings, updateSettings } = useSettings();
  const { setThemePreference } = useTheme();
  const { t } = useTranslation(["settings"]);

  const handleChange = (field, value) => {
    updateSettings({ [field]: value });

    if (field === "theme") {
      setThemePreference(value);
    }

    if (field === "language") {
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  return (
    <div className="space-y-6">
      <ContentSection title={t("sections.general")}>
        <div className="p-6 space-y-6">
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

      <ContentSection title={t("sections.appearance")}>
        <div className="p-6 space-y-6">
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
  );
}
