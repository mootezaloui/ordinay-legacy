import type { DraftLayoutData } from "../../../../services/api/agent";

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  date: "Date",
  sender: "Sender",
  recipient: "Recipient",
  reference: "Reference",
  subject: "Subject",
  salutation: "Salutation",
  body: "Body",
  heading: "Heading",
  subheading: "Subheading",
  list_item: "List Item",
  quote: "Quote",
  note: "Note",
  highlight: "Highlight",
  closing: "Closing",
  signature_name: "Signature",
  signature_title: "Title",
  signature_detail: "Details",
  stamp_area: "Stamp",
};

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
      return "text-end text-[13px] italic text-slate-400 dark:text-slate-500 mb-6";
    case "sender":
      return "text-[14px] font-medium leading-relaxed text-slate-500 dark:text-slate-400 mb-1";
    case "recipient":
      return "text-[14px] font-medium leading-snug text-slate-700 dark:text-slate-300 mb-4";
    case "reference":
      return "text-[11px] font-mono text-slate-400 dark:text-slate-500 tracking-wider uppercase mb-2";
    case "subject":
      return "text-[15px] font-semibold text-slate-900 dark:text-slate-100 mb-4";
    case "salutation":
      return "text-[15px] text-slate-800 dark:text-slate-200 mb-1";
    case "body":
      return "text-[15px] leading-[1.85] text-slate-600 dark:text-[#8b949e] text-justify mb-1";
    case "heading":
      return "text-[15px] font-semibold text-slate-900 dark:text-[#e6edf3] mt-6 mb-2";
    case "subheading":
      return "text-[14px] font-semibold text-slate-700 dark:text-[#c9d1d9] mt-4 mb-1";
    case "list_item":
      return "text-[14px] leading-[1.75] text-slate-600 dark:text-[#8b949e] ps-4 mb-1";
    case "quote":
      return "text-[14px] leading-[1.75] italic text-slate-500 dark:text-slate-400 border-s-2 border-amber-300 dark:border-amber-700 ps-4 my-3";
    case "note":
      return "text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 bg-slate-100/60 dark:bg-white/[0.03] rounded-md px-3 py-2 my-3";
    case "highlight":
      return "text-[14px] leading-relaxed text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-900/10 rounded-md px-3 py-2 my-3";
    case "closing":
      return "text-[15px] leading-[1.85] text-slate-600 dark:text-[#8b949e] mt-2 mb-2";
    case "signature_name":
      return "text-[15px] font-semibold italic text-slate-900 dark:text-[#e6edf3] text-end";
    case "signature_title":
      return "text-[12px] text-slate-500 dark:text-[#6e7681] text-end mt-0.5";
    case "signature_detail":
      return "text-[11.5px] text-slate-400 dark:text-[#484f58] font-mono tracking-wide text-end";
    case "stamp_area":
      return "text-[12px] text-center text-slate-400 dark:text-[#484f58] border border-dashed border-slate-300 dark:border-[#30363d] rounded px-4 py-3 my-4";
    default:
      return "text-[14px] leading-relaxed text-slate-600 dark:text-[#8b949e] mb-3";
  }
}

export function getDocumentFontFamily(layout: DraftLayoutData): string {
  if (layout.language === "ar") {
    return "'Noto Naskh Arabic', 'Traditional Arabic', 'Simplified Arabic', serif";
  }
  if (layout.formality === "formal") {
    return "Georgia, 'Times New Roman', 'Cambria', serif";
  }
  return "system-ui, -apple-system, 'Segoe UI', sans-serif";
}
