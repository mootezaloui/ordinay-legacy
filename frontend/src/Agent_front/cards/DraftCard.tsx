import { Download, Share2, Eye } from "lucide-react";
import { ReportResultData } from "../types/agentResult";

interface DraftCardProps {
  data: ReportResultData;
}

export function DraftCard({ data }: DraftCardProps) {
  return (
    <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/60">
      <div className="p-4 bg-white/85 dark:bg-slate-900/60 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              {data.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {data.totalWords} words • {data.sections.length} sections
            </p>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full">
            Ready
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {data.sections.map((section, idx) => (
            <div
              key={idx}
              className="px-3 py-2 bg-white/90 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60"
            >
              <div className="text-xs font-medium text-slate-900 dark:text-white">
                {section.label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {section.words} words
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium rounded-full hover:bg-slate-800 dark:hover:bg-white transition-colors">
            <Eye className="w-3 h-3" />
            View Report
          </button>
          <button className="px-4 py-2 bg-white/80 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-slate-200/70 dark:border-slate-700/60">
            <Download className="w-3 h-3" />
          </button>
          <button className="px-4 py-2 bg-white/80 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-slate-200/70 dark:border-slate-700/60">
            <Share2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
