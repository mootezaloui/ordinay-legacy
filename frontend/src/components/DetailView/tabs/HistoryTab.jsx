import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getEntityHistory } from "../../../services/historyService";
import {
    Clock,
    CheckCircle2,
    XCircle,
    Plus,
    Pencil,
    Trash2,
    MinusCircle,
    ArrowRight,
    UserPlus,
    DollarSign,
    AlertTriangle,
    Archive,
    RotateCcw,
    Ban,
} from "lucide-react";
import { useSettings } from "../../../contexts/SettingsContext";
import ContentSection from "../../layout/ContentSection";

/**
 * Determine the action type from event data
 * Returns: created, updated, deleted, cancelled, child_deleted, hard_deleted, or the raw eventType
 */
function getActionType(event) {
    const { eventType, metadata = {}, label = '' } = event;
    const labelLower = label.toLowerCase();

    // Check metadata.action first (most reliable)
    if (metadata.action) {
        return metadata.action;
    }

    // Check eventType for explicit actions
    if (eventType === 'child_deleted' || eventType === 'child_created') {
        return eventType;
    }

    // Infer from label/description
    if (labelLower.includes('created') || labelLower.includes('créé') || labelLower.includes('ajouté') || labelLower.includes('added')) {
        return 'created';
    }
    if (labelLower.includes('deleted') || labelLower.includes('supprimé') || labelLower.includes('removed')) {
        return 'deleted';
    }
    if (labelLower.includes('cancelled') || labelLower.includes('annulé')) {
        return 'cancelled';
    }
    if (labelLower.includes('updated') || labelLower.includes('modifié') || labelLower.includes('changed') || labelLower.includes('changé')) {
        return 'updated';
    }

    // Check for status/lifecycle changes
    if (eventType === 'lifecycle') {
        return metadata.action || 'lifecycle';
    }

    return eventType;
}

/**
 * Extract change details from metadata
 * Returns array of { field, oldValue, newValue } objects
 */
function extractChangeDetails(metadata = {}, formatAmount) {
    const changes = [];
    const amountFormatter = typeof formatAmount === "function" ? formatAmount : (v) => v;
    const formatAmountValue = (value) => {
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed && Number.isNaN(Number(trimmed))) {
                return value;
            }
        }
        return amountFormatter(value);
    };

    // Known field mappings for display
    const fieldConfig = {
        status: { label: 'status', format: (v) => v },
        amount: { label: 'amount', format: formatAmountValue },
        title: { label: 'title', format: (v) => v },
        priority: { label: 'priority', format: (v) => v },
        due_date: { label: 'due_date', format: (v) => v },
        scheduled_at: { label: 'scheduled_at', format: (v) => v },
        session_date: { label: 'session_date', format: (v) => v },
        location: { label: 'location', format: (v) => v },
        outcome: { label: 'outcome', format: (v) => v },
        assigned_to: { label: 'assignment', format: (v) => v },
        description: { label: 'description', format: (v) => v ? (v.length > 30 ? v.substring(0, 30) + '...' : v) : '-' },
        paid_at: { label: 'paid_at', format: (v) => v },
    };

    // Extract previous_X / new_X pairs dynamically
    const processedFields = new Set();
    Object.keys(metadata).forEach(key => {
        if (key.startsWith('previous_')) {
            const fieldName = key.replace('previous_', '');
            const newKey = `new_${fieldName}`;
            if (processedFields.has(fieldName)) return;
            processedFields.add(fieldName);

            const oldVal = metadata[key];
            const newVal = metadata[newKey];

            if (oldVal === newVal) return;
            if (newVal === undefined) return;

            const config = fieldConfig[fieldName] || { label: fieldName, format: (v) => v };
            changes.push({
                field: config.label,
                oldValue: oldVal !== null && oldVal !== undefined ? config.format(oldVal) : '-',
                newValue: newVal !== null && newVal !== undefined ? config.format(newVal) : '-',
            });
        }
    });

    // Also check legacy formats (oldStatus/newStatus, etc.)
    if (changes.length === 0) {
        if (metadata.oldStatus !== undefined && metadata.newStatus !== undefined && metadata.oldStatus !== metadata.newStatus) {
            changes.push({
                field: 'status',
                oldValue: metadata.oldStatus,
                newValue: metadata.newStatus,
            });
        }

        if (metadata.assignedTo) {
            changes.push({
                field: 'assignment',
                oldValue: metadata.previousAssignee || null,
                newValue: metadata.assignedTo,
            });
        }
    }

    return changes;
}

/**
 * Extract parent context from description
 * Parses strings like: 'Mission "Research Phase" (PRO-2026-001) was deleted'
 */
function extractParentContext(event) {
    const { label = '', details = '', metadata = {} } = event;
    const text = details || label;

    // Try to extract entity name and reference from description
    const patterns = [
        // "Mission "Name" (REF-123)" pattern
        /(?:Mission|Task|Session|Case|Dossier|Financial entry|Entrée financière)\s+"([^"]+)"\s*\(([^)]+)\)/i,
        // "to Mission "Name"" pattern
        /(?:to|à|dans|in)\s+(?:Mission|Task|Session|Case|Dossier)\s+"([^"]+)"/i,
        // "in Case "Name"" pattern
        /(?:in|dans)\s+(?:Case|Dossier)\s+"([^"]+)"/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return {
                entityName: match[1],
                reference: match[2] || null,
            };
        }
    }

    return null;
}

/**
 * Extract financial entry data from metadata
 */
function extractFinancialData(metadata = {}) {
    // Check for entry snapshot
    const entry = metadata.entry || metadata.new_entry || metadata.previous_entry;
    if (!entry) {
        // Fallback to direct metadata fields
        if (metadata.amount !== undefined) {
            return {
                amount: metadata.amount,
                type: metadata.actionType || metadata.type,
                status: metadata.status,
            };
        }
        return null;
    }

    return {
        amount: entry.amount,
        type: entry.type || entry.entry_type,
        status: entry.status,
        description: entry.description,
        paid_at: entry.paid_at,
    };
}

/**
 * Calculate event depth based on metadata and action
 */
function getEventDepth(event) {
    const { eventType, metadata = {} } = event;
    const action = getActionType(event);

    // child_deleted and child_created are always depth 1
    if (action === 'child_deleted' || action === 'child_created' || eventType === 'child_deleted' || eventType === 'child_created') {
        return 1;
    }

    // Relation events are depth 1
    if (eventType === 'relation') {
        return 1;
    }

    // Finance events with parent context
    if (eventType === 'finance' && (metadata.relatedType || metadata.childType)) {
        return 1;
    }

    // Default: direct event on current entity
    return 0;
}

/**
 * History Tab - Read-only audit trail
 */
export default function HistoryTab({ entityType, entityId, label }) {
    const { t, i18n } = useTranslation("common");
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const { formatDateTime, formatCurrency } = useSettings();

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            const events = await getEntityHistory(entityType, entityId);
            setHistory(events);
            setLoading(false);
        };
        fetchHistory();
    }, [entityType, entityId]);

    if (loading) {
        return (
            <ContentSection data-tutorial="dossier-history-section" title={label || t("detail.tabs.history")}>
                <div className="flex flex-col items-center justify-center p-12 text-center">
                    <Clock className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4 animate-pulse" />
                    <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t("detail.history.loading")}
                    </h3>
                </div>
            </ContentSection>
        );
    }

    if (!history || history.length === 0) {
        return (
            <ContentSection data-tutorial="dossier-history-section" title={label || t("detail.tabs.history")}>
                <div className="flex flex-col items-center justify-center p-12 text-center">
                    <Clock className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t("detail.history.empty.title")}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                        {t("detail.history.empty.description")}
                    </p>
                </div>
            </ContentSection>
        );
    }

    return (
        <ContentSection data-tutorial="dossier-history-section" title={label || t("detail.tabs.history")}>
            <div className="p-6">
                <div className="max-w-4xl mx-auto">
                    <div className="space-y-3">
                        {history.map((event, index) => (
                            <HistoryEvent
                                key={event.id}
                                event={event}
                                isFirst={index === 0}
                                isLast={index === history.length - 1}
                                formatDateTime={formatDateTime}
                                formatCurrency={formatCurrency}
                                t={t}
                                i18n={i18n}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </ContentSection>
    );
}

/**
 * Single history event component with visual hierarchy
 */
function HistoryEvent({ event, isFirst, isLast, formatDateTime, formatCurrency, t, i18n }) {
    const depth = getEventDepth(event);
    const action = getActionType(event);
    const { icon, bgColor } = getActionIcon(action, event.eventType, event.metadata, depth);
    const changeDetails = extractChangeDetails(event.metadata, formatCurrency);
    const parentContext = extractParentContext(event);
    const financialData = event.eventType === 'finance' ? extractFinancialData(event.metadata) : null;

    // Visual hierarchy styles based on depth
    const depthStyles = {
        0: {
            wrapper: "",
            container: "bg-slate-50/50 dark:bg-slate-800/30 rounded-lg p-4",
            iconSize: "w-11 h-11",
            titleClass: "text-base font-semibold text-slate-900 dark:text-slate-100",
            timestampClass: "text-sm",
        },
        1: {
            wrapper: "ml-6 pl-5 border-l-2 border-slate-200 dark:border-slate-700",
            container: "py-3",
            iconSize: "w-9 h-9",
            titleClass: "text-sm font-medium text-slate-700 dark:text-slate-300",
            timestampClass: "text-xs",
        },
    };

    const style = depthStyles[Math.min(depth, 1)];

    return (
        <div className={style.wrapper}>
            <div className={`relative flex gap-3 group ${style.container}`}>
                {/* Icon */}
                <div className={`relative z-10 flex items-center justify-center ${style.iconSize} rounded-full ${bgColor} flex-shrink-0`}>
                    {icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h4 className={`${style.titleClass} overflow-wrap-anywhere`}>
                                {event.label}
                            </h4>
                            {/* Parent context line */}
                            {parentContext && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {parentContext.entityName}
                                    {parentContext.reference && <span className="ml-1 text-slate-400">({parentContext.reference})</span>}
                                </p>
                            )}
                            <p className={`${style.timestampClass} text-slate-400 dark:text-slate-500 mt-0.5`}>
                                {formatTimestamp(event.timestamp, formatDateTime, t, i18n)}
                            </p>
                        </div>

                        {/* Badges row */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            <ActionBadge action={action} t={t} />
                            <CategoryBadge eventType={event.eventType} t={t} />
                        </div>
                    </div>

                    {/* Change details block */}
                    {changeDetails.length > 0 && (
                        <ChangeDetailsBlock changes={changeDetails} t={t} />
                    )}

                    {/* Financial data block */}
                    {financialData && action === 'created' && (
                        <FinancialDataBlock data={financialData} t={t} formatCurrency={formatCurrency} />
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Get action-specific icon and colors
 */
function getActionIcon(action, eventType, metadata = {}, depth = 0) {
    const iconSize = depth === 0 ? "w-5 h-5" : "w-4 h-4";

    // Action-based icons
    switch (action) {
        case 'created':
        case 'child_created':
            return {
                icon: <Plus className={`${iconSize} text-green-600`} />,
                bgColor: 'bg-green-100 dark:bg-green-900/30',
            };

        case 'updated':
            return {
                icon: <Pencil className={`${iconSize} text-amber-600`} />,
                bgColor: 'bg-amber-100 dark:bg-amber-900/30',
            };

        case 'deleted':
        case 'hard_deleted':
            return {
                icon: <Trash2 className={`${iconSize} text-red-600`} />,
                bgColor: 'bg-red-100 dark:bg-red-900/30',
            };

        case 'child_deleted':
            return {
                icon: <MinusCircle className={`${iconSize} text-red-500`} />,
                bgColor: 'bg-red-100 dark:bg-red-900/30',
            };

        case 'cancelled':
            return {
                icon: <Ban className={`${iconSize} text-orange-600`} />,
                bgColor: 'bg-orange-100 dark:bg-orange-900/30',
            };

        case 'closed':
        case 'archived':
            return {
                icon: <Archive className={`${iconSize} text-slate-600`} />,
                bgColor: 'bg-slate-100 dark:bg-slate-800',
            };

        case 'reopened':
        case 'reactivated':
            return {
                icon: <RotateCcw className={`${iconSize} text-blue-600`} />,
                bgColor: 'bg-blue-100 dark:bg-blue-900/30',
            };

        default:
            // Fallback to eventType-based icons
            return getEventTypeIcon(eventType, iconSize);
    }
}

/**
 * Fallback icon based on event type
 */
function getEventTypeIcon(eventType, iconSize) {
    switch (eventType) {
        case 'status':
            return {
                icon: <ArrowRight className={`${iconSize} text-purple-600`} />,
                bgColor: 'bg-purple-100 dark:bg-purple-900/30',
            };
        case 'assignment':
            return {
                icon: <UserPlus className={`${iconSize} text-indigo-600`} />,
                bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
            };
        case 'finance':
            return {
                icon: <DollarSign className={`${iconSize} text-emerald-600`} />,
                bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
            };
        case 'system':
            return {
                icon: <AlertTriangle className={`${iconSize} text-orange-600`} />,
                bgColor: 'bg-orange-100 dark:bg-orange-900/30',
            };
        case 'lifecycle':
            return {
                icon: <CheckCircle2 className={`${iconSize} text-blue-600`} />,
                bgColor: 'bg-blue-100 dark:bg-blue-900/30',
            };
        default:
            return {
                icon: <Clock className={`${iconSize} text-slate-600`} />,
                bgColor: 'bg-slate-100 dark:bg-slate-800',
            };
    }
}

/**
 * Action badge (Created, Updated, Deleted, etc.)
 */
function ActionBadge({ action, t }) {
    const actionConfig = {
        created: { label: t('detail.history.actions.created', 'Créé'), color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
        child_created: { label: t('detail.history.actions.created', 'Créé'), color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
        updated: { label: t('detail.history.actions.updated', 'Modifié'), color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
        deleted: { label: t('detail.history.actions.deleted', 'Supprimé'), color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
        hard_deleted: { label: t('detail.history.actions.deleted', 'Supprimé'), color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
        child_deleted: { label: t('detail.history.actions.deleted', 'Supprimé'), color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
        cancelled: { label: t('detail.history.actions.cancelled', 'Annulé'), color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
        closed: { label: t('detail.history.actions.closed', 'Clôturé'), color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
        archived: { label: t('detail.history.actions.archived', 'Archivé'), color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
        reopened: { label: t('detail.history.actions.reopened', 'Réouvert'), color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
        reactivated: { label: t('detail.history.actions.reopened', 'Réouvert'), color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    };

    const config = actionConfig[action];
    if (!config) return null;

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
            {config.label}
        </span>
    );
}

/**
 * Category badge (Finances, Statut, Relation, etc.)
 */
function CategoryBadge({ eventType, t }) {
    const categoryConfig = {
        lifecycle: { label: t('detail.history.badges.lifecycle', 'Cycle de vie'), color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' },
        status: { label: t('detail.history.badges.status', 'Statut'), color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' },
        assignment: { label: t('detail.history.badges.assignment', 'Affectation'), color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' },
        finance: { label: t('detail.history.badges.finance', 'Finances'), color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' },
        system: { label: t('detail.history.badges.system', 'Système'), color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' },
        relation: { label: t('detail.history.badges.relation', 'Relation'), color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400' },
        child_created: { label: t('detail.history.badges.child', 'Enfant'), color: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
        child_deleted: { label: t('detail.history.badges.child', 'Enfant'), color: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    };

    const config = categoryConfig[eventType];
    if (!config) return null;

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${config.color}`}>
            {config.label}
        </span>
    );
}

/**
 * Change details block - shows what fields changed
 */
function ChangeDetailsBlock({ changes, t }) {
    if (!changes || changes.length === 0) return null;

    const fieldLabels = {
        amount: t('detail.history.fields.amount', 'Montant'),
        status: t('detail.history.fields.status', 'Statut'),
        paid_at: t('detail.history.fields.paidAt', 'Date de paiement'),
        assignment: t('detail.history.fields.assignment', 'Affectation'),
        title: t('detail.history.fields.title', 'Titre'),
        priority: t('detail.history.fields.priority', 'Priorité'),
        due_date: t('detail.history.fields.dueDate', 'Échéance'),
        scheduled_at: t('detail.history.fields.scheduledAt', 'Date prévue'),
        session_date: t('detail.history.fields.sessionDate', 'Date de session'),
        location: t('detail.history.fields.location', 'Lieu'),
        outcome: t('detail.history.fields.outcome', 'Résultat'),
        description: t('detail.history.fields.description', 'Description'),
    };

    return (
        <div className="mt-3 p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                {t('detail.history.changes', 'Modifications')}:
            </p>
            <div className="space-y-1">
                {changes.map((change, idx) => (
                    <div key={idx} className="flex items-center text-sm">
                        <span className="text-slate-600 dark:text-slate-400 mr-2">
                            {fieldLabels[change.field] || change.field}:
                        </span>
                        {change.oldValue && (
                            <>
                                <span className="text-slate-500 dark:text-slate-500 line-through mr-1">
                                    {change.oldValue}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400 mx-1" />
                            </>
                        )}
                        <span className="text-slate-800 dark:text-slate-200 font-medium">
                            {change.newValue}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Financial data block - shows financial entry details
 */
function FinancialDataBlock({ data, t, formatCurrency }) {
    if (!data || !data.amount) return null;
    const formatAmount = typeof formatCurrency === "function" ? formatCurrency : (value) => value;

    return (
        <div className="mt-3 p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-emerald-200/50 dark:border-emerald-800/30">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                    <span className="text-slate-500 dark:text-slate-400">{t('detail.history.fields.amount', 'Montant')}:</span>
                    <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatAmount(data.amount)}
                    </span>
                </div>
                {data.type && (
                    <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('detail.history.fields.type', 'Type')}:</span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">{data.type}</span>
                    </div>
                )}
                {data.status && (
                    <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('detail.history.fields.status', 'Statut')}:</span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">{data.status}</span>
                    </div>
                )}
                {data.description && (
                    <div className="col-span-2">
                        <span className="text-slate-500 dark:text-slate-400">{t('detail.history.fields.description', 'Description')}:</span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">{data.description}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp, formatDateTimeFn, t, i18n) {
    let date;
    if (timestamp.includes('T')) {
        date = new Date(timestamp);
    } else {
        const parts = timestamp.split(/[\s:-]/);
        date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0));
    }
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
        return t("detail.history.time.justNow");
    }
    if (diffMins < 60) {
        return t("detail.history.time.minutesAgo", { count: diffMins });
    }
    if (diffHours >= 1 && diffHours < 24) {
        return t("detail.history.time.hoursAgo", { count: diffHours });
    }
    if (diffDays >= 1 && diffDays < 7) {
        return t("detail.history.time.daysAgo", { count: diffDays });
    }

    if (formatDateTimeFn) {
        return formatDateTimeFn(date);
    }

    const locale = i18n?.language || 'en';
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}
