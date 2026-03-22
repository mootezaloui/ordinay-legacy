import type { DraftSectionData } from "../../../../services/api/agent";

export function normalizeDraftText(value: string): string {
  if (!value) return "";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

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
  const normalizedLabel = section.label != null ? normalizeDraftText(String(section.label)) : undefined;
  const normalizedText = section.text != null ? normalizeDraftText(String(section.text)) : undefined;

  return {
    id: String(section.id || `sec_${index + 1}`),
    role: String(section.role || "body"),
    ...(normalizedLabel != null ? { label: normalizedLabel } : {}),
    ...(normalizedText != null ? { text: normalizedText } : {}),
  };
}
