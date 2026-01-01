import ContentSection from "../../layout/ContentSection";
import { getFinancialEntriesForDisplay, formatCurrency } from "../../../utils/financialUtils";
import { formatDateValue } from "../../../utils/dateFormat";
import { financialCategories } from "../../../utils/financialConstants";

/**
 * Financial Entry Entity Configuration - Enhanced with tabs and better UI
 * ✅ Fully internationalized with i18n support
 */
export const createFinancialEntryConfig = (t) => ({
    entityType: "financialEntry",
    entityName: t('detail.entityName'),
    icon: "fas fa-file-invoice-dollar",
    listRoute: "/accounting",
    notFoundMessage: t('detail.notFound'),
    deleteConfirmMessage: t('detail.deleteConfirm'),
    allowDelete: true,
    allowEdit: true,

    fetchData: async (id, contextData = null) => {
        const numericId = parseInt(id);

        // Use live data from context (backend-driven)
        if (contextData?.financialEntries) {
            const entry = contextData.financialEntries.find(e => e.id === numericId);
            return entry || null;
        }

        // Fallback to static data
        const entries = getFinancialEntriesForDisplay();
        return entries.find(e => e.id === numericId) || null;
    },

    updateData: async (id, data, contextData = null) => {
        const numericId = parseInt(id);

        if (contextData?.updateFinancialEntry) {
            // Use DataContext to update (this persists to backend)
            await contextData.updateFinancialEntry(numericId, data);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    },

    deleteData: async (id, contextData = null) => {
        const numericId = parseInt(id);

        if (contextData?.deleteFinancialEntry) {
            // Use DataContext to delete (this persists to backend)
            await contextData.deleteFinancialEntry(numericId);
        }
    },

    getTitle: (data) => data.title || data.description || t('detail.fallback.untitled', { id: data.id }),
    getSubtitle: (data) => {
        const date = formatDateValue(data.date);
        const categoryLabel = financialCategories[data.category]?.label || data.category;
        const amount = formatCurrency(data.amount, data.currency);
        return t('detail.subtitle', { category: categoryLabel, amount, date });
    },

    // Quick Actions Configuration
    quickActions: [
        {
            key: "status",
            label: t('detail.quickActions.status.label'),
            icon: "fas fa-flag",
            colorMap: true,
            options: [
                {
                    value: "draft",
                    label: t('detail.quickActions.status.draft'),
                    color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
                    icon: "fas fa-file"
                },
                {
                    value: "confirmed",
                    label: t('detail.quickActions.status.confirmed'),
                    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                    icon: "fas fa-check-circle"
                },
                {
                    value: "paid",
                    label: t('detail.quickActions.status.paid'),
                    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                    icon: "fas fa-check-double"
                },
                {
                    value: "cancelled",
                    label: t('detail.quickActions.status.cancelled'),
                    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                    icon: "fas fa-times-circle"
                },
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
                                        {data.type === 'revenue' ? t('detail.header.revenue') : t('detail.header.expense')}
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
                                        {data.scope === 'client' ? t('detail.header.client') : t('detail.header.office')}
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
                                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{t('detail.header.date')}</p>
                                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100 truncate">
                                            {formatDateValue(data.date)}
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
                                            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{t('detail.header.client')}</p>
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
                                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('detail.header.dossier')}</p>
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
                                            <p className="text-xs font-medium text-red-600 dark:text-red-400">{t('detail.header.lawsuit')}</p>
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
                                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">{t('detail.header.dueDate')}</p>
                                            <p className="text-sm font-bold text-orange-900 dark:text-orange-100 truncate">
                                                {formatDateValue(data.dueDate)}
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
            title: t('detail.overview.financial'),
            editStrategy: "structured",
            fields: [
                {
                    key: "title",
                    label: t('detail.overview.fields.title'),
                    value: (data, contextData) => data.title || "",
                    icon: "fas fa-heading",
                    type: "text",
                    editable: true,
                    placeholder: t('detail.overview.fields.titlePlaceholder')
                },
                {
                    key: "description",
                    label: t('detail.overview.fields.description'),
                    value: (data, contextData) => data.description || "",
                    displayValue: (data) => data.description || t('detail.fallback.noAdditionalDetails'),
                    icon: "fas fa-file-text",
                    type: "textarea",
                    editable: true,
                    rows: 2
                },
                {
                    key: "amount",
                    label: t('detail.overview.fields.amount'),
                    value: (data, contextData) => data.amount,
                    icon: "fas fa-money-bill-wave",
                    type: "number",
                    editable: true,
                    min: 0,
                    step: 0.01
                },
                {
                    key: "type",
                    label: t('detail.overview.fields.type'),
                    value: (data, contextData) => data.type || "expense",
                    displayValue: (data) => data.type === 'revenue' ? t('detail.overview.fields.typeRevenue') : t('detail.overview.fields.typeExpense'),
                    icon: "fas fa-exchange-alt",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "revenue", label: t('detail.overview.fields.typeRevenue') },
                        { value: "expense", label: t('detail.overview.fields.typeExpense') },
                    ]
                },
                {
                    key: "category",
                    label: t('detail.overview.fields.category'),
                    value: (data, contextData) => data.category,
                    displayValue: (data) => {
                        // Use categoryLabel if available, otherwise compute from category
                        if (data.categoryLabel) {
                            return data.categoryLabel;
                        }
                        return financialCategories[data.category]?.label || data.category || t('detail.fallback.na');
                    },
                    icon: "fas fa-tag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Fees", label: t('detail.overview.categories.Fees') },
                        { value: "bailiff_fees", label: t('detail.overview.categories.bailiff_fees') },
                        { value: "office_expenses", label: t('detail.overview.categories.office_expenses') },
                        { value: "salary", label: t('detail.overview.categories.salary') },
                        { value: "other", label: t('detail.overview.categories.other') },
                    ]
                },
                {
                    key: "status",
                    label: t('detail.overview.fields.status'),
                    value: (data, contextData) => data.status,
                    displayValue: (data) => {
                        const statusMap = {
                            draft: t('detail.quickActions.status.draft'),
                            confirmed: t('detail.quickActions.status.confirmed'),
                            paid: t('detail.quickActions.status.paid'),
                            cancelled: t('detail.quickActions.status.cancelled')
                        };
                        return statusMap[data.status] || data.status;
                    },
                    icon: "fas fa-flag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "draft", label: t('detail.quickActions.status.draft') },
                        { value: "confirmed", label: t('detail.quickActions.status.confirmed') },
                        { value: "paid", label: t('detail.quickActions.status.paid') },
                        { value: "cancelled", label: t('detail.quickActions.status.cancelled') },
                    ]
                },
                {
                    key: "scope",
                    label: t('detail.overview.fields.scope'),
                    value: (data, contextData) => data.scope || "internal",
                    displayValue: (data) => data.scope === 'client' ? t('detail.overview.fields.scopeClient') : t('detail.overview.fields.scopeOffice'),
                    icon: "fas fa-layer-group",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "client", label: t('detail.overview.fields.scopeClient') },
                        { value: "internal", label: t('detail.overview.fields.scopeOffice') },
                    ]
                },
            ],
        },
        {
            title: t('detail.overview.dates'),
            editStrategy: "structured",
            fields: [
                {
                    key: "date",
                    label: t('detail.overview.fields.date'),
                    value: (data, contextData) => data.date,
                    displayValue: (data) => formatDateValue(data.date),
                    icon: "fas fa-calendar",
                    type: "date",
                    editable: true
                },
                {
                    key: "dueDate",
                    label: t('detail.overview.fields.dueDate'),
                    value: (data, contextData) => data.dueDate,
                    displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.na'),
                    icon: "fas fa-clock",
                    type: "date",
                    editable: true
                },
            ],
        },
        {
            title: t('detail.overview.entities'),
            editStrategy: "structured",
            fields: [
                {
                    key: "clientId",
                    label: t('detail.overview.fields.client'),
                    value: (data, contextData) => data.clientId || "",
                    displayValue: (data, contextData) => {
                        if (!data.clientId) return t('detail.fallback.none');
                        const client = (contextData?.clients || []).find(c => c.id === parseInt(data.clientId));
                        if (client) return client.name;
                        return data.clientName || t('detail.fallback.none');
                    },
                    icon: "fas fa-user",
                    type: "searchable-select",
                    editable: true,
                    options: [],
                    getOptions: (editedData, contextData) => ([
                        { value: "", label: t('detail.overview.fields.clientPlaceholder') },
                        ...(contextData?.clients || []).map(c => ({ value: c.id, label: c.name }))
                    ]),
                },
                {
                    key: "dossierId",
                    label: t('detail.overview.fields.dossier'),
                    value: (data, contextData) => data.dossierId || "",
                    displayValue: (data, contextData) => {
                        if (!data.dossierId) return t('detail.fallback.none');
                        const dossier = (contextData?.dossiers || []).find(d => d.id === parseInt(data.dossierId));
                        if (dossier) return `${dossier.caseNumber} - ${dossier.title}`;
                        return data.dossierReference || t('detail.fallback.none');
                    },
                    icon: "fas fa-folder",
                    type: "searchable-select",
                    editable: true,
                    getOptions: (editedData = {}, contextData) => {
                        const clientId = editedData?.clientId;
                        const dossiers = contextData?.dossiers || [];
                        const filteredDossiers = clientId
                            ? dossiers.filter(d => d.clientId === parseInt(clientId))
                            : dossiers;

                        return [
                            { value: "", label: t('detail.overview.fields.dossierPlaceholder') },
                            ...filteredDossiers.map(d => ({
                                value: d.id,
                                label: `${d.caseNumber} - ${d.title}`
                            }))
                        ];
                    },
                    helpText: t('detail.overview.fields.dossierHelp')
                },
                {
                    key: "caseId",
                    label: t('detail.overview.fields.lawsuit'),
                    value: (data, contextData) => data.caseId || "",
                    displayValue: (data, contextData) => {
                        if (!data.caseId) return t('detail.fallback.none');
                        const cases = contextData?.cases || [];
                        const caseItem = cases.find(c => c.id === parseInt(data.caseId));
                        if (caseItem) return `${caseItem.caseNumber} - ${caseItem.title}`;
                        return data.caseReference || t('detail.fallback.none');
                    },
                    icon: "fas fa-gavel",
                    type: "searchable-select",
                    editable: true,
                    getOptions: (editedData = {}, contextData) => {
                        const dossierId = editedData?.dossierId;
                        const cases = contextData?.cases || [];
                        const filteredCases = dossierId
                            ? cases.filter(c => c.dossierId === parseInt(dossierId))
                            : cases;

                        return [
                            { value: "", label: t('detail.overview.fields.lawsuitPlaceholder') },
                            ...filteredCases.map(c => ({
                                value: c.id,
                                label: `${c.caseNumber} - ${c.title}`
                            }))
                        ];
                    },
                    helpText: t('detail.overview.fields.lawsuitHelp')
                },
            ],
        },
        {
            title: t('detail.overview.notes'),
            editStrategy: "structured",
            type: "notes",
            fieldKey: "notes",
            content: (data) => data.notes || t('detail.fallback.noNotes'),
        },
    ],

    // Tabs configuration with colorful design
    tabs: [
        {
            id: "overview",
            label: t('detail.tabs.overview'),
            icon: "fas fa-eye",
            component: "overview",
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
                                            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{t('detail.relations.client')}</p>
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
                                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('detail.relations.dossier')}</p>
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
                                            <p className="text-sm font-medium text-red-600 dark:text-red-400">{t('detail.relations.lawsuit')}</p>
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
                                            <p className="text-sm font-medium text-teal-600 dark:text-teal-400">{t('detail.relations.bailiff')}</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.officerName}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-teal-600 dark:text-teal-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {!data.clientId && !data.dossierId && !data.caseId && !data.officerId && (
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

});

export default createFinancialEntryConfig;
