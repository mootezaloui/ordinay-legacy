import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGE_CODES,
  type LanguageCode,
  getLanguageDefinition,
  getLanguageDirection,
  getInitialLanguage,
} from "./config";
import { loadLanguageNamespaces, loadResourceStore } from "./loaders";

const loadedLanguages = new Set<LanguageCode>();
let initPromise: Promise<I18nInstance> | null = null;

const applyLanguageToDocument = (language: LanguageCode) => {
  if (typeof document === "undefined") return;

  const direction = getLanguageDirection(language);
  const { locale } = getLanguageDefinition(language);
  const root = document.documentElement;

  root.lang = language;
  root.dir = direction;
  root.dataset.locale = locale;

  if (direction === "rtl") {
    root.classList.add("rtl");
  } else {
    root.classList.remove("rtl");
  }
};

const addLanguageResources = async (language: LanguageCode) => {
  if (loadedLanguages.has(language)) return;

  const namespaces = await loadLanguageNamespaces(language);
  Object.entries(namespaces).forEach(([namespace, resources]) => {
    i18next.addResourceBundle(language, namespace, resources, true, true);
  });
  loadedLanguages.add(language);
};

export const initI18n = async (language?: string) => {
  if (!initPromise) {
    const initialLanguage = getInitialLanguage(language);
    const baseLanguages = Array.from(
      new Set<LanguageCode>([FALLBACK_LANGUAGE, initialLanguage])
    );

    initPromise = (async () => {
      const resources = await loadResourceStore(baseLanguages);

      await i18next.use(initReactI18next).init({
        resources,
        lng: initialLanguage,
        fallbackLng: FALLBACK_LANGUAGE,
        supportedLngs: SUPPORTED_LANGUAGE_CODES,
        ns: [
          "common",
          "auth",
          "clients",
          "settings",
          "profile",
          "dossiers",
          "lawsuits",
          "tasks",
          "personalTasks",
          "officers",
          "accounting",
          "notFound",
          "sessions",
          "chatbot",
          "layout",
          "notifications",
          "missions",
          "domain",
          "onboarding",
          "tutorial",
          "setupflow",
          "lock",
          "activation",
          "license",
          "referrals",
        ],
        defaultNS: "common",
        interpolation: {
          escapeValue: false,
        },
        returnEmptyString: false,
        returnNull: false,
        cleanCode: true,
      });

      baseLanguages.forEach((code) => loadedLanguages.add(code));
      applyLanguageToDocument(initialLanguage);
      return i18next;
    })();
  }

  return initPromise;
};

export const changeAppLanguage = async (language: LanguageCode) => {
  const target = getInitialLanguage(language);
  await initI18n(target);
  await addLanguageResources(target);
  await i18next.changeLanguage(target);
  applyLanguageToDocument(target);
};

export const i18nInstance = i18next;
export const t = (...args: Parameters<I18nInstance["t"]>) =>
  i18next.t(...args);
