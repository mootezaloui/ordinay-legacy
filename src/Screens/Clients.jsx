import { useState } from "react";
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
import FormModal from "../components/FormModal/FormModal";
import StatCard from "../components/dashboard/StatCard";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import LoadingScreen from "../components/loading/LoadingScreen";
import { clientFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { useData } from "../contexts/DataContext";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation, logStatusChange } from "../services/historyService";
import { useSettings } from "../contexts/SettingsContext";

export default function Clients() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    clients,
    dossiers,
    cases,
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
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

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
      label: "Name",
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
      label: "Email",
      sortable: true,
      render: (client) => client.email,
    },
    {
      id: "phone",
      label: "Phone",
      sortable: true,
      render: (client) => client.phone,
    },
    {
      id: "status",
      label: "Status",
      sortable: true,
      render: (client) => (
        <InlineStatusSelector
          value={client.status}
          onChange={(newStatus) => handleStatusChange(client.id, client, newStatus)}
          statusOptions={[
            { value: "Active", label: "Active", icon: "fas fa-circle-check", color: "green" },
            { value: "Inactive", label: "Inactive", icon: "fas fa-circle-xmark", color: "red" },
          ]}
          entityType="client"
          entityId={client.id}
          entityData={client}
        />
      ),
    },
    {
      id: "joinDate",
      label: "Join Date",
      sortable: true,
      render: (client) => formatDate(client.joinDate),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (client) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title="View Details"
            onClick={(e) => {
              e.stopPropagation();
              handleView(client.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(client);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(client.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(clients, columns, {
    initialSortBy: "name",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["name", "email", "phone", "status"],
  });

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title="Clients" />
        {loadError && (
          <ContentSection>
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
              {loadError}
            </div>
          </ContentSection>
        )}
        <LoadingScreen variant="page" message="Loading data..." />
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
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

    if (!validationResult.allowed) {
      // Show blocker modal
      console.log('[Clients] Blocked client:', client);
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

      showToast(`Status updated to ${newStatus === 'active' ? 'Active' : 'Inactive'}`, "info", {
        title: "Client updated",
        context: "client",
      });
    } catch (error) {
      showToast("Error updating status", "error");
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
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
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
      title: "Delete Client",
      message: "Are you sure you want to delete this client?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    })) {
      try {
        const result = await deleteClient(id);

        if (!result || !result.ok) {
          console.error('[Clients.handleDelete] Delete failed with result:', result);
          showToast("Error deleting client", "error");
          return;
        }

        showToast("Client deleted", "warning", {
          title: "Deletion successful",
          context: "client",
        });
        // Redirect to clients list after deletion
        navigate("/clients");
      } catch (error) {
        console.error('[Clients.handleDelete] Delete error:', error);
        showToast("Error deleting client", "error");
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
        showToast("Error during cascade delete", "error");
        return;
      }

      showToast("Client and all related entities deleted", "success", {
        title: "Cascade deletion",
        context: "client",
      });

      setPendingDeleteId(null);
      setValidationResult(null);
      navigate("/clients");
    } catch (error) {
      console.error('[Clients.handleForceDelete] Error:', error);
      showToast("Error during cascade delete", "error");
    }
  };

  const handleAddClient = () => {
    setEditingClient(null);
    setIsModalOpen(true);
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
        showToast("Client modifié avec succès!", "success");
      } else {
        const newClient = {
          ...formData,
          joinDate: formData.joinDate || new Date().toISOString().split('T')[0],
        };
        const creation = await addClient(newClient);
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        const createdName = createdEntity?.name || formData.name;
        if (!createdId) {
          showToast("Client created, but returned ID is not available", "warning");
          return;
        }
        showToast("Client added successfully!", "success");
        logEntityCreation('client', createdId, createdName);
        const detailRoute = resolveDetailRoute('client', createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }
      setIsModalOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error("Error submitting client:", error);
      showToast("Error saving client", "error");
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
  const dynamicClientFormFields = editingClient
    ? clientFormFields.map(field => {
      if (field.name === 'status') {
        return {
          ...field,
          type: 'readonly',
          displayValue: editingClient.status,
          helpText: 'Status can only be changed via the selector in the list view.'
        };
      }
      return field;
    })
    : clientFormFields;

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

  return (
    <PageLayout>
      <PageHeader
        title="Clients"
        subtitle={`${table.originalTotalItems} clients in total${table.isFiltering ? ` • ${table.totalItems} displayed` : ""}`}
        icon="fas fa-users"
        actions={
          <button
            onClick={handleAddClient}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            New Client
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Clients"
          value={stats.total}
          icon="fas fa-users"
          color="blue"
        />
        <StatCard
          label="Active Clients"
          value={stats.active}
          icon="fas fa-user-check"
          color="green"
        />
        <StatCard
          label="Inactive Clients"
          value={stats.inactive}
          icon="fas fa-user-slash"
          color="amber"
        />
        <StatCard
          label="New This Month"
          value={stats.newThisMonth}
          icon="fas fa-user-plus"
          color="purple"
          trendLabel="since the beginning of the month"
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
        />

        <Table>
          <AdvancedTableHeader
            columns={table.columns}
            sortBy={table.sortBy}
            sortDirection={table.sortDirection}
            onSort={table.handleSort}
            onReorder={table.reorderColumns}
            enableReorder={true}
          />
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "No results found" : "No clients found"}>
            {table.data.map((client) => (
              <TableRow
                key={client.id}
                onClick={() => handleView(client.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(client) : client[column.id]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Pagination
          currentPage={table.currentPage}
          totalPages={table.totalPages}
          totalItems={table.totalItems}
          itemsPerPage={table.itemsPerPage}
          onPageChange={table.handlePageChange}
          onItemsPerPageChange={table.handleItemsPerPageChange}
        />
      </ContentSection>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingClient(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("client", !!editingClient)}
        subtitle={editingClient ? "Edit client information" : "Add a new client to your database"}
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
          blockedAction === 'delete'
            ? 'delete client'
            : blockedAction === 'changeStatus'
              ? `change status to "${blockedClient?.status === 'active' ? 'inactive' : 'active'}"`
              : blockedAction === 'edit'
                ? 'modify client'
                : 'perform action on client'
        }
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={blockedClient?.name || "Client #" + blockedClient?.id || "Client"}
        entityType="client"
        entityId={blockedClient?.id}
        action={blockedAction}
        context={{
          entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
        }}
        onUpdate={async () => {
          // Refresh data after inline action
          await loadData();
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
        actionName="confirm modification"
        impactSummary={validationResult?.impactSummary || []}
        entityName={pendingFormData?.name || editingClient?.name || ""}
      />
    </PageLayout>
  );
}
