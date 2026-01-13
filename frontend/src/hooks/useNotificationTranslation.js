/**
 * useNotificationTranslation Hook
 *
 * Translates notification template keys at render time based on active language.
 * This ensures notifications adapt to language changes without re-creation.
 *
 * Architecture:
 * - Notifications store template_key + params (language-neutral)
 * - This hook translates them on-demand using active i18n language
 * - Language changes trigger re-render ONLY, not notification creation
 */

import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { formatDateLocalized } from "../utils/dateFormat";
import { translateNotificationCopy } from "../utils/notificationVariants";

/**
 * Format date parameters in notification params
 * Detects ISO date strings and formats them using locale-aware formatter
 * @param {Object} params - Notification params
 * @param {string} language - Current i18n language
 * @returns {Object} Params with formatted dates
 */
const formatDateParams = (params, language) => {
  if (!params || typeof params !== "object") return params;

  const formatted = { ...params };

  // ISO date pattern: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DD
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

  Object.keys(formatted).forEach((key) => {
    const value = formatted[key];

    // Check if value looks like an ISO date string
    if (typeof value === "string" && isoDatePattern.test(value)) {
      // Format with locale-aware formatter
      formatted[key] = formatDateLocalized(value, language, {
        includeTime: false,
        dateStyle: "medium",
      });
    }
  });

  return formatted;
};

/**
 * Translate a single notification object
 * @param {Object} notification - Notification with template_key and params
 * @returns {Object} Notification with translated title and message
 */
export function useNotificationTranslation(notification) {
  const { t, i18n } = useTranslation("notifications");

  return useMemo(() => {
    if (!notification) return null;

    // If notification already has title/message (legacy), return as-is
    if (notification.title && notification.message) {
      return notification;
    }

    // Extract template key and params
    const templateKey = notification.template_key || notification.templateKey;
    const params = notification.params || {};

    if (!templateKey) {
      console.warn("[i18n] Notification missing template_key:", notification);
      return {
        ...notification,
        title: t("center.notification"),
        message: "",
      };
    }

    // Format date params with current language
    const formattedParams = formatDateParams(params, i18n.language);

    const titleKey = `${templateKey}.title`;
    const messageKey = `${templateKey}.message`;
    const paramSeed = [
      formattedParams.taskTitle,
      formattedParams.missionTitle,
      formattedParams.sessionTitle,
      formattedParams.caseNumber,
      formattedParams.dossierNumber,
      formattedParams.clientName,
      formattedParams.title,
      formattedParams.reference,
    ]
      .filter(Boolean)
      .join("|");

    const seedParts = [
      notification.dedupe_key || notification.dedupeKey || notification.id,
      notification.entityType,
      notification.entityId,
      templateKey,
      paramSeed,
    ].filter(Boolean);

    const copy = translateNotificationCopy({
      titleKey,
      messageKey,
      titleParams: formattedParams,
      messageParams: formattedParams,
      seedParts,
      timestamp: notification.timestamp,
    });

    const title = copy.title || t("center.notification");
    const message = copy.message || "";

    return {
      ...notification,
      title,
      message,
    };
  }, [notification, t, i18n.language]);
}

/**
 * Translate an array of notifications
 * @param {Array} notifications - Array of notifications
 * @returns {Array} Array with translated titles and messages
 */
export function useNotificationListTranslation(notifications) {
  const { t, i18n } = useTranslation("notifications");

  return useMemo(() => {
    if (!Array.isArray(notifications)) return [];

    return notifications.map((notification) => {
      // If notification already has title/message (legacy), return as-is
      if (notification.title && notification.message) {
        return notification;
      }

      const templateKey = notification.template_key || notification.templateKey;
      const params = notification.params || {};

      if (!templateKey) {
        return {
          ...notification,
          title: t("center.notification"),
          message: "",
        };
      }

      // Format date params with current language
      const formattedParams = formatDateParams(params, i18n.language);

      const titleKey = `${templateKey}.title`;
      const messageKey = `${templateKey}.message`;
      const paramSeed = [
        formattedParams.taskTitle,
        formattedParams.missionTitle,
        formattedParams.sessionTitle,
        formattedParams.caseNumber,
        formattedParams.dossierNumber,
        formattedParams.clientName,
        formattedParams.title,
        formattedParams.reference,
      ]
        .filter(Boolean)
        .join("|");

      const seedParts = [
        notification.dedupe_key || notification.dedupeKey || notification.id,
        notification.entityType,
        notification.entityId,
        templateKey,
        paramSeed,
      ].filter(Boolean);

      const copy = translateNotificationCopy({
        titleKey,
        messageKey,
        titleParams: formattedParams,
        messageParams: formattedParams,
        seedParts,
        timestamp: notification.timestamp,
      });

      const title = copy.title || t("center.notification");
      const message = copy.message || "";

      return {
        ...notification,
        title,
        message,
      };
    });
  }, [notifications, t, i18n.language]);
}

/**
 * Get translated severity config
 * Updates when language changes (not memoized with empty deps)
 */
export function useSeverityConfig() {
  const { t } = useTranslation("notifications");

  // Memoize with t as dependency so it updates on language change
  return useMemo(
    () => ({
      success: {
        icon: "fas fa-check-circle",
        titleKey: "severity.success",
        duration: 3500,
      },
      info: {
        icon: "fas fa-info-circle",
        titleKey: "severity.info",
        duration: 4000,
      },
      warning: {
        icon: "fas fa-exclamation-triangle",
        titleKey: "severity.warning",
        duration: 8500,
      },
      error: {
        icon: "fas fa-exclamation-circle",
        titleKey: "severity.error",
        duration: 0,
      },
    }),
    [t]
  );
}

/**
 * Translate severity title on-demand
 */
export function translateSeverityTitle(severity, t) {
  const titleKeys = {
    success: "severity.success",
    info: "severity.info",
    warning: "severity.warning",
    error: "severity.error",
  };

  const key = titleKeys[severity] || titleKeys.info;
  return t(`notifications:${key}`);
}
