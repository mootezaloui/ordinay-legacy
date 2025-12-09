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
import { mockCases, mockDossiers, getStatusColor } from "../utils/mockData";

export default function Cases() {
  const navigate = useNavigate();
  
  const [cases, setCases] = useState(mockCases);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Define table columns
  const columns = [
    {
      id: "caseNumber",
      label: "N° Procès",
      sortable: true,
      locked: true,
      render: (caseItem) => (
        <span className="font-mono text-xs font-semibold text-purple-600 dark:text-purple-400">
          {caseItem.caseNumber}
        </span>
      ),
    },
    {
      id: "title",
      label: "Titre",
      sortable: true,
      render: (caseItem) => <span className="font-medium">{caseItem.title}</span>,
    },
    {
      id: "dossier",
      label: "Dossier",
      sortable: true,
      render: (caseItem) => (
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {caseItem.dossier}
        </span>
      ),
    },
    {
      id: "court",
      label: "Tribunal",
      sortable: true,
      render: (caseItem) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-landmark text-slate-500 dark:text-slate-400 text-xs"></i>
          <span className="text-sm">{caseItem.court}</span>
        </div>
      ),
    },
    {
      id: "nextHearing",
      label: "Prochaine audience",
      sortable: true,
      render: (caseItem) => <span className="font-medium">{caseItem.nextHearing}</span>,
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (caseItem) => (
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(caseItem.status)}`}>
          {caseItem.status}
        </span>
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (caseItem) => (
        <TableActions>
          <IconButton 
            icon="view" 
            variant="view" 
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(caseItem.id);
            }}
          />
          <IconButton 
            icon="edit" 
            variant="edit" 
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(caseItem);
            }}
          />
          <IconButton 
            icon="delete" 
            variant="delete" 
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(caseItem.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(cases, columns, {
    initialSortBy: "nextHearing",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["caseNumber", "title", "dossier", "court", "status"],
  });

  const handleView = (id) => {
    navigate(`/cases/${id}`);
  };

  const handleEdit = (caseItem) => {
    setEditingCase(caseItem);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce procès ?")) {
      setCases(cases.filter(c => c.id !== id));
    }
  };

  const handleAddCase = () => {
    setEditingCase(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      if (editingCase) {
        setCases(cases.map(c => 
          c.id === editingCase.id 
            ? { ...formData, id: editingCase.id }
            : c
        ));
        alert("Procès modifié avec succès!");
      } else {
        const dossier = mockDossiers.find(d => d.id === parseInt(formData.dossierId));
        const newCase = {
          ...formData,
          id: Date.now(),
          dossier: dossier ? dossier.caseNumber : "N/A",
        };
        setCases([newCase, ...cases]);
        alert("Procès ajouté avec succès!");
      }
      
      setIsModalOpen(false);
      setEditingCase(null);
    } catch (error) {
      console.error("Error submitting case:", error);
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
    
    const rows = table.allData.map(caseItem => 
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = caseItem[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );
    
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cases-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Form fields for cases
  const caseFormFields = [
    {
      name: "caseNumber",
      label: "Numéro de procès",
      type: "text",
      required: true,
      placeholder: "PROC-2024-XXX"
    },
    {
      name: "title",
      label: "Titre",
      type: "text",
      required: true,
      fullWidth: true,
      placeholder: "Ex: Audience préliminaire"
    },
    {
      name: "dossierId",
      label: "Dossier",
      type: "select",
      required: true,
      options: mockDossiers.map(d => ({
        value: d.id,
        label: `${d.caseNumber} - ${d.title}`
      }))
    },
    {
      name: "court",
      label: "Tribunal",
      type: "select",
      required: true,
      options: [
        { value: "Tribunal de première instance", label: "Tribunal de première instance" },
        { value: "Cour d'appel", label: "Cour d'appel" },
        { value: "Cour de cassation", label: "Cour de cassation" },
      ]
    },
    {
      name: "nextHearing",
      label: "Prochaine audience",
      type: "date",
      required: true,
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "En cours",
      options: [
        { value: "En cours", label: "En cours" },
        { value: "En attente", label: "En attente" },
        { value: "Terminé", label: "Terminé" },
      ]
    },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="Procès"
        subtitle={`${table.originalTotalItems} procès au total${table.isFiltering ? ` • ${table.totalItems} affichés` : ""}`}
        icon="fas fa-gavel"
        actions={
          <button
            onClick={handleAddCase}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Procès
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucun procès trouvé"}>
            {table.data.map((caseItem) => (
              <TableRow 
                key={caseItem.id}
                onClick={() => handleView(caseItem.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(caseItem) : caseItem[column.id]}
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
          setEditingCase(null);
        }}
        onSubmit={handleSubmit}
        title={editingCase ? "Modifier Procès" : "Nouveau Procès"}
        subtitle={editingCase ? "Modifier les informations du procès" : "Ajouter un nouveau procès"}
        fields={caseFormFields}
        initialData={editingCase}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}