import { useState } from "react";
import FormModal from "../FormModal/FormModal";
import { useToast } from "./Toast";
import { 
  clientFormFields, 
  dossierFormFields, 
  taskFormFields, 
  sessionFormFields,
  getFormTitle 
} from "../FormModal/formConfigs";
import { mockClients, mockDossiers } from "../../utils/mockData";

/**
 * QuickActions Component (FINAL VERSION)
 * Provides quick access buttons with inline FormModal
 * Features:
 * - Opens FormModal directly (no navigation)
 * - Toast notifications for success/error
 * - Loading states
 * - Data refresh callback support
 * 
 * Usage:
 * <QuickActions onDataChange={(type, data) => console.log('New', type, data)} />
 */
export default function QuickActions({ onDataChange }) {
  const [activeModal, setActiveModal] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast, ToastContainer } = useToast();

  const handleSubmit = async (formData, entityType) => {
    setIsLoading(true);
    
    try {
      // Simulate API call (replace with actual API call)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Create the new entity with proper structure
      const newEntity = {
        ...formData,
        id: Date.now(),
        // Add computed fields based on entity type
        ...(entityType === 'client' && {
          joinDate: new Date().toISOString().split('T')[0],
          status: formData.status || 'Active',
        }),
        ...(entityType === 'dossier' && {
          openDate: formData.openDate || new Date().toISOString().split('T')[0],
          client: mockClients.find(c => c.id === parseInt(formData.clientId))?.name || 'N/A',
        }),
        ...(entityType === 'task' && {
          dossier: mockDossiers.find(d => d.id === parseInt(formData.dossierId))?.caseNumber || 'N/A',
        }),
      };
      
      console.log(`✅ Created ${entityType}:`, newEntity);
      
      // Optional: Call callback to update parent state
      if (onDataChange) {
        onDataChange(entityType, newEntity);
      }
      
      // Show success toast
      const messages = {
        client: `Client "${formData.name}" créé avec succès!`,
        dossier: `Dossier "${formData.caseNumber}" créé avec succès!`,
        task: `Tâche "${formData.title}" créée avec succès!`,
        session: `Séance "${formData.title}" programmée avec succès!`,
      };
      
      showToast(messages[entityType] || "Créé avec succès!", "success");
      
      // Close modal
      setActiveModal(null);
      
      // Optional: Reload page to refresh all data
      // setTimeout(() => window.location.reload(), 1500);
      
    } catch (error) {
      console.error(`Error creating ${entityType}:`, error);
      showToast(`Erreur lors de la création: ${error.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Prepare form fields with dynamic options
  const getFormFields = (type) => {
    switch (type) {
      case "dossier":
        return dossierFormFields.map(field => {
          if (field.name === "clientId") {
            return {
              ...field,
              options: mockClients.map(client => ({
                value: client.id,
                label: client.name
              }))
            };
          }
          return field;
        });
      
      case "task":
        return taskFormFields.map(field => {
          if (field.name === "dossierId") {
            return {
              ...field,
              options: mockDossiers.map(dossier => ({
                value: dossier.id,
                label: `${dossier.caseNumber} - ${dossier.title}`
              }))
            };
          }
          return field;
        });
      
      case "client":
        return clientFormFields;
      
      case "session":
        return sessionFormFields;
      
      default:
        return [];
    }
  };

  const getSubtitle = (type) => {
    const subtitles = {
      client: "Ajouter un nouveau client à votre base",
      dossier: "Créer un nouveau dossier juridique",
      task: "Créer une nouvelle tâche à effectuer",
      session: "Programmer une nouvelle séance",
    };
    return subtitles[type] || "";
  };

  const actions = [
    {
      id: 1,
      type: "client",
      label: "Nouveau Client",
      icon: "fas fa-user-plus",
      color: "blue",
    },
    {
      id: 2,
      type: "dossier",
      label: "Nouveau Dossier",
      icon: "fas fa-folder-plus",
      color: "purple",
    },
    {
      id: 3,
      type: "task",
      label: "Nouvelle Tâche",
      icon: "fas fa-plus-circle",
      color: "amber",
    },
    {
      id: 4,
      type: "session",
      label: "Programmer Session",
      icon: "fas fa-calendar-plus",
      color: "green",
    },
  ];

  const colors = {
    blue: "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600",
    purple: "bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600",
    amber: "bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600",
    green: "bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600",
  };

  return (
    <>
      {/* Toast Container for notifications */}
      <ToastContainer />
      
      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => setActiveModal(action.type)}
            className={`p-4 ${colors[action.color]} text-white rounded-xl transition-all duration-200 hover:shadow-lg hover:scale-105 group`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <i className={`${action.icon} text-xl`}></i>
              </div>
              <span className="text-sm font-medium text-center">
                {action.label}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Modals for each action */}
      {actions.map((action) => (
        <FormModal
          key={`modal-${action.type}`}
          isOpen={activeModal === action.type}
          onClose={() => setActiveModal(null)}
          onSubmit={(formData) => handleSubmit(formData, action.type)}
          title={getFormTitle(action.type, false)}
          subtitle={getSubtitle(action.type)}
          fields={getFormFields(action.type)}
          isLoading={isLoading}
        />
      ))}
    </>
  );
}