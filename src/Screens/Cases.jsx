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
import StatCard from "../components/dashboard/StatCard";
import FormModal from "../components/FormModal/FormModal";
import { caseFormFields } from "../components/FormModal/formConfigs";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import LoadingScreen from "../components/loading/LoadingScreen";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";
import { calculateNextHearing, formatDate, getDeadlineUrgency } from "../utils/deadlineUtils";
import { useTranslation } from "react-i18next";

export default function Cases() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { cases, dossiers, clients, sessions, tasks, missions, officers, financialEntries, addCase, updateCase, deleteCase, deleteCaseCascade, loading, loadError } = useData();
  const { t } = useTranslation("cases");

  // Compute next hearing for each case
  const enhancedCases = useMemo(() => {
    return cases.map(caseItem => {
      const caseSessions = sessions.filter(s => s.caseId === caseItem.id || s.dossierId === caseItem.dossierId);
      const nextHearingObj = calculateNextHearing(caseItem, caseSessions);
      return {
        ...caseItem,
        computedNextHearing: nextHearingObj,
      };
    });
  }, [cases, sessions]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

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
      id: "caseNumber",
      label: t("table.columns.caseNumber"),
      sortable: true,
      locked: true,
      render: (caseItem) => (
        <span className="font-mono text-xs font-semibold text-purple-600 dark:text-purple-400">
          {caseItem.caseNumber}
        </span>
      ),
    },
    {
      id: "title",
      label: t("table.columns.title"),
      sortable: true,
      render: (caseItem) => <span className="font-medium">{caseItem.title}</span>,
    },
    {
      id: "dossier",
      label: t("table.columns.dossier"),
      sortable: true,
      render: (caseItem) => (
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {caseItem.dossier}
        </span>
      ),
    },
    {
      id: "court",
      label: t("table.columns.court"),
      sortable: true,
      render: (caseItem) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-landmark text-slate-500 dark:text-slate-400 text-xs"></i>
          <span className="text-sm">{caseItem.court}</span>
        </div>
      ),
    },
    {
      id: "nextHearing",
      label: t("table.columns.nextHearing"),
      sortable: true,
      render: (caseItem) => {
        const hearing = caseItem.computedNextHearing;
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
      render: (caseItem) => (
        <InlineStatusSelector
          value={caseItem.status}
          onChange={(newStatus) => handleStatusChange(caseItem.id, newStatus)}
          statusOptions={[
            { value: "In Progress", label: statusLabelMap["In Progress"], icon: "fas fa-hourglass-half", color: "blue" },
            { value: "On Hold", label: statusLabelMap["On Hold"], icon: "fas fa-pause-circle", color: "amber" },
            { value: "Closed", label: statusLabelMap["Closed"], icon: "fas fa-gavel", color: "slate" },
          ]}
          entityType="case"
          entityId={caseItem.id}
          entityData={caseItem}
        />
      ),
    },
    {
      id: "actions",
      label: t("table.columns.actions"),
      sortable: false,
      locked: true,
      render: (caseItem) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("table.actions.view")}
            onClick={(e) => {
              e.stopPropagation();
              handleView(caseItem.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title={t("table.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(caseItem);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title={t("table.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(caseItem.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Calculate stats
  const stats = {
    total: enhancedCases.length,
    active: enhancedCases.filter(c => c.status === "In Progress").length,
    upcoming: enhancedCases.filter(c => {
      const hearing = c.computedNextHearing;
      if (!hearing) return false;
      const hearingDate = new Date(hearing.date);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return hearingDate <= nextWeek && hearingDate >= new Date();
    }).length,
    closed: enhancedCases.filter(c => c.status === "Completed").length,
  };

  // Initialize advanced table
  const table = useAdvancedTable(enhancedCases, columns, {
    initialSortBy: "nextHearing",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["caseNumber", "title", "dossier", "court", "status"],
  });

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
        <LoadingScreen variant="page" message={t("page.loading")} />
      </PageLayout>
    );
  }


  const handleView = (id) => {
    navigate(`/cases/${id}`);
  };

  const handleEdit = (caseItem) => {
    // â Validate before allowing edit
    const result = canPerformAction('case', caseItem.id, 'edit', {
      data: caseItem,
      entities: { clients, dossiers, cases, sessions, tasks, missions, officers, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingCase(caseItem);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // â Validate before allowing delete
    const caseItem = cases.find(c => c.id === id);
    const result = canPerformAction('case', id, 'delete', {
      data: caseItem,
      entities: { clients, dossiers, cases, sessions, tasks, missions, officers, financialEntries }
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
      deleteCase(id);
      showToast(t("toasts.deleteSuccess.body"), "warning", {
        title: t("toasts.deleteSuccess.title"),
        context: "case",
      });
    }
  };

  const handleForceDelete = async () => {
    if (!pendingDeleteId) return;

    setBlockerModalOpen(false);

    try {
      const result = await deleteCaseCascade(pendingDeleteId);

      if (!result || !result.ok) {
        console.error('[Cases.handleForceDelete] Cascade delete failed:', result);
        showToast(t("toasts.cascadeError"), "error");
        return;
      }

      showToast(t("toasts.cascadeSuccess.body"), "success", {
        title: t("toasts.cascadeSuccess.title"),
        context: "case",
      });

      setPendingDeleteId(null);
      setValidationResult(null);
      navigate("/cases");
    } catch (error) {
      console.error('[Cases.handleForceDelete] Error:', error);
      showToast(t("toasts.cascadeError"), "error");
    }
  };

  const handleStatusChange = (id, newStatus) => {
    updateCase(id, { status: newStatus });
    showToast(t("toasts.statusUpdated", { status: getStatusLabel(newStatus) }), "info", {
      title: t("toasts.statusTitle"),
      context: "case",
    });
  };

  const handleAddCase = () => {
    setEditingCase(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ?. Validate before submitting
    if (editingCase) {
      const result = canPerformAction('case', editingCase.id, 'edit', {
        data: editingCase,
        newData: formData,
        entities: { clients, dossiers, cases, sessions, tasks, missions, officers, financialEntries }
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
      const result = canPerformAction('case', null, 'add', {
        formData,
        entities: { clients, dossiers, cases, sessions, tasks, missions, officers, financialEntries }
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

      if (editingCase) {
        await updateCase(editingCase.id, formData);
        showToast(t("toasts.updateSuccess"), "success");
      } else {
        const creation = await addCase(formData);
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        const createdRef = createdEntity?.caseNumber || createdEntity?.reference || formData.caseNumber;
        if (!createdId) throw new Error(t("toasts.missingId"));
        showToast(t("toasts.createSuccess"), "success");

        logEntityCreation("case", createdId, createdRef);

        const detailRoute = resolveDetailRoute("case", createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingCase(null);
    } catch (error) {
      console.error("Error submitting case:", error);
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

    const rows = table.allData.map(caseItem =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = caseItem[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cases-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Populate dossier options and protect status field in edit mode
  const populatedCaseFormFields = caseFormFields.map(field => {
    if (field.name === "dossierId") {
      return {
        ...field,
        options: dossiers.map(d => ({
          value: d.id,
          label: `${d.caseNumber} - ${d.title}`
        }))
      };
    }
    // Protect status field in edit mode
    if (field.name === "status" && editingCase) {
      return {
        ...field,
        type: 'readonly',
        displayValue: getStatusLabel(editingCase.status),
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
            onClick={handleAddCase}
            disabled={dossiers.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${dossiers.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={dossiers.length === 0 ? t("page.actions.newCaseDisabled") : undefined}
          >
            <i className="fas fa-plus"></i>
            {t("page.actions.newCase")}
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={tableEmptyMessage}>
            {table.data.map((caseItem) => (
              <TableRow
                key={caseItem.id}
                onClick={() => handleView(caseItem.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(caseItem) : caseItem[column.id]}
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
          setEditingCase(null);
        }}
        onSubmit={handleSubmit}
        title={editingCase ? t("form.title.edit") : t("form.title.create")}
        subtitle={editingCase ? t("form.subtitle.edit") : t("form.subtitle.create")}
        fields={populatedCaseFormFields}
        initialData={editingCase}
        isLoading={isLoading}
        entityType="lawsuit"
        entityId={editingCase?.id}
        editingEntity={editingCase}
        entities={{ clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }}
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
        entityName={validationResult?.entityData?.caseNumber || t("blockerModal.entityFallback")}
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
        entityName={editingCase?.caseNumber || ""}
      />
    </PageLayout>
  );
}
