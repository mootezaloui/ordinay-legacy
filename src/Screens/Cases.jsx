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
import { mockDossiers } from "../utils/mockData";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import ConfirmImpactModal from "../components/ui/ConfirmImpactModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";

export default function Cases() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { cases, addCase, updateCase, deleteCase } = useData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);

  // Define table columns
  const columns = [
    {
      id: "caseNumber",
      label: "N° Procès",
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
      label: "Titre",
      sortable: true,
      render: (caseItem) => <span className="font-medium">{caseItem.title}</span>,
    },
    {
      id: "dossier",
      label: "Dossier",
      sortable: true,
      render: (caseItem) => (
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {caseItem.dossier}
        </span>
      ),
    },
    {
      id: "court",
      label: "Tribunal",
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
      label: "Prochaine audience",
      sortable: true,
      render: (caseItem) => <span className="font-medium">{caseItem.nextHearing}</span>,
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (caseItem) => (
        <InlineStatusSelector
          value={caseItem.status}
          onChange={(newStatus) => handleStatusChange(caseItem.id, newStatus)}
          statusOptions={[
            { value: "En cours", label: "En cours", icon: "fas fa-hourglass-half", color: "blue" },
            { value: "En attente", label: "En attente", icon: "fas fa-clock", color: "amber" },
            { value: "Suspendu", label: "Suspendu", icon: "fas fa-pause-circle", color: "orange" },
            { value: "Clos", label: "Clos", icon: "fas fa-gavel", color: "slate" },
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
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(caseItem.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(caseItem);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Supprimer"
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
    closed: cases.filter(c => c.status === "Terminé").length,
  };

  // Initialize advanced table
  const table = useAdvancedTable(cases, columns, {
    initialSortBy: "nextHearing",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["caseNumber", "title", "dossier", "court", "status"],
  });

  const handleView = (id) => {
    navigate(`/cases/${id}`);
  };

  const handleEdit = (caseItem) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('case', caseItem.id, 'edit', { data: caseItem });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingCase(caseItem);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const caseItem = cases.find(c => c.id === id);
    const result = canPerformAction('case', id, 'delete', { data: caseItem });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Supprimer le procès",
      message: "Êtes-vous sûr de vouloir supprimer ce procès ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      deleteCase(id);
      showToast("Procès supprimé", "warning", {
        title: "Suppression",
        context: "case",
      });
    }
  };

  const handleStatusChange = (id, newStatus) => {
    updateCase(id, { status: newStatus });
    showToast(`Statut mis a jour: ${newStatus}`, "info", {
      title: "Statut du proces",
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
        newData: formData
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
      const result = canPerformAction('case', null, 'add', { formData });
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
        updateCase(editingCase.id, formData);
        showToast("Procès modifié avec succès!", "success");
      } else {
        const dossier = mockDossiers.find(d => d.id === parseInt(formData.dossierId));
        const newCase = {
          ...formData,
          id: Date.now(),
          dossier: dossier ? dossier.caseNumber : "N/A",
        };
        addCase(newCase);
        showToast("Procès ajouté avec succès!", "success");

        // ✅ Log creation event
        logEntityCreation('case', newCase.id, newCase.caseNumber);

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('case', newCase.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingCase(null);
    } catch (error) {
      console.error("Error submitting case:", error);
      showToast("Erreur lors de l'enregistrement", "error");
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
        options: mockDossiers.map(d => ({
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
        helpText: 'Le statut ne peut être modifié que via le sélecteur dans la liste'
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Procès"
        subtitle={`${table.originalTotalItems} procès au total${table.isFiltering ? ` • ${table.totalItems} affichés` : ""}`}
        icon="fas fa-gavel"
        actions={
          <button
            onClick={handleAddCase}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Procès
          </button>
        }
      />
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Procès"
          value={stats.total}
          icon="fas fa-gavel"
          color="purple"
        />
        <StatCard
          label="En cours"
          value={stats.active}
          icon="fas fa-balance-scale"
          color="blue"
        />
        <StatCard
          label="Audiences Proches"
          value={stats.upcoming}
          icon="fas fa-calendar-week"
          color="amber"
          trendLabel="dans les 7 jours"
        />
        <StatCard
          label="Terminés"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucun procès trouvé"}>
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
        title={editingCase ? "Modifier Procès" : "Nouveau Procès"}
        subtitle={editingCase ? "Modifier les informations du procès" : "Ajouter un nouveau procès"}
        fields={populatedCaseFormFields}
        initialData={editingCase}
        isLoading={isLoading}
        entityType="case"
        entityId={editingCase?.id}
        editingEntity={editingCase}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Modifier/Supprimer le procès"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.caseNumber || "Procès"}
      />

      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName="modifier le rattachement du procès"
        impactSummary={validationResult?.impactSummary || []}
        entityName={editingCase?.caseNumber || ""}
      />
    </PageLayout>
  );
}
