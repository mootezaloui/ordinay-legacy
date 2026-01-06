import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { getMissionFormFields } from "../../FormModal/formConfigs";
import { formatDateValue } from "../../../utils/dateFormat";
import { translateMissionStatus, translateMissionPriority, translateMissionType } from "../../../utils/entityTranslations";

/**
 * Mission Entity Configuration
 * Configuration for mission detail view with tabs and enhanced UI
 * ✅ Fully internationalized with i18n support
 */
export const createMissionConfig = (t) => ({
    entityType: "mission",
    entityName: t('detail.entityName'),
    icon: "fas fa-clipboard-check",
    listRoute: "/officers",
    notFoundMessage: t('detail.notFound'),
    deleteConfirmMessage: t('detail.deleteConfirm'),
    allowDelete: true,
    allowEdit: true,

    fetchData: async (id, contextData = null) => {
        const missionId = parseInt(id);

        // Prefer live data from context (backend)
        if (contextData?.missions) {
            const mission = contextData.missions.find(m => m.id === missionId);
            if (mission) {
                // Enrich with officer info when available
                const officer = contextData.officers?.find(o => o.id === mission.officerId);

                // ✅ Enrich with financial entries linked to this mission
                const financialEntries = contextData?.financialEntries || [];
                const missionFinancialEntries = financialEntries.filter(entry => {
                    // Match by mission_id to align with FinancialTab filter logic
                    // FinancialTab uses { scope: "client", missionId: entityId }
                    return entry.missionId === missionId && entry.scope === 'client';
                });

                return {
                    ...mission,
                    officerId: mission.officerId ?? officer?.id ?? null,
                    officerName: officer?.name || mission.officerName || "",
                    officerPhone: officer?.phone || mission.officerPhone || "",
                    officerLocation: officer?.location || mission.officerLocation || "",
                    financialEntries: missionFinancialEntries,
                };
            }
        }
        return null;
    },

    updateData: async (id, data, contextData = null, options = {}) => {
        const missionId = parseInt(id);

        if (contextData?.updateMission) {
            // Use DataContext to update (this persists to backend and localStorage)
            // Pass skipConfirmation option if provided
            await contextData.updateMission(missionId, data, options.skipConfirmation);
        }
    },

    deleteData: async (id, contextData = null) => {
        const missionId = parseInt(id);

        if (contextData?.deleteMission) {
            // Use DataContext to delete (this persists to backend and localStorage)
            await contextData.deleteMission(missionId);
        }
    },

    getTitle: (data) => data.missionNumber || t('detail.fallback.untitled', { id: data.id }),
    getSubtitle: (data) => data.title || data.missionType,

    // Quick Actions Configuration
    quickActions: [
        {
            key: "status",
            label: t('detail.quickActions.status.label'),
            icon: "fas fa-flag",
            colorMap: true,
            options: [
                { value: "Planned", label: t('detail.quickActions.status.planned'), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: "fas fa-calendar" },
                { value: "In Progress", label: t('detail.quickActions.status.inProgress'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: "fas fa-spinner" },
                { value: "Completed", label: t('detail.quickActions.status.completed'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: "fas fa-check-circle" },
                { value: "Cancelled", label: t('detail.quickActions.status.cancelled'), color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: "fas fa-times-circle" },
            ],
        },
        {
            key: "priority",
            label: t('detail.quickActions.priority.label'),
            icon: "fas fa-exclamation-circle",
            colorMap: true,
            options: [
                { value: "High", label: t('detail.quickActions.priority.high'), color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: "fas fa-angle-double-up" },
                { value: "Medium", label: t('detail.quickActions.priority.medium'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: "fas fa-minus" },
                { value: "Low", label: t('detail.quickActions.priority.low'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: "fas fa-angle-double-down" },
            ],
        },
        {
            key: "officerId",
            label: t('detail.quickActions.bailiff.label'),
            icon: "fas fa-user-tie",
            displayValue: (data) => data.officerName || t('detail.fallback.unassigned'),
            getOptions: (formData, contextData) => {
                const officers = contextData?.officers || [];
                return officers.map(officer => ({
                    value: officer.id,
                    label: officer.name
                }));
            },
        }
    ],

    renderHeader: (data) => {
        const getStatusBadge = () => {
            const statusMap = {
                "Scheduled": { bg: "from-blue-400 to-blue-600", icon: "fa-calendar" },
                "In Progress": { bg: "from-amber-400 to-orange-600", icon: "fa-spinner" },
                "Completed": { bg: "from-green-400 to-green-600", icon: "fa-check-circle" },
                "Cancelled": { bg: "from-red-400 to-red-600", icon: "fa-times-circle" },
            };
            return statusMap[data.status] || statusMap["Scheduled"];
        };

        const statusBadge = getStatusBadge();

        return (
            <ContentSection>
                <div className="p-6" data-tutorial="mission-detail-header">
                    <div className="flex flex-col lg:flex-row items-start gap-6">
                        {/* Icon with gradient */}
                        <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${statusBadge.bg} flex items-center justify-center text-4xl text-white shadow-xl flex-shrink-0`}>
                            <i className={`fas ${statusBadge.icon}`}></i>
                        </div>

                        <div className="flex-1 min-w-0">
                            {/* Mission Number - Big and Bold */}
                            <div className="mb-6">
                                <div className="text-4xl font-black text-slate-900 dark:text-white mb-2">
                                    {data.missionNumber}
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${data.missionType === 'Service'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                        : data.missionType === 'Execution'
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                            : data.missionType === 'Observation'
                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                                        }`}>
                                        <i className="fas fa-briefcase"></i>
                                        {translateMissionType(data.missionType, t)}
                                    </span>
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${getStatusColor(data.priority)}`}>
                                        <i className="fas fa-exclamation-circle"></i>
                                        {t('detail.header.priority')}: {translateMissionPriority(data.priority, t)}
                                    </span>
                                </div>
                            </div>

                            {/* Info Grid - Colorful */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                {/* Assign Date */}
                                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                                        <i className="fas fa-calendar-plus text-white"></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{t('detail.header.assignedOn')}</p>
                                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100 truncate">
                                            {formatDateValue(data.assignDate)}
                                        </p>
                                    </div>
                                </div>

                                {/* Due Date */}
                                {data.dueDate && (
                                    <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                                        <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-clock text-white"></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">{t('detail.header.dueDate')}</p>
                                            <p className="text-sm font-bold text-orange-900 dark:text-orange-100 truncate">
                                                {formatDateValue(data.dueDate)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Completion Date */}
                                {data.completionDate && (
                                    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                        <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-check-circle text-white"></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-green-600 dark:text-green-400">{t('detail.header.completedOn')}</p>
                                            <p className="text-sm font-bold text-green-900 dark:text-green-100 truncate">
                                                {formatDateValue(data.completionDate)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Officer */}
                                {data.officerName && (
                                    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                        <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-user-tie text-white"></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('detail.header.bailiff')}</p>
                                            <p className="text-sm font-bold text-amber-900 dark:text-amber-100 truncate">{data.officerName}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </ContentSection>
        );
    },

    // Stats cards
    getStats: (data) => {
        const stats = [];

        if (data.documents?.length) {
            stats.push({
                icon: "fas fa-file-alt",
                iconColor: "text-blue-600 dark:text-blue-400",
                bgColor: "bg-blue-100 dark:bg-blue-900/20",
                value: data.documents.length,
                label: t('detail.stats.documents')
            });
        }

        if (data.status === "Completed" && data.assignDate && data.completionDate) {
            const assignDate = new Date(data.assignDate);
            const completionDate = new Date(data.completionDate);

            // Validate that both dates are valid
            if (!isNaN(assignDate.getTime()) && !isNaN(completionDate.getTime())) {
                const days = Math.ceil((completionDate - assignDate) / (1000 * 60 * 60 * 24));

                stats.push({
                    icon: "fas fa-hourglass-half",
                    iconColor: "text-amber-600 dark:text-amber-400",
                    bgColor: "bg-amber-100 dark:bg-amber-900/20",
                    value: `${days}d`,
                    label: t('detail.stats.duration')
                });
            }
        }

        return stats;
    },

    // Tabs configuration
    tabs: [
        {
            id: "overview",
            label: t('detail.tabs.overview'),
            icon: "fas fa-eye",
            component: "overview",
        },
        {
            id: "fees",
            label: t('detail.tabs.fees'),
            icon: "fas fa-coins",
            getCount: (data) => {
                // Count financial entries that were enriched in fetchData
                // These are already filtered to only include bailiff fees for this mission
                return data.financialEntries?.length || 0;
            },
            component: "financial",
        },
        {
            id: "documents",
            label: t('detail.tabs.documents'),
            icon: "fas fa-file-alt",
            component: "documents",
            getCount: (data) => data.documents?.length || 0,
        },
        {
            id: "notes",
            label: t('detail.tabs.notes'),
            icon: "fas fa-sticky-note",
            component: "notes",
            getCount: (data) => {
                if (!data.notes) return 0;
                if (Array.isArray(data.notes)) return data.notes.length;
                return 1; // Legacy single string note
            },
        },
        {
            id: "relations",
            label: t('detail.tabs.relations'),
            icon: "fas fa-link",
            render: (data) => (
                <div className="space-y-4">
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-lg bg-purple-500 flex items-center justify-center">
                                <i className="fas fa-link text-white text-xl"></i>
                            </div>
                            <h3 className="text-xl font-bold text-purple-900 dark:text-purple-100">
                                {t('detail.relations.title')}
                            </h3>
                        </div>

                        <div className="space-y-3">
                            {data.officerId && (
                                <a
                                    href={`/officers/${data.officerId}`}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-amber-500 flex items-center justify-center">
                                            <i className="fas fa-user-tie text-white text-lg"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('detail.relations.bailiff')}</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.officerName}</p>
                                            {data.officerPhone && (
                                                <p className="text-sm text-slate-600 dark:text-slate-400">{data.officerPhone}</p>
                                            )}
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {data.entityType === 'dossier' && data.entityId && (
                                <a
                                    href={`/dossiers/${data.entityId}`}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center">
                                            <i className="fas fa-folder text-white text-lg"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('detail.relations.dossier')}</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.entityReference}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {data.entityType === 'case' && data.entityId && (
                                <a
                                    href={`/cases/${data.entityId}`}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-red-200 dark:border-red-800 hover:border-red-400 dark:hover:border-red-600 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-red-500 flex items-center justify-center">
                                            <i className="fas fa-gavel text-white text-lg"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-red-600 dark:text-red-400">{t('detail.relations.lawsuit')}</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.entityReference}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-red-600 dark:text-red-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {!data.officerId && !data.entityId && (
                                <div className="text-center py-12">
                                    <i className="fas fa-unlink text-slate-300 dark:text-slate-600 text-4xl mb-3"></i>
                                    <p className="text-slate-500 dark:text-slate-400">{t('detail.relations.empty')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: "timeline",
            label: t('detail.tabs.history'),
            icon: "fas fa-history",
            component: "history",
        },
    ],

    // Overview sections configuration
    overviewSections: [
        {
            title: t('detail.overview.missionDetails'),
            editStrategy: "structured",
            fields: [
                {
                    key: "missionNumber",
                    label: t('detail.overview.fields.missionNumber'),
                    value: (data, contextData) => data.missionNumber,
                    icon: "fas fa-hashtag",
                    type: "text",
                    editable: false // Auto-generated
                },
                {
                    key: "title",
                    label: t('detail.overview.fields.title'),
                    value: (data, contextData) => data.title,
                    icon: "fas fa-heading",
                    type: "text",
                    editable: true
                },
                {
                    key: "missionType",
                    label: t('detail.overview.fields.missionType'),
                    value: (data, contextData) => data.missionType,
                    displayValue: (data) => translateMissionType(data.missionType, t),
                    icon: "fas fa-briefcase",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Service", label: t('detail.overview.missionTypes.service') },
                        { value: "Inspection", label: t('detail.overview.missionTypes.inspection') },
                        { value: "Seizure", label: t('detail.overview.missionTypes.seizure') },
                        { value: "Execution", label: t('detail.overview.missionTypes.execution') },
                        { value: "Other", label: t('detail.overview.missionTypes.other') },
                    ]
                },
                {
                    key: "status",
                    label: t('detail.overview.fields.status'),
                    value: (data, contextData) => data.status,
                    displayValue: (data) => translateMissionStatus(data.status, t) || t('detail.fallback.na'),
                    icon: "fas fa-flag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Scheduled", label: t('detail.overview.statuses.scheduled') },
                        { value: "In Progress", label: t('detail.overview.statuses.inProgress') },
                        { value: "Completed", label: t('detail.overview.statuses.completed') },
                        { value: "Cancelled", label: t('detail.overview.statuses.cancelled') },
                    ]
                },
                {
                    key: "priority",
                    label: t('detail.overview.fields.priority'),
                    value: (data, contextData) => data.priority,
                    displayValue: (data) => translateMissionPriority(data.priority, t) || t('detail.fallback.na'),
                    icon: "fas fa-exclamation-circle",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Low", label: t('detail.overview.priorities.low') },
                        { value: "Medium", label: t('detail.overview.priorities.medium') },
                        { value: "High", label: t('detail.overview.priorities.high') },
                        { value: "Urgent", label: t('detail.overview.priorities.urgent') },
                    ]
                },
            ],
        },
        {
            title: t('detail.overview.dates'),
            editStrategy: "structured",
            fields: [
                {
                    key: "assignDate",
                    label: t('detail.overview.fields.assignDate'),
                    value: (data, contextData) => data.assignDate,
                    displayValue: (data) => data.assignDate ? formatDateValue(data.assignDate) : t('detail.fallback.na'),
                    icon: "fas fa-calendar-plus",
                    type: "date",
                    editable: true
                },
                {
                    key: "dueDate",
                    label: t('detail.overview.fields.dueDate'),
                    value: (data, contextData) => data.dueDate,
                    displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.na'),
                    icon: "fas fa-calendar-times",
                    type: "date",
                    editable: true
                },
                {
                    key: "completionDate",
                    label: t('detail.overview.fields.completionDate'),
                    value: (data, contextData) => data.completionDate,
                    displayValue: (data) => data.completionDate ? formatDateValue(data.completionDate) : t('detail.fallback.na'),
                    icon: "fas fa-calendar-check",
                    type: "date",
                    editable: true
                },
            ],
        },
        {
            title: t('detail.overview.description'),
            editStrategy: "structured",
            type: "description",
            fieldKey: "description",
            content: (data) => data.description,
        },
        {
            title: t('detail.overview.report'),
            editStrategy: "structured",
            type: "description",
            fieldKey: "result",
            content: (data) => data.result || t('detail.fallback.noReport'),
        },
        {
            title: t('detail.overview.linkedEntity'),
            editStrategy: "structured",
            fields: [
                {
                    key: "entityType",
                    label: t('detail.overview.fields.entityType'),
                    value: (data, contextData) => data.entityType || "dossier",
                    icon: "fas fa-link",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "dossier", label: t('detail.overview.entityTypes.dossier') },
                        { value: "case", label: t('detail.overview.entityTypes.case') },
                    ],
                    helpText: t('detail.overview.help.entityType'),
                },
                {
                    key: "entityId",
                    label: t('detail.overview.fields.entity'),
                    value: (data, contextData) => data?.entityId || "",
                    displayValue: (data, contextData) => {
                        if (!data?.entityId) return t('detail.fallback.none');
                        const entityType = data.entityType || "dossier";
                        const dossiers = contextData?.dossiers || [];
                        const cases = contextData?.cases || [];
                        if (entityType === "dossier") {
                            const dossier = dossiers.find(d => d.id === parseInt(data.entityId));
                            if (dossier) return `${dossier.caseNumber} - ${dossier.title}`;
                            return data.entityReference || `Dossier #${data.entityId}`;
                        }
                        if (entityType === "case") {
                            const caseItem = cases.find(c => c.id === parseInt(data.entityId));
                            if (caseItem) return `${caseItem.caseNumber} - ${caseItem.title}`;
                            return data.entityReference || `Lawsuit #${data.entityId}`;
                        }
                        return data.entityReference || `#${data.entityId}`;
                    },
                    icon: (data) => (data?.entityType === "dossier" ? "fas fa-folder" : "fas fa-gavel"),
                    type: "searchable-select",
                    editable: true,
                    getOptions: (editedData = {}, contextData) => {
                        const dossiers = contextData?.dossiers || [];
                        const cases = contextData?.cases || [];
                        const currentType = editedData.entityType || "dossier";
                        const emptyOption = {
                            value: "",
                            label:
                                currentType === "case"
                                    ? t('detail.overview.placeholders.selectCase')
                                    : t('detail.overview.placeholders.selectDossier'),
                        };
                        if (currentType === "case") {
                            return [
                                emptyOption,
                                ...cases.map((c) => ({
                                    value: c.id,
                                    label: `${c.caseNumber} - ${c.title}`,
                                })),
                            ];
                        }
                        return [
                            emptyOption,
                            ...dossiers.map((d) => ({
                                value: d.id,
                                label: `${d.caseNumber} - ${d.title}`,
                            })),
                        ];
                    },
                    helpText: t('detail.overview.help.entity'),
                },
            ],
        },
        {
            title: t('detail.overview.bailiffInfo'),
            editStrategy: "structured",
            fields: [
                {
                    key: "officerId",
                    label: t('detail.overview.fields.assignedBailiff'),
                    value: (data, contextData) => data.officerId,
                    displayValue: (data) => data.officerName || t('detail.fallback.notAssigned'),
                    icon: "fas fa-user-tie",
                    type: "select",
                    editable: true,
                    getOptions: (formData, contextData) => {
                        const officers = contextData?.officers || [];
                        return officers.map(officer => ({
                            value: officer.id,
                            label: officer.name
                        }));
                    },
                    helpText: t('detail.overview.help.bailiff')
                },
                {
                    key: "officerPhone",
                    label: t('detail.overview.fields.phone'),
                    value: (data, contextData) => data.officerPhone,
                    icon: "fas fa-phone",
                    type: "tel",
                    editable: false
                },
                {
                    key: "officerLocation",
                    label: t('detail.overview.fields.location'),
                    value: (data, contextData) => data.officerLocation,
                    icon: "fas fa-map-marker-alt",
                    type: "text",
                    editable: false
                },
            ],
        },

    ],

    // Form configuration for editing
    getFormFields: () => {
        return getMissionFormFields();
    },
});

export default createMissionConfig;
