import { useState, useMemo } from "react";
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
import StatCard from "../components/dashboard/StatCard";
import FormModal from "../components/FormModal/FormModal";
import { useGridPagination } from "../hooks/useGridPagination";
import { lawsuitFormFields } from "../components/FormModal/formConfigs";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import ListPageSkeleton from "../components/skeleton/ListPageSkeleton";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";
import { calculateNextHearing, formatDate, getDeadlineUrgency } from "../utils/deadlineUtils";
import { useTranslation } from "react-i18next";
import { useListViewMode } from "../hooks/useListViewMode";

export default function Lawsuits() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { lawsuits, dossiers, clients, sessions, tasks, missions, officers, financialEntries, addLawsuit, updateLawsuit, deleteLawsuit, deleteLawsuitCascade, loading, loadError } = useData();
  const { t } = useTranslation("lawsuits");

  // Compute next hearing for each lawsuit
  const enhancedLawsuits = useMemo(() => {
    return lawsuits.map(lawsuitItem => {
      const lawsuitSessions = sessions.filter(s => s.lawsuitId === lawsuitItem.id || s.dossierId === lawsuitItem.dossierId);
      const nextHearingObj = calculateNextHearing(lawsuitItem, lawsuitSessions);
      return {
        ...lawsuitItem,
        computedNextHearing: nextHearingObj,
      };
    });
  }, [lawsuits, sessions]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLawsuit, setEditingLawsuit] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [viewMode, setViewMode] = useListViewMode("lawsuits");

  const statusLabelMap = useMemo(
    () => ({
      "In Progress": t("table.status.inProgress"),
      "On Hold": t("table.status.onHold"),
      "Suspended": t("table.status.suspended"),
      "Closed": t("table.status.closed"),
      "Completed": t("table.status.completed"),
    }),
    [t]
  );

  const getStatusLabel = (status) => statusLabelMap[status] || status;

  // Define table columns
  const columns = [
    {
      id: "lawsuitNumber",
      label: t("table.columns.lawsuitNumber"),
      sortable: true,
      locked: true,
      mobileRole: "meta",
      mobilePriority: 1,
      render: (lawsuitItem) => (
        <span className="font-mono text-xs font-semibold text-purple-600 dark:text-purple-400">
          {lawsuitItem.lawsuitNumber}
        </span>
      ),
    },
    {
      id: "title",
      label: t("table.columns.title"),
      sortable: true,
      mobileRole: "primary",
      render: (lawsuitItem) => <span className="font-medium">{lawsuitItem.title}</span>,
    },
    {
      id: "dossier",
      label: t("table.columns.dossier"),
      sortable: true,
      render: (lawsuitItem) => (
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {lawsuitItem.dossier}
        </span>
      ),
    },
    {
      id: "court",
      label: t("table.columns.court"),
      sortable: true,
      render: (lawsuitItem) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-landmark text-slate-500 dark:text-slate-400 text-xs"></i>
          <span className="text-sm">{lawsuitItem.court}</span>
        </div>
      ),
    },
    {
      id: "nextHearing",
      label: t("table.columns.nextHearing"),
      sortable: true,
      mobileRole: "detail",
      render: (lawsuitItem) => {
        const hearing = lawsuitItem.computedNextHearing;
        if (!hearing) return <span className="text-slate-400 italic">{t("table.nextHearing.none")}</span>;
        const urgency = getDeadlineUrgency(hearing);
        const urgencyColor = {
          critical: "text-red-600 font-bold",
          urgent: "text-amber-600 font-semibold",
          soon: "text-blue-600 font-medium",
          normal: "text-slate-900 dark:text-white"
        }[urgency] || "text-slate-900 dark:text-white";
        return (
          <span className={urgencyColor} title={hearing.label}>
            {formatDate(hearing.date)}{hearing.time ? ` ${hearing.time}` : ""}
          </span>
        );
      },
    },
    {
      id: "status",
      label: t("table.columns.status"),
      sortable: true,
      render: (lawsuitItem) => (
        <InlineStatusSelector
          value={lawsuitItem.status}
          onChange={(newStatus) => handleStatusChange(lawsuitItem.id, newStatus)}
          statusOptions={[
            { value: "In Progress", label: statusLabelMap["In Progress"], icon: "fas fa-hourglass-half", color: "blue" },
            { value: "On Hold", label: statusLabelMap["On Hold"], icon: "fas fa-pause-circle", color: "amber" },
            { value: "Closed", label: statusLabelMap["Closed"], icon: "fas fa-gavel", color: "slate" },
          ]}
          entityType="lawsuit"
          entityId={lawsuitItem.id}
          entityData={lawsuitItem}
        />
      ),
    },
    {
      id: "actions",
      label: t("table.columns.actions"),
      sortable: false,
      locked: true,
      render: (lawsuitItem) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("table.actions.view")}
            onClick={(e) => {
              e.stopPropagation();
              handleView(lawsuitItem.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title={t("table.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(lawsuitItem);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title={t("table.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(lawsuitItem.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Calculate stats
  const stats = {
    total: enhancedLawsuits.length,
    active: enhancedLawsuits.filter(c => c.status === "In Progress").length,
    upcoming: enhancedLawsuits.filter(c => {
      const hearing = c.computedNextHearing;
      if (!hearing) return false;
      const hearingDate = new Date(hearing.date);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return hearingDate <= nextWeek && hearingDate >= new Date();
    }).length,
    closed: enhancedLawsuits.filter(c => c.status === "Completed").length,
  };

  // Initialize advanced table with intelligent ordering
  // Lawsuits: Upcoming hearings first, then active lawsuits, closed lawsuits de-emphasized
  const table = useAdvancedTable(enhancedLawsuits, columns, {
    // Remove initialSortBy to enable intelligent ordering by default
    initialSortBy: null,
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["lawsuitNumber", "title", "dossier", "court", "status"],
    entityType: "lawsuit",
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

  const headerSubtitle =
    table.isFiltering
      ? t("page.subtitleFiltered", {
        total: table.originalTotalItems,
        displayed: table.totalItems,
      })
      : t("page.subtitle", { total: table.originalTotalItems });

  const tableEmptyMessage =
    table.isFiltering
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
    navigate(`/lawsuits/${id}`);
  };

  const handleEdit = (lawsuitItem) => {
    // â Validate before allowing edit
    const result = canPerformAction('lawsuit', lawsuitItem.id, 'edit', {
      data: lawsuitItem,
      entities: { clients, dossiers, lawsuits, sessions, tasks, missions, officers, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingLawsuit(lawsuitItem);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // â Validate before allowing delete
    const lawsuitItem = lawsuits.find(c => c.id === id);
    const result = canPerformAction('lawsuit', id, 'delete', {
      data: lawsuitItem,
      entities: { clients, dossiers, lawsuits, sessions, tasks, missions, officers, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setPendingDeleteId(id);
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
      deleteLawsuit(id);
      showToast(t("toasts.deleteSuccess.body"), "warning", {
        title: t("toasts.deleteSuccess.title"),
        context: "lawsuit",
      });
    }
  };

  const handleForceDelete = async () => {
    if (!pendingDeleteId) return;

    setBlockerModalOpen(false);

    try {
      const result = await deleteLawsuitCascade(pendingDeleteId);

      if (!result || !result.ok) {
        console.error('[Lawsuits.handleForceDelete] Cascade delete failed:', result);
        showToast(t("toasts.cascadeError"), "error");
        return;
      }

      showToast(t("toasts.cascadeSuccess.body"), "success", {
        title: t("toasts.cascadeSuccess.title"),
        context: "lawsuit",
      });

      setPendingDeleteId(null);
      setValidationResult(null);
      navigate("/lawsuits");
    } catch (error) {
      console.error('[Lawsuits.handleForceDelete] Error:', error);
      showToast(t("toasts.cascadeError"), "error");
    }
  };

  const handleStatusChange = (id, newStatus) => {
    const lawsuitItem = lawsuits.find((c) => c.id === id);
    const result = canPerformAction("lawsuit", id, "edit", {
      data: lawsuitItem,
      newData: { ...lawsuitItem, status: newStatus },
      entities: { clients, dossiers, lawsuits, sessions, tasks, missions, officers, financialEntries },
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    updateLawsuit(id, { status: newStatus });
    showToast(t("toasts.statusUpdated", { status: getStatusLabel(newStatus) }), "info", {
      title: t("toasts.statusTitle"),
      context: "lawsuit",
    });
  };

  const handleAddLawsuit = () => {
    setEditingLawsuit(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ?. Validate before submitting
    if (editingLawsuit) {
      const result = canPerformAction('lawsuit', editingLawsuit.id, 'edit', {
        data: editingLawsuit,
        newData: formData,
        entities: { clients, dossiers, lawsuits, sessions, tasks, missions, officers, financialEntries }
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
      const result = canPerformAction('lawsuit', null, 'add', {
        formData,
        entities: { clients, dossiers, lawsuits, sessions, tasks, missions, officers, financialEntries }
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

      if (editingLawsuit) {
        await updateLawsuit(editingLawsuit.id, formData);
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const creation = await addLawsuit(formData);
        if (creation?.ok === false) {
          return;
        }
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        const createdRef = createdEntity?.lawsuitNumber || createdEntity?.reference || formData.lawsuitNumber;
        if (!createdId) throw new Error(t("toasts.missingId"));
        showToast(t("toasts.createSuccess"), "success");

        logEntityCreation("lawsuit", createdId, createdRef);

        const detailRoute = resolveDetailRoute("lawsuit", createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingLawsuit(null);
    } catch (error) {
      console.error("Error submitting lawsuit:", error);
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

    const rows = table.allData.map(lawsuitItem =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = lawsuitItem[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lawsuits-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Populate dossier options and protect status field in edit mode
  const translatedLawsuitFormFields = lawsuitFormFields(t);

  const populatedLawsuitFormFields = translatedLawsuitFormFields.map(field => {
    if (field.name === "dossierId") {
      return {
        ...field,
        options: dossiers.map(d => ({
          value: d.id,
          label: `${d.lawsuitNumber} - ${d.title}`
        }))
      };
    }
    // Protect status field in edit mode
    if (field.name === "status" && editingLawsuit) {
      return {
        ...field,
        type: 'readonly',
        displayValue: getStatusLabel(editingLawsuit.status),
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
        icon="fas fa-gavel"
        actions={
          <button
            onClick={handleAddLawsuit}
            disabled={dossiers.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${dossiers.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={dossiers.length === 0 ? t("page.actions.newLawsuitDisabled") : undefined}
          >
            <i className="fas fa-plus"></i>
            {t("page.actions.newLawsuit")}
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
          icon="fas fa-gavel"
          color="purple"
        />
        <StatCard
          label={t("stats.inProgress")}
          value={stats.active}
          icon="fas fa-balance-scale"
          color="blue"
        />
        <StatCard
          label={t("stats.upcoming")}
          value={stats.upcoming}
          icon="fas fa-calendar-week"
          color="amber"
          trendLabel={t("stats.upcomingTrend")}
        />
        <StatCard
          label={t("stats.completed")}
          value={stats.closed}
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
            onRowClick={(lawsuitItem) => handleView(lawsuitItem.id)}
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
              {displayData.map((lawsuitItem) => (
                <TableRow
                  key={lawsuitItem.id}
                  onClick={() => handleView(lawsuitItem.id)}
                  emphasis={table.getItemEmphasis(lawsuitItem)}
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
                      {column.render ? column.render(lawsuitItem) : lawsuitItem[column.id]}
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
          setEditingLawsuit(null);
        }}
        onSubmit={handleSubmit}
        title={editingLawsuit ? t("form.title.edit") : t("form.title.create")}
        subtitle={editingLawsuit ? t("form.subtitle.edit") : t("form.subtitle.create")}
        fields={populatedLawsuitFormFields}
        initialData={editingLawsuit}
        isLoading={isLoading}
        entityType="lawsuit"
        entityId={editingLawsuit?.id}
        editingEntity={editingLawsuit}
        entities={{ clients, dossiers, lawsuits, tasks, sessions, officers, missions, financialEntries }}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => {
          setBlockerModalOpen(false);
          setPendingDeleteId(null);
          setValidationResult(null);
        }}
        actionName={t("blockerModal.actionName")}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.lawsuitNumber || t("blockerModal.entityFallback")}
        requiresForceDelete={validationResult?.requiresForceDelete || false}
        affectedEntities={validationResult?.affectedEntities || []}
        forceDeleteMessage={validationResult?.forceDeleteMessage || ""}
        onForceDelete={handleForceDelete}
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
        entityName={editingLawsuit?.lawsuitNumber || ""}
      />
    </PageLayout>
  );
}






