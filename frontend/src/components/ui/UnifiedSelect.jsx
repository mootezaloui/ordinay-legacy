/**
 * UnifiedSelect - Visual wrapper for consistent selector UX
 * 
 * ⚠️ CRITICAL: This is a VISUAL WRAPPER ONLY
 * - Does NOT modify selector logic
 * - Does NOT change conditional rendering
 * - Does NOT alter data sources or filtering
 * - Only normalizes: styling, animations, positioning, keyboard UX
 * 
 * Wraps both SearchableSelect and native <select> with unified appearance.
 */
import SearchableSelect from "../FormModal/SearchableSelect";
import { useTranslation } from "react-i18next";
import {
    PLACEHOLDER_CONTEXT,
    resolveContextualPlaceholder,
} from "../../utils/fieldPlaceholders";

/**
 * UnifiedSelect - Consistent visual shell for all selectors
 * 
 * @param {string} variant - 'searchable' or 'native' (determines internal component)
 * @param {*} value - Current selected value
 * @param {function} onChange - Change handler
 * @param {array} options - Options array [{value, label}]
 * @param {string} placeholder - Placeholder text
 * @param {boolean} disabled - Disabled state
 * @param {boolean} error - Error state
 * @param {string} className - Additional classes
 * @param {boolean} compact - Compact mode
 */
export default function UnifiedSelect({
    variant = "searchable",
    value,
    onChange,
    options = [],
    placeholder,
    placeholderContext = null,
    isLoading = false,
    disabled = false,
    error = false,
    className = "",
    compact = false,
    ...rest
}) {
    const { t } = useTranslation("common");

    // ✅ Unified wrapper classes (applied to container)
    const wrapperClass = `unified-select-wrapper ${className}`;

    // Use i18n fallback if no placeholder provided
    const effectiveContext = placeholderContext || (
        variant === "searchable"
            ? PLACEHOLDER_CONTEXT.SEARCHABLE_SELECT
            : PLACEHOLDER_CONTEXT.SELECT
    );
    const effectivePlaceholder = resolveContextualPlaceholder({
        t,
        placeholder,
        context: effectiveContext,
        isLoading,
    });

    // ✅ Searchable variant uses SearchableSelect with preserved behavior
    if (variant === "searchable") {
        return (
            <div className={wrapperClass}>
                <SearchableSelect
                    value={value}
                    onChange={onChange}
                    options={options}
                    placeholder={effectivePlaceholder}
                    placeholderContext={effectiveContext}
                    disabled={disabled}
                    error={error}
                    compact={compact}
                    isLoading={isLoading}
                    {...rest}
                />
            </div>
        );
    }

    // ✅ Native variant uses HTML select with unified styling
    // Matches SearchableSelect's visual appearance
    const baseInputClass = `w-full ${compact ? 'px-2.5 py-1.5 text-sm' : 'px-3 py-2'} pr-8 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors appearance-none cursor-pointer ${error
        ? "border-red-500 dark:border-red-500"
        : "border-slate-300 dark:border-slate-600"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-slate-400 dark:hover:border-slate-500"}`;

    return (
        <div className={`${wrapperClass} relative`}>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={baseInputClass}
                {...rest}
            >
                <option value="">{effectivePlaceholder}</option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>

            {/* Unified chevron icon (matches SearchableSelect) */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <i className="fas fa-chevron-down text-slate-400 text-xs"></i>
            </div>
        </div>
    );
}
