import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormModal from "../FormModal/FormModal";
import { useNotifications } from "../../contexts/NotificationContext";
import {
  clientFormFields,
  dossierFormFields,
  taskFormFields,
  sessionFormFields,
  getFormTitle,
} from "../FormModal/formConfigs";
import { useData } from "../../contexts/DataContext";
import { resolveDetailRoute } from "../../utils/routeResolver";
import { logEntityCreation } from "../../services/historyService";

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
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const {
    clients,
    dossiers,
    cases,
    addClient,
    addDossier,
    addTask,
    addSession,
  } = useData();

  // Keep select options in sync with live data
  const clientOptions = useMemo(
    () => clients.map((client) => ({ value: client.id, label: client.name })),
    [clients]
  );
  const dossierOptions = useMemo(
    () =>
      dossiers.map((dossier) => ({
        value: dossier.id,
        label: `${dossier.caseNumber} - ${dossier.title}`,
      })),
    [dossiers]
  );
  const caseOptions = useMemo(
    () =>
      cases.map((caseItem) => ({
        value: caseItem.id,
        label: `${caseItem.caseNumber} - ${caseItem.title}`,
      })),
    [cases]
  );

  const navigateToDetail = (entityType, entityId) => {
    const detailRoute = resolveDetailRoute(entityType, entityId);
    if (detailRoute) {
      setTimeout(() => navigate(detailRoute), 150);
    }
  };

  const handleSubmit = async (formData, entityType) => {
    setIsLoading(true);

    try {
      // Simulate API call (replace with actual API call)
      await new Promise((resolve) => setTimeout(resolve, 800));

      let newEntity = null;

      switch (entityType) {
        case "client": {
          const payload = {
            ...formData,
            joinDate: formData.joinDate || new Date().toISOString().split("T")[0],
          };
          const creation = await addClient(payload);
          const createdEntity = creation?.created || creation;
          const createdId = createdEntity?.id;
          const createdName = createdEntity?.name || formData.name;
          if (!createdId) throw new Error("client ID is missing");
          newEntity = { ...createdEntity };
          logEntityCreation("client", createdId, createdName);
          break;
        }
        case "dossier": {
          const creation = await addDossier(formData);
          const createdEntity = creation?.created || creation;
          const createdId = createdEntity?.id;
          if (!createdId) throw new Error("dossier ID is missing");
          newEntity = { ...createdEntity };
          logEntityCreation("dossier", createdId, createdEntity?.caseNumber);
          break;
        }
        case "task": {
          const parentType = formData.parentType || (formData.caseId ? "case" : "dossier");
          const payload = {
            ...formData,
            parentType,
          };
          const creation = await addTask(payload);
          const createdEntity = creation?.created || creation;
          newEntity = { ...createdEntity };
          logEntityCreation("task", newEntity.id, newEntity.title);
          break;
        }
        case "session": {
          const creation = await addSession(formData);
          const createdEntity = creation?.created || creation;
          newEntity = { ...createdEntity };
          logEntityCreation("session", newEntity.id, newEntity.title);
          break;
        }
        default:
          throw new Error(`Unsupported entity type: ${entityType}`);
      }

      if (newEntity && onDataChange) {
        onDataChange(entityType, newEntity);
      }

      const messages = {
        client: `Client "${formData.name}" created successfully !`,
        dossier: `Dossier "${formData.caseNumber || formData.title}" created successfully !`,
        task: `Task "${formData.title}" created successfully !`,
        session: `Session "${formData.title}" scheduled successfully !`,
      };

      notify.success({
        context: entityType,
        title: getFormTitle(entityType, false),
        message: messages[entityType] || "created susccessfully !",
      });

      navigateToDetail(entityType, newEntity?.id);

      setActiveModal(null);
    } catch (error) {
      console.error(`Error creating ${entityType}:`, error);
      notify.error({
        context: entityType,
        title: "Creation Failed",
        message: `Error during creation: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Prepare form fields with dynamic options
  const getFormFields = (type) => {
    switch (type) {
      case "dossier":
        return dossierFormFields.map((field) => {
          if (field.name === "clientId") {
            return {
              ...field,
              options: clientOptions,
            };
          }
          return field;
        });

      case "task":
        return taskFormFields.map((field) => {
          if (field.name === "dossierId") {
            return {
              ...field,
              options: [
                { value: "", label: "Select a dossier..." },
                ...dossierOptions,
              ],
            };
          }
          if (field.name === "caseId") {
            return {
              ...field,
              options: [
                { value: "", label: "Select a case..." },
                ...caseOptions,
              ],
            };
          }
          return field;
        });

      case "client":
        return clientFormFields;

      case "session":
        return sessionFormFields.map((field) => {
          if (field.name === "caseId") {
            return {
              ...field,
              options: [
                { value: "", label: "Select a case..." },
                ...caseOptions,
              ],
            };
          }
          if (field.name === "dossierId") {
            return {
              ...field,
              options: [
                { value: "", label: "Select a dossier..." },
                ...dossierOptions,
              ],
            };
          }
          return field;
        });

      default:
        return [];
    }
  };

  const getSubtitle = (type) => {
    const subtitles = {
      client: "Add a new client to your database",
      dossier: "Create a new legal dossier",
      task: "Create a new task to be performed",
      session: "Schedule a new session or appointment",
    };
    return subtitles[type] || "";
  };

  const actions = [
    {
      id: 1,
      type: "client",
      label: "New client",
      icon: "fas fa-user-plus",
      color: "blue",
    },
    {
      id: 2,
      type: "dossier",
      label: "New dossier",
      icon: "fas fa-folder-plus",
      color: "purple",
    },
    {
      id: 3,
      type: "task",
      label: "New task",
      icon: "fas fa-plus-circle",
      color: "amber",
    },
    {
      id: 4,
      type: "session",
      label: "New session",
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
          entityType={action.type}
        />
      ))}
    </>
  );
}
