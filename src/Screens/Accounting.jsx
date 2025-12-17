import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
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
import { financialEntryFormFields, getFormTitle, populateRelationshipOptions } from "../components/FormModal/formConfigs";
import { mockClients, mockDossiers, mockCases } from "../utils/mockData";
import {
  financialLedger,
  addFinancialEntry,
  updateFinancialEntry,
  deleteFinancialEntry,
  financialCategories,
  financialStatuses,
} from "../utils/financialData";
import {
  getFinancialEntriesForDisplay,
  getAccountingStatistics,
  formatCurrency,
} from "../utils/financialUtils";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import { canPerformAction } from "../services/domainRules";

export default function Accounting() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // Use financial ledger as source of truth
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterScope, setFilterScope] = useState("all"); // all, client, internal
  const [refreshKey, setRefreshKey] = useState(0); // Trigger re-renders on data changes
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Get display entries with computed fields
  const displayEntries = useMemo(() => {
    let filtered = getFinancialEntriesForDisplay();

    // Apply scope filter
    if (filterScope !== "all") {
      filtered = filtered.filter(e => e.scope === filterScope);
    }

    return filtered;
  }, [filterScope, refreshKey]);

  // Calculate statistics from ledger
  const stats = useMemo(() => {
    return getAccountingStatistics();
  }, [refreshKey]);

  // Get priority items (entries needing attention)
  const priorityItems = useMemo(() => {
    const today = new Date();
    const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

    return displayEntries
      .filter(entry => {
        // Show unpaid/unconfirmed entries
        if (entry.status === 'paid') return false;

        // Show recent or upcoming entries
        const entryDate = new Date(entry.date);
        return entryDate <= threeDaysFromNow;
      })
      .sort((a, b) => {
        // Sort by status priority (draft > confirmed > paid)
        const statusOrder = { draft: 0, confirmed: 1, paid: 2 };
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        return new Date(a.date) - new Date(b.date);
      })
      .slice(0, 10);
  }, [displayEntries]);

  // Handler functions (defined before columns to avoid hoisting issues)
  const handleView = (entry) => {
    navigate(`/accounting/${entry.id}`);
  };

  const handleEdit = (entry) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('financialEntry', entry.id, 'edit', { data: entry });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const entry = displayEntries.find(e => e.id === id);
    const result = canPerformAction('financialEntry', id, 'delete', { data: entry });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Supprimer l'écriture",
      message: "Êtes-vous sûr de vouloir supprimer cette écriture comptable ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      deleteFinancialEntry(id);
      setRefreshKey((k) => k + 1); // Trigger re-render
    }
  };

  const handleStatusChange = (id, newStatus) => {
    // ✅ Validate before allowing status change
    const entry = displayEntries.find(e => e.id === id);
    const result = canPerformAction('financialEntry', id, 'changeStatus', {
      data: entry,
      newValue: newStatus,
      currentValue: entry?.status
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    updateFinancialEntry(id, { status: newStatus });
    setRefreshKey((k) => k + 1); // Trigger re-render
  };

  // Define table columns (memoized to ensure handler closures are stable)
  const columns = useMemo(() => [
    {
      id: "date",
      label: "Date",
      sortable: true,
      locked: true,
      render: (entry) => (
        <span className="text-sm font-medium text-slate-900 dark:text-white">
          {entry.date}
        </span>
      ),
    },
    {
      id: "description",
      label: "Description",
      sortable: true,
      render: (entry) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900 dark:text-white">
            {entry.description}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${entry.categoryColor}-100 text-${entry.categoryColor}-800 dark:bg-${entry.categoryColor}-900/30 dark:text-${entry.categoryColor}-300`}>
              {entry.categoryLabel}
            </span>
            {entry.scope === 'internal' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300">
                Bureau
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "entityReference",
      label: "Client / Dossier",
      sortable: true,
      render: (entry) => (
        <div className="flex flex-col text-sm">
          {entry.clientName && (
            <span className="font-medium text-slate-900 dark:text-white">
              {entry.clientName}
            </span>
          )}
          {entry.dossierReference && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {entry.dossierReference}
            </span>
          )}
          {entry.caseReference && (
            <span className="text-xs text-blue-600 dark:text-blue-400">
              {entry.caseReference}
            </span>
          )}
          {!entry.clientName && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Interne
            </span>
          )}
        </div>
      ),
    },
    {
      id: "type",
      label: "Type",
      sortable: true,
      render: (entry) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${entry.type === "revenue"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
          }`}>
          {entry.type === "revenue" ? "Recette" : "Dépense"}
        </span>
      ),
    },
    {
      id: "amount",
      label: "Montant",
      sortable: true,
      render: (entry) => (
        <span className={`font-semibold ${entry.type === "revenue"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
          }`}>
          {entry.amountWithSign}
        </span>
      ),
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (entry) => (
        <InlineStatusSelector
          value={entry.status}
          onChange={(newStatus) => handleStatusChange(entry.id, newStatus)}
          statusOptions={[
            { value: "draft", label: "Brouillon", icon: "fas fa-file", color: "slate" },
            { value: "confirmed", label: "Confirmé", icon: "fas fa-check-circle", color: "blue" },
            { value: "paid", label: "Payé", icon: "fas fa-check-double", color: "green" },
            { value: "cancelled", label: "Annulé", icon: "fas fa-times-circle", color: "red" },
          ]}
          entityType="financialEntry"
          entityId={entry.id}
          entityData={entry}
        />
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (entry) => (
        <TableActions>
          <IconButton
            icon="edit"
            variant="edit"
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(entry);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(entry.id);
            }}
          />
        </TableActions>
      ),
    },
  ], [handleStatusChange, handleEdit, handleDelete]);

  // Initialize advanced table
  const table = useAdvancedTable(displayEntries, columns, {
    initialSortBy: "date",
    initialSortDirection: "desc",
    initialItemsPerPage: 25,
    searchableFields: ["description", "clientName", "dossierReference", "caseReference", "categoryLabel"],
  });

  const handleAddEntry = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ✅ Validate before submitting (EDIT mode only)
    if (editingEntry) {
      const result = canPerformAction('financialEntry', editingEntry.id, 'edit', {
        data: editingEntry,
        newData: formData
      });

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
    }

    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingEntry) {
        // Update existing entry
        updateFinancialEntry(editingEntry.id, formData);
        showToast("Écriture modifiée avec succès!", "success");
      } else {
        // Add new entry
        // Resolve relationship names
        const client = formData.clientId ? mockClients.find(c => c.id === parseInt(formData.clientId)) : null;
        const dossier = formData.dossierId ? mockDossiers.find(d => d.id === parseInt(formData.dossierId)) : null;
        const caseItem = formData.caseId ? mockCases.find(c => c.id === parseInt(formData.caseId)) : null;

        const newEntry = {
          ...formData,
          clientId: client ? client.id : null,
          clientName: client ? client.name : null,
          dossierId: dossier ? dossier.id : null,
          dossierReference: dossier ? dossier.caseNumber : null,
          caseId: caseItem ? caseItem.id : null,
          caseReference: caseItem ? caseItem.caseNumber : null,
        };

        addFinancialEntry(newEntry);
        showToast("Écriture ajoutée avec succès!", "success");
      }

      setRefreshKey((k) => k + 1); // Trigger re-render
      setIsModalOpen(false);
      setEditingEntry(null);
    } catch (error) {
      console.error("Error submitting entry:", error);
      showToast("Erreur lors de l'enregistrement", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const headers = table.columns
      .filter(col => col.id !== "actions")
      .map(col => col.label)
      .join(",");

    const rows = table.allData.map(entry =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          let value = entry[col.id] || "";
          if (col.id === "amount") value = entry.amount;
          if (col.id === "type") value = entry.type === "revenue" ? "Recette" : "Dépense";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comptabilite-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Populate relationship options
  const entryFields = populateRelationshipOptions(financialEntryFormFields, {
    clients: mockClients,
    dossiers: mockDossiers,
    cases: mockCases,
  });

  return (
    <PageLayout>
      <PageHeader
        title="Comptabilité"
        subtitle={`${table.originalTotalItems} écritures au total${table.isFiltering ? ` • ${table.totalItems} affichées` : ""}`}
        icon="fas fa-calculator"
        actions={
          <button
            onClick={handleAddEntry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouvelle Écriture
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Recettes totales"
          value={formatCurrency(stats.totalClientRevenue)}
          icon="fas fa-arrow-down"
          color="emerald"
          trendLabel="Clients"
        />
        <StatCard
          label="Dépenses clients"
          value={formatCurrency(stats.totalClientExpense)}
          icon="fas fa-arrow-up"
          color="blue"
          trendLabel="Remboursables"
        />
        <StatCard
          label="Dépenses bureau"
          value={formatCurrency(stats.totalInternalExpense)}
          icon="fas fa-building"
          color="orange"
          trendLabel="Internes"
        />
        <StatCard
          label="Solde net"
          value={formatCurrency(stats.netProfit)}
          icon="fas fa-balance-scale"
          color={stats.netProfit >= 0 ? "green" : "red"}
          trendLabel={stats.netProfit >= 0 ? "Positif" : "Négatif"}
        />
      </div>

      {/* Scope Filter */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilterScope("all")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterScope === "all"
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
        >
          Toutes
        </button>
        <button
          onClick={() => setFilterScope("client")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterScope === "client"
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
        >
          Clients
        </button>
        <button
          onClick={() => setFilterScope("internal")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterScope === "internal"
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
        >
          Bureau
        </button>
      </div>

      {/* Priority Items Section */}
      {priorityItems.length > 0 && (
        <ContentSection title={`À Traiter en Priorité (${priorityItems.length})`}>
          <div className="p-6">
            <div className="space-y-3">
              {priorityItems.slice(0, 5).map((entry) => {
                const isDraft = entry.status === 'draft';
                const isConfirmed = entry.status === 'confirmed';

                return (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${isDraft
                      ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                      : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                      }`}
                    onClick={() => handleView(entry)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${isDraft ? "bg-amber-500" : "bg-blue-500"
                          }`} />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {entry.description}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            {entry.entityReference} • {entry.date}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold ${entry.type === "revenue"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                          }`}>
                          {entry.amountWithSign}
                        </div>
                        <div className={`text-xs px-2 py-1 rounded-full inline-block bg-${entry.statusColor}-100 text-${entry.statusColor}-800 dark:bg-${entry.statusColor}-900/30 dark:text-${entry.statusColor}-300`}>
                          {entry.statusLabel}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {priorityItems.length > 5 && (
              <div className="mt-4 text-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Et {priorityItems.length - 5} autres éléments...
                </span>
              </div>
            )}
          </div>
        </ContentSection>
      )}

      {/* Entries Table */}
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucune écriture trouvée"}>
            {table.data.map((entry) => (
              <TableRow
                key={entry.id}
                onClick={() => handleView(entry)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(entry) : entry[column.id]}
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
          setEditingEntry(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("financialEntry", !!editingEntry)}
        subtitle={editingEntry ? "Modifier l'écriture comptable" : "Créer une nouvelle écriture"}
        fields={entryFields}
        initialData={editingEntry}
        isLoading={isLoading}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Modifier/Supprimer l'écriture financière"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.description || "Écriture"}
      />
    </PageLayout>
  );
}
