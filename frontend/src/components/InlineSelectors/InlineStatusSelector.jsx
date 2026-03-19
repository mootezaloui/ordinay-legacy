import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { canPerformAction } from "../../services/domainRules";
import BlockerModal from "../ui/BlockerModal";
import { logStatusChange } from "../../services/historyService";
import ClientNotificationPrompt from "../ui/ClientNotificationPrompt";
import {
  shouldPromptClientNotification,
  sendClientNotification,
} from "../../services/clientCommunication";
import { useData } from "../../contexts/DataContext";
import { useSettings } from "../../contexts/SettingsContext";
import { getStatusColor } from "../DetailView/config/statusColors";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "../ui/sheet";

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
 *
 * NEW: Integrates domain rules validation before allowing status changes
 */
export default function InlineStatusSelector({
  value,
  onChange,
  statusOptions = [],
  entityType = "generic",
  entityId = null,
  entityData = null,
  size = "sm",
}) {
  const { t } = useTranslation("common");
  const contextData = useData();
  const { notificationPrefs } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [pendingValue, setPendingValue] = useState(null);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  // 📧 Client Notification State
  const [notificationPrompt, setNotificationPrompt] = useState({
    isOpen: false,
    eventType: null,
    eventData: null,
  });

  useEffect(() => {
    const updateIsMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    };
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  const currentStatus = statusOptions.find(s => s.value === value) || statusOptions[0];

  /**
   * Handle status change with domain rule validation + client notification
   */
  const handleStatusChange = (newValue) => {
    // If entityId and entityType are provided, validate with domain rules
    if (entityId && entityType && entityType !== 'generic') {
      const result = canPerformAction(entityType, entityId, 'changeStatus', {
        newValue,
        currentValue: value,
        data: entityData,
        contextData,
        entities: contextData
      });

      if (!result.allowed) {
        // Block the change and show blocker modal
        setPendingValue(newValue);
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
    }

    // Validation passed or no validation required - proceed with change
    onChange(newValue);

    // ✅ Log status change to history
    if (entityId && entityType && entityType !== 'generic') {
      const oldStatusLabel = statusOptions.find(s => s.value === value)?.label || value;
      const newStatusLabel = statusOptions.find(s => s.value === newValue)?.label || newValue;
      logStatusChange(entityType, entityId, oldStatusLabel, newStatusLabel);
    }

    // 📧 Check if client notification should be prompted
    if (entityId && entityType && entityType !== 'generic') {
      const notificationCheck = shouldPromptClientNotification(
        entityType,
        'changeStatus',
        {
          oldValue: value,
          newValue: newValue,
          data: entityData,
        },
        contextData,
        notificationPrefs
      );

      if (notificationCheck?.shouldPrompt) {
        setNotificationPrompt({
          isOpen: true,
          eventType: notificationCheck.eventType,
          eventData: notificationCheck.eventData,
        });
      }
    }
  };

  /**
   * 📧 Handle sending client notification
   */
  const handleSendNotification = async () => {
    const { eventType, eventData } = notificationPrompt;

    try {
      const result = await sendClientNotification(eventType, eventData, {
        channels: ['email'], // MVP: email only
      });

      if (result.success) {
      } else {
        console.error('❌ Failed to send client notification');
      }
    } catch (error) {
      console.error('Error sending client notification:', error);
    }

    // Close prompt
    setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
  };

  /**
   * 📧 Handle closing notification prompt without sending
   */
  const handleCloseNotificationPrompt = () => {
    setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
  };

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

    if (isMobile) {
      setIsOpen((prev) => !prev);
      return;
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

  const menuList = (
    <div className="py-1">
      {statusOptions.map((status) => {
        const isSelected = status.value === value;

        return (
          <button
            key={status.value}
            onClick={(e) => {
              e.stopPropagation();
              if (status.value !== value) {
                handleStatusChange(status.value);
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
    </div>
  );

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={handleToggle}
        data-inline-selector="status"
        className={`inline-flex items-center gap-2 rounded-full font-medium border transition-all hover:shadow-md hover:scale-105 min-w-max flex-shrink-0 ${sizeClasses[size]} ${getButtonColor()}`}
      >
        {currentStatus?.icon && <i className={`${currentStatus.icon} text-xs flex-shrink-0`}></i>}
        <span data-inline-selector-label className="whitespace-nowrap">{currentStatus?.label || value}</span>
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
              <SheetTitle>{t("actions.change", { defaultValue: "Change status" })}</SheetTitle>
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

      {/* Blocker Modal - portaled to body to escape overflow-hidden ancestors (e.g. EntityCard in grid view) */}
      {createPortal(
        <BlockerModal
          isOpen={blockerModalOpen}
          onClose={() => setBlockerModalOpen(false)}
          actionName={t("detail.blocker.actions.changeStatusTo", { status: statusOptions.find(s => s.value === pendingValue)?.label || pendingValue })}
          blockers={validationResult?.blockers || []}
          warnings={validationResult?.warnings || []}
          entityName={
            entityData?.name ||
            entityData?.lawsuitNumber ||
            entityData?.title ||
            entityData?.missionNumber ||
            `${entityType} #${entityId}`
          }
          entityType={entityType}
          entityId={entityId}
          action="changeStatus"
          context={{
            newValue: pendingValue,
            currentValue: value,
            data: entityData,
            entities: contextData
          }}
          onRetry={() => {
            // Retry the status change after blockers are resolved
            onChange(pendingValue);
            setPendingValue(null);
            setValidationResult(null);
          }}
          onUpdate={async () => {
            // Callback to refresh data when inline actions are performed
            if (contextData?.loadData) {
              await contextData.loadData();
            }
          }}
        />,
        document.body
      )}

      {/* 📧 Client Notification Prompt - portaled to body to escape overflow-hidden ancestors */}
      {createPortal(
        <ClientNotificationPrompt
          isOpen={notificationPrompt.isOpen}
          onClose={handleCloseNotificationPrompt}
          onConfirm={handleSendNotification}
          eventType={notificationPrompt.eventType}
          eventData={notificationPrompt.eventData}
        />,
        document.body
      )}
    </>
  );
}
