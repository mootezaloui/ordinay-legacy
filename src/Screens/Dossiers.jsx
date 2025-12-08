import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import FormModal from "../components/FormModal/FormModal";
import { dossierFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockDossiers, mockClients, getStatusColor } from "../utils/mockData";

export default function Dossiers() {
  const navigate = useNavigate();
  
  // Store dossiers in state
  const [dossiers, setDossiers] = useState(mockDossiers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDossier, setEditingDossier] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleView = (id) => {
    navigate(`/dossiers/${id}`);
  };

  const handleEdit = (dossier) => {
    setEditingDossier(dossier);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce dossier ?")) {
      setDossiers(dossiers.filter(d => d.id !== id));
      console.log("Delete dossier:", id);
    }
  };

  const handleAddDossier = () => {
    setEditingDossier(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    
    try {
      console.log("Submitting dossier data:", formData);
      
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      if (editingDossier) {
        // UPDATE
        setDossiers(dossiers.map(d => 
          d.id === editingDossier.id 
            ? { ...formData, id: editingDossier.id }
            : d
        ));
        alert("Dossier modifié avec succès!");
      } else {
        // ADD - Find client name from clientId
        const client = mockClients.find(c => c.id === parseInt(formData.clientId));
        
        const newDossier = {
          ...formData,
          id: Date.now(),
          client: client ? client.name : "Client inconnu",
        };
        
        setDossiers([newDossier, ...dossiers]);
        alert("Dossier ajouté avec succès!");
      }
      
      setIsModalOpen(false);
      setEditingDossier(null);
    } catch (error) {
      console.error("Error submitting dossier:", error);
      alert("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  // Priority colors
  const priorityColor = {
    "Haute": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "Moyenne": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    "Basse": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };

  // Populate client options for the form
  const dossierFields = dossierFormFields.map(field => {
    if (field.name === "clientId") {
      return {
        ...field,
        options: mockClients.map(client => ({
          value: client.id,
          label: client.name
        }))
      };
    }
    return field;
  });

  return (
    <PageLayout>
      <PageHeader
        title="Dossiers"
        subtitle={`${dossiers.length} dossiers au total`}
        icon="fas fa-folder-open"
        actions={
          <button
            onClick={handleAddDossier}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Dossier
          </button>
        }
      />

      <ContentSection>
        <Table>
          <TableHeader columns={["Numéro", "Titre", "Client", "Statut", "Date d'ouverture", "Priorité", "Actions"]} />
          <TableBody isEmpty={dossiers.length === 0} emptyMessage="Aucun dossier trouvé">
            {dossiers.map((dossier) => (
              <TableRow 
                key={dossier.id}
                onClick={() => handleView(dossier.id)}
                className="cursor-pointer"
              >
                <TableCell>
                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {dossier.caseNumber}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{dossier.title}</span>
                </TableCell>
                <TableCell>{dossier.client}</TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(dossier.status)}`}>
                    {dossier.status}
                  </span>
                </TableCell>
                <TableCell>{dossier.openDate}</TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${priorityColor[dossier.priority]}`}>
                    {dossier.priority}
                  </span>
                </TableCell>
                <TableCell>
                  <TableActions>
                    <IconButton 
                      icon="view" 
                      variant="view" 
                      title="Voir détails"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(dossier.id);
                      }}
                    />
                    <IconButton 
                      icon="edit" 
                      variant="edit" 
                      title="Modifier"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(dossier);
                      }}
                    />
                    <IconButton 
                      icon="delete" 
                      variant="delete" 
                      title="Supprimer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(dossier.id);
                      }}
                    />
                  </TableActions>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          currentPage={1}
          totalPages={Math.ceil(dossiers.length / 10)}
          totalItems={dossiers.length}
          itemsPerPage={10}
        />
      </ContentSection>

      {/* Add/Edit Modal */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDossier(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("dossier", !!editingDossier)}
        subtitle={editingDossier ? "Modifier les informations du dossier" : "Ajouter un nouveau dossier"}
        fields={dossierFields}
        initialData={editingDossier}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}