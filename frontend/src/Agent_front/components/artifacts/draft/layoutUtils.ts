import type { DraftSectionData } from "../../../../services/api/agent";

export function detectLanguage(content: string): string {
  if (/[\u0600-\u06FF]/.test(content)) return "ar";
  if (/[àâçéèêëîïôûùüÿœ]/i.test(content)) return "fr";
  return "en";
}

export function buildContentFromSections(sections: DraftSectionData[]): string {
  return sections
    .map((section) => {
      const label = String(section.label || "").trim();
      const text = String(section.text || "").trim();
      if (!label && !text) return "";
      if (!label) return text;
      if (!text) return label;
      return `${label} ${text}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

export function ensureSectionId(
  section: Partial<DraftSectionData>,
  index: number,
): DraftSectionData {
  return {
    id: String(section.id || `sec_${index + 1}`),
    role: String(section.role || "body"),
    ...(section.label != null ? { label: String(section.label) } : {}),
    ...(section.text != null ? { text: String(section.text) } : {}),
  };
}
