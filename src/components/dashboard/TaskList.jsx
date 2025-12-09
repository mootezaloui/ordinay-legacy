import { useNavigate } from "react-router-dom";

/**
 * TaskList Component  
 * Displays urgent/upcoming tasks with priorities
 */
export default function TaskList({ tasks, title = "Tâches Urgentes", maxItems = 5 }) {
  const navigate = useNavigate();

  const getPriorityColor = (priority) => {
    const colors = {
      Haute: { bg: "bg-red-100 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400", icon: "fas fa-arrow-up" },
      Moyenne: { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", icon: "fas fa-minus" },
      Basse: { bg: "bg-blue-100 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-400", icon: "fas fa-arrow-down" },
    };
    return colors[priority] || colors.Basse;
  };

  const getStatusColor = (status) => {
    const colors = {
      "En cours": "text-blue-600 dark:text-blue-400",
      "En attente": "text-amber-600 dark:text-amber-400",
      "Terminée": "text-green-600 dark:text-green-400",
      "Non commencée": "text-slate-600 dark:text-slate-400",
    };
    return colors[status] || colors["Non commencée"];
  };

  const displayedTasks = tasks.slice(0, maxItems);

  return (
    <div className="space-y-3">
      {displayedTasks.map((task) => {
        const priorityColors = getPriorityColor(task.priority);
        const isOverdue = new Date(task.dueDate) < new Date();

        return (
          <div
            key={task.id}
            onClick={() => navigate(`/tasks/${task.id}`)}
            className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <div className="flex-shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={task.status === "Terminée"}
                  onChange={(e) => {
                    e.stopPropagation();
                    // Handle task completion
                  }}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
              </div>

              {/* Task Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${
                  task.status === "Terminée" ? "line-through text-slate-500 dark:text-slate-400" : ""
                }`}>
                  {task.title}
                </p>
                
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {/* Dossier */}
                  {task.dossier && (
                    <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                      {task.dossier}
                    </span>
                  )}

                  {/* Due Date */}
                  <div className={`flex items-center gap-1 text-xs ${
                    isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500 dark:text-slate-400"
                  }`}>
                    <i className="fas fa-clock text-xs"></i>
                    <span>{task.dueDate}</span>
                    {isOverdue && <i className="fas fa-exclamation-circle ml-1"></i>}
                  </div>

                  {/* Assigned To */}
                  {task.assignedTo && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <i className="fas fa-user text-xs"></i>
                      <span>{task.assignedTo}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Priority Badge */}
              <div className="flex-shrink-0">
                <span className={`inline-flex items-center gap-1 px-2 py-1 ${priorityColors.bg} ${priorityColors.text} rounded text-xs font-medium`}>
                  <i className={`${priorityColors.icon} text-xs`}></i>
                  {task.priority}
                </span>
              </div>
            </div>

            {/* Status */}
            <div className="mt-2 pl-7">
              <span className={`text-xs ${getStatusColor(task.status)}`}>
                {task.status}
              </span>
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
            Aucune tâche urgente
          </p>
        </div>
      )}

      {/* View All Button */}
      {tasks.length > maxItems && (
        <button
          onClick={() => navigate("/tasks")}
          className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-colors font-medium"
        >
          Voir toutes les tâches ({tasks.length})
          <i className="fas fa-arrow-right ml-2 text-xs"></i>
        </button>
      )}
    </div>
  );
}
