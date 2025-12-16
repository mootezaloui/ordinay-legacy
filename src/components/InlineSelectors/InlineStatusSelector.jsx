import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getStatusColor } from "../../utils/mockData";

// Global state to track which dropdown is currently open
let currentOpenDropdown = null;

/**
 * Convert color name to full CSS classes
 */
function getColorClasses(color) {
  const colorMap = {
    green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    slate: "bg-slate-600 text-white dark:bg-slate-700 dark:text-slate-200 border-slate-700 dark:border-slate-600",
    gray: "bg-slate-600 text-white dark:bg-slate-700 dark:text-slate-200 border-slate-700 dark:border-slate-600",
    red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800",
    purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    pink: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300 border-pink-200 dark:border-pink-800",
    teal: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800",
    cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  };
  return colorMap[color] || colorMap.slate;
}

/**
 * InlineStatusSelector - Reusable status dropdown for all entities
 * Auto-saves on selection, consistent across all screens
 * Uses portal to avoid z-index and overflow issues
 * Ensures only one dropdown is open at a time
 */
export default function InlineStatusSelector({
  value,
  onChange,
  statusOptions = [],
  entityType = "generic",
  size = "sm",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  const currentStatus = statusOptions.find(s => s.value === value) || statusOptions[0];

  const computeMenuPosition = () => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = statusOptions.length * 40 + 8; // Approximate menu height
    const menuWidth = 192; // w-48
    const viewportLeft = 8; // small margin
    const viewportRight = window.innerWidth - 8;

    const shouldPositionAbove = spaceBelow < menuHeight && rect.top > menuHeight;

    let left = rect.left;
    if (left + menuWidth > viewportRight) {
      left = rect.right - menuWidth;
    }
    if (left < viewportLeft) {
      left = viewportLeft;
    }

    const top = shouldPositionAbove
      ? rect.top - menuHeight - 4
      : rect.bottom + 4;

    return { top, left, width: rect.width };
  };

  // Update menu position when opened (sync calculation before paint)
  useLayoutEffect(() => {
    let rafId = null;

    const updatePosition = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (isOpen) {
          const pos = computeMenuPosition();
          if (pos) setMenuPosition(pos);
        }
      });
    };

    updatePosition();

    if (isOpen) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updatePosition);
        window.visualViewport.addEventListener('scroll', updatePosition);
      }

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', updatePosition);
          window.visualViewport.removeEventListener('scroll', updatePosition);
        }
      };
    }
  }, [isOpen, statusOptions.length]);

  const handleToggle = (e) => {
    e.stopPropagation();

    // Close any other open dropdown
    if (currentOpenDropdown && currentOpenDropdown !== dropdownIdRef.current) {
      // Trigger a custom event to close other dropdowns
      window.dispatchEvent(new CustomEvent('closeAllDropdowns', {
        detail: { except: dropdownIdRef.current }
      }));
    }

    if (!isOpen) {
      const pos = computeMenuPosition();
      setMenuPosition(pos);
      setIsOpen(true);
      currentOpenDropdown = dropdownIdRef.current;
    } else {
      setIsOpen(false);
      if (currentOpenDropdown === dropdownIdRef.current) {
        currentOpenDropdown = null;
      }
    }
  };

  // Listen for global close event
  useEffect(() => {
    const handleCloseAll = (e) => {
      if (e.detail?.except !== dropdownIdRef.current) {
        setIsOpen(false);
      }
    };

    window.addEventListener('closeAllDropdowns', handleCloseAll);
    return () => window.removeEventListener('closeAllDropdowns', handleCloseAll);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        setIsOpen(false);
        if (currentOpenDropdown === dropdownIdRef.current) {
          currentOpenDropdown = null;
        }
      }
    };

    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  const sizeClasses = {
    xs: "px-2 py-0.5 text-xs",
    sm: "px-3 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };

  // Get the color classes for the current status
  const getButtonColor = () => {
    if (currentStatus?.color) {
      // If color is provided as a simple name (e.g., "green", "blue")
      return getColorClasses(currentStatus.color);
    }
    // Fallback to getStatusColor which uses the status value
    return getStatusColor(value);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`flex items-center gap-2 rounded-full font-medium border transition-all hover:shadow-md hover:scale-105 ${sizeClasses[size]} ${getButtonColor()}`}
      >
        {currentStatus?.icon && <i className={`${currentStatus.icon} text-xs`}></i>}
        <span>{currentStatus?.label || value}</span>
        {isOpen ? (
          <i className="fas fa-chevron-up text-xs"></i>
        ) : (
          <i className="fas fa-chevron-down text-xs"></i>
        )}
      </button>

      {isOpen && menuPosition && createPortal(
        <div
          className="fixed w-48 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 py-1"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {statusOptions.map((status) => {
            // Get color classes for icons
            const getIconColor = (color) => {
              const iconColorMap = {
                green: "text-green-600 dark:text-green-400",
                blue: "text-blue-600 dark:text-blue-400",
                amber: "text-amber-600 dark:text-amber-400",
                slate: "text-slate-600 dark:text-slate-400",
                gray: "text-slate-600 dark:text-slate-400",
                red: "text-red-600 dark:text-red-400",
                purple: "text-purple-600 dark:text-purple-400",
                indigo: "text-indigo-600 dark:text-indigo-400",
                yellow: "text-yellow-600 dark:text-yellow-400",
                orange: "text-orange-600 dark:text-orange-400",
                pink: "text-pink-600 dark:text-pink-400",
                teal: "text-teal-600 dark:text-teal-400",
                cyan: "text-cyan-600 dark:text-cyan-400",
              };
              return iconColorMap[color] || iconColorMap.slate;
            };

            // Get background tint for hover state
            const getHoverBg = (color) => {
              const hoverMap = {
                green: "hover:bg-green-50 dark:hover:bg-green-900/20",
                blue: "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                amber: "hover:bg-amber-50 dark:hover:bg-amber-900/20",
                slate: "hover:bg-slate-50 dark:hover:bg-slate-700",
                gray: "hover:bg-slate-50 dark:hover:bg-slate-700",
                red: "hover:bg-red-50 dark:hover:bg-red-900/20",
                purple: "hover:bg-purple-50 dark:hover:bg-purple-900/20",
                indigo: "hover:bg-indigo-50 dark:hover:bg-indigo-900/20",
                yellow: "hover:bg-yellow-50 dark:hover:bg-yellow-900/20",
                orange: "hover:bg-orange-50 dark:hover:bg-orange-900/20",
                pink: "hover:bg-pink-50 dark:hover:bg-pink-900/20",
                teal: "hover:bg-teal-50 dark:hover:bg-teal-900/20",
                cyan: "hover:bg-cyan-50 dark:hover:bg-cyan-900/20",
              };
              return hoverMap[color] || hoverMap.slate;
            };

            const isSelected = status.value === value;

            return (
              <button
                key={status.value}
                onClick={(e) => {
                  e.stopPropagation();
                  if (status.value !== value) {
                    onChange(status.value);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-all ${isSelected
                    ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                    : getHoverBg(status.color)
                  }`}
              >
                {status.icon ? (
                  <i className={`${status.icon} w-5 ${getIconColor(status.color)}`}></i>
                ) : (
                  <div className={`w-2.5 h-2.5 rounded-full ${getIconColor(status.color).replace('text-', 'bg-')}`}></div>
                )}
                <span className="flex-1 text-slate-900 dark:text-white font-medium">{status.label}</span>
                {isSelected && (
                  <i className="fas fa-check text-blue-600 dark:text-blue-400 text-xs"></i>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
