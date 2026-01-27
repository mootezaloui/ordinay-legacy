export type LanguageCode = "en" | "fr" | "ar";

export interface LanguageDefinition {
  code: LanguageCode;
  label: string;
  direction: "ltr" | "rtl";
  locale: string;
}

export const LANGUAGE_REGISTRY: LanguageDefinition[] = [
  { code: "en", label: "English", direction: "ltr", locale: "en-US" },
  { code: "fr", label: "Français", direction: "ltr", locale: "fr-FR" },
  { code: "ar", label: "العربية", direction: "rtl", locale: "ar-TN" },
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const FALLBACK_LANGUAGE: LanguageCode = DEFAULT_LANGUAGE;

export const SUPPORTED_LANGUAGE_CODES: LanguageCode[] = LANGUAGE_REGISTRY.map(
  (language) => language.code
);

const normalizeLanguageCode = (code: string | undefined | null): LanguageCode | null => {
  if (!code) return null;
  const primary = code.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGE_CODES.includes(primary as LanguageCode)
    ? (primary as LanguageCode)
    : null;
};

export const getLanguageDefinition = (
  code: string | undefined
): LanguageDefinition => {
  const normalizedCode = normalizeLanguageCode(code);
  const normalized = LANGUAGE_REGISTRY.find(
    (language) => language.code === normalizedCode
  );
  return (
    normalized ??
    LANGUAGE_REGISTRY.find((language) => language.code === DEFAULT_LANGUAGE)! // DEFAULT_LANGUAGE is in registry
  );
};

export const getLanguageDirection = (code: string | undefined): "ltr" | "rtl" =>
  getLanguageDefinition(code).direction;

export const getLanguageLocale = (code: string | undefined): string =>
  getLanguageDefinition(code).locale;

export const getInitialLanguage = (requested?: string): LanguageCode => {
  return normalizeLanguageCode(requested) ?? DEFAULT_LANGUAGE;
};

export const getSystemLanguage = (): LanguageCode => {
  const candidates: string[] = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
  }
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved) {
      candidates.push(resolved);
    }
  } catch {
    // Ignore environments without Intl locale resolution
  }
  for (const candidate of candidates) {
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_LANGUAGE;
};
