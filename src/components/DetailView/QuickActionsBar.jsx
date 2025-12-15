import { useState, useEffect } from "react";
import ContentSection from "../layout/ContentSection";

/**
 * QuickActionsBar - Inline editable fields with auto-save
 * Displays status, priority, assignment, and other high-frequency fields
 */
export default function QuickActionsBar({ data, config, onQuickAction }) {
    const quickActions = config.quickActions || [];

    if (quickActions.length === 0) return null;

    return (
        <ContentSection title="Actions rapides" allowOverflow={true}>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {quickActions.map((action) => (
                        <QuickActionField
                            key={action.key}
                            action={action}
                            value={data[action.key]}
                            onChange={(value) => onQuickAction(action.key, value, action.validation)}
                        />
                    ))}
                </div>
            </div>
        </ContentSection>
    );
}

/**
 * Individual Quick Action Field with dropdown/inline editing
 */
function QuickActionField({ action, value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showUndo, setShowUndo] = useState(false);
    const [previousValue, setPreviousValue] = useState(value);

    const currentOption = action.options?.find(opt => opt.value === value);
    const displayValue = currentOption?.label || value;
    const colorClass = action.colorMap && currentOption?.color
        ? currentOption.color
        : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white";

    const handleChange = async (newValue) => {
        if (newValue === value) {
            setIsOpen(false);
            return;
        }

        setPreviousValue(value);
        setIsOpen(false);
        setIsSaving(true);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));

        onChange(newValue);
        setIsSaving(false);
        setShowSuccess(true);
        setShowUndo(true);

        // Hide success indicator
        setTimeout(() => setShowSuccess(false), 1000);

        // Hide undo button
        setTimeout(() => setShowUndo(false), 3000);
    };

    const handleUndo = () => {
        onChange(previousValue);
        setShowUndo(false);
    };

    return (
        <div className="relative">
            {/* Label */}
            <div className="flex items-center gap-2 mb-2">
                {action.icon && <i className={`${action.icon} text-slate-500 dark:text-slate-400`}></i>}
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {action.label}
                </span>
            </div>

            {/* Dropdown Button */}
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    disabled={isSaving}
                    className={`
            w-full px-3 py-2 rounded-lg text-sm font-medium transition-all
            flex items-center justify-between gap-2
            hover:ring-2 hover:ring-blue-500/20
            ${colorClass}
            ${isSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
          `}
                >
                    <span className="truncate">{displayValue}</span>
                    <div className="flex-shrink-0">
                        {isSaving ? (
                            <i className="fas fa-spinner fa-spin text-sm"></i>
                        ) : showSuccess ? (
                            <i className="fas fa-check text-green-600 dark:text-green-400"></i>
                        ) : (
                            <i className="fas fa-chevron-down text-sm"></i>
                        )}
                    </div>
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-10"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Options */}
                        <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 py-1 max-h-60 overflow-y-auto">
                            {action.options?.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => handleChange(option.value)}
                                    className={`
                    w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors
                    flex items-center justify-between
                    ${option.value === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                  `}
                                >
                                    <span className="flex items-center gap-2">
                                        {action.colorMap && option.color ? (
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${option.color}`}>
                                                {option.label}
                                            </span>
                                        ) : (
                                            <span>{option.label}</span>
                                        )}
                                    </span>
                                    {option.value === value && (
                                        <i className="fas fa-check text-blue-600 dark:text-blue-400"></i>
                                    )}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Undo Toast */}
            {showUndo && (
                <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg shadow-lg flex items-center gap-3 z-30 whitespace-nowrap animate-fade-in">
                    <span>Modifié</span>
                    <button
                        onClick={handleUndo}
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium"
                    >
                        <i className="fas fa-undo text-xs"></i>
                        Annuler
                    </button>
                </div>
            )}
        </div>
    );
}