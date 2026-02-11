import { useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useNavigate } from "react-router-dom";
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
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";
import { useTranslation } from "react-i18next";
import { useListViewMode } from "../hooks/useListViewMode";

export default function Officers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const {
    officers: rawOfficers,
    clients,
    dossiers,
    lawsuits,
    tasks,
    sessions,
    missions,
    financialEntries,
    addOfficer,
    updateOfficer,
    deleteOfficer,
    deleteOfficerCascade
  } = useData();

  // Defensive mapping: always use UI status values
  const mapOfficerStatus = (status) => {
    if (status === "inActive" || status === "inactive") return "Inactive";
    if (status === "active" || status === "Available") return "Available";
    if (status === "busy" || status === "Busy") return "Busy";
    return status;
  };
  const officers = rawOfficers.map(o => ({ ...o, status: mapOfficerStatus(o.status) }));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [viewMode, setViewMode] = useListViewMode("officers");
  const { t } = useTranslation("officers");

  const statusLabelMap = useMemo(
    () => ({
      Available: t("table.status.available"),
      Busy: t("table.status.busy"),
      Inactive: t("table.status.inactive"),
    }),
    [t]
  );

  // Define table columns
  const columns = [
    {
      id: "name",
      label: t("table.columns.name"),
      sortable: true,
      locked: true,
      render: (officer) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <i className="fas fa-balance-scale text-amber-600 dark:text-amber-400"></i>
          </div>
          <span className="font-medium">{officer.name}</span>
        </div>
      ),
    },
    {
      id: "phone",
      label: t("table.columns.phone"),
      sortable: true,
      render: (officer) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-phone text-slate-500 dark:text-slate-400 text-xs"></i>
          <span>{officer.phone}</span>
        </div>
      ),
    },
    {
      id: "email",
      label: t("table.columns.email"),
      sortable: true,
      render: (officer) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-envelope text-slate-500 dark:text-slate-400 text-xs"></i>
          <span className="text-sm">{officer.email}</span>
        </div>
      ),
    },
    {
      id: "location",
      label: t("table.columns.location"),
      sortable: true,
      render: (officer) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-map-marker-alt text-slate-500 dark:text-slate-400 text-xs"></i>
          <span>{officer.location}</span>
        </div>
      ),
    },
    {
      id: "status",
      label: t("table.columns.status"),
      sortable: true,
      render: (officer) => (
        <InlineStatusSelector
          value={officer.status}
          onChange={(newStatus) => handleStatusChange(officer.id, newStatus)}
          statusOptions={[
            { value: "Available", label: statusLabelMap["Available"], icon: "fas fa-check-circle", color: "green" },
            { value: "Busy", label: statusLabelMap["Busy"], icon: "fas fa-clock", color: "amber" },
            { value: "Inactive", label: statusLabelMap["Inactive"], icon: "fas fa-circle", color: "slate" },
          ]}
          entityType="officer"
          entityId={officer.id}
          entityData={officer}
        />
      ),
    },
    {
      id: "actions",
      label: t("table.columns.actions"),
      sortable: false,
      locked: true,
      render: (officer) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("table.actions.view")}
            onClick={(e) => {
              e.stopPropagation();
              handleView(officer.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title={t("table.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(officer);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title={t("table.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(officer.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Calculate stats
  const stats = {
    total: officers.length,
    available: officers.filter(o => o.status === "Available").length,
    busy: officers.filter(o => o.status === "Busy").length,
    inactive: officers.filter(o => o.status === "Inactive").length,
  };

  // Initialize advanced table with intelligent ordering
  // Officers: Available first, then Busy, Inactive de-emphasized
  const table = useAdvancedTable(officers, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["name", "phone", "email", "location", "status"],
    entityType: "officer",
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
    : t("table.empty");

  const headerSubtitle = table.isFiltering
    ? t("page.subtitleFiltered", {
      total: table.originalTotalItems,
      displayed: table.totalItems,
    })
    : t("page.subtitle", { total: table.originalTotalItems });

  const handleView = (id) => {
    navigate(`/officers/${id}`);
  };

  const handleEdit = (officer) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('officer', officer.id, 'edit', {
      data: officer,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (result.requiresConfirmation) {
      setValidationResult(result);
      setPendingAction({ type: "openEdit", officer });
      setConfirmImpactModalOpen(true);
      return;
    }

    setEditingOfficer(officer);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const officer = officers.find(o => o.id === id);
    const result = canPerformAction('officer', id, 'delete', {
      data: officer,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      // Store officer ID in validation result for cascade delete
      setValidationResult({ ...result, entityId: id, data: officer });
      setBlockerModalOpen(true);
      return;
    }

    if (result.requiresConfirmation) {
      setValidationResult(result);
      setPendingAction({ type: "delete", id });
      setConfirmImpactModalOpen(true);
      return;
    }

    if (await confirm({
      title: t("confirm.delete.title"),
      message: t("confirm.delete.message"),
      confirmText: t("confirm.delete.confirm"),
      cancelText: t("confirm.delete.cancel"),
      variant: "danger"
    })) {
      deleteOfficer(id);
      showToast(t("toasts.deleteSuccess.body"), "warning", {
        title: t("toasts.deleteSuccess.title"),
        context: "officer",
      });
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    await updateOfficer(id, { status: newStatus });
  };

  /**
   * Handle force delete - cascade delete officer and all related entities
   */
  const handleForceDelete = async () => {
    if (!validationResult) return;

    setBlockerModalOpen(false);

    try {
      // Extract the officer ID from the validation result
      const officerId = validationResult.entityId || validationResult.data?.id;

      if (!officerId) {
        console.error('[Officers.handleForceDelete] No officer ID found in validation result');
        showToast(t("toasts.cascadeError"), "error");
        return;
      }

      const result = await deleteOfficerCascade(officerId);

      if (!result || !result.ok) {
        console.error('[Officers.handleForceDelete] Cascade delete failed:', result);
        showToast(t("toasts.cascadeError"), "error");
        return;
      }

      showToast(t("toasts.cascadeSuccess.body"), "success", {
        title: t("toasts.cascadeSuccess.title"),
        context: "officer",
      });

      // CRITICAL: Force page reload to clear any cached mission data
      // This ensures no orphaned missions remain visible in dossier/lawsuit views
      setTimeout(() => {
        window.location.reload();
      }, 1500); // Give user time to see success toast
    } catch (error) {
      console.error('[Officers.handleForceDelete] Error during cascade delete:', error);
      showToast(t("toasts.cascadeError"), "error");
    } finally {
      setValidationResult(null);
    }
  };

  const handleAddOfficer = () => {
    setEditingOfficer(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ✅ Validate before submitting (EDIT mode only)
    if (editingOfficer) {
      const result = canPerformAction('officer', editingOfficer.id, 'edit', {
        data: editingOfficer,
        newData: formData,
        entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
      });

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
    }

    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingOfficer) {
        // For edit, you may want to implement updateOfficer from context (not shown here)
        // setOfficers(officers.map(o =>
        //   o.id === editingOfficer.id
        //     ? { ...formData, id: editingOfficer.id }
        //     : o
        // ));
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const creation = await addOfficer(formData);
        if (creation?.ok === false) {
          return;
        }
        const createdOfficer = creation?.created || creation;
        showToast(t("toasts.createSuccess"), "success");
        // ✅ Log creation event
        logEntityCreation('officer', createdOfficer.id, formData.name);

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('officer', createdOfficer.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingOfficer(null);
    } catch (error) {
      console.error("Error submitting Bailiff:", error);
      showToast(t("toasts.saveError"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const headers = table.columns
      .filter(col => col.id !== "actions")
      .map(col => col.label)
      .join(",");

    const rows = table.allData.map(officer =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = officer[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `officers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Form fields for officers (base definition)
  const officerFormFieldsBase = [
    {
      name: "name",
      label: t("form.fields.name.label"),
      type: "text",
      required: true,
      placeholder: t("form.fields.name.placeholder"),
      fullWidth: false,
    },
    {
      name: "phone",
      label: t("form.fields.phone.label"),
      type: "tel",
      required: true,
      placeholder: t("form.fields.phone.placeholder")
    },
    {
      name: "alternatePhone",
      label: t("form.fields.alternatePhone.label"),
      type: "tel",
      required: false,
      placeholder: t("form.fields.alternatePhone.placeholder")
    },
    {
      name: "email",
      label: t("form.fields.email.label"),
      type: "email",
      required: true,
      placeholder: t("form.fields.email.placeholder")
    },
    {
      name: "location",
      label: t("form.fields.location.label"),
      type: "text",
      required: true,
      placeholder: t("form.fields.location.placeholder")
    },
    {
      name: "address",
      label: t("form.fields.address.label"),
      type: "textarea",
      required: false,
      placeholder: t("form.fields.address.placeholder"),
      fullWidth: true,
      rows: 2,
    },
    {
      name: "status",
      label: t("form.fields.status.label"),
      type: "inline-status",
      required: true,
      defaultValue: "Available",
      statusOptions: [
        { value: "Available", label: statusLabelMap["Available"] || "Available", color: "green" },
        { value: "Busy", label: statusLabelMap["Busy"] || "Busy", color: "amber" },
        { value: "Inactive", label: statusLabelMap["Inactive"] || "Inactive", color: "slate" },
      ]
    },
    {
      name: "notes",
      label: t("form.fields.notes.label"),
      type: "textarea",
      required: false,
      placeholder: t("form.fields.notes.placeholder"),
      fullWidth: true,
      rows: 3,
    },
  ];

  // ✅ Apply status field protection when editing
  const officerFormFields = editingOfficer
    ? officerFormFieldsBase.map(field => {
      if (field.name === "status") {
        return {
          ...field,
          type: 'readonly',
          displayValue: statusLabelMap[editingOfficer.status] || editingOfficer.status,
          helpText: t("form.help.statusLocked")
        };
      }
      return field;
    })
    : officerFormFieldsBase;

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={headerSubtitle}
        icon="fas fa-user-tie"
        actions={
          <button
            onClick={handleAddOfficer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            {t("page.actions.new")}
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-tutorial="officers-list-container">
        <StatCard
          label={t("stats.total")}
          value={stats.total}
          icon="fas fa-user-tie"
          color="blue"
        />
        <StatCard
          label={t("stats.available")}
          value={stats.available}
          icon="fas fa-check-circle"
          color="green"
        />
        <StatCard
          label={t("stats.busy")}
          value={stats.busy}
          icon="fas fa-business-time"
          color="amber"
        />
        <StatCard
          label={t("stats.inactive")}
          value={stats.inactive}
          icon="fas fa-pause-circle"
          color="red"
        />
      </div>

      <ContentSection>
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
            onRowClick={(officer) => handleView(officer.id)}
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
            <TableBody isEmpty={displayData.length === 0} emptyMessage={tableEmptyMessage}>
              {displayData.map((officer) => (
                <TableRow
                  key={officer.id}
                  onClick={() => handleView(officer.id)}
                  emphasis={table.getItemEmphasis(officer)}
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
                      {column.render ? column.render(officer) : officer[column.id]}
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
          setEditingOfficer(null);
        }}
        onSubmit={handleSubmit}
        title={editingOfficer ? t("form.title.edit") : t("form.title.create")}
        subtitle={editingOfficer ? t("form.subtitle.edit") : t("form.subtitle.create")}
        fields={officerFormFields}
        initialData={editingOfficer}
        isLoading={isLoading}
        entityType="officer"
        entityId={editingOfficer?.id}
        editingEntity={editingOfficer}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => {
          setBlockerModalOpen(false);
          setValidationResult(null);
        }}
        actionName={t("blockerModal.actionName")}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.data?.name || t("blockerModal.entityFallback")}
        requiresForceDelete={validationResult?.requiresForceDelete || false}
        affectedEntities={validationResult?.affectedEntities || []}
        forceDeleteMessage={validationResult?.forceDeleteMessage || ""}
        onForceDelete={handleForceDelete}
      />
    </PageLayout>
  );
}


