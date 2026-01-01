import type { Resource, ResourceLanguage } from "i18next";
import type { LanguageCode } from "./config";

type NamespaceLoader = () => Promise<ResourceLanguage>;

const namespaceLoaders: Record<LanguageCode, NamespaceLoader> = {
  en: async () => ({
    common: (await import("./locales/en/common.json")).default,
    clients: (await import("./locales/en/clients.json")).default,
    settings: (await import("./locales/en/settings.json")).default,
    profile: (await import("./locales/en/profile.json")).default,
    dossiers: (await import("./locales/en/dossiers.json")).default,
    cases: (await import("./locales/en/cases.json")).default,
    tasks: (await import("./locales/en/tasks.json")).default,
    personalTasks: (await import("./locales/en/personalTasks.json")).default,
    officers: (await import("./locales/en/officers.json")).default,
    accounting: (await import("./locales/en/accounting.json")).default,
    notFound: (await import("./locales/en/notFound.json")).default,
    sessions: (await import("./locales/en/sessions.json")).default,
    chatbot: (await import("./locales/en/chatbot.json")).default,
    layout: (await import("./locales/en/layout.json")).default,
    notifications: (await import("./locales/en/notifications.json")).default,
  }),
  fr: async () => ({
    common: (await import("./locales/fr/common.json")).default,
    clients: (await import("./locales/fr/clients.json")).default,
    settings: (await import("./locales/fr/settings.json")).default,
    profile: (await import("./locales/fr/profile.json")).default,
    dossiers: (await import("./locales/fr/dossiers.json")).default,
    cases: (await import("./locales/fr/cases.json")).default,
    tasks: (await import("./locales/fr/tasks.json")).default,
    personalTasks: (await import("./locales/fr/personalTasks.json")).default,
    officers: (await import("./locales/fr/officers.json")).default,
    accounting: (await import("./locales/fr/accounting.json")).default,
    notFound: (await import("./locales/fr/notFound.json")).default,
    sessions: (await import("./locales/fr/sessions.json")).default,
    chatbot: (await import("./locales/fr/chatbot.json")).default,
    layout: (await import("./locales/fr/layout.json")).default,
    notifications: (await import("./locales/fr/notifications.json")).default,
  }),
  ar: async () => ({
    common: (await import("./locales/ar/common.json")).default,
    clients: (await import("./locales/ar/clients.json")).default,
    settings: (await import("./locales/ar/settings.json")).default,
    profile: (await import("./locales/ar/profile.json")).default,
    dossiers: (await import("./locales/ar/dossiers.json")).default,
    cases: (await import("./locales/ar/cases.json")).default,
    tasks: (await import("./locales/ar/tasks.json")).default,
    personalTasks: (await import("./locales/ar/personalTasks.json")).default,
    officers: (await import("./locales/ar/officers.json")).default,
    accounting: (await import("./locales/ar/accounting.json")).default,
    notFound: (await import("./locales/ar/notFound.json")).default,
    sessions: (await import("./locales/ar/sessions.json")).default,
    chatbot: (await import("./locales/ar/chatbot.json")).default,
    layout: (await import("./locales/ar/layout.json")).default,
    notifications: (await import("./locales/ar/notifications.json")).default,
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
