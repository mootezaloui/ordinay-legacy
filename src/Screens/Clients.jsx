import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
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
import { clientFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockClients, getStatusColor } from "../utils/mockData";

export default function Clients() {
  const navigate = useNavigate();
  
  // Store clients in state
  const [clients, setClients] = useState(mockClients);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Define table columns
  const columns = [
    {
      id: "name",
      label: "Nom",
      sortable: true,
      locked: true, // Can't be hidden
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
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(client.status)}`}>
          {client.status}
        </span>
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
      locked: true, // Can't be hidden
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

  // Navigate to client detail
  const handleView = (id) => {
    navigate(`/clients/${id}`);
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
      setClients(clients.filter(c => c.id !== id));
    }
  };

  const handleAddClient = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      if (editingClient) {
        // UPDATE
        setClients(clients.map(c => 
          c.id === editingClient.id 
            ? { ...formData, id: editingClient.id }
            : c
        ));
        alert("Client modifié avec succès!");
      } else {
        // ADD
        const newClient = {
          ...formData,
          id: Date.now(),
          joinDate: new Date().toISOString().split('T')[0],
        };
        
        setClients([newClient, ...clients]);
        alert("Client ajouté avec succès!");
      }
      
      setIsModalOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error("Error submitting client:", error);
      alert("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  // Export to CSV
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

      <ContentSection>
        {/* Table Toolbar */}
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

        {/* Table */}
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

        {/* Pagination */}
        <Pagination
          currentPage={table.currentPage}
          totalPages={table.totalPages}
          totalItems={table.totalItems}
          itemsPerPage={table.itemsPerPage}
          onPageChange={table.handlePageChange}
          onItemsPerPageChange={table.handleItemsPerPageChange}
        />
      </ContentSection>

      {/* Add/Edit Modal */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingClient(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("client", !!editingClient)}
        subtitle={editingClient ? "Modifier les informations du client" : "Ajouter un nouveau client à votre base"}
        fields={clientFormFields}
        initialData={editingClient}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}