import ContentSection from "../../layout/ContentSection";
import { getFinancialEntriesForDisplay, formatCurrency } from "../../../utils/financialUtils";
import { updateFinancialEntry, deleteFinancialEntry } from "../../../utils/financialData";
import { mockClients, mockDossiers, mockCases } from "../../../utils/mockData";
import { financialEntryFormFields, populateRelationshipOptions } from "../../FormModal/formConfigs";

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
        // ✅ Enrich data with denormalized display fields before saving
        const enrichedData = { ...data };

        // Update clientName if clientId changed
        if ('clientId' in data) {
            if (data.clientId) {
                const client = mockClients.find(c => c.id === parseInt(data.clientId));
                if (client) {
                    enrichedData.clientName = client.name;
                }
            } else {
                enrichedData.clientName = null;
            }
        }

        // Update dossierReference if dossierId changed
        if ('dossierId' in data) {
            if (data.dossierId) {
                const dossier = mockDossiers.find(d => d.id === parseInt(data.dossierId));
                if (dossier) {
                    enrichedData.dossierReference = dossier.caseNumber;
                    // Also auto-fill client if not provided
                    if (!('clientId' in data) && dossier.clientId) {
                        enrichedData.clientId = dossier.clientId;
                        const client = mockClients.find(c => c.id === dossier.clientId);
                        if (client) {
                            enrichedData.clientName = client.name;
                        }
                    }
                }
            } else {
                enrichedData.dossierReference = null;
            }
        }

        // Update caseReference if caseId changed
        if ('caseId' in data) {
            if (data.caseId) {
                const selectedCase = mockCases.find(c => c.id === parseInt(data.caseId));
                if (selectedCase) {
                    enrichedData.caseReference = selectedCase.caseNumber;
                    // Also auto-fill dossier and client if not provided
                    if (!('dossierId' in data) && selectedCase.dossierId) {
                        enrichedData.dossierId = selectedCase.dossierId;
                        const dossier = mockDossiers.find(d => d.id === selectedCase.dossierId);
                        if (dossier) {
                            enrichedData.dossierReference = dossier.caseNumber;
                            if (!('clientId' in data) && dossier.clientId) {
                                enrichedData.clientId = dossier.clientId;
                                const client = mockClients.find(c => c.id === dossier.clientId);
                                if (client) {
                                    enrichedData.clientName = client.name;
                                }
                            }
                        }
                    }
                }
            } else {
                enrichedData.caseReference = null;
            }
        }

        updateFinancialEntry(parseInt(id), enrichedData);
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

    // Overview sections configuration
    overviewSections: [
        {
            title: "Détails Financiers",
            editStrategy: "structured",
            fields: [
                {
                    key: "description",
                    label: "Description",
                    value: (data) => data.description,
                    icon: "fas fa-file-text",
                    type: "textarea",
                    editable: true,
                    rows: 2
                },
                {
                    key: "amount",
                    label: "Montant",
                    value: (data) => data.amount,
                    icon: "fas fa-money-bill-wave",
                    type: "number",
                    editable: true,
                    min: 0,
                    step: 0.01
                },
                {
                    key: "type",
                    label: "Type",
                    value: (data) => data.type === 'revenue' ? 'Recette' : 'Dépense',
                    icon: data => data.type === 'revenue' ? 'fas fa-arrow-trend-down' : 'fas fa-arrow-trend-up',
                    type: "select",
                    editable: true,
                    options: [
                        { value: "revenue", label: "Recette" },
                        { value: "expense", label: "Dépense" },
                    ]
                },
                {
                    key: "category",
                    label: "Catégorie",
                    value: (data) => data.categoryLabel,
                    icon: "fas fa-tag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "honoraires", label: "Honoraires" },
                        { value: "frais_huissier", label: "Frais d'huissier" },
                        { value: "frais_bureau", label: "Frais de bureau" },
                        { value: "salaire", label: "Salaire" },
                        { value: "autre", label: "Autre" },
                    ]
                },
                {
                    key: "status",
                    label: "Statut",
                    value: (data) => data.status,
                    displayValue: (data) => {
                        const statusMap = {
                            draft: "Brouillon",
                            confirmed: "Confirmé",
                            paid: "Payé",
                            cancelled: "Annulé"
                        };
                        return statusMap[data.status] || data.status;
                    },
                    icon: "fas fa-flag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "draft", label: "Brouillon" },
                        { value: "confirmed", label: "Confirmé" },
                        { value: "paid", label: "Payé" },
                        { value: "cancelled", label: "Annulé" },
                    ]
                },
                {
                    key: "scope",
                    label: "Portée",
                    value: (data) => data.scope === 'client' ? 'Client' : 'Bureau',
                    icon: data => data.scope === 'client' ? 'fas fa-user' : 'fas fa-building',
                    type: "select",
                    editable: true,
                    options: [
                        { value: "client", label: "Client" },
                        { value: "internal", label: "Bureau (Interne)" },
                    ]
                },
            ],
        },
        {
            title: "Dates",
            editStrategy: "structured",
            fields: [
                {
                    key: "date",
                    label: "Date de l'opération",
                    value: (data) => data.date,
                    icon: "fas fa-calendar",
                    type: "date",
                    editable: true
                },
                {
                    key: "dueDate",
                    label: "Date d'échéance",
                    value: (data) => data.dueDate,
                    icon: "fas fa-clock",
                    type: "date",
                    editable: true
                },
            ],
        },
        {
            title: "Entités Liées",
            editStrategy: "structured",
            fields: [
                {
                    key: "clientId",
                    label: "Client",
                    value: (data) => data.clientId || "",
                    displayValue: (data) => data.clientName || "Aucun",
                    icon: "fas fa-user",
                    type: "searchable-select",
                    editable: true,
                    options: [
                        { value: "", label: "Sélectionner un client..." },
                        ...mockClients.map(c => ({ value: c.id, label: c.name }))
                    ],
                    helpText: "Sélectionner le client concerné (cela filtrera les dossiers et procès disponibles)"
                },
                {
                    key: "dossierId",
                    label: "Dossier",
                    value: (data) => data.dossierId || "",
                    displayValue: (data) => data.dossierReference || "Aucun",
                    icon: "fas fa-folder",
                    type: "searchable-select",
                    editable: true,
                    getOptions: (editedData) => {
                        // ✅ Filter dossiers by selected client
                        const clientId = editedData?.clientId;
                        const filteredDossiers = clientId
                            ? mockDossiers.filter(d => d.clientId === parseInt(clientId))
                            : mockDossiers;

                        return [
                            { value: "", label: clientId ? "Sélectionner un dossier..." : "Sélectionner d'abord un client" },
                            ...filteredDossiers.map(d => ({
                                value: d.id,
                                label: `${d.caseNumber} - ${d.title}`
                            }))
                        ];
                    },
                    helpText: "Seuls les dossiers du client sélectionné sont affichés"
                },
                {
                    key: "caseId",
                    label: "Procès",
                    value: (data) => data.caseId || "",
                    displayValue: (data) => data.caseReference || "Aucun",
                    icon: "fas fa-gavel",
                    type: "searchable-select",
                    editable: true,
                    getOptions: (editedData) => {
                        // ✅ Filter cases by selected dossier
                        const dossierId = editedData?.dossierId;
                        const filteredCases = dossierId
                            ? mockCases.filter(c => c.dossierId === parseInt(dossierId))
                            : mockCases;

                        return [
                            { value: "", label: dossierId ? "Sélectionner un procès..." : "Sélectionner d'abord un dossier" },
                            ...filteredCases.map(c => ({
                                value: c.id,
                                label: `${c.caseNumber} - ${c.title}`
                            }))
                        ];
                    },
                    helpText: "Seuls les procès du dossier sélectionné sont affichés"
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

    // Tabs configuration with colorful design
    tabs: [
        {
            id: "overview",
            label: "Vue d'ensemble",
            icon: "fas fa-eye",
            component: "overview",
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
            component: "history",
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
