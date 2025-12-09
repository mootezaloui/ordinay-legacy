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
import { taskFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockTasks, mockDossiers, getStatusColor } from "../utils/mockData";

export default function Tasks() {
  const navigate = useNavigate();
  
  const [tasks, setTasks] = useState(mockTasks);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const priorityIcons = {
    "Haute": "fas fa-arrow-up text-red-600 dark:text-red-400",
    "Moyenne": "fas fa-minus text-amber-600 dark:text-amber-400",
    "Basse": "fas fa-arrow-down text-green-600 dark:text-green-400",
  };

  // Define table columns
  const columns = [
    {
      id: "title",
      label: "Tâche",
      sortable: true,
      locked: true,
      render: (task) => (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={task.status === "Terminée"}
            onChange={() => handleToggleComplete(task.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
          />
          <span className={task.status === "Terminée" ? "line-through text-slate-500 dark:text-slate-400" : ""}>
            {task.title}
          </span>
        </div>
      ),
    },
    {
      id: "dossier",
      label: "Dossier",
      sortable: true,
      render: (task) => (
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {task.dossier}
        </span>
      ),
    },
    {
      id: "assignedTo",
      label: "Assigné à",
      sortable: true,
      render: (task) => task.assignedTo,
    },
    {
      id: "dueDate",
      label: "Date limite",
      sortable: true,
      render: (task) => <span className="text-sm">{task.dueDate}</span>,
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (task) => (
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
          {task.status}
        </span>
      ),
    },
    {
      id: "priority",
      label: "Priorité",
      sortable: true,
      render: (task) => (
        <div className="flex items-center gap-2">
          <i className={priorityIcons[task.priority]}></i>
          <span className="text-sm">{task.priority}</span>
        </div>
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (task) => (
        <TableActions>
          <IconButton 
            icon="view" 
            variant="view" 
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(task.id);
            }}
          />
          <IconButton 
            icon="edit" 
            variant="edit" 
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(task);
            }}
          />
          <IconButton 
            icon="delete" 
            variant="delete" 
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(task.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(tasks, columns, {
    initialSortBy: "dueDate",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["title", "dossier", "assignedTo", "status", "priority"],
  });

  const handleView = (id) => {
    navigate(`/tasks/${id}`);
    navigate(`/tasks/${id}`);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette tâche ?")) {
      setTasks(tasks.filter(t => t.id !== id));
    }
  };

  const handleToggleComplete = (id) => {
    setTasks(tasks.map(t => 
      t.id === id 
        ? { ...t, status: t.status === "Terminée" ? "En cours" : "Terminée" }
        : t
    ));
  };

  const handleAddTask = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      if (editingTask) {
        setTasks(tasks.map(t => 
          t.id === editingTask.id 
            ? { ...formData, id: editingTask.id }
            : t
        ));
        alert("Tâche modifiée avec succès!");
      } else {
        const dossier = mockDossiers.find(d => d.id === parseInt(formData.dossierId));
        const newTask = {
          ...formData,
          id: Date.now(),
          dossier: dossier ? dossier.caseNumber : "N/A",
        };
        setTasks([newTask, ...tasks]);
        alert("Tâche ajoutée avec succès!");
      }
      
      setIsModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Error submitting task:", error);
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
    
    const rows = table.allData.map(task => 
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = task[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );
    
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Populate dossier options
  const taskFields = taskFormFields.map(field => {
    if (field.name === "dossierId") {
      return {
        ...field,
        options: mockDossiers.map(dossier => ({
          value: dossier.id,
          label: `${dossier.caseNumber} - ${dossier.title}`
        }))
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Tâches"
        subtitle={`${table.originalTotalItems} tâches au total${table.isFiltering ? ` • ${table.totalItems} affichées` : ""}`}
        icon="fas fa-tasks"
        actions={
          <button
            onClick={handleAddTask}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouvelle Tâche
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucune tâche trouvée"}>
            {table.data.map((task) => (
              <TableRow 
                key={task.id}
                onClick={() => handleView(task.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(task) : task[column.id]}
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
          setEditingTask(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("task", !!editingTask)}
        subtitle={editingTask ? "Modifier la tâche" : "Ajouter une nouvelle tâche"}
        fields={taskFields}
        initialData={editingTask}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}