import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getStatusColor } from "../../utils/mockData";

// Global state to track which dropdown is currently open
let currentOpenDropdown = null;

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

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`flex items-center gap-2 rounded-full font-medium transition-all hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 ${sizeClasses[size]} ${currentStatus?.color || getStatusColor(value)}`}
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
          {statusOptions.map((status) => (
            <button
              key={status.value}
              onClick={(e) => {
                e.stopPropagation();
                if (status.value !== value) {
                  onChange(status.value);
                }
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors ${
                status.value === value
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : status.color
                    ? status.color
                    : "hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {status.icon && <i className={`${status.icon} ${status.color} w-4`}></i>}
              <span className="text-slate-900 dark:text-white">{status.label}</span>
              {status.value === value && (
                <i className="fas fa-check text-blue-600 dark:text-blue-400 ml-auto text-xs"></i>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
