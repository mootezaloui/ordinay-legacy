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
import { mockOfficers, getStatusColor } from "../utils/mockData";

export default function Officers() {
  const navigate = useNavigate();
  
  const [officers, setOfficers] = useState(mockOfficers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Define table columns
  const columns = [
    {
      id: "name",
      label: "Nom",
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
      id: "specialization",
      label: "Spécialisation",
      sortable: true,
      render: (officer) => (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {officer.specialization}
        </span>
      ),
    },
    {
      id: "phone",
      label: "Téléphone",
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
      label: "Email",
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
      label: "Localisation",
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
      label: "Statut",
      sortable: true,
      render: (officer) => (
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(officer.status)}`}>
          {officer.status}
        </span>
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (officer) => (
        <TableActions>
          <IconButton 
            icon="view" 
            variant="view" 
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(officer.id);
            }}
          />
          <IconButton 
            icon="edit" 
            variant="edit" 
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(officer);
            }}
          />
          <IconButton 
            icon="delete" 
            variant="delete" 
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(officer.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(officers, columns, {
    initialSortBy: "name",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["name", "specialization", "phone", "email", "location", "status"],
  });

  const handleView = (id) => {
    navigate(`/officers/${id}`);
  };

  const handleEdit = (officer) => {
    setEditingOfficer(officer);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet huissier ?")) {
      setOfficers(officers.filter(o => o.id !== id));
    }
  };

  const handleAddOfficer = () => {
    setEditingOfficer(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      if (editingOfficer) {
        setOfficers(officers.map(o => 
          o.id === editingOfficer.id 
            ? { ...formData, id: editingOfficer.id }
            : o
        ));
        alert("Huissier modifié avec succès!");
      } else {
        const newOfficer = {
          ...formData,
          id: Date.now(),
        };
        setOfficers([newOfficer, ...officers]);
        alert("Huissier ajouté avec succès!");
      }
      
      setIsModalOpen(false);
      setEditingOfficer(null);
    } catch (error) {
      console.error("Error submitting officer:", error);
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

  // Form fields for officers
  const officerFormFields = [
    {
      name: "name",
      label: "Nom complet",
      type: "text",
      required: true,
      placeholder: "Ex: Me. Ahmed Ben Salem"
    },
    {
      name: "specialization",
      label: "Spécialisation",
      type: "select",
      required: true,
      options: [
        { value: "Exécution", label: "Exécution" },
        { value: "Recouvrement", label: "Recouvrement" },
        { value: "Constat", label: "Constat" },
        { value: "Signification", label: "Signification" },
      ]
    },
    {
      name: "phone",
      label: "Téléphone",
      type: "tel",
      required: true,
      placeholder: "+216 98 123 456"
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "email@exemple.com"
    },
    {
      name: "location",
      label: "Localisation",
      type: "text",
      required: true,
      placeholder: "Ex: Tunis"
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "Disponible",
      options: [
        { value: "Disponible", label: "Disponible" },
        { value: "Occupé", label: "Occupé" },
        { value: "Inactif", label: "Inactif" },
      ]
    },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="Huissiers de Justice"
        subtitle={`${table.originalTotalItems} huissiers au total${table.isFiltering ? ` • ${table.totalItems} affichés` : ""}`}
        icon="fas fa-user-tie"
        actions={
          <button
            onClick={handleAddOfficer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Huissier
          </button>
        }
      />

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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucun huissier trouvé"}>
            {table.data.map((officer) => (
              <TableRow 
                key={officer.id}
                onClick={() => handleView(officer.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(officer) : officer[column.id]}
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
          setEditingOfficer(null);
        }}
        onSubmit={handleSubmit}
        title={editingOfficer ? "Modifier Huissier" : "Nouveau Huissier"}
        subtitle={editingOfficer ? "Modifier les informations de l'huissier" : "Ajouter un nouvel huissier"}
        fields={officerFormFields}
        initialData={editingOfficer}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}