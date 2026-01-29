import type { Resource, ResourceLanguage } from "i18next";
import type { LanguageCode } from "./config";

type NamespaceLoader = () => Promise<ResourceLanguage>;

const safeImport = async (
  loader: () => Promise<{ default: ResourceLanguage[keyof ResourceLanguage] }>,
  label: string
) => {
  try {
    const mod = await loader();
    return mod.default;
  } catch (error) {
    console.error(`[i18n] Failed to load namespace ${label}`, error);
    return {};
  }
};

const namespaceLoaders: Record<LanguageCode, NamespaceLoader> = {
  en: async () => ({
    common: await safeImport(() => import("./locales/en/common.json"), "en/common"),
    auth: await safeImport(() => import("./locales/en/auth.json"), "en/auth"),
    clients: await safeImport(() => import("./locales/en/clients.json"), "en/clients"),
    settings: await safeImport(() => import("./locales/en/settings.json"), "en/settings"),
    profile: await safeImport(() => import("./locales/en/profile.json"), "en/profile"),
    dossiers: await safeImport(() => import("./locales/en/dossiers.json"), "en/dossiers"),
    lawsuits: await safeImport(() => import("./locales/en/lawsuits.json"), "en/lawsuits"),
    tasks: await safeImport(() => import("./locales/en/tasks.json"), "en/tasks"),
    personalTasks: await safeImport(() => import("./locales/en/personalTasks.json"), "en/personalTasks"),
    officers: await safeImport(() => import("./locales/en/officers.json"), "en/officers"),
    accounting: await safeImport(() => import("./locales/en/accounting.json"), "en/accounting"),
    notFound: await safeImport(() => import("./locales/en/notFound.json"), "en/notFound"),
    sessions: await safeImport(() => import("./locales/en/sessions.json"), "en/sessions"),
    chatbot: await safeImport(() => import("./locales/en/chatbot.json"), "en/chatbot"),
    layout: await safeImport(() => import("./locales/en/layout.json"), "en/layout"),
    notifications: await safeImport(() => import("./locales/en/notifications.json"), "en/notifications"),
    missions: await safeImport(() => import("./locales/en/missions.json"), "en/missions"),
    domain: await safeImport(() => import("./locales/en/domain.json"), "en/domain"),
    onboarding: await safeImport(() => import("./locales/en/onboarding.json"), "en/onboarding"),
    tutorial: await safeImport(() => import("./locales/en/tutorial.json"), "en/tutorial"),
    setupflow: await safeImport(() => import("./locales/en/setupflow.json"), "en/setupflow"),
    lock: await safeImport(() => import("./locales/en/lock.json"), "en/lock"),
    activation: await safeImport(() => import("./locales/en/activation.json"), "en/activation"),
    license: await safeImport(() => import("./locales/en/license.json"), "en/license"),
    referrals: await safeImport(() => import("./locales/en/referrals.json"), "en/referrals"),
  }),
  fr: async () => ({
    common: await safeImport(() => import("./locales/fr/common.json"), "fr/common"),
    auth: await safeImport(() => import("./locales/fr/auth.json"), "fr/auth"),
    clients: await safeImport(() => import("./locales/fr/clients.json"), "fr/clients"),
    settings: await safeImport(() => import("./locales/fr/settings.json"), "fr/settings"),
    profile: await safeImport(() => import("./locales/fr/profile.json"), "fr/profile"),
    dossiers: await safeImport(() => import("./locales/fr/dossiers.json"), "fr/dossiers"),
    lawsuits: await safeImport(() => import("./locales/fr/lawsuits.json"), "fr/lawsuits"),
    tasks: await safeImport(() => import("./locales/fr/tasks.json"), "fr/tasks"),
    personalTasks: await safeImport(() => import("./locales/fr/personalTasks.json"), "fr/personalTasks"),
    officers: await safeImport(() => import("./locales/fr/officers.json"), "fr/officers"),
    accounting: await safeImport(() => import("./locales/fr/accounting.json"), "fr/accounting"),
    notFound: await safeImport(() => import("./locales/fr/notFound.json"), "fr/notFound"),
    sessions: await safeImport(() => import("./locales/fr/sessions.json"), "fr/sessions"),
    chatbot: await safeImport(() => import("./locales/fr/chatbot.json"), "fr/chatbot"),
    layout: await safeImport(() => import("./locales/fr/layout.json"), "fr/layout"),
    notifications: await safeImport(() => import("./locales/fr/notifications.json"), "fr/notifications"),
    missions: await safeImport(() => import("./locales/fr/missions.json"), "fr/missions"),
    domain: await safeImport(() => import("./locales/fr/domain.json"), "fr/domain"),
    onboarding: await safeImport(() => import("./locales/fr/onboarding.json"), "fr/onboarding"),
    tutorial: await safeImport(() => import("./locales/fr/tutorial.json"), "fr/tutorial"),
    setupflow: await safeImport(() => import("./locales/fr/setupflow.json"), "fr/setupflow"),
    lock: await safeImport(() => import("./locales/fr/lock.json"), "fr/lock"),
    activation: await safeImport(() => import("./locales/fr/activation.json"), "fr/activation"),
    license: await safeImport(() => import("./locales/fr/license.json"), "fr/license"),
    referrals: await safeImport(() => import("./locales/fr/referrals.json"), "fr/referrals"),
  }),
  ar: async () => ({
    common: await safeImport(() => import("./locales/ar/common.json"), "ar/common"),
    auth: await safeImport(() => import("./locales/ar/auth.json"), "ar/auth"),
    clients: await safeImport(() => import("./locales/ar/clients.json"), "ar/clients"),
    settings: await safeImport(() => import("./locales/ar/settings.json"), "ar/settings"),
    profile: await safeImport(() => import("./locales/ar/profile.json"), "ar/profile"),
    dossiers: await safeImport(() => import("./locales/ar/dossiers.json"), "ar/dossiers"),
    lawsuits: await safeImport(() => import("./locales/ar/lawsuits.json"), "ar/lawsuits"),
    tasks: await safeImport(() => import("./locales/ar/tasks.json"), "ar/tasks"),
    personalTasks: await safeImport(() => import("./locales/ar/personalTasks.json"), "ar/personalTasks"),
    officers: await safeImport(() => import("./locales/ar/officers.json"), "ar/officers"),
    accounting: await safeImport(() => import("./locales/ar/accounting.json"), "ar/accounting"),
    notFound: await safeImport(() => import("./locales/ar/notFound.json"), "ar/notFound"),
    sessions: await safeImport(() => import("./locales/ar/sessions.json"), "ar/sessions"),
    chatbot: await safeImport(() => import("./locales/ar/chatbot.json"), "ar/chatbot"),
    layout: await safeImport(() => import("./locales/ar/layout.json"), "ar/layout"),
    notifications: await safeImport(() => import("./locales/ar/notifications.json"), "ar/notifications"),
    missions: await safeImport(() => import("./locales/ar/missions.json"), "ar/missions"),
    domain: await safeImport(() => import("./locales/ar/domain.json"), "ar/domain"),
    onboarding: await safeImport(() => import("./locales/ar/onboarding.json"), "ar/onboarding"),
    tutorial: await safeImport(() => import("./locales/ar/tutorial.json"), "ar/tutorial"),
    setupflow: await safeImport(() => import("./locales/ar/setupflow.json"), "ar/setupflow"),
    lock: await safeImport(() => import("./locales/ar/lock.json"), "ar/lock"),
    activation: await safeImport(() => import("./locales/ar/activation.json"), "ar/activation"),
    license: await safeImport(() => import("./locales/ar/license.json"), "ar/license"),
    referrals: await safeImport(() => import("./locales/ar/referrals.json"), "ar/referrals"),
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

