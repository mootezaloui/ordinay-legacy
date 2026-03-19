import type { DraftLayoutData } from "../../../../services/api/agent";

export const MULTILINE_ROLES = new Set([
  "body",
  "closing",
  "quote",
  "note",
  "highlight",
  "list_item",
  "salutation",
]);

export function getSectionClass(role: string): string {
  switch (role) {
    case "date":
      return "text-end text-xs italic text-slate-500 mb-4";
    case "sender":
    case "recipient":
      return "text-sm font-medium leading-relaxed mb-3";
    case "reference":
      return "text-xs font-mono text-slate-500 mb-2";
    case "subject":
      return "text-sm font-semibold mb-3";
    case "salutation":
      return "text-sm mb-3";
    case "body":
      return "text-sm leading-relaxed text-justify mb-3";
    case "heading":
      return "text-base font-semibold mt-4 mb-2";
    case "subheading":
      return "text-sm font-semibold mt-3 mb-1";
    case "list_item":
      return "text-sm leading-relaxed ps-4 mb-1";
    case "closing":
      return "text-sm leading-relaxed mt-4 mb-4";
    case "signature_name":
      return "text-sm font-semibold italic text-end";
    case "signature_title":
      return "text-xs text-slate-500 text-end";
    case "signature_detail":
      return "text-xs text-slate-500 font-mono text-end";
    default:
      return "text-sm leading-relaxed mb-3";
  }
}

export function getDocumentFontFamily(layout: DraftLayoutData): string {
  if (layout.language === "ar") {
    return "'Noto Naskh Arabic', 'Amiri', serif";
  }
  if (layout.formality === "formal") {
    return "'Crimson Pro', 'Georgia', serif";
  }
  return "'DM Sans', system-ui, sans-serif";
}
