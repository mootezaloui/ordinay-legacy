import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  getFinancialEntryFormFields,
  getFormTitle,
  populateRelationshipOptions,
} from "../../FormModal/formConfigs";
import {
  financialCategories,
  financialStatuses,
} from "../../../utils/financialConstants";
import { useData } from "../../../contexts/DataContext";
import { logEntityCreation, logHistoryEvent, EVENT_TYPES } from "../../../services/historyService";
import {
  getFinancialEntriesForDisplay,
  formatCurrency,
  getClientFinancialSummary,
  getDossierFinancialSummary,
  getLawsuitFinancialSummary,
  getOfficerFinancialSummary,
  getPersonalTaskFinancialSummary,
  getMissionFinancialSummary,
  getClientBalanceDetails,
} from "../../../utils/financialUtils";
import { formatDateValue } from "../../../utils/dateFormat";
import InlineStatusSelector from "../../InlineSelectors/InlineStatusSelector";
import BlockerModal from "../../ui/BlockerModal";
import ConfirmImpactModal from "../../ui/ConfirmImpactModal";
import { canPerformAction } from "../../../services/domainRules";
import { resolveDetailRoute } from "../../../utils/routeResolver";
import GlassModal from "../../ui/GlassModal";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../ui/dropdown-menu";

/**
 * FinancialTab Component
 *
 * Displays financial information for Client, Dossier, or Procès entities.
 * This is a VIEW over the financial ledger - it does NOT store any financial data.
 *
 * Props:
 * - entityType: "client" | "dossier" | "lawsuit"
 * - entityId: The ID of the entity
 * - entityData: The entity data (for context)
 * - onUpdate: Callback when financial data changes
 */
export default function FinancialTab({ entityType, entityId, entityData, onUpdate }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation(["accounting", "common"]);
  const {
    clients = [],
    dossiers = [],
    lawsuits = [],
    tasks = [],
    sessions = [],
    missions = [],
    officers = [],
    financialEntries = [],
    addFinancialEntry,
    updateFinancialEntry,
    deleteFinancialEntry,
  } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Helper function to truncate text
  const truncate = (text, max = 120) => {
    if (!text) return "";
    const str = String(text);
    return str.length > max ? `${str.slice(0, max).trimEnd()}...` : str;
  };

  // Get financial summary based on entity type
  const summary = useMemo(() => {
    if (entityType === "client") {
      return getClientFinancialSummary(entityId, financialEntries);
    } else if (entityType === "dossier") {
      return getDossierFinancialSummary(entityId, financialEntries);
    } else if (entityType === "lawsuit") {
      return getLawsuitFinancialSummary(entityId, financialEntries);
    } else if (entityType === "officer") {
      // For officers (huissiers), get all mission expenses
      return getOfficerFinancialSummary(entityId, financialEntries);
    } else if (entityType === "mission") {
      // For missions, get mission-specific financial entries
      return getMissionFinancialSummary(entityId, financialEntries);
    } else if (entityType === "personalTask") {
      // For personal tasks, get internal expenses
      return getPersonalTaskFinancialSummary(entityId, financialEntries);
    } else if (entityType === "task") {
      // For tasks, get financial data based on parent relationship
      if (entityData.parentType === "lawsuit" && entityData.lawsuitId) {
        return getLawsuitFinancialSummary(entityData.lawsuitId, financialEntries);
      } else if (entityData.dossierId) {
        return getDossierFinancialSummary(entityData.dossierId, financialEntries);
      }
    }
    return null;
  }, [entityType, entityId, entityData, refreshKey, financialEntries]);

  // Get client balance details (only for clients)
  const balanceDetails = useMemo(() => {
    if (entityType === "client") {
      return getClientBalanceDetails(entityId, financialEntries);
    }
    return null;
  }, [entityType, entityId, refreshKey, financialEntries]);

  // Get filtered entries for this entity
  const entries = useMemo(() => {
    if (entityType === "officer" && Array.isArray(entityData?.financialEntries)) {
      // Use pre-aggregated entries from officerConfig for officer view
      return getFinancialEntriesForDisplay({}, entityData.financialEntries);
    }

    let filters = {};
    if (entityType === "client") {
      filters = { scope: "client", clientId: entityId };
    } else if (entityType === "dossier") {
      filters = { scope: "client", dossierId: entityId };
    } else if (entityType === "lawsuit") {
      filters = { scope: "client", lawsuitId: entityId };
    } else if (entityType === "officer") {
      filters = { scope: "client", officerId: entityId };
    } else if (entityType === "mission") {
      filters = { scope: "client", missionId: entityId };
    } else if (entityType === "personalTask") {
      filters = { scope: "internal", personalTaskId: entityId };
    } else if (entityType === "task") {
      filters = { scope: "client" };
      if (entityData.parentType === "lawsuit" && entityData.lawsuitId) {
        filters.lawsuitId = entityData.lawsuitId;
      } else if (entityData.dossierId) {
        filters.dossierId = entityData.dossierId;
      }
    }
    return getFinancialEntriesForDisplay(filters, financialEntries);
  }, [entityType, entityId, entityData, refreshKey, financialEntries]);

  // Handler functions (defined before columns to avoid hoisting issues)
  const handleView = (entry) => {
    setSelectedEntry(entry);
  };

  const handleEdit = (entry) => {
    // G£à Validate before allowing edit
    const result = canPerformAction('financialEntry', entry.id, 'edit', {
      data: entry,
      entities: { clients, dossiers, lawsuits, tasks, sessions, missions, officers, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (result.requiresConfirmation) {
      setValidationResult(result);
      setPendingAction({
        action: 'edit',
        entryId: entry.id,
        data: entry,
        newData: entry,
        mutate: () => {
          setEditingEntry(entry);
          setIsModalOpen(true);
        }
      });
      setConfirmImpactModalOpen(true);
      return;
    }

    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const entry = entries.find(e => e.id === id);

    await performFinancialMutation({
      action: 'delete',
      entryId: id,
      data: entry,
      newData: null,
      mutate: async () => {
        if (await confirm({
          title: t("dialog.detail.financial.delete.title", { ns: "common" }),
          message: t("dialog.detail.financial.delete.message", { ns: "common" }),
          confirmText: t("dialog.detail.financial.delete.confirm", { ns: "common" }),
          cancelText: t("dialog.detail.financial.delete.cancel", { ns: "common" }),
          variant: "danger"
        })) {
          const result = await deleteFinancialEntry(id, { skipConfirmation: true });
          if (!result.ok) {
            if (result.result) {
              setValidationResult(result.result);
              setBlockerModalOpen(true);
            }
            return;
          }
          setRefreshKey((k) => k + 1);
          setSelectedEntry(null);
          if (onUpdate) onUpdate();
        }
      }
    });
  };

  const handleStatusChange = async (id, newStatus) => {
    const entry = entries.find(e => e.id === id);
    const newData = { ...entry, status: newStatus };

    await performFinancialMutation({
      action: 'changeStatus',
      entryId: id,
      data: entry,
      newData,
      mutate: async () => {
        const result = updateFinancialEntry(id, { status: newStatus });
        if (!result.entry) {
          if (result.result) {
            setValidationResult(result.result);
            setBlockerModalOpen(true);
          }
          return;
        }
        setRefreshKey((k) => k + 1);

        if (selectedEntry?.id === id) {
          const updatedEntries = getFinancialEntriesForDisplay();
          const updatedEntry = updatedEntries.find((e) => e.id === id);
          setSelectedEntry(updatedEntry);
        }

        if (onUpdate) onUpdate();
      }
    });
  };

  const handleCloseDetail = () => {
    setSelectedEntry(null);
  };

  const performFinancialMutation = async ({ action, entryId, data = null, newData = null, mutate }) => {
    const result = canPerformAction('financialEntry', entryId, action, {
      data,
      newData,
      entities: { clients, dossiers, lawsuits, tasks, sessions, missions, officers, financialEntries }
    });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return false;
    }

    if (result.requiresConfirmation) {
      setValidationResult(result);
      setPendingAction({ action, entryId, data, newData, mutate });
      setConfirmImpactModalOpen(true);
      return false;
    }

    await mutate();
    return true;
  };

  const handleConfirmImpact = async () => {
    if (!pendingAction) return;
    setConfirmImpactModalOpen(false);
    const { mutate } = pendingAction;
    setPendingAction(null);
    await mutate();
  };

  const statusOptions = [
    {
      value: "draft",
      label: t("detail.financial.status.draft", { ns: "common" }),
      icon: "fas fa-file",
      color: "slate",
    },
    {
      value: "confirmed",
      label: t("detail.financial.status.confirmed", { ns: "common" }),
      icon: "fas fa-check-circle",
      color: "blue",
    },
    {
      value: "paid",
      label: t("detail.financial.status.paid", { ns: "common" }),
      icon: "fas fa-check-double",
      color: "green",
    },
    {
      value: "Cancelled",
      label: t("detail.financial.status.cancelled", { ns: "common" }),
      icon: "fas fa-times-circle",
      color: "red",
    },
  ];

  const renderStatusSelector = (entry) => (
    <InlineStatusSelector
      value={entry.status}
      onChange={(newStatus) => handleStatusChange(entry.id, newStatus)}
      entityType="financialEntry"
      entityId={entry.id}
      entityData={entry}
      statusOptions={statusOptions}
    />
  );

  // Define table columns (memoized to ensure handler closures are stable)
  const columns = useMemo(() => [
    {
      id: "date",
      label: t("detail.financial.columns.date", { ns: "common" }),
      sortable: true,
      locked: true,
      mobileRole: "meta",
      render: (entry) => (
        <span className="text-sm font-medium text-slate-900 dark:text-white">
          {formatDateValue(entry.date)}
        </span>
      ),
    },
    {
      id: "description",
      label: t("detail.financial.columns.entry", { ns: "common" }),
      sortable: true,
      mobileRole: "primary",
      mobilePriority: 1,
      render: (entry) => (
        <div className="flex flex-col max-w-md">
          <span className="font-medium text-slate-900 dark:text-white truncate" title={entry.title || entry.description || "Untitled"}>
            {truncate(entry.title || entry.description || "Untitled", 50)}
          </span>
          {entry.description && entry.title && (
            <span className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 truncate" title={entry.description}>
              {truncate(entry.description, 45)}
            </span>
          )}
          <span
            className={
              entry.category === "bailiff_fees" || entry.category === "frais_huissier"
                ? "mt-1 px-2 py-0.5 rounded-full text-xs font-bold inline-block w-fit bg-blue-600 text-white dark:bg-blue-500 dark:text-white shadow-sm"
                : `mt-1 px-2 py-0.5 rounded-full text-xs font-medium inline-block w-fit bg-${entry.categoryColor}-100 text-${entry.categoryColor}-800 dark:bg-${entry.categoryColor}-900/30 dark:text-${entry.categoryColor}-300`
            }
          >
            {entry.categoryLabel}
          </span>
        </div>
      ),
    },
    {
      id: "type",
      label: t("detail.financial.columns.type", { ns: "common" }),
      sortable: true,
      mobilePriority: 2,
      render: (entry) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${entry.type === "revenue"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
            }`}
        >
          {entry.type === "revenue" ? t("detail.financial.types.revenue", { ns: "common" }) : t("detail.financial.types.expense", { ns: "common" })}
        </span>
      ),
    },
    {
      id: "amount",
      label: t("detail.financial.columns.amount", { ns: "common" }),
      sortable: true,
      mobilePriority: 3,
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
      label: t("detail.financial.columns.status", { ns: "common" }),
      sortable: true,
      mobileRole: "status",
      render: (entry) => renderStatusSelector(entry),
    },
    {
      id: "actions",
      label: t("detail.financial.columns.actions", { ns: "common" }),
      sortable: false,
      locked: true,
      mobileHidden: true,
      render: (entry) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title={t("actions.view", { ns: "common" })}
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
                title={t("actions.edit", { ns: "common" })}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(entry);
                }}
              />
              <IconButton
                icon="delete"
                variant="delete"
                title={t("actions.delete", { ns: "common" })}
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
    initialSortBy: null,
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["description", "categoryLabel"],
    entityType: "financialEntry",
    enableIntelligentOrdering: true,
  });

  const handleAddEntry = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    const isEdit = !!editingEntry;

    await performFinancialMutation({
      action: isEdit ? 'edit' : 'add',
      entryId: isEdit ? editingEntry.id : null,
      data: isEdit ? editingEntry : null,
      newData: formData,
      mutate: async () => {
        await performSave(formData);
      }
    });
  };

  const performSave = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingEntry) {
        const result = updateFinancialEntry(editingEntry.id, formData);
        if (!result.entry) {
          if (result.result) {
            setValidationResult(result.result);
            setBlockerModalOpen(true);
          }
          setIsLoading(false);
          return;
        }
        showToast(t("detail.toast.success.update", { ns: "accounting" }), "success");
      } else {
        const client = formData.clientId
          ? clients.find((c) => c.id === parseInt(formData.clientId))
          : entityType === "client"
            ? clients.find((c) => c.id === entityId)
            : null;

        let dossier = formData.dossierId
          ? dossiers.find((d) => d.id === parseInt(formData.dossierId))
          : entityType === "dossier"
            ? dossiers.find((d) => d.id === entityId)
            : entityType === "task" && entityData.dossierId
              ? dossiers.find((d) => d.id === entityData.dossierId)
              : null;

        const lawsuitItem = formData.lawsuitId
          ? lawsuits.find((c) => c.id === parseInt(formData.lawsuitId))
          : entityType === "lawsuit"
            ? lawsuits.find((c) => c.id === entityId)
            : entityType === "task" && entityData.lawsuitId
              ? lawsuits.find((c) => c.id === entityData.lawsuitId)
              : null;

        if (entityType === "lawsuit" && lawsuitItem && !client) {
          dossier = dossiers.find((d) => d.id === lawsuitItem.dossierId);
        }

        const derivedClient = client
          || (dossier ? clients.find((c) => c.id === dossier.clientId) : null);

        let mission = null;
        if (entityType === "mission") {
          mission = entityData;
          if (mission.entityType === "dossier") {
            dossier = dossiers.find(d => d.id === mission.entityId) || dossier;
          } else if (mission.entityType === "lawsuit") {
            const linkedLawsuit = lawsuits.find(c => c.id === mission.entityId);
            if (linkedLawsuit) {
              dossier = dossiers.find(d => d.id === linkedLawsuit.dossierId) || dossier;
            }
          }
        } else if (formData.missionId && entityData?.missions) {
          mission = entityData.missions.find((m) => m.id === parseInt(formData.missionId)) || null;
        }

        const missionClient = derivedClient || (dossier ? clients.find((c) => c.id === dossier.clientId) : null);

        const newEntry = {
          ...formData,
          clientId: missionClient ? missionClient.id : null,
          clientName: missionClient ? missionClient.name : null,
          dossierId: dossier ? dossier.id : null,
          dossierReference: dossier ? dossier.lawsuitNumber : null,
          lawsuitId: lawsuitItem ? lawsuitItem.id : null,
          lawsuitReference: lawsuitItem ? lawsuitItem.lawsuitNumber : null,
          officerId: mission?.officerId || (entityType === "officer" ? entityData.id : null) || (formData.officerId ? parseInt(formData.officerId) : null),
          officerName: mission?.officerName || (entityType === "officer" ? entityData.name : null),
          missionId: mission ? mission.id : null,
          missionNumber: mission ? mission.missionNumber : null,
          sourceType: mission ? "mission" : "manual",
          sourceId: mission ? mission.id : null,
          // ✅ Set personalTaskId for personal task entries (ensure it's a number)
          personalTaskId: entityType === "personalTask" ? parseInt(entityId) : null,
          // ✅ Set taskId for task entries (ensure it's a number)
          taskId: entityType === "task" ? parseInt(entityId) : null,
          // ✅ Explicitly set scope to "internal" for personal task entries
          scope: entityType === "personalTask" ? "internal" : (formData.scope || "client"),
        };

        const savedEntry = await addFinancialEntry(newEntry);
        const createdEntry = savedEntry?.created || savedEntry?.entry;

        if (!createdEntry) {
          if (savedEntry.result) {
            setValidationResult(savedEntry.result);
            setBlockerModalOpen(true);
          }
          setIsLoading(false);
          return;
        }
        showToast(t("detail.toast.success.create", { ns: "accounting" }), "success");

        // ✅ Log creation event for the financial entry
        if (createdEntry && createdEntry.id) {
          logEntityCreation('financialEntry', createdEntry.id, createdEntry.description || `Financial entry - ${formatCurrency(createdEntry.amount)}`);

          // ✅ Also log child_created event for the parent entity (client, dossier, lawsuit, etc.)
          if (entityType && entityId) {
            const entryDescription = createdEntry.description || `${formatCurrency(createdEntry.amount)}`;
            logHistoryEvent({
              entityType: entityType,
              entityId: parseInt(entityId),
              eventType: 'child_created',
              label: `${t("detail.history.labels.finance.entryAdded", { ns: "common" })}: ${entryDescription}`,
              details: `${t("detail.history.labels.finance.entryAdded", { ns: "common" })}: ${entryDescription}`,
              metadata: {
                childType: 'financial_entry',
                childId: createdEntry.id,
                amount: createdEntry.amount
              }
            });
          }
        }

        // ✅ Navigate to the new financial entry's detail view
        if (createdEntry && createdEntry.id) {
          const detailRoute = resolveDetailRoute('financialEntry', createdEntry.id);
          if (detailRoute) {
            setTimeout(() => navigate(detailRoute), 100);
            return; // Skip the remaining logic since we're navigating away
          }
        }
      }

      setRefreshKey((k) => k + 1);
      setIsModalOpen(false);
      setEditingEntry(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error submitting entry:", error);
      showToast(t("detail.toast.error.save", { ns: "accounting" }), "error");
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
      : missions;

    const fields = populateRelationshipOptions(getFinancialEntryFormFields(), {
      clients,
      dossiers,
      lawsuits,
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
              displayValue: t("form.fields.scope.options.internal", { ns: "accounting" })
            };
          }
          // Client, dossier, lawsuit, mission, officer are client-related expenses
          return {
            ...field,
            type: "readonly",
            defaultValue: editingEntry?.scope || "client",
            displayValue: t("form.fields.scope.options.client", { ns: "accounting" })
          };
        }

        // For client detail view: show client as readonly, allow optional dossier/lawsuit selection
        if (entityType === "client") {
          const client = clients.find(c => c.id === entityId);
          if (field.name === "clientId" && client) {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.clientId || entityId,
              displayValue: client.name
            };
          }
          // Get client's dossiers and lawsuits for optional selection
          if (field.name === "dossierId" && client) {
            const clientDossiers = dossiers.filter(d => d.clientId === entityId);
            return {
              ...field,
              options: clientDossiers.map(d => ({ value: d.id, label: d.lawsuitNumber }))
            };
          }
          if (field.name === "lawsuitId" && client) {
            const clientLawsuits = lawsuits.filter(c => c.clientId === entityId);
            return {
              ...field,
              options: clientLawsuits.map(c => ({ value: c.id, label: c.lawsuitNumber }))
            };
          }
        }

        // For dossier detail view: show dossier and client as readonly, allow optional lawsuit selection
        if (entityType === "dossier") {
          const dossier = dossiers.find(d => d.id === entityId);
          if (field.name === "dossierId" && dossier) {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.dossierId || entityId,
              displayValue: dossier.lawsuitNumber
            };
          }
          if (field.name === "clientId" && dossier) {
            const client = clients.find(cl => cl.id === dossier.clientId);
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.clientId || dossier.clientId,
              displayValue: client ? client.name : t("detail.financial.fallback.unknownClient", { ns: "accounting" })
            };
          }
          // Only allow lawsuits from this dossier's client
          if (field.name === "lawsuitId" && dossier) {
            const dossierLawsuits = lawsuits.filter(c => c.clientId === dossier.clientId);
            return {
              ...field,
              options: dossierLawsuits.map(c => ({ value: c.id, label: c.lawsuitNumber }))
            };
          }
        }

        // For lawsuit detail view: pre-fill and disable lawsuitId AND clientId AND dossierId
        if (entityType === "lawsuit") {
          const lawsuitItem = lawsuits.find(c => c.id === entityId);
          if (field.name === "lawsuitId" && lawsuitItem) {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.lawsuitId || entityId,
              displayValue: lawsuitItem.lawsuitNumber
            };
          }
          if (field.name === "clientId" && lawsuitItem) {
            // Get client through the dossier relationship since lawsuits don't have direct clientId
            const dossier = dossiers.find(d => d.id === lawsuitItem.dossierId);
            const client = dossier ? clients.find(cl => cl.id === dossier.clientId) : null;
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.clientId || (client ? client.id : null),
              displayValue: client ? client.name : t("detail.financial.fallback.unknownClient", { ns: "accounting" })
            };
          }
          if (field.name === "dossierId" && lawsuitItem) {
            const dossier = dossiers.find(d => d.id === lawsuitItem.dossierId);
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.dossierId || lawsuitItem.dossierId,
              displayValue: dossier ? dossier.lawsuitNumber : t("detail.financial.fallback.unknownDossier", { ns: "accounting" })
            };
          }
        }

        // For officer (huissier) detail view: lock type to "expense" since huissiers only have expenses
        if (entityType === "officer") {
          const missions = entityData?.missions || [];

          // Extract unique dossiers and lawsuits from this officer's missions
          const officerDossierIds = new Set();
          const officerlawsuitIds = new Set();
          const officerClientIds = new Set();

          missions.forEach(mission => {
            if (mission.entityType === "dossier") {
              const dossier = dossiers.find(d => d.lawsuitNumber === mission.entityReference);
              if (dossier) {
                officerDossierIds.add(dossier.id);
                officerClientIds.add(dossier.clientId);
              }
            } else if (mission.entityType === "lawsuit") {
              const lawsuitItem = lawsuits.find(c => c.lawsuitNumber === mission.entityReference);
              if (lawsuitItem) {
                officerlawsuitIds.add(lawsuitItem.id);
                const dossier = dossiers.find(d => d.id === lawsuitItem.dossierId);
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
              displayValue: t("form.fields.type.options.expense", { ns: "accounting" }),
              helpText: t("detail.financial.help.bailiffExpensesOnly", { ns: "accounting" })
            };
          }
          // Pre-select category to "bailiff_fees"
          if (field.name === "category") {
            return {
              ...field,
              defaultValue: "bailiff_fees"
            };
          }
          // Lock officer field to current officer
          if (field.name === "officerId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: entityId,
              displayValue: entityData?.name || "Bailiff",
              helpText: t("detail.financial.help.expensesForBailiff", { ns: "accounting" })
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
              label: "Associated Mission *",
              helpText: t("detail.financial.help.selectMissionExpenses", { ns: "accounting" }),
              options: [
                { value: "", label: t("form.fields.mission.selectMission", { ns: "accounting" }) },
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
                      const dossier = [].find(d => d.lawsuitNumber === selectedMission.entityReference);
                      if (dossier) {
                        updates.dossierId = dossier.id;
                        updates.clientId = dossier.clientId;
                        updates.lawsuitId = ""; // Clear lawsuit if it was set
                      }
                    } else if (selectedMission.entityType === "lawsuit") {
                      const lawsuitItem = [].find(c => c.lawsuitNumber === selectedMission.entityReference);
                      if (lawsuitItem) {
                        updates.lawsuitId = lawsuitItem.id;
                        const dossier = [].find(d => d.id === lawsuitItem.dossierId);
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
            const clients = [].filter(c => officerClientIds.has(c.id));
            return {
              ...field,
              options: [
                { value: "", label: "Select a client..." },
                ...clients.map(c => ({ value: c.id, label: c.name }))
              ]
            };
          }

          // Filter dossier dropdown to only show dossiers that have missions with this officer
          if (field.name === "dossierId") {
            const dossiers = [].filter(d => officerDossierIds.has(d.id));
            return {
              ...field,
              options: [
                { value: "", label: "Sélectionner un dossier..." },
                ...dossiers.map(d => ({ value: d.id, label: d.lawsuitNumber }))
              ]
            };
          }

          // Filter lawsuit dropdown to only show lawsuits that have missions with this officer
          if (field.name === "lawsuitId") {
            const lawsuits = [].filter(c => officerlawsuitIds.has(c.id));
            return {
              ...field,
              options: [
                { value: "", label: "Select a lawsuit..." },
                ...lawsuits.map(c => ({ value: c.id, label: c.lawsuitNumber }))
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
              displayValue: t("form.fields.type.options.expense", { ns: "accounting" }),
              helpText: t("detail.financial.help.feesAreExpenses", { ns: "accounting" })
            };
          }

          // Lock category to "bailiff_fees"
          if (field.name === "category") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.category || "bailiff_fees",
              displayValue: t("table.category.frais_huissier", { ns: "accounting" }),
              helpText: t("detail.financial.help.autoCategoryBailiffFees", { ns: "accounting" })
            };
          }

          // Lock scope to "client"
          if (field.name === "scope") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.scope || "client",
              displayValue: t("form.fields.scope.options.client", { ns: "accounting" }),
            };
          }

          // Lock mission to current mission
          if (field.name === "missionId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.missionId || entityId,
              displayValue: `${entityData.missionNumber} - ${entityData.title}`,
              helpText: t("detail.financial.help.currentMission")
            };
          }

          // Lock officer to mission's officer
          if (field.name === "officerId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: editingEntry?.officerId || entityData.officerId,
              displayValue: entityData.officerName,
              helpText: t("detail.financial.help.missionOfficer")
            };
          }

          // Auto-fill client based on mission's entity
          if (field.name === "clientId") {
            let clientId = editingEntry?.clientId || null;
            let clientName = t("detail.financial.fallback.unknownClient", { ns: "accounting" });

            // If editing, use existing value, otherwise derive from mission
            if (!editingEntry) {
              // Use dossierId or lawsuitId directly from entityData instead of looking up by entityId
              if (entityData.dossierId) {
                const dossier = dossiers.find(d => d.id === entityData.dossierId);
                if (dossier) {
                  clientId = dossier.clientId;
                  const client = clients.find(c => c.id === dossier.clientId);
                  clientName = client ? client.name : t("detail.financial.fallback.unknownClient", { ns: "accounting" });
                }
              } else if (entityData.lawsuitId) {
                const lawsuitItem = lawsuits.find(c => c.id === entityData.lawsuitId);
                if (lawsuitItem) {
                  const dossier = dossiers.find(d => d.id === lawsuitItem.dossierId);
                  if (dossier) {
                    clientId = dossier.clientId;
                    const client = clients.find(c => c.id === dossier.clientId);
                    clientName = client ? client.name : t("detail.financial.fallback.unknownClient", { ns: "accounting" });
                  }
                }
              }
            } else {
              // When editing, get the display name from the stored clientId
              const client = clients.find(c => c.id === clientId);
              clientName = client ? client.name : t("detail.financial.fallback.unknownClient", { ns: "accounting" });
            }

            return {
              ...field,
              type: "readonly",
              defaultValue: clientId,
              displayValue: clientName,
              helpText: t("detail.financial.help.missionClient", { ns: "accounting" })
            };
          }

          // Auto-fill dossier based on mission's entity
          if (field.name === "dossierId") {
            let dossierId = editingEntry?.dossierId || null;
            let dossierRef = t("detail.financial.fallback.unknownDossier", { ns: "accounting" });

            // If editing, use existing value, otherwise derive from mission
            if (!editingEntry) {
              // Use dossierId directly from entityData
              if (entityData.dossierId) {
                dossierId = entityData.dossierId;
                const dossier = dossiers.find(d => d.id === entityData.dossierId);
                dossierRef = dossier ? `${dossier.lawsuitNumber} - ${dossier.title}` : t("detail.financial.fallback.unknownDossier", { ns: "accounting" });
              } else if (entityData.lawsuitId) {
                const lawsuitItem = lawsuits.find(c => c.id === entityData.lawsuitId);
                if (lawsuitItem) {
                  dossierId = lawsuitItem.dossierId;
                  const dossier = dossiers.find(d => d.id === lawsuitItem.dossierId);
                  dossierRef = dossier ? `${dossier.lawsuitNumber} - ${dossier.title}` : t("detail.financial.fallback.unknownDossier", { ns: "accounting" });
                }
              }
            } else {
              // When editing, get the display name from the stored dossierId
              const dossier = dossiers.find(d => d.id === dossierId);
              dossierRef = dossier ? `${dossier.lawsuitNumber} - ${dossier.title}` : t("detail.financial.fallback.unknownDossier", { ns: "accounting" });
            }

            return {
              ...field,
              type: "readonly",
              defaultValue: dossierId,
              displayValue: dossierRef,
              helpText: t("detail.financial.help.missionDossier", { ns: "accounting" })
            };
          }

          // Auto-fill lawsuit based on mission's entity (if applicable)
          if (field.name === "lawsuitId") {
            let lawsuitId = editingEntry?.lawsuitId || null;
            let lawsuitRef = null;

            // If editing, use existing value, otherwise derive from mission
            if (!editingEntry) {
              // Use lawsuitId directly from entityData
              if (entityData.lawsuitId) {
                lawsuitId = entityData.lawsuitId;
                const lawsuitItem = lawsuits.find(c => c.id === entityData.lawsuitId);
                lawsuitRef = lawsuitItem ? `${lawsuitItem.lawsuitNumber} - ${lawsuitItem.title}` : t("detail.financial.fallback.unknownLawsuit", { ns: "accounting" });
              }
            } else {
              // When editing, get the display name from the stored lawsuitId
              if (lawsuitId) {
                const lawsuitItem = lawsuits.find(c => c.id === lawsuitId);
                lawsuitRef = lawsuitItem ? `${lawsuitItem.lawsuitNumber} - ${lawsuitItem.title}` : t("detail.financial.fallback.unknownLawsuit", { ns: "accounting" });
              }
            }

            if (lawsuitId) {
              return {
                ...field,
                type: "readonly",
                defaultValue: lawsuitId,
                displayValue: lawsuitRef,
                helpText: t("detail.financial.help.missionLawsuit", { ns: "accounting" })
              };
            } else {
              // Hide the field if mission is not linked to a lawsuit
              return {
                ...field,
                type: "hidden",
                defaultValue: null
              };
            }
          }

          // Auto-populate title and description with mission reference (only for new entries)
          if (field.name === "title" && !editingEntry) {
            return {
              ...field,
              defaultValue: `Bailiff fees - ${entityData.missionNumber}`
            };
          }
          if (field.name === "description" && !editingEntry) {
            return {
              ...field,
              defaultValue: `Mission: ${entityData.title}`,
              placeholder: `Ex: Travel expenses, report fees, etc.`
            };
          }
        }

        // For officer (bailiff) detail view: lock type to "expense" since bailiffs only have expenses
        if (entityType === "officer") {
          const missions = entityData?.missions || [];

          // Extract unique dossiers and lawsuits from this officer's missions
          const officerDossierIds = new Set();
          const officerlawsuitIds = new Set();
          const officerClientIds = new Set();

          missions.forEach(mission => {
            if (mission.entityType === "dossier") {
              const dossier = [].find(d => d.lawsuitNumber === mission.entityReference);
              if (dossier) {
                officerDossierIds.add(dossier.id);
                officerClientIds.add(dossier.clientId);
              }
            } else if (mission.entityType === "lawsuit") {
              const lawsuitItem = [].find(c => c.lawsuitNumber === mission.entityReference);
              if (lawsuitItem) {
                officerlawsuitIds.add(lawsuitItem.id);
                const dossier = [].find(d => d.id === lawsuitItem.dossierId);
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
              displayValue: t("form.fields.type.options.expense", { ns: "accounting" }),
              helpText: t("detail.financial.help.bailiffExpensesOnly", { ns: "accounting" })
            };
          }
          // Pre-select category to "bailiff_fees"
          if (field.name === "category") {
            return {
              ...field,
              defaultValue: "bailiff_fees"
            };
          }
          // Lock officer field to current officer
          if (field.name === "officerId") {
            return {
              ...field,
              type: "readonly",
              defaultValue: entityId,
              displayValue: entityData?.name || "Bailiff",
              helpText: t("detail.financial.help.feesForBailiff", { ns: "accounting" })
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
              label: "Associated Mission *",
              helpText: t("detail.financial.help.selectMissionFees", { ns: "accounting" }),
              options: [
                { value: "", label: t("form.fields.mission.selectMission", { ns: "accounting" }) },
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
                      updates.description = `Bailiff fees - ${selectedMission.missionNumber} - ${selectedMission.title}`;
                    }

                    // Auto-populate related entities based on mission type
                    if (selectedMission.entityType === "dossier") {
                      const dossier = [].find(d => d.lawsuitNumber === selectedMission.entityReference);
                      if (dossier) {
                        updates.dossierId = dossier.id;
                        updates.clientId = dossier.clientId;
                        updates.lawsuitId = ""; // Clear lawsuit if it was set
                      }
                    } else if (selectedMission.entityType === "lawsuit") {
                      const lawsuitItem = [].find(c => c.lawsuitNumber === selectedMission.entityReference);
                      if (lawsuitItem) {
                        updates.lawsuitId = lawsuitItem.id;
                        const dossier = [].find(d => d.id === lawsuitItem.dossierId);
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

          // Filter clients - only those with dossiers/lawsuits assigned to this officer
          if (field.name === "clientId") {
            const filteredClients = [].filter(c => officerClientIds.has(c.id));
            return {
              ...field,
              type: "readonly",
              displayValue: (formData) => {
                if (formData.clientId) {
                  const client = filteredClients.find(c => c.id === formData.clientId);
                  return client ? client.name : t("detail.financial.fallback.unknownClient", { ns: "accounting" });
                }
                return t("detail.financial.fallback.selectMissionFirst", { ns: "accounting" });
              },
              helpText: t("detail.financial.help.missionClient", { ns: "accounting" })
            };
          }

          // Filter dossiers - only those assigned to this officer
          if (field.name === "dossierId") {
            const filteredDossiers = [].filter(d => officerDossierIds.has(d.id));
            return {
              ...field,
              type: "readonly",
              displayValue: (formData) => {
                if (formData.dossierId) {
                  const dossier = filteredDossiers.find(d => d.id === formData.dossierId);
                  return dossier ? `${dossier.lawsuitNumber} - ${dossier.title}` : t("detail.financial.fallback.unknownDossier", { ns: "accounting" });
                }
                return t("detail.financial.fallback.selectMissionFirst", { ns: "accounting" });
              },
              helpText: t("detail.financial.help.missionDossier", { ns: "accounting" })
            };
          }

          // Filter lawsuits - only those assigned to this officer
          if (field.name === "lawsuitId") {
            const filteredLawsuits = [].filter(c => officerlawsuitIds.has(c.id));
            return {
              ...field,
              type: "readonly",
              displayValue: (formData) => {
                if (formData.lawsuitId) {
                  const lawsuitItem = filteredLawsuits.find(c => c.id === formData.lawsuitId);
                  return lawsuitItem ? `${lawsuitItem.lawsuitNumber} - ${lawsuitItem.title}` : t("detail.financial.fallback.unknownLawsuit", { ns: "accounting" });
                }
                return t("detail.financial.fallback.missionDependent", { ns: "accounting" });
              },
              helpText: t("detail.financial.help.missionLawsuit", { ns: "accounting" })
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
              displayValue: t("form.fields.scope.options.internal", { ns: "accounting" }),
              helpText: t("detail.financial.help.personalTasksInternalOnly", { ns: "accounting" })
            };
          }
          // Pre-select category to "office_expenses"
          if (field.name === "category") {
            return {
              ...field,
              defaultValue: editingEntry?.category || "office_expenses"
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
                  {t("detail.financial.summary.billedFees", { ns: "common" })}
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title={t("detail.financial.summary.billedFeesHelp", { ns: "common" })}></i>
              </div>
              <i className="fas fa-money-bill-wave text-emerald-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.honoraires)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("detail.financial.summary.billedFeesDescription", { ns: "common" })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {t("detail.financial.summary.reimbursableExpenses", { ns: "common" })}
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title={t("detail.financial.summary.reimbursableExpensesHelp", { ns: "common" })}></i>
              </div>
              <i className="fas fa-file-invoice text-blue-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.reimbursableExpenses)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("detail.financial.summary.reimbursableExpensesDescription", { ns: "common" })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {t("detail.financial.summary.paymentsReceived", { ns: "common" })}
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title={t("detail.financial.summary.paymentsReceivedDescription", { ns: "common" })}></i>
              </div>
              <i className="fas fa-hand-holding-usd text-indigo-500"></i>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(balanceDetails.totalPaid)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("detail.financial.summary.paymentsReceivedDescription", { ns: "common" })}
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
                  {balanceDetails.balance > 0 ? t("detail.financial.summary.balance.toReceive", { ns: "common" }) : balanceDetails.balance < 0 ? t("detail.financial.summary.balance.overpaid", { ns: "common" }) : t("detail.financial.summary.balance.balanced", { ns: "common" })}
                </span>
                <i className="fas fa-info-circle text-slate-400 text-xs" title={
                  balanceDetails.balance > 0
                    ? t("detail.financial.summary.balance.toReceive", { ns: "common" })
                    : balanceDetails.balance < 0
                      ? t("detail.financial.summary.balance.overpaid", { ns: "common" })
                      : t("detail.financial.summary.balance.balanced", { ns: "common" })
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
                ? `🔻 ${t("detail.financial.summary.balance.clientOwes", { ns: "common", amount: formatCurrency(balanceDetails.balance) })}`
                : balanceDetails.balance < 0
                  ? `🔻 ${t("detail.financial.summary.balance.youOwe", { ns: "common", amount: formatCurrency(Math.abs(balanceDetails.balance)) })}`
                  : `✅ ${t("detail.financial.summary.balance.settled", { ns: "common" })}`}
            </div>
          </div>
        </div>
      )}

      {/* Summary for Dossier/Lawsuit */}
      {(entityType === "dossier" || entityType === "lawsuit") && summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {t("detail.financial.summary.revenue", { ns: "common" })}
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
                {t("detail.financial.summary.expenses", { ns: "common" })}
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
                {t("detail.financial.summary.netBalance", { ns: "common" })}
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
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t("detail.financial.table.title", { ns: "common", count: entries.length })}
          </h3>
          <button
            onClick={handleAddEntry}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            {t("page.actions.new")}
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
          sortBy={table.sortBy}
          sortDirection={table.sortDirection}
          onSort={table.handleSort}
          onResetSort={table.resetToIntelligentOrder}
        />

        {/* Mobile cards */}
        <div className="md:hidden p-4 space-y-3">
          {table.data.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              {table.isFiltering
                ? t("detail.financial.table.empty.search", { ns: "common" })
                : t("table.empty")}
            </p>
          )}
          {table.data.map((entry) => (
            <div
              key={entry.id}
              onClick={() => handleView(entry)}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {entry.title || entry.description || t("detail.financial.columns.entry", { ns: "common" })}
                  </div>
                  {entry.description && entry.title && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {entry.description}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold uppercase tracking-wide">
                      {t("detail.financial.columns.date", { ns: "common" })}
                    </span>
                    <span className="text-slate-700 dark:text-slate-200">
                      {formatDateValue(entry.date)}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  {renderStatusSelector(entry)}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span
                  className={`text-sm font-semibold ${entry.type === "revenue"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                    }`}
                >
                  {entry.amountWithSign || formatCurrency(entry.amount)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center"
                      aria-label={t("actions.more", { ns: "common", defaultValue: "More actions" })}
                    >
                      <i className="fas fa-ellipsis-h text-sm"></i>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        handleView(entry);
                      }}
                    >
                      {t("actions.view", { ns: "common" })}
                    </DropdownMenuItem>
                    {entityType !== "officer" && (
                      <>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            handleEdit(entry);
                          }}
                        >
                          {t("actions.edit", { ns: "common" })}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleDelete(entry.id);
                          }}
                        >
                          {t("actions.delete", { ns: "common" })}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <AdvancedTableHeader
              columns={table.columns}
              sortBy={table.sortBy}
              sortDirection={table.sortDirection}
              onSort={table.handleSort}
              onReorder={table.reorderColumns}
              enableReorder={true}
              isEmpty={table.data.length === 0}
            />
            <TableBody
              isEmpty={table.data.length === 0}
              emptyMessage={
                table.isFiltering
                  ? t("detail.financial.table.empty.search", { ns: "common" })
                  : t("table.empty")
              }
            >
              {table.data.map((entry) => (
                <TableRow
                  key={entry.id}
                  onClick={() => handleView(entry)}
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
            ? t("form.subtitle.edit")
            : t("form.subtitle.create")
        }
        fields={entryFields}
        initialData={editingEntry}
        entityType="financialEntry"
        entityId={editingEntry?.id}
        editingEntity={editingEntry}
        entities={{ clients, dossiers, lawsuits, missions, officers, financialEntries }}
        isLoading={isLoading}
      />

      {/* Entry Detail Modal - Global Glass Sheet Architecture */}
      <GlassModal
        isOpen={!!selectedEntry}
        onClose={handleCloseDetail}
        maxWidth="3xl"
      >
        {selectedEntry && (
          <>
            {/* Header - Fixed at Top */}
            <div className="flex-shrink-0 p-6 pb-4 border-b border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span
                      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide ${selectedEntry.type === "revenue"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                        }`}
                    >
                      <i className={`fas ${selectedEntry.type === "revenue" ? "fa-arrow-up" : "fa-arrow-down"} mr-1.5 text-xs`}></i>
                      {selectedEntry.type === "revenue"
                        ? t("detail.financial.types.revenue", { ns: "common" })
                        : t("detail.financial.types.expense", { ns: "common" })}
                    </span>
                    <span
                      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide bg-${selectedEntry.statusColor}-100 text-${selectedEntry.statusColor}-700 dark:bg-${selectedEntry.statusColor}-900/40 dark:text-${selectedEntry.statusColor}-300`}
                    >
                      {selectedEntry.statusLabel}
                    </span>
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-1 tracking-tight">
                    {selectedEntry.amountFormatted}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-1">
                    {selectedEntry.description}
                  </p>
                </div>
                <button
                  onClick={handleCloseDetail}
                  className="flex-shrink-0 p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
                  aria-label={t("actions.close", { ns: "common" })}
                >
                  <i className="fas fa-times text-slate-500 dark:text-slate-400 text-lg"></i>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6 custom-scrollbar">
              {/* Entry Details Grid */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">
                  {t("detail.financial.detail.sectionTitle", { ns: "common" })}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t("detail.financial.detail.date", { ns: "common" })}
                    </label>
                    <p className="text-base text-slate-900 dark:text-white font-semibold">
                      {formatDateValue(selectedEntry.date)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t("detail.financial.detail.category", { ns: "common" })}
                    </label>
                    <p className="text-base font-semibold flex items-center gap-2">
                      <i className={`${financialCategories[selectedEntry.category]?.icon} ${selectedEntry.category === "bailiff_fees" || selectedEntry.category === "frais_huissier"
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-400"
                        }`}></i>
                      <span className={
                        selectedEntry.category === "bailiff_fees" || selectedEntry.category === "frais_huissier"
                          ? "px-2 py-1 rounded-full text-sm font-bold bg-blue-600 text-white dark:bg-blue-500 dark:text-white shadow-sm"
                          : "text-slate-900 dark:text-white"
                      }>
                        {selectedEntry.categoryLabel}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t("detail.financial.detail.status", { ns: "common" })}
                    </label>
                    <div className="flex gap-2 mt-1">
                      <InlineStatusSelector
                        value={selectedEntry.status}
                        onChange={(newStatus) => handleStatusChange(selectedEntry.id, newStatus)}
                        statusOptions={Object.keys(financialStatuses).map((status) => ({
                          value: status,
                          label: t(`table.status.${status}`, { ns: "accounting" }),
                          color: financialStatuses[status].color,
                        }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t("detail.financial.detail.amount", { ns: "common" })}
                    </label>
                    <p
                      className={`text-3xl font-bold ${selectedEntry.type === "revenue"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                        }`}
                    >
                      {selectedEntry.amountWithSign}
                    </p>
                  </div>
                  {selectedEntry.clientName && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("detail.financial.detail.client", { ns: "common" })}
                      </label>
                      <p className="text-base text-slate-900 dark:text-white font-semibold">
                        {selectedEntry.clientName}
                      </p>
                    </div>
                  )}
                  {selectedEntry.dossierReference && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("detail.financial.detail.dossier", { ns: "common" })}
                      </label>
                      <p className="text-base text-slate-900 dark:text-white font-semibold font-mono">
                        {selectedEntry.dossierReference}
                      </p>
                    </div>
                  )}
                  {selectedEntry.lawsuitReference && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("detail.financial.detail.lawsuit", { ns: "common" })}
                      </label>
                      <p className="text-base text-slate-900 dark:text-white font-semibold font-mono">
                        {selectedEntry.lawsuitReference}
                      </p>
                    </div>
                  )}
                  {selectedEntry.createdBy && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("detail.financial.detail.createdBy", { ns: "common" })}
                      </label>
                      <p className="text-base text-slate-900 dark:text-white font-semibold">
                        {selectedEntry.createdBy}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Description Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  {t("detail.financial.detail.description", { ns: "common" })}
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 p-4 rounded-xl">
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {selectedEntry.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Sticky Action Bar at Bottom */}
            {entityType !== "officer" && (
              <div className="flex-shrink-0 border-t border-slate-200/50 dark:border-slate-700/50 p-4 bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => {
                      setSelectedEntry(null);
                      handleEdit(selectedEntry);
                    }}
                    className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold transition-all duration-200 inline-flex items-center justify-center gap-2.5 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <i className="fas fa-edit text-sm"></i>
                    <span>{t("actions.edit", { ns: "common" })}</span>
                  </button>
                  <button
                    onClick={() => handleDelete(selectedEntry.id)}
                    className="px-5 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl font-semibold transition-all duration-200 inline-flex items-center justify-center gap-2.5 shadow-lg shadow-red-600/25 hover:shadow-xl hover:shadow-red-600/30 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <i className="fas fa-trash text-sm"></i>
                    <span>{t("actions.delete", { ns: "common" })}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassModal>

      {/* Blocker Modal */}
      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName={t("detail.financial.blocker.actionName", { ns: "common" })}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={`Entry #${validationResult?.entityId || ''}`}
      />
      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingAction(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName={validationResult?.actionName || "confirm modification"}
        impactSummary={validationResult?.impactSummary || validationResult?.warnings || []}
        entityName={pendingAction?.newData?.description || selectedEntry?.description || editingEntry?.description || ''}
      />

    </div>
  );
}





