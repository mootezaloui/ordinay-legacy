import { useEffect, useRef, useState } from "react";

export default function CardActionMenu({ actions = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (!menuRef.current || menuRef.current.contains(event.target)) return;
      setIsOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (actions.length === 0) return null;

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="h-11 w-11 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shadow-sm"
        aria-haspopup="menu"
        aria-expanded={isOpen ? "true" : "false"}
        aria-label="More actions"
      >
        <i className="fas fa-ellipsis-h text-base"></i>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-slate-900 dark:text-slate-100 shadow-lg z-50"
          role="menu"
        >
          {actions.map((action, idx) => {
            const label = action.title || action.icon || "Action";
            const isDestructive = action.variant === "delete" || action.icon === "delete";
            return (
              <button
                key={`${label}-${idx}`}
                type="button"
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${
                  isDestructive ? "text-red-600" : ""
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsOpen(false);
                  if (typeof action.onClick === "function") {
                    action.onClick({
                      stopPropagation: () => {},
                      preventDefault: () => {},
                    });
                  }
                }}
                role="menuitem"
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
