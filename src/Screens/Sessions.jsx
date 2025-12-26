import { useState } from "react";
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
import StatCard from "../components/dashboard/StatCard";
import { sessionFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";

export default function Sessions() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    sessions,
    dossiers,
    cases,
    clients,
    tasks,
    officers,
    missions,
    financialEntries,
    addSession,
    updateSession,
    deleteSession
  } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);

  const typeIcons = {
    "Consultation": "fas fa-comments",
    "Audience": "fas fa-gavel",
    "Expertise": "fas fa-microscope",
    "Médiation": "fas fa-handshake",
    "Téléphone": "fas fa-phone",
  };

  const statusLabelMap = {
    "Programmée": "Scheduled",
    "Confirmée": "Confirmed",
    "En attente": "On Hold",
    "Terminée": "Completed",
    "Annulée": "Cancelled",
  };

  const typeLabelMap = {
    "Consultation": "Consultation",
    "Audience": "Hearing",
    "Expertise": "Expert Review",
    "Médiation": "Mediation",
    "Téléphone": "Phone",
  };

  const getStatusLabel = (status) => statusLabelMap[status] || status;
  const getTypeLabel = (type) => typeLabelMap[type] || type;

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
      label: "Title",
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
          <span className="text-sm">{getTypeLabel(session.type)}</span>
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
      label: "Time",
      sortable: true,
      render: (session) => session.time,
    },
    {
      id: "duration",
      label: "Duration",
      sortable: true,
      render: (session) => <span className="text-slate-600 dark:text-slate-400">{session.duration}</span>,
    },
    {
      id: "location",
      label: "Location",
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
      label: "Status",
      sortable: true,
      render: (session) => (
        <InlineStatusSelector
          value={session.status}
          onChange={(newStatus) => handleStatusChange(session.id, newStatus)}
          statusOptions={[
            { value: "Programmée", label: "Scheduled", icon: "fas fa-calendar", color: "blue" },
            { value: "Confirmée", label: "Confirmed", icon: "fas fa-check", color: "green" },
            { value: "En attente", label: "On Hold", icon: "fas fa-clock", color: "amber" },
            { value: "Terminée", label: "Completed", icon: "fas fa-check-circle", color: "slate" },
            { value: "Annulée", label: "Cancelled", icon: "fas fa-times-circle", color: "red" },
          ]}
          entityType="session"
          entityId={session.id}
          entityData={session}
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
            title="View details"
            onClick={(e) => {
              e.stopPropagation();
              handleView(session.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(session);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Delete"
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
    // ✅ Validate before allowing edit
    const result = canPerformAction('session', session.id, 'edit', {
      data: session,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    // Determine linkType based on existing data
    const linkType = session.caseId ? "case" : "dossier";
    setEditingSession({ ...session, linkType });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const session = sessions.find(s => s.id === id);
    const result = canPerformAction('session', id, 'delete', {
      data: session,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Delete session",
      message: "Are you sure you want to delete this session?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    })) {
      try {
        await deleteSession(id);
        showToast("Session deleted", "warning", {
          title: "Deleted",
          context: "session",
        });
      } catch (error) {
        showToast("Error deleting session", "error");
      }
    }
  };

  const handleStatusChange = (id, newStatus) => {
    updateSession(id, { status: newStatus });
    showToast(`Status updated: ${getStatusLabel(newStatus)}`, "info", {
      title: "Session status",
      context: "session",
    });
  };

  const handleAddSession = () => {
    setEditingSession(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ?. Validate before submitting
    if (editingSession) {
      const result = canPerformAction('session', editingSession.id, 'edit', {
        data: editingSession,
        newData: formData,
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
    } else {
      const result = canPerformAction('session', null, 'add', {
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

    await performSave(formData);
  };

  const performSave = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingSession) {
        updateSession(editingSession.id, formData);
        showToast("Session updated successfully!", "success");
      } else {
        const creation = await addSession(formData);
        const createdSession = creation?.created || creation;
        showToast("Session added successfully!", "success");

        // ✅ Log creation event
        logEntityCreation('session', createdSession.id, formData.type || 'Session');

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('session', createdSession.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingSession(null);
    } catch (error) {
      console.error("Error submitting session:", error);
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
        options: cases.map(c => ({
          value: c.id,
          label: `${c.caseNumber} - ${c.title}`
        }))
      };
    }
    if (field.name === "dossierId") {
      return {
        ...field,
        options: dossiers.map(d => ({
          value: d.id,
          label: `${d.caseNumber} - ${d.title}`
        }))
      };
    }
    // Protect status field from direct edit to enforce domain rules
    if (field.name === "status" && editingSession) {
      return {
        ...field,
        type: 'readonly',
        displayValue: editingSession.status,
        helpText: 'Status can only be changed using the selector in the list'
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Sessions"
        subtitle={`${table.originalTotalItems} sessions in total${table.isFiltering ? ` • ${table.totalItems} displayed` : ""}`}
        icon="fas fa-calendar"
        actions={
          <button
            onClick={handleAddSession}
            disabled={dossiers.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${dossiers.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={dossiers.length === 0 ? "Ajoutez d'abord un dossier avant de programmer une audience." : ""}
          >
            <i className="fas fa-plus"></i>
            New Session
          </button>
        }
      />
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Sessions"
          value={stats.total}
          icon="fas fa-calendar"
          color="blue"
        />
        <StatCard
          label="Today"
          value={stats.today}
          icon="fas fa-calendar-day"
          color="purple"
        />
        <StatCard
          label="This Week"
          value={stats.thisWeek}
          icon="fas fa-calendar-week"
          color="amber"
        />
        <StatCard
          label="Completed"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "No results found" : dossiers.length === 0 ? "Ajoutez d'abord un dossier avant de programmer une audience." : "No sessions found"}>
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
        subtitle={editingSession ? "Edit session" : "Add a new session"}
        fields={populatedSessionFormFields}
        initialData={editingSession}
        isLoading={isLoading}
        entityType="session"
        entityId={editingSession?.id}
        editingEntity={editingSession}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Edit/Delete session"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={`Session on ${validationResult?.entityData?.date || ''}`}
      />
      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName="confirm the change"
        impactSummary={validationResult?.impactSummary || []}
        entityName={pendingFormData?.title || editingSession?.title || ""}
      />

    </PageLayout>
  );
}
