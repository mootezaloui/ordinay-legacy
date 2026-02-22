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

import { Children, isValidElement, useRef, useEffect, useState } from "react";

export default function Table({
  children,
  className = "",
  allowHorizontalScroll = false,
}) {
  const hasEmptyBody = Children.toArray(children).some((child) => (
    isValidElement(child) && child.props?.isEmpty === true
  ));
  const useFixedLayout = !allowHorizontalScroll && !hasEmptyBody;
  const scrollContainerRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    hasScrollLeft: false,
    hasScrollRight: false,
  });

  useEffect(() => {
    if (!allowHorizontalScroll) {
      setScrollState({ hasScrollLeft: false, hasScrollRight: false });
      return;
    }

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
  }, [allowHorizontalScroll]);

  return (
    <div className="w-full bg-white dark:bg-slate-900 relative flex flex-col min-h-0">
      {/* Scroll fade indicators */}
      {allowHorizontalScroll && (
        <>
          <div
            className={`absolute left-0 top-0 bottom-0 w-4 pointer-events-none z-10 transition-opacity duration-300 bg-gradient-to-r from-white/70 via-white/35 to-transparent dark:from-slate-900/70 dark:via-slate-900/35 ${
              scrollState.hasScrollLeft ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={`absolute right-0 top-0 bottom-0 w-4 pointer-events-none z-10 transition-opacity duration-300 bg-gradient-to-l from-white/70 via-white/35 to-transparent dark:from-slate-900/70 dark:via-slate-900/35 ${
              scrollState.hasScrollRight ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      )}

      {/* Default policy: no horizontal scrollbar on shared list tables.
          Use fixed layout for populated tables, but fall back to auto layout
          for empty tbody states to avoid Chromium table-row stretching artifacts. */}
      <div
        ref={scrollContainerRef}
        className={`min-h-0 min-w-0 overflow-y-visible ${
          allowHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden"
        }`}
      >
        <table className={`w-full border-collapse ${useFixedLayout ? "table-fixed" : ""} ${className}`}>
          {children}
        </table>
      </div>
    </div>
  );
}
