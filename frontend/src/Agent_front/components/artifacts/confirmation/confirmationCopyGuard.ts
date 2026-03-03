import type { SemanticActionViewModel } from "./types";

const REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bedit details\b/gi, replacement: "update information" },
  { pattern: /\bsave changes\b/gi, replacement: "confirm" },
  { pattern: /\balso affects\b/gi, replacement: "this affects" },
  { pattern: /\bmutation\b/gi, replacement: "change" },
  { pattern: /\bexecute\b/gi, replacement: "apply" },
  { pattern: /\boperation\b/gi, replacement: "action" },
  { pattern: /\bproposal\b/gi, replacement: "confirmation" },
  { pattern: /\bworkflow\b/gi, replacement: "step plan" },
  { pattern: /\brecord\b/gi, replacement: "information" },
  { pattern: /\bentity\b/gi, replacement: "information" },
  { pattern: /\bitem\b/gi, replacement: "entry" },
];

const FORBIDDEN_PATTERNS = [
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

export function sanitizeConfirmationCopy(value: string): string {
  let next = String(value || "");
  for (const { pattern, replacement } of REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

export function containsForbiddenConfirmationCopy(value: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(String(value || "")));
}

export function validateConfirmationViewModelCopy(
  viewModel: SemanticActionViewModel,
): { valid: boolean; offendingText?: string } {
  const values = [
    viewModel.assistantMessage,
    viewModel.headline,
    viewModel.description,
    viewModel.confirmLabel,
    viewModel.cancelLabel,
    viewModel.sections?.changesLabel,
    viewModel.sections?.consequencesLabel,
    viewModel.sections?.warningsLabel,
    viewModel.sections?.reversibilityLabel,
    ...viewModel.impact.flatMap((item) =>
      [item.title, item.detail, item.before, item.after].filter(Boolean) as string[],
    ),
  ];

  for (const value of values) {
    if (containsForbiddenConfirmationCopy(String(value || ""))) {
      return { valid: false, offendingText: String(value || "") };
    }
  }
  return { valid: true };
}

export function sanitizeConfirmationViewModel(
  viewModel: SemanticActionViewModel,
): SemanticActionViewModel {
  return {
    ...viewModel,
    assistantMessage: sanitizeConfirmationCopy(viewModel.assistantMessage),
    headline: sanitizeConfirmationCopy(viewModel.headline),
    description: sanitizeConfirmationCopy(viewModel.description),
    confirmLabel: sanitizeConfirmationCopy(viewModel.confirmLabel),
    cancelLabel: sanitizeConfirmationCopy(viewModel.cancelLabel),
    impact: viewModel.impact.map((item) => ({
      ...item,
      title: item.title ? sanitizeConfirmationCopy(item.title) : item.title,
      detail: sanitizeConfirmationCopy(item.detail),
      before: item.before ? sanitizeConfirmationCopy(item.before) : item.before,
      after: item.after ? sanitizeConfirmationCopy(item.after) : item.after,
    })),
  };
}
