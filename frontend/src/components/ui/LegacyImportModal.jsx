import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import GlassModal from "./GlassModal";
import { apiClient } from "../../services/api/client";
import { useToast } from "../../contexts/ToastContext";

const SUPPORTED_EXTENSIONS = new Set(["csv", "json", "jsonl", "ndjson"]);
const CHUNK_SIZE = 1000;
const AUTO_IMPORT_ENTITIES = new Set(["client"]);
const CSV_DELIMITERS = [",", ";", "\t", "|"];
const IGNORE_MAPPING = "__ignore__";
const CLIENT_CANONICAL_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "alternate_phone",
  "address",
  "cin",
  "date_of_birth",
  "profession",
  "company",
  "tax_id",
  "notes",
  "join_date",
  "status",
];

const getExtension = (fileName) => {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
};

const stripBom = (text) => text.replace(/^\uFEFF/, "");

const decodeImportFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let encoding = "utf-8";

  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      encoding = "utf-16le";
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      encoding = "utf-16be";
    }
  }

  let text = new TextDecoder(encoding).decode(buffer);
  if (encoding === "utf-8" && text.includes("\uFFFD")) {
    try {
      text = new TextDecoder("windows-1252").decode(buffer);
    } catch (err) {
      // keep utf-8 decode on unsupported encodings
    }
  }

  return text;
};

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

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const extractHeaders = (records) => {
  if (!records || records.length === 0) return [];
  const first = records[0];
  if (first && Array.isArray(first.columns)) {
    return first.columns.filter((header) => String(header || "").trim() !== "");
  }
  const headerSet = new Set();
  const limit = Math.min(records.length, 50);
  for (let i = 0; i < limit; i += 1) {
    const record = records[i];
    if (record && typeof record === "object" && !Array.isArray(record)) {
      Object.keys(record).forEach((key) => headerSet.add(key));
    }
  }
  return Array.from(headerSet);
};

const buildAliasLookup = (aliases = {}) => {
  const lookup = new Map();
  Object.entries(aliases).forEach(([field, items]) => {
    const list = Array.isArray(items) ? items : [];
    [field, ...list].forEach((alias) => {
      const normalized = normalizeHeader(alias);
      if (!normalized || lookup.has(normalized)) return;
      lookup.set(normalized, field);
    });
  });
  return lookup;
};

const buildDefaultMapping = (headers, aliasConfig) => {
  const aliasLookup = buildAliasLookup(aliasConfig?.aliases || {});
  const canonicalFields = aliasConfig?.fields || CLIENT_CANONICAL_FIELDS;
  const canonicalLookup = new Map(
    canonicalFields.map((field) => [normalizeHeader(field), field])
  );
  const usedFields = new Set();
  const mapping = {};
  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    if (!normalized) {
      mapping[header] = IGNORE_MAPPING;
      return;
    }
    const resolved =
      aliasLookup.get(normalized) || canonicalLookup.get(normalized) || IGNORE_MAPPING;
    if (resolved !== IGNORE_MAPPING && resolved !== "notes") {
      if (usedFields.has(resolved)) {
        mapping[header] = IGNORE_MAPPING;
        return;
      }
      usedFields.add(resolved);
    }
    mapping[header] = resolved;
  });
  return mapping;
};

const buildRawObject = (record) => {
  if (!record) return {};
  if (Array.isArray(record.columns) && Array.isArray(record.values)) {
    const output = {};
    const length = Math.min(record.columns.length, record.values.length);
    for (let i = 0; i < length; i += 1) {
      const key = record.columns[i];
      if (!key) continue;
      output[key] = record.values[i];
    }
    return output;
  }
  if (typeof record === "object") return record;
  return { value: record };
};

const isMissingValue = (value) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

const coerceValueToText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
};

const applyMappingToRecords = (records, mapping) =>
  records.map((record) => {
    const raw = buildRawObject(record);
    const mapped = {};
    Object.entries(mapping).forEach(([header, target]) => {
      if (target === IGNORE_MAPPING) return;
      if (!Object.prototype.hasOwnProperty.call(raw, header)) return;
      const value = raw[header];
      if (isMissingValue(value)) return;
      if (target === "notes") {
        const text = coerceValueToText(value);
        if (!text) return;
        if (!Array.isArray(mapped.notes)) {
          mapped.notes = [];
        }
        mapped.notes.push({
          content: `${header}: ${text}`,
        });
        return;
      }
      if (isMissingValue(mapped[target])) {
        mapped[target] = value;
      }
    });
    return mapped;
  });

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
  const [headers, setHeaders] = useState([]);
  const [headerMappings, setHeaderMappings] = useState({});
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [mappingTouched, setMappingTouched] = useState(false);
  const [aliasConfig, setAliasConfig] = useState(null);
  const [isLoadingAliases, setIsLoadingAliases] = useState(false);
  const [aliasError, setAliasError] = useState("");

  const resetState = () => {
    recordsRef.current = [];
    setImportSource("");
    setFileName("");
    setRecordCount(0);
    setParseError("");
    setIsParsing(false);
    setIsUploading(false);
    setUploadProgress(null);
    setHeaders([]);
    setHeaderMappings({});
    setMappingConfirmed(false);
    setMappingTouched(false);
    setAliasConfig(null);
    setIsLoadingAliases(false);
    setAliasError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || entityType !== "client") return;
    let isActive = true;
    setIsLoadingAliases(true);
    setAliasError("");
    apiClient
      .get("/imports/aliases")
      .then((data) => {
        if (!isActive) return;
        if (data?.aliases && data?.fields) {
          setAliasConfig(data);
        } else {
          setAliasConfig({
            fields: CLIENT_CANONICAL_FIELDS,
            aliases: {},
          });
        }
      })
      .catch((error) => {
        if (!isActive) return;
        console.error("[LegacyImportModal] Failed to load import aliases", error);
        setAliasError(t("import.mapping.aliasLoadError"));
        setAliasConfig({
          fields: CLIENT_CANONICAL_FIELDS,
          aliases: {},
        });
      })
      .finally(() => {
        if (isActive) setIsLoadingAliases(false);
      });
    return () => {
      isActive = false;
    };
  }, [entityType, isOpen, t]);

  const resolvedEntityLabel = entityLabel || entityType || "";
  const requiresMapping = entityType === "client";

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
      const rawText = await decodeImportFile(file);
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
      const extractedHeaders = extractHeaders(records);
      setHeaders(extractedHeaders);
      setHeaderMappings(buildDefaultMapping(extractedHeaders, aliasConfig));
      setMappingConfirmed(false);
      setMappingTouched(false);
    } catch (error) {
      console.error("[LegacyImportModal] Parse error:", error);
      setParseError(t("import.errors.parse"));
      recordsRef.current = [];
      setRecordCount(0);
      setHeaders([]);
      setHeaderMappings({});
      setMappingConfirmed(false);
      setMappingTouched(false);
    } finally {
      setIsParsing(false);
    }
  };

  useEffect(() => {
    if (!requiresMapping || mappingTouched || headers.length === 0) return;
    setHeaderMappings(buildDefaultMapping(headers, aliasConfig));
    setMappingConfirmed(false);
  }, [aliasConfig, headers, mappingTouched, requiresMapping]);

  const handleMappingChange = (header, value) => {
    setHeaderMappings((prev) => {
      const next = { ...prev, [header]: value };
      if (value && value !== IGNORE_MAPPING && value !== "notes") {
        Object.keys(next).forEach((otherHeader) => {
          if (otherHeader !== header && next[otherHeader] === value) {
            next[otherHeader] = IGNORE_MAPPING;
          }
        });
      }
      return next;
    });
    setMappingTouched(true);
    setMappingConfirmed(false);
    if (parseError) setParseError("");
  };

  const handleConfirmMapping = () => {
    setMappingConfirmed(true);
    if (parseError) setParseError("");
  };

  const handleResetMapping = () => {
    setHeaderMappings(buildDefaultMapping(headers, aliasConfig));
    setMappingTouched(false);
    setMappingConfirmed(false);
  };

  const mappedFields = Object.values(headerMappings).filter((value) => value !== IGNORE_MAPPING);
  const ignoredCount = headers.length - mappedFields.length;
  const hasNameMapping = mappedFields.includes("name");

  const handleImport = async () => {
    if (!entityType || recordsRef.current.length === 0) {
      setParseError(t("import.errors.empty"));
      return;
    }
    if (requiresMapping && !mappingConfirmed) {
      setParseError(t("import.mapping.confirmRequired"));
      return;
    }

    setIsUploading(true);
    const recordsToUpload = requiresMapping
      ? applyMappingToRecords(recordsRef.current, headerMappings)
      : recordsRef.current;
    const total = recordsToUpload.length;
    setUploadProgress({ current: 0, total });

    try {
      const useAutoImport = AUTO_IMPORT_ENTITIES.has(entityType);
      let createdCount = 0;
      let queuedCount = 0;
      let duplicateCount = 0;
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = recordsToUpload.slice(i, i + CHUNK_SIZE);
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
      <div className="flex flex-col h-full min-h-0 md:max-h-[calc(100vh-var(--titlebar-height)-48px)]">
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

        <div className="modal-scroll-stable space-y-5 overflow-y-auto overflow-x-hidden px-6 py-5 flex-1 min-h-0">
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

        {recordCount > 0 && !parseError && requiresMapping && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("import.mapping.title")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("import.mapping.subtitle")}
                </p>
              </div>
              {isLoadingAliases && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t("import.mapping.loadingAliases")}
                </span>
              )}
            </div>

            {aliasError && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {aliasError}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>{t("import.mapping.summary", { mapped: mappedFields.length, ignored: ignoredCount })}</span>
              {!hasNameMapping && (
                <span className="text-amber-600 dark:text-amber-400">
                  {t("import.mapping.missingRequired")}
                </span>
              )}
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="hidden md:block">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">{t("import.mapping.headerLabel")}</th>
                      <th className="px-3 py-2">{t("import.mapping.fieldLabel")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {headers.map((header) => (
                      <tr key={header} className="text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-2">
                          <span className="truncate">{header || "-"}</span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={headerMappings[header] || IGNORE_MAPPING}
                            onChange={(event) => handleMappingChange(header, event.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                          >
                            <option value={IGNORE_MAPPING}>{t("import.mapping.ignore")}</option>
                            {(aliasConfig?.fields || CLIENT_CANONICAL_FIELDS).map((field) => (
                              <option key={field} value={field}>
                                {t(`templateFields.client.fields.${field}`, { defaultValue: field })}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {headers.map((header) => (
                  <div key={header} className="p-3 space-y-2 text-sm">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("import.mapping.headerLabel")}
                    </div>
                    <div className="font-medium text-slate-700 dark:text-slate-200 break-words">
                      {header || "-"}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-2">
                      {t("import.mapping.fieldLabel")}
                    </div>
                    <select
                      value={headerMappings[header] || IGNORE_MAPPING}
                      onChange={(event) => handleMappingChange(header, event.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value={IGNORE_MAPPING}>{t("import.mapping.ignore")}</option>
                      {(aliasConfig?.fields || CLIENT_CANONICAL_FIELDS).map((field) => (
                        <option key={field} value={field}>
                          {t(`templateFields.client.fields.${field}`, { defaultValue: field })}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetMapping}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {t("import.mapping.reset")}
              </button>
              <div className="flex items-center gap-2">
                {mappingConfirmed && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    {t("import.mapping.confirmed")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleConfirmMapping}
                  className="rounded-md border border-blue-600 px-3 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
                >
                  {t("import.mapping.confirm")}
                </button>
              </div>
            </div>
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

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isParsing || isUploading}
            className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("actions.cancel")}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isParsing || isUploading || recordCount === 0 || (requiresMapping && !mappingConfirmed)}
            className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("import.actions.import")}
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
