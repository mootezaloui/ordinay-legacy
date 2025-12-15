import { useState, useMemo } from "react";
import ContentSection from "../../layout/ContentSection";
import FormModal from "../../FormModal/FormModal";
import { getStatusColor } from "../../../utils/mockData";

/**
 * MissionsTab - Scalable mission list with document management
 * Designed for huissier detail view to handle large numbers of missions
 */
export default function MissionsTab({ data, config, tabConfig, onItemsChange }) {
  const [missions, setMissions] = useState(data[tabConfig.itemsKey] || []);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({});
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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
      // Call getFormFields with current data
      fields = tabConfig.getFormFields(data);
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
    setIsLoading(true);

    try {
      // Ensure missionNumber is included even if it was disabled in the form
      const missionNumberValue = submittedFormData.missionNumber || formData.missionNumber;
      
      const newMission = {
        id: Date.now(),
        ...submittedFormData,
        officerId: data.id,
        missionNumber: missionNumberValue, // Explicitly set mission number
        documents: [],
        createdDate: new Date().toISOString().split("T")[0],
      };

      const updatedMissions = [newMission, ...missions];
      setMissions(updatedMissions);

      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedMissions);
      }

      console.log("Adding new mission:", newMission);
      await new Promise((resolve) => setTimeout(resolve, 500));

      setIsAddModalOpen(false);
      setFormData({});
      alert("Mission ajoutée avec succès!");
    } catch (error) {
      console.error("Error adding mission:", error);
      alert("Erreur lors de l'ajout");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMission = (missionId) => {
    if (
      window.confirm("Êtes-vous sûr de vouloir supprimer cette mission ?")
    ) {
      const updatedMissions = missions.filter((m) => m.id !== missionId);
      setMissions(updatedMissions);

      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedMissions);
      }

      console.log("Deleting mission:", missionId);
    }
  };

  const handleModalOpen = () => {
    const defaults = {};
    
    // Get fields from either getFormFields function or formFields array
    let fields = [];
    if (typeof tabConfig.getFormFields === 'function') {
      fields = tabConfig.getFormFields(data);
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
    setIsAddModalOpen(false);
  };

  const handleMissionClick = (mission) => {
    setSelectedMission(mission);
  };

  const handleCloseMissionDetail = () => {
    setSelectedMission(null);
  };

  const handleAddDocument = (missionId) => {
    // TODO: Implement document upload
    console.log("Add document to mission:", missionId);
    alert("Fonctionnalité d'ajout de document à venir");
  };

  const handleDeleteDocument = (missionId, documentId) => {
    if (
      window.confirm("Êtes-vous sûr de vouloir supprimer ce document ?")
    ) {
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

      // Update selected mission if it's the one being modified
      if (selectedMission?.id === missionId) {
        const updatedMission = updatedMissions.find((m) => m.id === missionId);
        setSelectedMission(updatedMission);
      }

      console.log("Deleting document:", documentId);
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
                Ajouter une mission
              </button>
            )}
          </div>
        </ContentSection>

        {(tabConfig.formFields || tabConfig.getFormFields) && (
          <FormModal
            isOpen={isAddModalOpen}
            onClose={handleModalClose}
            onSubmit={handleAddMission}
            title="Ajouter une mission"
            subtitle={tabConfig.addSubtitle}
            fields={processedFormFields}
            isLoading={isLoading}
            formData={formData}
            onFormDataChange={setFormData}
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
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                filterStatus === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              Toutes ({statusCounts.all})
            </button>
            <button
              onClick={() => setFilterStatus("Programmée")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                filterStatus === "Programmée"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              Programmées ({statusCounts.Programmée})
            </button>
            <button
              onClick={() => setFilterStatus("En cours")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                filterStatus === "En cours"
                  ? "bg-amber-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              En cours ({statusCounts["En cours"]})
            </button>
            <button
              onClick={() => setFilterStatus("Terminée")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                filterStatus === "Terminée"
                  ? "bg-green-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              Terminées ({statusCounts.Terminée})
            </button>
            <button
              onClick={() => setFilterStatus("Annulée")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                filterStatus === "Annulée"
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
                onClick={() => handleMissionClick(mission)}
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
          title="Ajouter une mission"
          subtitle={
            tabConfig.addSubtitle ||
            `Créer une nouvelle mission pour ${config.getTitle(data)}`
          }
          fields={processedFormFields}
          isLoading={isLoading}
          formData={formData}
          onFormDataChange={setFormData}
        />
      )}

      {/* Mission Detail Modal */}
      {selectedMission && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {selectedMission.missionNumber}
                  </h2>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                      selectedMission.status
                    )}`}
                  >
                    {selectedMission.status}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  {selectedMission.title}
                </p>
              </div>
              <button
                onClick={handleCloseMissionDetail}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <i className="fas fa-times text-slate-600 dark:text-slate-400"></i>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Mission Details */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Détails de la mission
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Type de mission
                    </label>
                    <p className="text-slate-900 dark:text-white font-medium">
                      {selectedMission.missionType}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Référence
                    </label>
                    <p className="text-slate-900 dark:text-white font-medium">
                      {selectedMission.entityReference}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Date d'assignation
                    </label>
                    <p className="text-slate-900 dark:text-white font-medium">
                      {selectedMission.assignDate}
                    </p>
                  </div>
                  {selectedMission.dueDate && (
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Date d'échéance
                      </label>
                      <p className="text-slate-900 dark:text-white font-medium">
                        {selectedMission.dueDate}
                      </p>
                    </div>
                  )}
                  {selectedMission.completionDate && (
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Date de complétion
                      </label>
                      <p className="text-slate-900 dark:text-white font-medium">
                        {selectedMission.completionDate}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">
                      Priorité
                    </label>
                    <p className="text-slate-900 dark:text-white font-medium">
                      {selectedMission.priority}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedMission.description && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    Description
                  </h3>
                  <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg">
                    {selectedMission.description}
                  </p>
                </div>
              )}

              {/* Result */}
              {selectedMission.result && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    Résultat / Réponse de l'huissier
                  </h3>
                  <p className="text-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    {selectedMission.result}
                  </p>
                </div>
              )}

              {/* Notes */}
              {selectedMission.notes && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    Notes internes
                  </h3>
                  <p className="text-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                    {selectedMission.notes}
                  </p>
                </div>
              )}

              {/* Documents */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Documents ({selectedMission.documents?.length || 0})
                  </h3>
                  <button
                    onClick={() => handleAddDocument(selectedMission.id)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
                  >
                    <i className="fas fa-plus"></i>
                    Ajouter un document
                  </button>
                </div>

                {selectedMission.documents &&
                selectedMission.documents.length > 0 ? (
                  <div className="space-y-2">
                    {selectedMission.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 group hover:bg-slate-100 dark:hover:bg-slate-900"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <i className="fas fa-file-pdf text-blue-600 dark:text-blue-400"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">
                              {doc.name}
                            </p>
                            <div className="flex gap-3 text-sm text-slate-500 dark:text-slate-400">
                              <span>{doc.size}</span>
                              <span>•</span>
                              <span>{doc.uploadDate}</span>
                              {doc.category && (
                                <>
                                  <span>•</span>
                                  <span className="text-blue-600 dark:text-blue-400">
                                    {doc.category}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => console.log("Download", doc.id)}
                            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Télécharger"
                          >
                            <i className="fas fa-download text-blue-600 dark:text-blue-400"></i>
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteDocument(
                                selectedMission.id,
                                doc.id
                              )
                            }
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Supprimer"
                          >
                            <i className="fas fa-trash text-red-600 dark:text-red-400"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <i className="fas fa-file-alt text-4xl text-slate-400 dark:text-slate-600 mb-3"></i>
                    <p className="text-slate-600 dark:text-slate-400">
                      Aucun document pour cette mission
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
