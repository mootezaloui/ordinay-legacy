import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import Table from "../components/table/Table";
import AdvancedTableHeader from "../components/table/AdvancedTableHeader";
import TableBody from "../components/table/TableBody";
import TableRow from "../components/table/TableRow";
import TableCell from "../components/table/TableCell";
import TableActions, { IconButton } from "../components/table/TableActions";
import TableToolbar from "../components/table/TableToolbar";
import Pagination from "../components/table/Pagination";
import StatCard from "../components/dashboard/StatCard";
import FormModal from "../components/FormModal/FormModal";
import { mockAccounting, mockClients, getStatusColor } from "../utils/mockData";

export default function Accounting() {
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState(mockAccounting);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Define table columns
  const columns = [
    {
      id: "invoiceNumber",
      label: "N° Facture",
      sortable: true,
      locked: true,
      render: (invoice) => (
        <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
          {invoice.invoiceNumber}
        </span>
      ),
    },
    {
      id: "client",
      label: "Client",
      sortable: true,
      render: (invoice) => invoice.client,
    },
    {
      id: "amount",
      label: "Montant",
      sortable: true,
      render: (invoice) => (
        <span className="font-bold text-slate-900 dark:text-white">
          {invoice.amount}
        </span>
      ),
    },
    {
      id: "date",
      label: "Date",
      sortable: true,
      render: (invoice) => invoice.date,
    },
    {
      id: "dueDate",
      label: "Échéance",
      sortable: true,
      render: (invoice) => <span className="font-medium">{invoice.dueDate}</span>,
    },
    {
      id: "type",
      label: "Type",
      sortable: true,
      render: (invoice) => (
        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
          {invoice.type}
        </span>
      ),
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (invoice) => (
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
          {invoice.status}
        </span>
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (invoice) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title="Voir facture"
            onClick={(e) => {
              e.stopPropagation();
              handleView(invoice.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(invoice);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(invoice.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Initialize advanced table
  const table = useAdvancedTable(invoices, columns, {
    initialSortBy: "date",
    initialSortDirection: "desc",
    initialItemsPerPage: 10,
    searchableFields: ["invoiceNumber", "client", "amount", "type", "status"],
  });

  const handleView = (id) => {
    navigate(`/invoices/${id}`);
  };

  const handleEdit = (invoice) => {
    setEditingInvoice(invoice);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette facture ?")) {
      setInvoices(invoices.filter(i => i.id !== id));
    }
  };

  const handleAddInvoice = () => {
    setEditingInvoice(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingInvoice) {
        setInvoices(invoices.map(i =>
          i.id === editingInvoice.id
            ? { ...formData, id: editingInvoice.id }
            : i
        ));
        alert("Facture modifiée avec succès!");
      } else {
        const client = mockClients.find(c => c.id === parseInt(formData.clientId));
        const newInvoice = {
          ...formData,
          id: Date.now(),
          client: client ? client.name : "Client inconnu",
        };
        setInvoices([newInvoice, ...invoices]);
        alert("Facture ajoutée avec succès!");
      }

      setIsModalOpen(false);
      setEditingInvoice(null);
    } catch (error) {
      console.error("Error submitting invoice:", error);
      alert("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const headers = table.columns
      .filter(col => col.id !== "actions")
      .map(col => col.label)
      .join(",");

    const rows = table.allData.map(invoice =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = invoice[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accounting-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Form fields for invoices
  const invoiceFormFields = [
    {
      name: "invoiceNumber",
      label: "Numéro de facture",
      type: "text",
      required: true,
      placeholder: "FAC-2024-XXX"
    },
    {
      name: "clientId",
      label: "Client",
      type: "select",
      required: true,
      options: mockClients.map(c => ({
        value: c.id,
        label: c.name
      }))
    },
    {
      name: "amount",
      label: "Montant",
      type: "text",
      required: true,
      placeholder: "Ex: 1,500 TND"
    },
    {
      name: "date",
      label: "Date",
      type: "date",
      required: true,
    },
    {
      name: "dueDate",
      label: "Date d'échéance",
      type: "date",
      required: true,
    },
    {
      name: "type",
      label: "Type",
      type: "select",
      required: true,
      options: [
        { value: "Honoraire", label: "Honoraire" },
        { value: "Consultation", label: "Consultation" },
        { value: "Frais", label: "Frais" },
      ]
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "En attente",
      options: [
        { value: "Payée", label: "Payée" },
        { value: "En attente", label: "En attente" },
        { value: "En retard", label: "En retard" },
      ]
    },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="Comptabilité"
        subtitle={`${table.originalTotalItems} factures au total${table.isFiltering ? ` • ${table.totalItems} affichées` : ""}`}
        icon="fas fa-calculator"
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <i className="fas fa-download"></i>
              Exporter
            </button>
            <button
              onClick={handleAddInvoice}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
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
        <TableToolbar
          searchQuery={table.searchQuery}
          onSearchChange={table.setSearchQuery}
          columns={table.allColumns}
          visibleColumns={table.visibleColumns}
          onToggleColumn={table.toggleColumnVisibility}
          onResetColumns={table.resetColumns}
          onExport={handleExport}
          totalItems={table.originalTotalItems}
          filteredItems={table.totalItems}
          isFiltering={table.isFiltering}
        />

        <Table>
          <AdvancedTableHeader
            columns={table.columns}
            sortBy={table.sortBy}
            sortDirection={table.sortDirection}
            onSort={table.handleSort}
            onReorder={table.reorderColumns}
            enableReorder={true}
          />
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucune facture trouvée"}>
            {table.data.map((invoice) => (
              <TableRow
                key={invoice.id}
                onClick={() => handleView(invoice.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(invoice) : invoice[column.id]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Pagination
          currentPage={table.currentPage}
          totalPages={table.totalPages}
          totalItems={table.totalItems}
          itemsPerPage={table.itemsPerPage}
          onPageChange={table.handlePageChange}
          onItemsPerPageChange={table.handleItemsPerPageChange}
        />
      </ContentSection>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingInvoice(null);
        }}
        onSubmit={handleSubmit}
        title={editingInvoice ? "Modifier Facture" : "Nouvelle Facture"}
        subtitle={editingInvoice ? "Modifier les informations de la facture" : "Ajouter une nouvelle facture"}
        fields={invoiceFormFields}
        initialData={editingInvoice}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}