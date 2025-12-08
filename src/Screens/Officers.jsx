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
import { mockOfficers, getStatusColor } from "../utils/mockData";

export default function Officers() {
  return (
    <PageLayout>
      <PageHeader
        title="Huissiers de Justice"
        subtitle="Gérer vos contacts huissiers"
        icon="fas fa-user-tie"
        actions={
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
            <i className="fas fa-plus"></i>
            Nouveau Huissier
          </button>
        }
      />

      <ContentSection>
        <Table>
          <TableHeader columns={["Nom", "Spécialisation", "Téléphone", "Email", "Localisation", "Statut", "Actions"]} />
          <TableBody>
            {mockOfficers.map((officer) => (
              <TableRow key={officer.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <i className="fas fa-balance-scale text-amber-600 dark:text-amber-400"></i>
                    </div>
                    <span className="font-medium">{officer.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {officer.specialization}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-phone text-slate-500 dark:text-slate-400 text-xs"></i>
                    <span>{officer.phone}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-envelope text-slate-500 dark:text-slate-400 text-xs"></i>
                    <span className="text-sm">{officer.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-map-marker-alt text-slate-500 dark:text-slate-400 text-xs"></i>
                    <span>{officer.location}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(officer.status)}`}>
                    {officer.status}
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
          totalItems={mockOfficers.length}
          itemsPerPage={10}
        />
      </ContentSection>
    </PageLayout>
  );
}