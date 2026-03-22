import type { DraftSectionData, DraftLayoutData } from "../../../../services/api/agent";
import { getSectionClass, getDocumentFontFamily } from "./roleStyles";
import { stripMarkdown } from "./layoutUtils";

const HEADING_ROLES = new Set(["heading", "subheading"]);

export function SectionView({ section }: { section: DraftSectionData }) {
  if (section.role === "spacer") {
    return <div className="h-3" />;
  }
  if (section.role === "separator") {
    return <hr className="my-4 border-black/[0.06] dark:border-white/[0.06]" />;
  }
  if (section.role === "page_break") {
    return <div className="my-4 border-t border-dashed border-black/[0.1] dark:border-white/[0.1]" />;
  }

  const label = stripMarkdown(String(section.label || "")).trim();
  const text = stripMarkdown(String(section.text || ""));
  if (!label && !text) {
    return null;
  }

  const isLabelAccented = section.role === "subject" || section.role === "reference";
  const isHeading = HEADING_ROLES.has(section.role);

  return (
    <div className={`${getSectionClass(section.role)} ${isHeading ? "draft-section-heading" : ""}`}>
      {section.role === "list_item" ? <span className="me-2 text-slate-400 dark:text-slate-500">•</span> : null}
      {label ? (
        <span className={isLabelAccented ? "font-semibold text-amber-600 dark:text-amber-500 me-1" : "font-semibold"}>
          {label}{" "}
        </span>
      ) : null}
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
  const fontFamily = getDocumentFontFamily(layout);

  return (
    <>
      <div
        dir={isRtl ? "rtl" : "ltr"}
        lang={layout.language}
        style={{ fontFamily }}
        className="draft-surface relative rounded-lg border border-slate-200 dark:border-[#30363d] bg-white dark:bg-[#1c2333] px-8 py-7 max-h-[800px] overflow-y-auto"
      >
        <div className={`relative z-10 ${isRtl ? "text-right" : "text-left"}`}>
          {sections.length > 0 ? (
            sections.map((section, index) => (
              <SectionView
                key={section.id || `section_view_${index}`}
                section={section}
              />
            ))
          ) : isStreaming ? (
            <span className="text-slate-400 dark:text-slate-500 text-sm italic">
              Draft is being written...
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 text-sm">No draft content.</span>
          )}
        </div>
      </div>
      <div className="draft-surface-fade" />
    </>
  );
}
