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

export const DEFAULT_LANGUAGE: LanguageCode = "fr";
export const FALLBACK_LANGUAGE: LanguageCode = DEFAULT_LANGUAGE;

export const SUPPORTED_LANGUAGE_CODES: LanguageCode[] = LANGUAGE_REGISTRY.map(
  (language) => language.code
);

export const getLanguageDefinition = (
  code: string | undefined
): LanguageDefinition => {
  const normalized = LANGUAGE_REGISTRY.find((language) => language.code === code);
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
  return SUPPORTED_LANGUAGE_CODES.includes(requested as LanguageCode)
    ? (requested as LanguageCode)
    : DEFAULT_LANGUAGE;
};
