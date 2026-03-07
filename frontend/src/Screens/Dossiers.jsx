import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { useTutorialSafe } from "../contexts/TutorialContext";
import { useData } from "../contexts/DataContext";
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
import { dossierFormFields } from "../components/FormModal/formConfigs";
import StatCard from "../components/dashboard/StatCard";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import InlinePrioritySelector from "../components/InlineSelectors/InlinePrioritySelector";
import ListPageSkeleton from "../components/skeleton/ListPageSkeleton";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";
import { useSettings } from "../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { useListViewMode } from "../hooks/useListViewMode";
import { translateCategory } from "../utils/entityTranslations";

export default function Dossiers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const tutorial = useTutorialSafe(); // Safe hook that returns null if not in provider
  const { t } = useTranslation("dossiers");
  const {
    dossiers,
    clients,
    lawsuits,
    tasks,
    sessions,
    officers,
    missions,
    financialEntries,
    addDossier,
    updateDossier,
    deleteDossier,
    deleteDossierCascade,
    loading,
    loadError
  } = useData();
  const { formatDate } = useSettings();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDossier, setEditingDossier] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [viewMode, setViewMode] = useListViewMode("dossiers");

  // Calculate stats
  const stats = {
    total: dossiers.length,
    open: dossiers.filter(d => d.status === "Open").length,
    closed: dossiers.filter(d => d.status === "Closed").length,
    highPriority: dossiers.filter(d => d.priority === "High").length,
  };

  const statusLabelMap = {
    Open: t("table.status.open"),
    "In Progress": t("table.status.inProgress"),
    "On Hold": t("table.status.onHold"),
    Closed: t("table.status.closed"),
  };

  const priorityLabelMap = {
    High: t("table.priority.high"),
    Medium: t("table.priority.medium"),
    Low: t("table.priority.low"),
  };

  // Define table columns
  const columns = [
    {
      id: "lawsuitNumber",
      label: t("table.columns.number"),
      sortable: true,
      locked: true,
      mobileRole: "meta",
      mobilePriority: 1,
      render: (dossier) => (
        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
          {dossier.lawsuitNumber}
        </span>
      ),
    },
    {
      id: "title",
      label: t("table.columns.title"),
      sortable: true,
      mobileRole: "primary",
      render: (dossier) => <span className="font-medium">{dossier.title}</span>,
    },
    {
      id: "client",
      label: t("table.columns.client"),
      sortable: true,
      render: (dossier) => dossier.client,
    },
    {
      id: "category",
      label: t("table.columns.category"),
      sortable: true,
      render: (dossier) => translateCategory(dossier.category, t),
    },
    {
      id: "status",
      label: t("table.columns.status"),
      sortable: true,
      render: (dossier) => (
        <InlineStatusSelector
          value={dossier.status}
          onChange={(newStatus) => handleStatusChange(dossier.id, newStatus)}
          statusOptions={[
            { value: "Open", label: statusLabelMap.Open, icon: "fas fa-folder-open", color: "green" },
            { value: "In Progress", label: statusLabelMap["In Progress"], icon: "fas fa-spinner", color: "blue" },
            { value: "On Hold", label: statusLabelMap["On Hold"], icon: "fas fa-pause-circle", color: "amber" },
            { value: "Closed", label: statusLabelMap.Closed, icon: "fas fa-check-circle", color: "slate" },
          ]}
          entityType="dossier"
          entityId={dossier.id}
          entityData={dossier}
        />
      ),
    },
    {
      id: "openDate",
      label: t("table.columns.openDate"),
      sortable: true,
      mobileRole: "detail",
      render: (dossier) => formatDate(dossier.openDate),
    },
    {
      id: "priority",
      label: t("table.columns.priority"),
      sortable: true,
      mobileRole: "detail",
      render: (dossier) => (
        <InlinePrioritySelector
          value={dossier.priority}
          onChange={(newPriority) => handlePriorityChange(dossier.id, newPriority)}
          entityType="dossier"
          entityId={dossier.id}
          entityData={dossier}
        />
      ),
    },
    {
      id: "actions",
      label: t("table.columns.actions"),
      sortable: false,
      locked: true,
      render: (dossier) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("table.actions.view")}
            onClick={(e) => {
              e.stopPropagation();
              handleView(dossier.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title={t("table.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(dossier);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title={t("table.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(dossier.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table with intelligent ordering
  // Dossiers: Open/High-priority first, Closed dossiers de-emphasized
  const table = useAdvancedTable(dossiers, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "desc",
    initialItemsPerPage: 10,
    searchableFields: ["lawsuitNumber", "title", "client", "category", "status"],
    entityType: "dossier",
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

  const tableEmptyMessage = table.isFiltering
    ? t("table.emptyFiltered")
    : clients.length === 0
      ? t("table.emptyNoClients")
      : t("table.empty");

  const headerSubtitle = table.isFiltering
    ? t("page.subtitleFiltered", {
      total: table.originalTotalItems,
      displayed: table.totalItems,
    })
    : t("page.subtitle", { total: table.originalTotalItems });

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title={t("page.title")} />
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


  const handleView = (id) => {
    navigate(`/dossiers/${id}`);
  };

  const handleEdit = (dossier) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('dossier', dossier.id, 'edit', {
      data: dossier,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingDossier(dossier);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const dossier = dossiers.find(d => d.id === id);
    const result = canPerformAction('dossier', id, 'delete', {
      data: dossier,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setPendingDeleteId(id);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: t("confirm.delete.title"),
      message: t("confirm.delete.message"),
      confirmText: t("confirm.delete.confirm"),
      cancelText: t("confirm.delete.cancel"),
      variant: "danger"
    })) {
      deleteDossier(id);
      showToast(t("toasts.delete.body"), "warning", {
        title: t("toasts.delete.title"),
        context: "dossier",
      });
    }
  };

  const handleForceDelete = async () => {
    if (!pendingDeleteId) return;

    setBlockerModalOpen(false);

    try {
      const result = await deleteDossierCascade(pendingDeleteId);

      if (!result || !result.ok) {
        console.error('[Dossiers.handleForceDelete] Cascade delete failed:', result);
        showToast(t("toasts.cascadeError"), "error");
        return;
      }

      showToast(t("toasts.cascadeSuccess.body"), "success", {
        title: t("toasts.cascadeSuccess.title"),
        context: "dossier",
      });

      setPendingDeleteId(null);
      setValidationResult(null);
      navigate("/dossiers");
    } catch (error) {
      console.error('[Dossiers.handleForceDelete] Error:', error);
      showToast(t("toasts.cascadeError"), "error");
    }
  };

  const handleStatusChange = (id, newStatus) => {
    updateDossier(id, { status: newStatus });
    showToast(t("toasts.statusUpdated", {
      status: statusLabelMap[newStatus] || newStatus,
    }), "info", {
      title: t("toasts.statusTitle"),
      context: "dossier",
    });
  };

  const handlePriorityChange = (id, newPriority) => {
    updateDossier(id, { priority: newPriority });
    showToast(t("toasts.priorityUpdated", {
      priority: priorityLabelMap[newPriority] || newPriority,
    }), "info", {
      title: t("toasts.priorityTitle"),
      context: "dossier",
    });
  };

  const handleAddDossier = () => {
    setEditingDossier(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ?. Validate before submitting
    if (editingDossier) {
      const result = canPerformAction('dossier', editingDossier.id, 'edit', {
        data: editingDossier,
        newData: formData,
        entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
      })

      if (!result.allowed) {
        setValidationResult(result)
        setBlockerModalOpen(true)
        return
      }

      if (result.requiresConfirmation) {
        setValidationResult(result)
        setPendingFormData(formData)
        setConfirmImpactModalOpen(true)
        return
      }
    } else {
      const result = canPerformAction('dossier', null, 'add', {
        formData,
        entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
      })
      if (!result.allowed) {
        setValidationResult(result)
        setBlockerModalOpen(true)
        return
      }
      if (result.requiresConfirmation) {
        setValidationResult(result)
        setPendingFormData(formData)
        setConfirmImpactModalOpen(true)
        return
      }
    }

    await performSave(formData)
  }

  const performSave = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingDossier) {
        updateDossier(editingDossier.id, formData);
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const creation = await addDossier(formData);
        if (creation?.ok === false) {
          return;
        }
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        const createdlawsuitNumber = createdEntity?.lawsuitNumber || createdEntity?.reference || formData.lawsuitNumber;
        if (!createdId) throw new Error(t("errors.missingId"));
        showToast(t("toasts.createSuccess"), "success");

        logEntityCreation('dossier', createdId, createdlawsuitNumber);

        // Notify tutorial that dossier was created (advances tutorial if on CREATE_DOSSIER step)
        if (tutorial?.setCreatedDossier) {
          tutorial.setCreatedDossier(createdId);
        }

        const detailRoute = resolveDetailRoute('dossier', createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingDossier(null);
    } catch (error) {
      console.error("Error submitting dossier:", error);
      showToast(t("toasts.saveError"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImpact = async () => {
    setConfirmImpactModalOpen(false);
    await performSave(pendingFormData);
    setPendingFormData(null);
  };

  const handleExport = () => {
    const headers = table.columns
      .filter(col => col.id !== "actions")
      .map(col => col.label)
      .join(",");

    const rows = table.allData.map(dossier =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = col.id === "openDate"
            ? formatDate(dossier.openDate)
            : dossier[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossiers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Populate client options and protect status field in edit mode
  const translatedDossierFormFields = dossierFormFields(t);

  const dossierFields = translatedDossierFormFields.map(field => {
    if (field.name === "clientId") {
      return {
        ...field,
        options: clients.map(client => ({
          value: client.id,
          label: client.name
        }))
      };
    }
    // Protect status field in edit mode
    if (field.name === "status" && editingDossier) {
      return {
        ...field,
        type: 'readonly',
        displayValue: editingDossier.status,
        helpText: t("form.help.statusLocked"),
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={headerSubtitle}
        icon="fas fa-folder-open"
        actions={
          <button
            onClick={handleAddDossier}
            disabled={clients.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${clients.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={clients.length === 0 ? t("actions.disabledTooltip") : ""}
            data-tutorial="add-dossier-button"
          >
            <i className="fas fa-plus"></i>
            {t("actions.new")}
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("stats.total")}
          value={stats.total}
          icon="fas fa-folder-open"
          color="blue"
        />
        <StatCard
          label={t("stats.open")}
          value={stats.open}
          icon="fas fa-folder"
          color="green"
        />
        <StatCard
          label={t("stats.closed")}
          value={stats.closed}
          icon="fas fa-check-circle"
          color="amber"
        />
        <StatCard
          label={t("stats.highPriority")}
          value={stats.highPriority}
          icon="fas fa-exclamation-triangle"
          color="red"
        />
      </div>

      <ContentSection data-tutorial="dossiers-list-container">
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
            onRowClick={(dossier) => handleView(dossier.id)}
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
              {displayData.map((dossier) => (
                <TableRow
                  key={dossier.id}
                  onClick={() => handleView(dossier.id)}
                  emphasis={table.getItemEmphasis(dossier)}
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
                      {column.render ? column.render(dossier) : dossier[column.id]}
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
          setEditingDossier(null);
        }}
        onSubmit={handleSubmit}
        title={editingDossier ? t("form.title.edit") : t("form.title.create")}
        subtitle={editingDossier ? t("form.subtitle.edit") : t("form.subtitle.create")}
        fields={dossierFields}
        initialData={editingDossier}
        isLoading={isLoading}
        entityType="dossier"
        entityId={editingDossier?.id}
        editingEntity={editingDossier}
        entities={{ clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => {
          setBlockerModalOpen(false);
          setPendingDeleteId(null);
          setValidationResult(null);
        }}
        actionName={t("blocker.action")}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.lawsuitNumber || t("blocker.entityFallback")}
        requiresForceDelete={validationResult?.requiresForceDelete || false}
        affectedEntities={validationResult?.affectedEntities || []}
        forceDeleteMessage={validationResult?.forceDeleteMessage || ""}
        onForceDelete={handleForceDelete}
      />

      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName={t("confirmImpact.action")}
        impactSummary={validationResult?.impactSummary || []}
        entityName={editingDossier?.lawsuitNumber || ""}
      />
    </PageLayout>
  );
}
