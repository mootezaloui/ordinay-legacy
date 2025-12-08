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
import { clientFormFields, getFormTitle } from "../components/FormModal/formConfigs";
import { mockClients, getStatusColor } from "../utils/mockData";

export default function Clients() {
  const navigate = useNavigate();
  
  // ⭐ IMPORTANT: Store clients in state, initialize with mockClients
  const [clients, setClients] = useState(mockClients);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Navigate to client detail
  const handleView = (id) => {
    navigate(`/clients/${id}`);
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
      // ⭐ Remove from state
      setClients(clients.filter(c => c.id !== id));
      
      // TODO: API call to delete
      console.log("Delete client:", id);
    }
  };

  const handleAddClient = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    
    try {
      // TODO: Replace with actual API call
      console.log("Submitting client data:", formData);
      
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      if (editingClient) {
        // ⭐ UPDATE: Update existing client in state
        setClients(clients.map(c => 
          c.id === editingClient.id 
            ? { ...formData, id: editingClient.id }
            : c
        ));
        alert("Client modifié avec succès!");
      } else {
        // ⭐ ADD: Add new client to state with generated ID
        const newClient = {
          ...formData,
          id: Date.now(), // Generate unique ID
          joinDate: new Date().toISOString().split('T')[0], // Add today's date
        };
        
        setClients([newClient, ...clients]); // Add to beginning of array
        alert("Client ajouté avec succès!");
      }
      
      setIsModalOpen(false);
      setEditingClient(null);
      
      // TODO: When you connect to backend, replace above with:
      // const response = await fetch('/api/clients', {
      //   method: editingClient ? 'PUT' : 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData)
      // });
      // const savedClient = await response.json();
      // Then refresh the list from API
    } catch (error) {
      console.error("Error submitting client:", error);
      alert("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} clients au total`}
        icon="fas fa-users"
        actions={
          <button
            onClick={handleAddClient}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Nouveau Client
          </button>
        }
      />

      <ContentSection>
        <Table>
          <TableHeader columns={["Nom", "Email", "Téléphone", "Statut", "Date d'inscription", "Actions"]} />
          <TableBody isEmpty={clients.length === 0} emptyMessage="Aucun client trouvé">
            {/* ⭐ IMPORTANT: Map over clients state, not mockClients */}
            {clients.map((client) => (
              <TableRow 
                key={client.id}
                onClick={() => handleView(client.id)}
                className="cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {client.name.charAt(0)}
                      </span>
                    </div>
                    <span className="font-medium">{client.name}</span>
                  </div>
                </TableCell>
                <TableCell>{client.email}</TableCell>
                <TableCell>{client.phone}</TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(client.status)}`}>
                    {client.status}
                  </span>
                </TableCell>
                <TableCell>{client.joinDate}</TableCell>
                <TableCell>
                  <TableActions>
                    <IconButton 
                      icon="view" 
                      variant="view" 
                      title="Voir détails"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(client.id);
                      }}
                    />
                    <IconButton 
                      icon="edit" 
                      variant="edit" 
                      title="Modifier"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(client);
                      }}
                    />
                    <IconButton 
                      icon="delete" 
                      variant="delete" 
                      title="Supprimer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(client.id);
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
          totalPages={Math.ceil(clients.length / 10)}
          totalItems={clients.length}
          itemsPerPage={10}
        />
      </ContentSection>

      {/* Add/Edit Modal */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingClient(null);
        }}
        onSubmit={handleSubmit}
        title={getFormTitle("client", !!editingClient)}
        subtitle={editingClient ? "Modifier les informations du client" : "Ajouter un nouveau client à votre base"}
        fields={clientFormFields}
        initialData={editingClient}
        isLoading={isLoading}
      />
    </PageLayout>
  );
}