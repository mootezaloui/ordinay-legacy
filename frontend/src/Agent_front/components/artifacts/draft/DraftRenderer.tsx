import type { DraftSectionData, DraftLayoutData } from "../../../../services/api/agent";
import { getSectionClass } from "./roleStyles";

export function SectionView({ section }: { section: DraftSectionData }) {
  if (section.role === "spacer") {
    return <div className="h-4" />;
  }
  if (section.role === "separator") {
    return <hr className="my-3 border-black/[0.08] dark:border-white/[0.08]" />;
  }
  if (section.role === "page_break") {
    return <div className="my-3 border-t border-dashed border-black/[0.12] dark:border-white/[0.12]" />;
  }

  const label = String(section.label || "").trim();
  const text = String(section.text || "");
  if (!label && !text) {
    return null;
  }

  return (
    <div className={getSectionClass(section.role)}>
      {section.role === "list_item" ? <span className="me-2">•</span> : null}
      {label ? <span className="font-semibold">{label} </span> : null}
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

interface DraftRendererProps {
  sections: DraftSectionData[];
  layout: DraftLayoutData;
  isStreaming?: boolean;
}

export function DraftRenderer({ sections, layout, isStreaming }: DraftRendererProps) {
  const isRtl = layout.direction === "rtl";

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      lang={layout.language}
      className="relative rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f172a]/70 p-4 max-h-[420px] overflow-y-auto shadow-sm"
    >
      <div className={`relative z-10 ${isRtl ? "text-right" : "text-left"} text-slate-700 dark:text-slate-300`}>
        {sections.length > 0 ? (
          sections.map((section, index) => (
            <SectionView
              key={section.id || `section_view_${index}`}
              section={section}
            />
          ))
        ) : isStreaming ? (
          <span className="text-slate-500 dark:text-slate-400">
            Draft is being written...
          </span>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">No draft content.</span>
        )}
      </div>
    </div>
  );
}
