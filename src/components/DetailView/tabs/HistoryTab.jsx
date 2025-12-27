import { useState, useEffect } from "react";
import { getEntityHistory } from "../../../services/historyService";
import {
    Clock,
    CheckCircle2,
    XCircle,
    FileEdit,
    UserPlus,
    DollarSign,
    AlertTriangle,
    GitBranch,
    Archive,
    RotateCcw,
} from "lucide-react";

/**
 * History Tab - Read-only audit trail
 *
 * Displays chronological timeline of important events:
 * - Lifecycle events (création, clôture, archivage)
 * - Status changes (old → new)
 * - Assignments/reassignments
 * - Financial actions
 * - Domain rule confirmations
 * - Relational impact confirmations
 */
export default function HistoryTab({ entityType, entityId }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch history from backend
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
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <Clock className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4 animate-pulse" />
                <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Loading history...
                </h3>
            </div>
        );
    }

    if (!history || history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <Clock className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                    No history available yet
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                    Important events will appear here: creations, status changes, assignments, and significant actions.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="max-w-4xl mx-auto">
                {/* Timeline */}
                <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

                    {/* Events */}
                    <div className="space-y-6">
                        {history.map((event, index) => (
                            <HistoryEvent
                                key={event.id}
                                event={event}
                                isFirst={index === 0}
                                isLast={index === history.length - 1}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Single history event component
 */
function HistoryEvent({ event, isFirst, isLast }) {
    const { icon, iconColor, bgColor } = getEventIcon(event.eventType, event.metadata);

    return (
        <div className="relative flex gap-4 group">
            {/* Icon */}
            <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full ${bgColor} flex-shrink-0`}>
                {icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-8">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 overflow-wrap-anywhere">
                            {event.label}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {formatTimestamp(event.timestamp)}
                        </p>
                    </div>

                    {/* Event type badge */}
                    <EventTypeBadge eventType={event.eventType} />
                </div>

                {/* Details */}
                {event.details && (
                    <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <p className="text-sm text-slate-700 dark:text-slate-300 overflow-wrap-anywhere whitespace-normal">
                            {event.details}
                        </p>
                    </div>
                )}

                {/* Metadata (if relevant) */}
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <MetadataDisplay metadata={event.metadata} />
                )}
            </div>
        </div>
    );
}

/**
 * Get icon and colors for event type
 */
function getEventIcon(eventType, metadata = {}) {
    const iconClass = "w-8 h-8";

    switch (eventType) {
        case 'lifecycle':
            if (metadata.action === 'created') {
                return {
                    icon: <CheckCircle2 className={`${iconClass} text-green-600`} />,
                    iconColor: 'text-green-600',
                    bgColor: 'bg-green-100 dark:bg-green-900/30',
                };
            }
            if (metadata.action === 'closed' || metadata.action === 'archived') {
                return {
                    icon: <Archive className={`${iconClass} text-slate-600`} />,
                    iconColor: 'text-slate-600',
                    bgColor: 'bg-slate-100 dark:bg-slate-800',
                };
            }
            if (metadata.action === 'reopened' || metadata.action === 'reactivated') {
                return {
                    icon: <RotateCcw className={`${iconClass} text-blue-600`} />,
                    iconColor: 'text-blue-600',
                    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
                };
            }
            return {
                icon: <FileEdit className={`${iconClass} text-blue-600`} />,
                iconColor: 'text-blue-600',
                bgColor: 'bg-blue-100 dark:bg-blue-900/30',
            };

        case 'status':
            return {
                icon: <GitBranch className={`${iconClass} text-purple-600`} />,
                iconColor: 'text-purple-600',
                bgColor: 'bg-purple-100 dark:bg-purple-900/30',
            };

        case 'assignment':
            return {
                icon: <UserPlus className={`${iconClass} text-indigo-600`} />,
                iconColor: 'text-indigo-600',
                bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
            };

        case 'finance':
            return {
                icon: <DollarSign className={`${iconClass} text-emerald-600`} />,
                iconColor: 'text-emerald-600',
                bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
            };

        case 'system':
            return {
                icon: <AlertTriangle className={`${iconClass} text-orange-600`} />,
                iconColor: 'text-orange-600',
                bgColor: 'bg-orange-100 dark:bg-orange-900/30',
            };

        case 'relation':
            return {
                icon: <GitBranch className={`${iconClass} text-cyan-600`} />,
                iconColor: 'text-cyan-600',
                bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
            };

        default:
            return {
                icon: <Clock className={`${iconClass} text-slate-600`} />,
                iconColor: 'text-slate-600',
                bgColor: 'bg-slate-100 dark:bg-slate-800',
            };
    }
}

/**
 * Event type badge
 */
function EventTypeBadge({ eventType }) {
    const badges = {
        lifecycle: { label: 'lifecycle', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
        status: { label: 'status', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
        assignment: { label: 'assignment', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
        finance: { label: 'finance', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
        system: { label: 'system', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
        relation: { label: 'relation', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
    };

    const badge = badges[eventType] || { label: eventType, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color} flex-shrink-0`}>
            {badge.label}
        </span>
    );
}

/**
 * Display metadata in a clean format
 */
function MetadataDisplay({ metadata }) {
    // Filter out internal/redundant metadata
    const relevantKeys = Object.keys(metadata).filter(key =>
        !['action', 'confirmed', 'ruleType', 'impactType'].includes(key)
    );

    if (relevantKeys.length === 0) {
        return null;
    }

    return (
        <div className="mt-3 flex flex-wrap gap-2">
            {relevantKeys.map(key => {
                const value = metadata[key];
                if (value === null || value === undefined) return null;

                return (
                    <div key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs">
                        <span className="font-medium text-slate-500 dark:text-slate-400 capitalize">
                            {formatMetadataKey(key)}:
                        </span>
                        <span className="text-slate-700 dark:text-slate-300">
                            {formatMetadataValue(value)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Format metadata key for display
 */
function formatMetadataKey(key) {
    const keyMap = {
        oldStatus: 'Old status',
        newStatus: 'New status',
        assignedTo: 'Assigned to',
        previousAssignee: 'Previous',
        amount: 'Amount',
        actionType: 'Type',
    };

    return keyMap[key] || key;
}

/**
 * Format metadata value for display
 */
function formatMetadataValue(value) {
    if (typeof value === 'number') {
        return value.toLocaleString('en-US', { style: 'currency', currency: 'TND' });
    }
    return String(value);
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Relative time for recent events
    if (diffMins < 1) {
        return "Now";
    }
    if (diffMins < 60) {
        return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    }
    if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }
    if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }

    // Absolute time for older events
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}
