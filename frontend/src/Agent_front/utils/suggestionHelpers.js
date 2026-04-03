export function resolveSuggestionActionMeta(suggestion) {
  const actionType = String(suggestion?.actionType || "").trim();
  const domain = String(suggestion?.domain || "")
    .trim()
    .toLowerCase();

  if (domain === "draft") {
    return {
      label: "Draft",
      color:
        "text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30",
    };
  }

  if (domain === "execute") {
    if (actionType === "CREATE_ENTITY") {
      return {
        label: "Plan Create",
        color:
          "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
      };
    }
    if (actionType === "DELETE_ENTITY") {
      return {
        label: "Plan Delete",
        color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30",
      };
    }
    return {
      label: "Plan Update",
      color:
        "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30",
    };
  }

  if (actionType === "CREATE_ENTITY") {
    return {
      label: "Create",
      color:
        "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
    };
  }
  if (actionType === "ADD_NOTE") {
    return {
      label: "Add Note",
      color: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30",
    };
  }
  if (actionType === "GENERATE_DOCUMENT") {
    return {
      label: "Generate",
      color:
        "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30",
    };
  }
  if (actionType === "ENRICH_FIELD") {
    return {
      label: "Complete",
      color:
        "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30",
    };
  }
  if (actionType === "DELETE_ENTITY") {
    return {
      label: "Delete",
      color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30",
    };
  }

  return {
    label: actionType || "Action",
    color: "text-slate-600 bg-slate-50",
  };
}

export function resolveSuggestionActionButtonLabel(suggestion) {
  const domain = String(suggestion?.domain || "")
    .trim()
    .toLowerCase();
  if (domain === "draft") return "Use Draft";
  if (domain === "execute") return "Use Plan";
  return "Do it";
}

export function resolveAssistSuggestionQuestion(suggestion) {
  const domain = String(suggestion?.domain || "")
    .trim()
    .toLowerCase();
  const label = String(suggestion?.label || "").trim();
  if (domain === "execute") {
    return label
      ? `I can prepare this plan suggestion now: ${label}. Continue?`
      : "I can prepare this plan suggestion now. Continue?";
  }
  return label
    ? `I can generate this suggested draft now: ${label}. Continue?`
    : "I can generate this suggested draft now. Continue?";
}

export function resolveAssistSuggestionPrompt(suggestion) {
  const directPrompt = String(suggestion?.followUpPrompt || "").trim();
  if (directPrompt) return directPrompt;

  const label = String(suggestion?.label || "").trim();
  if (label) return label;

  const actionType = String(suggestion?.actionType || "").trim();
  if (actionType === "GENERATE_DOCUMENT") return "Create the suggested draft.";
  if (actionType === "CREATE_ENTITY") return "Create the suggested record.";
  if (actionType === "DELETE_ENTITY") return "Delete the suggested record.";
  return "Apply the suggested update.";
}

export function resolveAssistSuggestionDeclinePrompt(suggestion) {
  const domain = String(suggestion?.domain || "")
    .trim()
    .toLowerCase();
  if (domain === "execute") {
    return "No. Skip this suggestion and ask me one concise clarification question so we can continue with the exact plan.";
  }
  return "No. Skip this suggestion and ask me one concise clarification question so we can continue directly with the draft.";
}
