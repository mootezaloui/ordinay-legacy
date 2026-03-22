import type {
  DraftArtifact,
  DraftLayout,
  DraftSection,
} from "../../types";

const MAX_SECTIONS = 60;
const MAX_SECTION_TEXT_LENGTH = 12000;

const KNOWN_ROLES = new Set([
  "date", "sender", "recipient", "reference", "subject",
  "salutation", "body", "heading", "subheading", "list_item",
  "quote", "note", "highlight",
  "closing", "signature_name", "signature_title", "signature_detail",
  "stamp_area",
  "spacer", "separator", "page_break",
]);
import {
  ToolCategory,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from "../tool.types";

const inputSchema = {
  type: "object",
  properties: {
    draftType: {
      type: "string",
      description:
        "Type of draft: court_letter | demand_letter | client_letter | " +
        "counsel_letter | legal_notice | contract | email | sms | summary | " +
        "case_report | hearing_prep | session_notes | evidence_list | " +
        "financial_summary | memo | task_brief | other",
    },
    title: {
      type: "string",
      description: "Title for the draft",
    },
    subtitle: {
      type: "string",
      description: "Subtitle — typically case reference and court",
    },
    metadata: {
      type: "object",
      description:
        "Key-value pairs displayed in the card header. " +
        "Include relevant fields like client, dossier, language, " +
        "tone, recipient. Use 2-4 fields maximum.",
      additionalProperties: { type: "string" },
    },
    sections: {
      type: "array",
      description:
        "Semantic draft sections. Each section includes role + text (optional label).",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          role: { type: "string" },
          text: { type: "string" },
          label: { type: "string" },
        },
        required: ["role"],
        additionalProperties: false,
      },
      minItems: 1,
    },
    layout: {
      type: "object",
      description: "Layout hints for rendering direction, language, and style.",
      properties: {
        direction: { type: "string", enum: ["ltr", "rtl"] },
        language: { type: "string" },
        formality: { type: "string", enum: ["formal", "standard", "casual"] },
        documentClass: { type: "string" },
      },
      required: ["direction", "language", "formality", "documentClass"],
      additionalProperties: false,
    },
    content: {
      type: "string",
      description:
        "Legacy fallback: complete draft text. Prefer sections + layout.",
    },
    linkedEntityType: {
      type: "string",
      description: "Entity this draft relates to: client | dossier | lawsuit",
    },
    linkedEntityId: {
      type: "integer",
      description: "ID of the related entity",
    },
  },
  required: ["draftType", "title"],
  additionalProperties: false,
};

const outputSchema = {
  type: "object",
  properties: {
    artifact: {
      type: "object",
      description: "The structured draft artifact",
    },
  },
  required: ["artifact"],
  additionalProperties: false,
};

async function handler(
  _context: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const draftType = String(args.draftType ?? "other").trim() || "other";
  const title = String(args.title ?? "").trim();
  const metadata = isStringRecord(args.metadata) ? args.metadata : undefined;
  const legacyContent = String(args.content ?? "");
  const sections = normalizeSections(args.sections, legacyContent);
  if (sections.length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_DRAFT_SECTIONS",
      errorMessage:
        "generateDraft requires sections (or non-empty legacy content fallback).",
    };
  }
  const layout = normalizeLayout({
    layoutInput: args.layout,
    metadata,
    sections,
    draftType,
  });
  const content = renderSectionsAsText(sections);

  const artifact: DraftArtifact = {
    draftType,
    title,
    subtitle: args.subtitle != null ? String(args.subtitle) : undefined,
    metadata,
    sections,
    layout,
    content,
    linkedEntityType:
      args.linkedEntityType != null ? String(args.linkedEntityType) : undefined,
    linkedEntityId:
      args.linkedEntityId != null ? Number(args.linkedEntityId) : undefined,
    generatedAt: new Date().toISOString(),
    version: 1,
  };

  return {
    ok: true,
    data: { artifact },
    metadata: { category: "DRAFT", draftType: artifact.draftType },
  };
}

function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "string",
  );
}

function normalizeSections(
  input: unknown,
  fallbackContent: string,
): DraftSection[] {
  if (Array.isArray(input) && input.length > 0) {
    const sections: DraftSection[] = [];
    const capped = input.slice(0, MAX_SECTIONS);
    for (let i = 0; i < capped.length; i += 1) {
      const row = capped[i];
      if (!isRecord(row)) {
        continue;
      }
      const rawRole = String(row.role ?? "").trim() || "body";
      const role = KNOWN_ROLES.has(rawRole) ? rawRole : "body";
      const id = String(row.id ?? "").trim() || `sec_${i + 1}`;
      const section: DraftSection = {
        id,
        role,
      };
      if (row.label != null) {
        const label = String(row.label);
        section.label = label.length > MAX_SECTION_TEXT_LENGTH
          ? label.slice(0, MAX_SECTION_TEXT_LENGTH)
          : label;
      }
      if (row.text != null) {
        const text = String(row.text);
        section.text = text.length > MAX_SECTION_TEXT_LENGTH
          ? text.slice(0, MAX_SECTION_TEXT_LENGTH)
          : text;
      }
      sections.push(section);
    }
    if (sections.length > 0) {
      return sections;
    }
  }

  const text = String(fallbackContent || "").trim();
  if (text.length === 0) {
    return [];
  }

  return [
    {
      id: "sec_1",
      role: "body",
      text,
    },
  ];
}

function normalizeLayout(params: {
  layoutInput: unknown;
  metadata?: Record<string, string>;
  sections: DraftSection[];
  draftType: string;
}): DraftLayout {
  const layoutInput = isRecord(params.layoutInput) ? params.layoutInput : null;
  const textCorpus = renderSectionsAsText(params.sections);
  const language = detectLanguage(
    layoutInput?.language,
    params.metadata?.language,
    textCorpus,
  );
  const direction = detectDirection(layoutInput?.direction, language, textCorpus);
  const formality = detectFormality(layoutInput?.formality);
  const documentClass =
    (layoutInput?.documentClass != null && String(layoutInput.documentClass).trim()) ||
    params.draftType ||
    "other";

  return {
    direction,
    language,
    formality,
    documentClass: String(documentClass),
  };
}

function detectLanguage(
  primary: unknown,
  secondary: unknown,
  text: string,
): string {
  const direct = String(primary ?? "").trim().toLowerCase();
  if (direct) return direct;
  const fallback = String(secondary ?? "").trim().toLowerCase();
  if (fallback) return fallback;
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return "fr";
  return "en";
}

function detectDirection(
  value: unknown,
  language: string,
  text: string,
): "ltr" | "rtl" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "rtl") return "rtl";
  if (normalized === "ltr") return "ltr";
  if (language === "ar" || /[\u0600-\u06FF]/.test(text)) {
    return "rtl";
  }
  return "ltr";
}

function detectFormality(
  value: unknown,
): DraftLayout["formality"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "formal" ||
    normalized === "standard" ||
    normalized === "casual"
  ) {
    return normalized;
  }
  return "formal";
}

function renderSectionsAsText(sections: DraftSection[]): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const generateDraftTool: ToolDefinition = {
  name: "generateDraft",
  category: ToolCategory.DRAFT,
  description:
    "Generate a draft document, letter, email, summary, or other text artifact. " +
    "You MUST call this tool whenever producing draft content for the user. " +
    "Never place full draft text directly in assistant response text. " +
    "Always route draft content through this tool using sections and layout. " +
    "Call this AFTER gathering all necessary context with READ tools. " +
    "Use when the user asks to write, draft, compose, prepare, or generate text.",
  inputSchema,
  outputSchema,
  sideEffects: false,
  handler,
};
