const SETTINGS_STORAGE_KEY = "organia_settings";
const DEFAULT_DATE_FORMAT = "DD/MM/YYYY";

const pad = (value) => String(value).padStart(2, "0");

const safeParseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
