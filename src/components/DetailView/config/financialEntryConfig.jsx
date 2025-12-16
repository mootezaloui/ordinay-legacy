import ContentSection from "../../layout/ContentSection";
import { getFinancialEntriesForDisplay, formatCurrency } from "../../../utils/financialUtils";
import { updateFinancialEntry, deleteFinancialEntry } from "../../../utils/financialData";
import { mockClients, mockDossiers, mockCases } from "../../../utils/mockData";
import { financialEntryFormFields, populateRelationshipOptions } from "../../FormModal/formConfigs";
import InlineStatusSelector from "../../InlineSelectors/InlineStatusSelector";

/**
 * Financial Entry Entity Configuration - Enhanced with tabs and better UI
 */
export const financialEntryConfig = {
    entityType: "financialEntry",
    entityName: "Écriture Comptable",
    icon: "fas fa-file-invoice-dollar",
    listRoute: "/accounting",
    notFoundMessage: "Écriture comptable non trouvée",
    deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cette écriture comptable ?",
    allowDelete: true,
    allowEdit: true,

    fetchData: async (id) => {
        const entries = getFinancialEntriesForDisplay();
        return entries.find(e => e.id === parseInt(id)) || null;
    },

    updateData: async (id, data) => {
        updateFinancialEntry(parseInt(id), data);
        await new Promise(resolve => setTimeout(resolve, 300));
    },

    deleteData: async (id) => {
        deleteFinancialEntry(parseInt(id));
    },

    getTitle: (data) => `#${data.id} - ${data.description}`,
    getSubtitle: (data) => {
        const date = new Date(data.date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        return `${data.categoryLabel} • ${date}`;
    },

    // Quick Actions Configuration
    quickActions: [
        {
            key: "status",
            label: "Statut",
            icon: "fas fa-flag",
            colorMap: true,
            options: [
                { value: "draft", label: "Brouillon", color: "slate", icon: "fas fa-file" },
                { value: "confirmed", label: "Confirmé", color: "blue", icon: "fas fa-check-circle" },
                { value: "paid", label: "Payé", color: "green", icon: "fas fa-check-double" },
                { value: "cancelled", label: "Annulé", color: "red", icon: "fas fa-times-circle" },
            ],
        }
    ],

    renderHeader: (data) => {
        return (
            <ContentSection>
                <div className="p-6">
                    <div className="flex flex-col lg:flex-row items-start gap-6">
                        {/* Icon with gradient */}
                        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-xl flex-shrink-0 ${data.type === 'revenue'
                            ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-green-600 text-white'
                            : 'bg-gradient-to-br from-rose-400 via-rose-500 to-red-600 text-white'
                            }`}>
                            <i className={data.type === 'revenue' ? 'fas fa-coins' : 'fas fa-receipt'}></i>
                        </div>

                        <div className="flex-1 min-w-0">
                            {/* Amount Display - Big and Bold */}
                            <div className="mb-6">
                                <div className={`text-5xl font-black mb-2 ${data.type === 'revenue'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                    }`}>
                                    {data.amountWithSign}
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${data.type === 'revenue'
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                        }`}>
                                        <i className={`fas ${data.type === 'revenue' ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}`}></i>
                                        {data.type === 'revenue' ? 'Recette' : 'Dépense'}
                                    </span>
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold bg-${data.categoryColor}-100 text-${data.categoryColor}-700 dark:bg-${data.categoryColor}-900/30 dark:text-${data.categoryColor}-300`}>
                                        <i className="fas fa-tag"></i>
                                        {data.categoryLabel}
                                    </span>
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${data.scope === 'client'
                                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                                        }`}>
                                        <i className={`fas ${data.scope === 'client' ? 'fa-user' : 'fa-building'}`}></i>
                                        {data.scope === 'client' ? 'Client' : 'Bureau'}
                                    </span>
                                </div>
                            </div>

                            {/* Info Grid - Colorful */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                {/* Date */}
                                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                                        <i className="fas fa-calendar text-white"></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Date</p>
                                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100 truncate">
                                            {new Date(data.date).toLocaleDateString('fr-FR', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                </div>

                                {/* Client */}
                                {data.clientName && (
                                    <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                                        <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-user text-white"></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Client</p>
                                            <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100 truncate">{data.clientName}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Dossier */}
                                {data.dossierReference && (
                                    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                        <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-folder text-white"></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Dossier</p>
                                            <p className="text-sm font-bold text-amber-900 dark:text-amber-100 truncate">{data.dossierReference}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Case */}
                                {data.caseReference && (
                                    <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                        <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-gavel text-white"></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-red-600 dark:text-red-400">Procès</p>
                                            <p className="text-sm font-bold text-red-900 dark:text-red-100 truncate">{data.caseReference}</p>
                                        </div>
                                    </div>
                                )}

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
                            </div>
                        </div>
                    </div>
                </div>
            </ContentSection>
        );
    },

    // Overview sections - removed, using tabs instead
    overviewSections: [],

    // Tabs configuration with colorful design
    tabs: [
        {
            id: "informations",
            label: "Informations",
            icon: "fas fa-info-circle",
            render: (data, onUpdate) => (
                <div className="space-y-6">
                    {/* Financial Details Card */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center">
                                <i className="fas fa-file-invoice-dollar text-white text-xl"></i>
                            </div>
                            <h3 className="text-xl font-bold text-blue-900 dark:text-blue-100">
                                Détails Financiers
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Description</p>
                                <p className="text-base font-semibold text-slate-900 dark:text-white">{data.description}</p>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Montant</p>
                                <p className={`text-2xl font-bold ${data.type === 'revenue' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {data.amountWithSign}
                                </p>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Type</p>
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${data.type === 'revenue'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                    }`}>
                                    <i className={`fas ${data.type === 'revenue' ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}`}></i>
                                    {data.type === 'revenue' ? 'Recette' : 'Dépense'}
                                </span>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Catégorie</p>
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold bg-${data.categoryColor}-100 text-${data.categoryColor}-700 dark:bg-${data.categoryColor}-900/30 dark:text-${data.categoryColor}-300`}>
                                    <i className="fas fa-tag"></i>
                                    {data.categoryLabel}
                                </span>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Statut</p>
                                <InlineStatusSelector
                                    value={data.status}
                                    onChange={(newStatus) => onUpdate({ status: newStatus })}
                                    statusOptions={[
                                        { value: "draft", label: "Brouillon", icon: "fas fa-file", color: "slate" },
                                        { value: "confirmed", label: "Confirmé", icon: "fas fa-check-circle", color: "blue" },
                                        { value: "paid", label: "Payé", icon: "fas fa-check-double", color: "green" },
                                        { value: "cancelled", label: "Annulé", icon: "fas fa-times-circle", color: "red" },
                                    ]}
                                />
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Portée</p>
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${data.scope === 'client'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                                    }`}>
                                    <i className={`fas ${data.scope === 'client' ? 'fa-user' : 'fa-building'}`}></i>
                                    {data.scope === 'client' ? 'Client' : 'Bureau'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Dates Card */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border-2 border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center">
                                <i className="fas fa-calendar-alt text-white text-xl"></i>
                            </div>
                            <h3 className="text-xl font-bold text-green-900 dark:text-green-100">
                                Dates
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Date de l'opération</p>
                                <p className="text-base font-semibold text-slate-900 dark:text-white">
                                    {new Date(data.date).toLocaleDateString('fr-FR', {
                                        weekday: 'long',
                                        day: '2-digit',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </p>
                            </div>
                            {data.dueDate && (
                                <div className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-lg">
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Date d'échéance</p>
                                    <p className="text-base font-semibold text-slate-900 dark:text-white">
                                        {new Date(data.dueDate).toLocaleDateString('fr-FR', {
                                            weekday: 'long',
                                            day: '2-digit',
                                            month: 'long',
                                            year: 'numeric'
                                        })}
                                    </p>
                                </div>
                            )}
                        </div>
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
                            {data.clientId && (
                                <a
                                    href={`/clients/${data.clientId}`}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-indigo-500 flex items-center justify-center">
                                            <i className="fas fa-user text-white text-lg"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Client</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.clientName}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {data.dossierId && (
                                <a
                                    href={`/dossiers/${data.dossierId}`}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-amber-500 flex items-center justify-center">
                                            <i className="fas fa-folder text-white text-lg"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Dossier</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.dossierReference}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {data.caseId && (
                                <a
                                    href={`/cases/${data.caseId}`}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-red-200 dark:border-red-800 hover:border-red-400 dark:hover:border-red-600 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-red-500 flex items-center justify-center">
                                            <i className="fas fa-gavel text-white text-lg"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-red-600 dark:text-red-400">Procès</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.caseReference}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-red-600 dark:text-red-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {data.officerId && (
                                <a
                                    href={`/officers/${data.officerId}`}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-teal-200 dark:border-teal-800 hover:border-teal-400 dark:hover:border-teal-600 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-teal-500 flex items-center justify-center">
                                            <i className="fas fa-user-tie text-white text-lg"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-teal-600 dark:text-teal-400">Huissier</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.officerName}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-teal-600 dark:text-teal-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {!data.clientId && !data.dossierId && !data.caseId && !data.officerId && (
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
        const fields = populateRelationshipOptions(financialEntryFormFields, {
            clients: mockClients,
            dossiers: mockDossiers,
            cases: mockCases,
        });
        return fields;
    },
};

export default financialEntryConfig;
