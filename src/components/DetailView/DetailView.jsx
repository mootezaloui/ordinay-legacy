import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageLayout from "../layout/PageLayout";
import PageHeader from "../layout/PageHeader";
import { getEntityConfig } from "./config/entityConfigs";
import OverviewTab from "./tabs/OverviewTab";
import DocumentsTab from "./tabs/DocumentsTab";
import TimelineTab from "./tabs/TimelineTab";
import NotesTab from "./tabs/NotesTab";
import RelatedItemsTab from "./tabs/RelatedItemsTab";
import FinancialsTab from "./tabs/FinancialsTab";

/**
 * Generic DetailView component with full CRUD support
 * Can add/edit/delete related items directly from detail view
 */
export default function DetailView({ entityType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Get configuration for this entity type
  const config = getEntityConfig(entityType);

  useEffect(() => {
    // Fetch data for this entity
    const fetchData = async () => {
      setLoading(true);
      try {
        const entityData = await config.fetchData(id);
        setData(entityData);
        setOriginalData(entityData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, entityType]);

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <i className="fas fa-spinner fa-spin text-4xl text-blue-600 dark:text-blue-400 mb-4"></i>
            <p className="text-slate-600 dark:text-slate-400">Chargement...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!data) {
    return (
      <PageLayout>
        <div className="text-center py-12">
          <i className={`${config.icon} text-6xl text-slate-400 dark:text-slate-600 mb-4`}></i>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {config.notFoundMessage}
          </p>
          <button
            onClick={() => navigate(config.listRoute)}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Retour à la liste
          </button>
        </div>
      </PageLayout>
    );
  }

  const handleDataChange = (newData) => {
    setData(newData);
  };

  const handleDocumentsChange = (newDocuments) => {
    const newData = { ...data, documents: newDocuments };
    setData(newData);
  };

  const handleItemsChange = (itemsKey, newItems) => {
    const newData = { ...data, [itemsKey]: newItems };
    setData(newData);
    // Optional: Auto-save
    // config.updateData(id, newData);
  };

  const handleSave = async () => {
    try {
      await config.updateData(id, data);
      setOriginalData(data);
      setIsEditing(false);
      alert("Modifications enregistrées avec succès!");
    } catch (error) {
      console.error("Error saving:", error);
      alert("Erreur lors de l'enregistrement");
    }
  };

  const handleCancel = () => {
    setData(originalData);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (window.confirm(config.deleteConfirmMessage)) {
      try {
        await config.deleteData(id);
        navigate(config.listRoute);
      } catch (error) {
        alert("Erreur lors de la suppression");
      }
    }
  };

  // Render tab content based on active tab and available tabs
  const renderTabContent = () => {
    const tabConfig = config.tabs.find(t => t.id === activeTab);
    
    if (!tabConfig) return null;

    switch (tabConfig.component) {
      case "overview":
        return (
          <OverviewTab 
            data={data} 
            config={config} 
            isEditing={isEditing}
            onDataChange={handleDataChange}
          />
        );
      case "documents":
        return (
          <DocumentsTab 
            data={data} 
            config={config}
            onDocumentsChange={handleDocumentsChange}
          />
        );
      case "timeline":
        return <TimelineTab data={data} config={config} />;
      case "notes":
        return <NotesTab data={data} config={config} />;
      case "relatedItems":
        return (
          <RelatedItemsTab 
            data={data} 
            config={config} 
            tabConfig={tabConfig}
            onItemsChange={handleItemsChange}
          />
        );
      case "financials":
        return <FinancialsTab data={data} config={config} />;
      default:
        return <div className="p-6 text-slate-600 dark:text-slate-400">Tab content not found</div>;
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={config.getTitle(data)}
        subtitle={config.getSubtitle(data)}
        icon={config.icon}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(config.listRoute)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Retour
            </button>
            
            {config.allowDelete && !isEditing && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors duration-200"
              >
                <i className="fas fa-trash mr-2"></i>
                Supprimer
              </button>
            )}
            
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
              >
                <i className="fas fa-edit"></i>
                Modifier
              </button>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
                >
                  <i className="fas fa-times mr-2"></i>
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
                >
                  <i className="fas fa-save mr-2"></i>
                  Enregistrer
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        {/* Header Section - customizable per entity */}
        {config.renderHeader && config.renderHeader(data)}

        {/* Stats Cards - if defined */}
        {config.getStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.getStats(data).map((stat, index) => (
              <div
                key={index}
                className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <i className={`${stat.icon} ${stat.iconColor} text-xl`}></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {config.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium transition-colors duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <i className={tab.icon}></i>
                {tab.label}
                {tab.getCount && (
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs">
                    {tab.getCount(data)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </PageLayout>
  );
}