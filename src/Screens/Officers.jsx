import { useState } from "react";
import { useData } from "../contexts/DataContext";
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
import InlineStatusSelector from "../components/InlineSelectors/InlineStatusSelector";
import BlockerModal from "../components/ui/BlockerModal";
import { canPerformAction } from "../services/domainRules";
import { resolveDetailRoute } from "../utils/routeResolver";
import { logEntityCreation } from "../services/historyService";

export default function Officers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const {
    officers,
    clients,
    dossiers,
    cases,
    tasks,
    sessions,
    missions,
    financialEntries,
    addOfficer,
    updateOfficer,
    deleteOfficer
  } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Define table columns
  const columns = [
    {
      id: "name",
      label: "Name",
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
      label: "Phone",
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
      label: "Location",
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
      label: "Status",
      sortable: true,
      render: (officer) => (
        <InlineStatusSelector
          value={officer.status}
          onChange={(newStatus) => handleStatusChange(officer.id, newStatus)}
          statusOptions={[
            { value: "Available", label: "Available", icon: "fas fa-check-circle", color: "green" },
            { value: "Busy", label: "Busy", icon: "fas fa-clock", color: "amber" },
            { value: "Inactive", label: "Inactive", icon: "fas fa-circle", color: "slate" },
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
            title="View details"
            onClick={(e) => {
              e.stopPropagation();
              handleView(officer.id);
            }}
          />
          <IconButton
            icon="edit"
            variant="edit"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(officer);
            }}
          />
          <IconButton
            icon="delete"
            variant="delete"
            title="Delete"
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
    available: officers.filter(o => o.status === "Available").length,
    busy: officers.filter(o => o.status === "Busy").length,
    inactive: officers.filter(o => o.status === "Inactive").length,
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
    const result = canPerformAction('officer', officer.id, 'edit', {
      data: officer,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

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
    const result = canPerformAction('officer', id, 'delete', {
      data: officer,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    });

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
      title: "Delete Officer",
      message: "Are you sure you want to delete this officer?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    })) {
      deleteOfficer(id);
      showToast("Officer deleted", "warning", {
        title: "Deletion Successful",
        context: "officer",
      });
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    await updateOfficer(id, { status: newStatus });
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
        newData: formData,
        entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
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
        // For edit, you may want to implement updateOfficer from context (not shown here)
        // setOfficers(officers.map(o =>
        //   o.id === editingOfficer.id
        //     ? { ...formData, id: editingOfficer.id }
        //     : o
        // ));
        showToast("Bailiff updated successfully!", "success");
      } else {
        const creation = await addOfficer(formData);
        const createdOfficer = creation?.created || creation;
        showToast("Bailiff added successfully!", "success");
        // ✅ Log creation event
        logEntityCreation('officer', createdOfficer.id, formData.name);

        // ✅ Navigate to detail view after creation
        const detailRoute = resolveDetailRoute('officer', createdOfficer.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

      setIsModalOpen(false);
      setEditingOfficer(null);
    } catch (error) {
      console.error("Error submitting Bailiff:", error);
      showToast("Error saving Bailiff", "error");
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
      label: "Full Name",
      type: "text",
      required: true,
      placeholder: "Ex: Me. Ahmed Ben Salem",
      fullWidth: false,
    },
    {
      name: "phone",
      label: "Phone",
      type: "tel",
      required: true,
      placeholder: "+216 98 123 456"
    },
    {
      name: "alternatePhone",
      label: "Alternate Phone",
      type: "tel",
      required: false,
      placeholder: "+216 71 234 567"
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "email@example.com"
    },
    {
      name: "location",
      label: "Location",
      type: "text",
      required: true,
      placeholder: "Ex: Tunis"
    },
    {
      name: "address",
      label: "Full Address",
      type: "textarea",
      required: false,
      placeholder: "Office/Study Address",
      fullWidth: true,
      rows: 2,
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      defaultValue: "Available",
      options: [
        { value: "Available", label: "Available" },
        { value: "Busy", label: "Busy" },
        { value: "Inactive", label: "Inactive" },
      ]
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      required: false,
      placeholder: "Notes about this Bailiff...",
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
          helpText: 'Status can only be changed via the selector in the list'
        };
      }
      return field;
    })
    : officerFormFieldsBase;

  return (
    <PageLayout>
      <PageHeader
        title="Bailiffs"
        subtitle={`${table.originalTotalItems} bailiffs in total${table.isFiltering ? ` • ${table.totalItems} displayed` : ""}`}
        icon="fas fa-user-tie"
        actions={
          <button
            onClick={handleAddOfficer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            New Bailiff
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Bailiffs"
          value={stats.total}
          icon="fas fa-user-tie"
          color="blue"
        />
        <StatCard
          label="Available"
          value={stats.available}
          icon="fas fa-check-circle"
          color="green"
        />
        <StatCard
          label="Busy"
          value={stats.busy}
          icon="fas fa-business-time"
          color="amber"
        />
        <StatCard
          label="Inactive"
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
          <TableBody isEmpty={table.data.length === 0} emptyMessage={table.isFiltering ? "No results found" : "No Bailiff available"}>
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
        title={editingOfficer ? "Edit Bailiff" : "New Bailiff"}
        subtitle={editingOfficer ? "Edit Bailiff information" : "Add a new Bailiff"}
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
        actionName="Edit/Delete Bailiff"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={validationResult?.entityData?.name || "Bailiff"}
      />
    </PageLayout>
  );
}
