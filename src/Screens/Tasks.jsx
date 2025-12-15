import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
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
import StatCard from "../components/dashboard/StatCard";
import { taskFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockTasks, mockDossiers, mockCases, getStatusColor } from "../utils/mockData";

// Global state to track which dropdown is currently open
let currentOpenTaskStatusDropdown = null;
let currentOpenTaskPriorityDropdown = null;

/**
 * StatusDropdown - Inline status selector for tasks
 * Uses portal to render dropdown menu above all containers
 */
function StatusDropdown({ task, onStatusChange, onClick }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('task-status-dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  const statusOptions = [
    { value: "Non commencée", label: "Non commencée", icon: "fas fa-circle", color: "text-slate-500" },
    { value: "En cours", label: "En cours", icon: "fas fa-spinner", color: "text-blue-600" },
    { value: "En attente", label: "En attente", icon: "fas fa-pause-circle", color: "text-amber-600" },
    { value: "Terminée", label: "Terminée", icon: "fas fa-check-circle", color: "text-green-600" },
  ];

  const currentStatus = statusOptions.find(s => s.value === task.status) || statusOptions[0];

  const computeMenuPosition = () => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = statusOptions.length * 40 + 8;
    const menuWidth = 192;
    const viewportLeft = 8;
    const viewportRight = window.innerWidth - 8;

    const shouldPositionAbove = spaceBelow < menuHeight && rect.top > menuHeight;

    let left = rect.left;
    if (left + menuWidth > viewportRight) {
      left = rect.right - menuWidth;
    }
    if (left < viewportLeft) {
      left = viewportLeft;
    }

    const top = shouldPositionAbove
      ? rect.top - menuHeight - 4
      : rect.bottom + 4;

    return { top, left, width: rect.width };
  };

  // Update menu position when opened (sync calculation before paint)
  useLayoutEffect(() => {
    let rafId = null;

    const updatePosition = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (isOpen) {
          const pos = computeMenuPosition();
          if (pos) setMenuPosition(pos);
        }
      });
    };

    updatePosition();

    if (isOpen) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updatePosition);
        window.visualViewport.addEventListener('scroll', updatePosition);
      }

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', updatePosition);
          window.visualViewport.removeEventListener('scroll', updatePosition);
        }
      };
    }
  }, [isOpen, statusOptions.length]);

  const handleStatusClick = (e, newStatus) => {
    e.stopPropagation();
    if (newStatus !== task.status) {
      onStatusChange(task.id, newStatus);
    }
    setIsOpen(false);
    if (currentOpenTaskStatusDropdown === dropdownIdRef.current) {
      currentOpenTaskStatusDropdown = null;
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();

    // Close any other open dropdown
    if (currentOpenTaskStatusDropdown && currentOpenTaskStatusDropdown !== dropdownIdRef.current) {
      // Trigger a custom event to close other dropdowns
      window.dispatchEvent(new CustomEvent('closeAllTaskStatusDropdowns', {
        detail: { except: dropdownIdRef.current }
      }));
    }

    if (!isOpen) {
      const pos = computeMenuPosition();
      setMenuPosition(pos);
      setIsOpen(true);
      currentOpenTaskStatusDropdown = dropdownIdRef.current;
    } else {
      setIsOpen(false);
      if (currentOpenTaskStatusDropdown === dropdownIdRef.current) {
        currentOpenTaskStatusDropdown = null;
      }
    }

    if (onClick) onClick(e);
  };

  // Listen for global close event
  useEffect(() => {
    const handleCloseAll = (e) => {
      if (e.detail?.except !== dropdownIdRef.current) {
        setIsOpen(false);
      }
    };

    window.addEventListener('closeAllTaskStatusDropdowns', handleCloseAll);
    return () => window.removeEventListener('closeAllTaskStatusDropdowns', handleCloseAll);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        setIsOpen(false);
        if (currentOpenTaskStatusDropdown === dropdownIdRef.current) {
          currentOpenTaskStatusDropdown = null;
        }
      }
    };

    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 ${getStatusColor(task.status)}`}
      >
        <i className={`${currentStatus.icon} text-xs`}></i>
        <span>{currentStatus.label}</span>
        <i className="fas fa-chevron-down text-xs"></i>
      </button>

      {isOpen && menuPosition && createPortal(
        <div
          className="fixed w-48 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 py-1"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
            {statusOptions.map((status) => (
              <button
                key={status.value}
                onClick={(e) => handleStatusClick(e, status.value)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                  status.value === task.status ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <i className={`${status.icon} ${status.color} dark:${status.color} w-4`}></i>
                <span className="text-slate-900 dark:text-white">{status.label}</span>
                {status.value === task.status && (
                  <i className="fas fa-check text-blue-600 dark:text-blue-400 ml-auto text-xs"></i>
                )}
              </button>
            ))}
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * PriorityDropdown - Inline priority selector for tasks
 * Same portal pattern as StatusDropdown for consistency
 */
function PriorityDropdown({ task, onPriorityChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('task-priority-dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  const priorityOptions = [
    { value: "Haute", label: "Haute", icon: "fas fa-arrow-up", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    { value: "Moyenne", label: "Moyenne", icon: "fas fa-minus", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    { value: "Basse", label: "Basse", icon: "fas fa-arrow-down", color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  ];

  const currentPriority = priorityOptions.find(p => p.value === task.priority) || priorityOptions[1];

  const computeMenuPosition = () => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = priorityOptions.length * 40 + 8;
    const menuWidth = 176;
    const viewportLeft = 8;
    const viewportRight = window.innerWidth - 8;

    const shouldPositionAbove = spaceBelow < menuHeight && rect.top > menuHeight;

    let left = rect.left;
    if (left + menuWidth > viewportRight) {
      left = rect.right - menuWidth;
    }
    if (left < viewportLeft) {
      left = viewportLeft;
    }

    const top = shouldPositionAbove
      ? rect.top - menuHeight - 4
      : rect.bottom + 4;

    return { top, left, width: rect.width };
  };

  // Update menu position when opened (sync calculation before paint)
  useLayoutEffect(() => {
    let rafId = null;

    const updatePosition = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (isOpen) {
          const pos = computeMenuPosition();
          if (pos) setMenuPosition(pos);
        }
      });
    };

    updatePosition();

    if (isOpen) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updatePosition);
        window.visualViewport.addEventListener('scroll', updatePosition);
      }

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', updatePosition);
          window.visualViewport.removeEventListener('scroll', updatePosition);
        }
      };
    }
  }, [isOpen, priorityOptions.length]);

  const handlePriorityClick = (e, newPriority) => {
    e.stopPropagation();
    if (newPriority !== task.priority) {
      onPriorityChange(task.id, newPriority);
    }
    setIsOpen(false);
    if (currentOpenTaskPriorityDropdown === dropdownIdRef.current) {
      currentOpenTaskPriorityDropdown = null;
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();

    // Close any other open dropdown
    if (currentOpenTaskPriorityDropdown && currentOpenTaskPriorityDropdown !== dropdownIdRef.current) {
      // Trigger a custom event to close other dropdowns
      window.dispatchEvent(new CustomEvent('closeAllTaskPriorityDropdowns', {
        detail: { except: dropdownIdRef.current }
      }));
    }

    if (!isOpen) {
      const pos = computeMenuPosition();
      setMenuPosition(pos);
      setIsOpen(true);
      currentOpenTaskPriorityDropdown = dropdownIdRef.current;
    } else {
      setIsOpen(false);
      if (currentOpenTaskPriorityDropdown === dropdownIdRef.current) {
        currentOpenTaskPriorityDropdown = null;
      }
    }
  };

  // Listen for global close event
  useEffect(() => {
    const handleCloseAll = (e) => {
      if (e.detail?.except !== dropdownIdRef.current) {
        setIsOpen(false);
      }
    };

    window.addEventListener('closeAllTaskPriorityDropdowns', handleCloseAll);
    return () => window.removeEventListener('closeAllTaskPriorityDropdowns', handleCloseAll);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        setIsOpen(false);
        if (currentOpenTaskPriorityDropdown === dropdownIdRef.current) {
          currentOpenTaskPriorityDropdown = null;
        }
      }
    };

    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 ${currentPriority.bgColor}`}
      >
        <i className={`${currentPriority.icon} text-xs`}></i>
        <span>{currentPriority.label}</span>
        <i className="fas fa-chevron-down text-xs"></i>
      </button>

      {isOpen && menuPosition && createPortal(
        <div
          className="fixed w-44 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 py-1"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
            {priorityOptions.map((priority) => (
              <button
                key={priority.value}
                onClick={(e) => handlePriorityClick(e, priority.value)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                  priority.value === task.priority ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <i className={`${priority.icon} ${priority.color} w-4`}></i>
                <span className="text-slate-900 dark:text-white">{priority.label}</span>
                {priority.value === task.priority && (
                  <i className="fas fa-check text-blue-600 dark:text-blue-400 ml-auto text-xs"></i>
                )}
              </button>
            ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default function Tasks() {
  const navigate = useNavigate();

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
  };

  const handlePriorityChange = (taskId, newPriority) => {
    setTasks(tasks.map(t =>
      t.id === taskId
        ? { ...t, priority: newPriority }
        : t
    ));
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
        <StatusDropdown
          task={task}
          onStatusChange={handleStatusChange}
        />
      ),
    },
    {
      id: "priority",
      label: "Priorité",
      sortable: true,
      render: (task) => (
        <PriorityDropdown
          task={task}
          onPriorityChange={handlePriorityChange}
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

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette tâche ?")) {
      setTasks(tasks.filter(t => t.id !== id));
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
        alert("Tâche modifiée avec succès!");
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
