import { useState, useRef, useLayoutEffect, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { canPerformAction } from "../../services/domainRules";
import BlockerModal from "../ui/BlockerModal";
import { createPortal } from "react-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "../ui/sheet";

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
  entityType = "generic",
  entityId = null,
  entityData = null,
  priorityOptions = null,
  size = "sm",
}) {
  const namespaceMap = {
    dossier: "dossiers",
    task: "tasks",
    personalTask: "personalTasks",
    mission: "missions",
    lawsuit: "lawsuits",
  };

  const resolvedNamespace = namespaceMap[entityType] || entityType || "common";
  const { t } = useTranslation(resolvedNamespace);

  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [pendingPriority, setPendingPriority] = useState(null);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('priority-dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  useEffect(() => {
    const updateIsMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    };
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  const translatePriorityValue = useCallback((priorityValue) => {
    if (!priorityValue) return "";

    const normalized = typeof priorityValue === "string" ? priorityValue.trim() : priorityValue;
    const priorityKeyMap = {
      Low: "low",
      Medium: "medium",
      High: "high",
      Urgent: "urgent",
    };

    const priorityKey = priorityKeyMap[normalized];
    if (!priorityKey) return normalized || "";

    const translationPaths = [
      `detail.quickActions.priority.${priorityKey}`,
      `detail.overview.priorities.${priorityKey}`,
      `table.priority.${priorityKey}`,
      `form.fields.priority.options.${priorityKey}`,
      `priority.${priorityKey}`,
    ];

    for (const key of translationPaths) {
      const translated = t(key, { ns: resolvedNamespace, defaultValue: key });
      if (translated !== key) return translated;
    }

    return normalized;
  }, [resolvedNamespace, t]);

  const defaultPriorityOptions = useMemo(() => ([
    { value: "Low", label: translatePriorityValue("Low"), icon: "fas fa-arrow-down", color: "text-green-600 dark:text-green-400" },
    { value: "Medium", label: translatePriorityValue("Medium"), icon: "fas fa-minus", color: "text-amber-600 dark:text-amber-400" },
    { value: "High", label: translatePriorityValue("High"), icon: "fas fa-arrow-up", color: "text-red-600 dark:text-red-400" },
  ]), [translatePriorityValue]);

  const computedPriorityOptions = useMemo(
    () => (priorityOptions && priorityOptions.length > 0 ? priorityOptions : defaultPriorityOptions)
      .map((option) => ({
        ...option,
        label: option.label ?? translatePriorityValue(option.value),
      })),
    [defaultPriorityOptions, priorityOptions, translatePriorityValue]
  );

  const currentPriority = computedPriorityOptions.find(p => p.value === value) || computedPriorityOptions[0];

  const computeMenuPosition = () => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = computedPriorityOptions.length * 40 + 8;
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
  }, [computedPriorityOptions.length, isOpen]);

  const handlePriorityClick = (e, newPriority) => {
    e.stopPropagation();
    if (newPriority !== value) {
      if (entityId && entityType && entityType !== "generic") {
        const result = canPerformAction(entityType, entityId, "edit", {
          data: entityData,
          newData: { ...(entityData || {}), priority: newPriority },
        });

        if (!result.allowed) {
          setPendingPriority(newPriority);
          setValidationResult(result);
          setBlockerModalOpen(true);
          setIsOpen(false);
          if (currentOpenPriorityDropdown === dropdownIdRef.current) {
            currentOpenPriorityDropdown = null;
          }
          return;
        }
      }
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

    if (isMobile) {
      setIsOpen((prev) => !prev);
      return;
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
    "High": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "Medium": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    "Low": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };

  const menuList = (
    <div className="py-1">
      {computedPriorityOptions.map((priority) => (
        <button
          key={priority.value}
          onClick={(e) => handlePriorityClick(e, priority.value)}
          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-300 dark:hover:bg-slate-700 ${
            priority.value === value ? "bg-blue-50 dark:bg-blue-900/20" : ""
          }`}
        >
          {priority.icon && <i className={`${priority.icon} ${priority.color} w-4`}></i>}
          <span className="text-slate-900 dark:text-white">{priority.label}</span>
          {priority.value === value && (
            <i className="fas fa-check text-blue-600 dark:text-blue-400 ml-auto text-xs"></i>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={handleToggle}
        data-inline-selector="priority"
        className={`inline-flex items-center gap-2 rounded-full font-medium transition-all hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 min-w-max flex-shrink-0 ${sizeClasses[size]} ${priorityColors[value] || priorityColors["Medium"]}`}
      >
        {currentPriority?.icon && <i className={`${currentPriority.icon} text-xs flex-shrink-0`}></i>}
        <span data-inline-selector-label className="whitespace-nowrap">{currentPriority?.label || value}</span>
        <span 
          style={{ 
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
          }}
          className="inline-flex items-center justify-center"
        >
          <i className="fas fa-chevron-down text-[10px] flex-shrink-0"></i>
        </span>
      </button>

      {isMobile ? (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent side="bottom" className="w-full sm:max-w-full">
            <SheetHeader className="flex flex-row items-center justify-between">
              <SheetTitle>{t("detail.quickActions.priority.label", { defaultValue: "Priority" })}</SheetTitle>
              <SheetClose className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <i className="fas fa-times"></i>
              </SheetClose>
            </SheetHeader>
            <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {menuList}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        isOpen && menuPosition && createPortal(
          <div
            className={`fixed w-48 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 py-1 overflow-hidden pointer-events-auto ${
              menuPosition.top > (buttonRef.current?.getBoundingClientRect().bottom ?? 0) - 10 ? 'animate-liquid-reveal-down' : 'animate-liquid-reveal-up'
            }`}
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={
              menuPosition.top > (buttonRef.current?.getBoundingClientRect().bottom ?? 0) - 10 
                ? 'animate-liquid-content' 
                : 'animate-liquid-content-up'
            }>
              {menuList}
            </div>
          </div>,
          document.body
        )
      )}

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName={`Change Priority to "${pendingPriority}"`}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={entityData?.title || entityData?.name || `#${entityId}`}
      />
    </>
  );
}

