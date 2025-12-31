import type { Resource, ResourceLanguage } from "i18next";
import type { LanguageCode } from "./config";

type NamespaceLoader = () => Promise<ResourceLanguage>;

const namespaceLoaders: Record<LanguageCode, NamespaceLoader> = {
  en: async () => ({
    common: (await import("./locales/en/common.json")).default,
  }),
  fr: async () => ({
    common: (await import("./locales/fr/common.json")).default,
  }),
  ar: async () => ({
    common: (await import("./locales/ar/common.json")).default,
  }),
};

export const loadLanguageNamespaces = async (
  language: LanguageCode
): Promise<ResourceLanguage> => {
  const loader = namespaceLoaders[language];
  if (!loader) {
    return {};
  }
  return loader();
};

export const loadResourceStore = async (
  languages: LanguageCode[]
): Promise<Resource> => {
  const pairs = await Promise.all(
    languages.map(async (language) => {
      const namespaces = await loadLanguageNamespaces(language);
      return [language, namespaces] as const;
    })
  );

  return Object.fromEntries(pairs);
};
