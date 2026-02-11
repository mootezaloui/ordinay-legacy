import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { useTutorialSafe } from "../../contexts/TutorialContext";
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
 * <QuickActions onDataChange={(type, data) => {}} />
 */
export default function QuickActions({ onDataChange }) {
  const [activeModal, setActiveModal] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation(["common", "clients", "dossiers", "lawsuits", "tasks", "sessions"]);
  const tClients = (key) => t(key, { ns: "clients" });
  const tDossiers = (key) => t(key, { ns: "dossiers" });
  const tTasks = (key) => t(key, { ns: "tasks" });
  const tSessions = (key) => t(key, { ns: "sessions" });
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const tutorial = useTutorialSafe(); // Safe hook that returns null if not in provider
  const {
    clients,
    dossiers,
    lawsuits,
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
        label: `${dossier.lawsuitNumber} - ${dossier.title}`,
      })),
    [dossiers]
  );
  const lawsuitOptions = useMemo(
    () =>
      lawsuits.map((lawsuitItem) => ({
        value: lawsuitItem.id,
        label: `${lawsuitItem.lawsuitNumber} - ${lawsuitItem.title}`,
      })),
    [lawsuits]
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
          if (creation?.ok === false) {
            return;
          }
          const createdEntity = creation?.created || creation;
          const createdId = createdEntity?.id;
          const createdName = createdEntity?.name || formData.name;
          if (!createdId) throw new Error("client ID is missing");
          newEntity = { ...createdEntity };
          logEntityCreation("client", createdId, createdName);
          // Notify tutorial
          if (tutorial?.setCreatedClient) tutorial.setCreatedClient(createdId);
          break;
        }
        case "dossier": {
          const creation = await addDossier(formData);
          if (creation?.ok === false) {
            return;
          }
          const createdEntity = creation?.created || creation;
          const createdId = createdEntity?.id;
          if (!createdId) throw new Error("dossier ID is missing");
          newEntity = { ...createdEntity };
          logEntityCreation("dossier", createdId, createdEntity?.lawsuitNumber);
          // Notify tutorial
          if (tutorial?.setCreatedDossier) tutorial.setCreatedDossier(createdId);
          break;
        }
        case "task": {
          const parentType = formData.parentType || (formData.lawsuitId ? "lawsuit" : "dossier");
          const payload = {
            ...formData,
            parentType,
          };
          const creation = await addTask(payload);
          if (creation?.ok === false) {
            return;
          }
          const createdEntity = creation?.created || creation;
          newEntity = { ...createdEntity };
          logEntityCreation("task", newEntity.id, newEntity.title);
          // Notify tutorial
          if (tutorial?.setCreatedTask) tutorial.setCreatedTask(newEntity.id);
          break;
        }
        case "session": {
          const creation = await addSession(formData);
          if (creation?.ok === false) {
            return;
          }
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
        client: t("dashboard.quickActions.toasts.clientSuccess", { name: formData.name, ns: "common" }),
        dossier: t("dashboard.quickActions.toasts.dossierSuccess", { reference: formData.lawsuitNumber || formData.title, ns: "common" }),
        task: t("dashboard.quickActions.toasts.taskSuccess", { title: formData.title, ns: "common" }),
        session: t("dashboard.quickActions.toasts.sessionSuccess", { title: formData.title, ns: "common" }),
      };

      notify.success({
        context: entityType,
        title: getFormTitle(entityType, false),
        message: messages[entityType] || t("dashboard.quickActions.toasts.genericSuccess", { ns: "common" }),
      });

      navigateToDetail(entityType, newEntity?.id);

      setActiveModal(null);
    } catch (error) {
      console.error(`Error creating ${entityType}:`, error);
      notify.error({
        context: entityType,
        title: t("dashboard.quickActions.toasts.errorTitle", { ns: "common" }),
        message: t("dashboard.quickActions.toasts.errorMessage", { ns: "common", message: error.message }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Prepare form fields with dynamic options
  const getFormFields = (type) => {
    switch (type) {
      case "dossier":
        return dossierFormFields(tDossiers).map((field) => {
          if (field.name === "clientId") {
            return {
              ...field,
              options: clientOptions,
            };
          }
          return field;
        });

      case "task":
        return taskFormFields(tTasks).map((field) => {
          if (field.name === "dossierId") {
            return {
              ...field,
              options: [
                { value: "", label: t("dashboard.quickActions.placeholders.dossier", { ns: "common" }) },
                ...dossierOptions,
              ],
            };
          }
          if (field.name === "lawsuitId") {
            return {
              ...field,
              options: [
                { value: "", label: t("dashboard.quickActions.placeholders.lawsuit", { ns: "common" }) },
                ...lawsuitOptions,
              ],
            };
          }
          return field;
        });

      case "client":
        return clientFormFields(tClients);

      case "session":
        return sessionFormFields(tSessions).map((field) => {
          if (field.name === "lawsuitId") {
            return {
              ...field,
              options: [
                { value: "", label: t("dashboard.quickActions.placeholders.lawsuit", { ns: "common" }) },
                ...lawsuitOptions,
              ],
            };
          }
          if (field.name === "dossierId") {
            return {
              ...field,
              options: [
                { value: "", label: t("dashboard.quickActions.placeholders.dossier", { ns: "common" }) },
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
    return t(`dashboard.quickActions.subtitles.${type}`, { ns: "common" }) || "";
  };

  const actions = [
    {
      id: 1,
      type: "client",
      label: t("dashboard.quickActions.newClient", { ns: "common" }),
      icon: "fas fa-user-plus",
      color: "blue",
    },
    {
      id: 2,
      type: "dossier",
      label: t("dashboard.quickActions.newDossier", { ns: "common" }),
      icon: "fas fa-folder-plus",
      color: "purple",
    },
    {
      id: 3,
      type: "task",
      label: t("dashboard.quickActions.newTask", { ns: "common" }),
      icon: "fas fa-plus-circle",
      color: "amber",
    },
    {
      id: 4,
      type: "session",
      label: t("dashboard.quickActions.newSession", { ns: "common" }),
      icon: "fas fa-calendar-plus",
      color: "green",
    },
  ];

  const colors = {
    blue: {
      bg: "from-blue-500/15 via-blue-500/5 to-transparent dark:from-blue-500/25 dark:via-blue-500/10",
      icon: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
      border: "border-blue-300 dark:border-blue-500/30",
    },
    purple: {
      bg: "from-purple-500/15 via-purple-500/5 to-transparent dark:from-purple-500/25 dark:via-purple-500/10",
      icon: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
      border: "border-purple-300 dark:border-purple-500/30",
    },
    amber: {
      bg: "from-amber-500/15 via-amber-500/5 to-transparent dark:from-amber-500/25 dark:via-amber-500/10",
      icon: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      border: "border-amber-300 dark:border-amber-500/30",
    },
    green: {
      bg: "from-emerald-500/15 via-emerald-500/5 to-transparent dark:from-emerald-500/25 dark:via-emerald-500/10",
      icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      border: "border-emerald-300 dark:border-emerald-500/30",
    },
  };

  return (
    <>
      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => setActiveModal(action.type)}
            className={`p-4 rounded-2xl border ${colors[action.color].border} bg-slate-50 dark:bg-slate-900/70 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group text-slate-900 dark:text-white`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className={`w-12 h-12 rounded-2xl ${colors[action.color].icon} flex items-center justify-center transition-colors`}>
                <i className={`${action.icon} text-lg`}></i>
              </div>
              <span className="text-sm font-semibold text-center">
                {action.label}
              </span>
              <span className={`h-1 w-12 rounded-full bg-gradient-to-r ${colors[action.color].bg}`}></span>
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





