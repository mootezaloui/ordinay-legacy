import { useState, useMemo } from "react";

/**
 * useAdvancedTable Hook
 * Provides advanced table functionality: sorting, filtering, column management, pagination
 * 
 * @param {Array} data - Array of data objects
 * @param {Array} initialColumns - Array of column configurations
 * @param {Object} options - Additional options
 * @returns {Object} Table state and handlers
 */
export function useAdvancedTable(data = [], initialColumns = [], options = {}) {
  const {
    initialSortBy = null,
    initialSortDirection = "asc",
    initialItemsPerPage = 10,
    searchableFields = [],
  } = options;

  // State management
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortDirection, setSortDirection] = useState(initialSortDirection);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);
  const [visibleColumns, setVisibleColumns] = useState(
    initialColumns.map((col) => col.id)
  );
  const [columnOrder, setColumnOrder] = useState(
    initialColumns.map((col) => col.id)
  );

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;

    const query = searchQuery.toLowerCase();
    return data.filter((row) => {
      return searchableFields.some((field) => {
        const value = row[field];
        return value && value.toString().toLowerCase().includes(query);
      });
    });
  }, [data, searchQuery, searchableFields]);

  // Sort data
  const sortedData = useMemo(() => {
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
  }, [filteredData, sortBy, sortDirection]);

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
        : [...prev, columnId]
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
  };
}