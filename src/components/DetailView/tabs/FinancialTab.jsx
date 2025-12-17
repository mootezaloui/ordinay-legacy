import { useState, useMemo } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
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
import { mockClients, mockDossiers, mockCases, getAllMissions } from "../../../utils/mockData";
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
  getOfficerFinancialSummary,
  getPersonalTaskFinancialSummary,
  getMissionFinancialSummary,
  getClientBalanceDetails,
} from "../../../utils/financialUtils";
import InlineStatusSelector from "../../InlineSelectors/InlineStatusSelector";
import BlockerModal from "../../ui/BlockerModal";
import { canPerformAction } from "../../../services/domainRules";

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
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Get financial summary based on entity type
  const summary = useMemo(() => {
    if (entityType === "client") {
      return getClientFinancialSummary(entityId);
    } else if (entityType === "dossier") {
      return getDossierFinancialSummary(entityId);
    } else if (entityType === "case") {
      return getCaseFinancialSummary(entityId);
    } else if (entityType === "officer") {
      // For officers (huissiers), get all mission expenses
      return getOfficerFinancialSummary(entityId);
    } else if (entityType === "mission") {
      // For missions, get mission-specific financial entries
      return getMissionFinancialSummary(entityId);
    } else if (entityType === "personalTask") {
      // For personal tasks, get internal expenses
      return getPersonalTaskFinancialSummary(entityId);
    } else if (entityType === "task") {
      // For tasks, get financial data based on parent relationship
      if (entityData.parentType === "case" && entityData.caseId) {
        return getCaseFinancialSummary(entityData.caseId);
      } else if (entityData.dossierId) {
        return getDossierFinancialSummary(entityData.dossierId);
      }
    }
    return null;
  }, [entityType, entityId, entityData, refreshKey]);

  // Get client balance details (only for clients)
  const balanceDetails = useMemo(() => {
    if (entityType === "client") {
      return getClientBalanceDetails(entityId);
    }
    return null;
  }, [entityType, entityId, refreshKey]);

  // Get filtered entries for this entity
  const entries = useMemo(() => {
    let filters = {};

    if (entityType === "client") {
      filters = { scope: "client", clientId: entityId };
    } else if (entityType === "dossier") {
      filters = { scope: "client", dossierId: entityId };
    } else if (entityType === "case") {
      filters = { scope: "client", caseId: entityId };
    } else if (entityType === "officer") {
      // For officers (huissiers), filter by officerId to show all mission expenses
      filters = { scope: "client", officerId: entityId };
    } else if (entityType === "mission") {
      // For missions, filter by missionId to show mission-specific expenses
      filters = { scope: "client", missionId: entityId };
    } else if (entityType === "personalTask") {
      // For personal tasks, filter by personalTaskId with internal scope
      filters = { scope: "internal", personalTaskId: entityId };
    } else if (entityType === "task") {
      // For tasks, filter by parent relationship
      filters = { scope: "client" };
      if (entityData.parentType === "case" && entityData.caseId) {
        filters.caseId = entityData.caseId;
      } else if (entityData.dossierId) {
        filters.dossierId = entityData.dossierId;
      }
    }

    return getFinancialEntriesForDisplay(filters);
  }, [entityType, entityId, entityData, refreshKey]);

  // Handler functions (defined before columns to avoid hoisting issues)
  const handleView = (entry) => {
    setSelectedEntry(entry);
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
    const entry = entries.find(e => e.id === id);
    const result = canPerformAction('financialEntry', id, 'delete', { data: entry });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Supprimer l'écriture",
      message: "Êtes-vous sûr de vouloir supprimer cette écriture ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      deleteFinancialEntry(id);
      setRefreshKey((k) => k + 1);
      setSelectedEntry(null);
      if (onUpdate) onUpdate();
    }
  };

  const handleStatusChange = (id, newStatus) => {
    // ✅ Validate before allowing status change
    const entry = entries.find(e => e.id === id);
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
          className={`px-2 py-1 rounded-full text-xs font-medium ${entry.type === "revenue"
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
          className={`font-semibold ${entry.type === "revenue"
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
              color: "slate",
            },
            {
              value: "confirmed",
              label: "Confirmé",
              icon: "fas fa-check-circle",
              color: "blue",
            },
            {
              value: "paid",
              label: "Payé",
              icon: "fas fa-check-double",
              color: "green",
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
          {entityType !== "officer" && (
            <>
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
            </>
          )}
        </TableActions>
      ),
    },
  ], [handleStatusChange, entityType]);

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
        showToast("Écriture modifiée avec succès!", "success");
      } else {
        // Add new entry with entity context
        let client = formData.clientId
          ? mockClients.find((c) => c.id === parseInt(formData.clientId))
          : entityType === "client"
            ? mockClients.find((c) => c.id === entityId)
            : null;

        let dossier = formData.dossierId
          ? mockDossiers.find((d) => d.id === parseInt(formData.dossierId))
          : entityType === "dossier"
            ? mockDossiers.find((d) => d.id === entityId)
            : null;

        const caseItem = formData.caseId
          ? mockCases.find((c) => c.id === parseInt(formData.caseId))
          : entityType === "case"
            ? mockCases.find((c) => c.id === entityId)
            : null;

        // For case entity type, derive client and dossier from the case's dossier relationship
        if (entityType === "case" && caseItem && !client) {
          dossier = mockDossiers.find((d) => d.id === caseItem.dossierId);
          if (dossier) {
            client = mockClients.find((c) => c.id === dossier.clientId);
          }
        }

        // For dossier entity type, derive client from the dossier
        if (entityType === "dossier" && dossier && !client) {
          client = mockClients.find((c) => c.id === dossier.clientId);
        }

        // Handle officer and mission data
        let mission = null;
        let officerData = null;

        // For mission entity type, the entityData IS the mission
        if (entityType === "mission") {
          mission = entityData;

          // Derive client and dossier from mission's linked entity
          if (mission.entityType === "dossier") {
            dossier = mockDossiers.find(d => d.id === mission.entityId);
            if (dossier) {
              client = mockClients.find(c => c.id === dossier.clientId);
            }
          } else if (mission.entityType === "case") {
            const linkedCase = mockCases.find(c => c.id === mission.entityId);
            if (linkedCase) {
              dossier = mockDossiers.find(d => d.id === linkedCase.dossierId);
              if (dossier) {
                client = mockClients.find(c => c.id === dossier.clientId);
              }
            }
          }
        } else if (formData.missionId && entityData?.missions) {
          // For officer entity type, find mission from officer's missions array
          mission = entityData.missions.find((m) => m.id === parseInt(formData.missionId));
        }

        if (entityType === "officer") {
          officerData = entityData;
        }

        const newEntry = {
          ...formData,
          clientId: client ? client.id : null,
          clientName: client ? client.name : null,
          dossierId: dossier ? dossier.id : null,
          dossierReference: dossier ? dossier.caseNumber : null,
          caseId: caseItem ? caseItem.id : null,
          caseReference: caseItem ? caseItem.caseNumber : null,
          // Add officer and mission data
          officerId: mission?.officerId || officerData?.id || (formData.officerId ? parseInt(formData.officerId) : null),
          officerName: mission?.officerName || officerData?.name || null,
          missionId: mission ? mission.id : null,
          missionNumber: mission ? mission.missionNumber : null,
          sourceType: mission ? "mission" : "manual",
          sourceId: mission ? mission.id : null,
        };

        addFinancialEntry(newEntry);
        showToast("Écriture ajoutée avec succès!", "success");
      }

      setRefreshKey((k) => k + 1);
      setIsModalOpen(false);
      setEditingEntry(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error submitting entry:", error);
      showToast("Erreur lors de l'enregistrement", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Populate relationship options for form
  const entryFields = useMemo(() => {
    // For officer view, only show THIS officer's missions
    const missionsToShow = entityType === "officer" && entityData?.missions
      ? entityData.missions.map(m => ({
        ...m,
        officerId: entityData.id,
        officerName: entityData.name,
      }))
      : getAllMissions();

    const fields = populateRelationshipOptions(financialEntryFormFields, {
      clients: mockClients,
      dossiers: mockDossiers,
      cases: mockCases,
      missions: missionsToShow,
    });

    // Pre-fill and lock entity context when adding/editing entry from entity detail view
    if (entityType) {
      return fields.map((field) => {
        // Lock scope based on entity type
        if (field.name === "scope") {
          // Personal tasks are internal expenses (office expenses)
          if (entityType === "personalTask") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.scope || "internal",
              displayValue: "Interne (frais de bureau)"
            };
          }
          // Client, dossier, case, mission, officer are client-related expenses
          return {
            ...field,
            type: "readonly",
            defaultValue: editingEntry?.scope || "client",
            displayValue: "Client (affecte le solde client)"
          };
        }

        // For client detail view: show client as readonly, allow optional dossier/case selection
        if (entityType === "client") {
          const client = mockClients.find(c => c.id === entityId);
          if (field.name === "clientId" && client) {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.clientId || entityId,
              displayValue: client.name
            };
          }
          // Get client's dossiers and cases for optional selection
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

        // For dossier detail view: show dossier and client as readonly, allow optional case selection
        if (entityType === "dossier") {
          const dossier = mockDossiers.find(d => d.id === entityId);
          if (field.name === "dossierId" && dossier) {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.dossierId || entityId,
              displayValue: dossier.caseNumber
            };
          }
          if (field.name === "clientId" && dossier) {
            const client = mockClients.find(cl => cl.id === dossier.clientId);
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.clientId || dossier.clientId,
              displayValue: client ? client.name : "Client inconnu"
            };
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

        // For case detail view: pre-fill and disable caseId AND clientId AND dossierId
        if (entityType === "case") {
          const caseItem = mockCases.find(c => c.id === entityId);
          if (field.name === "caseId" && caseItem) {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.caseId || entityId,
              displayValue: caseItem.caseNumber
            };
          }
          if (field.name === "clientId" && caseItem) {
            // Get client through the dossier relationship since cases don't have direct clientId
            const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
            const client = dossier ? mockClients.find(cl => cl.id === dossier.clientId) : null;
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.clientId || (client ? client.id : null),
              displayValue: client ? client.name : "Client inconnu"
            };
          }
          if (field.name === "dossierId" && caseItem) {
            const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.dossierId || caseItem.dossierId,
              displayValue: dossier ? dossier.caseNumber : "Dossier inconnu"
            };
          }
        }

        // For officer (huissier) detail view: lock type to "expense" since huissiers only have expenses
        if (entityType === "officer") {
          const missions = entityData?.missions || [];

          // Extract unique dossiers and cases from this officer's missions
          const officerDossierIds = new Set();
          const officerCaseIds = new Set();
          const officerClientIds = new Set();

          missions.forEach(mission => {
            if (mission.entityType === "dossier") {
              const dossier = mockDossiers.find(d => d.caseNumber === mission.entityReference);
              if (dossier) {
                officerDossierIds.add(dossier.id);
                officerClientIds.add(dossier.clientId);
              }
            } else if (mission.entityType === "case") {
              const caseItem = mockCases.find(c => c.caseNumber === mission.entityReference);
              if (caseItem) {
                officerCaseIds.add(caseItem.id);
                const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
                if (dossier) {
                  officerDossierIds.add(dossier.id);
                  officerClientIds.add(dossier.clientId);
                }
              }
            }
          });

          // Lock type to "expense" (read-only)
          if (field.name === "type") {
            return {
              ...field,
              type: "readonly",
              defaultValue: "expense",
              displayValue: "Dépense (frais huissier)",
              helpText: "Les huissiers ne peuvent avoir que des dépenses"
            };
          }
          // Pre-select category to "frais_huissier"
          if (field.name === "category") {
            return {
              ...field,
              defaultValue: "frais_huissier"
            };
          }
          // Lock officer field to current officer
          if (field.name === "officerId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: entityId,
              displayValue: entityData?.name || "Huissier",
              helpText: "Frais pour cet huissier"
            };
          }
          // Add mission selector - show only this officer's missions
          if (field.name === "missionId") {
            return {
              ...field,
              getOptions: undefined, // Remove the base getOptions function
              hideIf: undefined,     // Remove the hideIf function
              type: "searchable-select",
              required: true,
              label: "Mission associée *",
              helpText: "Sélectionnez la mission liée à ces frais",
              options: [
                { value: "", label: "Sélectionner une mission..." },
                ...missions.map((m) => ({
                  value: m.id,
                  label: `${m.missionNumber} - ${m.title} (${m.status})`,
                })),
              ],
              onChange: (value, formData, setFormData) => {
                if (value) {
                  const selectedMission = missions.find(m => m.id === value);
                  if (selectedMission) {
                    const updates = {
                      ...formData,
                      missionId: value,
                    };

                    // Auto-populate description if empty
                    if (!formData.description) {
                      updates.description = `Frais d'huissier - ${selectedMission.missionNumber} - ${selectedMission.title}`;
                    }

                    // Auto-populate related entities based on mission type
                    if (selectedMission.entityType === "dossier") {
                      const dossier = mockDossiers.find(d => d.caseNumber === selectedMission.entityReference);
                      if (dossier) {
                        updates.dossierId = dossier.id;
                        updates.clientId = dossier.clientId;
                        updates.caseId = ""; // Clear case if it was set
                      }
                    } else if (selectedMission.entityType === "case") {
                      const caseItem = mockCases.find(c => c.caseNumber === selectedMission.entityReference);
                      if (caseItem) {
                        updates.caseId = caseItem.id;
                        const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
                        if (dossier) {
                          updates.dossierId = dossier.id;
                          updates.clientId = dossier.clientId;
                        }
                      }
                    }

                    setFormData(updates);
                    return;
                  }
                }
              },
            };
          }

          // Filter client dropdown to only show clients that have missions with this officer
          if (field.name === "clientId") {
            const clients = mockClients.filter(c => officerClientIds.has(c.id));
            return {
              ...field,
              options: [
                { value: "", label: "Sélectionner un client..." },
                ...clients.map(c => ({ value: c.id, label: c.name }))
              ]
            };
          }

          // Filter dossier dropdown to only show dossiers that have missions with this officer
          if (field.name === "dossierId") {
            const dossiers = mockDossiers.filter(d => officerDossierIds.has(d.id));
            return {
              ...field,
              options: [
                { value: "", label: "Sélectionner un dossier..." },
                ...dossiers.map(d => ({ value: d.id, label: d.caseNumber }))
              ]
            };
          }

          // Filter case dropdown to only show cases that have missions with this officer
          if (field.name === "caseId") {
            const cases = mockCases.filter(c => officerCaseIds.has(c.id));
            return {
              ...field,
              options: [
                { value: "", label: "Sélectionner un procès..." },
                ...cases.map(c => ({ value: c.id, label: c.caseNumber }))
              ]
            };
          }
        }

        // For mission detail view: auto-fill and lock all related fields
        if (entityType === "mission") {
          // Lock type to "expense" (missions only have expenses)
          if (field.name === "type") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.type || "expense",
              displayValue: "Dépense (frais huissier)",
              helpText: "Les frais de mission sont toujours des dépenses"
            };
          }

          // Lock category to "frais_huissier"
          if (field.name === "category") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.category || "frais_huissier",
              displayValue: "Frais d'huissier",
              helpText: "Catégorie automatique pour les frais de mission"
            };
          }

          // Lock scope to "client"
          if (field.name === "scope") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.scope || "client",
              displayValue: "Client (affecte le solde client)",
            };
          }

          // Lock mission to current mission
          if (field.name === "missionId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.missionId || entityId,
              displayValue: `${entityData.missionNumber} - ${entityData.title}`,
              helpText: "Mission actuelle"
            };
          }

          // Lock officer to mission's officer
          if (field.name === "officerId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.officerId || entityData.officerId,
              displayValue: entityData.officerName,
              helpText: "Huissier de cette mission"
            };
          }

          // Auto-fill client based on mission's entity
          if (field.name === "clientId") {
            let clientId = editingEntry?.clientId || null;
            let clientName = "Client inconnu";

            // If editing, use existing value, otherwise derive from mission
            if (!editingEntry) {
              if (entityData.entityType === "dossier") {
                const dossier = mockDossiers.find(d => d.id === entityData.entityId);
                if (dossier) {
                  clientId = dossier.clientId;
                  const client = mockClients.find(c => c.id === dossier.clientId);
                  clientName = client ? client.name : "Client inconnu";
                }
              } else if (entityData.entityType === "case") {
                const caseItem = mockCases.find(c => c.id === entityData.entityId);
                if (caseItem) {
                  const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
                  if (dossier) {
                    clientId = dossier.clientId;
                    const client = mockClients.find(c => c.id === dossier.clientId);
                    clientName = client ? client.name : "Client inconnu";
                  }
                }
              }
            } else {
              // When editing, get the display name from the stored clientId
              const client = mockClients.find(c => c.id === clientId);
              clientName = client ? client.name : "Client inconnu";
            }

            return {
              ...field,
              type: "readonly",
              defaultValue: clientId,
              displayValue: clientName,
              helpText: "Client lié à cette mission"
            };
          }

          // Auto-fill dossier based on mission's entity
          if (field.name === "dossierId") {
            let dossierId = editingEntry?.dossierId || null;
            let dossierRef = "Dossier inconnu";

            // If editing, use existing value, otherwise derive from mission
            if (!editingEntry) {
              if (entityData.entityType === "dossier") {
                const dossier = mockDossiers.find(d => d.id === entityData.entityId);
                if (dossier) {
                  dossierId = dossier.id;
                  dossierRef = dossier.caseNumber;
                }
              } else if (entityData.entityType === "case") {
                const caseItem = mockCases.find(c => c.id === entityData.entityId);
                if (caseItem) {
                  dossierId = caseItem.dossierId;
                  const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
                  dossierRef = dossier ? dossier.caseNumber : "Dossier inconnu";
                }
              }
            } else {
              // When editing, get the display name from the stored dossierId
              const dossier = mockDossiers.find(d => d.id === dossierId);
              dossierRef = dossier ? dossier.caseNumber : "Dossier inconnu";
            }

            return {
              ...field,
              type: "readonly",
              defaultValue: dossierId,
              displayValue: dossierRef,
              helpText: "Dossier lié à cette mission"
            };
          }

          // Auto-fill case based on mission's entity (if applicable)
          if (field.name === "caseId") {
            let caseId = editingEntry?.caseId || null;
            let caseRef = null;

            // If editing, use existing value, otherwise derive from mission
            if (!editingEntry) {
              if (entityData.entityType === "case") {
                const caseItem = mockCases.find(c => c.id === entityData.entityId);
                if (caseItem) {
                  caseId = caseItem.id;
                  caseRef = caseItem.caseNumber;
                }
              }
            } else {
              // When editing, get the display name from the stored caseId
              if (caseId) {
                const caseItem = mockCases.find(c => c.id === caseId);
                caseRef = caseItem ? caseItem.caseNumber : "Procès inconnu";
              }
            }

            if (caseId) {
              return {
                ...field,
                type: "readonly",
                defaultValue: caseId,
                displayValue: caseRef,
                helpText: "Procès lié à cette mission"
              };
            } else {
              // Hide the field if mission is not linked to a case
              return {
                ...field,
                type: "hidden",
                defaultValue: null
              };
            }
          }

          // Auto-populate description with mission reference (only for new entries)
          if (field.name === "description" && !editingEntry) {
            return {
              ...field,
              defaultValue: `Frais d'huissier - ${entityData.missionNumber} - ${entityData.title}`,
              placeholder: `Ex: Frais de déplacement, frais de PV, etc.`
            };
          }
        }

        // For officer (huissier) detail view: lock type to "expense" since huissiers only have expenses
        if (entityType === "officer") {
          const missions = entityData?.missions || [];

          // Extract unique dossiers and cases from this officer's missions
          const officerDossierIds = new Set();
          const officerCaseIds = new Set();
          const officerClientIds = new Set();

          missions.forEach(mission => {
            if (mission.entityType === "dossier") {
              const dossier = mockDossiers.find(d => d.caseNumber === mission.entityReference);
              if (dossier) {
                officerDossierIds.add(dossier.id);
                officerClientIds.add(dossier.clientId);
              }
            } else if (mission.entityType === "case") {
              const caseItem = mockCases.find(c => c.caseNumber === mission.entityReference);
              if (caseItem) {
                officerCaseIds.add(caseItem.id);
                const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
                if (dossier) {
                  officerDossierIds.add(dossier.id);
                  officerClientIds.add(dossier.clientId);
                }
              }
            }
          });

          // Lock type to "expense" (read-only)
          if (field.name === "type") {
            return {
              ...field,
              type: "readonly",
              defaultValue: "expense",
              displayValue: "Dépense (frais huissier)",
              helpText: "Les huissiers ne peuvent avoir que des dépenses"
            };
          }
          // Pre-select category to "frais_huissier"
          if (field.name === "category") {
            return {
              ...field,
              defaultValue: "frais_huissier"
            };
          }
          // Lock officer field to current officer
          if (field.name === "officerId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: entityId,
              displayValue: entityData?.name || "Huissier",
              helpText: "Frais pour cet huissier"
            };
          }
          // Add mission selector - show only this officer's missions
          if (field.name === "missionId") {
            return {
              ...field,
              getOptions: undefined, // Remove the base getOptions function
              hideIf: undefined,     // Remove the hideIf function
              type: "searchable-select",
              required: true,
              label: "Mission associée *",
              helpText: "Sélectionnez la mission liée à ces frais",
              options: [
                { value: "", label: "Sélectionner une mission..." },
                ...missions.map((m) => ({
                  value: m.id,
                  label: `${m.missionNumber} - ${m.title} (${m.status})`,
                })),
              ],
              onChange: (value, formData, setFormData) => {
                if (value) {
                  const selectedMission = missions.find(m => m.id === value);
                  if (selectedMission) {
                    const updates = {
                      ...formData,
                      missionId: value,
                    };

                    // Auto-populate description if empty
                    if (!formData.description) {
                      updates.description = `Frais d'huissier - ${selectedMission.missionNumber} - ${selectedMission.title}`;
                    }

                    // Auto-populate related entities based on mission type
                    if (selectedMission.entityType === "dossier") {
                      const dossier = mockDossiers.find(d => d.caseNumber === selectedMission.entityReference);
                      if (dossier) {
                        updates.dossierId = dossier.id;
                        updates.clientId = dossier.clientId;
                        updates.caseId = ""; // Clear case if it was set
                      }
                    } else if (selectedMission.entityType === "case") {
                      const caseItem = mockCases.find(c => c.caseNumber === selectedMission.entityReference);
                      if (caseItem) {
                        updates.caseId = caseItem.id;
                        const dossier = mockDossiers.find(d => d.id === caseItem.dossierId);
                        if (dossier) {
                          updates.dossierId = dossier.id;
                          updates.clientId = dossier.clientId;
                        }
                      }
                    }

                    setFormData(updates);
                    return;
                  }
                }
                setFormData({ ...formData, missionId: value });
              },
            };
          }

          // Filter clients - only those with dossiers/cases assigned to this officer
          if (field.name === "clientId") {
            const filteredClients = mockClients.filter(c => officerClientIds.has(c.id));
            return {
              ...field,
              type: "readonly",
              displayValue: (formData) => {
                if (formData.clientId) {
                  const client = filteredClients.find(c => c.id === formData.clientId);
                  return client ? client.name : "Client inconnu";
                }
                return "Sélectionnez d'abord une mission";
              },
              helpText: "Client auto-rempli depuis la mission sélectionnée"
            };
          }

          // Filter dossiers - only those assigned to this officer
          if (field.name === "dossierId") {
            const filteredDossiers = mockDossiers.filter(d => officerDossierIds.has(d.id));
            return {
              ...field,
              type: "readonly",
              displayValue: (formData) => {
                if (formData.dossierId) {
                  const dossier = filteredDossiers.find(d => d.id === formData.dossierId);
                  return dossier ? `${dossier.caseNumber} - ${dossier.title}` : "Dossier inconnu";
                }
                return "Sélectionnez d'abord une mission";
              },
              helpText: "Dossier auto-rempli depuis la mission sélectionnée"
            };
          }

          // Filter cases - only those assigned to this officer
          if (field.name === "caseId") {
            const filteredCases = mockCases.filter(c => officerCaseIds.has(c.id));
            return {
              ...field,
              type: "readonly",
              displayValue: (formData) => {
                if (formData.caseId) {
                  const caseItem = filteredCases.find(c => c.id === formData.caseId);
                  return caseItem ? `${caseItem.caseNumber} - ${caseItem.title}` : "Procès inconnu";
                }
                return "Aucun (dépend de la mission)";
              },
              helpText: "Procès auto-rempli depuis la mission sélectionnée (si applicable)"
            };
          }
        }

        // For personal task detail view: lock scope to "internal" since personal tasks are office expenses
        if (entityType === "personalTask") {
          // Lock scope to "internal" (read-only)
          if (field.name === "scope") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.scope || "internal",
              displayValue: "Interne (frais de bureau)",
              helpText: "Les tâches personnelles sont des dépenses internes uniquement"
            };
          }
          // Pre-select category to "frais_bureau"
          if (field.name === "category") {
            return {
              ...field,
              defaultValue: editingEntry?.category || "frais_bureau"
            };
          }
        }

        return field;
      });
    }

    return fields;
  }, [editingEntry, entityType, entityId, entityData]);

  return (
    <div className="space-y-6">
      {/* Financial Summary Cards */}
      {entityType === "client" && balanceDetails && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Honoraires facturés
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title="Total des honoraires d'avocat facturés au client"></i>
              </div>
              <i className="fas fa-money-bill-wave text-emerald-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.honoraires)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Ce que vous avez facturé
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Frais avancés
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title="Frais payés pour le client (timbres, expertise, etc.) à rembourser"></i>
              </div>
              <i className="fas fa-file-invoice text-blue-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.reimbursableExpenses)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Frais à récupérer du client
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Paiements reçus
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title="Total des paiements et avances déjà reçus du client"></i>
              </div>
              <i className="fas fa-hand-holding-usd text-indigo-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.totalPaid)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Ce que le client a déjà payé
            </div>
          </div>

          <div
            className={`bg-white dark:bg-slate-800 rounded-lg border-2 p-4 ${balanceDetails.balance > 0
              ? "border-orange-300 dark:border-orange-700"
              : balanceDetails.balance < 0
                ? "border-green-300 dark:border-green-700"
                : "border-slate-200 dark:border-slate-700"
              }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {balanceDetails.balance > 0 ? "À recevoir" : balanceDetails.balance < 0 ? "Trop-perçu" : "Solde"}
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title={
                  balanceDetails.balance > 0
                    ? "Montant que le client doit encore payer"
                    : balanceDetails.balance < 0
                      ? "Montant à rembourser au client ou crédit disponible"
                      : "Compte soldé"
                }></i>
              </div>
              <i
                className={`fas ${balanceDetails.balance > 0
                  ? "fa-arrow-circle-down text-orange-500"
                  : balanceDetails.balance < 0
                    ? "fa-arrow-circle-up text-green-500"
                    : "fa-check-circle text-slate-500"
                  }`}
              ></i>
            </div>
            <div
              className={`text-2xl font-bold ${balanceDetails.balance > 0
                ? "text-orange-600 dark:text-orange-400"
                : balanceDetails.balance < 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-slate-900 dark:text-white"
                }`}
            >
              {formatCurrency(Math.abs(balanceDetails.balance))}
            </div>
            <div className={`text-xs mt-1 font-medium ${balanceDetails.balance > 0
              ? "text-orange-600 dark:text-orange-400"
              : balanceDetails.balance < 0
                ? "text-green-600 dark:text-green-400"
                : "text-slate-500 dark:text-slate-400"
              }`}>
              {balanceDetails.balance > 0
                ? "→ Client doit payer"
                : balanceDetails.balance < 0
                  ? "→ Crédit client / À rembourser"
                  : "✓ Compte équilibré"}
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
              className={`text-2xl font-bold ${summary.netBalance >= 0
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
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
                    className={`px-3 py-1 rounded-full text-sm font-medium ${selectedEntry.type === "revenue"
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
                      <InlineStatusSelector
                        value={selectedEntry.status}
                        onChange={(newStatus) => handleStatusChange(selectedEntry.id, newStatus)}
                        statusOptions={Object.keys(financialStatuses).map((status) => ({
                          value: status,
                          label: financialStatuses[status].label,
                          color: financialStatuses[status].color,
                        }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Montant
                    </label>
                    <p
                      className={`text-2xl font-bold ${selectedEntry.type === "revenue"
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
              {entityType !== "officer" && (
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Blocker Modal */}
      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Modifier/Supprimer l'écriture financière"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={`Écriture #${validationResult?.entityId || ''}`}
      />
    </div>
  );
}
