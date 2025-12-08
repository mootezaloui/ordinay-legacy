import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import Table from "../components/table/Table";
import TableHeader from "../components/table/TableHeader";
import TableBody from "../components/table/TableBody";
import TableRow from "../components/table/TableRow";
import TableCell from "../components/table/TableCell";
import TableActions, { IconButton } from "../components/table/TableActions";
import Pagination from "../components/table/Pagination";
import { mockTasks, getStatusColor } from "../utils/mockData";

export default function Tasks() {
  const priorityIcons = {
    "Haute": "fas fa-arrow-up text-red-600 dark:text-red-400",
    "Moyenne": "fas fa-minus text-amber-600 dark:text-amber-400",
    "Basse": "fas fa-arrow-down text-green-600 dark:text-green-400",
  };

  return (
    <PageLayout>
      <PageHeader
        title="Tâches"
        subtitle="Gérer vos tâches et activités"
        icon="fas fa-tasks"
        actions={
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
            <i className="fas fa-plus"></i>
            Nouvelle Tâche
          </button>
        }
      />

      <ContentSection>
        <Table>
          <TableHeader columns={["Tâche", "Dossier", "Assigné à", "Date limite", "Statut", "Priorité", "Actions"]} />
          <TableBody>
            {mockTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={task.status === "Terminée"}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
                      readOnly
                    />
                    <span className={task.status === "Terminée" ? "line-through text-slate-500 dark:text-slate-400" : ""}>
                      {task.title}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                    {task.dossier}
                  </span>
                </TableCell>
                <TableCell>{task.assignedTo}</TableCell>
                <TableCell>
                  <span className="text-sm">{task.dueDate}</span>
                </TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                    {task.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className={priorityIcons[task.priority]}></i>
                    <span className="text-sm">{task.priority}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <TableActions>
                    <IconButton icon="view" variant="view" title="Voir détails" />
                    <IconButton icon="edit" variant="edit" title="Modifier" />
                    <IconButton icon="delete" variant="delete" title="Supprimer" />
                  </TableActions>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          currentPage={1}
          totalPages={1}
          totalItems={mockTasks.length}
          itemsPerPage={10}
        />
      </ContentSection>
    </PageLayout>
  );
}