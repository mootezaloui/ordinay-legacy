/**
 * formConfigs.js
 * Field configurations for all entity forms
 */

// ========================================
// CLIENT FORM
// ========================================

export const clientFormFields = [
  {
    name: "name",
    label: "Nom complet",
    type: "text",
    placeholder: "Ex: Ahmed Ben Ali",
    required: true,
    fullWidth: false,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "exemple@email.com",
    required: true,
    validate: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value) ? null : "Email invalide";
    },
  },
  {
    name: "phone",
    label: "Téléphone",
    type: "tel",
    placeholder: "+216 98 123 456",
    required: true,
  },
  {
    name: "alternatePhone",
    label: "Téléphone alternatif",
    type: "tel",
    placeholder: "+216 71 234 567",
    required: false,
  },
  {
    name: "cin",
    label: "CIN",
    type: "text",
    placeholder: "12345678",
    required: true,
  },
  {
    name: "dateOfBirth",
    label: "Date de naissance",
    type: "date",
    required: false,
  },
  {
    name: "address",
    label: "Adresse",
    type: "textarea",
    placeholder: "Adresse complète",
    required: false,
    fullWidth: true,
    rows: 2,
  },
  {
    name: "profession",
    label: "Profession",
    type: "text",
    placeholder: "Ex: Entrepreneur",
    required: false,
  },
  {
    name: "company",
    label: "Entreprise",
    type: "text",
    placeholder: "Nom de l'entreprise",
    required: false,
  },
  {
    name: "taxId",
    label: "Matricule Fiscal",
    type: "text",
    placeholder: "1234567X",
    required: false,
  },
  {
    name: "status",
    label: "Statut",
    type: "select",
    required: true,
    defaultValue: "Active",
    options: [
      { value: "Active", label: "Actif" },
      { value: "Inactive", label: "Inactif" },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Notes importantes sur le client...",
    required: false,
    fullWidth: true,
    rows: 3,
  },
];

// ========================================
// DOSSIER FORM
// ========================================

export const dossierFormFields = [
  {
    name: "caseNumber",
    label: "Numéro de dossier",
    type: "text",
    placeholder: "DOS-2024-001",
    required: true,
    helpText: "Format: DOS-ANNÉE-NUMÉRO",
  },
  {
    name: "title",
    label: "Titre du dossier",
    type: "text",
    placeholder: "Ex: Affaire Commerciale - Contrat",
    required: true,
    fullWidth: true,
  },
  {
    name: "clientId",
    label: "Client",
    type: "select",
    required: true,
    options: [], // Will be populated dynamically
    helpText: "Sélectionner le client concerné",
  },
  {
    name: "category",
    label: "Catégorie",
    type: "select",
    required: true,
    options: [
      { value: "Commercial", label: "Droit Commercial" },
      { value: "Famille", label: "Droit de la Famille" },
      { value: "Pénal", label: "Droit Pénal" },
      { value: "Travail", label: "Droit du Travail" },
      { value: "Immobilier", label: "Droit Immobilier" },
      { value: "Administratif", label: "Droit Administratif" },
      { value: "Autre", label: "Autre" },
    ],
  },
  {
    name: "priority",
    label: "Priorité",
    type: "select",
    required: true,
    defaultValue: "Moyenne",
    options: [
      { value: "Haute", label: "Haute" },
      { value: "Moyenne", label: "Moyenne" },
      { value: "Basse", label: "Basse" },
    ],
  },
  {
    name: "status",
    label: "Statut",
    type: "select",
    required: true,
    defaultValue: "En cours",
    options: [
      { value: "En cours", label: "En cours" },
      { value: "En attente", label: "En attente" },
      { value: "Fermé", label: "Fermé" },
    ],
  },
  {
    name: "openDate",
    label: "Date d'ouverture",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split('T')[0],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Description détaillée du dossier...",
    required: true,
    fullWidth: true,
    rows: 4,
  },
  {
    name: "adversaryParty",
    label: "Partie adverse",
    type: "text",
    placeholder: "Nom de la partie adverse",
    required: false,
  },
  {
    name: "adversaryLawyer",
    label: "Avocat adverse",
    type: "text",
    placeholder: "Me. Nom de l'avocat",
    required: false,
  },
  {
    name: "estimatedValue",
    label: "Valeur estimée",
    type: "text",
    placeholder: "Ex: 50,000 TND",
    required: false,
  },
  {
    name: "courtReference",
    label: "Référence tribunal",
    type: "text",
    placeholder: "Ex: TPI-2024-1234",
    required: false,
  },
  {
    name: "assignedLawyer",
    label: "Avocat assigné",
    type: "text",
    placeholder: "Me. Nom de l'avocat",
    required: false,
    defaultValue: "Me. Mohamed Hammami",
  },
  {
    name: "nextDeadline",
    label: "Prochaine échéance",
    type: "date",
    required: false,
  },
];

// ========================================
// TASK FORM
// ========================================

export const taskFormFields = [
  {
    name: "title",
    label: "Titre de la tâche",
    type: "text",
    placeholder: "Ex: Préparer dossier plaidoirie",
    required: true,
    fullWidth: true,
  },
  {
    name: "dossierId",
    label: "Dossier",
    type: "select",
    required: true,
    options: [], // Will be populated dynamically
  },
  {
    name: "assignedTo",
    label: "Assigné à",
    type: "select",
    required: true,
    options: [
      { value: "Me. Hammami", label: "Me. Mohamed Hammami" },
      { value: "Me. Sassi", label: "Me. Asma Sassi" },
      { value: "Stagiaire", label: "Stagiaire" },
    ],
  },
  {
    name: "dueDate",
    label: "Date d'échéance",
    type: "date",
    required: true,
  },
  {
    name: "priority",
    label: "Priorité",
    type: "select",
    required: true,
    defaultValue: "Moyenne",
    options: [
      { value: "Haute", label: "Haute" },
      { value: "Moyenne", label: "Moyenne" },
      { value: "Basse", label: "Basse" },
    ],
  },
  {
    name: "status",
    label: "Statut",
    type: "select",
    required: true,
    defaultValue: "Non commencée",
    options: [
      { value: "Non commencée", label: "Non commencée" },
      { value: "En cours", label: "En cours" },
      { value: "En attente", label: "En attente" },
      { value: "Terminée", label: "Terminée" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Description détaillée de la tâche...",
    required: false,
    fullWidth: true,
    rows: 4,
  },
];

// ========================================
// SESSION FORM
// ========================================

export const sessionFormFields = [
  {
    name: "title",
    label: "Titre de la séance",
    type: "text",
    placeholder: "Ex: Consultation Client",
    required: true,
    fullWidth: true,
  },
  {
    name: "type",
    label: "Type",
    type: "select",
    required: true,
    options: [
      { value: "Consultation", label: "Consultation" },
      { value: "Audience", label: "Audience" },
      { value: "Expertise", label: "Expertise" },
      { value: "Médiation", label: "Médiation" },
      { value: "Téléphone", label: "Téléphone" },
      { value: "Autre", label: "Autre" },
    ],
  },
  {
    name: "date",
    label: "Date",
    type: "date",
    required: true,
  },
  {
    name: "time",
    label: "Heure",
    type: "text",
    placeholder: "10:00",
    required: true,
  },
  {
    name: "duration",
    label: "Durée",
    type: "text",
    placeholder: "1h",
    required: true,
  },
  {
    name: "location",
    label: "Lieu",
    type: "text",
    placeholder: "Cabinet, Tribunal, etc.",
    required: true,
  },
  {
    name: "status",
    label: "Statut",
    type: "select",
    required: true,
    defaultValue: "Programmé",
    options: [
      { value: "Programmé", label: "Programmé" },
      { value: "Confirmé", label: "Confirmé" },
      { value: "En attente", label: "En attente" },
      { value: "Terminé", label: "Terminé" },
      { value: "Annulé", label: "Annulé" },
    ],
  },
];

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get form fields for a specific entity type
 */
export function getFormFields(entityType) {
  const fieldsMap = {
    client: clientFormFields,
    dossier: dossierFormFields,
    task: taskFormFields,
    session: sessionFormFields,
  };
  
  return fieldsMap[entityType] || [];
}

/**
 * Get form title for entity type
 */
export function getFormTitle(entityType, isEdit = false) {
  const titles = {
    client: isEdit ? "Modifier Client" : "Nouveau Client",
    dossier: isEdit ? "Modifier Dossier" : "Nouveau Dossier",
    task: isEdit ? "Modifier Tâche" : "Nouvelle Tâche",
    session: isEdit ? "Modifier Séance" : "Nouvelle Séance",
  };
  
  return titles[entityType] || "Formulaire";
}