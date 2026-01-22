import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import ContentSection from '../layout/ContentSection';
import templateManager from '../../services/templateManager';
import { useSettings } from '../../contexts/SettingsContext';

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
    session: 'Audience',
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
 * Field definitions for the Field Picker
 * Each field has: label (human-readable), placeholder (internal), example, and visibility rules
 */
const FIELD_DEFINITIONS = {
  client: {
    label: 'Client',
    icon: 'fa-user',
    fields: [
      { key: 'id', label: 'ID client', placeholder: '{{client.id}}', example: '123', entities: ['dossier', 'proces', 'session'] },
      { key: 'name', label: 'Nom complet', placeholder: '{{client.name}}', example: 'Ahmed Ben Salah', entities: ['dossier', 'proces', 'session'] },
      { key: 'email', label: 'Email', placeholder: '{{client.email}}', example: 'ahmed@example.tn', entities: ['dossier', 'proces', 'session'] },
      { key: 'phone', label: 'Téléphone', placeholder: '{{client.phone}}', example: '+216 71 123 456', entities: ['dossier', 'proces', 'session'] },
      { key: 'alternate_phone', label: 'Téléphone secondaire', placeholder: '{{client.alternate_phone}}', example: '+216 98 111 222', entities: ['dossier', 'proces', 'session'] },
      { key: 'address', label: 'Adresse', placeholder: '{{client.address}}', example: '10 Rue Habib Bourguiba, Tunis', entities: ['dossier', 'proces', 'session'] },
      { key: 'status', label: 'Statut', placeholder: '{{client.status}}', example: 'active', entities: ['dossier', 'proces', 'session'] },
      { key: 'cin', label: 'CIN', placeholder: '{{client.cin}}', example: '01234567', entities: ['dossier', 'proces', 'session'] },
      { key: 'date_of_birth', label: 'Date de naissance', placeholder: '{{client.date_of_birth}}', example: '1985-03-10', entities: ['dossier', 'proces', 'session'] },
      { key: 'profession', label: 'Profession', placeholder: '{{client.profession}}', example: 'Ingénieur', entities: ['dossier', 'proces', 'session'] },
      { key: 'company', label: 'Société', placeholder: '{{client.company}}', example: 'ABC SARL', entities: ['dossier', 'proces', 'session'] },
      { key: 'tax_id', label: 'Identifiant fiscal', placeholder: '{{client.tax_id}}', example: 'TX-123456', entities: ['dossier', 'proces', 'session'] },
      { key: 'notes', label: 'Notes', placeholder: '{{client.notes}}', example: 'Client VIP', entities: ['dossier', 'proces', 'session'] },
      { key: 'missing_fields', label: 'Champs manquants', placeholder: '{{client.missing_fields}}', example: 'email, phone', entities: ['dossier', 'proces', 'session'] },
      { key: 'join_date', label: "Date d'adhésion", placeholder: '{{client.join_date}}', example: '2022-01-15', entities: ['dossier', 'proces', 'session'] },
      { key: 'created_at', label: 'Créé le', placeholder: '{{client.created_at}}', example: '2023-05-12 09:30', entities: ['dossier', 'proces', 'session'] },
      { key: 'updated_at', label: 'Mis à jour le', placeholder: '{{client.updated_at}}', example: '2024-01-10 14:20', entities: ['dossier', 'proces', 'session'] },
      { key: 'imported', label: 'Importé', placeholder: '{{client.imported}}', example: '1', entities: ['dossier', 'proces', 'session'] },
      { key: 'validated', label: 'Validé', placeholder: '{{client.validated}}', example: '1', entities: ['dossier', 'proces', 'session'] },
      { key: 'import_source', label: "Source d'import", placeholder: '{{client.import_source}}', example: 'CSV', entities: ['dossier', 'proces', 'session'] },
      { key: 'imported_at', label: 'Importé le', placeholder: '{{client.imported_at}}', example: '2023-05-01 08:00', entities: ['dossier', 'proces', 'session'] },
      { key: 'deleted_at', label: 'Supprimé le', placeholder: '{{client.deleted_at}}', example: '2024-06-01 09:00', entities: ['dossier', 'proces', 'session'] },
    ],
  },
  dossier: {
    label: 'Dossier',
    icon: 'fa-folder',
    fields: [
      { key: 'id', label: 'ID dossier', placeholder: '{{dossier.id}}', example: '42', entities: ['dossier'] },
      { key: 'reference', label: 'Référence', placeholder: '{{dossier.reference}}', example: 'DOS-2024-001', entities: ['dossier', 'proces', 'session'] },
      { key: 'client_id', label: 'ID client', placeholder: '{{dossier.client_id}}', example: '123', entities: ['dossier'] },
      { key: 'title', label: 'Titre', placeholder: '{{dossier.title}}', example: 'Litige commercial', entities: ['dossier'] },
      { key: 'description', label: 'Description', placeholder: '{{dossier.description}}', example: 'Litige contractuel', entities: ['dossier'] },
      { key: 'category', label: 'Catégorie', placeholder: '{{dossier.category}}', example: 'Commercial', entities: ['dossier'] },
      { key: 'phase', label: 'Phase', placeholder: '{{dossier.phase}}', example: 'Instruction', entities: ['dossier'] },
      { key: 'adversary_name', label: "Nom de l'adversaire", placeholder: '{{dossier.adversary_name}}', example: 'Société ABC SARL', entities: ['dossier'] },
      { key: 'adversary_party', label: 'Partie adverse', placeholder: '{{dossier.adversary_party}}', example: 'ABC SARL', entities: ['dossier'] },
      { key: 'adversary_lawyer', label: 'Avocat adverse', placeholder: '{{dossier.adversary_lawyer}}', example: 'Me Youssef', entities: ['dossier'] },
      { key: 'estimated_value', label: 'Valeur estimée', placeholder: '{{dossier.estimated_value}}', example: '25000', entities: ['dossier'] },
      { key: 'court_reference', label: 'Référence tribunal', placeholder: '{{dossier.court_reference}}', example: 'TPI-2024-118', entities: ['dossier'] },
      { key: 'assigned_lawyer', label: 'Avocat assigné', placeholder: '{{dossier.assigned_lawyer}}', example: 'Me Karim Mansour', entities: ['dossier'] },
      { key: 'status', label: 'Statut', placeholder: '{{dossier.status}}', example: 'open', entities: ['dossier'] },
      { key: 'priority', label: 'Priorité', placeholder: '{{dossier.priority}}', example: 'medium', entities: ['dossier'] },
      { key: 'opened_at', label: 'Ouvert le', placeholder: '{{dossier.opened_at}}', example: '2024-02-10', entities: ['dossier'] },
      { key: 'next_deadline', label: 'Prochaine échéance', placeholder: '{{dossier.next_deadline}}', example: '2024-03-15', entities: ['dossier'] },
      { key: 'closed_at', label: 'Clôturé le', placeholder: '{{dossier.closed_at}}', example: '2024-08-30', entities: ['dossier'] },
      { key: 'created_at', label: 'Créé le', placeholder: '{{dossier.created_at}}', example: '2024-02-10 09:30', entities: ['dossier'] },
      { key: 'updated_at', label: 'Mis à jour le', placeholder: '{{dossier.updated_at}}', example: '2024-02-20 14:30', entities: ['dossier'] },
      { key: 'imported', label: 'Importé', placeholder: '{{dossier.imported}}', example: '1', entities: ['dossier'] },
      { key: 'validated', label: 'Validé', placeholder: '{{dossier.validated}}', example: '1', entities: ['dossier'] },
      { key: 'import_source', label: "Source d'import", placeholder: '{{dossier.import_source}}', example: 'CSV', entities: ['dossier'] },
      { key: 'imported_at', label: 'Importé le', placeholder: '{{dossier.imported_at}}', example: '2024-02-01 08:00', entities: ['dossier'] },
      { key: 'deleted_at', label: 'Supprimé le', placeholder: '{{dossier.deleted_at}}', example: '2024-09-01 11:00', entities: ['dossier'] },
    ],
  },
  proces: {
    label: 'Procès',
    icon: 'fa-gavel',
    fields: [
      { key: 'id', label: 'ID procès', placeholder: '{{proces.id}}', example: '58', entities: ['proces', 'session'] },
      { key: 'reference', label: 'Référence', placeholder: '{{proces.reference}}', example: 'PRO-2024-015', entities: ['proces', 'session'] },
      { key: 'case_number', label: 'Numéro de procès', placeholder: '{{proces.case_number}}', example: 'CASE-2024-017', entities: ['proces', 'session'] },
      { key: 'dossier_id', label: 'ID dossier', placeholder: '{{proces.dossier_id}}', example: '42', entities: ['proces', 'session'] },
      { key: 'title', label: 'Titre', placeholder: '{{proces.title}}', example: 'Litige contractuel', entities: ['proces', 'session'] },
      { key: 'description', label: 'Description', placeholder: '{{proces.description}}', example: 'Demande de réparation', entities: ['proces', 'session'] },
      { key: 'adversary_name', label: "Nom de l'adversaire", placeholder: '{{proces.adversary_name}}', example: 'Société ABC SARL', entities: ['proces', 'session'] },
      { key: 'adversary', label: 'Adversaire', placeholder: '{{proces.adversary}}', example: 'ABC SARL', entities: ['proces', 'session'] },
      { key: 'adversary_party', label: 'Partie adverse', placeholder: '{{proces.adversary_party}}', example: 'ABC SARL', entities: ['proces', 'session'] },
      { key: 'adversary_lawyer', label: 'Avocat adverse', placeholder: '{{proces.adversary_lawyer}}', example: 'Me Youssef', entities: ['proces', 'session'] },
      { key: 'court', label: 'Tribunal', placeholder: '{{proces.court}}', example: 'Tribunal de Tunis', entities: ['proces', 'session'] },
      { key: 'filing_date', label: 'Date de dépôt', placeholder: '{{proces.filing_date}}', example: '2024-01-12', entities: ['proces', 'session'] },
      { key: 'next_hearing', label: 'Prochaine audience', placeholder: '{{proces.next_hearing}}', example: '2024-03-05', entities: ['proces', 'session'] },
      { key: 'judgment_number', label: 'Numéro de jugement', placeholder: '{{proces.judgment_number}}', example: 'JUG-2024-0789', entities: ['proces', 'session'] },
      { key: 'judgment_date', label: 'Date de jugement', placeholder: '{{proces.judgment_date}}', example: '2024-04-20', entities: ['proces', 'session'] },
      { key: 'reference_number', label: 'Référence tribunal', placeholder: '{{proces.reference_number}}', example: 'REF-2024-118', entities: ['proces', 'session'] },
      { key: 'status', label: 'Statut', placeholder: '{{proces.status}}', example: 'open', entities: ['proces', 'session'] },
      { key: 'priority', label: 'Priorité', placeholder: '{{proces.priority}}', example: 'medium', entities: ['proces', 'session'] },
      { key: 'opened_at', label: 'Ouvert le', placeholder: '{{proces.opened_at}}', example: '2024-01-10', entities: ['proces', 'session'] },
      { key: 'closed_at', label: 'Clôturé le', placeholder: '{{proces.closed_at}}', example: '2024-08-30', entities: ['proces', 'session'] },
      { key: 'created_at', label: 'Créé le', placeholder: '{{proces.created_at}}', example: '2024-01-10 09:30', entities: ['proces', 'session'] },
      { key: 'updated_at', label: 'Mis à jour le', placeholder: '{{proces.updated_at}}', example: '2024-02-20 14:30', entities: ['proces', 'session'] },
      { key: 'imported', label: 'Importé', placeholder: '{{proces.imported}}', example: '1', entities: ['proces', 'session'] },
      { key: 'validated', label: 'Validé', placeholder: '{{proces.validated}}', example: '1', entities: ['proces', 'session'] },
      { key: 'import_source', label: "Source d'import", placeholder: '{{proces.import_source}}', example: 'CSV', entities: ['proces', 'session'] },
      { key: 'imported_at', label: 'Importé le', placeholder: '{{proces.imported_at}}', example: '2024-01-01 08:00', entities: ['proces', 'session'] },
      { key: 'deleted_at', label: 'Supprimé le', placeholder: '{{proces.deleted_at}}', example: '2024-09-01 11:00', entities: ['proces', 'session'] },
    ],
  },
  court: {
    label: 'Tribunal',
    icon: 'fa-landmark',
    fields: [
      { key: 'name', label: 'Nom', placeholder: '{{court.name}}', example: 'Tribunal de Première Instance de Tunis', entities: ['dossier', 'proces', 'session'] },
      { key: 'address', label: 'Adresse', placeholder: '{{court.address}}', example: '12 Rue de la Justice', entities: ['dossier', 'proces', 'session'] },
      { key: 'city', label: 'Ville', placeholder: '{{court.city}}', example: 'Tunis', entities: ['dossier', 'proces', 'session'] },
    ],
  },
  lawyer: {
    label: 'Avocat',
    icon: 'fa-user-tie',
    fields: [
      { key: 'name', label: 'Nom complet', placeholder: '{{lawyer.name}}', example: 'Maître Karim Mansour', entities: ['dossier', 'proces', 'session'] },
      { key: 'title', label: 'Titre', placeholder: '{{lawyer.title}}', example: 'Avocat à la Cour', entities: ['dossier', 'proces', 'session'] },
      { key: 'firm_name', label: 'Nom du cabinet', placeholder: '{{lawyer.firm_name}}', example: 'Cabinet Mansour & Associés', entities: ['dossier', 'proces', 'session'] },
      { key: 'office_name', label: 'Nom du bureau', placeholder: '{{lawyer.office_name}}', example: 'Bureau Principal', entities: ['dossier', 'proces', 'session'] },
      { key: 'office_address', label: 'Adresse du bureau', placeholder: '{{lawyer.office_address}}', example: '45 Avenue Habib Bourguiba', entities: ['dossier', 'proces', 'session'] },
      { key: 'phone', label: 'Téléphone', placeholder: '{{lawyer.phone}}', example: '+216 71 123 456', entities: ['dossier', 'proces', 'session'] },
      { key: 'fax', label: 'Fax', placeholder: '{{lawyer.fax}}', example: '+216 71 123 457', entities: ['dossier', 'proces', 'session'] },
      { key: 'mobile', label: 'Mobile', placeholder: '{{lawyer.mobile}}', example: '+216 98 765 432', entities: ['dossier', 'proces', 'session'] },
      { key: 'email', label: 'Email', placeholder: '{{lawyer.email}}', example: 'contact@cabinet-mansour.tn', entities: ['dossier', 'proces', 'session'] },
      { key: 'bar_id', label: 'N° Barreau', placeholder: '{{lawyer.bar_id}}', example: 'BAR-TUN-2015-1234', entities: ['dossier', 'proces', 'session'] },
      { key: 'vpa', label: 'VPA', placeholder: '{{lawyer.vpa}}', example: 'VPA-2020-5678', entities: ['dossier', 'proces', 'session'] },
    ],
  },
  session: {
    label: 'Audience / Session',
    icon: 'fa-calendar',
    fields: [
      { key: 'id', label: 'ID audience', placeholder: '{{session.id}}', example: '91', entities: ['session'] },
      { key: 'title', label: 'Titre', placeholder: '{{session.title}}', example: 'Audience de conciliation', entities: ['session'] },
      { key: 'session_type', label: "Type d'audience", placeholder: '{{session.session_type}}', example: 'hearing', entities: ['session'] },
      { key: 'status', label: 'Statut', placeholder: '{{session.status}}', example: 'scheduled', entities: ['session'] },
      { key: 'scheduled_at', label: 'Planifiée le', placeholder: '{{session.scheduled_at}}', example: '2024-03-15 09:30', entities: ['session'] },
      { key: 'session_date', label: 'Date de session', placeholder: '{{session.session_date}}', example: '2024-03-15', entities: ['session'] },
      { key: 'duration', label: 'Durée', placeholder: '{{session.duration}}', example: '01:30', entities: ['session'] },
      { key: 'location', label: 'Lieu', placeholder: '{{session.location}}', example: 'Palais de justice de Tunis', entities: ['session'] },
      { key: 'court_room', label: 'Salle', placeholder: '{{session.court_room}}', example: 'Salle 3', entities: ['session'] },
      { key: 'judge', label: 'Juge', placeholder: '{{session.judge}}', example: 'Mme Ben Ali', entities: ['session'] },
      { key: 'outcome', label: 'Résultat', placeholder: '{{session.outcome}}', example: 'Renvoi', entities: ['session'] },
      { key: 'description', label: 'Description', placeholder: '{{session.description}}', example: 'Audience de renvoi', entities: ['session'] },
      { key: 'notes', label: 'Notes', placeholder: '{{session.notes}}', example: 'Préparer le dossier', entities: ['session'] },
      { key: 'participants', label: 'Participants', placeholder: '{{session.participants}}', example: 'Client, Avocat, Juge', entities: ['session'] },
      { key: 'dossier_id', label: 'ID dossier', placeholder: '{{session.dossier_id}}', example: '42', entities: ['session'] },
      { key: 'case_id', label: 'ID procès', placeholder: '{{session.case_id}}', example: '58', entities: ['session'] },
      { key: 'created_at', label: 'Créée le', placeholder: '{{session.created_at}}', example: '2024-03-01 10:00', entities: ['session'] },
      { key: 'updated_at', label: 'Mise à jour le', placeholder: '{{session.updated_at}}', example: '2024-03-10 15:10', entities: ['session'] },
      { key: 'imported', label: 'Importée', placeholder: '{{session.imported}}', example: '1', entities: ['session'] },
      { key: 'validated', label: 'Validée', placeholder: '{{session.validated}}', example: '1', entities: ['session'] },
      { key: 'import_source', label: "Source d'import", placeholder: '{{session.import_source}}', example: 'CSV', entities: ['session'] },
      { key: 'imported_at', label: 'Importée le', placeholder: '{{session.imported_at}}', example: '2024-03-01 08:00', entities: ['session'] },
      { key: 'deleted_at', label: 'Supprimée le', placeholder: '{{session.deleted_at}}', example: '2024-09-01 11:00', entities: ['session'] },
      { key: 'date', label: 'Date (raccourci)', placeholder: '{{session.date}}', example: '15/03/2024', entities: ['dossier', 'proces', 'session'] },
    ],
  },
  financial_entry: {
    label: 'Entrées financières',
    icon: 'fa-coins',
    fields: [
      { key: 'id', label: 'ID entrée', placeholder: '{{financial_entry.id}}', example: '120', entities: ['dossier', 'proces', 'session'] },
      { key: 'scope', label: 'Portée', placeholder: '{{financial_entry.scope}}', example: 'client', entities: ['dossier', 'proces', 'session'] },
      { key: 'client_id', label: 'ID client', placeholder: '{{financial_entry.client_id}}', example: '123', entities: ['dossier', 'proces', 'session'] },
      { key: 'dossier_id', label: 'ID dossier', placeholder: '{{financial_entry.dossier_id}}', example: '42', entities: ['dossier', 'proces', 'session'] },
      { key: 'case_id', label: 'ID procès', placeholder: '{{financial_entry.case_id}}', example: '58', entities: ['dossier', 'proces', 'session'] },
      { key: 'mission_id', label: 'ID mission', placeholder: '{{financial_entry.mission_id}}', example: '7', entities: ['dossier', 'proces', 'session'] },
      { key: 'task_id', label: 'ID tâche', placeholder: '{{financial_entry.task_id}}', example: '19', entities: ['dossier', 'proces', 'session'] },
      { key: 'personal_task_id', label: 'ID tâche personnelle', placeholder: '{{financial_entry.personal_task_id}}', example: '5', entities: ['dossier', 'proces', 'session'] },
      { key: 'entry_type', label: "Type d'entrée", placeholder: '{{financial_entry.entry_type}}', example: 'income', entities: ['dossier', 'proces', 'session'] },
      { key: 'status', label: 'Statut', placeholder: '{{financial_entry.status}}', example: 'confirmed', entities: ['dossier', 'proces', 'session'] },
      { key: 'category', label: 'Catégorie', placeholder: '{{financial_entry.category}}', example: 'honoraires', entities: ['dossier', 'proces', 'session'] },
      { key: 'amount', label: 'Montant', placeholder: '{{financial_entry.amount}}', example: '1500', entities: ['dossier', 'proces', 'session'] },
      { key: 'currency', label: 'Devise', placeholder: '{{financial_entry.currency}}', example: '', entities: ['dossier', 'proces', 'session'] },
      { key: 'occurred_at', label: 'Date opération', placeholder: '{{financial_entry.occurred_at}}', example: '2024-03-10 10:00', entities: ['dossier', 'proces', 'session'] },
      { key: 'due_date', label: "Date d'échéance", placeholder: '{{financial_entry.due_date}}', example: '2024-03-20', entities: ['dossier', 'proces', 'session'] },
      { key: 'paid_at', label: 'Payée le', placeholder: '{{financial_entry.paid_at}}', example: '2024-03-15', entities: ['dossier', 'proces', 'session'] },
      { key: 'title', label: 'Titre', placeholder: '{{financial_entry.title}}', example: 'Honoraires', entities: ['dossier', 'proces', 'session'] },
      { key: 'description', label: 'Description', placeholder: '{{financial_entry.description}}', example: 'Facture mars', entities: ['dossier', 'proces', 'session'] },
      { key: 'reference', label: 'Référence', placeholder: '{{financial_entry.reference}}', example: 'FIN-2024-011', entities: ['dossier', 'proces', 'session'] },
      { key: 'notes', label: 'Notes', placeholder: '{{financial_entry.notes}}', example: 'À régler', entities: ['dossier', 'proces', 'session'] },
      { key: 'direction', label: 'Sens', placeholder: '{{financial_entry.direction}}', example: 'receivable', entities: ['dossier', 'proces', 'session'] },
      { key: 'cancelled_at', label: 'Annulée le', placeholder: '{{financial_entry.cancelled_at}}', example: '2024-04-01', entities: ['dossier', 'proces', 'session'] },
      { key: 'cancellation_reason', label: "Motif d'annulation", placeholder: '{{financial_entry.cancellation_reason}}', example: 'Erreur de saisie', entities: ['dossier', 'proces', 'session'] },
      { key: 'created_at', label: 'Créée le', placeholder: '{{financial_entry.created_at}}', example: '2024-03-01 09:00', entities: ['dossier', 'proces', 'session'] },
      { key: 'updated_at', label: 'Mise à jour le', placeholder: '{{financial_entry.updated_at}}', example: '2024-03-12 11:30', entities: ['dossier', 'proces', 'session'] },
      { key: 'imported', label: 'Importée', placeholder: '{{financial_entry.imported}}', example: '0', entities: ['dossier', 'proces', 'session'] },
      { key: 'validated', label: 'Validée', placeholder: '{{financial_entry.validated}}', example: '1', entities: ['dossier', 'proces', 'session'] },
      { key: 'import_source', label: "Source d'import", placeholder: '{{financial_entry.import_source}}', example: 'CSV', entities: ['dossier', 'proces', 'session'] },
      { key: 'imported_at', label: 'Importée le', placeholder: '{{financial_entry.imported_at}}', example: '2024-03-01 08:00', entities: ['dossier', 'proces', 'session'] },
      { key: 'deleted_at', label: 'Supprimée le', placeholder: '{{financial_entry.deleted_at}}', example: '2024-09-01 11:00', entities: ['dossier', 'proces', 'session'] },
    ],
  },
  adversary: {
    label: 'Partie adverse',
    icon: 'fa-users',
    fields: [
      { key: 'name', label: 'Nom', placeholder: '{{adversary.name}}', example: 'Société ABC SARL', entities: ['dossier', 'proces', 'session'] },
    ],
  },
  judgment: {
    label: 'Jugement',
    icon: 'fa-balance-scale',
    fields: [
      { key: 'number', label: 'Numéro', placeholder: '{{judgment.number}}', example: 'JUG-2024-0789', entities: ['proces', 'session'] },
      { key: 'date', label: 'Date', placeholder: '{{judgment.date}}', example: '20/04/2024', entities: ['proces', 'session'] },
    ],
  },
  document: {
    label: 'Document',
    icon: 'fa-file-alt',
    fields: [
      { key: 'copy_type', label: 'Type de copie', placeholder: '{{document.copy_type}}', example: 'Copie certifiée conforme', entities: ['dossier', 'proces', 'session'] },
    ],
  },
  today: {
    label: 'Dates',
    icon: 'fa-calendar-day',
    fields: [
      { key: 'date', label: "Date d'aujourd'hui", placeholder: '{{today.date}}', example: '10/01/2024', entities: ['dossier', 'proces', 'session'] },
    ],
  },
};

/**
 * Field Picker Component - Displays fields grouped by category with copy functionality
 */
function FieldPicker({ entityType, showToast }) {
  const { currency } = useSettings();
  const [copiedField, setCopiedField] = useState(null);
  const [copiedGroup, setCopiedGroup] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(() => new Set());

  const fieldDefinitions = useMemo(() => {
    const definitions = JSON.parse(JSON.stringify(FIELD_DEFINITIONS));
    const currencyField = definitions.financial_entry?.fields?.find(
      (field) => field.key === "currency"
    );
    if (currencyField) {
      currencyField.example = currency;
    }
    return definitions;
  }, [currency]);

  useEffect(() => {
    setExpandedCategories(new Set());
  }, [entityType]);

  const handleCopyField = async (field) => {
    try {
      await navigator.clipboard.writeText(field.placeholder);
      setCopiedField(field.key + field.placeholder);
      showToast('Champ copié ! Collez-le dans votre document Word.', 'success');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      showToast('Erreur lors de la copie', 'error');
    }
  };

  const handleCopyCategory = async (category) => {
    const placeholders = category.fields.map((field) => field.placeholder).join('\n');
    try {
      await navigator.clipboard.writeText(placeholders);
      setCopiedGroup(category.key);
      showToast('Groupe de champs copié ! Collez-les dans votre document Word.', 'success');
      setTimeout(() => setCopiedGroup(null), 2000);
    } catch {
      showToast('Erreur lors de la copie', 'error');
    }
  };

  const handleCopyAll = async (categories) => {
    const placeholders = categories.flatMap((category) => category.fields.map((field) => field.placeholder));
    try {
      await navigator.clipboard.writeText(placeholders.join('\n'));
      setCopiedAll(true);
      showToast('Tous les champs ont été copiés.', 'success');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      showToast('Erreur lors de la copie', 'error');
    }
  };

  const toggleCategory = (categoryKey) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  };

  // Filter categories based on entity type
  const getVisibleCategories = () => {
    const categories = [];
    Object.entries(fieldDefinitions).forEach(([key, category]) => {
      const visibleFields = category.fields.filter(f => f.entities.includes(entityType));
      if (visibleFields.length > 0) {
        categories.push({ ...category, key, fields: visibleFields });
      }
    });
    return categories;
  };

  const visibleCategories = getVisibleCategories();
  const totalFields = visibleCategories.reduce((sum, category) => sum + category.fields.length, 0);
  const allExpanded = visibleCategories.length > 0 && visibleCategories.every((category) => expandedCategories.has(category.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {totalFields} champs disponibles
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (allExpanded) {
                setExpandedCategories(new Set());
              } else {
                setExpandedCategories(new Set(visibleCategories.map((category) => category.key)));
              }
            }}
            className="px-3 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            {allExpanded ? 'Tout replier' : 'Tout déplier'}
          </button>
          <button
            type="button"
            onClick={() => handleCopyAll(visibleCategories)}
            className={`px-3 py-1 text-xs rounded transition-all flex items-center gap-1 ${
              copiedAll
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
            }`}
          >
            <i className={`fas ${copiedAll ? 'fa-check' : 'fa-copy'} text-xs`}></i>
            {copiedAll ? 'Copié' : 'Copier tout'}
          </button>
        </div>
      </div>
      {visibleCategories.map((category) => (
        <div key={category.key} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {/* Category Header */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => toggleCategory(category.key)}
                className="flex items-center gap-2 text-left flex-1 min-w-0"
                aria-expanded={expandedCategories.has(category.key)}
              >
                <i className={`fas ${category.icon} text-slate-500 dark:text-slate-400 text-sm`}></i>
                <span className="font-medium text-slate-700 dark:text-slate-300 text-sm truncate">{category.label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-2 py-0.5 rounded">
                  {category.fields.length}
                </span>
                <i className={`fas ${expandedCategories.has(category.key) ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs text-slate-400`}></i>
              </button>
              <button
                type="button"
                onClick={() => handleCopyCategory(category)}
                className={`px-3 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                  copiedGroup === category.key
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                }`}
                title={`Copier tous les champs ${category.label}`}
              >
                <i className={`fas ${copiedGroup === category.key ? 'fa-check' : 'fa-layer-group'} text-xs`}></i>
                {copiedGroup === category.key ? 'Copié' : 'Copier le groupe'}
              </button>
            </div>
          </div>
          {/* Fields */}
          {expandedCategories.has(category.key) && (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {category.fields.map((field) => {
                const isCopied = copiedField === field.key + field.placeholder;
                return (
                  <div
                    key={field.key}
                    className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{field.label}</span>
                      {/* Tooltip with example */}
                      <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                        Ex: {field.example}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyField(field)}
                      className={`ml-2 px-3 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                        isCopied
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                      }`}
                      title={`Copier le champ "${field.label}"`}
                    >
                      <i className={`fas ${isCopied ? 'fa-check' : 'fa-copy'} text-xs`}></i>
                      {isCopied ? 'Copié' : 'Copier'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Template Creation/Edit Modal
 */
function TemplateModal({ template, onClose, onSave }) {
  const { showToast } = useToast();
  const isEdit = !!template;
  const entityTypeLabels = {
    dossier: 'Dossier',
    proces: 'Procès',
    session: 'Audience',
  };

  const [formData, setFormData] = useState({
    name: template?.name || '',
    entity_type: template?.entity_type || 'dossier',
    language: template?.language || 'fr',
    file: null,
  });

  const [validation, setValidation] = useState(null);

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4 pb-4 pt-0">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {isEdit ? 'Modifier le modèle' : 'Nouveau modèle de document'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Créez un modèle Word avec des champs dynamiques
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Two-Panel Content */}
        <div className="flex-1 flex min-h-0">
          {/* Left Panel - Configuration (Fixed) */}
          <div className="w-80 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col">
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Section Title */}
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Configuration
              </h4>

              {/* Template Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nom du modèle *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Demande d'extraction"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Entity Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Type d'entité *
                </label>
                <select
                  value={formData.entity_type}
                  onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="dossier">Dossier</option>
                  <option value="proces">Procès</option>
                  <option value="session">Audience</option>
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Langue *
                </label>
                <select
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                </select>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Fichier template
                </h4>

                {/* File Upload Zone */}
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <i className="fas fa-file-word text-2xl text-slate-400 dark:text-slate-500 mb-2"></i>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {formData.file ? (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{formData.file.name}</span>
                    ) : (
                      <>Glissez votre fichier <strong>.docx</strong> ici</>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">ou cliquez pour parcourir</p>
                </div>

                {template?.file_path && !formData.file && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
                    <i className="fas fa-paperclip"></i>
                    Actuel: {template.file_path.split('/').pop()}
                  </p>
                )}

                {/* Validation Result */}
                {validation && (
                  <div className={`mt-3 p-2 rounded-lg text-xs ${
                    validation.valid
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                  }`}>
                    <i className={`fas ${validation.valid ? 'fa-check-circle' : 'fa-exclamation-triangle'} mr-1`}></i>
                    {validation.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Placeholder Browser (Scrollable) */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Panel Header - Sticky */}
            <div className="flex-shrink-0 px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <i className="fas fa-th-list text-blue-500"></i>
                  Champs disponibles
                </h4>
                <span className="text-xs font-medium text-white bg-blue-600 px-2 py-1 rounded">
                  {entityTypeLabels[formData.entity_type] || formData.entity_type}
                </span>
              </div>
            </div>

            {/* Scrollable Placeholder List */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Tip */}
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <i className="fas fa-hand-pointer mr-2 text-blue-500"></i>
                  <strong>Astuce :</strong> Cliquez sur un champ pour le copier, puis collez-le dans votre document Word. Les champs doivent être en texte brut, sans mise en forme.
                </p>
              </div>

              {/* Field Picker Component */}
              <FieldPicker entityType={formData.entity_type} showToast={showToast} />
            </div>
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
          >
            <i className={`fas ${isEdit ? 'fa-save' : 'fa-plus'}`}></i>
            {isEdit ? 'Enregistrer' : 'Créer le modèle'}
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
}

