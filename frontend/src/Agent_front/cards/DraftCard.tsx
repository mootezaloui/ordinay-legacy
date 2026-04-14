import { Download, Share2, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReportResultData } from "../types/agentResult";

interface DraftCardProps {
  data: ReportResultData;
}

export function DraftCard({ data }: DraftCardProps) {
  const { t } = useTranslation("common");
  return (
    <div className="pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
      <div className="p-4 bg-white/85 dark:bg-[#0f172a]/60 rounded-2xl border border-black/[0.05] dark:border-white/[0.06] shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-[#0f172a] dark:text-[#f1f5f9] mb-1">
              {data.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t("agent.cards.draftSummary", { words: data.totalWords, sections: data.sections.length, count: data.totalWords })}
            </p>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full">
            {t("agent.cards.ready")}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {data.sections.map((section, idx) => (
            <div
              key={idx}
              className="px-3 py-2 bg-white/90 dark:bg-[#0f172a]/60 rounded-xl border border-black/[0.04] dark:border-white/[0.06]"
            >
              <div className="text-xs font-medium text-[#0f172a] dark:text-[#f1f5f9]">
                {section.label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t("agent.cards.wordCount", { count: section.words })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#0f172a] text-white dark:bg-[#f1f5f9] dark:text-[#0f172a] text-xs font-medium rounded-full hover:bg-[#334155] dark:hover:bg-white transition-colors">
            <Eye className="w-3 h-3" />
            {t("agent.cards.viewReport")}
          </button>
          <button className="px-4 py-2 bg-white/80 dark:bg-[#0f172a]/60 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors border border-black/[0.05] dark:border-white/[0.06]">
            <Download className="w-3 h-3" />
          </button>
          <button className="px-4 py-2 bg-white/80 dark:bg-[#0f172a]/60 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors border border-black/[0.05] dark:border-white/[0.06]">
            <Share2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
