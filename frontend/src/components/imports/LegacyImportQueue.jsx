import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../services/api/client";
import { useToast } from "../../contexts/ToastContext";
import Table from "../table/Table";
import TableBody from "../table/TableBody";
import TableRow from "../table/TableRow";
import TableCell from "../table/TableCell";

const DEFAULT_PAGE_SIZE = 25;
const ARCHIVE_STORAGE_KEY = "ordinay_import_archives";

const parseJsonValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }
  return value;
};

const toDisplayText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

const toNormalizedText = (value) => {
  if (value === null || value === undefined) return "";
  const parsed = parseJsonValue(value);
  if (typeof parsed === "string") return parsed;
  try {
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return String(parsed);
  }
};

const formatValidationError = (error) => {
  if (!error) return "";
  if (typeof error !== "object") return String(error);
  const message = error.message || "Validation error";
  const fieldPrefix = error.field ? `${error.field}: ` : "";
  const details = [];
  if (error.existing_id) {
    details.push(`existing #${error.existing_id}`);
  }
  if (Array.isArray(error.allowed) && error.allowed.length > 0) {
    details.push(`allowed: ${error.allowed.join(", ")}`);
  }
  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  return `${fieldPrefix}${message}${suffix}`;
};

const parseValidationPayload = (value) => {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return {
    errors: parsed.errors || [],
    missingFields: parsed.missing_fields || parsed.missingFields || [],
    conflicts: parsed.conflicts || [],
  };
};

const toBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return false;
};

const loadArchivedIds = () => {
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
  } catch (error) {
    return new Set();
  }
};

const saveArchivedIds = (ids) => {
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify([...ids]));
  } catch (error) {
    console.warn("[LegacyImportQueue] Failed to store archive state", error);
  }
};

const buildSessionKey = (item) => {
  const importedAt = item?.imported_at ? String(item.imported_at).trim() : "";
  const source = item?.import_source ? String(item.import_source).trim() : "";
  if (!importedAt && !source) return `id-${item.id}`;
  return `${importedAt || "unknown"}|${source || "-"}`;
};

const toTimestamp = (value) => {
  if (!value) return 0;
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? 0 : time;
};

const hasDuplicateError = (validationErrors) => {
  if (!validationErrors) return false;
  const text =
    typeof validationErrors === "string"
      ? validationErrors
      : JSON.stringify(validationErrors);
  return text.toLowerCase().includes("duplicate client detected");
};

function ImportReviewDrawer({ item, onClose, onUpdated, isArchived }) {
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const [normalizedText, setNormalizedText] = useState("");
  const [parseError, setParseError] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (!item) return;
    setNormalizedText(toNormalizedText(item.normalized_payload));
    setParseError("");
    setValidationResult(parseValidationPayload(item.validation_errors));
  }, [item]);

  if (!item) return null;

  const parsedPayload = parseJsonValue(item.payload);
  const payloadText = toDisplayText(parsedPayload);
  const isValidated = toBoolean(item.validated);

  const parseNormalizedPayload = () => {
    if (!normalizedText.trim()) {
      setParseError(t("importQueue.review.parseRequired"));
      return null;
    }
    try {
      const parsed = JSON.parse(normalizedText);
      setParseError("");
      return parsed;
    } catch (error) {
      setParseError(t("importQueue.review.parseError"));
      return null;
    }
  };

  const handleNormalize = async () => {
    const normalizedPayload = parseNormalizedPayload();
    if (!normalizedPayload) return;
    setIsNormalizing(true);
    try {
      const result = await apiClient.post(`/imports/${item.id}/normalize`, {
        normalized_payload: normalizedPayload,
      });
      setValidationResult(result?.validation || null);
      showToast(t("importQueue.review.normalizeSuccess"), "success");
      if (onUpdated) {
        onUpdated();
      }
    } catch (error) {
      console.error("[LegacyImportQueue] Normalize failed", error);
      showToast(error?.message || t("importQueue.review.normalizeError"), "error");
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleValidate = async () => {
    const normalizedPayload = parseNormalizedPayload();
    if (!normalizedPayload) return;
    setIsValidating(true);
    try {
      const normalizeResult = await apiClient.post(`/imports/${item.id}/normalize`, {
        normalized_payload: normalizedPayload,
      });
      const validation = normalizeResult?.validation;
      setValidationResult(validation || null);
      if (!validation?.valid) {
        showToast(t("importQueue.review.validationFailed"), "warning");
        return;
      }
      await apiClient.post(`/imports/${item.id}/validate`, {
        normalized_payload: normalizedPayload,
      });
      showToast(t("importQueue.review.applySuccess"), "success");
      if (onUpdated) {
        onUpdated();
      }
      onClose();
    } catch (error) {
      console.error("[LegacyImportQueue] Validate failed", error);
      showToast(error?.message || t("importQueue.review.validateError"), "error");
    } finally {
      setIsValidating(false);
    }
  };

  const errors = validationResult?.errors || [];
  const missingFields = validationResult?.missingFields || [];
  const conflicts = validationResult?.conflicts || [];
  const hasValidationIssues =
    errors.length > 0 || missingFields.length > 0 || conflicts.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 md:inset-auto md:right-0 md:top-0 md:h-full md:w-full md:max-w-3xl bg-white shadow-2xl dark:bg-slate-900 pt-[var(--titlebar-height)] md:pt-0">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("importQueue.review.title", {
                  id: item.id,
                  entity: t("importQueue.entities.client"),
                })}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("importQueue.review.subtitle")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label={t("actions.close")}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isValidated
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {isValidated
                    ? t("importQueue.status.validated")
                    : t("importQueue.status.pending")}
                </span>
                {item.resolved_entity_id && isValidated && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t("importQueue.status.resolved", { id: item.resolved_entity_id })}
                  </span>
                )}
                {item.validation_errors && (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {t("importQueue.status.issues")}
                  </span>
                )}
                {isArchived && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {t("importQueue.status.archived")}
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-3 text-[11px] text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                <div>
                  <span className="block uppercase tracking-wide">
                    {t("importQueue.columns.importedAt")}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {item.imported_at || "-"}
                  </span>
                </div>
                <div>
                  <span className="block uppercase tracking-wide">
                    {t("importQueue.columns.source")}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {item.import_source || "-"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("importQueue.review.notice")}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t("importQueue.review.payload")}
              </h3>
              <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {payloadText || t("importQueue.preview.empty")}
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t("importQueue.review.normalized")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("importQueue.review.normalizedHelp")}
              </p>
              <textarea
                value={normalizedText}
                onChange={(event) => setNormalizedText(event.target.value)}
                placeholder={t("importQueue.review.normalizedPlaceholder")}
                rows={10}
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
              {parseError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {parseError}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {t("importQueue.review.hint")}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t("importQueue.review.validationTitle")}
              </h3>
              {!hasValidationIssues && validationResult?.valid && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t("importQueue.review.validationOk")}
                </p>
              )}
              {hasValidationIssues && (
                <div className="space-y-2 text-xs text-red-600 dark:text-red-400">
                  {missingFields.length > 0 && (
                    <p>
                      {t("importQueue.review.missingFields", {
                        fields: missingFields.join(", "),
                      })}
                    </p>
                  )}
                  {conflicts.length > 0 && (
                    <p>
                      {t("importQueue.review.conflicts", {
                        fields: conflicts.map((c) => c.field).join(", "),
                      })}
                    </p>
                  )}
                  {errors.length > 0 && (
                    <div className="space-y-1">
                      <p>{t("importQueue.review.errors", { count: errors.length })}</p>
                      {errors.map((error, index) => (
                        <p key={`import-error-${index}`}>{formatValidationError(error)}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="button"
              onClick={handleNormalize}
              disabled={isNormalizing || isValidating || !normalizedText.trim()}
              className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
            >
              {isNormalizing
                ? t("importQueue.review.normalizing")
                : t("importQueue.actions.normalize")}
            </button>
            <button
              type="button"
              onClick={handleValidate}
              disabled={isValidated || isNormalizing || isValidating || !normalizedText.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isValidating
                ? t("importQueue.review.validating")
                : t("importQueue.actions.validate")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function LegacyImportQueue({
  entityType = "client",
  refreshToken = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  initialStatus = "all",
}) {
  const { t } = useTranslation("common");
  const [activeImport, setActiveImport] = useState(null);
  const [imports, setImports] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [archivedIds, setArchivedIds] = useState(() => loadArchivedIds());
  const [showArchived, setShowArchived] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);
  const [sessionVisibleCounts, setSessionVisibleCounts] = useState({});

  useEffect(() => {
    saveArchivedIds(archivedIds);
  }, [archivedIds]);

  useEffect(() => {
    setStatusFilter(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setExpandedSession(null);
    setSessionVisibleCounts({});
  }, [imports, showArchived, statusFilter]);

  const statusOptions = useMemo(
    () => [
      { value: "pending", label: t("importQueue.filters.pending") },
      { value: "validated", label: t("importQueue.filters.validated") },
      { value: "all", label: t("importQueue.filters.all") },
    ],
    [t]
  );

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const params = new URLSearchParams();
        params.set("entity_type", entityType);
        if (statusFilter !== "all") {
          params.set("validated", statusFilter === "validated" ? "true" : "false");
        }
        const query = params.toString();
        const data = await apiClient.get(query ? `/imports?${query}` : "/imports");
        if (controller.signal.aborted) return;
        setImports(Array.isArray(data) ? data : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[LegacyImportQueue] Failed to load imports", error);
        setLoadError(t("importQueue.errors.load"));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [entityType, statusFilter, refreshToken, manualRefresh, t]);

  const summary = useMemo(() => {
    const stats = {
      total: imports.length,
      pending: 0,
      validated: 0,
      issues: 0,
      duplicates: 0,
      archived: 0,
    };

    imports.forEach((item) => {
      if (toBoolean(item.validated)) {
        stats.validated += 1;
      } else {
        stats.pending += 1;
      }
      if (item.validation_errors) {
        stats.issues += 1;
      }
      if (hasDuplicateError(item.validation_errors)) {
        stats.duplicates += 1;
      }
      if (archivedIds.has(Number(item.id))) {
        stats.archived += 1;
      }
    });

    return stats;
  }, [imports, archivedIds]);

  const filteredImports = useMemo(() => {
    if (showArchived) return imports;
    return imports.filter((item) => !archivedIds.has(Number(item.id)));
  }, [imports, archivedIds, showArchived]);

  const sessions = useMemo(() => {
    const map = new Map();
    filteredImports.forEach((item) => {
      const key = buildSessionKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          importedAt: item.imported_at || "-",
          source: item.import_source || "-",
          items: [],
          sortTime: toTimestamp(item.imported_at),
        });
      }
      const session = map.get(key);
      session.items.push(item);
      const time = toTimestamp(item.imported_at);
      if (time > session.sortTime) {
        session.sortTime = time;
        session.importedAt = item.imported_at || "-";
      }
    });

    const result = Array.from(map.values()).map((session) => {
      const stats = {
        total: session.items.length,
        pending: 0,
        validated: 0,
        issues: 0,
        duplicates: 0,
      };

      session.items.forEach((item) => {
        if (toBoolean(item.validated)) {
          stats.validated += 1;
        } else {
          stats.pending += 1;
        }
        if (item.validation_errors) {
          stats.issues += 1;
        }
        if (hasDuplicateError(item.validation_errors)) {
          stats.duplicates += 1;
        }
      });

      session.items.sort((a, b) => b.id - a.id);

      return {
        ...session,
        stats,
      };
    });

    result.sort((a, b) => b.sortTime - a.sortTime);
    return result;
  }, [filteredImports]);

  const updateArchived = (updater) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      updater(next);
      return next;
    });
  };

  const handleArchiveItem = (id) => {
    updateArchived((next) => next.add(Number(id)));
  };

  const handleRestoreItem = (id) => {
    updateArchived((next) => next.delete(Number(id)));
  };

  const handleArchiveValidated = (items = filteredImports) => {
    updateArchived((next) => {
      items.forEach((item) => {
        if (toBoolean(item.validated)) {
          next.add(Number(item.id));
        }
      });
    });
  };

  const handleToggleSession = (key) => {
    setExpandedSession((prev) => (prev === key ? null : key));
  };

  const getVisibleCount = (key) => sessionVisibleCounts[key] || pageSize;

  const handleLoadMore = (key) => {
    setSessionVisibleCounts((prev) => ({
      ...prev,
      [key]: (prev[key] || pageSize) + pageSize,
    }));
  };

  const archivedCount = summary.archived;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-[11px] uppercase text-slate-400">
              {t("importQueue.summary.total")}
            </div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              {summary.total}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-[11px] uppercase text-slate-400">
              {t("importQueue.summary.pending")}
            </div>
            <div className="text-lg font-semibold text-amber-600 dark:text-amber-300">
              {summary.pending}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-[11px] uppercase text-slate-400">
              {t("importQueue.summary.validated")}
            </div>
            <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">
              {summary.validated}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-[11px] uppercase text-slate-400">
              {t("importQueue.summary.issues")}
            </div>
            <div className="text-lg font-semibold text-rose-500 dark:text-rose-300">
              {summary.issues}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-[11px] uppercase text-slate-400">
              {t("importQueue.summary.duplicates")}
            </div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {summary.duplicates}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="text-[11px] uppercase text-slate-400">
              {t("importQueue.summary.archived")}
            </div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {summary.archived}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {t("importQueue.filters.status")}
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {showArchived
                ? t("importQueue.actions.hideArchived")
                : t("importQueue.actions.showArchived")}
              {archivedCount > 0 ? ` (${archivedCount})` : ""}
            </button>
            <button
              type="button"
              onClick={() => handleArchiveValidated()}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t("importQueue.actions.archiveValidated")}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isLoading && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t("importQueue.loading")}
              </span>
            )}
            {loadError && (
              <span className="text-xs text-red-600 dark:text-red-400">
                {loadError}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {t("importQueue.sessions.header")}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("importQueue.showing", {
              shown: filteredImports.length,
              total: summary.total,
            })}
          </span>
        </div>

        {sessions.length === 0 && !isLoading && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            {t("importQueue.empty")}
          </div>
        )}

        {sessions.map((session) => {
          const isExpanded = expandedSession === session.key;
          const visibleCount = getVisibleCount(session.key);
          const visibleItems = session.items.slice(0, visibleCount);
          const hasMore = session.items.length > visibleCount;

          return (
            <div
              key={session.key}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {t("importQueue.sessions.title")}
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {t("importQueue.columns.importedAt")}: {session.importedAt}
                    </span>
                    <span>
                      {t("importQueue.columns.source")}: {session.source}
                    </span>
                    <span>
                      {t("importQueue.sessions.records", { count: session.stats.total })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                    {t("importQueue.summary.pending")}: {session.stats.pending}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                    {t("importQueue.summary.validated")}: {session.stats.validated}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                    {t("importQueue.summary.issues")}: {session.stats.issues}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {t("importQueue.summary.duplicates")}: {session.stats.duplicates}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSession(session.key)}
                  className="rounded-md border border-blue-600 px-3 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
                >
                  {isExpanded
                    ? t("importQueue.actions.closeSession")
                    : t("importQueue.actions.openSession")}
                </button>
                <button
                  type="button"
                  onClick={() => handleArchiveValidated(session.items)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t("importQueue.actions.archiveValidated")}
                </button>
              </div>

              {isExpanded && (
                <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800">
                  <Table className="table-auto">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">
                          {t("importQueue.columns.id")}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {t("importQueue.columns.status")}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {t("importQueue.columns.issues")}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {t("importQueue.columns.importedAt")}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {t("importQueue.columns.actions")}
                        </th>
                      </tr>
                    </thead>
                    <TableBody
                      isEmpty={!isLoading && visibleItems.length === 0}
                      emptyMessage={t("importQueue.empty")}
                    >
                      {visibleItems.map((item) => {
                        const validated = toBoolean(item.validated);
                        const isArchived = archivedIds.has(Number(item.id));
                        const isDuplicate = hasDuplicateError(item.validation_errors);
                        const issueLabel = isDuplicate
                          ? t("importQueue.issues.duplicate")
                          : item.validation_errors
                          ? t("importQueue.issues.review")
                          : t("importQueue.issues.ok");

                        return (
                          <TableRow key={item.id} hoverable={false}>
                            <TableCell
                              columnId="id"
                              mobileLabel={t("importQueue.columns.id")}
                              className="text-slate-600 dark:text-slate-300"
                            >
                              #{item.id}
                            </TableCell>
                            <TableCell
                              columnId="status"
                              mobileLabel={t("importQueue.columns.status")}
                            >
                              <div className="flex flex-col gap-1">
                                <span
                                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                    validated
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                  }`}
                                >
                                  {validated
                                    ? t("importQueue.status.validated")
                                    : t("importQueue.status.pending")}
                                </span>
                                {item.resolved_entity_id && validated && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {t("importQueue.status.resolved", {
                                      id: item.resolved_entity_id,
                                    })}
                                  </span>
                                )}
                                {isArchived && (
                                  <span className="text-xs text-slate-400 dark:text-slate-500">
                                    {t("importQueue.status.archived")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              columnId="issues"
                              mobileLabel={t("importQueue.columns.issues")}
                              className="text-xs text-slate-500 dark:text-slate-400"
                            >
                              {issueLabel}
                            </TableCell>
                            <TableCell
                              columnId="importedAt"
                              mobileLabel={t("importQueue.columns.importedAt")}
                              className="text-xs text-slate-500 dark:text-slate-400"
                            >
                              {item.imported_at || "-"}
                            </TableCell>
                            <TableCell
                              columnId="actions"
                              mobileLabel={t("importQueue.columns.actions")}
                              mobileHidden
                              truncate={false}
                              adaptive
                            >
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveImport(item)}
                                  className="rounded-md border border-blue-600 px-3 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
                                >
                                  {t("importQueue.actions.review")}
                                </button>
                                {validated && !isArchived && (
                                  <button
                                    type="button"
                                    onClick={() => handleArchiveItem(item.id)}
                                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    {t("importQueue.actions.archive")}
                                  </button>
                                )}
                                {isArchived && (
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreItem(item.id)}
                                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    {t("importQueue.actions.restore")}
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {hasMore && (
                    <div className="border-t border-slate-200 px-4 py-3 text-right dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleLoadMore(session.key)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {t("importQueue.actions.loadMore")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ImportReviewDrawer
        item={activeImport}
        onClose={() => setActiveImport(null)}
        onUpdated={() => setManualRefresh((prev) => prev + 1)}
        isArchived={activeImport ? archivedIds.has(Number(activeImport.id)) : false}
      />
    </div>
  );
}
