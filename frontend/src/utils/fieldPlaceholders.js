export const PLACEHOLDER_CONTEXT = Object.freeze({
  INPUT: "input",
  SEARCH: "search",
  FILTER: "filter",
  SELECT: "select",
  SEARCHABLE_SELECT: "searchableSelect",
});

const DEFAULT_PLACEHOLDERS = Object.freeze({
  [PLACEHOLDER_CONTEXT.INPUT]: {
    key: "form.placeholder.input",
    defaultValue: "Enter a value",
  },
  [PLACEHOLDER_CONTEXT.SEARCH]: {
    key: "form.placeholder.search",
    defaultValue: "Search...",
  },
  [PLACEHOLDER_CONTEXT.FILTER]: {
    key: "form.placeholder.filter",
    defaultValue: "Filter...",
  },
  [PLACEHOLDER_CONTEXT.SELECT]: {
    key: "form.placeholder.select",
    defaultValue: "Choose an option",
  },
  [PLACEHOLDER_CONTEXT.SEARCHABLE_SELECT]: {
    key: "form.placeholder.searchableSelect",
    defaultValue: "Search or choose an option",
  },
});

const SEARCH_LOADING_PLACEHOLDER = Object.freeze({
  key: "form.placeholder.loadingSearch",
  defaultValue: "Searching...",
});

const hasPlaceholder = (value) => typeof value === "string" && value.trim().length > 0;

export function resolveContextualPlaceholder({
  t,
  placeholder,
  context = PLACEHOLDER_CONTEXT.INPUT,
  isLoading = false,
}) {
  if (hasPlaceholder(placeholder)) {
    return placeholder;
  }

  if (isLoading) {
    return t(SEARCH_LOADING_PLACEHOLDER.key, {
      defaultValue: SEARCH_LOADING_PLACEHOLDER.defaultValue,
    });
  }

  const fallback =
    DEFAULT_PLACEHOLDERS[context] || DEFAULT_PLACEHOLDERS[PLACEHOLDER_CONTEXT.INPUT];

  return t(fallback.key, { defaultValue: fallback.defaultValue });
}
