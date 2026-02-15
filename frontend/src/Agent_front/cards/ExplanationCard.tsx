import { ExplanationResultData } from "../types/agentResult";

interface ExplanationCardProps {
  data: ExplanationResultData;
}

export function ExplanationCard({ data }: ExplanationCardProps) {
  return (
    <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
      <div className="p-4 bg-[#f9fafb] dark:bg-[#0f172a] rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
        <p className="text-sm text-[#0f172a] dark:text-[#f1f5f9] mb-3">
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
