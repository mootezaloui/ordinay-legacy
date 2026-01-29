import { i18nInstance } from "../i18n";
import { DEFAULT_LANGUAGE, getLanguageLocale } from "../i18n/config";

export const DEFAULT_CURRENCY = "TND";
export const SUPPORTED_CURRENCIES = ["TND", "EUR", "USD"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const SETTINGS_STORAGE_KEY = "ordinay_settings";

export const normalizeCurrencyCode = (value?: string | null): CurrencyCode => {
  if (!value) return DEFAULT_CURRENCY;
  const normalized = value.toString().trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(normalized as CurrencyCode)) {
    return normalized as CurrencyCode;
  }
  return DEFAULT_CURRENCY;
};

export const getStoredCurrency = (): CurrencyCode => {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CURRENCY;
    const parsed = JSON.parse(raw);
    return normalizeCurrencyCode(parsed?.settings?.currency);
  } catch (error) {
    console.warn("[Currency] Failed to read stored currency", error);
    return DEFAULT_CURRENCY;
  }
};

export const getCurrencyFromSettings = (settings?: {
  currency?: string | null;
}): CurrencyCode => {
  return normalizeCurrencyCode(settings?.currency);
};

const resolveLocale = (locale?: string): string => {
  if (locale) return locale;
  return getLanguageLocale(i18nInstance.language || DEFAULT_LANGUAGE);
};

export const formatCurrency = (
  amount: number | string | null | undefined,
  options: {
    currency?: string | null;
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    currencyDisplay?: Intl.NumberFormatOptions["currencyDisplay"];
  } = {}
): string => {
  if (amount === null || amount === undefined || amount === "") return "-";
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(numeric)) return "-";

  const currency = normalizeCurrencyCode(options.currency || getStoredCurrency());
  const locale = resolveLocale(options.locale);
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options;
  const currencyDisplay =
    options.currencyDisplay ||
    (locale.toLowerCase().startsWith("ar") ? "narrowSymbol" : "code");

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(numeric);
};

export const getCurrencyDisplayLabel = (
  currencyCode?: string | null,
  locale?: string
): string => {
  const currency = normalizeCurrencyCode(currencyCode || getStoredCurrency());
  const resolvedLocale = resolveLocale(locale);
  const currencyDisplay = resolvedLocale.toLowerCase().startsWith("ar")
    ? "narrowSymbol"
    : "code";

  const formatted = new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency,
    currencyDisplay,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0);

  return formatted.replace(/[0-9\s.,]/g, "").trim();
};
