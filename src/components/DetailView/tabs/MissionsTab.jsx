import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useData } from "../../../contexts/DataContext";
import ContentSection from "../../layout/ContentSection";
import FormModal from "../../FormModal/FormModal";
import ConfirmImpactModal from "../../ui/ConfirmImpactModal";
import BlockerModal from "../../ui/BlockerModal";
import { canPerformAction } from "../../../services/domainRules";
import { getStatusColor } from "../config/statusColors";
import {
  formatCurrency
} from "../../../utils/financialUtils";
import {
  financialEntryFormFields,
  populateRelationshipOptions
} from "../../FormModal/formConfigs";
import { logEntityCreation, logAssignment } from "../../../services/historyService";
import { resolveDetailRoute } from "../../../utils/routeResolver";

/**
 * MissionsTab - Scalable mission list with document management
 * Designed for huissier detail view to handle large numbers of missions
 */
export default function MissionsTab({ data, config, tabConfig, onItemsChange, contextData }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { addMission, updateMission, deleteMission, addFinancialEntry } = useData();
  const [missions, setMissions] = useState(data[tabConfig.itemsKey] || []);

  // ✅ Synchronize local missions state with parent data prop
  useEffect(() => {
    setMissions(data[tabConfig.itemsKey] || []);
  }, [data, tabConfig.itemsKey]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({});
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editingEntryData, setEditingEntryData] = useState(null);
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [selectedMissionForFinance, setSelectedMissionForFinance] = useState(null);
  const [editingMissionId, setEditingMissionId] = useState(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [selectedMissionForDoc, setSelectedMissionForDoc] = useState(null);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);

  // Filter missions by status and search
  const filteredMissions = useMemo(() => {
    let filtered = missions;

    // Filter by status
    if (filterStatus !== "all") {
      filtered = filtered.filter((m) => m.status === filterStatus);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.missionNumber?.toLowerCase().includes(query) ||
          m.title?.toLowerCase().includes(query) ||
          m.entityReference?.toLowerCase().includes(query) ||
          m.missionType?.toLowerCase().includes(query)
      );
    }

    // Sort by date (most recent first)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.assignDate || 0);
      const dateB = new Date(b.assignDate || 0);
      return dateB - dateA;
    });
  }, [missions, filterStatus, searchQuery]);

  // Process form fields to handle dynamic options and getFormFields
  const processedFormFields = useMemo(() => {
    // Get form fields from either formFields array or getFormFields function
    let fields = [];

    if (typeof tabConfig.getFormFields === 'function') {
      // Call getFormFields with current data and contextData
      fields = tabConfig.getFormFields(data, contextData);
    } else if (tabConfig.formFields) {
      // Use static formFields array
      fields = tabConfig.formFields;
    } else {
      return [];
    }

    // Process getOptions functions for dynamic dropdowns
    return fields.map((field) => {
      if (field.getOptions && typeof field.getOptions === "function") {
        return {
          ...field,
          options: field.getOptions(formData),
        };
      }
      return field;
    });
  }, [tabConfig.formFields, tabConfig.getFormFields, formData, data]);

  const handleAddMission = async (submittedFormData) => {
    // Validate via domain rules
    if (editingMissionId) {
      const currentMission = missions.find(m => m.id === editingMissionId);
      const result = canPerformAction('mission', editingMissionId, 'edit', {
        data: currentMission,
        newData: submittedFormData
      });

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }

      // Check if confirmation is required for relational changes (e.g., officer reassignment)
      if (result.requiresConfirmation) {
        setValidationResult(result);
        setPendingFormData(submittedFormData);
        setConfirmImpactModalOpen(true);
        return;
      }
    } else {
      const result = canPerformAction('mission', null, 'add', { newData: submittedFormData });
      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
      if (result.requiresConfirmation) {
        setValidationResult(result);
        setPendingFormData(submittedFormData);
        setConfirmImpactModalOpen(true);
        return;
      }
    }

    // Proceed with save
    await performMissionSave(submittedFormData);
  };

  const performMissionSave = async (submittedFormData) => {
    setIsLoading(true);

    try {
      // Check if we're editing an existing mission
      if (editingMissionId) {
        // UPDATE EXISTING MISSION
        console.log("📝 Updating mission ID:", editingMissionId, "with:", submittedFormData);

        // ✅ Call backend API to update mission
        await updateMission(editingMissionId, submittedFormData);

        // Fetch updated mission from local state (DataContext will have updated it)
        const updatedMissions = missions.map(m =>
          m.id === editingMissionId ? { ...m, ...submittedFormData } : m
        );

        setMissions(updatedMissions);

        if (onItemsChange) {
          onItemsChange(tabConfig.itemsKey, updatedMissions);
        }

        showToast("Mission modifiée avec succès!", "success");
        setEditingMissionId(null);
      } else {
        // ADD NEW MISSION
        console.log("📝 Mission creation - submittedFormData:", submittedFormData);

        // Extract financial entries to create separately after mission creation
        const { financialEntries, entityType, entityReference, ...restFormData } = submittedFormData;

        // Derive relational context based on parent entity (dossier, case, officer)
        const relationshipFields = (() => {
          const rel = {};
          if (config?.entityType === "dossier") {
            rel.dossierId = data.id;
          } else if (config?.entityType === "case") {
            rel.caseId = data.id;
          } else if (config?.entityType === "officer") {
            // When creating from officer view, convert entityReference to ID
            if (entityType && entityReference) {
              if (entityType === 'dossier') {
                const dossier = contextData?.dossiers?.find(d => d.caseNumber === entityReference);
                if (dossier) rel.dossierId = dossier.id;
              } else if (entityType === 'case') {
                const caseEntity = contextData?.cases?.find(c => c.caseNumber === entityReference);
                if (caseEntity) rel.caseId = caseEntity.id;
              }
            }
          }
          return rel;
        })();

        // Prepare mission data for backend (without financialEntries)
        const missionData = {
          ...restFormData,
          ...relationshipFields,
        };

        console.log("✨ Sending mission to backend:", missionData);

        // ✅ Call backend API to create mission
        const creation = await addMission(missionData);
        const createdMission = creation?.created || creation;

        console.log("✅ Mission created with ID:", createdMission.id);

        // ✅ Create financial entries if they exist
        if (financialEntries && Array.isArray(financialEntries) && financialEntries.length > 0) {
          console.log("💰 Creating financial entries for mission:", financialEntries);

          for (const entry of financialEntries) {
            const financialEntryData = {
              ...entry,
              // ✅ Link to the mission we just created
              missionId: createdMission.id,
              // Link to the client from the dossier/case
              clientId: relationshipFields.dossierId
                ? contextData?.dossiers?.find(d => d.id === relationshipFields.dossierId)?.clientId
                : relationshipFields.caseId
                  ? contextData?.cases?.find(c => c.id === relationshipFields.caseId)?.dossierId
                    ? contextData?.dossiers?.find(d => d.id === contextData.cases.find(c => c.id === relationshipFields.caseId).dossierId)?.clientId
                    : null
                  : null,
              dossierId: relationshipFields.dossierId || null,
              caseId: relationshipFields.caseId || null,
              type: 'expense', // Officer fees are expenses
              category: 'frais_huissier',
              status: entry.status || 'Brouillon',
              currency: entry.currency || 'TND',
            };

            try {
              await addFinancialEntry(financialEntryData);
              console.log("✅ Financial entry created:", financialEntryData);
            } catch (error) {
              console.error("❌ Failed to create financial entry:", error);
            }
          }

          showToast(`Mission ajoutée avec ${financialEntries.length} frais enregistré(s)!`, "success");
        } else {
          showToast("Mission ajoutée avec succès!", "success");
        }

        // Update local state with the created mission
        const updatedMissions = [createdMission, ...missions];
        setMissions(updatedMissions);

        if (onItemsChange) {
          onItemsChange(tabConfig.itemsKey, updatedMissions);
        }

        // ✅ Navigate to detail view after creation using real database ID
        const detailRoute = resolveDetailRoute('mission', createdMission.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }

      }

      setIsAddModalOpen(false);
      setFormData({});
    } catch (error) {
      console.error("Error adding mission:", error);
      showToast("Erreur lors de l'ajout", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMission = async (missionId) => {
    const mission = missions.find(m => m.id === missionId);
    const result = canPerformAction('mission', missionId, 'delete', { data: mission });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (result.requiresConfirmation) {
      setValidationResult(result);
      setPendingFormData({ deleteId: missionId });
      setConfirmImpactModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Supprimer la mission",
      message: "AStes-vous sA¯r de vouloir supprimer cette mission ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      try {
        // ✅ Call backend API to delete mission
        console.log("🗑️ Deleting mission ID:", missionId);
        await deleteMission(missionId);

        // Update local state
        const updatedMissions = missions.filter((m) => m.id !== missionId);
        setMissions(updatedMissions);

        if (onItemsChange) {
          onItemsChange(tabConfig.itemsKey, updatedMissions);
        }

        showToast("Mission supprimée avec succès!", "success");
      } catch (error) {
        console.error("❌ Error deleting mission:", error);
        showToast("Erreur lors de la suppression de la mission", "error");
      }
    }
  };

  const handleModalOpen = () => {
    const defaults = {};

    // Get fields from either getFormFields function or formFields array
    let fields = [];
    if (typeof tabConfig.getFormFields === 'function') {
      fields = tabConfig.getFormFields(data, contextData);
    } else if (tabConfig.formFields) {
      fields = tabConfig.formFields;
    }

    // Set default values for all fields
    fields.forEach((field) => {
      defaults[field.name] = field.defaultValue || "";
    });

    setFormData(defaults);
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    setFormData({});
    setEditingMissionId(null);
    setIsAddModalOpen(false);
  };

  const handleMissionClick = (mission, evt) => {
    if (evt) {
      evt.stopPropagation();
      evt.preventDefault();
    }
    // ✅ Always navigate to mission detail (not officer)
    navigate(`/missions/${mission.id}`, {
      state: {
        from: location.pathname,
        tab: new URLSearchParams(location.search).get('tab') || 'overview'
      }
    });
  };

  const handleAddFinancialEntry = async (formData) => {
    try {
      // Add the financial entry
      const newEntry = {
        ...formData,
        missionId: selectedMissionForFinance.id,
        missionNumber: selectedMissionForFinance.missionNumber,
        officerId: data.id,
        officerName: data.name,
        createdAt: new Date().toISOString(),
        createdBy: "User",
      };

      const validation = canPerformAction("financialEntry", null, "add", { data: newEntry, newData: newEntry });
      if (!validation.allowed) {
        setValidationResult(validation);
        setBlockerModalOpen(true);
        return;
      }
      if (validation.requiresConfirmation) {
        setValidationResult(validation);
        setConfirmImpactModalOpen(true);
        return;
      }

      const savedEntry = addFinancialEntry(newEntry);
      if (!savedEntry.entry) {
        if (savedEntry.result) {
          setValidationResult(savedEntry.result);
          setBlockerModalOpen(true);
        }
        return;
      }

      // Update the mission's financial entries
      const updatedMissions = missions.map(m =>
        m.id === selectedMissionForFinance.id
          ? { ...m, financialEntries: [...(m.financialEntries || []), savedEntry.entry] }
          : m
      );

      setMissions(updatedMissions);
      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedMissions);
      }

      setIsFinancialModalOpen(false);
      setSelectedMissionForFinance(null);
      showToast("Frais ajouté avec succès", "success");

      // ✅ Navigate to the new financial entry's detail view
      if (savedEntry && savedEntry.id) {
        const detailRoute = resolveDetailRoute('financialEntry', savedEntry.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }
    } catch (error) {
      console.error("Error adding financial entry:", error);
      showToast("Erreur lors de l'ajout des frais", "error");
    }
  };

  const handleAddDocument = (mission) => {
    setSelectedMissionForDoc(mission);
    // Trigger file input click
    document.getElementById(`doc-upload-${mission.id}`)?.click();
  };

  const handleDocumentSelect = async (missionId, files) => {
    if (!files || files.length === 0) return;

    setUploadingDocument(true);
    try {
      const fileArray = Array.from(files);

      const formatFileSize = (bytes) => {
        if (!bytes) return '0 KB';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      };

      const getCategoryFromType = (extension) => {
        const categoryMap = {
          'pdf': 'PDF',
          'doc': 'Document',
          'docx': 'Document',
          'xls': 'Tableur',
          'xlsx': 'Tableur',
          'ppt': 'Présentation',
          'pptx': 'Présentation',
          'jpg': 'Image',
          'jpeg': 'Image',
          'png': 'Image',
          'gif': 'Image',
          'zip': 'Archive',
          'rar': 'Archive',
          'txt': 'Texte',
        };
        return categoryMap[extension?.toLowerCase()] || 'Autre';
      };

      const newDocuments = fileArray.map((file) => {
        const extension = file.name.split('.').pop();
        return {
          id: Date.now() + Math.random(),
          name: file.name,
          type: extension,
          size: formatFileSize(file.size),
          uploadDate: new Date().toISOString().split('T')[0],
          category: getCategoryFromType(extension),
        };
      });

      const updatedMissions = missions.map((mission) => {
        if (mission.id === missionId) {
          return {
            ...mission,
            documents: [...(mission.documents || []), ...newDocuments],
          };
        }
        return mission;
      });

      setMissions(updatedMissions);

      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedMissions);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      showToast(`${newDocuments.length} document(s) ajouté(s) avec succès!`, "success");
    } catch (error) {
      console.error("Error uploading documents:", error);
      showToast("Erreur lors de l'ajout des documents", "error");
    } finally {
      setUploadingDocument(false);
      setSelectedMissionForDoc(null);
    }
  };

  const handleDeleteDocument = async (missionId, documentId) => {
    if (await confirm({
      title: "Supprimer le document",
      message: "Êtes-vous sûr de vouloir supprimer ce document ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      const updatedMissions = missions.map((mission) => {
        if (mission.id === missionId) {
          return {
            ...mission,
            documents: mission.documents.filter((doc) => doc.id !== documentId),
          };
        }
        return mission;
      });

      setMissions(updatedMissions);

      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedMissions);
      }

      console.log("Deleting document:", documentId);
    }
  };

  const handleEditFinancialEntry = (entry) => {
    setEditingEntryId(entry.id);
    setEditingEntryData({ ...entry });
  };

  const handleSaveFinancialEntry = (missionId) => {
    if (!editingEntryData) return;

    const updatedMissions = missions.map((mission) => {
      if (mission.id === missionId && mission.financialEntries) {
        return {
          ...mission,
          financialEntries: mission.financialEntries.map((entry) =>
            entry.id === editingEntryId ? editingEntryData : entry
          ),
        };
      }
      return mission;
    });

    setMissions(updatedMissions);

    if (onItemsChange) {
      onItemsChange(tabConfig.itemsKey, updatedMissions);
    }

    setEditingEntryId(null);
    setEditingEntryData(null);
    showToast("Frais mis à jour avec succès!", "success");
  };

  const handleCancelEditFinancialEntry = () => {
    setEditingEntryId(null);
    setEditingEntryData(null);
  };

  const handleDeleteFinancialEntry = async (missionId, entryId) => {
    if (await confirm({
      title: "Supprimer les frais",
      message: "Êtes-vous sûr de vouloir supprimer ces frais ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      const updatedMissions = missions.map((mission) => {
        if (mission.id === missionId && mission.financialEntries) {
          return {
            ...mission,
            financialEntries: mission.financialEntries.filter((entry) => entry.id !== entryId),
          };
        }
        return mission;
      });

      setMissions(updatedMissions);

      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedMissions);
      }

      showToast("Frais supprimés avec succès!", "success");
    }
  };

  // Status counts
  const statusCounts = useMemo(() => {
    return {
      all: missions.length,
      Programmée: missions.filter((m) => m.status === "Programmée").length,
      "En cours": missions.filter((m) => m.status === "En cours").length,
      Terminée: missions.filter((m) => m.status === "Terminée").length,
      Annulée: missions.filter((m) => m.status === "Annulée").length,
    };
  }, [missions]);

  if (missions.length === 0) {
    return (
      <>
        <ContentSection title={tabConfig.label}>
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <i
                className={`${tabConfig.icon} text-slate-400 dark:text-slate-600 text-2xl`}
              ></i>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {tabConfig.emptyMessage || "Aucune mission"}
            </p>

            {tabConfig.allowAdd !== false && (
              <button
                onClick={handleModalOpen}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                Ajouter {tabConfig.entityName || 'une mission'}
              </button>
            )}
          </div>
        </ContentSection>

        {(tabConfig.formFields || tabConfig.getFormFields) && (
          <FormModal
            isOpen={isAddModalOpen}
            onClose={handleModalClose}
            onSubmit={handleAddMission}
            title={editingMissionId ? "Modifier la mission" : "Ajouter une mission"}
            subtitle={tabConfig.addSubtitle}
            fields={processedFormFields}
            isLoading={isLoading}
            formData={formData}
            onFormDataChange={setFormData}
            submitText={editingMissionId ? "Modifier" : "Ajouter"}
            entityType="mission"
            entities={contextData}
          />
        )}
      </>
    );
  }

  return (
    <>
      <ContentSection
        title={`${tabConfig.label} (${missions.length})`}
        actions={
          tabConfig.allowAdd !== false && (
            <button
              onClick={handleModalOpen}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
            >
              <i className="fas fa-plus"></i>
              Ajouter
            </button>
          )
        }
      >
        {/* Filters and Search */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input
              type="text"
              placeholder="Rechercher par numéro, titre, référence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "all"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              Toutes ({statusCounts.all})
            </button>
            <button
              onClick={() => setFilterStatus("Programmée")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "Programmée"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              Programmées ({statusCounts.Programmée})
            </button>
            <button
              onClick={() => setFilterStatus("En cours")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "En cours"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              En cours ({statusCounts["En cours"]})
            </button>
            <button
              onClick={() => setFilterStatus("Terminée")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "Terminée"
                ? "bg-green-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              Terminées ({statusCounts.Terminée})
            </button>
            <button
              onClick={() => setFilterStatus("Annulée")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "Annulée"
                ? "bg-red-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              Annulées ({statusCounts.Annulée})
            </button>
          </div>
        </div>

        {/* Mission List */}
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {filteredMissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              Aucune mission trouvée pour les critères sélectionnés
            </div>
          ) : (
            filteredMissions.map((mission) => (
              <div
                key={mission.id}
                className="group p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                onClick={(e) => handleMissionClick(mission, e)}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Mission Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {mission.missionNumber}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          mission.status
                        )}`}
                      >
                        {mission.status}
                      </span>
                      {mission.priority === "Haute" && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          <i className="fas fa-exclamation-circle mr-1"></i>
                          Priorité haute
                        </span>
                      )}
                    </div>

                    <p className="text-slate-900 dark:text-white font-medium mb-1">
                      {mission.title}
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                      <span>
                        <i className="fas fa-tag mr-1"></i>
                        {mission.missionType}
                      </span>
                      <span>
                        <i className="fas fa-folder mr-1"></i>
                        {mission.entityReference}
                      </span>
                      <span>
                        <i className="fas fa-calendar mr-1"></i>
                        Assigné: {mission.assignDate}
                      </span>
                      {mission.dueDate && (
                        <span>
                          <i className="fas fa-clock mr-1"></i>
                          Échéance: {mission.dueDate}
                        </span>
                      )}
                      {mission.documents && mission.documents.length > 0 && (
                        <span className="text-blue-600 dark:text-blue-400">
                          <i className="fas fa-paperclip mr-1"></i>
                          {mission.documents.length} document(s)
                        </span>
                      )}
                      {mission.financialEntries && mission.financialEntries.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          <i className="fas fa-coins mr-1"></i>
                          {formatCurrency(
                            mission.financialEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
                          )} frais
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {tabConfig.allowDelete !== false && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMission(mission.id);
                        }}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Supprimer"
                      >
                        <i className="fas fa-trash text-red-600 dark:text-red-400 text-sm"></i>
                      </button>
                    )}
                    <i className="fas fa-chevron-right text-slate-400"></i>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ContentSection>

      {/* Add Mission Modal */}
      {(tabConfig.formFields || tabConfig.getFormFields) && (
        <FormModal
          isOpen={isAddModalOpen}
          onClose={handleModalClose}
          onSubmit={handleAddMission}
          title={editingMissionId ? "Modifier la mission" : "Ajouter une mission"}
          subtitle={
            tabConfig.addSubtitle ||
            `Créer une nouvelle mission pour ${config.getTitle(data)}`
          }
          fields={processedFormFields}
          isLoading={isLoading}
          formData={formData}
          onFormDataChange={setFormData}
          submitText={editingMissionId ? "Modifier" : "Ajouter"}
          entityType="mission"
          entities={contextData}
        />
      )}


      {/* Financial Entry Modal */}
      {isFinancialModalOpen && selectedMissionForFinance && (
        <FormModal
          isOpen={isFinancialModalOpen}
          onClose={() => {
            setIsFinancialModalOpen(false);
            setSelectedMissionForFinance(null);
          }}
          onSubmit={handleAddFinancialEntry}
          title="Ajouter frais d'huissier"
          subtitle={`Mission: ${selectedMissionForFinance.missionNumber} - ${selectedMissionForFinance.title}`}
          fields={(() => {
            // Get base fields and populate with data
            const baseFields = populateRelationshipOptions(financialEntryFormFields, {
              clients: [],
              dossiers: [],
              cases: [],
              missions: []
            });

            // Auto-populate fields based on mission
            let clientId = null;
            let dossierId = null;
            let caseId = null;

            if (selectedMissionForFinance.entityType === "dossier") {
              // Mission linked to a dossier
              const dossier = [].find(d => d.caseNumber === selectedMissionForFinance.entityReference);
              if (dossier) {
                dossierId = dossier.id;
                clientId = dossier.clientId;
              }
            } else if (selectedMissionForFinance.entityType === "case") {
              // Mission linked to a case
              const caseItem = [].find(c => c.caseNumber === selectedMissionForFinance.entityReference);
              if (caseItem) {
                caseId = caseItem.id;
                dossierId = caseItem.dossierId;
                // Get client from the dossier
                const dossier = [].find(d => d.id === caseItem.dossierId);
                if (dossier) {
                  clientId = dossier.clientId;
                }
              }
            }

            return baseFields.map(field => {
              if (field.name === "scope") {
                return { ...field, type: "readonly", defaultValue: "client", displayValue: "Client (affecte le solde client)" };
              }
              if (field.name === "type") {
                return { ...field, type: "readonly", defaultValue: "expense", displayValue: "Dépense (frais payé)" };
              }
              if (field.name === "category") {
                return { ...field, type: "readonly", defaultValue: "frais_huissier", displayValue: "Frais d'huissier" };
              }
              if (field.name === "clientId") {
                const client = [].find(c => c.id === clientId);
                return {
                  ...field,
                  type: "readonly",
                  defaultValue: clientId || "",
                  displayValue: client ? client.name : "Aucun client"
                };
              }
              if (field.name === "dossierId") {
                const doss = [].find(d => d.id === dossierId);
                return {
                  ...field,
                  type: "readonly",
                  defaultValue: dossierId || "",
                  displayValue: doss ? `${doss.caseNumber} - ${doss.title}` : "Aucun dossier"
                };
              }
              if (field.name === "caseId") {
                const caseItem = [].find(c => c.id === caseId);
                return {
                  ...field,
                  type: "readonly",
                  defaultValue: caseId || "",
                  displayValue: caseItem ? `${caseItem.caseNumber} - ${caseItem.title}` : "Aucun"
                };
              }
              if (field.name === "missionId") {
                return {
                  ...field,
                  type: "readonly",
                  defaultValue: selectedMissionForFinance.id,
                  displayValue: `${selectedMissionForFinance.missionNumber} - ${selectedMissionForFinance.title}`
                };
              }
              if (field.name === "description") {
                return {
                  ...field,
                  defaultValue: `Frais d'huissier - ${selectedMissionForFinance.missionNumber} - ${selectedMissionForFinance.title}`
                };
              }
              return field;
            });
          })()}
          isLoading={false}
        />
      )}

      {/* Relational-Impact Confirmation Modal */}
      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={async () => {
          setConfirmImpactModalOpen(false);
          if (pendingFormData?.deleteId) {
            const missionId = pendingFormData.deleteId;
            const updatedMissions = missions.filter((m) => m.id !== missionId);
            setMissions(updatedMissions);
            if (onItemsChange) {
              onItemsChange(tabConfig.itemsKey, updatedMissions);
            }
          } else {
            await performMissionSave(pendingFormData);
          }
          setPendingFormData(null);
        }}
        actionName="modifier le rattachement de la mission"
        impactSummary={validationResult?.impactSummary || []}
        entityName={missions.find(m => m.id === editingMissionId)?.missionNumber || ""}
      />
      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Action mission"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.missionNumber || validationResult?.entityData?.title || ""}
      />
    </>
  );
}
