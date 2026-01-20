import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import GlassModal from "./GlassModal";
import { apiClient } from "../../services/api/client";
import { useToast } from "../../contexts/ToastContext";

const SUPPORTED_EXTENSIONS = new Set(["csv", "json", "jsonl", "ndjson"]);
const CHUNK_SIZE = 1000;
const AUTO_IMPORT_ENTITIES = new Set(["client"]);
const CSV_DELIMITERS = [",", ";", "\t", "|"];

const getExtension = (fileName) => {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
};

const stripBom = (text) => text.replace(/^\uFEFF/, "");

const countDelimiterOutsideQuotes = (line, delimiter) => {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
};

const detectCsvDelimiter = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (lines.length === 0) return ",";

  let bestDelimiter = ",";
  let bestScore = -1;

  CSV_DELIMITERS.forEach((delimiter) => {
    let score = 0;
    lines.forEach((line) => {
      score += countDelimiterOutsideQuotes(line, delimiter);
    });
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  });

  return bestScore > 0 ? bestDelimiter : ",";
};

// Simple CSV parser with quote support for raw intake.
const parseCsvRows = (text, delimiter = ",") => {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    if (char === "\r") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (text[i + 1] === "\n") {
        i += 1;
      }
      continue;
    }

    value += char;
  }

  if (inQuotes) {
    throw new Error("CSV parse error: unmatched quote");
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
};

const parseCsvRecords = (text) => {
  const delimiter = detectCsvDelimiter(text);
  const rows = parseCsvRows(text, delimiter);
  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell !== ""));

  if (nonEmptyRows.length === 0) return [];

  const columns = nonEmptyRows[0];
  return nonEmptyRows.slice(1).map((values) => ({
    columns,
    values,
  }));
};

const parseJsonRecords = (text) => {
  const parsed = JSON.parse(text);
  if (parsed === null || parsed === undefined) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
};

const parseJsonLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export default function LegacyImportModal({
  isOpen,
  onClose,
  entityType,
  entityLabel,
  onImported,
}) {
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const recordsRef = useRef([]);

  const [importSource, setImportSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [recordCount, setRecordCount] = useState(0);
  const [parseError, setParseError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const resetState = () => {
    recordsRef.current = [];
    setImportSource("");
    setFileName("");
    setRecordCount(0);
    setParseError("");
    setIsParsing(false);
    setIsUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  const resolvedEntityLabel = entityLabel || entityType || "";

  const handleClose = (force = false) => {
    if (isUploading && !force) return;
    resetState();
    onClose();
  };

  const handleChooseFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = getExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      setParseError(t("import.errors.unsupported"));
      setFileName(file.name);
      setRecordCount(0);
      recordsRef.current = [];
      return;
    }

    setFileName(file.name);
    setParseError("");
    setIsParsing(true);

    try {
      const rawText = await file.text();
      const text = stripBom(rawText);
      let records = [];

      if (extension === "csv") {
        records = parseCsvRecords(text);
      } else if (extension === "json") {
        records = parseJsonRecords(text);
      } else {
        records = parseJsonLines(text);
      }

      if (!records || records.length === 0) {
        setParseError(t("import.errors.empty"));
        setRecordCount(0);
        recordsRef.current = [];
        return;
      }

      recordsRef.current = records;
      setRecordCount(records.length);
    } catch (error) {
      console.error("[LegacyImportModal] Parse error:", error);
      setParseError(t("import.errors.parse"));
      recordsRef.current = [];
      setRecordCount(0);
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!entityType || recordsRef.current.length === 0) {
      setParseError(t("import.errors.empty"));
      return;
    }

    setIsUploading(true);
    const total = recordsRef.current.length;
    setUploadProgress({ current: 0, total });

    try {
      const useAutoImport = AUTO_IMPORT_ENTITIES.has(entityType);
      let createdCount = 0;
      let queuedCount = 0;
      let duplicateCount = 0;
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = recordsRef.current.slice(i, i + CHUNK_SIZE);
        const response = await apiClient.post(useAutoImport ? "/imports/auto" : "/imports/raw", {
          entity_type: entityType,
          records: chunk,
          import_source: importSource || null,
        });
        if (useAutoImport && response) {
          createdCount += response.created || 0;
          queuedCount += response.queued || 0;
          duplicateCount += response.duplicates || 0;
        }
        const current = Math.min(i + CHUNK_SIZE, total);
        setUploadProgress({ current, total });
      }

      if (AUTO_IMPORT_ENTITIES.has(entityType)) {
        if (duplicateCount > 0) {
          showToast(
            t("import.auto.successWithDuplicates", {
              total,
              created: createdCount,
              queued: queuedCount,
              duplicates: duplicateCount,
            }),
            "success"
          );
        } else {
          showToast(
            t("import.auto.success", { total, created: createdCount, queued: queuedCount }),
            "success"
          );
        }
      } else {
        showToast(t("import.success", { count: total }), "success");
      }
      if (onImported) {
        onImported({ entityType, count: total });
      }
      handleClose(true);
    } catch (error) {
      console.error("[LegacyImportModal] Import failed:", error);
      showToast(error?.message || t("import.errors.upload"), "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={handleClose} maxWidth="4xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("import.title", { entity: resolvedEntityLabel })}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("import.subtitle")}
          </p>
        </div>
        <button
          onClick={handleClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          aria-label={t("actions.close")}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-5 overflow-y-auto px-6 py-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("import.notice")}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("import.sourceLabel")}
          </label>
          <input
            type="text"
            value={importSource}
            onChange={(event) => setImportSource(event.target.value)}
            placeholder={t("import.sourcePlaceholder")}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("import.fileLabel")}
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.jsonl,.ndjson"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleChooseFile}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:w-auto"
            >
              {t("import.actions.chooseFile")}
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {fileName || t("import.fileEmpty")}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t("import.fileHint")}
          </p>
        </div>

        {isParsing && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("import.parsing")}
          </p>
        )}

        {parseError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {parseError}
          </div>
        )}

        {recordCount > 0 && !parseError && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t("import.recordsFound", { count: recordCount })}
          </div>
        )}

        {isUploading && uploadProgress && (
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {t("import.uploading", {
              current: uploadProgress.current,
              total: uploadProgress.total,
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
        <button
          type="button"
          onClick={handleClose}
          disabled={isParsing || isUploading}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {t("actions.cancel")}
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={isParsing || isUploading || recordCount === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("import.actions.import")}
        </button>
      </div>
    </GlassModal>
  );
}
