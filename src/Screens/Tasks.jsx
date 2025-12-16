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
import InlinePrioritySelector from "../components/InlineSelectors/InlinePrioritySelector";
import { taskFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockTasks, mockDossiers, mockCases, getStatusColor } from "../utils/mockData";

export default function Tasks() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [tasks, setTasks] = useState(mockTasks);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Calculate stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "Terminée").length,
    inProgress: tasks.filter(t => t.status === "En cours").length,
    overdue: tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate < new Date() && t.status !== "Terminée";
    }).length,
  };

  const handleStatusChange = (taskId, newStatus) => {
    setTasks(tasks.map(t =>
      t.id === taskId
        ? { ...t, status: newStatus }
        : t
    ));
    showToast(`Statut mis a jour: ${newStatus}`, "info", {
      title: "Mise a jour du statut",
      context: "task",
    });
  };

  const handlePriorityChange = (taskId, newPriority) => {
    setTasks(tasks.map(t =>
      t.id === taskId
        ? { ...t, priority: newPriority }
        : t
    ));
    showToast(`Priorite mise a jour: ${newPriority}`, "info", {
      title: "Priorite de tache",
      context: "task",
    });
  };

  // Define table columns
  const columns = [
    {
      id: "title",
      label: "Tâche",
      sortable: true,
      locked: true,
      render: (task) => (
        <div className="flex items-center gap-3">
          <span className={task.status === "Terminée" ? "line-through text-slate-500 dark:text-slate-400" : ""}>
            {task.title}
          </span>
        </div>
      ),
    },
    {
      id: "parent",
      label: "Lié à",
      sortable: true,
      render: (task) => {
        if (task.parentType === "case" && task.case) {
          return (
            <div className="flex items-center gap-1">
              <i className="fas fa-gavel text-purple-500 dark:text-purple-400 text-xs"></i>
              <span className="font-mono text-xs text-purple-600 dark:text-purple-400">
                {task.case}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1">
            <i className="fas fa-folder-open text-blue-500 dark:text-blue-400 text-xs"></i>
            <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
              {task.dossier}
            </span>
          </div>
        );
      },
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
        <InlineStatusSelector
          value={task.status}
          onChange={(newStatus) => handleStatusChange(task.id, newStatus)}
          statusOptions={[
            { value: "Non commencée", label: "Non commencée", color: "slate" },
            { value: "En cours", label: "En cours", color: "blue" },
            { value: "En attente", label: "En attente", color: "amber" },
            { value: "Terminée", label: "Terminée", color: "green" },
          ]}
        />
      ),
    },
    {
      id: "priority",
      label: "Priorité",
      sortable: true,
      render: (task) => (
        <InlinePrioritySelector
          value={task.priority}
          onChange={(newPriority) => handlePriorityChange(task.id, newPriority)}
        />
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
    searchableFields: ["title", "dossier", "case", "assignedTo", "status", "priority"],
  });

  const handleView = (id) => {
    navigate(`/tasks/${id}`);
    navigate(`/tasks/${id}`);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (await confirm({
      title: "Supprimer la tâche",
      message: "Êtes-vous sûr de vouloir supprimer cette tâche ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      setTasks(tasks.filter(t => t.id !== id));
      showToast("Tâche supprimée", "warning", {
        title: "Suppression",
        context: "task",
      });
    }
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
        showToast("Tâche modifiée avec succès!", "success");
      } else {
        // Handle both dossier and case parent types
        const newTask = {
          ...formData,
          id: Date.now(),
          parentType: formData.parentType || "dossier",
        };

        if (formData.parentType === "case" && formData.caseId) {
          const { mockCases } = require("../utils/mockData");
          const parentCase = mockCases.find(c => c.id === parseInt(formData.caseId));
          newTask.case = parentCase ? parentCase.caseNumber : "N/A";
          newTask.caseId = formData.caseId;
          newTask.dossierId = null;
          newTask.dossier = null;
        } else if (formData.dossierId) {
          const dossier = mockDossiers.find(d => d.id === parseInt(formData.dossierId));
          newTask.dossier = dossier ? dossier.caseNumber : "N/A";
          newTask.dossierId = formData.dossierId;
          newTask.caseId = null;
          newTask.case = null;
        }

        setTasks([newTask, ...tasks]);
        showToast("Tâche ajoutée avec succès!", "success");
      }

      setIsModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Error submitting task:", error);
      showToast("Erreur lors de l'enregistrement", "error");
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Tâches"
          value={stats.total}
          icon="fas fa-tasks"
          color="blue"
        />
        <StatCard
          label="En cours"
          value={stats.inProgress}
          icon="fas fa-spinner"
          color="amber"
        />
        <StatCard
          label="Terminées"
          value={stats.completed}
          icon="fas fa-check-circle"
          color="green"
        />
        <StatCard
          label="En retard"
          value={stats.overdue}
          icon="fas fa-exclamation-circle"
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
