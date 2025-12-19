import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdvancedTable } from "../hooks/useAdvancedTable";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
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
import FormModal from "../components/FormModal/FormModal";
import StatCard from "../components/dashboard/StatCard";
import { mockOfficers } from "../utils/mockData";
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";

export default function Officers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [officers, setOfficers] = useState(mockOfficers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Define table columns
  const columns = [
    {
      id: "name",
      label: "Nom",
      sortable: true,
      locked: true,
      render: (officer) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <i className="fas fa-balance-scale text-amber-600 dark:text-amber-400"></i>
          </div>
          <span className="font-medium">{officer.name}</span>
        </div>
      ),
    },
    {
      id: "phone",
      label: "Téléphone",
      sortable: true,
      render: (officer) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-phone text-slate-500 dark:text-slate-400 text-xs"></i>
          <span>{officer.phone}</span>
        </div>
      ),
    },
    {
      id: "email",
      label: "Email",
      sortable: true,
      render: (officer) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-envelope text-slate-500 dark:text-slate-400 text-xs"></i>
          <span className="text-sm">{officer.email}</span>
        </div>
      ),
    },
    {
      id: "location",
      label: "Localisation",
      sortable: true,
      render: (officer) => (
        <div className="flex items-center gap-2">
          <i className="fas fa-map-marker-alt text-slate-500 dark:text-slate-400 text-xs"></i>
          <span>{officer.location}</span>
        </div>
      ),
    },
    {
      id: "status",
      label: "Statut",
      sortable: true,
      render: (officer) => (
        <InlineStatusSelector
          value={officer.status}
          onChange={(newStatus) => handleStatusChange(officer.id, newStatus)}
          statusOptions={[
            { value: "Disponible", label: "Disponible", icon: "fas fa-check-circle", color: "green" },
            { value: "Occupé", label: "Occupé", icon: "fas fa-clock", color: "amber" },
            { value: "Inactif", label: "Inactif", icon: "fas fa-circle", color: "slate" },
          ]}
          entityType="officer"
          entityId={officer.id}
          entityData={officer}
        />
      ),
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      locked: true,
      render: (officer) => (
        <TableActions>
          <IconButton
            icon="view"
            variant="view"
            title="Voir détails"
            onClick={(e) => {
              e.stopPropagation();
              handleView(officer.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Modifier"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(officer);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(officer.id);
            }}
          />
        </TableActions>
      ),
    },
  ];

  // Calculate stats
  const stats = {
    total: officers.length,
    available: officers.filter(o => o.status === "Disponible").length,
    busy: officers.filter(o => o.status === "Occupé").length,
    inactive: officers.filter(o => o.status === "Inactif").length,
  };

  // Initialize advanced table
  const table = useAdvancedTable(officers, columns, {
    initialSortBy: "name",
    initialSortDirection: "asc",
    initialItemsPerPage: 10,
    searchableFields: ["name", "phone", "email", "location", "status"],
  });

  const handleView = (id) => {
    navigate(`/officers/${id}`);
  };

  const handleEdit = (officer) => {
    // ✅ Validate before allowing edit
    const result = canPerformAction('officer', officer.id, 'edit', { data: officer });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (result.requiresConfirmation) {
      setValidationResult(result);
      setPendingAction({ type: "openEdit", officer });
      setConfirmImpactModalOpen(true);
      return;
    }

    setEditingOfficer(officer);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    // ✅ Validate before allowing delete
    const officer = officers.find(o => o.id === id);
    const result = canPerformAction('officer', id, 'delete', { data: officer });

    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (result.requiresConfirmation) {
      setValidationResult(result);
      setPendingAction({ type: "delete", id });
      setConfirmImpactModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Supprimer l'huissier",
      message: "Êtes-vous sûr de vouloir supprimer cet huissier ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      setOfficers(officers.filter(o => o.id !== id));
      showToast("Huissier supprimé", "warning", {
        title: "Suppression",
        context: "officer",
      });
    }
  };

  const handleStatusChange = (id, newStatus) => {
    setOfficers(officers.map(o =>
      o.id === id ? { ...o, status: newStatus } : o
    ));
  };

  const handleAddOfficer = () => {
    setEditingOfficer(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    // ✅ Validate before submitting (EDIT mode only)
    if (editingOfficer) {
      const result = canPerformAction('officer', editingOfficer.id, 'edit', {
        data: editingOfficer,
        newData: formData
      });

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
    }

    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingOfficer) {
        setOfficers(officers.map(o =>
          o.id === editingOfficer.id
            ? { ...formData, id: editingOfficer.id }
            : o
        ));
        showToast("Huissier modifié avec succès!", "success");
      } else {
        const newOfficer = {
          ...formData,
          id: Date.now(),
        };
        setOfficers([newOfficer, ...officers]);
        showToast("Huissier ajouté avec succès!", "success");

        // ✅ Log creation event
        logEntityCreation('officer', newOfficer.id, formData.name);

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('officer', newOfficer.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingOfficer(null);
    } catch (error) {
      console.error("Error submitting officer:", error);
      showToast("Erreur lors de l'enregistrement", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const headers = table.columns
      .filter(col => col.id !== "actions")
      .map(col => col.label)
      .join(",");

    const rows = table.allData.map(officer =>
      table.columns
        .filter(col => col.id !== "actions")
        .map(col => {
          const value = officer[col.id] || "";
          return `"${value}"`;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `officers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Form fields for officers (base definition)
  const officerFormFieldsBase = [
    {
      name: "name",
      label: "Nom complet",
      type: "text",
      required: true,
      placeholder: "Ex: Me. Ahmed Ben Salem",
      fullWidth: false,
    },
    {
      name: "phone",
      label: "Téléphone",
      type: "tel",
      required: true,
      placeholder: "+216 98 123 456"
    },
    {
      name: "alternatePhone",
      label: "Téléphone alternatif",
      type: "tel",
      required: false,
      placeholder: "+216 71 234 567"
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "email@exemple.com"
    },
    {
      name: "location",
      label: "Localisation",
      type: "text",
      required: true,
      placeholder: "Ex: Tunis"
    },
    {
      name: "address",
      label: "Adresse complète",
      type: "textarea",
      required: false,
      placeholder: "Adresse du cabinet/étude",
      fullWidth: true,
      rows: 2,
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "Disponible",
      options: [
        { value: "Disponible", label: "Disponible" },
        { value: "Occupé", label: "Occupé" },
        { value: "Inactif", label: "Inactif" },
      ]
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      required: false,
      placeholder: "Notes sur cet huissier...",
      fullWidth: true,
      rows: 3,
    },
  ];

  // ✅ Apply status field protection when editing
  const officerFormFields = editingOfficer
    ? officerFormFieldsBase.map(field => {
      if (field.name === "status") {
        return {
          ...field,
          type: 'readonly',
          displayValue: editingOfficer.status,
          helpText: 'Le statut ne peut être modifié que via le sélecteur dans la liste'
        };
      }
      return field;
    })
    : officerFormFieldsBase;

  return (
    <PageLayout>
      <PageHeader
        title="Huissiers de Justice"
        subtitle={`${table.originalTotalItems} huissiers au total${table.isFiltering ? ` • ${table.totalItems} affichés` : ""}`}
        icon="fas fa-user-tie"
        actions={
          <button
            onClick={handleAddOfficer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Huissier
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Huissiers"
          value={stats.total}
          icon="fas fa-user-tie"
          color="blue"
        />
        <StatCard
          label="Disponibles"
          value={stats.available}
          icon="fas fa-check-circle"
          color="green"
        />
        <StatCard
          label="Occupés"
          value={stats.busy}
          icon="fas fa-business-time"
          color="amber"
        />
        <StatCard
          label="Inactifs"
          value={stats.inactive}
          icon="fas fa-pause-circle"
          color="red"
        />
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "Aucun résultat trouvé" : "Aucun huissier trouvé"}>
            {table.data.map((officer) => (
              <TableRow
                key={officer.id}
                onClick={() => handleView(officer.id)}
                className="cursor-pointer"
              >
                {table.columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.render ? column.render(officer) : officer[column.id]}
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
          setEditingOfficer(null);
        }}
        onSubmit={handleSubmit}
        title={editingOfficer ? "Modifier Huissier" : "Nouveau Huissier"}
        subtitle={editingOfficer ? "Modifier les informations de l'huissier" : "Ajouter un nouvel huissier de justice"}
        fields={officerFormFields}
        initialData={editingOfficer}
        isLoading={isLoading}
        entityType="officer"
        entityId={editingOfficer?.id}
        editingEntity={editingOfficer}
      />

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Modifier/Supprimer l'huissier"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.name || "Huissier"}
      />
    </PageLayout>
  );
}
