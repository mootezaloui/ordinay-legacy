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
import StatCard from "../components/dashboard/StatCard";
import { sessionFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockSessions, mockCases, mockDossiers } from "../utils/mockData";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";

export default function Sessions() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState(mockSessions);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const typeIcons = {
    "Consultation": "fas fa-comments",
    "Audience": "fas fa-gavel",
    "Expertise": "fas fa-microscope",
    "Médiation": "fas fa-handshake",
    "Téléphone": "fas fa-phone",
  };

  // Calculate stats
  const stats = {
    total: sessions.length,
    today: sessions.filter(s => s.date === new Date().toISOString().split('T')[0]).length,
    thisWeek: sessions.filter(s => {
      const sessionDate = new Date(s.date);
      const now = new Date();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      const weekEnd = new Date(now.setDate(weekStart.getDate() + 7));
      return sessionDate >= weekStart && sessionDate <= weekEnd;
    }).length,
    completed: sessions.filter(s => s.status === "Terminée").length,
  };

  // Define table columns
  const columns = [
    {
      id: "title",
      label: "Titre",
      sortable: true,
      locked: true,
      render: (session) => <span className="font-medium">{session.title}</span>,
    },
    {
      id: "type",
      label: "Type",
      sortable: true,
      render: (session) => (
        <div className="flex items-center gap-2">
          <i className={`${typeIcons[session.type]} text-blue-600 dark:text-blue-400 text-sm`}></i>
          <span className="text-sm">{session.type}</span>
        </div>
      ),
    },
    {
      id: "date",
      label: "Date",
      sortable: true,
      render: (session) => <span className="font-medium">{session.date}</span>,
    },
    {
      id: "time",
      label: "Heure",
      sortable: true,
      render: (session) => session.time,
    },
    {
      id: "duration",
      label: "Durée",
      sortable: true,
      render: (session) => <span className="text-slate-600 dark:text-slate-400">{session.duration}</span>,
    },
    {
      id: "location",
      label: "Lieu",
      sortable: true,
      render: (session) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-map-marker-alt text-slate-500 dark:text-slate-400 text-xs"></i>
          <span className="text-sm">{session.location}</span>
        </div>
      ),
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (session) => (
        <InlineStatusSelector
          value={session.status}
          onChange={(newStatus) => handleStatusChange(session.id, newStatus)}
          statusOptions={[
            { value: "Programmée", label: "Programmée", icon: "fas fa-calendar", color: "text-blue-600" },
            { value: "Confirmée", label: "Confirmée", icon: "fas fa-check", color: "text-green-600" },
            { value: "En attente", label: "En attente", icon: "fas fa-clock", color: "text-amber-600" },
            { value: "Terminée", label: "Terminée", icon: "fas fa-check-circle", color: "text-gray-600" },
            { value: "Annulée", label: "Annulée", icon: "fas fa-times-circle", color: "text-red-600" },
          ]}
        />
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (session) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(session.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(session);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(session.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(sessions, columns, {
    initialSortBy: "date",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["title", "type", "location", "status"],
  });

  const handleView = (id) => {
    navigate(`/sessions/${id}`);
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette séance ?")) {
      setSessions(sessions.filter(s => s.id !== id));
    }
  };

  const handleStatusChange = (id, newStatus) => {
    setSessions(sessions.map(s =>
      s.id === id ? { ...s, status: newStatus } : s
    ));
  };

  const handleAddSession = () => {
    setEditingSession(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingSession) {
        setSessions(sessions.map(s =>
          s.id === editingSession.id
            ? { ...formData, id: editingSession.id }
            : s
        ));
        alert("Séance modifiée avec succès!");
      } else {
        const newSession = {
          ...formData,
          id: Date.now(),
        };
        setSessions([newSession, ...sessions]);
        alert("Séance ajoutée avec succès!");
      }

      setIsModalOpen(false);
      setEditingSession(null);
    } catch (error) {
      console.error("Error submitting session:", error);
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

    const rows = table.allData.map(session =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = session[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sessions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ✅ Populate case and dossier options in the form fields
  const populatedSessionFormFields = sessionFormFields.map(field => {
    if (field.name === "caseId") {
      return {
        ...field,
        options: [
          { value: "", label: "Sélectionner un procès..." },
          ...mockCases.map(c => ({
            value: c.id,
            label: `${c.caseNumber} - ${c.title}`
          }))
        ]
      };
    }
    if (field.name === "dossierId") {
      return {
        ...field,
        options: [
          { value: "", label: "Sélectionner un dossier..." },
          ...mockDossiers.map(d => ({
            value: d.id,
            label: `${d.caseNumber} - ${d.title}`
          }))
        ]
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Audiences"
        subtitle={`${table.originalTotalItems} séances au total${table.isFiltering ? ` • ${table.totalItems} affichées` : ""}`}
        icon="fas fa-calendar"
        actions={
          <button
            onClick={handleAddSession}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouvelle Séance
          </button>
        }
      />
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Séances"
          value={stats.total}
          icon="fas fa-calendar"
          color="blue"
        />
        <StatCard
          label="Aujourd'hui"
          value={stats.today}
          icon="fas fa-calendar-day"
          color="purple"
        />
        <StatCard
          label="Cette semaine"
          value={stats.thisWeek}
          icon="fas fa-calendar-week"
          color="amber"
        />
        <StatCard
          label="Terminées"
          value={stats.completed}
          icon="fas fa-check-circle"
          color="green"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucune séance trouvée"}>
            {table.data.map((session) => (
              <TableRow
                key={session.id}
                onClick={() => handleView(session.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(session) : session[column.id]}
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
          setEditingSession(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("session", !!editingSession)}
        subtitle={editingSession ? "Modifier la séance" : "Ajouter une nouvelle séance"}
        fields={populatedSessionFormFields}
        initialData={editingSession}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}