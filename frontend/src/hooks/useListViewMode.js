import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "ordinay_list_view:";
// Window width breakpoint for auto-switching shared list screens to grid mode
// before table columns become overly compact with the sidebar + toolbar visible.
const RESPONSIVE_GRID_BREAKPOINT = 1440;

const normalizeViewMode = (value, fallback) => {
  if (value === "table" || value === "grid") return value;
  return fallback;
};

export const LIST_VIEW_MODES = {
  table: "table",
  grid: "grid",
};

const shouldForceGridMode = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < RESPONSIVE_GRID_BREAKPOINT;
};

export function useListViewMode(key, defaultMode = LIST_VIEW_MODES.table) {
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${key}`, [key]);
  const [preferredViewMode, setPreferredViewMode] = useState(() => {
    if (typeof window === "undefined") return defaultMode;
    const stored = window.localStorage.getItem(storageKey);
    return normalizeViewMode(stored, defaultMode);
  });
  const [isResponsiveGridForced, setIsResponsiveGridForced] = useState(() =>
    shouldForceGridMode(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateResponsiveMode = () => {
      setIsResponsiveGridForced(shouldForceGridMode());
    };

    updateResponsiveMode();
    window.addEventListener("resize", updateResponsiveMode);

    return () => {
      window.removeEventListener("resize", updateResponsiveMode);
    };
  }, []);

  const viewMode = isResponsiveGridForced
    ? LIST_VIEW_MODES.grid
    : preferredViewMode;

  const setViewMode = useCallback((nextValue) => {
    setPreferredViewMode((current) => {
      const resolved =
        typeof nextValue === "function" ? nextValue(current) : nextValue;
      return normalizeViewMode(resolved, current);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, preferredViewMode);
    } catch (error) {
      console.warn("[useListViewMode] Failed to persist view mode", error);
    }
  }, [storageKey, preferredViewMode]);

  return [viewMode, setViewMode];
}
