/**
 * Table.jsx
 * Main table wrapper component
 * Provides responsive table structure with scroll indicators
 *
 * Surface composition:
 * - Table lives inside ContentSection which provides the card styling (border, radius, shadow)
 * - Table itself has NO border-radius - it inherits from parent container
 * - This ensures one unified surface, not nested cards
 *
 * Layout:
 * - Outer div provides background color
 * - Inner scroll container isolates horizontal scroll to table content with fade indicators
 * - Column min-widths set in AdvancedTableHeader prevent collapse
 */

import { useRef, useEffect, useState } from "react";

export default function Table({ children, className = "" }) {
  const scrollContainerRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    hasScrollLeft: false,
    hasScrollRight: false,
  });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setScrollState({
        hasScrollLeft: scrollLeft > 0,
        hasScrollRight: scrollLeft < scrollWidth - clientWidth - 1,
      });
    };

    // Initial check
    updateScrollState();

    // Update on scroll
    container.addEventListener("scroll", updateScrollState);

    // Update on resize
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="w-full bg-white dark:bg-slate-900 relative">
      {/* Scroll fade indicators */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-6 pointer-events-none z-10 transition-opacity duration-300 bg-gradient-to-r from-white to-transparent dark:from-slate-900 ${
          scrollState.hasScrollLeft ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute right-0 top-0 bottom-0 w-6 pointer-events-none z-10 transition-opacity duration-300 bg-gradient-to-l from-white to-transparent dark:from-slate-900 ${
          scrollState.hasScrollRight ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Scroll container - only the table scrolls, not the entire content section */}
      <div ref={scrollContainerRef} className="overflow-x-auto">
        <table className={`w-full border-collapse ${className}`}>
          {children}
        </table>
      </div>
    </div>
  );
}
