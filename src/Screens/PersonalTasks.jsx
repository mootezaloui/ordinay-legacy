import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { useData } from "../contexts/DataContext";
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
import { getStatusColor, mockPersonalTasks } from "../utils/mockData";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";

// Global state to track which dropdown is currently open
let currentOpenPersonalTaskStatusDropdown = null;
let currentOpenPersonalTaskPriorityDropdown = null;

/**
 * Personal Tasks - For non-legal, personal/administrative tasks
 * Examples: Pay bills, personal errands, office supplies, etc.
 * NOT related to dossiers or clients
 */

/**
 * StatusDropdown - Inline status selector for personal tasks
 * Uses portal to render dropdown menu above all containers
 */
function StatusDropdown({ task, onStatusChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('personal-task-status-dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  const statusOptions = [
    { value: "Non commencée", label: "Non commencée", icon: "fas fa-circle", color: "text-slate-500" },
    { value: "En attente", label: "En attente", icon: "fas fa-pause-circle", color: "text-amber-600" },
    { value: "En cours", label: "En cours", icon: "fas fa-spinner", color: "text-blue-600" },
    { value: "Planifiée", label: "Planifiée", icon: "fas fa-calendar-check", color: "text-purple-600" },
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
    if (currentOpenPersonalTaskStatusDropdown === dropdownIdRef.current) {
      currentOpenPersonalTaskStatusDropdown = null;
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();

    // Close any other open dropdown
    if (currentOpenPersonalTaskStatusDropdown && currentOpenPersonalTaskStatusDropdown !== dropdownIdRef.current) {
      // Trigger a custom event to close other dropdowns
      window.dispatchEvent(new CustomEvent('closeAllPersonalTaskStatusDropdowns', {
        detail: { except: dropdownIdRef.current }
      }));
    }

    if (!isOpen) {
      const pos = computeMenuPosition();
      setMenuPosition(pos);
      setIsOpen(true);
      currentOpenPersonalTaskStatusDropdown = dropdownIdRef.current;
    } else {
      setIsOpen(false);
      if (currentOpenPersonalTaskStatusDropdown === dropdownIdRef.current) {
        currentOpenPersonalTaskStatusDropdown = null;
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

    window.addEventListener('closeAllPersonalTaskStatusDropdowns', handleCloseAll);
    return () => window.removeEventListener('closeAllPersonalTaskStatusDropdowns', handleCloseAll);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        setIsOpen(false);
        if (currentOpenPersonalTaskStatusDropdown === dropdownIdRef.current) {
          currentOpenPersonalTaskStatusDropdown = null;
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
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${status.value === task.status ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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
 * PriorityDropdown - Inline priority selector for personal tasks
 */
function PriorityDropdown({ task, onPriorityChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('personal-task-priority-dropdown'));
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
    if (currentOpenPersonalTaskPriorityDropdown === dropdownIdRef.current) {
      currentOpenPersonalTaskPriorityDropdown = null;
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();

    // Close any other open dropdown
    if (currentOpenPersonalTaskPriorityDropdown && currentOpenPersonalTaskPriorityDropdown !== dropdownIdRef.current) {
      // Trigger a custom event to close other dropdowns
      window.dispatchEvent(new CustomEvent('closeAllPersonalTaskPriorityDropdowns', {
        detail: { except: dropdownIdRef.current }
      }));
    }

    if (!isOpen) {
      const pos = computeMenuPosition();
      setMenuPosition(pos);
      setIsOpen(true);
      currentOpenPersonalTaskPriorityDropdown = dropdownIdRef.current;
    } else {
      setIsOpen(false);
      if (currentOpenPersonalTaskPriorityDropdown === dropdownIdRef.current) {
        currentOpenPersonalTaskPriorityDropdown = null;
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

    window.addEventListener('closeAllPersonalTaskPriorityDropdowns', handleCloseAll);
    return () => window.removeEventListener('closeAllPersonalTaskPriorityDropdowns', handleCloseAll);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        setIsOpen(false);
        if (currentOpenPersonalTaskPriorityDropdown === dropdownIdRef.current) {
          currentOpenPersonalTaskPriorityDropdown = null;
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
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${priority.value === task.priority ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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

export default function PersonalTasks() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { personalTasks, addPersonalTask, updatePersonalTask, deletePersonalTask } = useData();

  const tasks = personalTasks;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const priorityConfig = {
    "Haute": {
      icon: "fas fa-arrow-up",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    },
    "Moyenne": {
      icon: "fas fa-minus",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    },
    "Basse": {
      icon: "fas fa-arrow-down",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    },
  };

  const categoryIcons = {
    "Factures": "fas fa-file-invoice-dollar text-green-600 dark:text-green-400",
    "Bureau": "fas fa-briefcase text-blue-600 dark:text-blue-400",
    "Personnel": "fas fa-user text-purple-600 dark:text-purple-400",
    "Informatique": "fas fa-laptop text-indigo-600 dark:text-indigo-400",
    "Administratif": "fas fa-clipboard text-slate-600 dark:text-slate-400",
    "Autre": "fas fa-sticky-note text-amber-600 dark:text-amber-400",
  };

  const handleStatusChange = (taskId, newStatus) => {
    updatePersonalTask(taskId, { status: newStatus });
    showToast(`Statut mis a jour: ${newStatus}`, "info", {
      title: "Mise a jour du statut",
      context: "personal-task",
    });
  };

  const handlePriorityChange = (taskId, newPriority) => {
    updatePersonalTask(taskId, { priority: newPriority });
    showToast(`Priorite mise a jour: ${newPriority}`, "info", {
      title: "Priorite mise a jour",
      context: "personal-task",
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
          <span className={`font-medium ${task.status === "Terminée" ? "line-through text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"}`}>
            {task.title}
          </span>
        </div>
      ),
    },
    {
      id: "category",
      label: "Catégorie",
      sortable: true,
      render: (task) => (
        <div className="flex items-center gap-2">
          <i className={categoryIcons[task.category] || categoryIcons["Autre"]}></i>
          <span className="text-sm">{task.category}</span>
        </div>
      ),
    },
    {
      id: "dueDate",
      label: "Date limite",
      sortable: true,
      render: (task) => {
        const today = new Date();
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < today && task.status !== "Terminée";
        const isDueSoon = (dueDate - today) / (1000 * 60 * 60 * 24) <= 3 && dueDate >= today;

        return (
          <span className={`text-sm font-medium ${isOverdue ? "text-red-600 dark:text-red-400" :
            isDueSoon ? "text-amber-600 dark:text-amber-400" :
              "text-slate-900 dark:text-white"
            }`}>
            {task.dueDate}
          </span>
        );
      },
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
    searchableFields: ["title", "category", "status", "priority"],
  });

  const handleView = (id) => {
    navigate(`/personal-tasks/${id}`);
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
      deletePersonalTask(id);
      showToast("Tâche personnelle supprimée", "warning", {
        title: "Suppression",
        context: "personal-task",
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
        updatePersonalTask(editingTask.id, formData);
        showToast("Tâche modifiée avec succès!", "success");
      } else {
        const newTask = {
          ...formData,
          id: Date.now(),
        };
        addPersonalTask(newTask);
        showToast("Tâche ajoutée avec succès!", "success");

        // ✅ Log creation event
        logEntityCreation('personalTask', newTask.id, formData.title);

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('personalTask', newTask.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
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
    a.download = `personal-tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Form fields for personal tasks
  const personalTaskFormFields = [
    {
      name: "title",
      label: "Titre de la tâche",
      type: "text",
      required: true,
      fullWidth: true,
      placeholder: "Ex: Payer facture électricité"
    },
    {
      name: "category",
      label: "Catégorie",
      type: "select",
      required: true,
      options: [
        { value: "Factures", label: "💰 Factures" },
        { value: "Bureau", label: "💼 Bureau" },
        { value: "Personnel", label: "👤 Personnel" },
        { value: "Informatique", label: "💻 Informatique" },
        { value: "Administratif", label: "📋 Administratif" },
        { value: "Autre", label: "📌 Autre" },
      ]
    },
    {
      name: "dueDate",
      label: "Date limite",
      type: "date",
      required: true,
    },
    {
      name: "priority",
      label: "Priorité",
      type: "select",
      required: true,
      defaultValue: "Moyenne",
      options: [
        { value: "Haute", label: "🔴 Haute" },
        { value: "Moyenne", label: "🟡 Moyenne" },
        { value: "Basse", label: "🟢 Basse" },
      ]
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "En attente",
      options: [
        { value: "Non commencée", label: "Non commencée" },
        { value: "En attente", label: "En attente" },
        { value: "En cours", label: "En cours" },
        { value: "Planifiée", label: "Planifiée" },
        { value: "Terminée", label: "Terminée" },
      ]
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      fullWidth: true,
      rows: 3,
      placeholder: "Notes additionnelles..."
    },
  ];

  // ✅ Apply status field protection when editing
  const dynamicPersonalTaskFormFields = editingTask
    ? personalTaskFormFields.map(field => {
      if (field.name === "status") {
        return {
          ...field,
          type: 'readonly',
          displayValue: editingTask.status,
          helpText: 'Le statut ne peut être modifié que via le sélecteur dans la liste'
        };
      }
      return field;
    })
    : personalTaskFormFields;

  // Calculate stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "Terminée").length,
    pending: tasks.filter(t => t.status !== "Terminée").length,
    overdue: tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate < new Date() && t.status !== "Terminée";
    }).length,
  };

  return (
    <PageLayout>
      <PageHeader
        title="Tâches Personnelles"
        subtitle={`${table.originalTotalItems} tâches personnelles${table.isFiltering ? ` • ${table.totalItems} affichées` : ""}`}
        icon="fas fa-sticky-note"
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
        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <i className="fas fa-clipboard-list text-blue-600 dark:text-blue-400 text-xl"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
              <i className="fas fa-clock text-amber-600 dark:text-amber-400 text-xl"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.pending}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">En attente</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <i className="fas fa-check-circle text-green-600 dark:text-green-400 text-xl"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.completed}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Terminées</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <i className="fas fa-exclamation-triangle text-red-600 dark:text-red-400 text-xl"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.overdue}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">En retard</p>
            </div>
          </div>
        </div>
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucune tâche personnelle"}>
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
        title={editingTask ? "Modifier Tâche" : "Nouvelle Tâche Personnelle"}
        subtitle={editingTask ? "Modifier la tâche personnelle" : "Ajouter une tâche non liée aux dossiers"}
        fields={dynamicPersonalTaskFormFields}
        initialData={editingTask}
        isLoading={isLoading}
        entityType="personalTask"
        entityId={editingTask?.id}
        editingEntity={editingTask}
      />
    </PageLayout>
  );
}
