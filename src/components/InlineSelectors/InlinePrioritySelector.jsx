import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";

// Global state to track which dropdown is currently open
let currentOpenPriorityDropdown = null;

/**
 * InlinePrioritySelector - Reusable priority dropdown for all entities
 * Auto-saves on selection, consistent across all screens
 * Uses portal to avoid z-index and overflow issues
 * Ensures only one dropdown is open at a time
 */
export default function InlinePrioritySelector({
  value,
  onChange,
  priorityOptions = [
    { value: "Basse", label: "Basse", icon: "fas fa-arrow-down", color: "text-green-600 dark:text-green-400" },
    { value: "Moyenne", label: "Moyenne", icon: "fas fa-minus", color: "text-amber-600 dark:text-amber-400" },
    { value: "Haute", label: "Haute", icon: "fas fa-arrow-up", color: "text-red-600 dark:text-red-400" },
  ],
  size = "sm",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('priority-dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  const currentPriority = priorityOptions.find(p => p.value === value) || priorityOptions[0];

  const computeMenuPosition = () => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = priorityOptions.length * 40 + 8;
    const menuWidth = 192;
    const viewportLeft = 8;
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
  }, [isOpen, priorityOptions.length]);

  const handlePriorityClick = (e, newPriority) => {
    e.stopPropagation();
    if (newPriority !== value) {
      onChange(newPriority);
    }
    setIsOpen(false);
    if (currentOpenPriorityDropdown === dropdownIdRef.current) {
      currentOpenPriorityDropdown = null;
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();

    // Close any other open dropdown
    if (currentOpenPriorityDropdown && currentOpenPriorityDropdown !== dropdownIdRef.current) {
      // Trigger a custom event to close other dropdowns
      window.dispatchEvent(new CustomEvent('closeAllPriorityDropdowns', {
        detail: { except: dropdownIdRef.current }
      }));
    }

    if (!isOpen) {
      const pos = computeMenuPosition();
      setMenuPosition(pos);
      setIsOpen(true);
      currentOpenPriorityDropdown = dropdownIdRef.current;
    } else {
      setIsOpen(false);
      if (currentOpenPriorityDropdown === dropdownIdRef.current) {
        currentOpenPriorityDropdown = null;
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

    window.addEventListener('closeAllPriorityDropdowns', handleCloseAll);
    return () => window.removeEventListener('closeAllPriorityDropdowns', handleCloseAll);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        setIsOpen(false);
        if (currentOpenPriorityDropdown === dropdownIdRef.current) {
          currentOpenPriorityDropdown = null;
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

  const priorityColors = {
    "Haute": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "Moyenne": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    "Basse": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`flex items-center gap-2 rounded-full font-medium transition-all hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 ${sizeClasses[size]} ${priorityColors[value] || priorityColors["Moyenne"]}`}
      >
        {currentPriority?.icon && <i className={`${currentPriority.icon} text-xs`}></i>}
        <span>{currentPriority?.label || value}</span>
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
          {priorityOptions.map((priority) => (
            <button
              key={priority.value}
              onClick={(e) => handlePriorityClick(e, priority.value)}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-300 dark:hover:bg-slate-700 ${priority.value === value ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
            >
              {priority.icon && <i className={`${priority.icon} ${priority.color} w-4`}></i>}
              <span className="text-slate-900 dark:text-white">{priority.label}</span>
              {priority.value === value && (
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
