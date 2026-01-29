import { useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "ordinay_list_view:";

const normalizeViewMode = (value, fallback) => {
  if (value === "table" || value === "grid") return value;
  return fallback;
};

export const LIST_VIEW_MODES = {
  table: "table",
  grid: "grid",
};

export function useListViewMode(key, defaultMode = LIST_VIEW_MODES.table) {
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${key}`, [key]);
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return defaultMode;
    const stored = window.localStorage.getItem(storageKey);
    return normalizeViewMode(stored, defaultMode);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, viewMode);
    } catch (error) {
      console.warn("[useListViewMode] Failed to persist view mode", error);
    }
  }, [storageKey, viewMode]);

  return [viewMode, setViewMode];
}
