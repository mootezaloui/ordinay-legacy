import { useTranslation } from "react-i18next";
import ContentSection from "../../layout/ContentSection";

/**
 * Timeline Tab - Displays chronological events
 * Works for any entity with a timeline array
 */
export default function TimelineTab({ data, config }) {
  const { t } = useTranslation("common");
  const timeline = data.timeline || [];

  const typeConfig = {
    created: {
      bg: "bg-green-100 dark:bg-green-900/20",
      icon: "fas fa-plus text-green-600 dark:text-green-400"
    },
    document: {
      bg: "bg-purple-100 dark:bg-purple-900/20",
      icon: "fas fa-file text-purple-600 dark:text-purple-400"
    },
    meeting: {
      bg: "bg-amber-100 dark:bg-amber-900/20",
      icon: "fas fa-handshake text-amber-600 dark:text-amber-400"
    },
    call: {
      bg: "bg-slate-100 dark:bg-slate-800",
      icon: "fas fa-phone text-slate-600 dark:text-slate-400"
    },
    hearing: {
      bg: "bg-blue-100 dark:bg-blue-900/20",
      icon: "fas fa-gavel text-blue-600 dark:text-blue-400"
    },
    payment: {
      bg: "bg-green-100 dark:bg-green-900/20",
      icon: "fas fa-dollar-sign text-green-600 dark:text-green-400"
    },
    invoice: {
      bg: "bg-blue-100 dark:bg-blue-900/20",
      icon: "fas fa-file-invoice text-blue-600 dark:text-blue-400"
    },
    action: {
      bg: "bg-slate-100 dark:bg-slate-800",
      icon: "fas fa-bolt text-slate-600 dark:text-slate-400"
    },
    mediation: {
      bg: "bg-cyan-100 dark:bg-cyan-900/20",
      icon: "fas fa-balance-scale text-cyan-600 dark:text-cyan-400"
    },
  };

  if (timeline.length === 0) {
    return (
      <ContentSection data-tutorial="dossier-history-section" title={t("detail.timeline.title")}>
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
            <i className="fas fa-history text-slate-400 dark:text-slate-600 text-2xl"></i>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            {t("detail.timeline.empty")}
          </p>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection data-tutorial="dossier-history-section" title={t("detail.timeline.title")}>
      <div className="p-6">
        <div className="space-y-6">
          {timeline.map((event, index) => {
            const config = typeConfig[event.type] || typeConfig.action;
            const isLast = index === timeline.length - 1;

            return (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.bg}`}>
                    <i className={config.icon}></i>
                  </div>
                  {!isLast && (
                    <div className="w-0.5 h-full bg-slate-200 dark:bg-slate-700 my-2"></div>
                  )}
                </div>
                <div className="flex-1 pb-6">
                  <p className="font-medium text-slate-900 dark:text-white">
                    {event.event}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {event.date}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ContentSection>
  );
}
