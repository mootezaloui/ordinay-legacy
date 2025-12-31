import ContentSection from "../../layout/ContentSection";
import { getFinancialEntriesForDisplay, formatCurrency } from "../../../utils/financialUtils";
import { formatDateValue } from "../../../utils/dateFormat";
import { financialCategories } from "../../../utils/financialConstants";

/**
 * Financial Entry Entity Configuration - Enhanced with tabs and better UI
 */
export const financialEntryConfig = {
    entityType: "financialEntry",
    entityName: "Accounting Entry",
    icon: "fas fa-file-invoice-dollar",
    listRoute: "/accounting",
    notFoundMessage: "Accounting entry not found",
    deleteConfirmMessage: "Are you sure you want to delete this accounting entry?",
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

    getTitle: (data) => data.title || data.description || `Entry #${data.id}`,
    getSubtitle: (data) => {
        const date = formatDateValue(data.date);
        const categoryLabel = financialCategories[data.category]?.label || data.category;
        const amount = formatCurrency(data.amount, data.currency);
        return `${categoryLabel} • ${amount} • ${date}`;
    },

    // Quick Actions Configuration
    quickActions: [
        {
            key: "status",
            label: "Status",
            icon: "fas fa-flag",
            colorMap: true,
            options: [
                {
                    value: "draft",
                    label: "Draft",
                    color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
                    icon: "fas fa-file"
                },
                {
                    value: "confirmed",
                    label: "Confirmed",
                    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                    icon: "fas fa-check-circle"
                },
                {
                    value: "paid",
                    label: "Paid",
                    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                    icon: "fas fa-check-double"
                },
                {
                    value: "cancelled",
                    label: "Cancelled",
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
                                        {data.type === 'revenue' ? 'Revenue' : 'Expense'}
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
                                        {data.scope === 'client' ? 'Client' : 'Office'}
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
                                            <p className="text-xs font-medium text-red-600 dark:text-red-400">Lawsuit</p>
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
                                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Due Date</p>
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
            title: "Financial Details",
            editStrategy: "structured",
            fields: [
                {
                    key: "title",
                    label: "Title",
                    value: (data, contextData) => data.title || "",
                    icon: "fas fa-heading",
                    type: "text",
                    editable: true,
                    placeholder: "Ex: Court filing fee, Bailiff travel expenses..."
                },
                {
                    key: "description",
                    label: "Additional Details",
                    value: (data, contextData) => data.description || "",
                    displayValue: (data) => data.description || "No additional details",
                    icon: "fas fa-file-text",
                    type: "textarea",
                    editable: true,
                    rows: 2
                },
                {
                    key: "amount",
                    label: "Amount",
                    value: (data, contextData) => data.amount,
                    icon: "fas fa-money-bill-wave",
                    type: "number",
                    editable: true,
                    min: 0,
                    step: 0.01
                },
                {
                    key: "type",
                    label: "Type",
                    value: (data, contextData) => data.type || "expense",
                    displayValue: (data) => data.type === 'revenue' ? 'Revenue' : 'Expense',
                    icon: "fas fa-exchange-alt",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "revenue", label: "Revenue" },
                        { value: "expense", label: "Expense" },
                    ]
                },
                {
                    key: "category",
                    label: "Category",
                    value: (data, contextData) => data.category,
                    displayValue: (data) => {
                        // Use categoryLabel if available, otherwise compute from category
                        if (data.categoryLabel) {
                            return data.categoryLabel;
                        }
                        return financialCategories[data.category]?.label || data.category || "N/A";
                    },
                    icon: "fas fa-tag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "Fees", label: "Fees" },
                        { value: "bailiff_fees", label: "Bailiff Fees" },
                        { value: "office_expenses", label: "Office Expenses" },
                        { value: "salary", label: "Salary" },
                        { value: "other", label: "Other" },
                    ]
                },
                {
                    key: "status",
                    label: "Status",
                    value: (data, contextData) => data.status,
                    displayValue: (data) => {
                        const statusMap = {
                            draft: "Draft",
                            confirmed: "Confirmed",
                            paid: "Paid",
                            cancelled: "Cancelled"
                        };
                        return statusMap[data.status] || data.status;
                    },
                    icon: "fas fa-flag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "draft", label: "Draft" },
                        { value: "confirmed", label: "Confirmed" },
                        { value: "paid", label: "Paid" },
                        { value: "cancelled", label: "Cancelled" },
                    ]
                },
                {
                    key: "scope",
                    label: "Scope",
                    value: (data, contextData) => data.scope || "internal",
                    displayValue: (data) => data.scope === 'client' ? 'Client' : 'Office',
                    icon: "fas fa-layer-group",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "client", label: "Client" },
                        { value: "internal", label: "Office (Internal)" },
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
                    label: "Transaction Date",
                    value: (data, contextData) => data.date,
                    displayValue: (data) => formatDateValue(data.date),
                    icon: "fas fa-calendar",
                    type: "date",
                    editable: true
                },
                {
                    key: "dueDate",
                    label: "Due Date",
                    value: (data, contextData) => data.dueDate,
                    displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : "N/A",
                    icon: "fas fa-clock",
                    type: "date",
                    editable: true
                },
            ],
        },
        {
            title: "Related Entities",
            editStrategy: "structured",
            fields: [
                {
                    key: "clientId",
                    label: "Client",
                    value: (data, contextData) => data.clientId || "",
                    displayValue: (data, contextData) => {
                        if (!data.clientId) return "None";
                        const client = (contextData?.clients || []).find(c => c.id === parseInt(data.clientId));
                        if (client) return client.name;
                        return data.clientName || "None";
                    },
                    icon: "fas fa-user",
                    type: "searchable-select",
                    editable: true,
                    options: [],
                    getOptions: (editedData, contextData) => ([
                        { value: "", label: "Select a client..." },
                        ...(contextData?.clients || []).map(c => ({ value: c.id, label: c.name }))
                    ]),
                },
                {
                    key: "dossierId",
                    label: "Dossier",
                    value: (data, contextData) => data.dossierId || "",
                    displayValue: (data, contextData) => {
                        if (!data.dossierId) return "None";
                        const dossier = (contextData?.dossiers || []).find(d => d.id === parseInt(data.dossierId));
                        if (dossier) return `${dossier.caseNumber} - ${dossier.title}`;
                        return data.dossierReference || "None";
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
                            { value: "", label: "Select a dossier..." },
                            ...filteredDossiers.map(d => ({
                                value: d.id,
                                label: `${d.caseNumber} - ${d.title}`
                            }))
                        ];
                    },
                    helpText: "Only Dossiers of the selected client are displayed"
                },
                {
                    key: "caseId",
                    label: "Lawsuit",
                    value: (data, contextData) => data.caseId || "",
                    displayValue: (data, contextData) => {
                        if (!data.caseId) return "None";
                        const cases = contextData?.cases || [];
                        const caseItem = cases.find(c => c.id === parseInt(data.caseId));
                        if (caseItem) return `${caseItem.caseNumber} - ${caseItem.title}`;
                        return data.caseReference || "None";
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
                            { value: "", label: "Select a lawsuit..." },
                            ...filteredCases.map(c => ({
                                value: c.id,
                                label: `${c.caseNumber} - ${c.title}`
                            }))
                        ];
                    },
                    helpText: "Only lawsuits of the selected dossier are displayed"
                },
            ],
        },
        {
            title: "Notes",
            editStrategy: "structured",
            type: "notes",
            fieldKey: "notes",
            content: (data) => data.notes || "No notes",
        },
    ],

    // Tabs configuration with colorful design
    tabs: [
        {
            id: "overview",
            label: "Overview",
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
                                Linked Entities
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
                                            <p className="text-sm font-medium text-red-600 dark:text-red-400">Lawsuit</p>
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
                                            <p className="text-sm font-medium text-teal-600 dark:text-teal-400">Bailiff</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">{data.officerName}</p>
                                        </div>
                                    </div>
                                    <i className="fas fa-arrow-right text-teal-600 dark:text-teal-400 group-hover:translate-x-1 transition-transform"></i>
                                </a>
                            )}

                            {!data.clientId && !data.dossierId && !data.caseId && !data.officerId && (
                                <div className="text-center py-12">
                                    <i className="fas fa-unlink text-slate-300 dark:text-slate-600 text-4xl mb-3"></i>
                                    <p className="text-slate-500 dark:text-slate-400"> No entities linked </p>
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

};

export default financialEntryConfig;
