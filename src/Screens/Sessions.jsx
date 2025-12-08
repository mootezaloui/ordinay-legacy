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
import { mockSessions, getStatusColor } from "../utils/mockData";

export default function Sessions() {
  const typeIcons = {
    "Consultation": "fas fa-comments",
    "Audience": "fas fa-gavel",
    "Expertise": "fas fa-microscope",
    "Médiation": "fas fa-handshake",
    "Téléphone": "fas fa-phone",
  };

  return (
    <PageLayout>
      <PageHeader
        title="Séances Juridiques"
        subtitle="Gérer vos rendez-vous et audiences"
        icon="fas fa-calendar"
        actions={
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
            <i className="fas fa-plus"></i>
            Nouvelle Séance
          </button>
        }
      />

      <ContentSection>
        <Table>
          <TableHeader columns={["Titre", "Type", "Date", "Heure", "Durée", "Lieu", "Statut", "Actions"]} />
          <TableBody>
            {mockSessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell truncate>
                  <span className="font-medium">{session.title}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className={`${typeIcons[session.type]} text-blue-600 dark:text-blue-400 text-sm`}></i>
                    <span className="text-sm">{session.type}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{session.date}</span>
                </TableCell>
                <TableCell>{session.time}</TableCell>
                <TableCell>
                  <span className="text-slate-600 dark:text-slate-400">{session.duration}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-map-marker-alt text-slate-500 dark:text-slate-400 text-xs"></i>
                    <span className="text-sm">{session.location}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                    {session.status}
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
          totalItems={mockSessions.length}
          itemsPerPage={10}
        />
      </ContentSection>
    </PageLayout>
  );
}