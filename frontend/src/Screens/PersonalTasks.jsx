import { useMemo, useState, useRef, useLayoutEffect, useEffect } from "react";
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
import GridPagination from "../components/table/GridPagination";
import EntityGrid from "../components/table/EntityGrid";
import FormModal from "../components/FormModal/FormModal";
import { useGridPagination } from "../hooks/useGridPagination";
import { resolveDetailRoute } from "../utils/routeResolver";
import { getStatusColor } from "../components/DetailView/config/statusColors";
import { logEntityCreation } from "../services/historyService";
import { useSettings } from "../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { useListViewMode } from "../hooks/useListViewMode";


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
function StatusDropdown({ task, onStatusChange, t }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('personal-task-status-dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  const statusOptions = [
    {
      value: "Not Started",
      label: t("table.status.notStarted"),
      icon: "fas fa-circle",
      color: "text-slate-600 dark:text-slate-400",
      bgColor: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300"
    },
    {
      value: "In Progress",
      label: t("table.status.inProgress"),
      icon: "fas fa-spinner",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
    },
    {
      value: "Blocked",
      label: t("table.status.blocked"),
      icon: "fas fa-ban",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    },
    {
      value: "Done",
      label: t("table.status.done"),
      icon: "fas fa-check-circle",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    },
    {
      value: "Cancelled",
      label: t("table.status.cancelled"),
      icon: "fas fa-times-circle",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
    },
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
        className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 ${currentStatus.bgColor}`}
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
              <i className={`${status.icon} ${status.color} w-4`}></i>
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
function PriorityDropdown({ task, onPriorityChange, t }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(Symbol('personal-task-priority-dropdown'));
  const [menuPosition, setMenuPosition] = useState(null); // null until computed to avoid flash at (0,0)

  const priorityOptions = [
    { value: "High", label: t("table.priority.high"), icon: "fas fa-arrow-up", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    { value: "Medium", label: t("table.priority.medium"), icon: "fas fa-minus", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    { value: "Low", label: t("table.priority.low"), icon: "fas fa-arrow-down", color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
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
  const { formatDate } = useSettings();
  const { t } = useTranslation("personalTasks");

  const tasks = personalTasks;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useListViewMode("personalTasks");

  const statusLabelMap = useMemo(
    () => ({
      "Not Started": t("table.status.notStarted"),
      "Pending": t("table.status.pending"),
      "In Progress": t("table.status.inProgress"),
      "Scheduled": t("table.status.scheduled"),
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

  const priorityConfig = {
    "High": {
      icon: "fas fa-arrow-up",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    },
    "Medium": {
      icon: "fas fa-minus",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    },
    "Low": {
      icon: "fas fa-arrow-down",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    },
  };

  const categoryIcons = {
    "Invoices": "fas fa-file-invoice-dollar text-green-600 dark:text-green-400",
    "Office": "fas fa-briefcase text-blue-600 dark:text-blue-400",
    "Personal": "fas fa-user text-purple-600 dark:text-purple-400",
    "IT": "fas fa-laptop text-indigo-600 dark:text-indigo-400",
    "Administrative": "fas fa-clipboard text-slate-600 dark:text-slate-400",
    "Other": "fas fa-sticky-note text-amber-600 dark:text-amber-400",
  };

  const categoryLabelMap = useMemo(
    () => ({
      Invoices: t("table.categories.invoices"),
      Office: t("table.categories.office"),
      Personal: t("table.categories.personal"),
      IT: t("table.categories.it"),
      Administrative: t("table.categories.administrative"),
      Other: t("table.categories.other"),
    }),
    [t]
  );

  const handleStatusChange = (taskId, newStatus) => {
    updatePersonalTask(taskId, { status: newStatus });
    showToast(t("toasts.statusUpdated", { status: statusLabelMap[newStatus] || newStatus }), "info", {
      title: t("toasts.statusTitle"),
      context: "personal-task",
    });
  };

  const handlePriorityChange = (taskId, newPriority) => {
    updatePersonalTask(taskId, { priority: newPriority });
    showToast(t("toasts.priorityUpdated", { priority: priorityLabelMap[newPriority] || newPriority }), "info", {
      title: t("toasts.priorityTitle"),
      context: "personal-task",
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
          <span className={`font-medium ${task.status === "Completed" ? "line-through text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"}`}>
            {task.title}
          </span>
        </div>
      ),
    },
    {
      id: "category",
      label: t("table.columns.category"),
      sortable: true,
      render: (task) => (
        <div className="flex items-center gap-2">
          <i className={categoryIcons[task.category] || categoryIcons["Other"]}></i>
          <span className="text-sm">{categoryLabelMap[task.category] || task.category}</span>
        </div>
      ),
    },
    {
      id: "dueDate",
      label: t("table.columns.dueDate"),
      sortable: true,
      render: (task) => {
        if (task.dueDate === null) {
          return <span className="text-sm text-slate-500 dark:text-slate-400">{t("table.dueDate.na")}</span>;
        }

        const today = new Date();
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < today && task.status !== "Terminee";
        const isDueSoon = (dueDate - today) / (1000 * 60 * 60 * 24) <= 3 && dueDate >= today;

        return (
          <span className={`text-sm font-medium ${isOverdue ? "text-red-600 dark:text-red-400" :
            isDueSoon ? "text-amber-600 dark:text-amber-400" :
              "text-slate-900 dark:text-white"
            }`}>
            {formatDate(task.dueDate)}
          </span>
        );
      },
    },
    {
      id: "priority",
      label: t("table.columns.priority"),
      sortable: true,
      mobileRole: "detail",
      render: (task) => (
        <PriorityDropdown
          task={task}
          onPriorityChange={handlePriorityChange}
          t={t}
        />
      ),
    },
    {
      id: "status",
      label: t("table.columns.status"),
      sortable: true,
      render: (task) => (
        <StatusDropdown
          task={task}
          onStatusChange={handleStatusChange}
          t={t}
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
  // Personal Tasks: Overdue/Blocked first, then In Progress, then by priority/due date, Done/Cancelled last
  const table = useAdvancedTable(tasks, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["title", "category", "status", "priority"],
    entityType: "personalTask",
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
    : t("table.empty");

  const handleView = (id) => {
    navigate(`/personal-tasks/${id}`);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (await confirm({
      title: t("confirm.delete.title"),
      message: t("confirm.delete.message"),
      confirmText: t("confirm.delete.confirm"),
      cancelText: t("confirm.delete.cancel"),
      variant: "danger"
    })) {
      deletePersonalTask(id);
      showToast(t("toasts.deleteSuccess.body"), "warning", {
        title: t("toasts.deleteSuccess.title"),
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
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const creation = await addPersonalTask(formData);
        const createdTask = creation?.created || creation;
        if (!createdTask?.id) throw new Error(t("toasts.missingId"));
        showToast(t("toasts.createSuccess"), "success");

        // ✅ Log creation event
        logEntityCreation('personalTask', createdTask.id, formData.title);

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('personalTask', createdTask.id);
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
    a.download = `personal-tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Form fields for personal tasks
  const personalTaskFormFields = [
    {
      name: "title",
      label: t("form.fields.title.label"),
      type: "text",
      required: true,
      fullWidth: true,
      placeholder: t("form.fields.title.placeholder")
    },
    {
      name: "category",
      label: t("form.fields.category.label"),
      type: "select",
      required: true,
      options: [
        { value: "Invoices", label: t("form.fields.category.options.invoices") },
        { value: "Office", label: t("form.fields.category.options.office") },
        { value: "Personal", label: t("form.fields.category.options.personal") },
        { value: "IT", label: t("form.fields.category.options.it") },
        { value: "Administrative", label: t("form.fields.category.options.administrative") },
        { value: "Other", label: t("form.fields.category.options.other") },
      ]
    },
    {
      name: "dueDate",
      label: t("form.fields.dueDate.label"),
      type: "date",
      required: true,
    },
    {
      name: "priority",
      label: t("form.fields.priority.label"),
      type: "inline-priority",
      required: true,
      defaultValue: "Medium",
    },
    {
      name: "status",
      label: t("form.fields.status.label"),
      type: "inline-status",
      required: true,
      defaultValue: "Pending",
      statusOptions: [
        { value: "Not Started", label: statusLabelMap["Not Started"] || "Not Started", color: "slate" },
        { value: "Pending", label: statusLabelMap["Pending"] || "Pending", color: "amber" },
        { value: "In Progress", label: statusLabelMap["In Progress"] || "In Progress", color: "blue" },
        { value: "Scheduled", label: statusLabelMap["Scheduled"] || "Scheduled", color: "purple" },
        { value: "Completed", label: statusLabelMap["Completed"] || "Completed", color: "green" },
      ]
    },
    {
      name: "notes",
      label: t("form.fields.notes.label"),
      type: "textarea",
      fullWidth: true,
      rows: 3,
      placeholder: t("form.fields.notes.placeholder")
    },
  ];

  // ✅ Apply status field protection when editing
  const dynamicPersonalTaskFormFields = editingTask
    ? personalTaskFormFields.map(field => {
      if (field.name === "status") {
        return {
          ...field,
          type: 'readonly',
          displayValue: statusLabelMap[editingTask.status] || editingTask.status,
          helpText: t("form.help.statusLocked"),
        };
      }
      return field;
    })
    : personalTaskFormFields;

  // Calculate stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "Completed").length,
    pending: tasks.filter(t => t.status !== "Completed").length,
    overdue: tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate < new Date() && t.status !== "Completed";
    }).length,
  };

  return (
    <PageLayout>
      <div data-tutorial="personal-tasks-container">
        <PageHeader
          title={t("page.title")}
          subtitle={headerSubtitle}
          icon="fas fa-sticky-note"
          actions={
            <button
              onClick={handleAddTask}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <i className="fas fa-plus"></i>
              {t("page.actions.newTask")}
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
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.total")}</p>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.pending")}</p>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.completed")}</p>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.overdue")}</p>
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
          fields={dynamicPersonalTaskFormFields}
          initialData={editingTask}
          isLoading={isLoading}
          entityType="personalTask"
          entityId={editingTask?.id}
          editingEntity={editingTask}
        />
      </div>
    </PageLayout>
  );
}





