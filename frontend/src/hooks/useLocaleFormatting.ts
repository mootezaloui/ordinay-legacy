import { useMemo } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { getLanguageLocale, type LanguageCode } from "../i18n/config";

type DateInput = Date | number | string | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const useLocaleFormatting = () => {
  const { settings } = useSettings();
  const locale = getLanguageLocale(settings?.language as LanguageCode | undefined);
  const timeZone = settings?.timezone;

  const baseDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone,
      }),
    [locale, timeZone]
  );

  const baseDateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }),
    [locale, timeZone]
  );

  const formatDate = (value: DateInput, options?: Intl.DateTimeFormatOptions): string => {
    const date = toDate(value);
    if (!date) return "";
    if (!options) return baseDateFormatter.format(date);
    return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(date);
  };

  const formatDateTime = (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions
  ): string => {
    const date = toDate(value);
    if (!date) return "";
    if (!options) return baseDateTimeFormatter.format(date);
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
      ...options,
    }).format(date);
  };

  const formatNumber = (
    value: number | bigint | null | undefined,
    options?: Intl.NumberFormatOptions
  ): string => {
    if (value === null || value === undefined) return "";
    return new Intl.NumberFormat(locale, options).format(value);
  };

  const formatCurrency = (
    value: number | null | undefined,
    currency: string,
    options?: Intl.NumberFormatOptions
  ): string => {
    if (value === null || value === undefined) return "";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...options,
    }).format(value);
  };

  return {
    locale,
    timeZone,
    formatDate,
    formatDateTime,
    formatNumber,
    formatCurrency,
  };
};
