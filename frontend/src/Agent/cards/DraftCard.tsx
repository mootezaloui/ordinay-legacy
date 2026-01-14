import { Download, Share2, Eye } from "lucide-react";
import { ReportResultData } from "../types/agentResult";

interface DraftCardProps {
  data: ReportResultData;
}

export function DraftCard({ data }: DraftCardProps) {
  return (
    <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
      <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              {data.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {data.totalWords} words • {data.sections.length} sections
            </p>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full">
            Ready
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {data.sections.map((section, idx) => (
            <div
              key={idx}
              className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg"
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
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Eye className="w-3 h-3" />
            View Report
          </button>
          <button className="px-4 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
            <Download className="w-3 h-3" />
          </button>
          <button className="px-4 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
            <Share2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
