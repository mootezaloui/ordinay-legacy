import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import { useTranslation } from "react-i18next";

export default function ChatBot() {
  const { t } = useTranslation("chatbot");

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={t("page.subtitle")}
        icon="fas fa-robot"
      />

      <ContentSection>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <i className="fas fa-robot text-white text-4xl"></i>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t("hero.title")}
          </h2>

          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-8">
            {t("hero.description")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <i className="fas fa-search text-blue-600 dark:text-blue-400 text-xl mb-2"></i>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                {t("features.research.title")}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("features.research.description")}
              </p>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <i className="fas fa-file-alt text-purple-600 dark:text-purple-400 text-xl mb-2"></i>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                {t("features.analyze.title")}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("features.analyze.description")}
              </p>
            </div>

            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <i className="fas fa-lightbulb text-green-600 dark:text-green-400 text-xl mb-2"></i>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                {t("features.advice.title")}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("features.advice.description")}
              </p>
            </div>
          </div>

          <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-lg">
            <i className="fas fa-comments"></i>
            {t("cta.start")}
          </button>

          <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">
            {t("footer.note")}
          </p>
        </div>
      </ContentSection>
    </PageLayout>
  );
}
