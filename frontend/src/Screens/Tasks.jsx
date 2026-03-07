import { useMemo, useState } from "react";
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
import InlinePrioritySelector from "../components/InlineSelectors/InlinePrioritySelector";
import ListPageSkeleton from "../components/skeleton/ListPageSkeleton";
import { taskFormFields } from "../components/FormModal/formConfigs";
import { useData } from "../contexts/DataContext";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation, logHistoryEvent, EVENT_TYPES } from "../services/historyService";
import { useSettings } from "../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { useListViewMode } from "../hooks/useListViewMode";
import { translateAssignee } from "../utils/entityTranslations";

export default function Tasks() {
  // Use DataContext for global tasks and actions
  const {
    tasks,
    dossiers,
    lawsuits,
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
  const tutorial = useTutorialSafe(); // Safe hook that returns null if not in provider
  const { formatDate } = useSettings();
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation("common");

  // Removed local tasks state; use context only
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [viewMode, setViewMode] = useListViewMode("tasks");

  const statusLabelMap = useMemo(
    () => ({
      "Not Started": t("table.status.notStarted"),
      "In Progress": t("table.status.inProgress"),
      "On Hold": t("table.status.onHold"),
      "Completed": t("table.status.completed"),
      "Blocked": t("table.status.blocked"),
      "Done": t("table.status.done"),
      "Cancelled": t("table.status.cancelled"),
    }),
    [t]
  );

  const priorityLabelMap = useMemo(
    () => ({
      High: t("table.priority.high"),
      Medium: t("table.priority.medium"),
      Low: t("table.priority.low"),
    }),
    [t]
  );

  const getStatusLabel = (status) => statusLabelMap[status] || status;
  const getPriorityLabel = (priority) => priorityLabelMap[priority] || priority;

  // Calculate stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "Completed").length,
    inProgress: tasks.filter(t => t.status === "In Progress").length,
    overdue: tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate < new Date() && t.status !== "Completed";
    }).length,
  };

  const handleStatusChange = (taskId, newStatus) => {
    updateTask(taskId, { status: newStatus });
    showToast(t("toasts.statusUpdated", { status: getStatusLabel(newStatus) }), "info", {
      title: t("toasts.statusTitle"),
      context: "task",
    });
  };

  const handlePriorityChange = (taskId, newPriority) => {
    updateTask(taskId, { priority: newPriority });
    showToast(t("toasts.priorityUpdated", { priority: getPriorityLabel(newPriority) }), "info", {
      title: t("toasts.priorityTitle"),
      context: "task",
    });
  };

  // Define table columns
  const columns = [
    {
      id: "title",
      label: t("table.columns.title"),
      sortable: true,
      locked: true,
      render: (task) => (
        <div className="flex items-center gap-3">
          <span className={task.status === "Completed" ? "line-through text-slate-500 dark:text-slate-400" : ""}>
            {task.title}
          </span>
        </div>
      ),
    },
    {
      id: "parent",
      label: t("table.columns.parent"),
      sortable: true,
      render: (task) => {
        if (task.parentType === "lawsuit" && task.lawsuit) {
          return (
            <div className="flex items-center gap-1">
              <i className="fas fa-gavel text-purple-500 dark:text-purple-400 text-xs"></i>
              <span className="font-mono text-xs text-purple-600 dark:text-purple-400">
                {task.lawsuit}
              </span>
            </div>
          );
        }
        if (!task.dossier) return null;
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
      label: t("table.columns.assignedTo"),
      sortable: true,
      render: (task) => translateAssignee(task.assignedTo, t, "tasks"),
    },
    {
      id: "dueDate",
      label: t("table.columns.dueDate"),
      sortable: true,
      render: (task) => <span className="text-sm">{formatDate(task.dueDate)}</span>,
    },
    {
      id: "status",
      label: t("table.columns.status"),
      sortable: true,
      render: (task) => (
        <InlineStatusSelector
          value={task.status}
          onChange={(newStatus) => handleStatusChange(task.id, newStatus)}
          statusOptions={[
            {
              value: "Not Started",
              label: statusLabelMap["Not Started"],
              icon: "far fa-circle",
              color: "slate"
            },
            {
              value: "In Progress",
              label: statusLabelMap["In Progress"],
              icon: "fas fa-spinner",
              color: "blue"
            },
            {
              value: "Blocked",
              label: statusLabelMap["Blocked"],
              icon: "fas fa-ban",
              color: "red"
            },
            {
              value: "Done",
              label: statusLabelMap["Done"],
              icon: "fas fa-check-circle",
              color: "green"
            },
            {
              value: "Cancelled",
              label: statusLabelMap["Cancelled"],
              icon: "fas fa-times-circle",
              color: "amber"
            },
          ]}
          entityType="task"
          entityId={task.id}
          entityData={task}
        />
      ),
    },
    {
      id: "priority",
      label: t("table.columns.priority"),
      sortable: true,
      mobileRole: "detail",
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
      label: t("table.columns.actions"),
      sortable: false,
      locked: true,
      render: (task) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("table.actions.view")}
            onClick={(e) => {
              e.stopPropagation();
              handleView(task.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title={t("table.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(task);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title={t("table.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(task.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table with intelligent ordering
  // Tasks: Overdue/Blocked first, then In Progress, then by priority/due date, Completed last
  const table = useAdvancedTable(tasks, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["title", "dossier", "lawsuit", "assignedTo", "status", "priority"],
    entityType: "task",
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

  const headerSubtitle = table.isFiltering
    ? t("page.subtitleFiltered", {
      total: table.originalTotalItems,
      displayed: table.totalItems,
    })
    : t("page.subtitle", { total: table.originalTotalItems });

  const tableEmptyMessage = table.isFiltering
    ? t("table.emptyFiltered")
    : dossiers.length === 0
      ? t("table.emptyNoDossier")
      : t("table.empty");

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
    navigate(`/tasks/${id}`);
  };

  const handleEdit = (task) => {
    // ? Validate before allowing edit
    const result = canPerformAction('task', task.id, 'edit', {
      data: task,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
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
    // ? Validate before allowing delete
    const task = tasks.find(t => t.id === id);
    const result = canPerformAction('task', id, 'delete', {
      data: task,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
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
      deleteTask(id);
      showToast(t("toasts.deleteSuccess.body"), "warning", {
        title: t("toasts.deleteSuccess.title"),
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
        entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
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
        entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }
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
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const creation = await addTask(formData);
        if (creation?.ok === false) {
          return;
        }
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        if (!createdId) throw new Error(t("toasts.missingId"));
        showToast(t("toasts.createSuccess"), "success");

        logEntityCreation('task', createdId, createdEntity?.title);
        const taskTitle = createdEntity?.title || formData.title || "Task";
        const taskLabel = tCommon("detail.history.labels.taskCreated");
        const historyLabel = `${taskLabel}: ${taskTitle}`;
        if (createdEntity?.lawsuitId) {
          logHistoryEvent({
            entityType: "lawsuit",
            entityId: createdEntity.lawsuitId,
            eventType: EVENT_TYPES.RELATION,
            label: historyLabel,
            details: historyLabel,
            metadata: { childType: "task", childId: createdId },
          });
          const lawsuitItem = lawsuits.find((c) => String(c.id) === String(createdEntity.lawsuitId));
          if (lawsuitItem?.dossierId) {
            const dossierLabel = lawsuitItem.lawsuitNumber ? `${historyLabel} (${lawsuitItem.lawsuitNumber})` : historyLabel;
            logHistoryEvent({
              entityType: "dossier",
              entityId: lawsuitItem.dossierId,
              eventType: EVENT_TYPES.RELATION,
              label: dossierLabel,
              details: dossierLabel,
              metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "task", relatedId: createdId },
            });
          }
        } else if (createdEntity?.dossierId) {
          logHistoryEvent({
            entityType: "dossier",
            entityId: createdEntity.dossierId,
            eventType: EVENT_TYPES.RELATION,
            label: historyLabel,
            details: historyLabel,
            metadata: { childType: "task", childId: createdId },
          });
        }

        // Notify tutorial that task was created (advances tutorial if on CREATE_TASK step)
        if (tutorial?.setCreatedTask) {
          tutorial.setCreatedTask(createdId);
        }

        const detailRoute = resolveDetailRoute('task', createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Error submitting task:", error);
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

  const handleExport = () => {
    const headers = table.columns
      .filter(col => col.id !== "actions")
      .map(col => col.label)
      .join(",");

    const rows = table.allData.map(task =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = col.id === "dueDate"
            ? formatDate(task.dueDate)
            : task[col.id] || "";
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
  const translatedTaskFields = taskFormFields(t);

  const taskFields = translatedTaskFields.map(field => {
    if (field.name === "dossierId") {
      return {
        ...field,
        options: dossiers.map(dossier => ({
          value: dossier.id,
          label: `${dossier.lawsuitNumber} - ${dossier.title}`
        }))
      };
    }
    if (field.name === "lawsuitId") {
      return {
        ...field,
        options: lawsuits.map(cs => ({
          value: cs.id,
          label: `${cs.lawsuitNumber} - ${cs.title}`
        }))
      };
    }
    // Protect status field in edit mode
    if (field.name === "status" && editingTask) {
      return {
        ...field,
        type: 'readonly',
        displayValue: getStatusLabel(editingTask.status),
        helpText: t("form.help.statusLocked")
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={headerSubtitle}
        icon="fas fa-tasks"
        actions={
          <button
            onClick={handleAddTask}
            disabled={dossiers.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${dossiers.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={dossiers.length === 0 ? t("page.actions.newTaskDisabled") : undefined}
            data-tutorial="add-task-button"
          >
            <i className="fas fa-plus"></i>
            {t("page.actions.newTask")}
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
          label={t("stats.total")}
          value={stats.total}
          icon="fas fa-tasks"
          color="blue"
        />
        <StatCard
          label={t("stats.inProgress")}
          value={stats.inProgress}
          icon="fas fa-spinner"
          color="amber"
        />
        <StatCard
          label={t("stats.completed")}
          value={stats.completed}
          icon="fas fa-check-circle"
          color="green"
        />
        <StatCard
          label={t("stats.overdue")}
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
            onRowClick={(task) => handleView(task.id)}
            getItemEmphasis={table.getItemEmphasis}
            emptyMessage={tableEmptyMessage}
            containerRef={gridPagination.containerRef}
          />
        ) : (
          <Table>
            <AdvancedTableHeader
              columns={table.columns}
              sortBy={table.sortBy}
              sortDirection={table.sortDirection}
              onSort={table.handleSort}
              onReorder={table.reorderColumns}
              enableReorder={true}
              isEmpty={displayData.length === 0}
            />
            <TableBody isEmpty={displayData.length === 0} emptyMessage={tableEmptyMessage}>
              {displayData.map((task) => (
                <TableRow
                  key={task.id}
                  onClick={() => handleView(task.id)}
                  emphasis={table.getItemEmphasis(task)}
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
                      {column.render ? column.render(task) : task[column.id]}
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

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSubmit={handleSubmit}
        title={editingTask ? t("form.title.edit") : t("form.title.create")}
        subtitle={editingTask ? t("form.subtitle.edit") : t("form.subtitle.create")}
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
        actionName={t("blockerModal.actionName")}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.title || t("blockerModal.entityFallback")}
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
        entityName={editingTask?.title || ""}
      />
    </PageLayout>
  );
}














