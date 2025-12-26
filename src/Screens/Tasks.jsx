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
import LoadingScreen from "../components/loading/LoadingScreen";
import { taskFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { useData } from "../contexts/DataContext";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";

export default function Tasks() {
  // Use DataContext for global tasks and actions
  const {
    tasks,
    dossiers,
    cases,
    clients,
    sessions,
    officers,
    missions,
    financialEntries,
    addTask,
    updateTask,
    deleteTask,
    loading,
    loadError
  } = useData();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // Removed local tasks state; use context only
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);

  const statusLabelMap = {
    "Non commencee": "Not Started",
    "En cours": "In Progress",
    "En attente": "On Hold",
    "Terminee": "Completed",
  };

  const priorityLabelMap = {
    Haute: "High",
    Moyenne: "Medium",
    Basse: "Low",
  };

  const getStatusLabel = (status) => statusLabelMap[status] || status;
  const getPriorityLabel = (priority) => priorityLabelMap[priority] || priority;

  // Calculate stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "Terminee").length,
    inProgress: tasks.filter(t => t.status === "En cours").length,
    overdue: tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate < new Date() && t.status !== "Terminee";
    }).length,
  };

  const handleStatusChange = (taskId, newStatus) => {
    updateTask(taskId, { status: newStatus });
    showToast(`Status updated: ${getStatusLabel(newStatus)}`, "info", {
      title: "Status updated",
      context: "task",
    });
  };

  const handlePriorityChange = (taskId, newPriority) => {
    updateTask(taskId, { priority: newPriority });
    showToast(`Priority updated: ${getPriorityLabel(newPriority)}`, "info", {
      title: "Task priority",
      context: "task",
    });
  };

  // Define table columns
  const columns = [
    {
      id: "title",
      label: "Task",
      sortable: true,
      locked: true,
      render: (task) => (
        <div className="flex items-center gap-3">
          <span className={task.status === "Terminee" ? "line-through text-slate-500 dark:text-slate-400" : ""}>
            {task.title}
          </span>
        </div>
      ),
    },
    {
      id: "parent",
      label: "Linked to",
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
      label: "Assigned to",
      sortable: true,
      render: (task) => task.assignedTo,
    },
    {
      id: "dueDate",
      label: "Due Date",
      sortable: true,
      render: (task) => <span className="text-sm">{task.dueDate}</span>,
    },
    {
      id: "status",
      label: "Status",
      sortable: true,
      render: (task) => (
        <InlineStatusSelector
          value={task.status}
          onChange={(newStatus) => handleStatusChange(task.id, newStatus)}
          statusOptions={[
            { value: "Non commencee", label: "Not Started", color: "slate" },
            { value: "En cours", label: "In Progress", color: "blue" },
            { value: "En attente", label: "On Hold", color: "amber" },
            { value: "Terminee", label: "Completed", color: "green" },
          ]}
          entityType="task"
          entityId={task.id}
          entityData={task}
        />
      ),
    },
    {
      id: "priority",
      label: "Priority",
      sortable: true,
      render: (task) => (
        <InlinePrioritySelector
          value={task.priority}
          onChange={(newPriority) => handlePriorityChange(task.id, newPriority)}
          entityType="task"
          entityId={task.id}
          entityData={task}
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
            title="View details"
            onClick={(e) => {
              e.stopPropagation();
              handleView(task.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(task);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Delete"
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

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title="Tasks" />
        {loadError && (
          <ContentSection>
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
              {loadError}
            </div>
          </ContentSection>
        )}
        <LoadingScreen variant="page" message="Chargement des tâches..." />
      </PageLayout>
    );
  }

  const handleView = (id) => {
    navigate(`/tasks/${id}`);
  };

  const handleEdit = (task) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('task', task.id, 'edit', {
      data: task,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const task = tasks.find(t => t.id === id);
    const result = canPerformAction('task', id, 'delete', {
      data: task,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Delete task",
      message: "Are you sure you want to delete this task?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    })) {
      deleteTask(id);
      showToast("Task deleted", "warning", {
        title: "Deleted",
        context: "task",
      });
    }
  };

  const handleAddTask = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // Validate before submitting
    if (editingTask) {
      const result = canPerformAction('task', editingTask.id, 'edit', {
        data: editingTask,
        newData: formData,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
      });

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }

      // Phase 2.5: Check if confirmation is required for relational changes
      if (result.requiresConfirmation) {
        setValidationResult(result);
        setPendingFormData(formData);
        setConfirmImpactModalOpen(true);
        return;
      }
    } else {
      const result = canPerformAction('task', null, 'add', {
        formData,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
      });
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

    // Proceed with save
    await performSave(formData);
  };

  const performSave = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingTask) {
        await updateTask(editingTask.id, formData);
        showToast("Task updated successfully!", "success");
      } else {
        const creation = await addTask(formData);
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        if (!createdId) throw new Error("Missing task identifier");
        showToast("Task added successfully!", "success");

        logEntityCreation('task', createdId, createdEntity?.title);

        const detailRoute = resolveDetailRoute('task', createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Error submitting task:", error);
      showToast("Error while saving", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImpact = async () => {
    setConfirmImpactModalOpen(false);
    await performSave(pendingFormData);
    setPendingFormData(null);
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

  // Populate dossier options and protect status field in edit mode
  const taskFields = taskFormFields.map(field => {
    if (field.name === "dossierId") {
      return {
        ...field,
        options: dossiers.map(dossier => ({
          value: dossier.id,
          label: `${dossier.caseNumber} - ${dossier.title}`
        }))
      };
    }
    if (field.name === "caseId") {
      return {
        ...field,
        options: cases.map(cs => ({
          value: cs.id,
          label: `${cs.caseNumber} - ${cs.title}`
        }))
      };
    }
    // Protect status field in edit mode
    if (field.name === "status" && editingTask) {
      return {
        ...field,
        type: 'readonly',
        displayValue: editingTask.status,
        helpText: 'Status can only be changed using the selector in the list'
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Tasks"
        subtitle={`${table.originalTotalItems} tasks in total${table.isFiltering ? ` • ${table.totalItems} displayed` : ""}`}
        icon="fas fa-tasks"
        actions={
          <button
            onClick={handleAddTask}
            disabled={dossiers.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${dossiers.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={dossiers.length === 0 ? "Ajoutez d'abord un dossier avant de créer une tâche." : ""}
          >
            <i className="fas fa-plus"></i>
            New Task
          </button>
        }
      />
      {loadError && (
        <ContentSection>
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
            {loadError}
          </div>
        </ContentSection>
      )}
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Tasks"
          value={stats.total}
          icon="fas fa-tasks"
          color="blue"
        />
        <StatCard
          label="In Progress"
          value={stats.inProgress}
          icon="fas fa-spinner"
          color="amber"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          icon="fas fa-check-circle"
          color="green"
        />
        <StatCard
          label="Overdue"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "No results found" : dossiers.length === 0 ? "Ajoutez d'abord un dossier avant de créer une tâche." : "No tasks found"}>
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
        subtitle={editingTask ? "Edit task" : "Add a new task"}
        fields={taskFields}
        initialData={editingTask}
        isLoading={isLoading}
        entityType="task"
        entityId={editingTask?.id}
        editingEntity={editingTask}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Edit/Delete task"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.title || "Task"}
      />

      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName="change task linkage"
        impactSummary={validationResult?.impactSummary || []}
        entityName={editingTask?.title || ""}
      />
    </PageLayout>
  );
}
