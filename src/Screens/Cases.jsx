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

export default function Cases() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { cases, dossiers, clients, sessions, tasks, missions, officers, financialEntries, addCase, updateCase, deleteCase, loading, loadError } = useData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);

  const statusLabelMap = {
    "En cours": "In Progress",
    "En attente": "On Hold",
    "Suspendu": "Suspended",
    "Clos": "Closed",
    "Terminé": "Completed",
  };

  const getStatusLabel = (status) => statusLabelMap[status] || status;

  // Define table columns
  const columns = [
    {
      id: "caseNumber",
      label: "Case #",
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
      label: "Title",
      sortable: true,
      render: (caseItem) => <span className="font-medium">{caseItem.title}</span>,
    },
    {
      id: "dossier",
      label: "Case File",
      sortable: true,
      render: (caseItem) => (
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {caseItem.dossier}
        </span>
      ),
    },
    {
      id: "court",
      label: "Court",
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
      label: "Next hearing",
      sortable: true,
      render: (caseItem) => <span className="font-medium">{caseItem.nextHearing}</span>,
    },
    {
      id: "status",
      label: "Status",
      sortable: true,
      render: (caseItem) => (
        <InlineStatusSelector
          value={caseItem.status}
          onChange={(newStatus) => handleStatusChange(caseItem.id, newStatus)}
          statusOptions={[
            { value: "En cours", label: "In Progress", icon: "fas fa-hourglass-half", color: "blue" },
            { value: "En attente", label: "On Hold", icon: "fas fa-clock", color: "amber" },
            { value: "Suspendu", label: "Suspended", icon: "fas fa-pause-circle", color: "orange" },
            { value: "Clos", label: "Closed", icon: "fas fa-gavel", color: "slate" },
          ]}
          entityType="case"
          entityId={caseItem.id}
          entityData={caseItem}
        />
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (caseItem) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title="View details"
            onClick={(e) => {
              e.stopPropagation();
              handleView(caseItem.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(caseItem);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Delete"
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
    total: cases.length,
    active: cases.filter(c => c.status === "En cours").length,
    upcoming: cases.filter(c => {
      const hearingDate = new Date(c.nextHearing);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return hearingDate <= nextWeek && hearingDate >= new Date();
    }).length,
    closed: cases.filter(c => c.status === "TerminÃ©").length,
  };

  // Initialize advanced table
  const table = useAdvancedTable(cases, columns, {
    initialSortBy: "nextHearing",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["caseNumber", "title", "dossier", "court", "status"],
  });

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title="Cases" />
        {loadError && (
          <ContentSection>
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
              {loadError}
            </div>
          </ContentSection>
        )}
        <LoadingScreen variant="page" message="Chargement des cases..." />
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
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Delete case",
      message: "Are you sure you want to delete this case?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    })) {
      deleteCase(id);
      showToast("Case deleted", "warning", {
        title: "Deleted",
        context: "case",
      });
    }
  };

  const handleStatusChange = (id, newStatus) => {
    updateCase(id, { status: newStatus });
    showToast(`Status updated: ${getStatusLabel(newStatus)}`, "info", {
      title: "Case status",
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
        showToast("Case updated successfully!", "success");
      } else {
        const creation = await addCase(formData);
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        const createdRef = createdEntity?.caseNumber || createdEntity?.reference || formData.caseNumber;
        if (!createdId) throw new Error("Missing case identifier");
        showToast("Case added successfully!", "success");

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
        displayValue: editingCase.status,
        helpText: 'Status can only be changed using the selector in the list'
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Cases"
        subtitle={`${table.originalTotalItems} cases in total${table.isFiltering ? ` • ${table.totalItems} displayed` : ""}`}
        icon="fas fa-gavel"
        actions={
          <button
            onClick={handleAddCase}
            disabled={dossiers.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${dossiers.length === 0
                ? "bg-gray-400 cursor-not-allowed text-gray-200"
                : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={dossiers.length === 0 ? "Cannot create a case without dossiers. Please create a dossier first." : ""}
          >
            <i className="fas fa-plus"></i>
            New Case
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
          label="Total Cases"
          value={stats.total}
          icon="fas fa-gavel"
          color="purple"
        />
        <StatCard
          label="In Progress"
          value={stats.active}
          icon="fas fa-balance-scale"
          color="blue"
        />
        <StatCard
          label="Upcoming Hearings"
          value={stats.upcoming}
          icon="fas fa-calendar-week"
          color="amber"
          trendLabel="within 7 days"
        />
        <StatCard
          label="Completed"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "No results found" : "No cases found"}>
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
        title={editingCase ? "Edit Case" : "New Case"}
        subtitle={editingCase ? "Edit case information" : "Add a new case"}
        fields={populatedCaseFormFields}
        initialData={editingCase}
        isLoading={isLoading}
        entityType="case"
        entityId={editingCase?.id}
        editingEntity={editingCase}
        entities={{ clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Edit/Delete case"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.caseNumber || "Case"}
      />

      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName="change case linkage"
        impactSummary={validationResult?.impactSummary || []}
        entityName={editingCase?.caseNumber || ""}
      />
    </PageLayout>
  );
}
