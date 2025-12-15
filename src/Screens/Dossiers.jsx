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
import { dossierFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockDossiers, mockClients } from "../utils/mockData";
import StatCard from "../components/dashboard/StatCard";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import InlinePrioritySelector from "../components/InlineSelectors/InlinePrioritySelector";

export default function Dossiers() {
  const navigate = useNavigate();

  const [dossiers, setDossiers] = useState(mockDossiers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDossier, setEditingDossier] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Calculate stats
  const stats = {
    total: dossiers.length,
    open: dossiers.filter(d => d.status === "Ouvert").length,
    closed: dossiers.filter(d => d.status === "Fermé").length,
    highPriority: dossiers.filter(d => d.priority === "Haute").length,
  };

  // Define table columns
  const columns = [
    {
      id: "caseNumber",
      label: "Numéro",
      sortable: true,
      locked: true,
      render: (dossier) => (
        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
          {dossier.caseNumber}
        </span>
      ),
    },
    {
      id: "title",
      label: "Titre",
      sortable: true,
      render: (dossier) => <span className="font-medium">{dossier.title}</span>,
    },
    {
      id: "client",
      label: "Client",
      sortable: true,
      render: (dossier) => dossier.client,
    },
    {
      id: "category",
      label: "Catégorie",
      sortable: true,
      render: (dossier) => dossier.category,
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (dossier) => (
        <InlineStatusSelector
          value={dossier.status}
          onChange={(newStatus) => handleStatusChange(dossier.id, newStatus)}
          statusOptions={[
            { value: "Ouvert", label: "Ouvert", icon: "fas fa-folder-open", color: "text-green-600" },
            { value: "En attente", label: "En attente", icon: "fas fa-clock", color: "text-amber-600" },
            { value: "Fermé", label: "Fermé", icon: "fas fa-check-circle", color: "text-gray-600" },
            { value: "Suspendu", label: "Suspendu", icon: "fas fa-pause-circle", color: "text-red-600" },
          ]}
        />
      ),
    },
    {
      id: "openDate",
      label: "Date d'ouverture",
      sortable: true,
      render: (dossier) => dossier.openDate,
    },
    {
      id: "priority",
      label: "Priorité",
      sortable: true,
      render: (dossier) => (
        <InlinePrioritySelector
          value={dossier.priority}
          onChange={(newPriority) => handlePriorityChange(dossier.id, newPriority)}
        />
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (dossier) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(dossier.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(dossier);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(dossier.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(dossiers, columns, {
    initialSortBy: "openDate",
    initialSortDirection: "desc",
    initialItemsPerPage: 10,
    searchableFields: ["caseNumber", "title", "client", "category", "status"],
  });

  const handleView = (id) => {
    navigate(`/dossiers/${id}`);
  };

  const handleEdit = (dossier) => {
    setEditingDossier(dossier);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce dossier ?")) {
      setDossiers(dossiers.filter(d => d.id !== id));
    }
  };

  const handleStatusChange = (id, newStatus) => {
    setDossiers(dossiers.map(d =>
      d.id === id ? { ...d, status: newStatus } : d
    ));
  };

  const handlePriorityChange = (id, newPriority) => {
    setDossiers(dossiers.map(d =>
      d.id === id ? { ...d, priority: newPriority } : d
    ));
  };

  const handleAddDossier = () => {
    setEditingDossier(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingDossier) {
        setDossiers(dossiers.map(d =>
          d.id === editingDossier.id
            ? { ...formData, id: editingDossier.id }
            : d
        ));
        alert("Dossier modifié avec succès!");
      } else {
        const client = mockClients.find(c => c.id === parseInt(formData.clientId));
        const newDossier = {
          ...formData,
          id: Date.now(),
          client: client ? client.name : "Client inconnu",
        };
        setDossiers([newDossier, ...dossiers]);
        alert("Dossier ajouté avec succès!");
      }

      setIsModalOpen(false);
      setEditingDossier(null);
    } catch (error) {
      console.error("Error submitting dossier:", error);
      alert("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
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
          const value = dossier[col.id] || "";
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

  // Populate client options
  const dossierFields = dossierFormFields.map(field => {
    if (field.name === "clientId") {
      return {
        ...field,
        options: mockClients.map(client => ({
          value: client.id,
          label: client.name
        }))
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Dossiers"
        subtitle={`${table.originalTotalItems} dossiers au total${table.isFiltering ? ` • ${table.totalItems} affichés` : ""}`}
        icon="fas fa-folder-open"
        actions={
          <button
            onClick={handleAddDossier}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Dossier
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Dossiers"
          value={stats.total}
          icon="fas fa-folder-open"
          color="blue"
        />
        <StatCard
          label="Dossiers Ouverts"
          value={stats.open}
          icon="fas fa-folder"
          color="green"
        />
        <StatCard
          label="Dossiers Fermés"
          value={stats.closed}
          icon="fas fa-check-circle"
          color="amber"
        />
        <StatCard
          label="Priorité Haute"
          value={stats.highPriority}
          icon="fas fa-exclamation-triangle"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucun dossier trouvé"}>
            {table.data.map((dossier) => (
              <TableRow
                key={dossier.id}
                onClick={() => handleView(dossier.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(dossier) : dossier[column.id]}
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
          setEditingDossier(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("dossier", !!editingDossier)}
        subtitle={editingDossier ? "Modifier les informations du dossier" : "Ajouter un nouveau dossier"}
        fields={dossierFields}
        initialData={editingDossier}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}