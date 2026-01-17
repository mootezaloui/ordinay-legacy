import { useState, useMemo, useEffect, useRef } from "react";
import {
  applyIntelligentOrdering,
  getRowEmphasis,
  getImportanceCalculator,
} from "../utils/intelligentOrdering";

const REORDER_DELAY_MS = 3000;

/**
 * useAdvancedTable Hook
 * Provides advanced table functionality: sorting, filtering, column management, pagination
 *
 * NEW: Intelligent Ordering Support with Soft-Delay
 * When entityType is provided, the table will use domain-aware default ordering
 * that surfaces important items first and de-emphasizes completed/inactive items.
 * Status changes are immediate, but reordering is delayed by 3 seconds.
 *
 * @param {Array} data - Array of data objects
 * @param {Array} initialColumns - Array of column configurations
 * @param {Object} options - Additional options
 * @param {string} options.entityType - Entity type for intelligent ordering (client, dossier, task, etc.)
 * @param {boolean} options.enableIntelligentOrdering - Enable/disable intelligent ordering (default: true when entityType provided)
 * @returns {Object} Table state and handlers
 */
export function useAdvancedTable(data = [], initialColumns = [], options = {}) {
  const {
    initialSortBy = null,
    initialSortDirection = "asc",
    initialItemsPerPage = 10,
    searchableFields = [],
    entityType = null,
    enableIntelligentOrdering = true,
  } = options;

  // State management
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortDirection, setSortDirection] = useState(initialSortDirection);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);
  const [visibleColumns, setVisibleColumns] = useState(
    initialColumns.map((col) => col.id),
  );
  const [columnOrder, setColumnOrder] = useState(
    initialColumns.map((col) => col.id),
  );

  // Soft-delay reordering state
  const [displayData, setDisplayData] = useState(data);
  const pendingReorders = useRef(new Map());
  const previousDataRef = useRef(data);

  // Determine if we should use intelligent ordering
  const useIntelligentSort = entityType && enableIntelligentOrdering && !sortBy;

  // Clear all pending reorders
  const clearAllPendingReorders = () => {
    pendingReorders.current.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    pendingReorders.current.clear();
  };

  // Clear pending reorders on unmount
  useEffect(() => {
    return () => {
      clearAllPendingReorders();
    };
  }, []);

  // Clear pending reorders when manual sorting is applied
  useEffect(() => {
    if (sortBy) {
      clearAllPendingReorders();
    }
  }, [sortBy]);

  // Detect status changes and schedule delayed reordering
  useEffect(() => {
    if (!useIntelligentSort || !entityType) {
      // If not using intelligent ordering, just use data directly
      setDisplayData(data);
      return;
    }

    const previousData = previousDataRef.current;

    // Detect items with changed status
    data.forEach((item) => {
      const previousItem = previousData.find((prev) => prev.id === item.id);

      if (previousItem && hasStatusChanged(previousItem, item, entityType)) {
        // Cancel existing timeout for this item
        if (pendingReorders.current.has(item.id)) {
          clearTimeout(pendingReorders.current.get(item.id));
        }

        // Schedule delayed reorder
        const timeoutId = setTimeout(() => {
          // Recompute ordering with latest data
          setDisplayData((currentDisplayData) => {
            // Apply intelligent ordering to the actual current data
            return applyIntelligentOrdering(data, entityType);
          });

          // Remove from pending
          pendingReorders.current.delete(item.id);
        }, REORDER_DELAY_MS);

        pendingReorders.current.set(item.id, timeoutId);
      }
    });

    // Update immediately for visual status changes (but keep order stable)
    setDisplayData((currentDisplayData) => {
      // Update item properties but maintain current order
      return currentDisplayData
        .map((displayItem) => {
          const updatedItem = data.find((d) => d.id === displayItem.id);
          return updatedItem || displayItem;
        })
        .concat(
          // Add any new items that weren't in displayData
          data.filter(
            (item) => !currentDisplayData.some((d) => d.id === item.id),
          ),
        );
    });

    previousDataRef.current = data;
  }, [data, useIntelligentSort, entityType]);

  // Initial ordering when data first loads or intelligent ordering is toggled
  useEffect(() => {
    if (
      useIntelligentSort &&
      entityType &&
      previousDataRef.current.length === 0
    ) {
      setDisplayData(applyIntelligentOrdering(data, entityType));
    }
  }, [useIntelligentSort, entityType]);

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return displayData;

    const query = searchQuery.toLowerCase();
    return displayData.filter((row) => {
      return searchableFields.some((field) => {
        const value = row[field];
        return value && value.toString().toLowerCase().includes(query);
      });
    });
  }, [displayData, searchQuery, searchableFields]);

  // Sort data - either with intelligent ordering or manual sort
  const sortedData = useMemo(() => {
    // If intelligent ordering is active, data is already sorted
    if (useIntelligentSort && entityType) {
      return filteredData;
    }

    // Otherwise, use manual sorting if sortBy is set
    if (!sortBy) return filteredData;

    return [...filteredData].sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      // Handle different data types
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      // Handle dates
      if (aVal instanceof Date) aVal = aVal.getTime();
      if (bVal instanceof Date) bVal = bVal.getTime();

      // Handle null/undefined
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Compare
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
  }, [filteredData, sortBy, sortDirection, useIntelligentSort, entityType]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  // Get ordered and visible columns
  const orderedColumns = useMemo(() => {
    return columnOrder
      .map((id) => initialColumns.find((col) => col.id === id))
      .filter((col) => col && visibleColumns.includes(col.id));
  }, [columnOrder, visibleColumns, initialColumns]);

  // Handlers
  const handleSort = (columnId) => {
    if (sortBy === columnId) {
      // Toggle direction or clear sort
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortBy(null);
        setSortDirection("asc");
      }
    } else {
      setSortBy(columnId);
      setSortDirection("asc");
    }
  };

  const toggleColumnVisibility = (columnId) => {
    setVisibleColumns((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId],
    );
  };

  const reorderColumns = (sourceIndex, targetIndex) => {
    const newOrder = [...columnOrder];
    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    setColumnOrder(newOrder);
  };

  const resetColumns = () => {
    setColumnOrder(initialColumns.map((col) => col.id));
    setVisibleColumns(initialColumns.map((col) => col.id));
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (items) => {
    setItemsPerPage(items);
    setCurrentPage(1); // Reset to first page
  };

  // Calculate pagination info
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, sortedData.length);

  /**
   * Get the visual emphasis level for a row.
   * Used for intelligent visual hierarchy in tables.
   * @param {Object} item - The row data item
   * @returns {string} 'prominent' | 'normal' | 'subdued' | 'archived'
   */
  const getItemEmphasis = (item) => {
    if (!entityType) return "normal";
    return getRowEmphasis(entityType, item);
  };

  /**
   * Reset to intelligent ordering (clear manual sort)
   */
  const resetToIntelligentOrder = () => {
    setSortBy(null);
    setSortDirection("asc");
    // Immediately apply intelligent ordering
    if (useIntelligentSort && entityType) {
      clearAllPendingReorders();
      setDisplayData(applyIntelligentOrdering(data, entityType));
    }
  };

  return {
    // Data
    data: paginatedData,
    allData: sortedData,
    columns: orderedColumns,
    allColumns: initialColumns,

    // Search
    searchQuery,
    setSearchQuery,

    // Sorting
    sortBy,
    sortDirection,
    handleSort,

    // Pagination
    currentPage,
    totalPages,
    itemsPerPage,
    startItem,
    endItem,
    totalItems: sortedData.length,
    originalTotalItems: data.length,
    handlePageChange,
    handleItemsPerPageChange,

    // Column management
    visibleColumns,
    columnOrder,
    toggleColumnVisibility,
    reorderColumns,
    resetColumns,

    // Utilities
    isFiltering: searchQuery.trim().length > 0,
    isSorting: sortBy !== null,

    // Intelligent ordering
    entityType,
    isIntelligentOrdering: useIntelligentSort,
    getItemEmphasis,
    resetToIntelligentOrder,
  };
}

/**
 * Helper function to detect if status has changed between two items
 */
function hasStatusChanged(previousItem, currentItem, entityType) {
  // Check primary status field
  if (previousItem.status !== currentItem.status) {
    return true;
  }

  // Check entity-specific fields that affect ordering
  switch (entityType) {
    case "task":
    case "personalTask":
      return (
        previousItem.priority !== currentItem.priority ||
        previousItem.dueDate !== currentItem.dueDate
      );
    case "dossier":
      return previousItem.priority !== currentItem.priority;
    case "mission":
      return previousItem.deadline !== currentItem.deadline;
    case "session":
      return previousItem.date !== currentItem.date;
    case "case":
      return (
        previousItem.nextHearing !== currentItem.nextHearing ||
        previousItem.computedNextHearing?.date !==
          currentItem.computedNextHearing?.date
      );
    default:
      return false;
  }
}
