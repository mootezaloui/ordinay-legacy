import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  PLACEHOLDER_CONTEXT,
  resolveContextualPlaceholder,
} from "../../utils/fieldPlaceholders";

/**
 * SearchableSelect - A searchable dropdown component
 * Allows users to search/filter options by typing
 * Ideal for large lists of items (clients, dossiers, lawsuits, etc.)
 * 
 * ✅ VISUAL CONSISTENCY: Matches native select styling exactly
 * ✅ NEW: Support for adding new options on-the-fly
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder, // ✅ Now undefined by default - will use i18n fallback
  placeholderContext = PLACEHOLDER_CONTEXT.SEARCHABLE_SELECT,
  disabled = false,
  className = "",
  error = false,
  compact = false, // ✅ NEW: Compact mode support
  allowCreate = false, // ✅ NEW: Allow creating new options
  onCreateOption = null, // ✅ NEW: Callback when creating new option
  createLabel = null, // ✅ NEW: Label for create button
  placement = "bottom", // NEW: allow opening above when dropdown would be clipped
  isLoading = false,
  showClear = true,
}) {
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const dropdownRef = useRef(null);

  const areValuesEqual = (left, right) => {
    if (left === right) return true;
    if (left === undefined || left === null || right === undefined || right === null) {
      return false;
    }
    return String(left) === String(right);
  };

  // Get the label for the selected value
  const selectedOption = options.find((opt) => areValuesEqual(opt?.value, value));
  const displayValue = selectedOption ? selectedOption.label : "";

  // Filter options based on search term
  const filteredOptions = options.filter((option) => {
    const label = option?.label ?? "";
    return label.toString().toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Ignore clicks inside the dropdown portal
      if (dropdownRef.current && dropdownRef.current.contains(event.target)) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll to highlighted item (only when highlightedIndex changes via keyboard, not on open)
  const prevHighlightedIndexRef = useRef(highlightedIndex);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    // Track isOpen changes without triggering scroll
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex];
      // Only scroll if highlightedIndex actually changed (keyboard navigation)
      // Don't scroll when dropdown first opens (prev === current on initial render)
      if (highlightedElement && prevHighlightedIndexRef.current !== highlightedIndex) {
        highlightedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
    prevHighlightedIndexRef.current = highlightedIndex;
  }, [highlightedIndex, isOpen]);

  const handleInputFocus = () => {
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleOptionClick = (option) => {
    onChange(option.value);
    setSearchTerm("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleCreateOption = async () => {
    if (!searchTerm.trim() || !onCreateOption) return;

    try {
      await onCreateOption(searchTerm.trim());
      setSearchTerm("");
      setIsOpen(false);
    } catch (error) {
      console.error('Error creating option:', error);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleOptionClick(filteredOptions[highlightedIndex]);
        } else if (allowCreate && searchTerm.trim() && filteredOptions.length === 0) {
          handleCreateOption();
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm("");
        inputRef.current?.blur();
        break;
      case "Tab":
        setIsOpen(false);
        setSearchTerm("");
        break;
      default:
        break;
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
    inputRef.current?.focus();
  };

  // Position dropdown relative to viewport to avoid clipping inside modal overflow
  useEffect(() => {
    const updatePosition = () => {
      if (!isOpen || !inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      const offset = 4; // small gap between input and dropdown
      const top = placement === "top"
        ? rect.top - offset
        : rect.bottom + offset;
      const left = rect.left;
      setDropdownStyle({
        position: "fixed",
        top,
        left,
        width: rect.width,
        zIndex: 9999,
        transform: placement === "top" ? "translateY(-100%)" : "none",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, placement]);

  // ✅ UNIFIED STYLING: Matches native select exactly
  const baseInputClass = `w-full ${compact ? 'px-2.5 py-1.5 text-sm' : 'px-3 py-2'} pr-20 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${error
    ? "border-red-500 dark:border-red-500"
    : "border-slate-300 dark:border-slate-600"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text hover:border-slate-400 dark:hover:border-slate-500"} ${className}`;
  const resolvedCreateLabel = createLabel || t("form.select.createLabel");
  const resolvedPlaceholder = resolveContextualPlaceholder({
    t,
    placeholder,
    context: placeholderContext,
    isLoading,
  });

  return (
    <div ref={containerRef} className="relative">
      {/* Input Field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          className={baseInputClass}
          autoComplete="off"
        />

        {/* Icons - ✅ UNIFIED: Consistent sizing and spacing */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {showClear && value !== undefined && value !== null && value !== "" && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              tabIndex={-1}
              aria-label={t("search.aria.clearSelection", { ns: "common" })}
            >
              <i className={`fas fa-times ${compact ? 'text-xs' : 'text-sm'}`}></i>
            </button>
          )}
          <i
            className={`fas fa-chevron-${isOpen ? "up" : "down"
              } text-slate-400 text-xs transition-transform duration-200`}
          ></i>
        </div>
      </div>

      {/* Dropdown List - Modern/Minimal: Clean, professional */}
      {isOpen && !disabled && createPortal(
        <div
          ref={dropdownRef}
          className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto animate-in fade-in ${placement === "top" ? "slide-in-from-bottom-1" : "slide-in-from-top-1"} duration-150`}
          style={dropdownStyle}
        >
          {filteredOptions.length > 0 ? (
            <ul ref={listRef} className="py-1">
              {filteredOptions.map((option, index) => (
                <li
                  key={`${option.value ?? "option"}-${index}`}
                  onClick={() => handleOptionClick(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 ${compact ? 'py-1.5 text-sm' : 'py-2'} cursor-pointer transition-colors ${index === highlightedIndex
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                    : "text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
                    } ${areValuesEqual(option?.value, value)
                      ? "font-medium bg-blue-50 dark:bg-blue-900/20"
                      : ""
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={compact ? "text-sm" : "text-sm"}>{option.label}</span>
                    {areValuesEqual(option?.value, value) && (
                      <i className="fas fa-check text-blue-600 dark:text-blue-400 text-xs"></i>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={`px-3 ${compact ? 'py-4' : 'py-6'} text-center text-slate-500 dark:text-slate-400 text-sm`}>
              <i className={`fas fa-search ${compact ? 'text-xl' : 'text-2xl'} mb-2 opacity-50`}></i>
              <p>{t("form.select.noResults")}</p>
              {searchTerm && (
                <p className="text-xs mt-1">
                  {t("form.select.noResultsFor", { term: searchTerm })}
                </p>
              )}
            </div>
          )}

          {/* Add New Option Button */}
          {allowCreate && searchTerm.trim() && filteredOptions.length === 0 && onCreateOption && (
            <div className="border-t border-slate-200 dark:border-slate-700 p-2">
              <button
                type="button"
                onClick={handleCreateOption}
                className="w-full px-3 py-2 text-left text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                <span>{t("form.select.createOption", { term: searchTerm.trim(), label: resolvedCreateLabel })}</span>
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

