import { useState, useEffect, useMemo, useCallback } from "react";

/**
 * useGridPagination Hook
 * Layout-driven pagination where the grid container dictates page size
 *
 * CRITICAL DESIGN:
 * - Page size = what fits visually in the container
 * - Computed as: columns × rows
 * - Both dimensions measured from actual container
 * - NO empty slots when more data exists
 * - Recalculates on resize
 *
 * @param {Array} data - The full dataset (after filtering/sorting)
 * @param {Object} options - Configuration options
 * @param {number} options.cardWidth - Fixed card width in pixels (default: 320)
 * @param {number} options.cardHeight - Fixed card height in pixels (default: 200)
 * @param {number} options.gap - Gap between cards in pixels (default: 20)
 * @param {number} options.containerPadding - Container padding (default: 48)
 * @returns {Object} Pagination state, handlers, and container ref
 */
export function useGridPagination(data = [], options = {}) {
  const {
    cardWidth = 320,
    cardHeight = 200,
    gap = 20,
    containerPadding = 48,
  } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [containerRef, setContainerRef] = useState(null);

  // Measure container dimensions using ResizeObserver
  useEffect(() => {
    if (!containerRef) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  // Compute columns based on container width
  const columns = useMemo(() => {
    if (containerSize.width === 0) return 3; // Fallback

    const availableWidth = containerSize.width - containerPadding;
    const cols = Math.floor(availableWidth / (cardWidth + gap));

    return Math.max(1, cols);
  }, [containerSize.width, cardWidth, gap, containerPadding]);

  // Compute rows based on container height
  const rows = useMemo(() => {
    if (containerSize.height === 0) return 3; // Fallback

    // Use available viewport height minus header/footer space
    const availableHeight = Math.max(600, containerSize.height);
    const visibleRows = Math.floor(availableHeight / (cardHeight + gap));

    return Math.max(2, visibleRows);
  }, [containerSize.height, cardHeight, gap]);

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
