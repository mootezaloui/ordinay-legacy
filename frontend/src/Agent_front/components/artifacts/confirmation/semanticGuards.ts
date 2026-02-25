import type { SemanticActionViewModel } from "./types";

const HARD_FORBIDDEN_PATTERNS = [
  /\brecord\b/i,
  /\bentity\b/i,
  /\bmutation\b/i,
  /\bworkflow\b/i,
  /\bedit details\b/i,
  /\bsave changes\b/i,
  /\balso affects\b/i,
  /\bexecute\b/i,
  /\boperation\b/i,
  /\bproposal\b/i,
  /\bitem\b/i,
];

const GENERIC_HEADLINE_PATTERNS = [
  /^update\b/i,
  /^change\b/i,
  /^apply changes\b/i,
  /\bitem\b/i,
  /\brecord\b/i,
  /\bproposal\b/i,
  /\bworkflow\b/i,
];

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function collectUserFacingStrings(viewModel: SemanticActionViewModel): string[] {
  return [
    viewModel.assistantMessage,
    viewModel.headline,
    viewModel.description,
    viewModel.confirmLabel,
    viewModel.cancelLabel,
    viewModel.sections.changesLabel,
    viewModel.sections.consequencesLabel,
    viewModel.sections.warningsLabel,
    viewModel.sections.reversibilityLabel,
    ...viewModel.impact.flatMap((item) =>
      [item.title, item.detail, item.before, item.after].filter((v): v is string => typeof v === "string"),
    ),
  ].filter(Boolean);
}

export class SemanticMappingError extends Error {
  readonly code = "SEMANTIC_CONFIRMATION_MAPPING_FAILED";
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SemanticMappingError";
    this.details = details;
  }
}

export function containsForbiddenSemanticCopy(value: string): boolean {
  return HARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(String(value || "")));
}

export function assertSemanticActionViewModel(viewModel: SemanticActionViewModel): SemanticActionViewModel {
  const requiredFields: Array<[string, string]> = [
    ["assistantMessage", viewModel.assistantMessage],
    ["headline", viewModel.headline],
    ["description", viewModel.description],
    ["confirmLabel", viewModel.confirmLabel],
    ["cancelLabel", viewModel.cancelLabel],
    ["sections.changesLabel", viewModel.sections?.changesLabel],
    ["sections.consequencesLabel", viewModel.sections?.consequencesLabel],
    ["sections.warningsLabel", viewModel.sections?.warningsLabel],
    ["sections.reversibilityLabel", viewModel.sections?.reversibilityLabel],
  ];

  for (const [field, value] of requiredFields) {
    if (!String(value || "").trim()) {
      throw new SemanticMappingError(`Missing semantic confirmation copy for ${field}.`);
    }
  }

  for (const text of collectUserFacingStrings(viewModel)) {
    if (containsForbiddenSemanticCopy(text)) {
      throw new SemanticMappingError("Semantic confirmation copy contains forbidden generic/admin vocabulary.", {
        offendingText: text,
      });
    }
  }

  return viewModel;
}

export function assertNonGenericSemanticCopy(viewModel: SemanticActionViewModel): void {
  const isDev = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
  if (!isDev) return;

  const headline = String(viewModel.headline || "").trim();
  if (!headline) return;

  if (GENERIC_HEADLINE_PATTERNS.some((pattern) => pattern.test(headline))) {
    throw new SemanticMappingError("Semantic confirmation headline is too generic.", {
      headline,
    });
  }

  const normalizedHeadline = normalize(headline);
  const normalizedConfirm = normalize(viewModel.confirmLabel);
  const normalizedAssistant = normalize(viewModel.assistantMessage);
  const normalizedDescription = normalize(viewModel.description);

  if (normalizedConfirm && normalizedConfirm === normalizedHeadline) {
    throw new SemanticMappingError("Confirm label must not repeat the full headline.", {
      headline: viewModel.headline,
      confirmLabel: viewModel.confirmLabel,
    });
  }

  if (normalizedAssistant && normalizedDescription && normalizedAssistant === normalizedDescription) {
    throw new SemanticMappingError("Assistant framing and panel description must not be identical.", {
      assistantMessage: viewModel.assistantMessage,
      description: viewModel.description,
    });
  }
}
