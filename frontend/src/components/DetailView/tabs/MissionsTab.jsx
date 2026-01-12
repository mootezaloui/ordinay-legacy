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
  getFinancialEntryFormFields,
  populateRelationshipOptions
} from "../../FormModal/formConfigs";
import { logEntityCreation, logAssignment } from "../../../services/historyService";
import { resolveDetailRoute } from "../../../utils/routeResolver";
import { useSettings } from "../../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import documentService from "../../../services/documentService";

/**
 * MissionsTab - Scalable mission list with document management
 * Designed for huissier detail view to handle large numbers of missions
 */
export default function MissionsTab({ data, config, tabConfig, onItemsChange, contextData }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { formatDate } = useSettings();
  const { t } = useTranslation(["missions", "common"]);
  const {
    clients,
    dossiers,
    cases,
    tasks,
    sessions,
    officers,
    missions: allMissions,
    financialEntries,
    addMission,
    updateMission,
    deleteMission,
    addFinancialEntry
  } = useData();
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
  const allowAdd = tabConfig.allowAdd !== false;
  const hasParentEntities = (Array.isArray(dossiers) && dossiers.length > 0) || (Array.isArray(cases) && cases.length > 0);
  const canAddMission = allowAdd && hasParentEntities;

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
        newData: submittedFormData,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions: allMissions, financialEntries }
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
      const result = canPerformAction('mission', null, 'add', {
        newData: submittedFormData,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions: allMissions, financialEntries }
      });
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

        // ✅ Call backend API to update mission and get the adapted result
        const updatedMission = await updateMission(editingMissionId, submittedFormData);

        // Update local state with the properly adapted mission data from the API
        const updatedMissions = missions.map(m =>
          m.id === editingMissionId ? updatedMission : m
        );

        setMissions(updatedMissions);

        if (onItemsChange) {
          onItemsChange(tabConfig.itemsKey, updatedMissions);
        }

        showToast(t("detail.missions.toast.success.update"), "success");
        setEditingMissionId(null);
      } else {
        // ADD NEW MISSION
        console.log("📝 Mission creation - submittedFormData:", submittedFormData);

        // Extract financial entries, documents, and notes to create separately after mission creation
        const { financialEntries, documents, notes, entityType, entityReference, ...restFormData } = submittedFormData;

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

        // Preserve the user's relationship selection when creating from officer context
        if (!missionData.entityType) {
          missionData.entityType = entityType || config?.entityType;
        }

        // Enforce dossier/case XOR before hitting the API (case wins conflicts, like tasks)
        const normalizedCaseId = missionData.caseId ?? missionData.case_id;
        const normalizedDossierId = missionData.dossierId ?? missionData.dossier_id;
        if (normalizedCaseId && normalizedDossierId) {
          missionData.dossierId = null;
          missionData.dossier_id = null;
        }

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
              category: 'Bailiff_fees',
              status: entry.status || 'Draft',
              currency: entry.currency || 'TND',
            };

            try {
              await addFinancialEntry(financialEntryData);
              console.log("✅ Financial entry created:", financialEntryData);
            } catch (error) {
              console.error("❌ Failed to create financial entry:", error);
            }
          }
        }

        // ✅ Upload documents if they exist
        let documentsUploaded = 0;
        if (documents && Array.isArray(documents) && documents.length > 0) {
          console.log("📄 Uploading documents for mission:", documents);

          const uploadResults = await documentService.uploadMultipleDocuments(
            documents,
            'mission',
            createdMission.id,
            'Mission Document'
          );

          if (uploadResults.successful.length > 0) {
            console.log("✅ Documents uploaded successfully:", uploadResults.successful);
            documentsUploaded = uploadResults.successful.length;
            // Attach uploaded documents to the created mission
            createdMission.documents = uploadResults.successful;
          }

          if (uploadResults.failed.length > 0) {
            console.error("❌ Some documents failed to upload:", uploadResults.failed);
            showToast(
              t("detail.missions.toast.warning.partialDocUpload", {
                successful: uploadResults.successful.length,
                failed: uploadResults.failed.length,
                defaultValue: `${uploadResults.successful.length} document(s) uploaded, ${uploadResults.failed.length} failed`
              }),
              "warning"
            );
          }
        }

        // ✅ Convert notes string to array format if present
        let notesSaved = false;
        if (notes && typeof notes === 'string' && notes.trim()) {
          console.log("📝 Converting notes string to array format:", notes);

          // Convert string to proper note object array
          const noteObject = {
            id: Date.now(),
            content: notes.trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          try {
            // Update the mission with notes in array format
            await updateMission(createdMission.id, { notes: [noteObject] });
            console.log("✅ Notes saved successfully:", noteObject);
            createdMission.notes = [noteObject];
            notesSaved = true;
          } catch (error) {
            console.error("❌ Failed to save notes:", error);
          }
        }

        // Show consolidated success message
        const hasFinancialEntries = financialEntries && financialEntries.length > 0;
        const hasDocuments = documentsUploaded > 0;
        const hasNotes = notesSaved;

        if (hasFinancialEntries && hasDocuments && hasNotes) {
          showToast(
            t("detail.missions.toast.success.addComplete", {
              entries: financialEntries.length,
              docs: documentsUploaded,
              defaultValue: `Mission created with ${financialEntries.length} fee(s), ${documentsUploaded} document(s), and notes`
            }),
            "success"
          );
        } else if (hasFinancialEntries && hasDocuments) {
          showToast(
            t("detail.missions.toast.success.addWithEntriesAndDocs", {
              entries: financialEntries.length,
              docs: documentsUploaded,
              defaultValue: `Mission created with ${financialEntries.length} financial entry(ies) and ${documentsUploaded} document(s)`
            }),
            "success"
          );
        } else if (hasFinancialEntries && hasNotes) {
          showToast(
            t("detail.missions.toast.success.addWithEntriesAndNotes", {
              count: financialEntries.length,
              defaultValue: `Mission created with ${financialEntries.length} fee(s) and notes`
            }),
            "success"
          );
        } else if (hasDocuments && hasNotes) {
          showToast(
            t("detail.missions.toast.success.addWithDocsAndNotes", {
              count: documentsUploaded,
              defaultValue: `Mission created with ${documentsUploaded} document(s) and notes`
            }),
            "success"
          );
        } else if (hasFinancialEntries) {
          showToast(
            t("detail.missions.toast.success.addWithEntries", {
              count: financialEntries.length,
              defaultValue: `Mission created with ${financialEntries.length} financial entry(ies)`
            }),
            "success"
          );
        } else if (hasDocuments) {
          showToast(
            t("detail.missions.toast.success.addWithDocs", {
              count: documentsUploaded,
              defaultValue: `Mission created with ${documentsUploaded} document(s)`
            }),
            "success"
          );
        } else if (hasNotes) {
          showToast(
            t("detail.missions.toast.success.addWithNotes", {
              defaultValue: "Mission created with notes"
            }),
            "success"
          );
        } else {
          showToast(t("detail.missions.toast.success.add", { defaultValue: "Mission created successfully" }), "success");
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
      showToast(t("detail.missions.toast.error.add"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMission = async (missionId) => {
    const mission = missions.find(m => m.id === missionId);
    const result = canPerformAction('mission', missionId, 'delete', {
      data: mission,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

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

    try {
      // ✅ STEP 1: Check delete impact BEFORE showing confirmation
      console.log("🔍 Checking delete impact for mission ID:", missionId);
      const { apiClient } = await import('../../../services/api/client');
      const impactResponse = await apiClient.get(`/missions/${missionId}/delete-impact`);

      console.log("📊 Delete impact analysis:", impactResponse);

      // ✅ STEP 2: Build impact summary for user
      const { canDelete, impacts } = impactResponse;
      const impactSummary = [];

      if (impacts.financialEntries && impacts.financialEntries.length > 0) {
        impactSummary.push({
          type: 'cascade',
          message: `${impacts.financialEntries.length} financial entry(ies) will be permanently deleted`,
          details: impacts.financialEntries.map(e => `${e.title} (${e.amount} ${e.currency})`).join(', ')
        });
      }

      if (impacts.documents && impacts.documents.length > 0) {
        impactSummary.push({
          type: 'cascade',
          message: `${impacts.documents.length} document(s) will be permanently deleted`,
          details: impacts.documents.map(d => d.title).join(', ')
        });
      }

      if (impacts.notes && impacts.notes.length > 0) {
        impactSummary.push({
          type: 'cascade',
          message: `${impacts.notes.length} note(s) will be permanently deleted`,
          details: impacts.notes.map(n => n.content).join(', ')
        });
      }

      if (impacts.notifications && impacts.notifications.length > 0) {
        impactSummary.push({
          type: 'cascade',
          message: `${impacts.notifications.length} notification(s) will be permanently deleted`,
          details: impacts.notifications.map(n => n.title).join(', ')
        });
      }

      if (impacts.history && impacts.history.length > 0) {
        impactSummary.push({
          type: 'cascade',
          message: `${impacts.history.length} history event(s) will be permanently deleted`,
          details: impacts.history.map(h => h.description).join(', ')
        });
      }

      // ✅ STEP 3: Show impact warning modal if there are dependencies
      if (impactSummary.length > 0) {
        setValidationResult({
          allowed: true,
          requiresConfirmation: true,
          impactSummary,
          message: `Deleting this mission will also delete all related data. This action cannot be undone.`,
        });
        setPendingFormData({ deleteId: missionId });
        setConfirmImpactModalOpen(true);
        return;
      }

      // ✅ STEP 4: No dependencies - show simple confirmation
      if (await confirm({
        title: t("dialog.detail.missions.delete.title"),
        message: t("dialog.detail.missions.delete.message"),
        confirmText: t("dialog.detail.missions.delete.confirm"),
        cancelText: t("dialog.detail.missions.delete.cancel"),
        variant: "danger"
      })) {
        console.log("🗑️ Deleting mission ID:", missionId);
        await deleteMission(missionId);

        // Update local state
        const updatedMissions = missions.filter((m) => m.id !== missionId);
        setMissions(updatedMissions);

        if (onItemsChange) {
          onItemsChange(tabConfig.itemsKey, updatedMissions);
        }

        showToast(t("detail.missions.toast.success.delete"), "success");
      }
    } catch (error) {
      console.error("❌ Error deleting mission:", error);
      // Show user-friendly error message instead of 500
      if (error.response && error.response.status === 500) {
        showToast(
          t("detail.missions.toast.error.deleteConflict", {
            defaultValue: "Cannot delete mission due to data integrity constraints. Please contact support."
          }),
          "error"
        );
      } else {
        showToast(t("detail.missions.toast.error.delete", { defaultValue: "Failed to delete mission" }), "error");
      }
    }
  };

  const handleModalOpen = () => {
    if (!canAddMission) return;

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

      const validation = canPerformAction("financialEntry", null, "add", {
        data: newEntry,
        newData: newEntry,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions: allMissions, financialEntries }
      });
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
      showToast(t("detail.missions.toast.success.financialAdd"), "success");

      // ✅ Navigate to the new financial entry's detail view
      if (savedEntry && savedEntry.id) {
        const detailRoute = resolveDetailRoute('financialEntry', savedEntry.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }
    } catch (error) {
      console.error("Error adding financial entry:", error);
      showToast(t("detail.missions.toast.error.financialAdd"), "error");
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
      showToast(t("detail.documents.toast.success.upload", { count: newDocuments.length }), "success");
    } catch (error) {
      console.error("Error uploading documents:", error);
      showToast(t("detail.documents.toast.error.uploadError"), "error");
    } finally {
      setUploadingDocument(false);
      setSelectedMissionForDoc(null);
    }
  };

  const handleDeleteDocument = async (missionId, documentId) => {
    if (await confirm({
      title: t("dialog.detail.documents.deleteSingle.title"),
      message: t("dialog.detail.documents.deleteSingle.message"),
      confirmText: t("dialog.detail.documents.deleteSingle.confirm"),
      cancelText: t("dialog.detail.documents.deleteSingle.cancel"),
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
    showToast(t("detail.missions.toast.success.financialUpdate"), "success");
  };

  const handleCancelEditFinancialEntry = () => {
    setEditingEntryId(null);
    setEditingEntryData(null);
  };

  const handleDeleteFinancialEntry = async (missionId, entryId) => {
    if (await confirm({
      title: t("dialog.detail.financial.delete.title"),
      message: t("dialog.detail.financial.delete.message"),
      confirmText: t("dialog.detail.financial.delete.confirm"),
      cancelText: t("dialog.detail.financial.delete.cancel"),
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

      showToast(t("detail.missions.toast.success.financialDelete"), "success");
    }
  };

  // Status counts
  const statusCounts = useMemo(() => {
    return {
      all: missions.length,
      Scheduled: missions.filter((m) => m.status === "Scheduled").length,
      "In Progress": missions.filter((m) => m.status === "In Progress").length,
      Completed: missions.filter((m) => m.status === "Completed").length,
      Cancelled: missions.filter((m) => m.status === "Cancelled").length,
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
              {tabConfig.emptyMessage || t("empty", { ns: "missions" })}
            </p>

            {allowAdd && !hasParentEntities && (
              <div className="mt-4 text-amber-600 dark:text-amber-400 font-medium flex flex-col items-center gap-2 text-center">
                <i className="fas fa-info-circle text-2xl"></i>
                <span>{t("blockers.missingParent", { ns: "common" })}</span>
              </div>
            )}

            {canAddMission && (
              <button
                onClick={handleModalOpen}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                {t("add", { ns: "missions", entityName: tabConfig.entityName || t("addDefault", { ns: "missions" }) })}
              </button>
            )}
          </div>
        </ContentSection>

        {(tabConfig.formFields || tabConfig.getFormFields) && (
          <FormModal
            isOpen={isAddModalOpen}
            onClose={handleModalClose}
            onSubmit={handleAddMission}
            title={editingMissionId ? t("form.title.edit", { ns: "missions", defaultValue: "Edit Mission" }) : t("form.title.add", { ns: "missions", defaultValue: "Add Mission" })}
            subtitle={tabConfig.addSubtitle || t("form.subtitle.add", { ns: "missions", defaultValue: "Create a new mission" })}
            fields={processedFormFields}
            isLoading={isLoading}
            formData={formData}
            onFormDataChange={setFormData}
            submitText={editingMissionId ? t("form.submit.edit", { ns: "missions", defaultValue: "Save" }) : t("form.submit.add", { ns: "missions", defaultValue: "Add" })}
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
          allowAdd && (
            hasParentEntities ? (
              <button
                onClick={handleModalOpen}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                {t("add", { ns: "missions", entityName: tabConfig.entityName || t("addDefault", { ns: "missions" }) })}
              </button>
            ) : (
              <div className="text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2">
                <i className="fas fa-info-circle"></i>
                <span>{t("blockers.missingParent", { ns: "common" })}</span>
              </div>
            )
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
              placeholder={t("search.placeholder", { ns: "missions" })}
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
              {t("filter.all", { ns: "missions", count: statusCounts.all })}
            </button>
            <button
              onClick={() => setFilterStatus("Scheduled")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "Scheduled"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              {t("filter.scheduled", { ns: "missions", count: statusCounts.Scheduled })}
            </button>
            <button
              onClick={() => setFilterStatus("In Progress")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "In Progress"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              {t("filter.inProgress", { ns: "missions", count: statusCounts["In Progress"] })}
            </button>
            <button
              onClick={() => setFilterStatus("Completed")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "Completed"
                ? "bg-green-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              {t("filter.completed", { ns: "missions", count: statusCounts.Completed })}
            </button>
            <button
              onClick={() => setFilterStatus("Cancelled")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filterStatus === "Cancelled"
                ? "bg-red-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
            >
              {t("filter.cancelled", { ns: "missions", count: statusCounts.Cancelled })}
            </button>
          </div>
        </div>

        {/* Mission List */}
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {filteredMissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              {t("search.empty", { ns: "missions" })}
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
                      {mission.priority === "High" && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          <i className="fas fa-exclamation-circle mr-1"></i>
                          {t("priority.high", { ns: "missions" })}
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
                        {t("labels.assigned", { ns: "missions" })} {formatDate(mission.assignDate)}
                      </span>
                      {mission.dueDate && (
                        <span>
                          <i className="fas fa-clock mr-1"></i>
                          {t("labels.dueDate", { ns: "missions" })} {formatDate(mission.dueDate)}
                        </span>
                      )}
                      {mission.documents && mission.documents.length > 0 && (
                        <span className="text-blue-600 dark:text-blue-400">
                          <i className="fas fa-paperclip mr-1"></i>
                          {t("labels.documents", { ns: "missions", count: mission.documents.length })}
                        </span>
                      )}
                      {mission.financialEntries && mission.financialEntries.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          <i className="fas fa-coins mr-1"></i>
                          {t("labels.fees", { ns: "missions", amount: formatCurrency(mission.financialEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)) })}
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
                        title={t("actions.delete", { ns: "common" })}
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
          title={editingMissionId ? t("form.title.edit", { ns: "missions" }) : t("form.title.add", { ns: "missions" })}
          subtitle={
            tabConfig.addSubtitle ||
            t("form.subtitle.addFor", { ns: "missions", entity: config.getTitle(data) })
          }
          fields={processedFormFields}
          isLoading={isLoading}
          formData={formData}
          onFormDataChange={setFormData}
          submitText={editingMissionId ? t("form.submit.edit", { ns: "missions" }) : t("form.submit.add", { ns: "missions" })}
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
          title={t("financial.addTitle", { ns: "missions" })}
          subtitle={`Mission: ${selectedMissionForFinance.missionNumber} - ${selectedMissionForFinance.title}`}
          fields={(() => {
            // Get base fields and populate with actual data
            const baseFields = populateRelationshipOptions(getFinancialEntryFormFields(), {
              clients,
              dossiers,
              cases,
              missions: allMissions
            });

            // Auto-populate fields based on mission
            // The mission object already has dossierId and caseId from the database
            let clientId = null;
            let dossierId = selectedMissionForFinance.dossierId || null;
            let caseId = selectedMissionForFinance.caseId || null;

            // Get client from dossier or case
            if (dossierId) {
              const dossier = dossiers.find(d => d.id === dossierId);
              if (dossier) {
                clientId = dossier.clientId;
              }
            } else if (caseId) {
              const caseItem = cases.find(c => c.id === caseId);
              if (caseItem) {
                // Get dossier from case to find client
                const dossier = dossiers.find(d => d.id === caseItem.dossierId);
                if (dossier) {
                  clientId = dossier.clientId;
                }
              }
            }

            return baseFields.map(field => {
              if (field.name === "scope") {
                return { ...field, type: "readonly", defaultValue: "client", displayValue: t("scope.client", { ns: "common" }) };
              }
              if (field.name === "type") {
                return { ...field, type: "readonly", defaultValue: "expense", displayValue: t("financial.expenseType", { ns: "missions" }) };
              }
              if (field.name === "category") {
                return { ...field, type: "readonly", defaultValue: "frais_huissier", displayValue: t("category.bailiffFees", { ns: "common" }) };
              }
              if (field.name === "clientId") {
                const client = clients.find(c => c.id === clientId);
                return {
                  ...field,
                  type: "readonly",
                  defaultValue: clientId || "",
                  displayValue: client ? client.name : t("fallback.unknownClient", { ns: "missions" })
                };
              }
              if (field.name === "dossierId") {
                const doss = dossiers.find(d => d.id === dossierId);
                return {
                  ...field,
                  type: "readonly",
                  defaultValue: dossierId || "",
                  displayValue: doss ? `${doss.caseNumber} - ${doss.title}` : t("fallback.unknownDossier", { ns: "missions" })
                };
              }
              if (field.name === "caseId") {
                const caseItem = cases.find(c => c.id === caseId);
                return {
                  ...field,
                  type: "readonly",
                  defaultValue: caseId || "",
                  displayValue: caseItem ? `${caseItem.caseNumber} - ${caseItem.title}` : t("fallback.noLawsuit", { ns: "missions" })
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
              if (field.name === "title") {
                return {
                  ...field,
                  defaultValue: `Bailiff fees - ${selectedMissionForFinance.missionNumber}`
                };
              }
              if (field.name === "description") {
                return {
                  ...field,
                  defaultValue: `Mission: ${selectedMissionForFinance.title}`
                };
              }
              return field;
            });
          })()}
          isLoading={false}
          entityType="financialEntry"
          entities={{ clients, dossiers, cases, missions: allMissions }}
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
            try {
              // ✅ Actually call the delete API
              console.log("🗑️ Cascade deleting mission ID:", missionId);
              await deleteMission(missionId);

              // Update local state
              const updatedMissions = missions.filter((m) => m.id !== missionId);
              setMissions(updatedMissions);
              if (onItemsChange) {
                onItemsChange(tabConfig.itemsKey, updatedMissions);
              }
              showToast(t("detail.missions.toast.success.delete"), "success");
            } catch (error) {
              console.error("❌ Error cascade deleting mission:", error);
              showToast(t("detail.missions.toast.error.delete", { defaultValue: "Failed to delete mission" }), "error");
            }
          } else {
            await performMissionSave(pendingFormData);
          }
          setPendingFormData(null);
        }}
        actionName="modify mission attachments"
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
