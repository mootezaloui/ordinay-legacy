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
import { dossierFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import StatCard from "../components/dashboard/StatCard";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import InlinePrioritySelector from "../components/InlineSelectors/InlinePrioritySelector";
import LoadingScreen from "../components/loading/LoadingScreen";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";
import { useSettings } from "../contexts/SettingsContext";

export default function Dossiers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const {
    dossiers,
    clients,
    cases,
    tasks,
    sessions,
    officers,
    missions,
    financialEntries,
    addDossier,
    updateDossier,
    deleteDossier,
    deleteDossierCascade,
    loading,
    loadError
  } = useData();
  const { formatDate } = useSettings();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDossier, setEditingDossier] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Calculate stats
  const stats = {
    total: dossiers.length,
    open: dossiers.filter(d => d.status === "Open").length,
    closed: dossiers.filter(d => d.status === "Closed").length,
    highPriority: dossiers.filter(d => d.priority === "High").length,
  };

  // Define table columns
  const columns = [
    {
      id: "caseNumber",
      label: "Number",
      sortable: true,
      locked: true,
      render: (dossier) => (
        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
          {dossier.caseNumber}
        </span>
      ),
    },
    {
      id: "title",
      label: "Title",
      sortable: true,
      render: (dossier) => <span className="font-medium">{dossier.title}</span>,
    },
    {
      id: "client",
      label: "Client",
      sortable: true,
      render: (dossier) => dossier.client,
    },
    {
      id: "category",
      label: "Category",
      sortable: true,
      render: (dossier) => dossier.category,
    },
    {
      id: "status",
      label: "Status",
      sortable: true,
      render: (dossier) => (
        <InlineStatusSelector
          value={dossier.status}
          onChange={(newStatus) => handleStatusChange(dossier.id, newStatus)}
          statusOptions={[
            { value: "Open", label: "Open", icon: "fas fa-folder-open", color: "green" },
            { value: "In Progress", label: "In Progress", icon: "fas fa-spinner", color: "blue" },
            { value: "On Hold", label: "On Hold", icon: "fas fa-pause-circle", color: "amber" },
            { value: "Closed", label: "Closed", icon: "fas fa-check-circle", color: "slate" },
          ]}
          entityType="dossier"
          entityId={dossier.id}
          entityData={dossier}
        />
      ),
    },
    {
      id: "openDate",
      label: "Open Date",
      sortable: true,
      render: (dossier) => formatDate(dossier.openDate),
    },
    {
      id: "priority",
      label: "Priority",
      sortable: true,
      render: (dossier) => (
        <InlinePrioritySelector
          value={dossier.priority}
          onChange={(newPriority) => handlePriorityChange(dossier.id, newPriority)}
          entityType="dossier"
          entityId={dossier.id}
          entityData={dossier}
        />
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (dossier) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title="View details"
            onClick={(e) => {
              e.stopPropagation();
              handleView(dossier.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(dossier);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(dossier.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(dossiers, columns, {
    initialSortBy: "openDate",
    initialSortDirection: "desc",
    initialItemsPerPage: 10,
    searchableFields: ["caseNumber", "title", "client", "category", "status"],
  });

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title="Dossiers" />
        {loadError && (
          <ContentSection>
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
              {loadError}
            </div>
          </ContentSection>
        )}
        <LoadingScreen variant="page" message="Loading dossiers..." />
      </PageLayout>
    );
  }


  const handleView = (id) => {
    navigate(`/dossiers/${id}`);
  };

  const handleEdit = (dossier) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('dossier', dossier.id, 'edit', {
      data: dossier,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingDossier(dossier);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const dossier = dossiers.find(d => d.id === id);
    const result = canPerformAction('dossier', id, 'delete', {
      data: dossier,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setPendingDeleteId(id);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Delete Dossier",
      message: "Are you sure you want to delete this dossier?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    })) {
      deleteDossier(id);
      showToast("Dossier deleted", "warning", {
        title: "Deletion Successful",
        context: "dossier",
      });
    }
  };

  const handleForceDelete = async () => {
    if (!pendingDeleteId) return;

    setBlockerModalOpen(false);

    try {
      const result = await deleteDossierCascade(pendingDeleteId);

      if (!result || !result.ok) {
        console.error('[Dossiers.handleForceDelete] Cascade delete failed:', result);
        showToast("Error during cascade deletion", "error");
        return;
      }

      showToast("Dossier and all related entities deleted", "success", {
        title: "Cascade Deletion",
        context: "dossier",
      });

      setPendingDeleteId(null);
      setValidationResult(null);
      navigate("/dossiers");
    } catch (error) {
      console.error('[Dossiers.handleForceDelete] Error:', error);
      showToast("Error during cascade deletion", "error");
    }
  };

  const handleStatusChange = (id, newStatus) => {
    updateDossier(id, { status: newStatus });
    showToast(`Status updated: ${newStatus}`, "info", {
      title: "Dossier Status",
      context: "dossier",
    });
  };

  const handlePriorityChange = (id, newPriority) => {
    updateDossier(id, { priority: newPriority });
    showToast(`Priority updated: ${newPriority}`, "info", {
      title: "Dossier Priority",
      context: "dossier",
    });
  };

  const handleAddDossier = () => {
    setEditingDossier(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ?. Validate before submitting
    if (editingDossier) {
      const result = canPerformAction('dossier', editingDossier.id, 'edit', {
        data: editingDossier,
        newData: formData,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
      })

      if (!result.allowed) {
        setValidationResult(result)
        setBlockerModalOpen(true)
        return
      }

      if (result.requiresConfirmation) {
        setValidationResult(result)
        setPendingFormData(formData)
        setConfirmImpactModalOpen(true)
        return
      }
    } else {
      const result = canPerformAction('dossier', null, 'add', {
        formData,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
      })
      if (!result.allowed) {
        setValidationResult(result)
        setBlockerModalOpen(true)
        return
      }
      if (result.requiresConfirmation) {
        setValidationResult(result)
        setPendingFormData(formData)
        setConfirmImpactModalOpen(true)
        return
      }
    }

    await performSave(formData)
  }

  const performSave = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingDossier) {
        updateDossier(editingDossier.id, formData);
        showToast("Dossier updated successfully!", "success");
      } else {
        const creation = await addDossier(formData);
        const createdEntity = creation?.created || creation;
        const createdId = createdEntity?.id;
        const createdCaseNumber = createdEntity?.caseNumber || createdEntity?.reference || formData.caseNumber;
        if (!createdId) throw new Error("Missing dossier identifier");
        showToast("Dossier added successfully!", "success");

        logEntityCreation('dossier', createdId, createdCaseNumber);

        const detailRoute = resolveDetailRoute('dossier', createdId);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingDossier(null);
    } catch (error) {
      console.error("Error submitting dossier:", error);
      showToast("Error during saving", "error");
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

    const rows = table.allData.map(dossier =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = col.id === "openDate"
            ? formatDate(dossier.openDate)
            : dossier[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossiers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Populate client options and protect status field in edit mode
  const dossierFields = dossierFormFields.map(field => {
    if (field.name === "clientId") {
      return {
        ...field,
        options: clients.map(client => ({
          value: client.id,
          label: client.name
        }))
      };
    }
    // Protect status field in edit mode
    if (field.name === "status" && editingDossier) {
      return {
        ...field,
        type: 'readonly',
        displayValue: editingDossier.status,
        helpText: 'The status can only be changed via the selector in the list'
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Dossiers"
        subtitle={`${table.originalTotalItems} dossiers au total${table.isFiltering ? ` • ${table.totalItems} affichés` : ""}`}
        icon="fas fa-folder-open"
        actions={
          <button
            onClick={handleAddDossier}
            disabled={clients.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 ${clients.length === 0
              ? "bg-gray-400 cursor-not-allowed text-gray-200"
              : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            title={clients.length === 0 ? "Add a client first before creating a dossier." : ""}
          >
            <i className="fas fa-plus"></i>
            New Dossier
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Dossiers"
          value={stats.total}
          icon="fas fa-folder-open"
          color="blue"
        />
        <StatCard
          label="Open Dossiers"
          value={stats.open}
          icon="fas fa-folder"
          color="green"
        />
        <StatCard
          label="Closed Dossiers"
          value={stats.closed}
          icon="fas fa-check-circle"
          color="amber"
        />
        <StatCard
          label="High Priority"
          value={stats.highPriority}
          icon="fas fa-exclamation-triangle"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "No results found" : clients.length === 0 ? "Add a client first before creating a dossier." : "No dossiers found"}>
            {table.data.map((dossier) => (
              <TableRow
                key={dossier.id}
                onClick={() => handleView(dossier.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(dossier) : dossier[column.id]}
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
          setEditingDossier(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("dossier", !!editingDossier)}
        subtitle={editingDossier ? "Edit Dossier's informations" : "Create a new Dossier"}
        fields={dossierFields}
        initialData={editingDossier}
        isLoading={isLoading}
        entityType="dossier"
        entityId={editingDossier?.id}
        editingEntity={editingDossier}
        entities={{ clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => {
          setBlockerModalOpen(false);
          setPendingDeleteId(null);
          setValidationResult(null);
        }}
        actionName="Edit/Delete dossier"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.caseNumber || "Dossier"}
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
        actionName="Edit dossier attachment"
        impactSummary={validationResult?.impactSummary || []}
        entityName={editingDossier?.caseNumber || ""}
      />
    </PageLayout>
  );
}
