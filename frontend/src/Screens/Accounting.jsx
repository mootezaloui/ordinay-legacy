
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import Table from "../components/table/Table";
import AdvancedTableHeader from "../components/table/AdvancedTableHeader";
import TableBody from "../components/table/TableBody";
import TableRow from "../components/table/TableRow";
import TableCell from "../components/table/TableCell";
import TableActions, { IconButton } from "../components/table/TableActions";
import TableToolbar from "../components/table/TableToolbar";
import Pagination from "../components/table/Pagination";
import GridPagination from "../components/table/GridPagination";
import EntityGrid from "../components/table/EntityGrid";
import FormModal from "../components/FormModal/FormModal";
import { useGridPagination } from "../hooks/useGridPagination";
import StatCard from "../components/dashboard/StatCard";
import {
  getFinancialEntryFormFields,
  populateRelationshipOptions,
} from "../components/FormModal/formConfigs";
import { useData } from "../contexts/DataContext";
import {
  getFinancialEntriesForDisplay,
  getAccountingStatistics,
  formatCurrency,
} from "../utils/financialUtils";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import {
  logEntityCreation,
  logHistoryEvent,
  logStatusChange,
  EVENT_TYPES,
} from "../services/historyService";
import { useListViewMode } from "../hooks/useListViewMode";
import { useSettings } from "../contexts/SettingsContext";
import ListPageSkeleton from "../components/skeleton/ListPageSkeleton";

export default function Accounting() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    financialEntries,
    clients,
    dossiers,
    lawsuits,
    tasks,
    sessions,
    officers,
    missions,
    loading,
    loadError,
    addFinancialEntry,
    updateFinancialEntry,
    deleteFinancialEntry,
  } = useData();
  const { formatDate } = useSettings();
  const { t } = useTranslation("accounting");

  const statusLabelMap = useMemo(
    () => ({
      draft: t("table.status.draft"),
      confirmed: t("table.status.confirmed"),
      paid: t("table.status.paid"),
      cancelled: t("table.status.cancelled"),
    }),
    [t]
  );

  const typeLabelMap = useMemo(
    () => ({
      revenue: t("table.type.revenue"),
      expense: t("table.type.expense"),
    }),
    [t]
  );

  const categoryLabelMap = useMemo(
    () => ({
      honoraires: t("table.category.honoraires"),
      advance: t("table.category.advance"),
      other: t("table.category.other"),
      frais_bureau: t("table.category.frais_bureau"),
      frais_judiciaires: t("table.category.frais_judiciaires"),
      frais_huissier: t("table.category.frais_huissier"),
    }),
    [t]
  );

  const scopeLabelMap = useMemo(
    () => ({
      client: t("table.scope.client"),
      internal: t("table.scope.internal"),
      office: t("table.scope.office"),
    }),
    [t]
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterScope, setFilterScope] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [viewMode, setViewMode] = useListViewMode("accounting");

  const truncate = (text, max = 120) => {
    if (!text) return "";
    const str = String(text);
    return str.length > max ? `${str.slice(0, max).trimEnd()}...` : str;
  };

  const displayEntries = useMemo(() => {
    // Always include cancelled entries for display, but sort them last
    let filtered = getFinancialEntriesForDisplay({ includeCancelled: true }, financialEntries || []);

    if (filterScope !== "all") {
      filtered = filtered.filter((entry) => entry.scope === filterScope);
    }

    // Sort: non-cancelled first, then cancelled, preserve original order otherwise
    filtered = filtered.sort((a, b) => {
      if (a.status === "cancelled" && b.status !== "cancelled") return 1;
      if (a.status !== "cancelled" && b.status === "cancelled") return -1;
      return 0;
    });

    return filtered;
  }, [filterScope, refreshKey, financialEntries]);

  const stats = useMemo(
    () => getAccountingStatistics(financialEntries || []),
    [refreshKey, financialEntries]
  );

  const priorityItems = useMemo(() => {
    const today = new Date();
    const threeDaysFromNow = new Date(
      today.getTime() + 3 * 24 * 60 * 60 * 1000
    );

    return displayEntries
      .filter((entry) => {
        if (entry.status === "paid") return false;
        const entryDate = new Date(entry.date);
        return entryDate <= threeDaysFromNow;
      })
      .sort((a, b) => {
        const statusOrder = { draft: 0, confirmed: 1, paid: 2 };
        const statusDiff =
          (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
        if (statusDiff !== 0) return statusDiff;
        return new Date(a.date) - new Date(b.date);
      })
      .slice(0, 10);
  }, [displayEntries]);

  const statusBadgeStyles = {
    draft: { color: "amber", icon: "fas fa-hourglass-half" },
    confirmed: { color: "blue", icon: "fas fa-check-circle" },
    paid: { color: "emerald", icon: "fas fa-check-double" },
    cancelled: { color: "red", icon: "fas fa-ban" },
    default: { color: "slate", icon: "fas fa-info-circle" },
  };

  useEffect(() => {
    if (financialEntries && Array.isArray(financialEntries)) {
      setRefreshKey((k) => k + 1);
    }
  }, [financialEntries]);

  const handleView = (entry) => {
    navigate(`/accounting/${entry.id}`);
  };

  const handleEdit = (entry) => {
    const result = canPerformAction("financialEntry", entry.id, "edit", {
      data: entry,
      entities: {
        clients,
        dossiers,
        lawsuits,
        tasks,
        sessions,
        officers,
        missions,
        financialEntries,
      },
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const entry = displayEntries.find((e) => e.id === id);
    const result = canPerformAction("financialEntry", id, "delete", {
      data: entry,
      entities: {
        clients,
        dossiers,
        lawsuits,
        tasks,
        sessions,
        officers,
        missions,
        financialEntries,
      },
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    const confirmMessage = result.requiresConfirmation
      ? (result.impactSummary && result.impactSummary.length
        ? result.impactSummary.join("\n")
        : (result.warnings && result.warnings.length
          ? result.warnings.join("\n")
          : t("confirm.delete.message")))
      : t("confirm.delete.message");

    const confirmed = await confirm({
      title: t("confirm.delete.title"),
      message: confirmMessage,
      confirmText: t("confirm.delete.confirm"),
      cancelText: t("confirm.delete.cancel"),
      variant: "danger",
    });

    if (confirmed) {
      try {
        await deleteFinancialEntry(id, { skipConfirmation: true });
        showToast(t("toasts.deleteSuccess"), "warning");
        setRefreshKey((k) => k + 1);
      } catch (error) {
        showToast(t("toasts.deleteError"), "error");
      }
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    const entry = displayEntries.find((e) => e.id === id);
    const result = canPerformAction("financialEntry", id, "changeStatus", {
      data: entry,
      newValue: newStatus,
      currentValue: entry?.status,
      entities: {
        clients,
        dossiers,
        lawsuits,
        tasks,
        sessions,
        officers,
        missions,
        financialEntries,
      },
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    const oldStatus = entry?.status;
    const statusResult = await updateFinancialEntry(id, { status: newStatus });
    if (!statusResult.ok) {
      if (statusResult.result) {
        setValidationResult(statusResult.result);
        setBlockerModalOpen(true);
      }
      return;
    }
    logStatusChange("financialEntry", id, oldStatus, newStatus);
    setRefreshKey((k) => k + 1);
  };

  const columns = useMemo(
    () => [
      {
        id: "date",
        label: t("table.columns.date"),
        sortable: true,
        locked: true,
        mobileRole: "meta",
        render: (entry) => (
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {formatDate(entry.date)}
          </span>
        ),
      },
      {
        id: "description",
        label: t("table.columns.entry"),
        sortable: true,
        mobileRole: "primary",
        mobilePriority: 1,
        render: (entry) => {
          const categoryLabel =
            categoryLabelMap[entry.category] || entry.categoryLabel;
          return (
            <div className="flex flex-col max-w-md">
              <span
                className="font-medium text-slate-900 dark:text-white truncate"
                title={
                  entry.title ||
                  entry.description ||
                  t("table.fallback.untitled")
                }
              >
                {truncate(
                  entry.title ||
                  entry.description ||
                  t("table.fallback.untitled"),
                  50
                )}
              </span>
              {entry.description && entry.title && (
                <span
                  className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 truncate"
                  title={entry.description}
                >
                  {truncate(entry.description, 45)}
                </span>
              )}
              <div className="flex items-center gap-4 mt-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 mr-1`}
                >
                  {categoryLabel}
                </span>
                {entry.scope === "internal" && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300`}
                  >
                    {t("table.scope.office")}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "entityReference",
        label: t("table.columns.clientDossier"),
        sortable: true,
        mobilePriority: 2,
        render: (entry) => (
          <div className="flex flex-col text-sm">
            {entry.clientName && (
              <span className="font-medium text-slate-900 dark:text-white">
                {entry.clientName}
              </span>
            )}
            {entry.dossierReference && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {entry.dossierReference}
              </span>
            )}
            {entry.caseReference && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {entry.caseReference}
              </span>
            )}
            {!entry.clientName && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {scopeLabelMap[entry.scope] || t("table.scope.internal")}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "type",
        label: t("table.columns.type"),
        sortable: true,
        mobilePriority: 3,
        render: (entry) => (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${entry.type === "revenue"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
              }`}
          >
            {entry.type === "revenue"
              ? typeLabelMap.revenue
              : typeLabelMap.expense}
          </span>
        ),
      },
      {
        id: "amount",
        label: t("table.columns.amount"),
        sortable: true,
        mobilePriority: 4,
        render: (entry) => (
          <span
            className={`font-semibold ${entry.type === "revenue"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
              }`}
          >
            {entry.amountWithSign}
          </span>
        ),
      },
      {
        id: "status",
        label: t("table.columns.status"),
        sortable: true,
        mobileRole: "status",
        render: (entry) => (
          <InlineStatusSelector
            value={entry.status}
            onChange={(newStatus) => handleStatusChange(entry.id, newStatus)}
            statusOptions={[
              {
                value: "draft",
                label: statusLabelMap.draft,
                icon: "fas fa-file",
                color: "slate",
              },
              {
                value: "confirmed",
                label: statusLabelMap.confirmed,
                icon: "fas fa-check-circle",
                color: "blue",
              },
              {
                value: "paid",
                label: statusLabelMap.paid,
                icon: "fas fa-check-double",
                color: "green",
              },
              {
                value: "cancelled",
                label: statusLabelMap.cancelled,
                icon: "fas fa-times-circle",
                color: "red",
              },
            ]}
            entityType="financialEntry"
            entityId={entry.id}
            entityData={entry}
          />
        ),
      },
      {
        id: "actions",
        label: t("table.columns.actions"),
        sortable: false,
        locked: true,
        mobileHidden: true,
        render: (entry) => (
          <TableActions>
            <IconButton
              icon="edit"
              variant="edit"
              title={t("table.actions.edit")}
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(entry);
              }}
            />
            <IconButton
              icon="delete"
              variant="delete"
              title={t("table.actions.delete")}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(entry.id);
              }}
            />
          </TableActions>
        ),
      },
    ],
    [
      t,
      formatDate,
      categoryLabelMap,
      scopeLabelMap,
      typeLabelMap,
      statusLabelMap,
      handleStatusChange,
      handleEdit,
      handleDelete,
    ]
  );

  // Initialize advanced table with intelligent ordering
  // Financial Entries: Draft/Confirmed first (needs action), paid de-emphasized, cancelled archived
  const table = useAdvancedTable(displayEntries, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "desc",
    initialItemsPerPage: 25,
    searchableFields: [
      "description",
      "clientName",
      "dossierReference",
      "caseReference",
      "categoryLabel",
    ],
    entityType: "financial",
    enableIntelligentOrdering: true,
  });

  // Grid pagination - only used when viewMode === "grid"
  // Uses layout-aware page sizing: itemsPerPage = columns × rows
  const gridPagination = useGridPagination(table.allData, {
    cardWidth: 320,
    cardHeight: 200,
    gap: 20,
    containerPadding: 48,
  });

  // Choose pagination based on view mode
  const activePagination = viewMode === "grid" ? gridPagination : table;
  const displayData = viewMode === "grid" ? gridPagination.data : table.data;

  const headerSubtitle = table.isFiltering
    ? t("page.subtitleFiltered", {
      total: table.originalTotalItems,
      displayed: table.totalItems,
    })
    : t("page.subtitle", { total: table.originalTotalItems });

  const tableEmptyMessage = table.isFiltering
    ? t("table.emptyFiltered")
    : t("table.empty");

  const handleAddEntry = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    if (editingEntry) {
      const result = canPerformAction(
        "financialEntry",
        editingEntry.id,
        "edit",
        {
          data: editingEntry,
          newData: formData,
          entities: {
            clients,
            dossiers,
            lawsuits,
            tasks,
            sessions,
            officers,
            missions,
            financialEntries,
          },
        }
      );

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
    }

    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingEntry) {
        const previous = editingEntry;
        const updateResult = await updateFinancialEntry(
          editingEntry.id,
          formData
        );
        if (!updateResult.ok) {
          if (updateResult.result) {
            setValidationResult(updateResult.result);
            setBlockerModalOpen(true);
          }
          setIsLoading(false);
          return;
        }
        showToast(t("toasts.updateSuccess"), "success");

        const changedFields = Object.entries(formData || {}).reduce(
          (acc, [key, value]) => {
            if (previous[key] !== value) {
              acc[key] = `${previous[key] ?? ""} -> ${value ?? ""}`;
            }
            return acc;
          },
          {}
        );
        if (Object.keys(changedFields).length > 0) {
          logHistoryEvent({
            entityType: "financialEntry",
            entityId: editingEntry.id,
            eventType: EVENT_TYPES.SYSTEM,
            label: t("history.updateLabel"),
            metadata: changedFields,
          });
        }
      } else {
        const creation = await addFinancialEntry(formData);
        const createdEntry = creation?.created || creation;

        if (!creation || !creation.ok) {
          if (creation?.result) {
            setValidationResult(creation.result);
            setBlockerModalOpen(true);
          }
          setIsLoading(false);
          return;
        }

        showToast(t("toasts.createSuccess"), "success");

        logEntityCreation(
          "financialEntry",
          createdEntry.id,
          createdEntry.title ||
          createdEntry.description ||
          `${createdEntry.type} - ${formatCurrency(createdEntry.amount)}`
        );

        const detailRoute = resolveDetailRoute(
          "financialEntry",
          createdEntry.id
        );
        if (detailRoute) {
          setTimeout(
            () => navigate(detailRoute, { state: { createdEntry } }),
            100
          );
        }
      }

      setRefreshKey((k) => k + 1);
      setIsModalOpen(false);
      setEditingEntry(null);
    } catch (error) {
      console.error("Error submitting entry:", error);
      showToast(t("toasts.saveError"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const headers = table.columns
      .filter((col) => col.id !== "actions")
      .map((col) => col.label)
      .join(",");

    const rows = table.allData.map((entry) =>
      table.columns
        .filter((col) => col.id !== "actions")
        .map((col) => {
          let value = entry[col.id] || "";
          if (col.id === "date") value = formatDate(entry.date);
          if (col.id === "amount") value = entry.amount;
          if (col.id === "type") {
            value =
              entry.type === "revenue"
                ? typeLabelMap.revenue
                : typeLabelMap.expense;
          }
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = t("export.filename", { date });
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const entryFields = useMemo(
    () =>
      populateRelationshipOptions(getFinancialEntryFormFields(), {
        clients,
        dossiers,
        lawsuits,
        missions,
      }),
    [clients, dossiers, lawsuits, missions]
  );

  const localizedEntryFields = useMemo(() => {
    const scopeOptions = [
      { value: "client", label: t("form.fields.scope.options.client") },
      { value: "internal", label: t("form.fields.scope.options.internal") },
    ];
    const typeOptions = [
      { value: "revenue", label: t("form.fields.type.options.revenue") },
      { value: "expense", label: t("form.fields.type.options.expense") },
    ];
    const statusOptions = [
      { value: "draft", label: statusLabelMap.draft, color: "slate" },
      { value: "confirmed", label: statusLabelMap.confirmed, color: "blue" },
      { value: "paid", label: statusLabelMap.paid, color: "green" },
    ];

    return entryFields.map((field) => {
      if (field.name === "scope") {
        return {
          ...field,
          label: t("form.fields.scope.label"),
          options: scopeOptions,
          helpText: t("form.fields.scope.help"),
        };
      }
      if (field.name === "type") {
        return {
          ...field,
          label: t("form.fields.type.label"),
          options: typeOptions,
          helpText: t("form.fields.type.help"),
        };
      }
      if (field.name === "category") {
        const originalGetOptions = field.getOptions;
        return {
          ...field,
          label: t("form.fields.category.label"),
          placeholder: t("form.fields.category.placeholder"),
          getOptions: (formData) => {
            const options = originalGetOptions
              ? originalGetOptions(formData)
              : field.options;
            return (options || []).map((option) => ({
              ...option,
              label:
                categoryLabelMap[option.value] ||
                option.label ||
                option.value,
            }));
          },
        };
      }
      if (field.name === "amount") {
        return {
          ...field,
          label: t("form.fields.amount.label"),
          placeholder: t("form.fields.amount.placeholder"),
        };
      }
      if (field.name === "date") {
        return { ...field, label: t("form.fields.date.label") };
      }
      if (field.name === "status") {
        return {
          ...field,
          label: t("form.fields.status.label"),
          statusOptions,
        };
      }
      if (field.name === "title") {
        return {
          ...field,
          label: t("form.fields.title.label"),
          placeholder: t("form.fields.title.placeholder"),
          helpText: t("form.fields.title.help"),
        };
      }
      if (field.name === "description") {
        return {
          ...field,
          label: t("form.fields.description.label"),
          placeholder: t("form.fields.description.placeholder"),
        };
      }
      if (field.name === "clientId") {
        return {
          ...field,
          label: t("form.fields.client.label"),
          helpText: t("form.fields.client.help"),
          placeholder: t("form.fields.client.placeholder"),
        };
      }
      if (field.name === "dossierId") {
        return {
          ...field,
          label: t("form.fields.dossier.label"),
          helpText: t("form.fields.dossier.help"),
          placeholder: t("form.fields.dossier.placeholder"),
        };
      }
      if (field.name === "lawsuitId") {
        return {
          ...field,
          label: t("form.fields.lawsuit.label"),
          helpText: t("form.fields.lawsuit.help"),
          placeholder: t("form.fields.lawsuit.placeholder"),
        };
      }
      if (field.name === "missionId") {
        const originalGetOptions = field.getOptions;
        const originalOnChange = field.onChange;
        return {
          ...field,
          label: t("form.fields.mission.label"),
          helpText: t("form.fields.mission.help"),
          getOptions: (formData, allOptions) => {
            const dossierId = formData.dossierId;
            const lawsuitId = formData.lawsuitId;

            if (!allOptions?.missions) {
              return [
                { value: "", label: t("form.fields.mission.noneAvailable") },
              ];
            }

            let filteredMissions = allOptions.missions;

            if (dossierId) {
              filteredMissions = filteredMissions.filter(
                (m) =>
                  m.entityType === "dossier" &&
                  String(m.entityId) === String(dossierId)
              );
            } else if (lawsuitId) {
              filteredMissions = filteredMissions.filter(
                (m) =>
                  m.entityType === "lawsuit" &&
                  String(m.entityId) === String(lawsuitId)
              );
            } else {
              return [
                {
                  value: "",
                  label: t("form.fields.mission.selectPrerequisite"),
                },
              ];
            }

            if (filteredMissions.length === 0) {
              return [
                { value: "", label: t("form.fields.mission.noneForEntity") },
              ];
            }

            return [
              {
                value: "",
                label: t("form.fields.mission.selectMission"),
              },
              ...filteredMissions.map((m) => ({
                value: m.id,
                label: `${m.missionNumber} - ${m.title} (${m.officerName || t("form.fields.mission.fallbackOfficer")
                  }) - ${m.status}`,
              })),
            ];
          },
          onChange: (value, formData, setFormData, allOptions) => {
            if (value && allOptions?.missions) {
              const selectedMission = allOptions.missions.find(
                (m) => m.id === value
              );
              if (selectedMission && !formData.description) {
                setFormData({
                  ...formData,
                  missionId: value,
                  description: t("form.fields.mission.autoDescription", {
                    missionNumber: selectedMission.missionNumber,
                    title: selectedMission.title,
                  }),
                });
                return;
              }
            }
            if (originalOnChange) {
              originalOnChange(value, formData, setFormData, allOptions);
              return;
            }
            setFormData({
              ...formData,
              missionId: value,
            });
          },
        };
      }
      return field;
    });
  }, [entryFields, t, categoryLabelMap, statusLabelMap]);

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title={t("page.title")} icon="fas fa-calculator" />
        {loadError && (
          <ContentSection>
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
              {loadError}
            </div>
          </ContentSection>
        )}
        <ListPageSkeleton />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={headerSubtitle}
        icon="fas fa-calculator"
        actions={
          <button
            onClick={handleAddEntry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            {t("page.actions.new")}
          </button>
        }
      />

      <div data-tutorial="financial-dashboard-container" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("stats.totalRevenue")}
          value={formatCurrency(stats.totalClientRevenue)}
          icon="fas fa-arrow-down"
          color="emerald"
          trendLabel={t("stats.trend.clients")}
        />
        <StatCard
          label={t("stats.clientExpenses")}
          value={formatCurrency(stats.totalClientExpense)}
          icon="fas fa-arrow-up"
          color="blue"
          trendLabel={t("stats.trend.reimbursable")}
        />
        <StatCard
          label={t("stats.officeExpenses")}
          value={formatCurrency(stats.totalInternalExpense)}
          icon="fas fa-building"
          color="orange"
          trendLabel={t("stats.trend.internal")}
        />
        <StatCard
          label={t("stats.netBalance")}
          value={formatCurrency(stats.netProfit)}
          icon="fas fa-balance-scale"
          color={stats.netProfit >= 0 ? "green" : "red"}
          trendLabel={
            stats.netProfit >= 0
              ? t("stats.trend.positive")
              : t("stats.trend.negative")
          }
        />
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilterScope("all")}
          className={`px-4 py-2 rounded-2xl font-semibold transition-colors border ${filterScope === "all"
            ? "bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-500/30"
            : "bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/70"
            }`}
        >
          {t("filters.all")}
        </button>
        <button
          onClick={() => setFilterScope("client")}
          className={`px-4 py-2 rounded-2xl font-semibold transition-colors border ${filterScope === "client"
            ? "bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-500/30"
            : "bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/70"
            }`}
        >
          {t("filters.clients")}
        </button>
        <button
          onClick={() => setFilterScope("internal")}
          className={`px-4 py-2 rounded-2xl font-semibold transition-colors border ${filterScope === "internal"
            ? "bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-500/30"
            : "bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/70"
            }`}
        >
          {t("filters.internal")}
        </button>
      </div>

      {priorityItems.length > 0 && (
        <ContentSection
          title={t("priority.title", { count: priorityItems.length })}
        >
          <div className="p-6">
            <div className="space-y-3">
              {priorityItems.slice(0, 5).map((entry) => {
                const statusMeta =
                  statusBadgeStyles[entry.status] || statusBadgeStyles.default;
                const statusLabel =
                  statusLabelMap[entry.status] || entry.statusLabel;
                const statusHint = t(`priority.statusHints.${entry.status}`, {
                  defaultValue: '',
                });
                return (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors border-${statusMeta.color}-200 bg-${statusMeta.color}-50 dark:border-${statusMeta.color}-800 dark:bg-${statusMeta.color}-900/20`}
                    onClick={() => handleView(entry)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={`w-3 h-3 rounded-full flex-shrink-0 bg-${statusMeta.color}-500`}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className="font-medium text-slate-900 dark:text-white truncate"
                            title={
                              entry.title ||
                              entry.description ||
                              t("table.fallback.untitled")
                            }
                          >
                            {truncate(
                              entry.title ||
                              entry.description ||
                              t("table.fallback.untitled"),
                              60
                            )}
                          </div>
                          {entry.description && entry.title && (
                            <div
                              className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 truncate"
                              title={entry.description}
                            >
                              {truncate(entry.description, 55)}
                            </div>
                          )}
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                            {entry.entityReference} - {formatDate(entry.date)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right space-y-2">
                        <div
                          className={`font-semibold ${entry.type === "revenue"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                            }`}
                        >
                          {entry.amountWithSign}
                        </div>
                        <div className="flex justify-end">
                          <div
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-${statusMeta.color}-100 text-${statusMeta.color}-800 dark:bg-${statusMeta.color}-900/30 dark:text-${statusMeta.color}-200`}
                          >
                            <i className={`${statusMeta.icon} text-[11px]`} />
                            <span>{statusLabel}</span>
                            {statusHint && (
                              <span className="text-[11px] font-normal opacity-80">
                                • {statusHint}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {priorityItems.length > 5 && (
              <div className="mt-4 text-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {t("priority.more", { count: priorityItems.length - 5 })}
                </span>
              </div>
            )}
          </div>
        </ContentSection>
      )}

      <ContentSection data-tutorial="financial-entries-section">
        <TableToolbar
          searchQuery={table.searchQuery}
          onSearchChange={table.setSearchQuery}
          columns={table.allColumns}
          visibleColumns={table.visibleColumns}
          onToggleColumn={table.toggleColumnVisibility}
          onResetColumns={table.resetColumns}
          onExport={handleExport}
          totalItems={table.originalTotalItems}
          filteredItems={table.totalItems}
          isFiltering={table.isFiltering}
          sortBy={table.sortBy}
          sortDirection={table.sortDirection}
          onSort={table.handleSort}
          onResetSort={table.resetToIntelligentOrder}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {viewMode === "grid" ? (
          <EntityGrid
            data={displayData}
            columns={table.columns}
            onRowClick={(entry) => handleView(entry)}
            getItemEmphasis={table.getItemEmphasis}
            emptyMessage={tableEmptyMessage}
            containerRef={gridPagination.containerRef}
          />
        ) : (
          <Table>
            <AdvancedTableHeader
              columns={table.columns}
              sortBy={table.sortBy}
              sortDirection={table.sortDirection}
              onSort={table.handleSort}
              onReorder={table.reorderColumns}
              enableReorder={true}
              isEmpty={displayData.length === 0}
            />
            <TableBody
              isEmpty={displayData.length === 0}
              emptyMessage={tableEmptyMessage}
            >
              {displayData.map((entry) => (
                <TableRow
                  key={entry.id}
                  onClick={() => handleView(entry)}
                  emphasis={table.getItemEmphasis(entry)}
                  className="cursor-pointer"
                >
                  {table.columns.map((column) => (
                    <TableCell
                      key={column.id}
                      columnId={column.id}
                      mobileLabel={column.label}
                      mobileRole={column.mobileRole}
                      mobilePriority={column.mobilePriority}
                      mobileHidden={column.mobileHidden}
                      truncate={!['status', 'priority'].includes(column.id)}
                      adaptive={['status', 'priority'].includes(column.id)}
                    >
                      {column.render ? column.render(entry) : entry[column.id]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {viewMode === "grid" ? (
          <GridPagination
            currentPage={activePagination.currentPage}
            totalPages={activePagination.totalPages}
            totalItems={activePagination.totalItems}
            itemsPerPage={activePagination.itemsPerPage}
            onPageChange={activePagination.handlePageChange}
          />
        ) : (
          <Pagination
            currentPage={activePagination.currentPage}
            totalPages={activePagination.totalPages}
            totalItems={activePagination.totalItems}
            itemsPerPage={activePagination.itemsPerPage}
            onPageChange={activePagination.handlePageChange}
            onItemsPerPageChange={table.handleItemsPerPageChange}
          />
        )}
      </ContentSection>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(null);
        }}
        onSubmit={handleSubmit}
        title={editingEntry ? t("form.title.edit") : t("form.title.create")}
        subtitle={
          editingEntry ? t("form.subtitle.edit") : t("form.subtitle.create")
        }
        fields={localizedEntryFields}
        initialData={editingEntry}
        isLoading={isLoading}
        entityType="financialEntry"
        entityId={editingEntry?.id}
        editingEntity={editingEntry}
        entities={{ clients, dossiers, lawsuits, missions }}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName={t("blocker.action")}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={
          validationResult?.entityData?.description ||
          t("blocker.entityFallback")
        }
      />
    </PageLayout>
  );
}
