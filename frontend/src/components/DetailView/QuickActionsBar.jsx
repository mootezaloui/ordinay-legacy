import { useState, useEffect } from "react";
import ContentSection from "../layout/ContentSection";
import { canPerformAction } from "../../services/domainRules";
import BlockerModal from "../ui/BlockerModal";
import ConfirmImpactModal from "../ui/ConfirmImpactModal";
import { useToast } from "../../contexts/ToastContext";
import { useTranslation } from "react-i18next";

/**
 * QuickActionsBar - Inline editable fields with auto-save
 * Displays status, priority, assignment, and other high-frequency fields
 *
 * NEW: Integrates domain rules validation before allowing changes
 * UPDATED: Uses centralized toast system for consistent UX
 */
export default function QuickActionsBar({ data, config, onQuickAction, contextData }) {
    const quickActions = config.quickActions || [];
    const { t } = useTranslation("common");

    if (quickActions.length === 0) return null;

    return (
        <ContentSection title={t("detail.quickActions.title")}
            allowOverflow={true}>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {quickActions.map((action) => (
                        <QuickActionField
                            key={action.key}
                            action={action}
                            value={data[action.key]}
                            entityType={config.entityType}
                            entityId={data.id}
                            entityData={data}
                            contextData={contextData}
                            onChange={(value, skipValidation) => onQuickAction(action.key, value, action.validation, skipValidation)}
                        />
                    ))}
                </div>
            </div>
        </ContentSection>
    );
}

/**
 * Individual Quick Action Field with dropdown/inline editing
 *
 * NEW: Integrates domain rules validation
 * UPDATED: Uses centralized toast notifications
 */
function QuickActionField({ action, value, onChange, entityType, entityId, entityData, contextData }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [previousValue, setPreviousValue] = useState(value);
    const [blockerModalOpen, setBlockerModalOpen] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [pendingValue, setPendingValue] = useState(null);
    const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
    const [options, setOptions] = useState([]);
    const { showToast } = useToast();
    const { t } = useTranslation("common");

    // Initialize options - recalculate whenever contextData changes
    useEffect(() => {
        const getOptions = () => {
            if (typeof action.getOptions === 'function') {
                // Try to call with both parameters (formData, contextData) for overview-style fields
                // Fall back to single parameter for quick action style fields
                try {
                    const result = action.getOptions(entityData, contextData);
                    return result;
                } catch (error) {
                    // If that fails, try with just entityData
                    const result = action.getOptions(entityData);
                    return result;
                }
            }
            return action.options || [];
        };

        const newOptions = getOptions();
        setOptions(newOptions);
    }, [contextData, entityData, action]); // Refresh when contextData or entityData changes

    // Refresh options when needed
    const refreshOptions = () => {
        if (typeof action.getOptions === 'function') {
            try {
                const result = action.getOptions(entityData, contextData);
                setOptions(result);
            } catch (error) {
                const result = action.getOptions(entityData);
                setOptions(result);
            }
        } else {
            setOptions(action.options || []);
        }
    };

    const currentOption = options.find(opt => opt.value === value);
    const displayValue = currentOption?.label || action.displayValue?.(entityData) || value;
    const colorClass = action.colorMap && currentOption?.color
        ? currentOption.color
        : "bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white";
    const buttonBorderClass = action.colorMap
        ? "border-slate-300/70 dark:border-slate-600/80"
        : "border-slate-300 dark:border-slate-600";



    const handleCreateOption = async (newOptionName) => {
        if (action.onCreateOption) {
            try {
                await action.onCreateOption(newOptionName);
                refreshOptions();
                // Auto-select the newly created option
                handleChange(newOptionName);
            } catch (error) {
                console.error('Failed to create option:', error);
            }
        }
    };

    const handleChange = async (newValue) => {
        if (newValue === value) {
            setIsOpen(false);
            return;
        }

        // Validate with domain rules before allowing the change
        if (entityId && entityType) {
            const actionName = action.key === 'status' ? 'changeStatus' : 'edit';
            const result = canPerformAction(entityType, entityId, actionName, {
                newValue,
                currentValue: value,
                data: entityData,
                newData: { ...(entityData || {}), [action.key]: newValue },
                contextData,
                entities: contextData
            });

            if (!result.allowed) {
                // Block the change and show blocker modal
                setPendingValue(newValue);
                setValidationResult(result);
                setBlockerModalOpen(true);
                setIsOpen(false);
                return;
            }

            if (result.requiresConfirmation) {
                setPendingValue(newValue);
                setValidationResult(result);
                setConfirmImpactModalOpen(true);
                setIsOpen(false);
                return;
            }
        }

        setPreviousValue(value);
        setIsOpen(false);
        setIsSaving(true);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            await onChange(newValue);
        } catch {
            // onChange (handleQuickAction) rejected — blocker or save error already handled upstream
            setIsSaving(false);
            return;
        }
        setIsSaving(false);
        setShowSuccess(true);

        // Show success toast with undo option
        const currentOption = options.find(opt => opt.value === newValue);
        const newLabel = currentOption?.label || newValue;

        showToast(t("detail.quickActions.toast.success.update", { label: action.label, value: newLabel }), "success", {
            title: t("detail.quickActions.toast.title.updateSuccess"),
            context: entityType,
            action: {
                label: "Undo",
                onClick: () => {
                    onChange(previousValue);
                    showToast(t("detail.quickActions.toast.info.cancel"), "info", {
                        title: t("detail.quickActions.toast.title.undoSuccess"),
                        context: entityType,
                    });
                }
            },
            duration: 4000, // Longer duration to allow undo
        });

        // Hide success indicator
        setTimeout(() => setShowSuccess(false), 1000);
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

            <>
                {/* Dropdown Button — Pill Style */}
                <div className="relative">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        disabled={isSaving}
                        className={`
            w-full px-4 py-2 rounded-full text-sm font-medium transition-all
            flex items-center gap-2
            border ${buttonBorderClass}
            shadow-sm
            hover:brightness-110
            hover:shadow
            focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:focus-visible:ring-blue-500/50
            ${colorClass}
            ${isSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
          `}
                    >
                        {action.colorMap && currentOption?.color && (
                            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-current" />
                        )}
                        <span className="truncate flex-1 text-left">{displayValue}</span>
                        <div className="flex-shrink-0">
                            {isSaving ? (
                                <i className="fas fa-spinner fa-spin text-sm"></i>
                            ) : showSuccess ? (
                                <i className="fas fa-check text-green-600 dark:text-green-400"></i>
                            ) : (
                                <span 
                                    style={{ 
                                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                                        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                                    }}
                                    className="inline-flex items-center justify-center"
                                >
                                    <i className="fas fa-chevron-down text-[10px] opacity-60"></i>
                                </span>
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
                            <div className="absolute top-full left-0 mt-1.5 w-full min-w-[200px] bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-liquid-reveal-down">
                                <div className="p-1 max-h-60 overflow-y-auto animate-liquid-content">
                                    {options.map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => handleChange(option.value)}
                                            className={`
                        w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors
                        flex items-center gap-2
                        ${option.value === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                      `}
                                        >
                                            {action.colorMap && option.color ? (
                                                <span className={`flex items-center gap-2 flex-1 ${option.color.split(' ').filter(c => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ')}`}>
                                                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-current" />
                                                    <span className="text-sm font-medium">{option.label}</span>
                                                </span>
                                            ) : (
                                                <span className="flex-1 text-slate-700 dark:text-slate-200">{option.label}</span>
                                            )}
                                            {option.value === value && (
                                                <i className="fas fa-check text-blue-600 dark:text-blue-400 text-xs"></i>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {action.allowCreate && (
                                    <div className="border-t border-slate-200 dark:border-slate-700 p-1.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const createdName = window.prompt(
                                                    action.createLabel || t("form.select.createLabel"),
                                                );
                                                const trimmed = String(createdName || "").trim();
                                                if (!trimmed) return;
                                                handleCreateOption(trimmed);
                                                setIsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors text-blue-700 dark:text-blue-300 flex items-center gap-2"
                                        >
                                            <i className="fas fa-plus text-xs"></i>
                                            <span>{action.createLabel || t("form.select.createLabel")}</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </>


            {/* Blocker Modal - ENHANCED with interactive actions */}
            <BlockerModal
                isOpen={blockerModalOpen}
                onClose={() => setBlockerModalOpen(false)}
                actionName={`Change ${action.label} to "${pendingValue}"`}
                blockers={validationResult?.blockers || []}
                warnings={validationResult?.warnings || []}
                entityName={
                    entityData?.name ||              // For clients
                    entityData?.title ||             // For dossiers, tasks, sessions
                    entityData?.lawsuitNumber ||        // For lawsuits
                    entityData?.missionNumber ||     // For missions
                    `#${entityId}`                   // Fallback
                }
                entityType={entityType}
                entityId={entityId}
                action={action.key === 'status' ? 'changeStatus' : 'edit'}
                context={{
                    newValue: pendingValue,
                    currentValue: value,
                    data: entityData,
                    newData: { ...(entityData || {}), [action.key]: pendingValue },
                    entities: contextData
                }}
                onRetry={() => {
                    // Retry the action after blockers are resolved
                    onChange(pendingValue);
                    setPendingValue(null);
                    setValidationResult(null);
                }}
                onUpdate={() => {
                    // Callback to refresh data when inline actions are performed
                }}
            />
            <ConfirmImpactModal
                isOpen={confirmImpactModalOpen}
                onClose={() => {
                    setConfirmImpactModalOpen(false);
                    setPendingValue(null);
                    setValidationResult(null);
                }}
                onConfirm={async () => {
                    setConfirmImpactModalOpen(false);
                    const valueToSave = pendingValue;
                    setPendingValue(null);
                    setValidationResult(null);

                    // Proceed with the save directly (bypass validation since user already confirmed)
                    setPreviousValue(value);
                    setIsSaving(true);

                    // Simulate API delay
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Pass skipValidation=true to bypass the domain rules check in handleQuickAction
                    onChange(valueToSave, true);
                    setIsSaving(false);
                    setShowSuccess(true);

                    // Show success toast with undo option
                    const currentOption = options.find(opt => opt.value === valueToSave);
                    const newLabel = currentOption?.label || valueToSave;

                    showToast(t("detail.quickActions.toast.success.update", { label: action.label, value: newLabel }), "success", {
                        title: t("detail.quickActions.toast.title.updateSuccess"),
                        context: entityType,
                        action: {
                            label: "Undo",
                            onClick: () => {
                                onChange(previousValue);
                                showToast(t("detail.quickActions.toast.info.cancel"), "info", {
                                    title: t("detail.quickActions.toast.title.undoSuccess"),
                                    context: entityType,
                                });
                            }
                        },
                        duration: 4000,
                    });

                    // Hide success indicator
                    setTimeout(() => setShowSuccess(false), 1000);
                }}
                actionName={`change ${action.label}`}
                impactSummary={validationResult?.impactSummary || []}
                entityName={entityData?.lawsuitNumber || entityData?.title || `#${entityId}`}
            />
        </div>
    );
}


