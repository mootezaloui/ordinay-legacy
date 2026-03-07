import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { useData } from "../contexts/DataContext";
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
import { sessionFormFields } from "../components/FormModal/formConfigs";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import ListPageSkeleton from "../components/skeleton/ListPageSkeleton";
import { logEntityCreation, logHistoryEvent, EVENT_TYPES } from "../services/historyService";
import { useSettings } from "../contexts/SettingsContext";
import { useListViewMode } from "../hooks/useListViewMode";

export default function Sessions() {
  const { t } = useTranslation("sessions");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const tutorial = useTutorialSafe();
  const {
    sessions,
    dossiers,
    lawsuits,
    clients,
    tasks,
    officers,
    missions,
    financialEntries,
    addSession,
    updateSession,
    deleteSession,
    loading,
    loadError,
  } = useData();
  const { formatDate } = useSettings();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [viewMode, setViewMode] = useListViewMode("sessions");

  const typeIcons = {
    Consultation: "fas fa-comments",
    Audience: "fas fa-gavel",
    Expertise: "fas fa-microscope",
    Mediation: "fas fa-handshake",
    Telephone: "fas fa-phone",
  };

  const statusLabelMap = useMemo(
    () => ({
      Scheduled: t("table.status.scheduled"),
      Confirmed: t("table.status.confirmed"),
      Pending: t("table.status.pending"),
      "On Hold": t("table.status.onHold"),
      Completed: t("table.status.completed"),
      Cancelled: t("table.status.cancelled"),
    }),
    [t]
  );

  const typeLabelMap = useMemo(
    () => ({
      Consultation: t("table.type.consultation"),
      Audience: t("table.type.audience"),
      Expertise: t("table.type.expertise"),
      Mediation: t("table.type.mediation"),
      Telephone: t("table.type.telephone"),
    }),
    [t]
  );

  const getStatusLabel = (status) => statusLabelMap[status] || status;
  const getTypeLabel = (type) => typeLabelMap[type] || type;

  const stats = {
    total: sessions.length,
    today: sessions.filter(
      (s) => s.date === new Date().toISOString().split("T")[0]
    ).length,
    thisWeek: sessions.filter((s) => {
      const sessionDate = new Date(s.date);
      const now = new Date();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return sessionDate >= weekStart && sessionDate <= weekEnd;
    }).length,
    completed: sessions.filter((s) => s.status === "TerminAce").length,
  };

  const columns = [
    {
      id: "title",
      label: t("table.columns.title"),
      sortable: true,
      locked: true,
      render: (session) => <span className="font-medium">{session.title}</span>,
    },
    {
      id: "type",
      label: t("table.columns.type"),
      sortable: true,
      render: (session) => (
        <div className="flex items-center gap-2">
          <i
            className={`${typeIcons[session.type]} text-blue-600 dark:text-blue-400 text-sm`}
          ></i>
          <span className="text-sm">{getTypeLabel(session.type)}</span>
        </div>
      ),
    },
    {
      id: "date",
      label: t("table.columns.date"),
      sortable: true,
      render: (session) => <span className="font-medium">{formatDate(session.date)}</span>,
    },
    {
      id: "time",
      label: t("table.columns.time"),
      sortable: true,
      mobileRole: "detail",
      render: (session) => session.time,
    },
    {
      id: "duration",
      label: t("table.columns.duration"),
      sortable: true,
      render: (session) => (
        <span className="text-slate-600 dark:text-slate-400">{session.duration}</span>
      ),
    },
    {
      id: "location",
      label: t("table.columns.location"),
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
      label: t("table.columns.status"),
      sortable: true,
      render: (session) => (
        <InlineStatusSelector
          value={session.status}
          onChange={(newStatus) => handleStatusChange(session.id, newStatus)}
          statusOptions={[
            { value: "Scheduled", label: statusLabelMap.Scheduled, icon: "fas fa-calendar", color: "blue" },
            { value: "Confirmed", label: statusLabelMap.Confirmed, icon: "fas fa-check", color: "green" },
            { value: "Pending", label: statusLabelMap.Pending, icon: "fas fa-clock", color: "amber" },
            { value: "Completed", label: statusLabelMap.Completed, icon: "fas fa-check-circle", color: "slate" },
            { value: "Cancelled", label: statusLabelMap.Cancelled, icon: "fas fa-times-circle", color: "red" },
          ]}
          entityType="session"
          entityId={session.id}
          entityData={session}
        />
      ),
    },
    {
      id: "actions",
      label: t("table.columns.actions"),
      sortable: false,
      locked: true,
      render: (session) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("table.actions.view")}
            onClick={(e) => {
              e.stopPropagation();
              handleView(session.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title={t("table.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(session);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title={t("table.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(session.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table with intelligent ordering
  // Sessions: Today first, then upcoming week, confirmed before scheduled, completed/cancelled de-emphasized
  const table = useAdvancedTable(sessions, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["title", "type", "location", "status"],
    entityType: "session",
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

  const handleView = (id) => {
    navigate(`/sessions/${id}`);
  };

  const handleEdit = (session) => {
    const result = canPerformAction("session", session.id, "edit", {
      data: session,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries },
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    const linkType = session.lawsuitId ? "lawsuit" : "dossier";
    setEditingSession({ ...session, linkType });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const session = sessions.find((s) => s.id === id);
    const result = canPerformAction("session", id, "delete", {
      data: session,
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries },
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (
      await confirm({
        title: t("confirm.delete.title"),
        message: t("confirm.delete.message"),
        confirmText: t("confirm.delete.confirm"),
        cancelText: t("confirm.delete.cancel"),
        variant: "danger",
      })
    ) {
      try {
        await deleteSession(id);
        showToast(t("toasts.deleteSuccess"), "warning", {
          title: t("toasts.deletedTitle"),
          context: "session",
        });
      } catch (error) {
        showToast(t("toasts.deleteError"), "error");
      }
    }
  };

  const handleStatusChange = (id, newStatus) => {
    const session = sessions.find((s) => s.id === id);
    const result = canPerformAction("session", id, "edit", {
      data: session,
      newData: { ...session, status: newStatus },
      entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries },
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    updateSession(id, { status: newStatus });
    showToast(t("toasts.statusUpdated", { status: getStatusLabel(newStatus) }), "info", {
      title: t("toasts.statusTitle"),
      context: "session",
    });
  };

  const handleAddSession = () => {
    setEditingSession(null);
    setIsModalOpen(true);

    // Tell tutorial to hide overlay while modal is open
    if (tutorial?.setWaitingForAction && tutorial?.currentStep?.id === "create-session") {
      tutorial.setWaitingForAction(true);
    }
  };

  const handleSubmit = async (formData) => {
    if (editingSession) {
      const result = canPerformAction("session", editingSession.id, "edit", {
        data: editingSession,
        newData: formData,
        entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries },
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
      const result = canPerformAction("session", null, "add", {
        formData,
        entities: { clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries },
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
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const creation = await addSession(formData);
        if (creation?.ok === false) {
          return;
        }
        const createdSession = creation?.created || creation;
        showToast(t("toasts.createSuccess"), "success");

        logEntityCreation("session", createdSession.id, formData.type || "Session");

        const sessionTitle = createdSession.title || formData.title || getTypeLabel(formData.type || createdSession.type) || "Session";
        const hearingLabel = tCommon("detail.history.labels.hearingCreated");
        const historyLabel = `${hearingLabel}: ${sessionTitle}`;

        if (createdSession.lawsuitId) {
          logHistoryEvent({
            entityType: "lawsuit",
            entityId: createdSession.lawsuitId,
            eventType: EVENT_TYPES.RELATION,
            label: historyLabel,
            details: historyLabel,
            metadata: { childType: "session", childId: createdSession.id },
          });
          const caseItem = lawsuits.find((c) => String(c.id) === String(createdSession.lawsuitId));
          if (caseItem?.dossierId) {
            const dossierLabel = caseItem.lawsuitNumber ? `${historyLabel} (${caseItem.lawsuitNumber})` : historyLabel;
            logHistoryEvent({
              entityType: "dossier",
              entityId: caseItem.dossierId,
              eventType: EVENT_TYPES.RELATION,
              label: dossierLabel,
              details: dossierLabel,
              metadata: { childType: "lawsuit", childId: caseItem.id, relatedType: "session", relatedId: createdSession.id },
            });
          }
        } else if (createdSession.dossierId) {
          logHistoryEvent({
            entityType: "dossier",
            entityId: createdSession.dossierId,
            eventType: EVENT_TYPES.RELATION,
            label: historyLabel,
            details: historyLabel,
            metadata: { childType: "session", childId: createdSession.id },
          });
        }

        // Notify tutorial that a session was created
        if (tutorial?.setCreatedSession) {
          tutorial.setCreatedSession(createdSession.id);
        }

        const detailRoute = resolveDetailRoute("session", createdSession.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingSession(null);
    } catch (error) {
      console.error("Error submitting session:", error);
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
      .filter((col) => col.id !== "actions")
      .map((col) => col.label)
      .join(",");

    const rows = table.allData.map((session) =>
      table.columns
        .filter((col) => col.id !== "actions")
        .map((col) => {
          const value = col.id === "date" ? formatDate(session.date) : session[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t("export.filename", { date: new Date().toISOString().split("T")[0] });
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const translatedSessionFormFields = sessionFormFields(t);

  const populatedSessionFormFields = translatedSessionFormFields.map((field) => {
    if (field.name === "lawsuitId") {
      return {
        ...field,
        options: lawsuits.map((c) => ({
          value: c.id,
          label: `${c.lawsuitNumber} - ${c.title}`,
        })),
      };
    }
    if (field.name === "dossierId") {
      return {
        ...field,
        options: dossiers.map((d) => ({
          value: d.id,
          label: `${d.lawsuitNumber} - ${d.title}`,
        })),
      };
    }
    if (field.name === "status" && editingSession) {
      return {
        ...field,
        type: "readonly",
        displayValue: editingSession.status,
        helpText: t("form.statusReadonlyHelp"),
      };
    }
    return field;
  });

  const tableEmptyMessage = table.isFiltering
    ? t("table.emptyFiltered")
    : dossiers.length === 0
      ? t("table.emptyNoDossiers")
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

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle=
        {table.isFiltering
          ? t("page.subtitleFiltered", {
            total: table.originalTotalItems,
            displayed: table.totalItems,
          })
          : t("page.subtitle", { total: table.originalTotalItems })}
        icon="fas fa-calendar"
        actions={
          <button
            onClick={handleAddSession}
            disabled={dossiers.length === 0}
            data-tutorial="add-session-button"
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${dossiers.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={dossiers.length === 0 ? t("actions.disabledTooltip") : ""}
          >
            <i className="fas fa-plus"></i>
            {t("actions.new")}
          </button>
        }
      />
      <div data-tutorial="sessions-list-container" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("stats.total")} value={stats.total} icon="fas fa-calendar" color="blue" />
        <StatCard label={t("stats.today")} value={stats.today} icon="fas fa-calendar-day" color="purple" />
        <StatCard label={t("stats.thisWeek")} value={stats.thisWeek} icon="fas fa-calendar-week" color="amber" />
        <StatCard label={t("stats.completed")} value={stats.completed} icon="fas fa-check-circle" color="green" />
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
            onRowClick={(session) => handleView(session.id)}
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
            <TableBody
              isEmpty={displayData.length === 0}
              emptyMessage={tableEmptyMessage}
            >
              {displayData.map((session) => (
                <TableRow
                  key={session.id}
                  onClick={() => handleView(session.id)}
                  emphasis={table.getItemEmphasis(session)}
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
                      {column.render ? column.render(session) : session[column.id]}
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
          setEditingSession(null);
          // Restore tutorial overlay if it was hidden
          if (tutorial?.setWaitingForAction) {
            tutorial.setWaitingForAction(false);
          }
        }}
        onSubmit={handleSubmit}
        title={editingSession ? t("form.title.edit") : t("form.title.create")}
        subtitle={editingSession ? t("form.subtitle.edit") : t("form.subtitle.create")}
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
        actionName={t("blocker.action")}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={
          validationResult?.entityData?.date
            ? t("blocker.entityWithDate", { date: validationResult.entityData.date })
            : t("blocker.entityFallback")
        }
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
        entityName={
          pendingFormData?.title || editingSession?.title || t("confirmImpact.entityFallback")
        }
      />
    </PageLayout>
  );
}
