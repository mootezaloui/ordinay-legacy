import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import ContentSection from '../layout/ContentSection';
import templateManager from '../../services/templateManager';

/**
 * Template Management UI
 * 
 * Allows users to:
 * - View system and user templates
 * - Create new templates
 * - Edit existing user templates
 * - Delete user templates
 * 
 * Rules:
 * - System templates are read-only
 * - No rich text editing
 * - No preview
 * - Simple CRUD operations
 */
export default function TemplateManagement() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [templates, setTemplates] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Load templates
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    const allTemplates = templateManager.getAllTemplates();
    setTemplates(allTemplates);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowCreateModal(true);
  };

  const handleEditTemplate = (template) => {
    if (template.template_type === 'system') {
      showToast('Les modèles système ne peuvent pas être modifiés', 'error');
      return;
    }
    setEditingTemplate(template);
    setShowCreateModal(true);
  };

  const handleDeleteTemplate = async (template) => {
    if (template.template_type === 'system') {
      showToast('Les modèles système ne peuvent pas être supprimés', 'error');
      return;
    }

    const confirmed = await confirm({
      title: 'Supprimer le modèle',
      message: `Voulez-vous vraiment supprimer le modèle "${template.name}" ?`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger',
    });

    if (confirmed) {
      try {
        await templateManager.deleteUserTemplate(template.id);
        loadTemplates();
        showToast('Modèle supprimé avec succès', 'success');
      } catch (error) {
        showToast(`Erreur: ${error.message}`, 'error');
      }
    }
  };

  const systemTemplates = templates.filter(t => t.template_type === 'system');
  const userTemplates = templates.filter(t => t.template_type === 'user');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Gestion des modèles
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Créez et gérez vos modèles de documents personnalisés
          </p>
        </div>
        <button
          onClick={handleCreateTemplate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <i className="fas fa-plus"></i>
          Nouveau modèle
        </button>
      </div>

      {/* System Templates */}
      <ContentSection title="Modèles système">
        <div className="p-6">
          {systemTemplates.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aucun modèle système
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {systemTemplates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={handleEditTemplate}
                  onDelete={handleDeleteTemplate}
                  readOnly
                />
              ))}
            </div>
          )}
        </div>
      </ContentSection>

      {/* User Templates */}
      <ContentSection title="Mes modèles">
        <div className="p-6">
          {userTemplates.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-file-alt text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Vous n'avez pas encore de modèle personnalisé
              </p>
              <button
                onClick={handleCreateTemplate}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Créer votre premier modèle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userTemplates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={handleEditTemplate}
                  onDelete={handleDeleteTemplate}
                />
              ))}
            </div>
          )}
        </div>
      </ContentSection>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <TemplateModal
          template={editingTemplate}
          onClose={() => {
            setShowCreateModal(false);
            setEditingTemplate(null);
          }}
          onSave={() => {
            loadTemplates();
            setShowCreateModal(false);
            setEditingTemplate(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Template Card Component
 */
function TemplateCard({ template, onEdit, onDelete, readOnly = false }) {
  const entityTypeLabels = {
    dossier: 'Dossier',
    proces: 'Procès',
  };

  const languageLabels = {
    ar: 'العربية',
    fr: 'Français',
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-500 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-slate-900 dark:text-white">
            {template.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded">
              {entityTypeLabels[template.entity_type]}
            </span>
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs rounded">
              {languageLabels[template.language]}
            </span>
            {template.template_type === 'system' && (
              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded flex items-center gap-1">
                <i className="fas fa-lock text-xs"></i>
                Système
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <>
              <button
                onClick={() => onEdit(template)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors opacity-0 group-hover:opacity-100"
                title="Modifier"
              >
                <i className="fas fa-edit text-slate-600 dark:text-slate-400"></i>
              </button>
              <button
                onClick={() => onDelete(template)}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                title="Supprimer"
              >
                <i className="fas fa-trash text-red-600 dark:text-red-400"></i>
              </button>
            </>
          )}
        </div>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        Créé le {new Date(template.created_at).toLocaleDateString('fr-FR')}
      </div>
    </div>
  );
}

/**
 * Template Creation/Edit Modal
 */
function TemplateModal({ template, onClose, onSave }) {
  const { showToast } = useToast();
  const isEdit = !!template;

  const [formData, setFormData] = useState({
    name: template?.name || '',
    entity_type: template?.entity_type || 'dossier',
    language: template?.language || 'fr',
    file: null,
  });

  const [validation, setValidation] = useState(null);

  // Validate file when it changes
  useEffect(() => {
    if (formData.file) {
      const result = templateManager.validateTemplateFile(formData.file);
      setValidation(result);
    } else {
      setValidation(null);
    }
  }, [formData.file]);

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.name) {
      showToast('Le nom du modèle est requis', 'error');
      return;
    }

    if (!isEdit && !formData.file) {
      showToast('Le fichier DOCX est requis', 'error');
      return;
    }

    try {
      if (isEdit) {
        await templateManager.updateUserTemplate(template.id, formData);
        showToast('Modèle mis à jour avec succès', 'success');
      } else {
        await templateManager.createUserTemplate(formData);
        showToast('Modèle créé avec succès', 'success');
      }
      onSave();
    } catch (error) {
      showToast(`Erreur: ${error.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isEdit ? 'Modifier le modèle' : 'Nouveau modèle'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Placeholder Help */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                <i className="fas fa-info-circle mr-2"></i>
                {isEdit ? "Modifier le modele" : "Nouveau modele"}
              </p>
              <ul className="text-sm text-blue-800 dark:text-blue-400 mt-2 space-y-1">
                <li>Nom du modele *</li>
                <li>Type d'entite *</li>
                <li>Langue *</li>
                <li>Fichier DOCX *</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                Placeholders disponibles
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-blue-800 dark:text-blue-400 mt-2">
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{client.name}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{dossier.reference}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{proces.reference}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{court.name}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{court.address}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{court.city}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.name}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.title}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.firm_name}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.office_name}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.office_address}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.phone}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.fax}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.mobile}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.email}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.bar_id}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{lawyer.vpa}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{session.date}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{adversary.name}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{judgment.number}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{judgment.date}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{document.copy_type}}'}</code>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">{'{{today.date}}'}</code>
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-400 mt-2">
                Les placeholders doivent etre saisis en texte brut, sans style ni coupure.
              </p>
            </div>
          </div>

          {/* Template Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Nom du modŠle *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Contrat de location"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Entity Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Type d'entit‚ *
            </label>
            <select
              value={formData.entity_type}
              onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="dossier">Dossier</option>
              <option value="proces">ProcŠs</option>
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Langue *
            </label>
            <select
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fr">Fran‡ais</option>
              <option value="ar">???????</option>
            </select>
          </div>

          {/* Template File */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Fichier DOCX *
            </label>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {template?.file_path && !formData.file && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Fichier actuel: {template.file_path.split('/').pop()}
              </p>
            )}
          </div>

          {/* Validation Result */}
          {validation && (
            <div className={`p-3 border rounded-lg ${
              validation.valid
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            }`}>
              <p className={`text-sm ${
                validation.valid
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-amber-800 dark:text-amber-300'
              }`}>
                <i className={`fas ${validation.valid ? 'fa-check-circle' : 'fa-exclamation-triangle'} mr-2`}></i>
                {validation.message}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            {isEdit ? 'Enregistrer' : 'Créer le modèle'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

