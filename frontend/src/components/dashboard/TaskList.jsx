import { useNavigate } from "react-router-dom";
import { useSettings } from "../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { translateAssignee, translatePriority, translateStatus } from "../../utils/entityTranslations";

/**
 * TaskList Component
 * Displays urgent/upcoming tasks with priorities
 * Status changes happen on full task detail page for intentional workflow
 */
export default function TaskList({ tasks, title = "Urgent Tasks", maxItems = 5 }) {
  const navigate = useNavigate();
  const { formatDate } = useSettings();
  const { t } = useTranslation(["common", "tasks"]);

  const getPriorityColor = (priority) => {
    const colors = {
      High: { bg: "bg-red-100 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400", icon: "fas fa-arrow-up" },
      Medium: { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", icon: "fas fa-minus" },
      Low: { bg: "bg-blue-100 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-400", icon: "fas fa-arrow-down" },
    };
    return colors[priority] || colors.Low;
  };

  const getStatusColor = (status) => {
    const colors = {
      "In Progress": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      "Pending": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      "Completed": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      "Not Started": "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
      "Scheduled": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    };
    return colors[status] || colors["Not Started"];
  };

  const displayedTasks = tasks.slice(0, maxItems);

  return (
    <div className="space-y-3">
      {displayedTasks.map((task) => {
        const priorityColors = getPriorityColor(task.priority);
        const isOverdue = new Date(task.dueDate) < new Date();
        const translatedStatus = translateStatus(task.status, "tasks", t);
        const translatedPriority = translatePriority(task.priority, t, "tasks");
        const translatedAssignee = translateAssignee(task.assignedTo, t, "tasks");
        const hasLawsuit = Boolean(task.lawsuit);
        const hasDossier = Boolean(task.dossier);
        const isLawsuitTask = task.parentType === "lawsuit" || (hasLawsuit && !hasDossier);
        const parentLabel = isLawsuitTask ? task.lawsuit : task.dossier;
        const parentIcon = isLawsuitTask ? "fas fa-gavel" : "fas fa-folder-open";
        const parentColor = isLawsuitTask
          ? "text-purple-600 dark:text-purple-400"
          : "text-blue-600 dark:text-blue-400";

        return (
          <div
            key={task.id}
            onClick={() => navigate(`/tasks/${task.id}`)}
            className="p-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-start gap-3">
              {/* Task Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${task.status === "Completed" ? "line-through text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"
                  }`}>
                  {task.title}
                </p>

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {/* Parent reference (dossier or lawsuit) */}
                  {parentLabel && (
                    <span className={`inline-flex items-center gap-1 text-xs font-mono ${parentColor}`}>
                      <i className={`${parentIcon} text-[10px]`}></i>
                      {parentLabel}
                    </span>
                  )}

                  {/* Due Date */}
                  <div className={`flex items-center gap-1 text-xs ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500 dark:text-slate-400"
                    }`}>
                    <i className="fas fa-clock text-xs"></i>
                    <span>{formatDate(task.dueDate)}</span>
                    {isOverdue && <i className="fas fa-exclamation-circle ml-1"></i>}
                  </div>

                  {/* Assigned To */}
                  {task.assignedTo && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <i className="fas fa-user text-xs"></i>
                      <span>{translatedAssignee}</span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                    {translatedStatus}
                  </span>
                </div>
              </div>

              {/* Priority Badge */}
              <div className="flex-shrink-0">
                <span className={`inline-flex items-center gap-1 px-2 py-1 ${priorityColors.bg} ${priorityColors.text} rounded-full text-xs font-medium`}>
                  <i className={`${priorityColors.icon} text-xs`}></i>
                  {translatedPriority}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
            <i className="fas fa-check-circle text-slate-400 text-xl"></i>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("dashboard.urgentTasks.empty")}
          </p>
        </div>
      )}

      {/* View All Button */}
      {tasks.length > maxItems && (
        <button
          onClick={() => navigate("/tasks")}
          className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-colors font-medium"
        >
          {t("dashboard.urgentTasks.viewAll", { count: tasks.length })}
          <i className="fas fa-arrow-right ml-2 text-xs"></i>
        </button>
      )}
    </div>
  );
}

