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
import { clientFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockClients } from "../utils/mockData";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation, logStatusChange } from "../services/historyService";

export default function Clients() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // Store clients in state
  const [clients, setClients] = useState(mockClients);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);

  // Calculate stats
  const stats = {
    total: clients.length,
    active: clients.filter(c => c.status === "Actif").length,
    inactive: clients.filter(c => c.status === "Inactif").length,
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
      label: "Nom",
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
      label: "Téléphone",
      sortable: true,
      render: (client) => client.phone,
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (client) => (
        <InlineStatusSelector
          value={client.status}
          onChange={(newStatus) => handleStatusChange(client.id, newStatus)}
          statusOptions={[
            { value: "Actif", label: "Actif", icon: "fas fa-circle-check", color: "green" },
            { value: "Inactif", label: "Inactif", icon: "fas fa-circle-xmark", color: "red" },
          ]}
          entityType="client"
          entityId={client.id}
          entityData={client}
        />
      ),
    },
    {
      id: "joinDate",
      label: "Date d'inscription",
      sortable: true,
      render: (client) => client.joinDate,
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
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(client.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(client);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Supprimer"
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

  const handleView = (id) => {
    navigate(`/clients/${id}`);
  };

  const handleStatusChange = (id, newStatus) => {
    setClients(clients.map(c => c.id === id ? { ...c, status: newStatus } : c));
    showToast(`Statut mis a jour: ${newStatus}`, "info", {
      title: "Client mis a jour",
      context: "client",
    });
  };

  const handleEdit = (client) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('client', client.id, 'edit', { data: client });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const client = clients.find(c => c.id === id);
    const result = canPerformAction('client', id, 'delete', { data: client });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Supprimer le client",
      message: "Êtes-vous sûr de vouloir supprimer ce client ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      setClients(clients.filter(c => c.id !== id));
      showToast("Client supprimé", "warning", {
        title: "Suppression",
        context: "client",
      });
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
        setClients(clients.map(c =>
          c.id === editingClient.id
            ? { ...formData, id: editingClient.id }
            : c
        ));
        showToast("Client modifié avec succès!", "success");
      } else {
        const newClient = {
          ...formData,
          id: Date.now(),
          joinDate: new Date().toISOString().split('T')[0],
        };

        setClients([newClient, ...clients]);
        showToast("Client ajouté avec succès!", "success");

        // ✅ Log creation event
        logEntityCreation('client', newClient.id, formData.name);

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('client', newClient.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error("Error submitting client:", error);
      showToast("Erreur lors de l'enregistrement", "error");
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
          helpText: 'Le statut ne peut être modifié que via le sélecteur dans la liste'
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
          const value = client[col.id] || "";
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
        subtitle={`${table.originalTotalItems} clients au total${table.isFiltering ? ` • ${table.totalItems} affichés` : ""}`}
        icon="fas fa-users"
        actions={
          <button
            onClick={handleAddClient}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Client
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
          label="Clients Actifs"
          value={stats.active}
          icon="fas fa-user-check"
          color="green"
        />
        <StatCard
          label="Clients Inactifs"
          value={stats.inactive}
          icon="fas fa-user-slash"
          color="amber"
        />
        <StatCard
          label="Nouveaux ce mois"
          value={stats.newThisMonth}
          icon="fas fa-user-plus"
          color="purple"
          trendLabel="depuis le début du mois"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucun client trouvé"}>
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
        subtitle={editingClient ? "Modifier les informations du client" : "Ajouter un nouveau client à votre base"}
        fields={dynamicClientFormFields}
        initialData={editingClient}
        isLoading={isLoading}
        entityType="client"
        entityId={editingClient?.id}
        editingEntity={editingClient}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Modifier/Supprimer le client"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.name || "Client"}
      />

      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName="confirmer la modification"
        impactSummary={validationResult?.impactSummary || []}
        entityName={pendingFormData?.name || editingClient?.name || ""}
      />
    </PageLayout>
  );
}
