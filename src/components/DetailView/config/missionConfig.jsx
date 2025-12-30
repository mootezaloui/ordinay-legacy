import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { missionFormFields } from "../../FormModal/formConfigs";
import { formatDateValue } from "../../../utils/dateFormat";

/**
 * Mission Entity Configuration
 * Configuration for mission detail view with tabs and enhanced UI
 */
export const missionConfig = {
    entityType: "mission",
    entityName: "Mission",
    icon: "fas fa-clipboard-check",
    listRoute: "/officers",
    notFoundMessage: "Mission not found.",
    deleteConfirmMessage: "Are you sure you want to delete this mission?",
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
                    // Match by mission_id (primary) or fallback to dossier/case relationship
                    return (
                        entry.missionId === missionId ||
                        (
                            (mission.dossierId && entry.dossierId === mission.dossierId) ||
                            (mission.caseId && entry.caseId === mission.caseId)
                        )
                    ) && entry.category === 'frais_huissier'; // Only bailiff fees
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

    getTitle: (data) => data.missionNumber || `Mission #${data.id}`,
    getSubtitle: (data) => data.title || data.missionType,

    // Quick Actions Configuration
    quickActions: [
        {
            key: "status",
            label: "Status",
            icon: "fas fa-flag",
            colorMap: true,
            options: [
                { value: "Planned", label: "Planned", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: "fas fa-calendar" },
                { value: "In Progress", label: "In Progress", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: "fas fa-spinner" },
                { value: "Completed", label: "Completed", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: "fas fa-check-circle" },
                { value: "Cancelled", label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: "fas fa-times-circle" },
            ],
        },
        {
            key: "priority",
            label: "Priority",
            icon: "fas fa-exclamation-circle",
            colorMap: true,
            options: [
                { value: "High", label: "High", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: "fas fa-angle-double-up" },
                { value: "Medium", label: "Medium", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: "fas fa-minus" },
                { value: "Low", label: "Low", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: "fas fa-angle-double-down" },
            ],
        },
        {
            key: "officerId",
            label: "Bailiff",
            icon: "fas fa-user-tie",
            displayValue: (data) => data.officerName || "Unassigned",
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
                <div className="p-6">
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
                                        {data.missionType}
                                    </span>
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${getStatusColor(data.priority)}`}>
                                        <i className="fas fa-exclamation-circle"></i>
                                        Priority: {data.priority}
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
                                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Assigned On</p>
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
                                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Due Date</p>
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
                                            <p className="text-xs font-medium text-green-600 dark:text-green-400">Completed On</p>
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
                                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Bailiff</p>
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
                label: "Documents"
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
                    label: "Duration"
                });
            }
        }

        return stats;
    },

    // Tabs configuration
    tabs: [
        {
            id: "overview",
            label: "Overview",
            icon: "fas fa-eye",
            component: "overview",
        },
        {
            id: "fees",
            label: "Bailiff Fees",
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
            label: "Documents",
            icon: "fas fa-file-alt",
            component: "documents",
            getCount: (data) => data.documents?.length || 0,
        },
        {
            id: "notes",
            label: "Notes",
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
            label: "Relations",
            icon: "fas fa-link",
            render: (data) => (
                <div className="space-y-4">
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-lg bg-purple-500 flex items-center justify-center">
                                <i className="fas fa-link text-white text-xl"></i>
                            </div>
                            <h3 className="text-xl font-bold text-purple-900 dark:text-purple-100">
                                Linked Entities
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
                                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Bailiff</p>
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
                                            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Dossier</p>
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
                                            <p className="text-sm font-medium text-red-600 dark:text-red-400">Lawsuit</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.entityReference}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-red-600 dark:text-red-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {!data.officerId && !data.entityId && (
                                <div className="text-center py-12">
                                    <i className="fas fa-unlink text-slate-300 dark:text-slate-600 text-4xl mb-3"></i>
                                    <p className="text-slate-500 dark:text-slate-400">No linked entity</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: "timeline",
            label: "History",
            icon: "fas fa-history",
            component: "history",
        },
    ],

    // Overview sections configuration
    overviewSections: [
        {
            title: "Mission Details",
            editStrategy: "structured",
            fields: [
                {
                    key: "missionNumber",
                    label: "Mission Number",
                    value: (data) => data.missionNumber,
                    icon: "fas fa-hashtag",
                    type: "text",
                    editable: false // Auto-generated
                },
                {
                    key: "title",
                    label: "Title",
                    value: (data) => data.title,
                    icon: "fas fa-heading",
                    type: "text",
                    editable: true
                },
                {
                    key: "missionType",
                    label: "Mission Type",
                    value: (data) => data.missionType,
                    icon: "fas fa-briefcase",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Service", label: "Service" },
                        { value: "Inspection", label: "Inspection" },
                        { value: "Seizure", label: "Seizure" },
                        { value: "Execution", label: "Execution" },
                        { value: "Other", label: "Other" },
                    ]
                },
                {
                    key: "status",
                    label: "Status",
                    value: (data) => data.status,
                    displayValue: (data) => data.status || "N/A",
                    icon: "fas fa-flag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Scheduled", label: "Scheduled" },
                        { value: "In Progress", label: "In Progress" },
                        { value: "Completed", label: "Completed" },
                        { value: "Cancelled", label: "Cancelled" },
                    ]
                },
                {
                    key: "priority",
                    label: "Priority",
                    value: (data) => data.priority,
                    displayValue: (data) => data.priority || "N/A",
                    icon: "fas fa-exclamation-circle",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Low", label: "Low" },
                        { value: "Medium", label: "Medium" },
                        { value: "High", label: "High" },
                        { value: "Urgent", label: "Urgent" },
                    ]
                },
            ],
        },
        {
            title: "Dates",
            editStrategy: "structured",
            fields: [
                {
                    key: "assignDate",
                    label: "Assign Date",
                    value: (data) => data.assignDate,
                    displayValue: (data) => data.assignDate ? formatDateValue(data.assignDate) : "N/A",
                    icon: "fas fa-calendar-plus",
                    type: "date",
                    editable: true
                },
                {
                    key: "dueDate",
                    label: "Due Date",
                    value: (data) => data.dueDate,
                    displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : "N/A",
                    icon: "fas fa-calendar-times",
                    type: "date",
                    editable: true
                },
                {
                    key: "completionDate",
                    label: "Completion Date",
                    value: (data) => data.completionDate,
                    displayValue: (data) => data.completionDate ? formatDateValue(data.completionDate) : "N/A",
                    icon: "fas fa-calendar-check",
                    type: "date",
                    editable: true
                },
            ],
        },
        {
            title: "Description",
            editStrategy: "structured",
            type: "description",
            fieldKey: "description",
            content: (data) => data.description,
        },
        {
            title: "Report / Result",
            editStrategy: "structured",
            type: "description",
            fieldKey: "result",
            content: (data) => data.result || "No report available",
        },
        {
            title: "Linked Entity",
            editStrategy: "structured",
            fields: [
                {
                    key: "entityType",
                    label: "Entity Type",
                    value: (data) => data.entityType || "dossier",
                    icon: "fas fa-link",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "dossier", label: "Dossier" },
                        { value: "case", label: "Lawsuit" },
                    ],
                    helpText: "Select the type of entity this mission is linked to",
                },
                {
                    key: "entityId",
                    label: "Entity",
                    value: (data) => data?.entityId || "",
                    displayValue: (data) => {
                        if (!data?.entityId) return "None";
                        if (data.entityType === "dossier") {
                            return data.entityReference || `Dossier #${data.entityId}`;
                        }
                        if (data.entityType === "case") {
                            return data.entityReference || `Lawsuit #${data.entityId}`;
                        }
                        return data.entityReference || `#${data.entityId}`;
                    },
                    icon: (data) => (data?.entityType === "dossier" ? "fas fa-folder" : "fas fa-gavel"),
                    type: "searchable-select",
                    editable: true,
                    getOptions: (data = {}) => {
                        const emptyOption = {
                            value: "",
                            label:
                                data.entityType === "case"
                                    ? "Select a lawsuit..."
                                    : "Select a dossier...",
                        };
                        const dossiers = data.dossiers || [];
                        const cases = data.cases || [];
                        if (data.entityType === "case") {
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
                    helpText: "Select the dossier or lawsuit concerned",
                },
            ],
        },
        {
            title: "Bailiff Information",
            editStrategy: "structured",
            fields: [
                {
                    key: "officerId",
                    label: "Assigned Bailiff",
                    value: (data) => data.officerId,
                    displayValue: (data) => data.officerName || "Not assigned",
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
                    helpText: "Warning: Changing the bailiff will transfer the mission to another bailiff"
                },
                {
                    key: "officerPhone",
                    label: "Phone",
                    value: (data) => data.officerPhone,
                    icon: "fas fa-phone",
                    type: "tel",
                    editable: false
                },
                {
                    key: "officerLocation",
                    label: "Location",
                    value: (data) => data.officerLocation,
                    icon: "fas fa-map-marker-alt",
                    type: "text",
                    editable: false
                },
            ],
        },

    ],

    // Form configuration for editing
    getFormFields: () => {
        return missionFormFields;
    },
};

export default missionConfig;
