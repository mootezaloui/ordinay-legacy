import { Eye } from "lucide-react";
import { AnalysisResultData } from "../types/agentResult";

interface ReviewCardProps {
  data: AnalysisResultData;
}

export function ReviewCard({ data }: ReviewCardProps) {
  const statusColors = {
    Critical:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    High: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800",
    Medium:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
    Low: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  };

  return (
    <div className="space-y-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
      {data.items.map((item, idx) => (
        <div
          key={idx}
          className="p-4 bg-[#f9fafb] dark:bg-[#0f172a] rounded-xl border border-black/[0.06] dark:border-white/[0.06]"
        >
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-[#0f172a] dark:text-[#f1f5f9]">
              {item.title}
            </h4>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full border ${
                statusColors[item.status]
              }`}
            >
              {item.status}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
            {item.reason}
          </p>
          <button className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Open dossier
          </button>
        </div>
      ))}
    </div>
  );
}
