import { useSettings } from "../../contexts/SettingsContext";
import { useTheme } from "../../contexts/ThemeProvider";
import { useTranslation } from "react-i18next";
import ContentSection from "../layout/ContentSection";
import { LANGUAGE_REGISTRY, getLanguageLocale } from "../../i18n/config";
import { SUPPORTED_CURRENCIES, getCurrencyDisplayLabel } from "../../utils/currency";

export default function SettingsGeneral() {
  const { settings, updateSettings } = useSettings();
  const currencyLocale = getLanguageLocale(settings.language);
  const { setTheme } = useTheme();
  const { t } = useTranslation(["settings"]);

  const handleChange = (field, value, e) => {
    updateSettings({ [field]: value });

    if (field === "theme") {
      setTheme(value, e);
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
              className="w-full md:w-auto px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LANGUAGE_REGISTRY.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
              className="w-full md:w-auto px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY/MM/DD">YYYY/MM/DD</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD-MM-YYYY">DD-MM-YYYY</option>
              <option value="MM-DD-YYYY">MM-DD-YYYY</option>
            </select>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                {t("general.currency.label")}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t("general.currency.description")}
              </p>
            </div>
            <select
              value={settings.currency}
              onChange={(e) => handleChange("currency", e.target.value)}
              className="w-full md:w-auto px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code} ({getCurrencyDisplayLabel(code, currencyLocale)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </ContentSection>

      <ContentSection title={t("sections.appearance")}>
        <div className="p-6 space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
              onChange={(e) => handleChange("theme", e.target.value, e)}
              className="w-full md:w-auto px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
