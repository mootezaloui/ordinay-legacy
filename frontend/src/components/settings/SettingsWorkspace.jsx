import { useTranslation } from "react-i18next";
import LegacyImportQueue from "../imports/LegacyImportQueue";
import ContentSection from "../layout/ContentSection";

export default function SettingsWorkspace() {
  const { t } = useTranslation(["settings"]);

  return (
    <div className="space-y-6">
      <ContentSection title={t("sections.imports")}>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("imports.subtitle")}
          </p>
          <LegacyImportQueue entityType="client" initialStatus="all" />
        </div>
      </ContentSection>
    </div>
  );
}
