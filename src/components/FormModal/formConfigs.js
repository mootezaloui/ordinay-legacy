/**
 * formConfigs_UPDATED.js
 * Updated form configurations with proper relationship fields
 *
 * KEY CHANGES:
 * - Added relationship dropdowns (clientId, dossierId, caseId)
 * - Options will be populated dynamically from mockData
 * - Forms now properly handle entity relationships
 */

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
    // ✅ RELATIONSHIP FIELD - Client
    name: "clientId",
    label: "Client",
    type: "select",
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
    defaultValue: "Ouvert",
    options: [
      { value: "Ouvert", label: "Ouvert" },
      { value: "En attente", label: "En attente" },
      { value: "Fermé", label: "Fermé" },
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
    label: "Numéro de procès",
    type: "text",
    placeholder: "PRO-2024-001",
    required: true,
    helpText: "Format: PRO-ANNÉE-NUMÉRO",
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
    // ✅ RELATIONSHIP FIELD - Dossier
    name: "dossierId",
    label: "Dossier",
    type: "select",
    required: true,
    options: [], // ← Will be populated dynamically with mockDossiers
    helpText: "Sélectionner le dossier concerné",
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
    type: "select",
    required: true,
    defaultValue: "En cours",
    options: [
      { value: "En cours", label: "En cours" },
      { value: "En attente", label: "En attente" },
      { value: "Suspendu", label: "Suspendu" },
      { value: "Terminé", label: "Terminé" },
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
    // ✅ RELATIONSHIP FIELD - Procès (Optional for Consultations)
    name: "caseId",
    label: "Procès",
    type: "select",
    required: false, // ← Optional because consultations don't need a procès
    options: [], // ← Will be populated dynamically with mockCases
    helpText: "Sélectionner le procès concerné (optionnel pour consultations)",
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
    type: "time",
    required: true,
    helpText: "Sélectionnez l'heure de début",
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
    type: "select",
    required: true,
    defaultValue: "Programmée",
    options: [
      { value: "Programmée", label: "Programmée" },
      { value: "Confirmée", label: "Confirmée" },
      { value: "En attente", label: "En attente" },
      { value: "Terminée", label: "Terminée" },
      { value: "Annulée", label: "Annulée" },
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
    // ✅ RELATIONSHIP FIELD - Dossier
    name: "dossierId",
    label: "Dossier",
    type: "select",
    required: true,
    options: [], // ← Will be populated dynamically with mockDossiers
  },
  {
    name: "assignedTo",
    label: "Assigné à",
    type: "select",
    required: true,
    options: [
      { value: "Me. Hammami", label: "Me. Mohamed Hammami" },
      { value: "Me. Sassi", label: "Me. Asma Sassi" },
      { value: "Me. Cherif", label: "Me. Karim Cherif" },
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
  {
    name: "estimatedTime",
    label: "Temps estimé",
    type: "text",
    placeholder: "Ex: 2h",
    required: false,
  },
];

// ========================================
// OFFICER (HUISSIER) ASSIGNMENT FORM
// ========================================

export const officerAssignmentFormFields = [
  {
    // ✅ RELATIONSHIP FIELD - Officer
    name: "officerId",
    label: "Huissier",
    type: "select",
    required: true,
    options: [], // ← Will be populated dynamically with mockOfficers
  },
  {
    name: "entityType",
    label: "Type d'entité",
    type: "select",
    required: true,
    options: [
      { value: "dossier", label: "Dossier" },
      { value: "case", label: "Procès" },
    ],
    helpText: "Assigner à un dossier ou un procès",
  },
  {
    // ✅ CONDITIONAL RELATIONSHIP FIELD
    name: "entityId",
    label: "Dossier/Procès",
    type: "select",
    required: true,
    options: [], // ← Will be populated dynamically based on entityType
    helpText: "Sélectionner l'entité à assigner",
  },
  {
    name: "taskType",
    label: "Type de mission",
    type: "select",
    required: true,
    options: [
      { value: "Signification", label: "Signification" },
      { value: "Exécution", label: "Exécution" },
      { value: "Constat", label: "Constat" },
      { value: "Saisie", label: "Saisie" },
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
    name: "status",
    label: "Statut",
    type: "select",
    required: true,
    defaultValue: "Programmée",
    options: [
      { value: "Programmée", label: "Programmée" },
      { value: "En cours", label: "En cours" },
      { value: "Terminée", label: "Terminée" },
      { value: "Annulée", label: "Annulée" },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Notes sur la mission...",
    required: false,
    fullWidth: true,
    rows: 3,
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
    type: "select",
    required: true,
    options: [], // ← Will be populated dynamically with mockClients
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (optional)
    name: "dossierId",
    label: "Dossier (optionnel)",
    type: "select",
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
    type: "select",
    required: true,
    defaultValue: "En attente",
    options: [
      { value: "Payée", label: "Payée" },
      { value: "En attente", label: "En attente" },
      { value: "En retard", label: "En retard" },
      { value: "Annulée", label: "Annulée" },
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
    invoice: invoiceFormFields,
    officerAssignment: officerAssignmentFormFields,
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
    invoice: isEdit ? "Modifier Facture" : "Nouvelle Facture",
    officerAssignment: isEdit ? "Modifier Mission" : "Assigner Huissier",
  };

  return titles[entityType] || "Formulaire";
}

/**
 * Populate relationship dropdowns dynamically
 * This function should be called before opening the form modal
 */
export function populateRelationshipOptions(fields, data) {
  const { clients, dossiers, cases, officers } = data;

  return fields.map((field) => {
    if (field.name === "clientId" && clients) {
      return {
        ...field,
        options: clients.map((c) => ({ value: c.id, label: c.name })),
      };
    }
    if (field.name === "dossierId" && dossiers) {
      return {
        ...field,
        options: dossiers.map((d) => ({
          value: d.id,
          label: `${d.caseNumber} - ${d.title}`,
        })),
      };
    }
    if (field.name === "caseId" && cases) {
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
          label: `${o.name} - ${o.specialization}`,
        })),
      };
    }
    return field;
  });
}
