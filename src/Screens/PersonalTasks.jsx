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
import { getStatusColor } from "../utils/mockData";

/**
 * Personal Tasks - For non-legal, personal/administrative tasks
 * Examples: Pay bills, personal errands, office supplies, etc.
 * NOT related to dossiers or clients
 */

// Mock data for personal tasks
const mockPersonalTasks = [
  {
    id: 1,
    title: "Payer facture électricité",
    category: "Factures",
    dueDate: "2024-12-15",
    priority: "Haute",
    status: "En attente",
    notes: "Facture du mois de novembre",
  },
  {
    id: 2,
    title: "Renouveler abonnement internet",
    category: "Factures",
    dueDate: "2024-12-20",
    priority: "Moyenne",
    status: "Non commencée",
    notes: "",
  },
  {
    id: 3,
    title: "Acheter fournitures bureau",
    category: "Bureau",
    dueDate: "2024-12-10",
    priority: "Basse",
    status: "Terminée",
    notes: "Papier, stylos, agrafeuse",
  },
  {
    id: 4,
    title: "Rendez-vous dentiste",
    category: "Personnel",
    dueDate: "2024-12-18",
    priority: "Haute",
    status: "Planifiée",
    notes: "Contrôle annuel",
  },
  {
    id: 5,
    title: "Sauvegarder documents importants",
    category: "Informatique",
    dueDate: "2024-12-12",
    priority: "Haute",
    status: "En cours",
    notes: "Backup mensuel",
  },
];

export default function PersonalTasks() {
  const navigate = useNavigate();
  
  const [tasks, setTasks] = useState(mockPersonalTasks);
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

  // Define table columns
  const columns = [
    {
      id: "title",
      label: "Tâche",
      sortable: true,
      locked: true,
      render: (task) => (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={task.status === "Terminée"}
            onChange={() => handleToggleComplete(task.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
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
          <span className={`text-sm font-medium ${
            isOverdue ? "text-red-600 dark:text-red-400" : 
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
      render: (task) => {
        const config = priorityConfig[task.priority];
        return (
          <div className="flex items-center gap-2">
            <i className={`${config.icon} ${config.color}`}></i>
            <span className="text-sm">{task.priority}</span>
          </div>
        );
      },
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

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette tâche ?")) {
      setTasks(tasks.filter(t => t.id !== id));
    }
  };

  const handleToggleComplete = (id) => {
    setTasks(tasks.map(t => 
      t.id === id 
        ? { ...t, status: t.status === "Terminée" ? "En attente" : "Terminée" }
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
        const newTask = {
          ...formData,
          id: Date.now(),
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
        fields={personalTaskFormFields}
        initialData={editingTask}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}
