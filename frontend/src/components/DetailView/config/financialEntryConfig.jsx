import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { getFinancialEntriesForDisplay, formatCurrency } from "../../../utils/financialUtils";
import { formatDateValue } from "../../../utils/dateFormat";
import { financialCategories } from "../../../utils/financialConstants";

// Helpers to translate financial enums via i18n (presentation only)
const normalizeKey = (value) => (value || "").toString().trim();

const translateFinancialType = (type, t) => {
    const key = normalizeKey(type).toLowerCase();
    if (!key) return "";
    const path = `table.type.${key}`;
    const translated = t(path, { ns: "accounting", defaultValue: path });
    return translated === path ? key : translated;
};

const translateFinancialStatus = (status, t) => {
    const key = normalizeKey(status).toLowerCase();
    if (!key) return "";

    const statusKeyMap = {
        draft: "draft",
        confirmed: "confirmed",
        paid: "paid",
        cancelled: "cancelled",
        canceled: "cancelled",
        posted: "posted",
        overdue: "overdue",
        void: "void",
    };

    const mappedKey = statusKeyMap[key] || key;

    // Try quickActions then table for consistency with other detail views
    const paths = [
        `detail.quickActions.status.${mappedKey}`,
        `table.status.${mappedKey}`,
    ];

    for (const p of paths) {
        const translated = t(p, { ns: "accounting", defaultValue: p });
        if (translated && translated !== p) return translated;
    }

    return status;
};

const translateFinancialCategory = (category, t) => {
    const rawKey = normalizeKey(category);
    const keyMap = {
        bailiff_fees: "frais_huissier",
    };
    const key = keyMap[rawKey?.toLowerCase?.() || rawKey] || rawKey;
    if (!key) return t("detail.fallback.na", { ns: "accounting", defaultValue: "N/A" });

    const primaryPath = `table.category.${key}`;
    const translated = t(primaryPath, {
        ns: "accounting",
        defaultValue: primaryPath,
    });

    if (translated !== primaryPath) return translated;

    // Secondary fallback to overview categories if provided there
    const overviewPath = `detail.overview.categories.${key}`;
    const overviewTranslated = t(overviewPath, {
        ns: "accounting",
        defaultValue: overviewPath,
    });

    if (overviewTranslated !== overviewPath) return overviewTranslated;

    return key;
};

const translateFinancialScope = (scope, t) => {
    const key = normalizeKey(scope).toLowerCase();
    const scopeKeyMap = {
        client: "client",
        internal: "internal",
        office: "office",
    };
    const mappedKey = scopeKeyMap[key] || key;
    const path = `table.scope.${mappedKey}`;
    const translated = t(path, { ns: "accounting", defaultValue: path });
    return translated === path ? scope : translated;
};

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
        const findById = (list, value) => {
            if (!Array.isArray(list) || value === null || value === undefined || value === "") return null;
            return list.find(item => String(item.id) === String(value)) || null;
        };

        // Use live data from context (backend-driven)
        if (contextData?.financialEntries) {
            const entry = contextData.financialEntries.find(e => e.id === numericId);
            if (!entry) return null;

            const clients = contextData.clients || [];
            const dossiers = contextData.dossiers || [];
            const lawsuits = contextData.lawsuits || [];
            const missions = contextData.missions || [];
            const tasks = contextData.tasks || [];
            const sessions = contextData.sessions || [];

            let lawsuit = findById(lawsuits, entry.lawsuitId);
            let dossier = findById(dossiers, entry.dossierId);
            let client = findById(clients, entry.clientId);

            if ((!lawsuit || !dossier) && entry.missionId) {
                const mission = findById(missions, entry.missionId);
                const missionEntityType = String(mission?.entityType || "").toLowerCase();

                lawsuit =
                    lawsuit ||
                    findById(lawsuits, mission?.lawsuitId) ||
                    (missionEntityType === "lawsuit" ? findById(lawsuits, mission?.entityId) : null);

                dossier =
                    dossier ||
                    findById(dossiers, mission?.dossierId) ||
                    (missionEntityType === "dossier" ? findById(dossiers, mission?.entityId) : null);
            }

            if ((!lawsuit || !dossier) && entry.taskId) {
                const task = findById(tasks, entry.taskId);
                lawsuit = lawsuit || findById(lawsuits, task?.lawsuitId);
                dossier = dossier || findById(dossiers, task?.dossierId);
            }

            if ((!lawsuit || !dossier) && entry.sessionId) {
                const session = findById(sessions, entry.sessionId);
                lawsuit = lawsuit || findById(lawsuits, session?.lawsuitId);
                dossier = dossier || findById(dossiers, session?.dossierId);
            }

            if (!dossier && lawsuit?.dossierId) {
                dossier = findById(dossiers, lawsuit.dossierId);
            }

            if (!client && dossier?.clientId) {
                client = findById(clients, dossier.clientId);
            }

            return {
                ...entry,
                client: client ? { id: client.id, name: client.name } : null,
                dossier: dossier ? { id: dossier.id, lawsuitNumber: dossier.lawsuitNumber, title: dossier.title } : null,
                lawsuit: lawsuit ? { id: lawsuit.id, lawsuitNumber: lawsuit.lawsuitNumber, title: lawsuit.title } : null,
                clientName: entry.clientName || client?.name || "",
                dossierReference: entry.dossierReference || (dossier ? `${dossier.lawsuitNumber} - ${dossier.title}` : ""),
                caseReference:
                    entry.caseReference ||
                    entry.lawsuitReference ||
                    (lawsuit ? `${lawsuit.lawsuitNumber} - ${lawsuit.title}` : ""),
            };
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
        const categoryLabel = translateFinancialCategory(data.category, t);
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
        const headerAmount = data?.amountWithSign || formatCurrency(data.amount, data.currency);

        return (
            <ContentSection>
                <div className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                {data.title || data.description || t('table.fallback.untitled', { id: data.id })}
                            </h2>
                            {data.client?.id && (
                                <Link
                                    to={`/clients/${data.client.id}`}
                                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                                >
                                    <i className="fas fa-user"></i>
                                    {data.client.name}
                                </Link>
                            )}
                            {data.dossier?.id && (
                                <Link
                                    to={`/dossiers/${data.dossier.id}`}
                                    className="mt-1 text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                                >
                                    <i className="fas fa-folder-open"></i>
                                    {data.dossier.lawsuitNumber} - {data.dossier.title}
                                </Link>
                            )}
                            {data.lawsuit?.id && (
                                <Link
                                    to={`/lawsuits/${data.lawsuit.id}`}
                                    className="mt-1 text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                                >
                                    <i className="fas fa-gavel"></i>
                                    {data.lawsuit.lawsuitNumber} - {data.lawsuit.title}
                                </Link>
                            )}
                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                <i className={data.type === 'revenue' ? "fas fa-arrow-trend-down" : "fas fa-arrow-trend-up"}></i>
                                <span>{translateFinancialType(data.type, t)}</span>
                                <span>•</span>
                                <span>{translateFinancialCategory(data.category, t)}</span>
                                <span>•</span>
                                <span className={data.type === 'revenue' ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-rose-600 dark:text-rose-400 font-medium"}>
                                    {data.amountWithSign}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${data.type === 'revenue' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"}`}>
                                {translateFinancialType(data.type, t)}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                                {translateFinancialStatus(data.status, t)}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <InfoCard
                            icon="fas fa-coins"
                            label={t('table.columns.amount')}
                            value={headerAmount}
                            color={data.type === 'revenue' ? 'green' : 'red'}
                        />
                        <InfoCard
                            icon="fas fa-calendar"
                            label={t('table.columns.date')}
                            value={formatDateValue(data.date)}
                            color="blue"
                        />
                        {data.clientName && (
                            <InfoCard
                                icon="fas fa-user"
                                label={t('table.scope.client')}
                                value={data.clientName}
                                color="purple"
                            />
                        )}
                        {data.dossierReference && (
                            <InfoCard
                                icon="fas fa-folder"
                                label={t('detail.header.dossier', { ns: 'dossiers', defaultValue: 'Dossier' })}
                                value={data.dossierReference}
                                color="amber"
                            />
                        )}
                        {data.caseReference && (
                            <InfoCard
                                icon="fas fa-gavel"
                                label={t('detail.header.lawsuit', { ns: 'lawsuits', defaultValue: 'Affaire' })}
                                value={data.caseReference}
                                color="red"
                            />
                        )}
                        <InfoCard
                            icon="fas fa-clock"
                            label={t('detail.header.dueDate', { ns: 'accounting', defaultValue: 'Date d\'échéance' })}
                            value={data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.none', { ns: 'accounting', defaultValue: t('detail.fallback.none', { ns: 'common', defaultValue: '—' }) })}
                            color="orange"
                        />
                        <InfoCard
                            icon="fas fa-tag"
                            label={t('detail.detail.category', { ns: 'common', defaultValue: 'Catégorie' })}
                            value={translateFinancialCategory(data.category, t)}
                            color={data.categoryColor || "slate"}
                        />
                        <InfoCard
                            icon={data.scope === 'client' ? "fas fa-user" : "fas fa-building"}
                            label={t('detail.overview.fields.scope', { ns: 'accounting', defaultValue: 'Portée' })}
                            value={translateFinancialScope(data.scope, t)}
                            color={data.scope === 'client' ? "purple" : "slate"}
                        />
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
                    displayValue: (data) => translateFinancialType(data.type, t),
                    icon: "fas fa-exchange-alt",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "revenue", label: translateFinancialType("revenue", t) },
                        { value: "expense", label: translateFinancialType("expense", t) },
                    ]
                },
                {
                    key: "category",
                    label: t('detail.overview.fields.category'),
                    value: (data, contextData) => data.category,
                    displayValue: (data) => {
                        return translateFinancialCategory(data.category, t);
                    },
                    icon: "fas fa-tag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "honoraires", label: translateFinancialCategory("honoraires", t) },
                        { value: "advance", label: translateFinancialCategory("advance", t) },
                        { value: "frais_judiciaires", label: translateFinancialCategory("frais_judiciaires", t) },
                        { value: "frais_huissier", label: translateFinancialCategory("frais_huissier", t) },
                        { value: "bailiff_fees", label: translateFinancialCategory("frais_huissier", t) },
                        { value: "frais_bureau", label: translateFinancialCategory("frais_bureau", t) },
                        { value: "other", label: translateFinancialCategory("other", t) },
                    ]
                },
                {
                    key: "status",
                    label: t('detail.overview.fields.status'),
                    value: (data, contextData) => data.status,
                    displayValue: (data) => {
                        return translateFinancialStatus(data.status, t);
                    },
                    icon: "fas fa-flag",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "draft", label: translateFinancialStatus("draft", t) },
                        { value: "confirmed", label: translateFinancialStatus("confirmed", t) },
                        { value: "paid", label: translateFinancialStatus("paid", t) },
                        { value: "cancelled", label: translateFinancialStatus("cancelled", t) },
                    ]
                },
                {
                    key: "scope",
                    label: t('detail.overview.fields.scope'),
                    value: (data, contextData) => data.scope || "internal",
                    displayValue: (data) => translateFinancialScope(data.scope, t),
                    icon: "fas fa-layer-group",
                    type: "select",
                    editable: true,
                    options: [
                        { value: "client", label: translateFinancialScope("client", t) },
                        { value: "internal", label: translateFinancialScope("internal", t) },
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
                    displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.none', { defaultValue: t('detail.fallback.none', { ns: 'common', defaultValue: '—' }) }),
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
                        if (dossier) return `${dossier.lawsuitNumber} - ${dossier.title}`;
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
                                label: `${d.lawsuitNumber} - ${d.title}`
                            }))
                        ];
                    },
                    helpText: t('detail.overview.fields.dossierHelp')
                },
                {
                    key: "lawsuitId",
                    label: t('detail.overview.fields.lawsuit'),
                    value: (data, contextData) => data.lawsuitId || "",
                    displayValue: (data, contextData) => {
                        if (!data.lawsuitId) return t('detail.fallback.none');
                        const lawsuits = contextData?.lawsuits || [];
                        const caseItem = lawsuits.find(c => c.id === parseInt(data.lawsuitId));
                        if (caseItem) return `${caseItem.lawsuitNumber} - ${caseItem.title}`;
                        return data.caseReference || t('detail.fallback.none');
                    },
                    icon: "fas fa-gavel",
                    type: "searchable-select",
                    editable: true,
                    getOptions: (editedData = {}, contextData) => {
                        const dossierId = editedData?.dossierId;
                        const lawsuits = contextData?.lawsuits || [];
                        const filteredCases = dossierId
                            ? lawsuits.filter(c => c.dossierId === parseInt(dossierId))
                            : lawsuits;

                        return [
                            { value: "", label: t('detail.overview.fields.lawsuitPlaceholder') },
                            ...filteredCases.map(c => ({
                                value: c.id,
                                label: `${c.lawsuitNumber} - ${c.title}`
                            }))
                        ];
                    },
                    helpText: t('detail.overview.fields.lawsuitHelp')
                },
            ],
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
            id: "notes",
            label: t('detail.tabs.notes', { ns: 'common' }),
            icon: "fas fa-sticky-note",
            component: "notes",
            fieldKey: "notes",
            getCount: (data) => {
                if (!data.notes) return 0;
                if (Array.isArray(data.notes)) return data.notes.length;
                return 1;
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

                            {data.lawsuitId && (
                                <a
                                    href={`/lawsuits/${data.lawsuitId}`}
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

                            {!data.clientId && !data.dossierId && !data.lawsuitId && !data.officerId && (
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

// Helper component
function InfoCard({ icon, label, value, color }) {
    const colors = {
        blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
        purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
        green: "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
        red: "bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",
        amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
        orange: "bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
        slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
        indigo: "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",
        teal: "bg-teal-100 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400",
        pink: "bg-pink-100 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400",
        cyan: "bg-cyan-100 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400",
    };

    const getColorClass = (c) => {
        // Check if color is in map
        if (colors[c]) return colors[c];
        // Check if it's already a full class string (unlikely but possible)
        if (c && c.includes('bg-')) return c;
        // Fallback
        return colors.slate;
    };

    return (
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getColorClass(color)}`}>
                <i className={icon}></i>
            </div>
            <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate" title={value}>{value}</p>
            </div>
        </div>
    );
}

export default createFinancialEntryConfig;





