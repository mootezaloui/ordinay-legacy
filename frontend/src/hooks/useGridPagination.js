import { useState, useEffect, useMemo, useCallback } from "react";

/**
 * useGridPagination Hook
 * Stable layout-driven pagination for responsive card grids.
 *
 * CRITICAL DESIGN:
 * - Page size = columns × rows that fit the viewport
 * - Computed as: columns × rows
 * - Columns come from measured grid width
 * - Rows come from viewport space below the grid top
 * - NO empty slots when more data exists
 * - Recalculates on resize without feedback loops
 *
 * @param {Array} data - The full dataset (after filtering/sorting)
 * @param {Object} options - Configuration options
 * @param {number} options.cardWidth - Fixed card width in pixels (default: 320)
 * @param {number} options.cardHeight - Fixed card height in pixels (default: 200)
 * @param {number} options.gap - Gap between cards in pixels (default: 20)
 * @param {number} options.preferredRows - Fixed row count (default: 5)
 * @param {number} options.viewportReserve - Space to reserve below grid (default: 120)
 * @param {number} options.minRows - Minimum row count per page (default: 1)
 * @param {number} options.containerPadding - Legacy option kept for backward compatibility
 * @returns {Object} Pagination state, handlers, and container ref
 */
export function useGridPagination(data = [], options = {}) {
  const {
    cardWidth = 320,
    cardHeight = 200,
    gap = 20,
    preferredRows = 5,
    viewportReserve = 120,
    minRows = 1,
    containerPadding = 48,
  } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, top: 0 });
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 0,
  );
  const [containerRef, setContainerRef] = useState(null);

  // Measure container width/top using ResizeObserver + resize events.
  // NOTE: We intentionally do not use container height, because that creates
  // a feedback loop (rendered rows change height, which changes page size).
  useEffect(() => {
    if (!containerRef) return;

    const measure = () => {
      const rect = containerRef.getBoundingClientRect();
      const width = Math.max(0, rect.width);
      const top = Math.max(0, rect.top);
      const nextViewportHeight = window.innerHeight;

      setContainerSize((prev) => {
        if (prev.width === width && prev.top === top) return prev;
        return { width, top };
      });
      setViewportHeight((prev) =>
        prev === nextViewportHeight ? prev : nextViewportHeight,
      );
    };

    const resizeObserver = new ResizeObserver(measure);

    resizeObserver.observe(containerRef);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef]);

  // Compute columns based on container width
  const columns = useMemo(() => {
    if (containerSize.width === 0) return 3; // Fallback

    // contentRect width already reflects the usable content box width.
    // Keep containerPadding in options only for backward compatibility.
    void containerPadding;
    const availableWidth = containerSize.width;
    const cols = Math.floor((availableWidth + gap) / (cardWidth + gap));

    return Math.max(1, cols);
  }, [containerSize.width, cardWidth, gap, containerPadding]);

  // Fixed rows by product decision.
  const rows = useMemo(() => {
    return preferredRows;
  }, [preferredRows]);

  // Page size = columns × rows (what fits in the container)
  const itemsPerPage = useMemo(() => {
    return columns * rows;
  }, [columns, rows]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    if (itemsPerPage <= 0 || data.length === 0) return 1;
    return Math.ceil(data.length / itemsPerPage);
  }, [data.length, itemsPerPage]);

  // Reset to page 1 if current page becomes invalid after resize
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage, itemsPerPage]);

  // Slice data for current page
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return data.slice(start, end);
  }, [data, currentPage, itemsPerPage]);

  const handlePageChange = useCallback(
    (page) => {
      if (page >= 1 && page <= totalPages && totalPages > 0) {
        setCurrentPage(page);
      }
    },
    [totalPages],
  );

  // Calculate display info
  const startItem =
    data.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, data.length);

  return {
    // Paginated data to display
    data: paginatedData,

    // Pagination state
    currentPage,
    totalPages,
    totalItems: data.length,
    itemsPerPage, // Dynamic: columns × rows
    startItem,
    endItem,

    // Handlers
    handlePageChange,

    // Container ref for measuring
    containerRef: setContainerRef,

    // Grid layout info
    columns,
    rows,
    isGridPagination: true,
  };
}
