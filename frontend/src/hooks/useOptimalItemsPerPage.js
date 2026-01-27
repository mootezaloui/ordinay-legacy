import { useState, useEffect } from 'react';

/**
 * Calculate optimal items per page based on viewport size
 * For grid view: calculates based on card dimensions and available space
 * For table view: uses traditional fixed values
 *
 * @param {string} viewMode - "grid" or "table"
 * @returns {number} - Optimal number of items per page
 */
export function useOptimalItemsPerPage(viewMode = "table") {
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    if (viewMode !== "grid") {
      // For table view, use traditional pagination
      setItemsPerPage(10);
      return;
    }

    const calculateOptimalItems = () => {
      // Card dimensions
      const minCardWidth = 320; // matches EntityGrid minmax
      const cardHeight = 240; // approximate card height with typical content
      const gap = window.innerWidth >= 1280 ? 24 : window.innerWidth >= 1024 ? 20 : 16;

      // Available space
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Account for: header (64px), page header (120px), toolbar (60px), pagination (60px), padding
      const reservedHeight = 64 + 120 + 60 + 60 + 48;
      const availableHeight = viewportHeight - reservedHeight;

      // Account for: sidebar (if present, ~256px), content padding (48px)
      const hasSidebar = viewportWidth >= 1024;
      const reservedWidth = (hasSidebar ? 256 : 0) + 48;
      const availableWidth = viewportWidth - reservedWidth;

      // Calculate columns that fit
      const columns = Math.floor((availableWidth + gap) / (minCardWidth + gap));

      // Calculate rows that fit (leave at least 1 card height visible for scroll indication)
      const rows = Math.max(2, Math.floor((availableHeight - cardHeight / 2) / (cardHeight + gap)));

      // Total items = columns × rows
      const optimal = columns * rows;

      // Clamp between reasonable values
      return Math.max(6, Math.min(optimal, 100));
    };

    const updateItemsPerPage = () => {
      const optimal = calculateOptimalItems();
      setItemsPerPage(optimal);
    };

    // Initial calculation
    updateItemsPerPage();

    // Update on resize
    window.addEventListener('resize', updateItemsPerPage);

    return () => {
      window.removeEventListener('resize', updateItemsPerPage);
    };
  }, [viewMode]);

  return itemsPerPage;
}
