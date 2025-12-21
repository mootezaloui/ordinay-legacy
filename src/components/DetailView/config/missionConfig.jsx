import ContentSection from "../../layout/ContentSection";
import { mockOfficersExtended, mockDossiers, mockCases, getStatusColor } from "../../../utils/mockData";
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
    notFoundMessage: "Mission non trouvée",
    deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cette mission ?",
    allowDelete: true,
    allowEdit: true,

    fetchData: async (id) => {
        // Find mission across all officers
        for (const officer of Object.values(mockOfficersExtended)) {
            const mission = officer.missions?.find(m => m.id === parseInt(id));
            if (mission) {
                // Enrich mission with officer info
                return {
                    ...mission,
                    officerId: officer.id,
                    officerName: officer.name,
                    officerPhone: officer.phone,
                    officerLocation: officer.location,
                };
            }
        }
        return null;
    },

    updateData: async (id, data) => {
        const missionId = parseInt(id);

        // Find current officer who has this mission
        let currentOfficer = null;
        let missionIndex = -1;
        let mission = null;

        for (const officer of Object.values(mockOfficersExtended)) {
            const index = officer.missions?.findIndex(m => m.id === missionId);
            if (index !== -1 && index !== undefined) {
                currentOfficer = officer;
                missionIndex = index;
                mission = officer.missions[index];
                break;
            }
        }

        if (!mission) return;

        // Check if officer is being changed
        if (data.officerId && data.officerId != currentOfficer.id) {
            const newOfficer = mockOfficersExtended[data.officerId];

            if (newOfficer) {
                // Remove mission from current officer
                currentOfficer.missions.splice(missionIndex, 1);

                // Update mission with new officer info
                const updatedMission = {
                    ...mission,
                    ...data,
                    officerId: newOfficer.id,
                    officerName: newOfficer.name,
                    officerPhone: newOfficer.phone,
                    officerLocation: newOfficer.location,
                };

                // Add mission to new officer
                if (!newOfficer.missions) {
                    newOfficer.missions = [];
                }
                newOfficer.missions.push(updatedMission);
            }
        } else {
            // Just update the mission in place
            currentOfficer.missions[missionIndex] = {
                ...mission,
                ...data,
            };
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    },

    deleteData: async (id) => {
        console.log("Deleting mission:", id);
    },

    getTitle: (data) => data.missionNumber || `Mission #${data.id}`,
    getSubtitle: (data) => data.title || data.missionType,

    // Quick Actions Configuration
    quickActions: [
        {
            key: "status",
            label: "Statut",
            icon: "fas fa-flag",
            colorMap: true,
            options: [
                { value: "Programmée", label: "Programmée", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: "fas fa-calendar" },
                { value: "En cours", label: "En cours", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: "fas fa-spinner" },
                { value: "Terminée", label: "Terminée", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: "fas fa-check-circle" },
                { value: "Annulée", label: "Annulée", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: "fas fa-times-circle" },
            ],
        },
        {
            key: "priority",
            label: "Priorité",
            icon: "fas fa-exclamation-circle",
            colorMap: true,
            options: [
                { value: "Haute", label: "Haute", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: "fas fa-angle-double-up" },
                { value: "Moyenne", label: "Moyenne", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: "fas fa-minus" },
                { value: "Basse", label: "Basse", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: "fas fa-angle-double-down" },
            ],
        },
        {
            key: "officerId",
            label: "Huissier",
            icon: "fas fa-user-tie",
            displayValue: (data) => data.officerName || "Non assigné",
            options: Object.values(mockOfficersExtended).map(officer => ({
                value: officer.id,
                label: officer.name
            })),
        }
    ],

    renderHeader: (data) => {
        const getStatusBadge = () => {
            const statusMap = {
                "Programmée": { bg: "from-blue-400 to-blue-600", icon: "fa-calendar" },
                "En cours": { bg: "from-amber-400 to-orange-600", icon: "fa-spinner" },
                "Terminée": { bg: "from-green-400 to-green-600", icon: "fa-check-circle" },
                "Annulée": { bg: "from-red-400 to-red-600", icon: "fa-times-circle" },
            };
            return statusMap[data.status] || statusMap["Programmée"];
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
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${data.missionType === 'Signification'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                        : data.missionType === 'Saisie'
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                            : data.missionType === 'Constat'
                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                                        }`}>
                                        <i className="fas fa-briefcase"></i>
                                        {data.missionType}
                                    </span>
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${getStatusColor(data.priority)}`}>
                                        <i className="fas fa-exclamation-circle"></i>
                                        Priorité: {data.priority}
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
                                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Assignée le</p>
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
                                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Échéance</p>
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
                                            <p className="text-xs font-medium text-green-600 dark:text-green-400">Terminée le</p>
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
                                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Huissier</p>
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

        if (data.status === "Terminée" && data.assignDate && data.completionDate) {
            const assignDate = new Date(data.assignDate);
            const completionDate = new Date(data.completionDate);

            // Validate that both dates are valid
            if (!isNaN(assignDate.getTime()) && !isNaN(completionDate.getTime())) {
                const days = Math.ceil((completionDate - assignDate) / (1000 * 60 * 60 * 24));

                stats.push({
                    icon: "fas fa-hourglass-half",
                    iconColor: "text-amber-600 dark:text-amber-400",
                    bgColor: "bg-amber-100 dark:bg-amber-900/20",
                    value: `${days}j`,
                    label: "Durée"
                });
            }
        }

        return stats;
    },

    // Tabs configuration
    tabs: [
        {
            id: "overview",
            label: "Vue d'ensemble",
            icon: "fas fa-eye",
            component: "overview",
        },
        {
            id: "frais",
            label: "Frais d'Huissier",
            icon: "fas fa-coins",
            getCount: (data) => data.financialEntries?.length || 0,
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
                                Entités Liées
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
                                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Huissier</p>
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
                                            <p className="text-sm font-medium text-red-600 dark:text-red-400">Procès</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.entityReference}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-red-600 dark:text-red-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {!data.officerId && !data.entityId && (
                                <div className="text-center py-12">
                                    <i className="fas fa-unlink text-slate-300 dark:text-slate-600 text-4xl mb-3"></i>
                                    <p className="text-slate-500 dark:text-slate-400">Aucune entité liée</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: "timeline",
            label: "Historique",
            icon: "fas fa-history",
            component: "history",
        },
    ],

    // Overview sections configuration
    overviewSections: [
        {
            title: "Détails de la Mission",
            editStrategy: "structured",
            fields: [
                {
                    key: "missionNumber",
                    label: "Numéro de mission",
                    value: (data) => data.missionNumber,
                    icon: "fas fa-hashtag",
                    type: "text",
                    editable: false // Auto-generated
                },
                {
                    key: "title",
                    label: "Titre",
                    value: (data) => data.title,
                    icon: "fas fa-heading",
                    type: "text",
                    editable: true
                },
                {
                    key: "missionType",
                    label: "Type de mission",
                    value: (data) => data.missionType,
                    icon: "fas fa-briefcase",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Signification", label: "Signification" },
                        { value: "Constat", label: "Constat" },
                        { value: "Saisie", label: "Saisie" },
                        { value: "Exécution", label: "Exécution" },
                        { value: "Autre", label: "Autre" },
                    ]
                },
                {
                    key: "status",
                    label: "Statut",
                    value: (data) => data.status,
                    displayValue: (data) => data.status || "N/A",
                    icon: "fas fa-flag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Programmée", label: "Programmée" },
                        { value: "En cours", label: "En cours" },
                        { value: "Terminée", label: "Terminée" },
                        { value: "Annulée", label: "Annulée" },
                    ]
                },
                {
                    key: "priority",
                    label: "Priorité",
                    value: (data) => data.priority,
                    displayValue: (data) => data.priority || "N/A",
                    icon: "fas fa-exclamation-circle",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Basse", label: "Basse" },
                        { value: "Moyenne", label: "Moyenne" },
                        { value: "Haute", label: "Haute" },
                        { value: "Urgente", label: "Urgente" },
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
                    label: "Date d'assignation",
                    value: (data) => data.assignDate,
                    icon: "fas fa-calendar-plus",
                    type: "date",
                    editable: true
                },
                {
                    key: "dueDate",
                    label: "Date limite",
                    value: (data) => data.dueDate,
                    icon: "fas fa-calendar-times",
                    type: "date",
                    editable: true
                },
                {
                    key: "completionDate",
                    label: "Date d'achèvement",
                    value: (data) => data.completionDate,
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
            title: "Compte Rendu / Résultat",
            editStrategy: "structured",
            type: "description",
            fieldKey: "result",
            content: (data) => data.result || "Aucun compte rendu",
        },
        {
            title: "Entité Liée",
            editStrategy: "structured",
            fields: [
                {
                    key: "entityType",
                    label: "Type d'entité",
                    value: (data) => data.entityType || "dossier",
                    icon: "fas fa-link",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "dossier", label: "Dossier" },
                        { value: "case", label: "Procès" },
                    ],
                    helpText: "Sélectionnez le type d'entité auquel cette mission est liée"
                },
                {
                    key: "entityId",
                    label: "Entité",
                    value: (data) => data.entityId || "",
                    displayValue: (data) => {
                        if (!data.entityId) return "Aucune";
                        if (data.entityType === 'dossier') {
                            const dossier = mockDossiers.find(d => d.id === data.entityId);
                            return dossier ? `${dossier.caseNumber} - ${dossier.title}` : data.entityReference || "Aucune";
                        } else {
                            const caseObj = mockCases.find(c => c.id === data.entityId);
                            return caseObj ? `${caseObj.caseNumber} - ${caseObj.title}` : data.entityReference || "Aucune";
                        }
                    },
                    icon: data => data.entityType === 'dossier' ? 'fas fa-folder' : 'fas fa-gavel',
                    type: "searchable-select",
                    editable: true,
                    getOptions: (data) => {
                        if (data.entityType === 'case') {
                            return [
                                { value: "", label: "Sélectionner un procès..." },
                                ...mockCases.map(c => ({
                                    value: c.id,
                                    label: `${c.caseNumber} - ${c.title}`
                                }))
                            ];
                        } else {
                            return [
                                { value: "", label: "Sélectionner un dossier..." },
                                ...mockDossiers.map(d => ({
                                    value: d.id,
                                    label: `${d.caseNumber} - ${d.title}`
                                }))
                            ];
                        }
                    },
                    helpText: "Sélectionnez le dossier ou procès concerné"
                },
            ],
        },
        {
            title: "Huissier",
            editStrategy: "structured",
            fields: [
                {
                    key: "officerId",
                    label: "Huissier assigné",
                    value: (data) => data.officerId,
                    displayValue: (data) => data.officerName || "Non assigné",
                    icon: "fas fa-user-tie",
                    type: "select",
                    editable: true,
                    options: Object.values(mockOfficersExtended).map(officer => ({
                        value: officer.id,
                        label: officer.name
                    })),
                    getOptions: () => Object.values(mockOfficersExtended).map(officer => ({
                        value: officer.id,
                        label: officer.name
                    })), 
                    helpText: "Attention: Changer l'huissier transférera la mission vers un autre huissier"
                },
                {
                    key: "officerPhone",
                    label: "Téléphone",
                    value: (data) => data.officerPhone,
                    icon: "fas fa-phone",
                    type: "tel",
                    editable: false
                },
                {
                    key: "officerLocation",
                    label: "Localisation",
                    value: (data) => data.officerLocation,
                    icon: "fas fa-map-marker-alt",
                    type: "text",
                    editable: false
                },
            ],
        },
        {
            title: "Notes",
            editStrategy: "structured",
            type: "notes",
            fieldKey: "notes",
            content: (data) => data.notes || "Aucune note",
        },
    ],

    // Form configuration for editing
    getFormFields: () => {
        return missionFormFields;
    },
};

export default missionConfig;
