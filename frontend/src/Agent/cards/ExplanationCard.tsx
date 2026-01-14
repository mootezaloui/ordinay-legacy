import { ExplanationResultData } from "../types/agentResult";

interface ExplanationCardProps {
  data: ExplanationResultData;
}

export function ExplanationCard({ data }: ExplanationCardProps) {
  return (
    <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
      <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-900 dark:text-white mb-3">
          {data.summary}
        </p>
        <ul className="space-y-2">
          {data.details.map((detail, idx) => (
            <li
              key={idx}
              className="text-xs text-slate-600 dark:text-slate-400 pl-4 relative before:content-['•'] before:absolute before:left-0"
            >
              {detail}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
