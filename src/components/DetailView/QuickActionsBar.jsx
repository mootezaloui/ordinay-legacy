import { useState, useEffect } from "react";
import ContentSection from "../layout/ContentSection";
import { canPerformAction } from "../../services/domainRules";
import BlockerModal from "../ui/BlockerModal";
import ConfirmImpactModal from "../ui/ConfirmImpactModal";
import { useToast } from "../../contexts/ToastContext";
import SearchableSelect from "../FormModal/SearchableSelect";

/**
 * QuickActionsBar - Inline editable fields with auto-save
 * Displays status, priority, assignment, and other high-frequency fields
 *
 * NEW: Integrates domain rules validation before allowing changes
 * UPDATED: Uses centralized toast system for consistent UX
 */
export default function QuickActionsBar({ data, config, onQuickAction, contextData }) {
    const quickActions = config.quickActions || [];

    if (quickActions.length === 0) return null;

    return (
        <ContentSection title="Quick Actions" allowOverflow={true}>
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

    // Get options - support both static options and getOptions function
    const getActionOptions = () => {
        if (typeof action.getOptions === 'function') {
            return action.getOptions(entityData);
        }
        return action.options || [];
    };

    // Initialize options
    useEffect(() => {
        setOptions(getActionOptions());
    }, []);

    // Refresh options when needed
    const refreshOptions = () => {
        setOptions(getActionOptions());
    };

    const currentOption = options.find(opt => opt.value === value);
    const displayValue = currentOption?.label || action.displayValue?.(entityData) || value;
    const colorClass = action.colorMap && currentOption?.color
        ? currentOption.color
        : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white";



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

        onChange(newValue);
        setIsSaving(false);
        setShowSuccess(true);

        // Show success toast with undo option
        const currentOption = options.find(opt => opt.value === newValue);
        const newLabel = currentOption?.label || newValue;

        showToast(`${action.label} Update: ${newLabel}`, "success", {
            title: "Update Successful",
            context: entityType,
            action: {
                label: "Undo",
                onClick: () => {
                    onChange(previousValue);
                    showToast("Update Cancelled", "info", {
                        title: "Undo Successful",
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

            {/* Use SearchableSelect for assignedTo field with create support */}
            {action.allowCreate ? (
                <SearchableSelect
                    value={value || ''}
                    onChange={handleChange}
                    options={options}
                    placeholder={`Sélectionner ${action.label}...`}
                    allowCreate={action.allowCreate}
                    onCreateOption={handleCreateOption}
                    createLabel={action.createLabel || "Add"}
                    compact={false}
                />
            ) : (
                <>
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
                                    {options.map((option) => (
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
                </>
            )}

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
                    entityData?.caseNumber ||        // For cases
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
                    console.log('Data updated, should refresh entity data');
                }}
            />
            <ConfirmImpactModal
                isOpen={confirmImpactModalOpen}
                onClose={() => {
                    setConfirmImpactModalOpen(false);
                    setPendingValue(null);
                }}
                onConfirm={() => {
                    setConfirmImpactModalOpen(false);
                    setPendingValue(null);
                    onChange(pendingValue);
                }}
                actionName={`change ${action.label}`}
                impactSummary={validationResult?.impactSummary || []}
                entityName={entityData?.caseNumber || entityData?.title || `#${entityId}`}
            />
        </div>
    );
}
