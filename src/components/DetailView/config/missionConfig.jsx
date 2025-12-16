import ContentSection from "../../layout/ContentSection";
import { mockOfficersExtended, mockDossiers, mockCases, getStatusColor } from "../../../utils/mockData";
import { missionFormFields } from "../../FormModal/formConfigs";
import InlineStatusSelector from "../../InlineSelectors/InlineStatusSelector";
import InlinePrioritySelector from "../../InlineSelectors/InlinePrioritySelector";

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
        console.log("Updating mission:", id, data);
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
                { value: "Programmée", label: "Programmée", color: "blue", icon: "fas fa-calendar" },
                { value: "En cours", label: "En cours", color: "amber", icon: "fas fa-spinner" },
                { value: "Terminée", label: "Terminée", color: "green", icon: "fas fa-check-circle" },
                { value: "Annulée", label: "Annulée", color: "red", icon: "fas fa-times-circle" },
            ],
        },
        {
            key: "priority",
            label: "Priorité",
            icon: "fas fa-exclamation-circle",
            colorMap: true,
            options: [
                { value: "Haute", label: "Haute", color: "red", icon: "fas fa-angle-double-up" },
                { value: "Moyenne", label: "Moyenne", color: "amber", icon: "fas fa-minus" },
                { value: "Basse", label: "Basse", color: "green", icon: "fas fa-angle-double-down" },
            ],
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
                                            {new Date(data.assignDate).toLocaleDateString('fr-FR', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
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
                                                {new Date(data.dueDate).toLocaleDateString('fr-FR', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
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
                                                {new Date(data.completionDate).toLocaleDateString('fr-FR', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
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

        if (data.status === "Terminée") {
            const assignDate = new Date(data.assignDate);
            const completionDate = new Date(data.completionDate);
            const days = Math.ceil((completionDate - assignDate) / (1000 * 60 * 60 * 24));

            stats.push({
                icon: "fas fa-hourglass-half",
                iconColor: "text-amber-600 dark:text-amber-400",
                bgColor: "bg-amber-100 dark:bg-amber-900/20",
                value: `${days}j`,
                label: "Durée"
            });
        }

        return stats;
    },

    // Tabs configuration
    tabs: [
        {
            id: "informations",
            label: "Informations",
            icon: "fas fa-info-circle",
            render: (data, onUpdate) => (
                <div className="space-y-6">
                    {/* Mission Details Card */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center">
                                <i className="fas fa-clipboard-check text-white text-xl"></i>
                            </div>
                            <h3 className="text-xl font-bold text-blue-900 dark:text-blue-100">
                                Détails de la Mission
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Titre</p>
                                <p className="text-base font-semibold text-slate-900 dark:text-white">{data.title}</p>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Type</p>
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${data.missionType === 'Signification'
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
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Statut</p>
                                <InlineStatusSelector
                                    value={data.status}
                                    onChange={(newStatus) => onUpdate({ status: newStatus })}
                                    statusOptions={[
                                        { value: "Programmée", label: "Programmée", icon: "fas fa-calendar", color: "blue" },
                                        { value: "En cours", label: "En cours", icon: "fas fa-spinner", color: "amber" },
                                        { value: "Terminée", label: "Terminée", icon: "fas fa-check-circle", color: "green" },
                                        { value: "Annulée", label: "Annulée", icon: "fas fa-times-circle", color: "red" },
                                    ]}
                                />
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Priorité</p>
                                <InlinePrioritySelector
                                    value={data.priority}
                                    onChange={(newPriority) => onUpdate({ priority: newPriority })}
                                />
                            </div>
                            {data.entityReference && (
                                <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Entité liée</p>
                                    <p className="text-base font-semibold text-slate-900 dark:text-white">
                                        {data.entityType === 'dossier' ? 'Dossier' : 'Procès'}: {data.entityReference}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        {data.description && (
                            <div className="mt-4 bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Description</p>
                                <p className="text-base text-slate-900 dark:text-white whitespace-pre-wrap">{data.description}</p>
                            </div>
                        )}

                        {/* Result */}
                        {data.result && (
                            <div className="mt-4 bg-green-50/60 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                                <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                                    <i className="fas fa-check-circle mr-2"></i>
                                    Résultat
                                </p>
                                <p className="text-base text-slate-900 dark:text-white whitespace-pre-wrap">{data.result}</p>
                            </div>
                        )}
                    </div>

                    {/* Notes Card (if any) */}
                    {data.notes && (
                        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-xl p-6 border-2 border-amber-200 dark:border-amber-800">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-lg bg-amber-500 flex items-center justify-center">
                                    <i className="fas fa-sticky-note text-white text-xl"></i>
                                </div>
                                <h3 className="text-xl font-bold text-amber-900 dark:text-amber-100">
                                    Notes
                                </h3>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-base text-slate-900 dark:text-white whitespace-pre-wrap">{data.notes}</p>
                            </div>
                        </div>
                    )}
                </div>
            ),
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
            component: "timeline",
        },
    ],

    // Form configuration for editing
    getFormFields: () => {
        return missionFormFields;
    },
};

export default missionConfig;
