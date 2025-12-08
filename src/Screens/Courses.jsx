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
import { mockCourses, getStatusColor } from "../utils/mockData";

export default function Courses() {
  return (
    <PageLayout>
      <PageHeader
        title="Formations"
        subtitle="Gérer vos formations continues"
        icon="fas fa-graduation-cap"
        actions={
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
            <i className="fas fa-plus"></i>
            Nouvelle Formation
          </button>
        }
      />

      <ContentSection>
        <Table>
          <TableHeader columns={["Titre", "Formateur", "Date", "Durée", "Tarif", "Statut", "Actions"]} />
          <TableBody>
            {mockCourses.map((course) => (
              <TableRow key={course.id}>
                <TableCell truncate>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                      <i className="fas fa-book text-purple-600 dark:text-purple-400"></i>
                    </div>
                    <span className="font-medium">{course.title}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-chalkboard-teacher text-slate-500 dark:text-slate-400 text-sm"></i>
                    <span>{course.instructor}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{course.date}</span>
                </TableCell>
                <TableCell>
                  <span className="text-slate-600 dark:text-slate-400">{course.duration}</span>
                </TableCell>
                <TableCell>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {course.price}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(course.status)}`}>
                    {course.status}
                  </span>
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
          totalItems={mockCourses.length}
          itemsPerPage={10}
        />
      </ContentSection>
    </PageLayout>
  );
}