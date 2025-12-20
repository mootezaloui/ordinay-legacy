/**
 * formConfigs_UPDATED.js
 * Updated form configurations with proper relationship fields
 *
 * KEY CHANGES:
 * - Added relationship dropdowns (clientId, dossierId, caseId)
 * - Options will be populated dynamically from mockData
 * - Forms now properly handle entity relationships
 */

import { mockDossiers, mockCases } from "../../utils/mockData";
import {
  getAllAssignees,
  addCustomAssignee,
} from "../../utils/assigneeManager";

// Default assignees that are always available
const DEFAULT_ASSIGNEES = [
  { value: "Moi-même", label: "Moi-même" },
  { value: "Stagiaire", label: "Stagiaire" },
];

// ========================================
// CLIENT FORM (No changes - clients are top level)
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
    type: "inline-status",
    required: true,
    defaultValue: "Actif",
    statusOptions: [
      { value: "Actif", label: "Actif", color: "green" },
      { value: "Inactif", label: "Inactif", color: "red" },
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
    label: "Référence / Numéro",
    type: "text",
    placeholder: "Ex: DOS-2025-001 (auto-généré si vide)",
    required: false,
    helpText:
      "Facultatif - Laissez vide pour génération automatique (DOS-ANNÉE-XXX)",
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
    // ✅ RELATIONSHIP FIELD - Client
    name: "clientId",
    label: "Client",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: true,
    options: [], // ← Will be populated dynamically with mockClients
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
      { value: "Fiscal", label: "Droit Fiscal" },
      { value: "Autre", label: "Autre" },
    ],
  },
  {
    name: "priority",
    label: "Priorité",
    type: "inline-priority",
    required: true,
    defaultValue: "Moyenne",
  },
  {
    name: "status",
    label: "Statut",
    type: "inline-status",
    required: true,
    defaultValue: "Ouvert",
    statusOptions: [
      { value: "Ouvert", label: "Ouvert", color: "green" },
      { value: "En attente", label: "En attente", color: "amber" },
      { value: "Fermé", label: "Fermé", color: "slate" },
      { value: "Suspendu", label: "Suspendu", color: "red" },
    ],
  },
  {
    name: "openDate",
    label: "Date d'ouverture",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
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
// CASE (PROCÈS) FORM
// ========================================

export const caseFormFields = [
  {
    name: "caseNumber",
    label: "Référence / Numéro",
    type: "text",
    placeholder: "Ex: PRO-2025-001 (auto-généré si vide)",
    required: false,
    helpText:
      "Facultatif - Laissez vide pour génération automatique (PRO-ANNÉE-XXX)",
  },
  {
    name: "title",
    label: "Titre du procès",
    type: "text",
    placeholder: "Ex: Litige commercial - Audience",
    required: true,
    fullWidth: true,
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (MANDATORY - every procès needs a dossier/client)
    name: "dossierId",
    label: "Dossier",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: true,
    options: [], // ← Will be populated dynamically with mockDossiers
    helpText: "Obligatoire - Chaque procès doit être lié à un dossier",
  },
  {
    name: "court",
    label: "Tribunal",
    type: "select",
    required: true,
    options: [
      {
        value: "Tribunal de première instance",
        label: "Tribunal de première instance",
      },
      { value: "Tribunal de première instance - Tunis", label: "TPI Tunis" },
      { value: "Tribunal de première instance - Ariana", label: "TPI Ariana" },
      {
        value: "Tribunal de première instance - Ben Arous",
        label: "TPI Ben Arous",
      },
      { value: "Cour d'appel", label: "Cour d'appel" },
      { value: "Cour d'Appel - Tunis", label: "Cour d'Appel Tunis" },
      { value: "Cour de cassation", label: "Cour de cassation" },
      { value: "Tribunal administratif", label: "Tribunal administratif" },
    ],
  },
  {
    name: "courtRoom",
    label: "Salle",
    type: "text",
    placeholder: "Ex: Salle 3",
    required: false,
  },
  {
    name: "judge",
    label: "Juge",
    type: "text",
    placeholder: "Nom du juge",
    required: false,
  },
  {
    name: "filingDate",
    label: "Date de dépôt",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "nextHearing",
    label: "Prochaine Audience",
    type: "date",
    required: false,
  },
  {
    name: "referenceNumber",
    label: "Numéro de référence",
    type: "text",
    placeholder: "Ex: TPI-2024-COM-1234",
    required: false,
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
    name: "status",
    label: "Statut du procès",
    type: "inline-status",
    required: true,
    defaultValue: "En cours",
    statusOptions: [
      { value: "En cours", label: "En cours", color: "blue" },
      { value: "En attente", label: "En attente", color: "amber" },
      { value: "Suspendu", label: "Suspendu", color: "orange" },
      { value: "Clos", label: "Clos", color: "slate" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Description du procès...",
    required: false,
    fullWidth: true,
    rows: 3,
  },
];

// ========================================
// SESSION (SÉANCE JUDICIAIRE) FORM
// ========================================

export const sessionFormFields = [
  {
    name: "title",
    label: "Titre de la séance",
    type: "text",
    placeholder: "Ex: Audience préliminaire",
    required: true,
    fullWidth: true,
  },
  {
    name: "type",
    label: "Type",
    type: "select",
    required: true,
    options: [
      { value: "Audience", label: "Audience" },
      { value: "Consultation", label: "Consultation" },
      { value: "Médiation", label: "Médiation" },
      { value: "Expertise", label: "Expertise" },
      { value: "Téléphone", label: "Téléphone" },
      { value: "Autre", label: "Autre" },
    ],
  },
  {
    // ✅ NEW: Choose between linking to Procès or Dossier
    name: "linkType",
    label: "Lié à",
    type: "select",
    required: true,
    defaultValue: "case",
    options: [
      { value: "case", label: "Procès" },
      { value: "dossier", label: "Dossier directement" },
    ],
    helpText:
      "Une audience peut être liée à un procès ou directement à un dossier",
    onChange: (value, formData, setFormData) => {
      // Clear the other field when type changes
      setFormData({
        ...formData,
        linkType: value,
        caseId: value === "case" ? formData.caseId : "",
        dossierId: value === "dossier" ? formData.dossierId : "",
      });
    },
  },
  {
    // ✅ RELATIONSHIP FIELD - Procès (shown when linkType is "case")
    name: "caseId",
    label: "Procès",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with mockCases
    helpText: "Sélectionner le procès concerné",
    hideIf: (formData) => formData.linkType !== "case",
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (shown when linkType is "dossier")
    name: "dossierId",
    label: "Dossier",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with mockDossiers
    helpText: "Sélectionner le dossier concerné",
    hideIf: (formData) => formData.linkType !== "dossier",
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
    type: "select",
    required: true,
    helpText: "Sélectionnez l'heure de début",
    options: [
      { value: "08:00", label: "08:00" },
      { value: "08:15", label: "08:15" },
      { value: "08:30", label: "08:30" },
      { value: "08:45", label: "08:45" },
      { value: "09:00", label: "09:00" },
      { value: "09:15", label: "09:15" },
      { value: "09:30", label: "09:30" },
      { value: "09:45", label: "09:45" },
      { value: "10:00", label: "10:00" },
      { value: "10:15", label: "10:15" },
      { value: "10:30", label: "10:30" },
      { value: "10:45", label: "10:45" },
      { value: "11:00", label: "11:00" },
      { value: "11:15", label: "11:15" },
      { value: "11:30", label: "11:30" },
      { value: "11:45", label: "11:45" },
      { value: "12:00", label: "12:00" },
      { value: "12:15", label: "12:15" },
      { value: "12:30", label: "12:30" },
      { value: "12:45", label: "12:45" },
      { value: "13:00", label: "13:00" },
      { value: "13:15", label: "13:15" },
      { value: "13:30", label: "13:30" },
      { value: "13:45", label: "13:45" },
      { value: "14:00", label: "14:00" },
      { value: "14:15", label: "14:15" },
      { value: "14:30", label: "14:30" },
      { value: "14:45", label: "14:45" },
      { value: "15:00", label: "15:00" },
      { value: "15:15", label: "15:15" },
      { value: "15:30", label: "15:30" },
      { value: "15:45", label: "15:45" },
      { value: "16:00", label: "16:00" },
      { value: "16:15", label: "16:15" },
      { value: "16:30", label: "16:30" },
      { value: "16:45", label: "16:45" },
      { value: "17:00", label: "17:00" },
      { value: "17:15", label: "17:15" },
      { value: "17:30", label: "17:30" },
      { value: "17:45", label: "17:45" },
      { value: "18:00", label: "18:00" },
    ],
  },
  {
    name: "duration",
    label: "Durée estimée",
    type: "select",
    required: true,
    defaultValue: "01:00",
    options: [
      { value: "00:15", label: "15 minutes" },
      { value: "00:30", label: "30 minutes" },
      { value: "00:45", label: "45 minutes" },
      { value: "01:00", label: "1 heure" },
      { value: "01:30", label: "1h30" },
      { value: "02:00", label: "2 heures" },
      { value: "02:30", label: "2h30" },
      { value: "03:00", label: "3 heures" },
      { value: "04:00", label: "4 heures" },
    ],
    helpText: "Durée prévue de la séance",
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
    type: "inline-status",
    required: true,
    defaultValue: "Programmée",
    statusOptions: [
      { value: "Programmée", label: "Programmée", color: "blue" },
      { value: "Confirmée", label: "Confirmée", color: "green" },
      { value: "En attente", label: "En attente", color: "amber" },
      { value: "Terminée", label: "Terminée", color: "slate" },
      { value: "Annulée", label: "Annulée", color: "red" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Description de la séance...",
    required: false,
    fullWidth: true,
    rows: 3,
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
    // ✅ PARENT TYPE - Choose between Dossier or Case
    name: "parentType",
    label: "Lié à",
    type: "select",
    required: true,
    defaultValue: "dossier",
    options: [
      { value: "dossier", label: "Dossier" },
      { value: "case", label: "Procès" },
    ],
    helpText: "Une tâche peut être liée à un dossier ou à un procès",
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (conditionally shown)
    name: "dossierId",
    label: "Dossier",
    type: "searchable-select",
    required: false, // Will be conditionally required
    // ✅ Dynamic options based on parentType
    getOptions: (formData) => {
      // Only show if parentType is 'dossier'
      if (formData.parentType !== "dossier") return [];

      // Use imported mockDossiers
      return [
        { value: "", label: "Sélectionner un dossier..." },
        ...mockDossiers.map((d) => ({
          value: d.id,
          label: `${d.caseNumber} - ${d.title}`,
        })),
      ];
    },
    options: [], // Will be populated dynamically
    // ✅ Conditional visibility
    hideIf: (formData) => formData.parentType !== "dossier",
  },
  {
    // ✅ RELATIONSHIP FIELD - Case (conditionally shown)
    name: "caseId",
    label: "Procès",
    type: "searchable-select",
    required: false, // Will be conditionally required
    // ✅ Dynamic options based on parentType
    getOptions: (formData) => {
      // Only show if parentType is 'case'
      if (formData.parentType !== "case") return [];

      // Use imported mockCases
      return [
        { value: "", label: "Sélectionner un procès..." },
        ...mockCases.map((c) => ({
          value: c.id,
          label: `${c.caseNumber} - ${c.title}`,
        })),
      ];
    },
    options: [], // Will be populated dynamically
    // ✅ Conditional visibility
    hideIf: (formData) => formData.parentType !== "case",
  },
  {
    name: "assignedTo",
    label: "Assigné à",
    type: "searchable-select",
    required: true,
    getOptions: () => getAllAssignees(DEFAULT_ASSIGNEES),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomAssignee(name);
        return true;
      } catch (error) {
        alert(error.message);
        throw error;
      }
    },
    createLabel: "Ajouter",
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
    type: "inline-priority",
    required: true,
    defaultValue: "Moyenne",
  },
  {
    name: "status",
    label: "Statut",
    type: "inline-status",
    required: true,
    defaultValue: "Non commencée",
    statusOptions: [
      { value: "Non commencée", label: "Non commencée", color: "slate" },
      { value: "En cours", label: "En cours", color: "blue" },
      { value: "En attente", label: "En attente", color: "amber" },
      { value: "Terminée", label: "Terminée", color: "green" },
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
  {
    name: "estimatedTime",
    label: "Temps estimé",
    type: "select",
    required: false,
    options: [
      { value: "0.5h", label: "30 minutes" },
      { value: "1h", label: "1 heure" },
      { value: "1.5h", label: "1h30" },
      { value: "2h", label: "2 heures" },
      { value: "3h", label: "3 heures" },
      { value: "4h", label: "4 heures" },
      { value: "6h", label: "6 heures" },
      { value: "8h", label: "8 heures" },
      { value: "12h", label: "12 heures" },
      { value: "16h", label: "16 heures" },
      { value: "20h", label: "20 heures" },
      { value: "24h", label: "1 journée" },
      { value: "40h", label: "2 jours" },
      { value: "80h", label: "1 semaine" },
    ],
    helpText: "Durée estimée pour compléter la tâche",
  },
];

// ========================================
// PERSONAL TASK FORM
// ========================================

export const personalTaskFormFields = [
  {
    name: "title",
    label: "Titre de la tâche",
    type: "text",
    placeholder: "Ex: Payer facture électricité",
    required: true,
    fullWidth: true,
  },
  {
    name: "category",
    label: "Catégorie",
    type: "select",
    required: true,
    options: [
      { value: "Factures", label: "Factures" },
      { value: "Bureau", label: "Bureau" },
      { value: "Personnel", label: "Personnel" },
      { value: "Informatique", label: "Informatique" },
      { value: "Administratif", label: "Administratif" },
      { value: "Autre", label: "Autre" },
    ],
  },
  {
    name: "dueDate",
    label: "Date limite",
    type: "date",
    required: true,
  },
  {
    name: "priority",
    label: "Priorité",
    type: "inline-priority",
    required: true,
    defaultValue: "Moyenne",
  },
  {
    name: "status",
    label: "Statut",
    type: "inline-status",
    required: true,
    defaultValue: "Non commencée",
    statusOptions: [
      { value: "Non commencée", label: "Non commencée", color: "slate" },
      { value: "En attente", label: "En attente", color: "amber" },
      { value: "En cours", label: "En cours", color: "blue" },
      { value: "Planifiée", label: "Planifiée", color: "purple" },
      { value: "Terminée", label: "Terminée", color: "green" },
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
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Notes supplémentaires...",
    required: false,
    fullWidth: true,
    rows: 3,
  },
];

// ========================================
// OFFICER (HUISSIER) ASSIGNMENT FORM
// ========================================

export const officerAssignmentFormFields = [
  {
    name: "missionNumber",
    label: "Numéro de mission",
    type: "text",
    placeholder: "MIS-2024-001",
    required: true,
    helpText: "Format: MIS-ANNÉE-NUMÉRO",
  },
  {
    name: "title",
    label: "Titre de la mission",
    type: "text",
    placeholder: "Ex: Signification acte judiciaire",
    required: true,
    fullWidth: true,
  },
  {
    // ✅ RELATIONSHIP FIELD - Officer
    name: "officerId",
    label: "Huissier",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: true,
    options: [], // ← Will be populated dynamically with mockOfficers
  },
  {
    name: "entityType",
    label: "Lié à",
    type: "select",
    required: true,
    options: [
      { value: "dossier", label: "Dossier" },
      { value: "case", label: "Procès" },
    ],
    helpText: "Cette mission concerne un dossier ou un procès",
    // ✅ This field triggers the entityReference field update
    onChange: (value, formData, setFormData) => {
      // Clear entityReference when type changes
      setFormData({
        ...formData,
        entityType: value,
        entityReference: "",
      });
    },
  },
  {
    name: "entityReference",
    label: "Référence (Dossier/Procès)",
    type: "searchable-select", // ✅ NEW: Searchable dropdown
    placeholder: "Rechercher ou saisir: DOS-2024-001 ou PRO-2024-001",
    required: true,
    helpText: "Sélectionnez dans la liste ou saisissez manuellement",
    // ✅ Dynamic options based on entityType
    getOptions: (formData) => {
      const entityType = formData.entityType;

      if (entityType === "dossier") {
        // Return dossiers from mockData - will be populated dynamically
        return []; // Placeholder, will be populated by populateRelationshipOptions
      } else if (entityType === "case") {
        // Return cases/procès from mockData - will be populated dynamically
        return []; // Placeholder, will be populated by populateRelationshipOptions
      }

      return [];
    },
  },
  {
    name: "missionType",
    label: "Type de mission",
    type: "select",
    required: true,
    options: [
      { value: "Signification", label: "Signification" },
      { value: "Exécution", label: "Exécution" },
      { value: "Constat", label: "Constat" },
      { value: "Saisie", label: "Saisie" },
      { value: "Recouvrement", label: "Recouvrement" },
      { value: "Autre", label: "Autre" },
    ],
  },
  {
    name: "assignDate",
    label: "Date d'assignation",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "dueDate",
    label: "Date d'échéance",
    type: "date",
    required: false,
    helpText: "Optionnel - date limite pour compléter la mission",
  },
  {
    name: "priority",
    label: "Priorité",
    type: "inline-priority",
    required: true,
    defaultValue: "Moyenne",
  },
  {
    name: "status",
    label: "Statut",
    type: "inline-status",
    required: true,
    defaultValue: "Programmée",
    statusOptions: [
      { value: "Programmée", label: "Programmée", color: "blue" },
      { value: "En cours", label: "En cours", color: "amber" },
      { value: "Terminée", label: "Terminée", color: "green" },
      { value: "Annulée", label: "Annulée", color: "red" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Description détaillée de la mission...",
    required: false,
    fullWidth: true,
    rows: 3,
  },
  {
    name: "result",
    label: "Résultat / Réponse",
    type: "textarea",
    placeholder: "Compte-rendu de l'huissier après exécution de la mission...",
    required: false,
    fullWidth: true,
    rows: 4,
    helpText: "Important: Enregistrer ce que l'huissier a rapporté",
  },
  {
    name: "notes",
    label: "Notes internes",
    type: "textarea",
    placeholder: "Notes internes sur cette mission...",
    required: false,
    fullWidth: true,
    rows: 2,
  },
];

// ========================================
// INVOICE FORM (for Accounting tab)
// ========================================

export const invoiceFormFields = [
  {
    name: "invoiceNumber",
    label: "Numéro de facture",
    type: "text",
    placeholder: "FACT-2024-001",
    required: true,
  },
  {
    // ✅ RELATIONSHIP FIELD - Client
    name: "clientId",
    label: "Client",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: true,
    options: [], // ← Will be populated dynamically with mockClients
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (optional)
    name: "dossierId",
    label: "Dossier (optionnel)",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with mockDossiers
    helpText: "Lier la facture à un dossier spécifique",
  },
  {
    name: "type",
    label: "Type",
    type: "select",
    required: true,
    options: [
      { value: "Honoraires", label: "Honoraires" },
      { value: "Consultation", label: "Consultation" },
      { value: "Frais", label: "Frais" },
    ],
  },
  {
    name: "amount",
    label: "Montant TTC",
    type: "text",
    placeholder: "Ex: 1,500 TND",
    required: true,
  },
  {
    name: "date",
    label: "Date d'émission",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "dueDate",
    label: "Date d'échéance",
    type: "date",
    required: true,
  },
  {
    name: "status",
    label: "Statut",
    type: "inline-status",
    required: true,
    defaultValue: "En attente",
    statusOptions: [
      { value: "Payée", label: "Payée", color: "green" },
      { value: "En attente", label: "En attente", color: "amber" },
      { value: "En retard", label: "En retard", color: "red" },
      { value: "Annulée", label: "Annulée", color: "slate" },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Notes sur la facture...",
    required: false,
    fullWidth: true,
    rows: 2,
  },
];

// ========================================
// MISSION FORM (Huissier Mission)
// ========================================

export const missionFormFields = [
  {
    name: "officerId",
    label: "Huissier",
    type: "searchable-select",
    required: true,
    placeholder: "Sélectionner un huissier...",
    options: [], // Will be populated dynamically
  },
  {
    name: "entityType",
    label: "Type d'entité",
    type: "select",
    required: true,
    disabled: true, // Will be set based on context
    options: [
      { value: "dossier", label: "Dossier" },
      { value: "case", label: "Procès" },
    ],
  },
  {
    name: "entityReference",
    label: "Référence",
    type: "text",
    required: true,
    disabled: true, // Will be pre-filled based on context
    helpText: "Référence du dossier ou procès",
  },
  {
    name: "missionNumber",
    label: "Référence / Numéro",
    type: "text",
    required: false,
    disabled: false, // Allow user input
    placeholder: "Ex: MIS-2025-001 (auto-généré si vide)",
    helpText:
      "Facultatif - Laissez vide pour génération automatique (MIS-ANNÉE-XXX)",
  },
  {
    name: "title",
    label: "Titre de la mission",
    type: "text",
    required: true,
    fullWidth: true,
    placeholder: "Ex: Signification acte judiciaire",
  },
  {
    name: "missionType",
    label: "Type de mission",
    type: "select",
    required: true,
    options: [
      { value: "Signification", label: "Signification" },
      { value: "Constat", label: "Constat" },
      { value: "Saisie", label: "Saisie" },
      { value: "Exécution", label: "Exécution" },
      { value: "Autre", label: "Autre" },
    ],
  },
  {
    name: "priority",
    label: "Priorité",
    type: "inline-priority",
    required: true,
    defaultValue: "Moyenne",
  },
  {
    name: "assignDate",
    label: "Date d'assignation",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "dueDate",
    label: "Date limite",
    type: "date",
    required: true,
  },
  {
    name: "status",
    label: "Statut",
    type: "inline-status",
    required: true,
    defaultValue: "Programmée",
    statusOptions: [
      { value: "Programmée", label: "Programmée", color: "blue" },
      { value: "En cours", label: "En cours", color: "amber" },
      { value: "Terminée", label: "Terminée", color: "green" },
      { value: "Annulée", label: "Annulée", color: "red" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    required: true,
    fullWidth: true,
    rows: 3,
    placeholder: "Description détaillée de la mission...",
  },
  {
    name: "result",
    label: "Compte Rendu / Résultat",
    type: "textarea",
    required: false,
    fullWidth: true,
    rows: 3,
    placeholder: "Compte rendu détaillé de l'exécution de la mission...",
    helpText: "À remplir une fois la mission terminée",
  },
  {
    name: "completionDate",
    label: "Date d'achèvement",
    type: "date",
    required: false,
    helpText: "Date d'achèvement de la mission (si terminée)",
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    required: false,
    fullWidth: true,
    rows: 2,
    placeholder: "Notes additionnelles...",
  },
  {
    name: "documents",
    label: "Documents",
    type: "file",
    required: false,
    fullWidth: true,
    multiple: true,
    accept:
      ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.rar,.txt",
    helpText:
      "Ajoutez des documents liés à cette mission (PDF, DOC, XLS, PPT, Images, Archives)",
  },
  {
    name: "financialEntries",
    label: "Frais d'huissier",
    type: "financial-entries",
    required: false,
    fullWidth: true,
    helpText:
      "Ajoutez les frais liés à cette mission. Ces frais seront automatiquement liés à la mission et au client.",
    // Financial entries will be an array of objects with: amount, date, description
    defaultValue: [],
  },
];

// ========================================
// FINANCIAL ENTRY FORM
// ========================================

export const financialEntryFormFields = [
  {
    name: "scope",
    label: "Portée financière",
    type: "select",
    required: true,
    defaultValue: "client",
    options: [
      { value: "client", label: "Client (affecte le solde client)" },
      { value: "internal", label: "Interne (frais de bureau)" },
    ],
    helpText:
      "Choisir 'Client' pour les opérations liées aux clients, 'Interne' pour les frais de bureau",
    onChange: (value, formData, setFormData) => {
      // Clear client/dossier/case when switching to internal
      if (value === "internal") {
        setFormData({
          ...formData,
          scope: value,
          clientId: "",
          dossierId: "",
          caseId: "",
        });
      } else {
        setFormData({
          ...formData,
          scope: value,
        });
      }
    },
  },
  {
    name: "type",
    label: "Type d'opération",
    type: "select",
    required: true,
    defaultValue: "expense",
    options: [
      { value: "revenue", label: "Recette (argent reçu)" },
      { value: "expense", label: "Dépense (argent payé)" },
    ],
    onChange: (value, formData, setFormData) => {
      // Auto-suggest category based on type
      let suggestedCategory = formData.category;
      if (value === "revenue" && formData.category === "frais_judiciaires") {
        suggestedCategory = "honoraires";
      } else if (value === "expense" && formData.category === "honoraires") {
        suggestedCategory = "frais_judiciaires";
      }
      setFormData({
        ...formData,
        type: value,
        category: suggestedCategory,
      });
    },
  },
  {
    name: "category",
    label: "Catégorie",
    type: "select",
    required: true,
    getOptions: (formData) => {
      const type = formData.type || "expense";
      const scope = formData.scope || "client";

      // Revenue categories
      if (type === "revenue") {
        return [
          { value: "honoraires", label: "Honoraires" },
          { value: "advance", label: "Avance client" },
          { value: "other", label: "Autre recette" },
        ];
      }

      // Expense categories
      if (scope === "internal") {
        return [
          { value: "frais_bureau", label: "Frais de bureau" },
          { value: "other", label: "Autre dépense" },
        ];
      }

      return [
        { value: "frais_judiciaires", label: "Frais judiciaires" },
        { value: "frais_huissier", label: "Frais d'huissier" },
        { value: "other", label: "Autre dépense" },
      ];
    },
    onChange: (value, formData, setFormData) => {
      // Clear mission when category is not frais_huissier
      if (value !== "frais_huissier") {
        setFormData({
          ...formData,
          category: value,
          missionId: "",
        });
      } else {
        setFormData({
          ...formData,
          category: value,
        });
      }
    },
  },
  {
    name: "amount",
    label: "Montant (TND)",
    type: "number",
    required: true,
    placeholder: "0.00",
    min: 0,
    step: 0.01,
    validate: (value) => {
      const amount = parseFloat(value);
      if (isNaN(amount) || amount <= 0) {
        return "Le montant doit être supérieur à 0";
      }
      return null;
    },
  },
  {
    name: "date",
    label: "Date",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "status",
    label: "Statut",
    type: "inline-status",
    required: true,
    defaultValue: "confirmed",
    statusOptions: [
      { value: "draft", label: "Brouillon", color: "slate" },
      { value: "confirmed", label: "Confirmé", color: "blue" },
      { value: "paid", label: "Payé", color: "green" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    required: true,
    fullWidth: true,
    rows: 3,
    placeholder: "Description de l'opération financière...",
  },
  {
    name: "clientId",
    label: "Client",
    type: "searchable-select",
    required: false,
    options: [], // Will be populated dynamically
    hideIf: (formData) => formData.scope === "internal",
    helpText: "Client concerné par cette opération (obligatoire si portée = Client)",
    validate: (value, formData) => {
      if (formData.scope === "client" && (!value || value === "")) {
        return "Le client est requis lorsque la portée est 'Client'.";
      }
      return null;
    },
    onChange: (value, formData, setFormData) => {
      // Clear dossier and case when client changes
      setFormData({
        ...formData,
        clientId: value,
        dossierId: "",
        caseId: "",
      });
    },
  },
  {
    name: "dossierId",
    label: "Dossier (optionnel)",
    type: "searchable-select",
    required: false,
    options: [], // Base options - will be filtered by getOptions
    getOptions: (formData, allOptions) => {
      // Filter dossiers by selected client
      const clientId = formData.clientId;
      if (!clientId || !allOptions?.dossiers) {
        return [];
      }
      return allOptions.dossiers
        .filter((d) => d.clientId === clientId)
        .map((d) => ({ value: d.id, label: `${d.caseNumber} - ${d.title}` }));
    },
    hideIf: (formData) => formData.scope === "internal",
    helpText: "Dossier concerné (optionnel)",
    onChange: (value, formData, setFormData) => {
      // Clear case when dossier changes
      setFormData({
        ...formData,
        dossierId: value,
        caseId: "",
      });
    },
  },
  {
    name: "caseId",
    label: "Procès (optionnel)",
    type: "searchable-select",
    required: false,
    options: [], // Base options - will be filtered by getOptions
    getOptions: (formData, allOptions) => {
      // Filter cases by selected client or dossier
      const clientId = formData.clientId;
      const dossierId = formData.dossierId;
      if (!allOptions?.cases) {
        return [];
      }

      let filteredCases = allOptions.cases;

      // If dossier is selected, filter by dossier
      if (dossierId) {
        filteredCases = filteredCases.filter((c) => c.dossierId === dossierId);
      } else if (clientId) {
        // If only client is selected, filter by client
        filteredCases = filteredCases.filter((c) => c.clientId === clientId);
      } else {
        return [];
      }

      return filteredCases.map((c) => ({
        value: c.id,
        label: `${c.caseNumber} - ${c.title}`,
      }));
    },
    hideIf: (formData) => formData.scope === "internal",
    helpText: "Procès concerné (optionnel)",
  },
  {
    name: "missionId",
    label: "Mission associée **",
    type: "searchable-select",
    required: false,
    options: [], // Base options - will be filtered by getOptions
    getOptions: (formData, allOptions) => {
      // Only show missions related to selected dossier or case
      const dossierId = formData.dossierId;
      const caseId = formData.caseId;

      if (!allOptions?.missions) {
        return [{ value: "", label: "Aucune mission disponible" }];
      }

      let filteredMissions = allOptions.missions;

      // Filter missions based on selected entity
      if (dossierId) {
        filteredMissions = filteredMissions.filter(
          (m) => m.entityType === "dossier" && m.entityId === dossierId
        );
      } else if (caseId) {
        filteredMissions = filteredMissions.filter(
          (m) => m.entityType === "case" && m.entityId === caseId
        );
      } else {
        // No dossier or case selected - don't show missions
        return [
          {
            value: "",
            label: "Veuillez d'abord sélectionner un dossier ou procès",
          },
        ];
      }

      if (filteredMissions.length === 0) {
        return [{ value: "", label: "Aucune mission pour ce dossier/procès" }];
      }

      return [
        { value: "", label: "Sélectionnez la mission liée à ces frais" },
        ...filteredMissions.map((m) => ({
          value: m.id,
          label: `${m.missionNumber} - ${m.title} (${
            m.officerName || "Huissier non défini"
          }) - ${m.status}`,
        })),
      ];
    },
    hideIf: (formData) =>
      formData.scope === "internal" || formData.category !== "frais_huissier",
    helpText: "Sélectionnez la mission d'huissier liée à ces frais",
    onChange: (value, formData, setFormData, allOptions) => {
      // Auto-populate description when mission is selected
      if (value && allOptions?.missions) {
        const selectedMission = allOptions.missions.find((m) => m.id === value);
        if (selectedMission && !formData.description) {
          setFormData({
            ...formData,
            missionId: value,
            description: `Frais d'huissier - ${selectedMission.missionNumber} - ${selectedMission.title}`,
          });
          return;
        }
      }
      setFormData({
        ...formData,
        missionId: value,
      });
    },
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
    case: caseFormFields,
    session: sessionFormFields,
    task: taskFormFields,
    personalTask: personalTaskFormFields,
    invoice: invoiceFormFields,
    officerAssignment: officerAssignmentFormFields,
    mission: missionFormFields,
    financialEntry: financialEntryFormFields,
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
    case: isEdit ? "Modifier Procès" : "Nouveau Procès",
    session: isEdit ? "Modifier Séance" : "Nouvelle Séance",
    task: isEdit ? "Modifier Tâche" : "Nouvelle Tâche",
    personalTask: isEdit
      ? "Modifier Tâche Personnelle"
      : "Nouvelle Tâche Personnelle",
    invoice: isEdit ? "Modifier Facture" : "Nouvelle Facture",
    officerAssignment: isEdit ? "Modifier Mission" : "Assigner Huissier",
    mission: isEdit ? "Modifier Mission Huissier" : "Nouvelle Mission Huissier",
    financialEntry: isEdit
      ? "Modifier Écriture Comptable"
      : "Nouvelle Écriture Comptable",
  };

  return titles[entityType] || "Formulaire";
}

/**
 * Populate relationship dropdowns dynamically
 * This function should be called before opening the form modal
 *
 * For fields with getOptions function, raw data is passed via allOptions
 * so the function can filter dynamically based on formData
 */
export function populateRelationshipOptions(fields, data) {
  const { clients, dossiers, cases, officers, missions } = data;

  return fields.map((field) => {
    // For fields with getOptions, pass the raw data so they can filter dynamically
    if (field.getOptions) {
      return {
        ...field,
        allOptions: { clients, dossiers, cases, officers, missions },
      };
    }

    if (field.name === "clientId" && clients) {
      return {
        ...field,
        options: clients.map((c) => ({ value: c.id, label: c.name })),
      };
    }
    if (field.name === "dossierId" && dossiers) {
      // Only populate static options if no getOptions function
      return {
        ...field,
        options: dossiers.map((d) => ({
          value: d.id,
          label: `${d.caseNumber} - ${d.title}`,
        })),
      };
    }
    if (field.name === "caseId" && cases) {
      // Only populate static options if no getOptions function
      return {
        ...field,
        options: [
          { value: null, label: "Aucun (consultation)" },
          ...cases.map((c) => ({
            value: c.id,
            label: `${c.caseNumber} - ${c.title}`,
          })),
        ],
      };
    }
    if (field.name === "officerId" && officers) {
      return {
        ...field,
        options: officers.map((o) => ({
          value: o.id,
          label: o.name,
        })),
      };
    }
    return field;
  });
}
