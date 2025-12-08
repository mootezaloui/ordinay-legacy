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
import { mockAccounting, getStatusColor } from "../utils/mockData";

export default function Accounting() {
  return (
    <PageLayout>
      <PageHeader
        title="Comptabilité"
        subtitle="Gérer vos factures et paiements"
        icon="fas fa-calculator"
        actions={
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
              <i className="fas fa-download"></i>
              Exporter
            </button>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
              <i className="fas fa-plus"></i>
              Nouvelle Facture
            </button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Facturé</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">14,000 TND</p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <i className="fas fa-file-invoice-dollar text-blue-600 dark:text-blue-400 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Payé</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">4,500 TND</p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <i className="fas fa-check-circle text-green-600 dark:text-green-400 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">En attente</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">4,000 TND</p>
            </div>
            <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
              <i className="fas fa-clock text-amber-600 dark:text-amber-400 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">En retard</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">5,500 TND</p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <i className="fas fa-exclamation-circle text-red-600 dark:text-red-400 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      <ContentSection>
        <Table>
          <TableHeader columns={["N° Facture", "Client", "Montant", "Date", "Échéance", "Type", "Statut", "Actions"]} />
          <TableBody>
            {mockAccounting.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {invoice.invoiceNumber}
                  </span>
                </TableCell>
                <TableCell>{invoice.client}</TableCell>
                <TableCell>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {invoice.amount}
                  </span>
                </TableCell>
                <TableCell>{invoice.date}</TableCell>
                <TableCell>
                  <span className="font-medium">{invoice.dueDate}</span>
                </TableCell>
                <TableCell>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                    {invoice.type}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </TableCell>
                <TableCell>
                  <TableActions>
                    <IconButton icon="view" variant="view" title="Voir facture" />
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
          totalItems={mockAccounting.length}
          itemsPerPage={10}
        />
      </ContentSection>
    </PageLayout>
  );
}