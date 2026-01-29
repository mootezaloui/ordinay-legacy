const SETTINGS_STORAGE_KEY = "ordinay_settings";
const DEFAULT_DATE_FORMAT = "DD/MM/YYYY";

const pad = (value) => String(value).padStart(2, "0");

const safeParseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Get locale from i18next current language
 * Maps language codes to Intl locales
 */
const getLocaleFromLanguage = (language) => {
  const localeMap = {
    en: "en-US",
    fr: "fr-FR",
    ar: "ar-TN",
  };
  return localeMap[language] || "fr-FR";
};

/**
 * Format date using locale-aware Intl.DateTimeFormat
 * This respects the user's language and provides localized month names
 * @param {string|Date} value - Date to format
 * @param {string} language - i18next language code (en, fr, ar)
 * @param {object} options - Formatting options
 * @returns {string} Localized date string
 */
export const formatDateLocalized = (
  value,
  language = "fr",
  { includeTime = false, dateStyle = "medium", timeStyle = "short" } = {}
) => {
  const date = safeParseDate(value);
  if (!date) return "";

  const locale = getLocaleFromLanguage(language);

  try {
    if (includeTime) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle,
        timeStyle,
      }).format(date);
    } else {
      return new Intl.DateTimeFormat(locale, {
        dateStyle,
      }).format(date);
    }
  } catch (error) {
    console.warn("[dateFormat] Intl.DateTimeFormat failed, falling back", error);
    // Fallback to simple format
    return formatDateValue(value);
  }
};

export const getStoredDateFormat = () => {
  if (typeof window === "undefined") return DEFAULT_DATE_FORMAT;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_DATE_FORMAT;
    const parsed = JSON.parse(raw);
    return parsed?.settings?.dateFormat || DEFAULT_DATE_FORMAT;
  } catch (error) {
    console.warn("[dateFormat] Failed to read stored settings", error);
    return DEFAULT_DATE_FORMAT;
  }
};

export const formatDateValue = (
  value,
  format = getStoredDateFormat(),
  { includeTime = false } = {}
) => {
  const date = safeParseDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  let formatted;
  switch (format) {
    case "YYYY/MM/DD":
      formatted = `${year}/${month}/${day}`;
      break;
    case "DD-MM-YYYY":
      formatted = `${day}-${month}-${year}`;
      break;
    case "MM-DD-YYYY":
      formatted = `${month}-${day}-${year}`;
      break;
    case "MM/DD/YYYY":
      formatted = `${month}/${day}/${year}`;
      break;
    case "YYYY-MM-DD":
      formatted = `${year}-${month}-${day}`;
      break;
    case "DD/MM/YYYY":
    default:
      formatted = `${day}/${month}/${year}`;
      break;
  }

  if (includeTime) {
    formatted = `${formatted} ${hours}:${minutes}`;
  }

  return formatted;
};

export const formatDateTimeValue = (value, format, options = {}) =>
  formatDateValue(value, format, { ...options, includeTime: true });

export const getDefaultDateFormat = () => DEFAULT_DATE_FORMAT;
