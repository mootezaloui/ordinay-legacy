import React from "react";
import { useTranslation } from "react-i18next";

/**
 * ReadOnlyField
 * Canonical display block for non-editable values inside FormModal.
 */
export default function ReadOnlyField({
  label,
  value,
  hint,
  icon,
  compact = false,
  placeholder,
}) {
  const { t } = useTranslation("common");
  const resolvedPlaceholder = placeholder || t("form.placeholder.notProvided");
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div
      className={`w-full rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 ${
        compact ? "px-3 py-2" : "px-3.5 py-2.5"
      }`}
      aria-readonly="true"
      role="presentation"
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
            <i className={`${icon} text-sm`} aria-hidden="true"></i>
          </div>
        )}
        <div className="flex-1 space-y-1">
          {label && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {label}
            </p>
          )}
          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug break-words">
            {hasValue ? value : <span className="text-slate-400 dark:text-slate-500">{resolvedPlaceholder}</span>}
          </p>
          {hint && (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
