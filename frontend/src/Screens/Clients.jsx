import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { useTutorialSafe } from "../contexts/TutorialContext";
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
import ListPageSkeleton from "../components/skeleton/ListPageSkeleton";
import { clientFormFields } from "../components/FormModal/formConfigs";
import { useData } from "../contexts/DataContext";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import LegacyImportModal from "../components/ui/LegacyImportModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation, logStatusChange } from "../services/historyService";
import { useSettings } from "../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { useListViewMode } from "../hooks/useListViewMode";

export default function Clients() {
  const navigate = useNavigate();
  const { t } = useTranslation("clients");
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const tutorial = useTutorialSafe(); // Safe hook that returns null if not in provider
  const {
    clients,
    dossiers,
    lawsuits,
    tasks,
    sessions,
    officers,
    missions,
    financialEntries,
    addClient,
    updateClient,
    deleteClient,
    deleteClientCascade,
    loading,
    loadError
  } = useData();
  const { formatDate } = useSettings();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [blockedClient, setBlockedClient] = useState(null);
  const [blockedAction, setBlockedAction] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [viewMode, setViewMode] = useListViewMode("clients");

  // Calculate stats
  const stats = {
    total: clients.length,
    active: clients.filter(c => c.status === "Active").length,
    inactive: clients.filter(c => c.status === "Inactive").length,
    newThisMonth: clients.filter(c => {
      const joinDate = new Date(c.joinDate);
      const now = new Date();
      return joinDate.getMonth() === now.getMonth() && joinDate.getFullYear() === now.getFullYear();
    }).length,
  };

  // Define table columns
  const columns = [
    {
      id: "name",
      label: t("table.columns.name"),
      sortable: true,
      locked: true,
      render: (client) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              {client.name.charAt(0)}
            </span>
          </div>
          <span className="font-medium">{client.name}</span>
        </div>
      ),
    },
    {
      id: "email",
      label: t("table.columns.email"),
      sortable: true,
      render: (client) => client.email,
    },
    {
      id: "phone",
      label: t("table.columns.phone"),
      sortable: true,
      render: (client) => client.phone,
    },
    {
      id: "status",
      label: t("table.columns.status"),
      sortable: true,
      render: (client) => (
        <InlineStatusSelector
          value={client.status}
          onChange={(newStatus) => handleStatusChange(client.id, client, newStatus)}
          statusOptions={[
            { value: "Active", label: t("table.status.active"), icon: "fas fa-circle-check", color: "green" },
            { value: "Inactive", label: t("table.status.inactive"), icon: "fas fa-circle-xmark", color: "red" },
          ]}
          entityType="client"
          entityId={client.id}
          entityData={client}
        />
      ),
    },
    {
      id: "joinDate",
      label: t("table.columns.joinDate"),
      sortable: true,
      render: (client) => formatDate(client.joinDate),
    },
    {
      id: "actions",
      label: t("table.columns.actions"),
      sortable: false,
      locked: true,
      render: (client) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("table.actions.view")}
            onClick={(e) => {
              e.stopPropagation();
              handleView(client.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title={t("table.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(client);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title={t("table.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(client.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table with intelligent ordering
  // Clients: Active clients appear first, inactive clients are de-emphasized
  const table = useAdvancedTable(clients, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["name", "email", "phone", "status"],
    entityType: "client",
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
    navigate(`/clients/${id}`);
  };

  const handleStatusChange = async (id, client, newStatus) => {
    // ✅ Validate with domain rules before allowing status change
    const validationResult = canPerformAction('client', id, 'edit', {
      data: client,
      newData: { ...client, status: newStatus },
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
    });

    if (!validationResult.allowed) {
      // Show blocker modal
      setValidationResult(validationResult);
      setBlockedClient(client);
      setBlockedAction('changeStatus');
      setBlockerModalOpen(true);
      return;
    }

    try {
      const oldStatus = client.status;
      await updateClient(id, { status: newStatus });

      // Log status change
      logStatusChange('client', id, oldStatus, newStatus);

      showToast(
        t("toasts.statusUpdated", {
          status:
            newStatus === 'active'
              ? t("table.status.active")
              : t("table.status.inactive"),
        }),
        "info",
        {
          title: t("toasts.clientUpdated"),
          context: "client",
        }
      );
    } catch (error) {
      showToast(t("toasts.statusError"), "error");
    }
  };

  const handleEdit = (client) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('client', client.id, 'edit', { data: client });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockedClient(client);
      setBlockedAction('edit');
      setBlockerModalOpen(true);
      return;
    }

    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const client = clients.find(c => c.id === id);
    const result = canPerformAction('client', id, 'delete', {
      data: client,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockedClient(client);
      setBlockedAction('delete');
      setPendingDeleteId(id); // Store ID for force delete
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
      try {
        const result = await deleteClient(id);

        if (!result || !result.ok) {
          console.error('[Clients.handleDelete] Delete failed with result:', result);
          showToast(t("toasts.deleteError"), "error");
          return;
        }

        showToast(t("toasts.deleteSuccess.body"), "warning", {
          title: t("toasts.deleteSuccess.title"),
          context: "client",
        });
        // Redirect to clients list after deletion
        navigate("/clients");
      } catch (error) {
        console.error('[Clients.handleDelete] Delete error:', error);
        showToast(t("toasts.deleteError"), "error");
      }
    }
  };

  /**
   * Handle force delete - cascade delete client and all related entities
   */
  const handleForceDelete = async () => {
    if (!pendingDeleteId) return;

    setBlockerModalOpen(false);

    try {
      const result = await deleteClientCascade(pendingDeleteId);

      if (!result || !result.ok) {
        console.error('[Clients.handleForceDelete] Cascade delete failed:', result);
        showToast(t("toasts.cascadeError"), "error");
        return;
      }

      showToast(t("toasts.cascadeSuccess.body"), "success", {
        title: t("toasts.cascadeSuccess.title"),
        context: "client",
      });

      setPendingDeleteId(null);
      setValidationResult(null);
      navigate("/clients");
    } catch (error) {
      console.error('[Clients.handleForceDelete] Error:', error);
      showToast(t("toasts.cascadeError"), "error");
    }
  };

  const handleAddClient = () => {
    setEditingClient(null);
    setIsModalOpen(true);

    // Tell tutorial to hide overlay while modal is open
    if (tutorial?.setWaitingForAction && tutorial?.currentStep?.id === "create-client") {
      tutorial.setWaitingForAction(true);
    }
  };

  const handleSubmit = async (formData) => {
    // ?. Validate before submitting
    if (editingClient) {
      const result = canPerformAction('client', editingClient.id, 'edit', {
        data: editingClient,
        newData: formData
      });

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
    } else {
      const result = canPerformAction('client', null, 'add', { formData });
      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
      if (result.requiresConfirmation) {
        setValidationResult(result);
        setPendingFormData(formData);
        setConfirmImpactModalOpen(true);
        return;
      }
    }

    await performSave(formData);
  };

  const performSave = async (formData) => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (editingClient) {
        await updateClient(editingClient.id, formData);
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const newClient = {
          ...formData,
          joinDate: formData.joinDate || new Date().toISOString().split('T')[0],
        };
        const creation = await addClient(newClient);
        if (creation?.ok === false) {
          return;
        }
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        const createdName = createdEntity?.name || formData.name;
        if (!createdId) {
          showToast(t("toasts.createMissingId"), "warning");
          return;
        }
        showToast(t("toasts.createSuccess"), "success");
        logEntityCreation('client', createdId, createdName);

        // Notify tutorial that client was created (advances tutorial if on CREATE_CLIENT step)
        if (tutorial?.setCreatedClient) {
          tutorial.setCreatedClient(createdId);
        }

        const detailRoute = resolveDetailRoute('client', createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }
      setIsModalOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error("Error submitting client:", error);
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

  // Dynamic form fields - disable status field in edit mode to prevent bypassing domain rules
  const translatedClientFormFields = clientFormFields(t);

  const dynamicClientFormFields = editingClient
    ? translatedClientFormFields.map(field => {
      if (field.name === 'status') {
        return {
          ...field,
          type: 'readonly',
          displayValue: editingClient.status,
          helpText: t("form.help.statusLocked"),
        };
      }
      return field;
    })
    : translatedClientFormFields;

  const handleExport = () => {
    const headers = table.columns
      .filter(col => col.id !== "actions")
      .map(col => col.label)
      .join(",");

    const rows = table.allData.map(client =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = col.id === "joinDate"
            ? formatDate(client.joinDate)
            : client[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const tableEmptyMessage = table.isFiltering
    ? t("table.emptyFiltered")
    : t("table.empty");

  const headerSubtitle = table.isFiltering
    ? t("page.subtitleFiltered", {
      total: table.originalTotalItems,
      displayed: table.totalItems,
    })
    : t("page.subtitle", { total: table.originalTotalItems });

  const nextStatusLabel =
    blockedClient?.status === 'active'
      ? t("table.status.inactive")
      : t("table.status.active");

  const blockerActionName =
    blockedAction === 'delete'
      ? t("blockerModal.actions.delete")
      : blockedAction === 'changeStatus'
        ? t("blockerModal.actions.changeStatus", { status: nextStatusLabel })
        : blockedAction === 'edit'
          ? t("blockerModal.actions.edit")
          : t("blockerModal.actions.default");

  const blockerEntityName = blockedClient?.name
    || (blockedClient?.id ? t("blockerModal.entityWithId", { id: blockedClient.id }) : t("blockerModal.entityGeneric"));

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={headerSubtitle}
        icon="fas fa-users"
        actions={
          <button
            onClick={handleAddClient}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            data-tutorial="add-client-button"
          >
            <i className="fas fa-plus"></i>
            {t("page.actions.newClient")}
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("stats.total")}
          value={stats.total}
          icon="fas fa-users"
          color="blue"
        />
        <StatCard
          label={t("stats.active")}
          value={stats.active}
          icon="fas fa-user-check"
          color="green"
        />
        <StatCard
          label={t("stats.inactive")}
          value={stats.inactive}
          icon="fas fa-user-slash"
          color="amber"
        />
        <StatCard
          label={t("stats.newThisMonth")}
          value={stats.newThisMonth}
          icon="fas fa-user-plus"
          color="purple"
          trendLabel={t("stats.newThisMonthTrend")}
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
          onImport={() => setImportModalOpen(true)}
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
            onRowClick={(client) => handleView(client.id)}
            getItemEmphasis={table.getItemEmphasis}
            emptyMessage={tableEmptyMessage}
            containerRef={gridPagination.containerRef}
          />
        ) : (
          <Table>
            {displayData.length > 0 && (
              <AdvancedTableHeader
                columns={table.columns}
                sortBy={table.sortBy}
                sortDirection={table.sortDirection}
                onSort={table.handleSort}
                onReorder={table.reorderColumns}
                enableReorder={true}
              />
            )}
            <TableBody
              isEmpty={displayData.length === 0}
              emptyMessage={tableEmptyMessage}
            >
              {displayData.map((client) => (
                <TableRow
                  key={client.id}
                  onClick={() => handleView(client.id)}
                  emphasis={table.getItemEmphasis(client)}
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
                      {column.render ? column.render(client) : client[column.id]}
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

      <LegacyImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        entityType="client"
        entityLabel={t("page.title")}
        onImported={() => window.location.reload()}
      />

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingClient(null);
          // Reset tutorial waiting state if modal closed without action
          if (tutorial?.setWaitingForAction) {
            tutorial.setWaitingForAction(false);
          }
        }}
        onSubmit={handleSubmit}
        title={editingClient ? t("form.title.edit") : t("form.title.create")}
        subtitle={
          editingClient
            ? t("form.subtitle.edit")
            : t("form.subtitle.create")
        }
        fields={dynamicClientFormFields}
        initialData={editingClient}
        isLoading={isLoading}
        entityType="client"
        entityId={editingClient?.id}
        editingEntity={editingClient}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => {
          setBlockerModalOpen(false);
          setPendingDeleteId(null);
          setValidationResult(null);
          setBlockedClient(null);
          setBlockedAction(null);
        }}
        actionName={
          blockerActionName
        }
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={blockerEntityName}
        entityType="client"
        entityId={blockedClient?.id}
        action={blockedAction}
        context={{
          entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
        }}
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
        entityName={pendingFormData?.name || editingClient?.name || ""}
      />
    </PageLayout>
  );
}
