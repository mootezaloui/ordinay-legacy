import { useState, useMemo } from "react";
import { useAdvancedTable } from "../../../hooks/useAdvancedTable";
import Table from "../../table/Table";
import AdvancedTableHeader from "../../table/AdvancedTableHeader";
import TableBody from "../../table/TableBody";
import TableRow from "../../table/TableRow";
import TableCell from "../../table/TableCell";
import TableActions, { IconButton } from "../../table/TableActions";
import TableToolbar from "../../table/TableToolbar";
import Pagination from "../../table/Pagination";
import FormModal from "../../FormModal/FormModal";
import {
  financialEntryFormFields,
  getFormTitle,
  populateRelationshipOptions,
} from "../../FormModal/formConfigs";
import { mockClients, mockDossiers, mockCases } from "../../../utils/mockData";
import {
  financialLedger,
  addFinancialEntry,
  updateFinancialEntry,
  deleteFinancialEntry,
  financialCategories,
  financialStatuses,
} from "../../../utils/financialData";
import {
  getFinancialEntriesForDisplay,
  formatCurrency,
  getClientFinancialSummary,
  getDossierFinancialSummary,
  getCaseFinancialSummary,
  getClientBalanceDetails,
} from "../../../utils/financialUtils";
import InlineStatusSelector from "../../InlineSelectors/InlineStatusSelector";

/**
 * FinancialTab Component
 *
 * Displays financial information for Client, Dossier, or Procès entities.
 * This is a VIEW over the financial ledger - it does NOT store any financial data.
 *
 * Props:
 * - entityType: "client" | "dossier" | "case"
 * - entityId: The ID of the entity
 * - entityData: The entity data (for context)
 * - onUpdate: Callback when financial data changes
 */
export default function FinancialTab({ entityType, entityId, entityData, onUpdate }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Get financial summary based on entity type
  const summary = useMemo(() => {
    if (entityType === "client") {
      return getClientFinancialSummary(entityId);
    } else if (entityType === "dossier") {
      return getDossierFinancialSummary(entityId);
    } else if (entityType === "case") {
      return getCaseFinancialSummary(entityId);
    }
    return null;
  }, [entityType, entityId, refreshKey]);

  // Get client balance details (only for clients)
  const balanceDetails = useMemo(() => {
    if (entityType === "client") {
      return getClientBalanceDetails(entityId);
    }
    return null;
  }, [entityType, entityId, refreshKey]);

  // Get filtered entries for this entity
  const entries = useMemo(() => {
    const filters = { scope: "client" };

    if (entityType === "client") {
      filters.clientId = entityId;
    } else if (entityType === "dossier") {
      filters.dossierId = entityId;
    } else if (entityType === "case") {
      filters.caseId = entityId;
    }

    return getFinancialEntriesForDisplay(filters);
  }, [entityType, entityId, refreshKey]);

  // Handler functions (defined before columns to avoid hoisting issues)
  const handleView = (entry) => {
    setSelectedEntry(entry);
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette écriture ?")) {
      deleteFinancialEntry(id);
      setRefreshKey((k) => k + 1);
      setSelectedEntry(null);
      if (onUpdate) onUpdate();
    }
  };

  const handleStatusChange = (id, newStatus) => {
    updateFinancialEntry(id, { status: newStatus });
    setRefreshKey((k) => k + 1);

    // Update selected entry if it's the one being modified
    if (selectedEntry?.id === id) {
      const updatedEntries = getFinancialEntriesForDisplay();
      const updatedEntry = updatedEntries.find((e) => e.id === id);
      setSelectedEntry(updatedEntry);
    }

    if (onUpdate) onUpdate();
  };

  const handleCloseDetail = () => {
    setSelectedEntry(null);
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
          <span
            className={`mt-1 px-2 py-0.5 rounded-full text-xs font-medium inline-block w-fit bg-${entry.categoryColor}-100 text-${entry.categoryColor}-800 dark:bg-${entry.categoryColor}-900/30 dark:text-${entry.categoryColor}-300`}
          >
            {entry.categoryLabel}
          </span>
        </div>
      ),
    },
    {
      id: "type",
      label: "Type",
      sortable: true,
      render: (entry) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            entry.type === "revenue"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
          }`}
        >
          {entry.type === "revenue" ? "Recette" : "Dépense"}
        </span>
      ),
    },
    {
      id: "amount",
      label: "Montant",
      sortable: true,
      render: (entry) => (
        <span
          className={`font-semibold ${
            entry.type === "revenue"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
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
            {
              value: "draft",
              label: "Brouillon",
              icon: "fas fa-file",
              color: "text-gray-600",
            },
            {
              value: "confirmed",
              label: "Confirmé",
              icon: "fas fa-check-circle",
              color: "text-blue-600",
            },
            {
              value: "paid",
              label: "Payé",
              icon: "fas fa-check-double",
              color: "text-green-600",
            },
          ]}
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
            icon="view"
            variant="view"
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(entry);
            }}
          />
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
  ], [handleStatusChange]);

  // Initialize advanced table
  const table = useAdvancedTable(entries, columns, {
    initialSortBy: "date",
    initialSortDirection: "desc",
    initialItemsPerPage: 10,
    searchableFields: ["description", "categoryLabel"],
  });

  const handleAddEntry = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingEntry) {
        // Update existing entry
        updateFinancialEntry(editingEntry.id, formData);
        alert("Écriture modifiée avec succès!");
      } else {
        // Add new entry with entity context
        const client = formData.clientId
          ? mockClients.find((c) => c.id === parseInt(formData.clientId))
          : entityType === "client"
          ? mockClients.find((c) => c.id === entityId)
          : null;

        const dossier = formData.dossierId
          ? mockDossiers.find((d) => d.id === parseInt(formData.dossierId))
          : entityType === "dossier"
          ? mockDossiers.find((d) => d.id === entityId)
          : null;

        const caseItem = formData.caseId
          ? mockCases.find((c) => c.id === parseInt(formData.caseId))
          : entityType === "case"
          ? mockCases.find((c) => c.id === entityId)
          : null;

        const newEntry = {
          ...formData,
          clientId: client ? client.id : null,
          clientName: client ? client.name : null,
          dossierId: dossier ? dossier.id : null,
          dossierReference: dossier ? dossier.caseNumber : null,
          caseId: caseItem ? caseItem.id : null,
          caseReference: caseItem ? caseItem.caseNumber : null,
          sourceType: "manual",
          sourceId: null,
        };

        addFinancialEntry(newEntry);
        alert("Écriture ajoutée avec succès!");
      }

      setRefreshKey((k) => k + 1);
      setIsModalOpen(false);
      setEditingEntry(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error submitting entry:", error);
      alert("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  // Populate relationship options for form
  const entryFields = useMemo(() => {
    const fields = populateRelationshipOptions(financialEntryFormFields, {
      clients: mockClients,
      dossiers: mockDossiers,
      cases: mockCases,
    });

    // Pre-fill and lock entity context when adding new entry from entity detail view
    if (!editingEntry && entityType) {
      return fields.map((field) => {
        // For client detail view: pre-fill and disable clientId, also disable dossier/case
        if (entityType === "client") {
          if (field.name === "clientId") {
            return { ...field, defaultValue: entityId, disabled: true };
          }
          // Get client's dossiers and cases for optional selection
          const client = mockClients.find(c => c.id === entityId);
          if (field.name === "dossierId" && client) {
            const clientDossiers = mockDossiers.filter(d => d.clientId === entityId);
            return {
              ...field,
              options: clientDossiers.map(d => ({ value: d.id, label: d.caseNumber }))
            };
          }
          if (field.name === "caseId" && client) {
            const clientCases = mockCases.filter(c => c.clientId === entityId);
            return {
              ...field,
              options: clientCases.map(c => ({ value: c.id, label: c.caseNumber }))
            };
          }
        }

        // For dossier detail view: pre-fill and disable dossierId AND clientId
        if (entityType === "dossier") {
          const dossier = mockDossiers.find(d => d.id === entityId);
          if (field.name === "dossierId") {
            return { ...field, defaultValue: entityId, disabled: true };
          }
          if (field.name === "clientId" && dossier) {
            return { ...field, defaultValue: dossier.clientId, disabled: true };
          }
          // Only allow cases from this dossier's client
          if (field.name === "caseId" && dossier) {
            const dossierCases = mockCases.filter(c => c.clientId === dossier.clientId);
            return {
              ...field,
              options: dossierCases.map(c => ({ value: c.id, label: c.caseNumber }))
            };
          }
        }

        // For case detail view: pre-fill and disable caseId AND clientId
        if (entityType === "case") {
          const caseItem = mockCases.find(c => c.id === entityId);
          if (field.name === "caseId") {
            return { ...field, defaultValue: entityId, disabled: true };
          }
          if (field.name === "clientId" && caseItem) {
            return { ...field, defaultValue: caseItem.clientId, disabled: true };
          }
          // Only allow dossiers from this case's client
          if (field.name === "dossierId" && caseItem) {
            const caseDossiers = mockDossiers.filter(d => d.clientId === caseItem.clientId);
            return {
              ...field,
              options: caseDossiers.map(d => ({ value: d.id, label: d.caseNumber }))
            };
          }
        }

        return field;
      });
    }

    return fields;
  }, [editingEntry, entityType, entityId]);

  return (
    <div className="space-y-6">
      {/* Financial Summary Cards */}
      {entityType === "client" && balanceDetails && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Honoraires
              </span>
              <i className="fas fa-money-bill-wave text-emerald-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.honoraires)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Frais remboursables
              </span>
              <i className="fas fa-file-invoice text-blue-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.reimbursableExpenses)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Avances reçues
              </span>
              <i className="fas fa-hand-holding-usd text-indigo-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.totalPaid)}
            </div>
          </div>

          <div
            className={`bg-white dark:bg-slate-800 rounded-lg border-2 p-4 ${
              balanceDetails.balance > 0
                ? "border-orange-300 dark:border-orange-700"
                : balanceDetails.balance < 0
                ? "border-green-300 dark:border-green-700"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Solde client
              </span>
              <i
                className={`fas fa-balance-scale ${
                  balanceDetails.balance > 0
                    ? "text-orange-500"
                    : balanceDetails.balance < 0
                    ? "text-green-500"
                    : "text-slate-500"
                }`}
              ></i>
            </div>
            <div
              className={`text-2xl font-bold ${
                balanceDetails.balance > 0
                  ? "text-orange-600 dark:text-orange-400"
                  : balanceDetails.balance < 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-slate-900 dark:text-white"
              }`}
            >
              {formatCurrency(Math.abs(balanceDetails.balance))}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {balanceDetails.balance > 0
                ? "Client doit"
                : balanceDetails.balance < 0
                ? "Crédit client"
                : "Soldé"}
            </div>
          </div>
        </div>
      )}

      {/* Summary for Dossier/Case */}
      {(entityType === "dossier" || entityType === "case") && summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Recettes
              </span>
              <i className="fas fa-arrow-down text-emerald-500"></i>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.totalRevenue)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Dépenses
              </span>
              <i className="fas fa-arrow-up text-rose-500"></i>
            </div>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(summary.totalExpense)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Solde net
              </span>
              <i className="fas fa-balance-scale text-blue-500"></i>
            </div>
            <div
              className={`text-2xl font-bold ${
                summary.netBalance >= 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCurrency(summary.netBalance)}
            </div>
          </div>
        </div>
      )}

      {/* Entries Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Écritures comptables ({entries.length})
          </h3>
          <button
            onClick={handleAddEntry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 text-sm"
          >
            <i className="fas fa-plus"></i>
            Nouvelle écriture
          </button>
        </div>

        <TableToolbar
          searchQuery={table.searchQuery}
          onSearchChange={table.setSearchQuery}
          columns={table.allColumns}
          visibleColumns={table.visibleColumns}
          onToggleColumn={table.toggleColumnVisibility}
          onResetColumns={table.resetColumns}
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
          <TableBody
            isEmpty={table.data.length === 0}
            emptyMessage={
              table.isFiltering
                ? "Aucun résultat trouvé"
                : "Aucune écriture comptable"
            }
          >
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
      </div>

      {/* Add/Edit Form Modal */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("financialEntry", !!editingEntry)}
        subtitle={
          editingEntry
            ? "Modifier l'écriture comptable"
            : "Créer une nouvelle écriture"
        }
        fields={entryFields}
        initialData={editingEntry}
        isLoading={isLoading}
      />

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      selectedEntry.type === "revenue"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                    }`}
                  >
                    {selectedEntry.type === "revenue" ? "Recette" : "Dépense"}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium bg-${selectedEntry.statusColor}-100 text-${selectedEntry.statusColor}-800 dark:bg-${selectedEntry.statusColor}-900/30 dark:text-${selectedEntry.statusColor}-300`}
                  >
                    {selectedEntry.statusLabel}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {selectedEntry.amountFormatted}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  {selectedEntry.description}
                </p>
              </div>
              <button
                onClick={handleCloseDetail}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <i className="fas fa-times text-slate-600 dark:text-slate-400"></i>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Entry Details */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Détails de l'écriture
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Date
                    </label>
                    <p className="text-slate-900 dark:text-white font-medium">
                      {selectedEntry.date}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Catégorie
                    </label>
                    <p className="text-slate-900 dark:text-white font-medium">
                      <i className={`${financialCategories[selectedEntry.category]?.icon} mr-2`}></i>
                      {selectedEntry.categoryLabel}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Statut
                    </label>
                    <div className="flex gap-2 mt-1">
                      <select
                        value={selectedEntry.status}
                        onChange={(e) => handleStatusChange(selectedEntry.id, e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {Object.keys(financialStatuses).map((status) => (
                          <option key={status} value={status}>
                            {financialStatuses[status].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Montant
                    </label>
                    <p
                      className={`text-2xl font-bold ${
                        selectedEntry.type === "revenue"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {selectedEntry.amountWithSign}
                    </p>
                  </div>
                  {selectedEntry.clientName && (
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Client
                      </label>
                      <p className="text-slate-900 dark:text-white font-medium">
                        {selectedEntry.clientName}
                      </p>
                    </div>
                  )}
                  {selectedEntry.dossierReference && (
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Dossier
                      </label>
                      <p className="text-slate-900 dark:text-white font-medium">
                        {selectedEntry.dossierReference}
                      </p>
                    </div>
                  )}
                  {selectedEntry.caseReference && (
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Procès
                      </label>
                      <p className="text-slate-900 dark:text-white font-medium">
                        {selectedEntry.caseReference}
                      </p>
                    </div>
                  )}
                  {selectedEntry.createdBy && (
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Créé par
                      </label>
                      <p className="text-slate-900 dark:text-white font-medium">
                        {selectedEntry.createdBy}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Description
                </h3>
                <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg">
                  {selectedEntry.description}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    setSelectedEntry(null);
                    handleEdit(selectedEntry);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center justify-center gap-2"
                >
                  <i className="fas fa-edit"></i>
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(selectedEntry.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                >
                  <i className="fas fa-trash"></i>
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
