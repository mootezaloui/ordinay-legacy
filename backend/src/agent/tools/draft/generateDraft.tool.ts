import type { DraftArtifact } from "../../types";
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
    content: {
      type: "string",
      description: "The complete draft text with line breaks",
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
  required: ["draftType", "title", "content"],
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
  const artifact: DraftArtifact = {
    draftType: String(args.draftType ?? "other"),
    title: String(args.title ?? ""),
    subtitle: args.subtitle != null ? String(args.subtitle) : undefined,
    metadata: isStringRecord(args.metadata) ? args.metadata : undefined,
    content: String(args.content ?? ""),
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

export const generateDraftTool: ToolDefinition = {
  name: "generateDraft",
  category: ToolCategory.DRAFT,
  description:
    "Generate a draft document, letter, email, summary, or other text artifact. " +
    "You MUST call this tool whenever producing draft content for the user. " +
    "Never place full draft text directly in assistant response text. " +
    "Always route draft content through this tool using the content field. " +
    "Call this AFTER gathering all necessary context with READ tools. " +
    "Use when the user asks to write, draft, compose, prepare, or generate text.",
  inputSchema,
  outputSchema,
  sideEffects: false,
  handler,
};
