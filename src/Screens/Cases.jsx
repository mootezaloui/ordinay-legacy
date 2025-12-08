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
import { mockCases, getStatusColor } from "../utils/mockData";

export default function Cases() {
  return (
    <PageLayout>
      <PageHeader
        title="Procès"
        subtitle="Gérer vos procédures judiciaires"
        icon="fas fa-gavel"
        actions={
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
            <i className="fas fa-plus"></i>
            Nouveau Procès
          </button>
        }
      />

      <ContentSection>
        <Table>
          <TableHeader columns={["N° Procès", "Titre", "Dossier", "Tribunal", "Prochaine audience", "Statut", "Actions"]} />
          <TableBody>
            {mockCases.map((caseItem) => (
              <TableRow key={caseItem.id}>
                <TableCell>
                  <span className="font-mono text-xs font-semibold text-purple-600 dark:text-purple-400">
                    {caseItem.caseNumber}
                  </span>
                </TableCell>
                <TableCell truncate>{caseItem.title}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                    {caseItem.dossier}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-landmark text-slate-500 dark:text-slate-400 text-xs"></i>
                    <span className="text-sm">{caseItem.court}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{caseItem.nextHearing}</span>
                </TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(caseItem.status)}`}>
                    {caseItem.status}
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
          totalItems={mockCases.length}
          itemsPerPage={10}
        />
      </ContentSection>
    </PageLayout>
  );
}