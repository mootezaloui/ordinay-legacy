import { useState, useRef, useEffect } from "react";

/**
 * SearchableSelect - A searchable dropdown component
 * Allows users to search/filter options by typing
 * Ideal for large lists of items (clients, dossiers, cases, etc.)
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Rechercher...",
  disabled = false,
  className = "",
  error = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Get the label for the selected value
  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption ? selectedOption.label : "";

  // Filter options based on search term
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll to highlighted item
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
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

  const baseInputClass = `w-full px-3 py-2 pr-20 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
    error
      ? "border-red-500 dark:border-red-500"
      : "border-slate-300 dark:border-slate-600"
  } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"} ${className}`;

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
          placeholder={placeholder}
          disabled={disabled}
          className={baseInputClass}
          autoComplete="off"
        />

        {/* Icons */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              tabIndex={-1}
            >
              <i className="fas fa-times text-sm"></i>
            </button>
          )}
          <i
            className={`fas fa-chevron-${
              isOpen ? "up" : "down"
            } text-slate-400 text-xs transition-transform`}
          ></i>
        </div>
      </div>

      {/* Dropdown List */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            <ul ref={listRef} className="py-1">
              {filteredOptions.map((option, index) => (
                <li
                  key={option.value}
                  onClick={() => handleOptionClick(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 py-2 cursor-pointer transition-colors ${
                    index === highlightedIndex
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                      : "text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
                  } ${
                    option.value === value
                      ? "font-medium bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{option.label}</span>
                    {option.value === value && (
                      <i className="fas fa-check text-blue-600 dark:text-blue-400 text-xs"></i>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
              <i className="fas fa-search text-2xl mb-2 opacity-50"></i>
              <p>Aucun résultat trouvé</p>
              {searchTerm && (
                <p className="text-xs mt-1">
                  pour "{searchTerm}"
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
