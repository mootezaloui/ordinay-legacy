/**
 * CLEAN MOCK DATA
 *
 * Minimal, well-structured dataset for development and testing.
 *
 * RELATIONSHIPS:
 * - Client → Dossiers (1:many)
 * - Dossier → Procès (1:many)
 * - Procès → Sessions (1:many)
 * - Dossier/Procès → Tasks (1:many)
 * - Huissier → Missions (1:many)
 * - Mission → Dossier/Procès (many:1)
 *
 * SCALE: 2 Clients, 2 Dossiers (BOTH OPEN), 2 Procès, 4 Sessions, 5 Tasks, 2 Huissiers, 2 Missions
 *
 * VALIDATION RULES:
 * ✅ All dossiers are OPEN (no closed dossiers with unpaid invoices)
 * ✅ All procès MUST have a valid dossierId
 * ✅ All tasks linked to procès ALSO include dossierId for validation
 * ✅ All invoices are PAID (no unpaid balances on any client)
 * ✅ All sessions are in the future
 * ✅ All dates respect temporal validation rules
 */

// ========================================
// CLIENTS (2)
// ========================================

export const mockClients = [
  {
    id: 1,
    name: "Ahmed Ben Ali",
    email: "ahmed.benali@email.com",
    phone: "+216 98 123 456",
    alternatePhone: "+216 71 234 567",
    status: "Active",
    joinDate: "2024-01-15",
    cin: "12345678",
    dateOfBirth: "1985-05-15",
    profession: "Entrepreneur",
    company: "Ben Ali Trading",
    taxId: "1234567A",
    address: "Avenue Habib Bourguiba, Tunis",
  },
  {
    id: 2,
    name: "Fatima Trabelsi",
    email: "fatima.trabelsi@email.com",
    phone: "+216 22 654 321",
    status: "Active",
    joinDate: "2024-02-20",
    cin: "87654321",
    dateOfBirth: "1990-08-22",
    profession: "Médecin",
    company: "Clinique Privée",
    taxId: "7654321B",
    address: "Rue de la Liberté, Ariana",
  },
];

// ========================================
// DOSSIERS (2 - BOTH OPEN)
// ========================================

export const mockDossiers = [
  {
    id: 1,
    caseNumber: "DOS-2024-001",
    title: "Affaire Commerciale",
    clientId: 1, // → Ahmed Ben Ali
    client: "Ahmed Ben Ali",
    status: "Ouvert",
    openDate: "2024-01-15",
    priority: "Haute",
    category: "Commercial",
    assignedLawyer: "Me. Hammami",
  },
  {
    id: 2,
    caseNumber: "DOS-2024-002",
    title: "Divorce Contentieux",
    clientId: 2, // → Fatima Trabelsi
    client: "Fatima Trabelsi",
    status: "Ouvert",
    openDate: "2024-02-20",
    priority: "Moyenne",
    category: "Famille",
    assignedLawyer: "Me. Sassi",
  },
];

// ========================================
// PROCÈS / CASES (2 - ALL LINKED TO DOSSIERS)
// ========================================

export const mockCases = [
  {
    id: 1,
    caseNumber: "PRO-2024-001",
    title: "Litige Commercial - TPI Tunis",
    dossierId: 1, // → DOS-2024-001 (MUST EXIST)
    dossier: "DOS-2024-001",
    court: "Tribunal de première instance - Tunis",
    nextHearing: "2026-01-20",
    status: "En cours",
    judge: "M. Kamel Gharbi",
    filingDate: "2024-02-01",
  },
  {
    id: 2,
    caseNumber: "PRO-2024-002",
    title: "Divorce - Cour d'Appel",
    dossierId: 2, // → DOS-2024-002 (MUST EXIST)
    dossier: "DOS-2024-002",
    court: "Cour d'Appel - Tunis",
    nextHearing: "2026-02-15",
    status: "En cours",
    judge: "Mme. Leila Fourati",
    filingDate: "2024-03-15",
  },
];

// ========================================
// SESSIONS (4)
// ========================================

export const mockSessions = [
  {
    id: 1,
    title: "Audience préliminaire",
    type: "Audience",
    caseId: 1, // → PRO-2024-001
    caseName: "PRO-2024-001 - Litige Commercial",
    date: "2025-12-20",
    time: "10:00",
    endTime: "11:30",
    duration: "1h30",
    location: "TPI Tunis - Salle 3",
    status: "Programmée",
  },
  {
    id: 2,
    title: "Audience de plaidoirie",
    type: "Audience",
    caseId: 1, // → PRO-2024-001
    caseName: "PRO-2024-001 - Litige Commercial",
    date: "2026-01-20",
    time: "09:00",
    endTime: "11:00",
    duration: "2h",
    location: "TPI Tunis - Salle 3",
    status: "Programmée",
  },
  {
    id: 3,
    title: "Audience de conciliation",
    type: "Audience",
    caseId: 2, // → PRO-2024-002
    caseName: "PRO-2024-002 - Divorce",
    date: "2026-02-15",
    time: "14:00",
    endTime: "15:00",
    duration: "1h",
    location: "Cour d'Appel Tunis - Salle 5",
    status: "Programmée",
  },
  {
    id: 4,
    title: "Consultation client",
    type: "Consultation",
    caseId: null, // No procès link
    caseName: null,
    date: "2025-12-22",
    time: "15:00",
    endTime: "16:00",
    duration: "1h",
    location: "Cabinet",
    status: "Confirmée",
  },
];

// ========================================
// TASKS (5 - ALL PROPERLY LINKED)
// ========================================

export const mockTasks = [
  // Tasks for Dossier 1
  {
    id: 1,
    title: "Préparer dossier plaidoirie",
    parentType: "dossier",
    dossierId: 1, // → DOS-2024-001
    caseId: null,
    dossier: "DOS-2024-001",
    assignedTo: "Me. Hammami",
    dueDate: "2025-12-15",
    status: "En cours",
    priority: "Haute",
  },
  {
    id: 2,
    title: "Réunir pièces justificatives",
    parentType: "dossier",
    dossierId: 1, // → DOS-2024-001
    caseId: null,
    dossier: "DOS-2024-001",
    assignedTo: "Me. Hammami",
    dueDate: "2025-12-18",
    status: "En cours",
    priority: "Haute",
  },
  // Task for Procès 1 (MUST INCLUDE BOTH dossierId and caseId)
  {
    id: 3,
    title: "Dépôt conclusions écrites",
    parentType: "case",
    dossierId: 1, // → DOS-2024-001 (for validation)
    caseId: 1, // → PRO-2024-001
    case: "PRO-2024-001",
    assignedTo: "Me. Hammami",
    dueDate: "2026-01-15",
    status: "Non commencée",
    priority: "Haute",
  },
  // Tasks for Dossier 2
  {
    id: 4,
    title: "Rédiger requête divorce",
    parentType: "dossier",
    dossierId: 2, // → DOS-2024-002
    caseId: null,
    dossier: "DOS-2024-002",
    assignedTo: "Me. Sassi",
    dueDate: "2026-02-10",
    status: "En attente",
    priority: "Moyenne",
  },
  // Task for Procès 2 (MUST INCLUDE BOTH dossierId and caseId)
  {
    id: 5,
    title: "Préparer audience conciliation",
    parentType: "case",
    dossierId: 2, // → DOS-2024-002 (for validation)
    caseId: 2, // → PRO-2024-002
    case: "PRO-2024-002",
    assignedTo: "Me. Sassi",
    dueDate: "2026-02-10",
    status: "En cours",
    priority: "Moyenne",
  },
];

// ========================================
// HUISSIERS / OFFICERS (2)
// ========================================

export const mockOfficers = [
  {
    id: 1,
    name: "Me. Karim Jlassi",
    specialization: "Signification",
    phone: "+216 55 111 222",
    email: "karim.jlassi@huissier.tn",
    location: "Tunis",
    status: "Disponible",
    registrationNumber: "HU-TUN-2015-123",
  },
  {
    id: 2,
    name: "Me. Rania Mbarek",
    specialization: "Exécution",
    phone: "+216 27 333 444",
    email: "rania.mbarek@huissier.tn",
    location: "Ariana",
    status: "Disponible",
    registrationNumber: "HU-ARI-2018-456",
  },
];

// ========================================
// ACCOUNTING (2 - ALL INVOICES PAID)
// ========================================

export const mockAccounting = [
  {
    id: 1,
    invoiceNumber: "FACT-2024-001",
    clientId: 1,
    client: "Ahmed Ben Ali",
    dossierId: 1,
    dossier: "DOS-2024-001",
    amount: "1,500 TND",
    date: "2024-11-15",
    dueDate: "2024-12-15",
    type: "Honoraires",
    status: "Payée", // ✅ PAID
  },
  {
    id: 2,
    invoiceNumber: "FACT-2024-002",
    clientId: 2,
    client: "Fatima Trabelsi",
    dossierId: 2,
    dossier: "DOS-2024-002",
    amount: "2,200 TND",
    date: "2024-11-20",
    dueDate: "2025-01-20",
    type: "Honoraires",
    status: "Payée", // ✅ PAID (no unpaid balances)
  },
];

// ========================================
// PERSONAL TASKS (3)
// ========================================

export const mockPersonalTasks = [
  {
    id: 1,
    title: "Payer facture électricité",
    category: "Factures",
    dueDate: "2025-12-25",
    priority: "Haute",
    status: "En attente",
  },
  {
    id: 2,
    title: "Acheter fournitures bureau",
    category: "Bureau",
    dueDate: "2025-12-30",
    priority: "Moyenne",
    status: "Non commencée",
  },
  {
    id: 3,
    title: "Rendez-vous dentiste",
    category: "Personnel",
    dueDate: "2024-12-01",
    priority: "Basse",
    status: "Terminée",
  },
];

// ========================================
// EXTENDED DATA (For Detail Views)
// ========================================

export const mockClientsExtended = {
  1: {
    id: 1,
    name: "Ahmed Ben Ali",
    email: "ahmed.benali@email.com",
    phone: "+216 98 123 456",
    alternatePhone: "+216 71 234 567",
    cin: "12345678",
    dateOfBirth: "1985-05-15",
    address: "Avenue Habib Bourguiba, Tunis 1000",
    profession: "Entrepreneur",
    company: "Ben Ali Trading",
    taxId: "1234567A",
    status: "Active",
    joinDate: "2024-01-15",
    notes: "Client régulier - Bon payeur",

    relatedDossiers: mockDossiers.filter((d) => d.clientId === 1),
    invoices: mockAccounting.filter((i) => i.clientId === 1),

    documents: [
      {
        id: 1,
        name: "CIN.pdf",
        type: "pdf",
        size: "245 KB",
        date: "2024-01-15",
        category: "Identité",
      },
    ],
    timeline: [
      { type: "created", event: "Client créé", date: "2024-01-15 10:00" },
      {
        type: "invoice",
        event: "Facture FACT-2024-001 émise",
        date: "2024-11-15 09:00",
      },
      {
        type: "payment",
        event: "Paiement reçu 1,500 TND",
        date: "2024-11-20 16:00",
      },
    ],
  },
  2: {
    id: 2,
    name: "Fatima Trabelsi",
    email: "fatima.trabelsi@email.com",
    phone: "+216 22 654 321",
    cin: "87654321",
    dateOfBirth: "1990-08-22",
    address: "Rue de la Liberté, Ariana 2080",
    profession: "Médecin",
    company: "Clinique Privée",
    taxId: "7654321B",
    status: "Active",
    joinDate: "2024-02-20",
    notes: "Dossier familial en cours",

    relatedDossiers: mockDossiers.filter((d) => d.clientId === 2),
    invoices: mockAccounting.filter((i) => i.clientId === 2),

    documents: [
      {
        id: 2,
        name: "CIN.pdf",
        type: "pdf",
        size: "189 KB",
        date: "2024-02-20",
        category: "Identité",
      },
    ],
    timeline: [
      { type: "created", event: "Cliente créée", date: "2024-02-20 11:30" },
      {
        type: "meeting",
        event: "Première consultation",
        date: "2024-02-25 15:00",
      },
      {
        type: "invoice",
        event: "Facture FACT-2024-002 émise",
        date: "2024-11-20 09:00",
      },
      {
        type: "payment",
        event: "Paiement reçu 2,200 TND",
        date: "2024-11-25 16:00",
      },
    ],
  },
};

export const mockDossiersExtended = {
  1: {
    ...mockDossiers[0],
    proceedings: mockCases.filter((c) => c.dossierId === 1),
    tasks: mockTasks.filter(
      (t) =>
        t.dossierId === 1 ||
        (t.caseId && mockCases.find((c) => c.id === t.caseId)?.dossierId === 1)
    ),
    documents: [
      {
        id: 1,
        name: "Contrat_Commercial.pdf",
        type: "pdf",
        size: "1.2 MB",
        date: "2024-01-20",
        category: "Contrat",
      },
    ],
    timeline: [
      { type: "created", event: "Dossier ouvert", date: "2024-01-15 10:00" },
      { type: "document", event: "Contrat ajouté", date: "2024-01-20 14:00" },
    ],
  },
  2: {
    ...mockDossiers[1],
    proceedings: mockCases.filter((c) => c.dossierId === 2),
    tasks: mockTasks.filter(
      (t) =>
        t.dossierId === 2 ||
        (t.caseId && mockCases.find((c) => c.id === t.caseId)?.dossierId === 2)
    ),
    documents: [],
    timeline: [
      { type: "created", event: "Dossier ouvert", date: "2024-02-20 09:00" },
    ],
  },
};

export const mockCasesExtended = {
  1: {
    ...mockCases[0],
    sessions: mockSessions.filter((s) => s.caseId === 1),
    tasks: mockTasks.filter((t) => t.caseId === 1),
    documents: [],
    timeline: [
      { type: "created", event: "Procès créé", date: "2024-02-01 10:00" },
      {
        type: "hearing",
        event: "Audience programmée",
        date: "2024-02-05 14:00",
      },
    ],
  },
  2: {
    ...mockCases[1],
    sessions: mockSessions.filter((s) => s.caseId === 2),
    tasks: mockTasks.filter((t) => t.caseId === 2),
    documents: [],
    timeline: [
      { type: "created", event: "Procès créé", date: "2024-03-15 09:00" },
    ],
  },
};

export const mockOfficersExtended = {
  1: {
    ...mockOfficers[0],
    missions: [
      {
        id: 1,
        missionNumber: "MIS-2024-001",
        title: "Signification assignation",
        entityType: "dossier",
        entityReference: "DOS-2024-001",
        entityId: 1,
        missionType: "Signification",
        assignDate: "2024-11-01",
        dueDate: "2024-11-15",
        status: "Terminée",
        priority: "Haute",
        description: "Signification de l'assignation au défendeur",
        result: "Signifié le 2024-11-12 à 10h00",
      },
    ],
    documents: [],
    timeline: [
      {
        type: "created",
        event: "Huissier enregistré",
        date: "2024-01-10 10:00",
      },
      {
        type: "mission",
        event: "Mission MIS-2024-001 assignée",
        date: "2024-11-01 09:00",
      },
    ],
  },
  2: {
    ...mockOfficers[1],
    missions: [
      {
        id: 2,
        missionNumber: "MIS-2024-002",
        title: "Constat domicile conjugal",
        entityType: "dossier",
        entityReference: "DOS-2024-002",
        entityId: 2,
        missionType: "Constat",
        assignDate: "2024-12-01",
        dueDate: "2024-12-15",
        status: "En cours",
        priority: "Moyenne",
        description: "Constat d'état des lieux domicile conjugal",
      },
    ],
    documents: [],
    timeline: [
      {
        type: "created",
        event: "Huissier enregistré",
        date: "2024-02-01 10:00",
      },
    ],
  },
};

export const mockAccountingExtended = {
  1: {
    ...mockAccounting[0],
    client: {
      id: 1,
      name: "Ahmed Ben Ali",
      email: "ahmed.benali@email.com",
      phone: "+216 98 123 456",
    },
    items: [
      {
        id: 1,
        description: "Honoraires dossier commercial",
        quantity: 1,
        unitPrice: "1,500 TND",
        total: "1,500 TND",
      },
    ],
    payments: [
      {
        id: 1,
        date: "2024-11-20",
        amount: "1,500 TND",
        method: "Virement",
        reference: "PAY-2024-001",
      },
    ],
    timeline: [
      { type: "invoice", event: "Facture émise", date: "2024-11-15 09:00" },
      { type: "payment", event: "Paiement reçu", date: "2024-11-20 16:00" },
    ],
  },
  2: {
    ...mockAccounting[1],
    client: {
      id: 2,
      name: "Fatima Trabelsi",
      email: "fatima.trabelsi@email.com",
      phone: "+216 22 654 321",
    },
    items: [
      {
        id: 2,
        description: "Honoraires dossier divorce",
        quantity: 1,
        unitPrice: "2,200 TND",
        total: "2,200 TND",
      },
    ],
    payments: [
      {
        id: 2,
        date: "2024-11-25",
        amount: "2,200 TND",
        method: "Virement",
        reference: "PAY-2024-002",
      },
    ],
    timeline: [
      { type: "invoice", event: "Facture émise", date: "2024-11-20 09:00" },
      { type: "payment", event: "Paiement reçu", date: "2024-11-25 16:00" },
    ],
  },
};

export const mockTasksExtended = {
  1: {
    ...mockTasks[0],
    description: "Préparer l'ensemble du dossier de plaidoirie pour l'audience",
    notes: "Inclure tous les documents justificatifs et preuves",
    documents: [],
    timeline: [
      { type: "created", event: "Tâche créée", date: "2025-11-01 09:00" },
      { type: "started", event: "Tâche démarrée", date: "2025-11-15 10:00" },
    ],
  },
  2: {
    ...mockTasks[1],
    description: "Rassembler toutes les pièces justificatives nécessaires",
    documents: [],
    timeline: [
      { type: "created", event: "Tâche créée", date: "2025-11-01 09:00" },
      { type: "started", event: "Tâche démarrée", date: "2025-11-20 14:00" },
    ],
  },
  3: {
    ...mockTasks[2],
    description: "Rédiger et déposer les conclusions écrites au tribunal",
    documents: [],
    timeline: [
      { type: "created", event: "Tâche créée", date: "2025-12-01 09:00" },
    ],
  },
  4: {
    ...mockTasks[3],
    description: "Rédiger la requête en divorce et préparer le dossier",
    documents: [],
    timeline: [
      { type: "created", event: "Tâche créée", date: "2025-12-01 09:00" },
    ],
  },
  5: {
    ...mockTasks[4],
    description: "Préparer tous les documents pour l'audience de conciliation",
    documents: [],
    timeline: [
      { type: "created", event: "Tâche créée", date: "2025-12-05 09:00" },
      { type: "started", event: "Tâche démarrée", date: "2025-12-10 11:00" },
    ],
  },
};

export const mockSessionsExtended = {
  1: {
    ...mockSessions[0],
    description: "Audience préliminaire pour examiner les arguments initiaux",
    notes: "Juge Kamel Gharbi - Apporter tous les documents",
    participants: ["Me. Hammami", "Ahmed Ben Ali"],
    documents: [],
    timeline: [
      {
        type: "created",
        event: "Audience programmée",
        date: "2024-02-05 14:00",
      },
    ],
  },
  2: {
    ...mockSessions[1],
    description: "Audience de plaidoirie finale",
    notes: "Session décisive - Présenter tous les arguments",
    participants: ["Me. Hammami", "Ahmed Ben Ali"],
    documents: [],
    timeline: [
      {
        type: "created",
        event: "Audience programmée",
        date: "2024-02-05 14:00",
      },
    ],
  },
  3: {
    ...mockSessions[2],
    description: "Tentative de conciliation dans le cadre du divorce",
    notes: "Juge Leila Fourati - Présence obligatoire des deux parties",
    participants: ["Me. Sassi", "Fatima Trabelsi"],
    documents: [],
    timeline: [
      {
        type: "created",
        event: "Audience programmée",
        date: "2024-03-20 10:00",
      },
    ],
  },
  4: {
    ...mockSessions[3],
    description: "Consultation avec le client pour discuter du dossier",
    notes: "Révision de la stratégie juridique",
    participants: ["Me. Hammami"],
    documents: [],
    timeline: [
      {
        type: "created",
        event: "Consultation programmée",
        date: "2025-12-15 09:00",
      },
    ],
  },
};

export const mockPersonalTasksExtended = {
  1: {
    ...mockPersonalTasks[0],
    description: "Paiement mensuel facture électricité bureau",
    notes: "Montant estimé: 150 TND",
    timeline: [
      { type: "created", event: "Tâche créée", date: "2025-12-01 09:00" },
    ],
  },
  2: {
    ...mockPersonalTasks[1],
    description: "Renouveler stock fournitures (papier, stylos, etc.)",
    timeline: [
      { type: "created", event: "Tâche créée", date: "2025-12-05 09:00" },
    ],
  },
  3: {
    ...mockPersonalTasks[2],
    description: "Contrôle dentaire annuel",
    notes: "Dr. Kamel Ferchichi - Clinique Dentaire Lac",
    timeline: [
      { type: "created", event: "Tâche créée", date: "2024-11-20 10:00" },
      { type: "completed", event: "Tâche terminée", date: "2024-12-01 14:00" },
    ],
  },
};

// ========================================
// HELPER FUNCTIONS
// ========================================

export function getStatusColor(status) {
  const map = {
    Active:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Inactive: "bg-slate-600 text-white dark:bg-slate-700 dark:text-slate-200",
    "En cours":
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "En attente":
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    Ouvert:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Fermé: "bg-slate-600 text-white dark:bg-slate-700 dark:text-slate-200",
    Terminée:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Terminé:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Payée:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    "En retard": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    Annulée: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    Programmée:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    Confirmée:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Disponible:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Occupé:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    "Non commencée":
      "bg-slate-600 text-white dark:bg-slate-700 dark:text-slate-200",
  };
  return (
    map[status] ||
    "bg-slate-600 text-white dark:bg-slate-700 dark:text-slate-200"
  );
}

export function getAllMissions() {
  const missions = [];
  Object.values(mockOfficersExtended).forEach((officer) => {
    if (officer.missions && Array.isArray(officer.missions)) {
      officer.missions.forEach((mission) => {
        missions.push({
          ...mission,
          officerId: officer.id,
          officerName: officer.name,
        });
      });
    }
  });
  return missions;
}

/**
 * Sync functions to update extended mock data with newly created entries
 * These allow the detail views to find newly created entities
 */
export function syncDossierToExtended(dossier) {
  console.log("[SYNC] Syncing dossier to extended:", dossier.id, dossier);
  if (!mockDossiersExtended[dossier.id]) {
    mockDossiersExtended[dossier.id] = {
      ...dossier,
      proceedings: [],
      sessions: [],
      tasks: [],
      documents: [],
      notes: [],
      timeline: [
        {
          type: "created",
          event: "Dossier créé",
          date: new Date().toISOString(),
          user: "System",
        },
      ],
      transactions: [],
    };
    console.log(
      "[SYNC] Dossier added to mockDossiersExtended:",
      mockDossiersExtended[dossier.id]
    );
  } else {
    console.log("[SYNC] Dossier already exists in mockDossiersExtended");
  }
}

export function syncCaseToExtended(caseItem) {
  console.log("[SYNC] Syncing case to extended:", caseItem.id, caseItem);
  if (!mockCasesExtended[caseItem.id]) {
    // Find the parent dossier if dossierId is provided
    let dossierObj = null;
    if (caseItem.dossierId) {
      // First check mockDossiersExtended
      dossierObj = mockDossiersExtended[caseItem.dossierId];
      // If not found, check mockDossiers array
      if (!dossierObj) {
        const dossier = mockDossiers.find((d) => d.id === caseItem.dossierId);
        if (dossier) {
          dossierObj = dossier;
        }
      }
    }

    mockCasesExtended[caseItem.id] = {
      ...caseItem,
      dossier: dossierObj, // Add full dossier object
      sessions: [],
      tasks: [],
      missions: [],
      documents: [],
      notes: [],
      timeline: [
        {
          type: "created",
          event: "Procès créé",
          date: new Date().toISOString(),
          user: "System",
        },
      ],
    };
    console.log(
      "[SYNC] Case added to mockCasesExtended:",
      mockCasesExtended[caseItem.id]
    );
  } else {
    console.log("[SYNC] Case already exists in mockCasesExtended");
  }
}

export function syncOfficerToExtended(officer) {
  console.log("[SYNC] Syncing officer to extended:", officer.id, officer);
  if (!mockOfficersExtended[officer.id]) {
    mockOfficersExtended[officer.id] = {
      ...officer,
      missions: [],
      documents: [],
      notes: [],
      timeline: [
        {
          type: "created",
          event: "Huissier ajouté",
          date: new Date().toISOString(),
          user: "System",
        },
      ],
    };
    console.log(
      "[SYNC] Officer added to mockOfficersExtended:",
      mockOfficersExtended[officer.id]
    );
  } else {
    console.log("[SYNC] Officer already exists in mockOfficersExtended");
  }
}

export function syncTaskToExtended(task) {
  console.log("[SYNC] Syncing task to extended:", task.id, task);
  if (!mockTasksExtended[task.id]) {
    mockTasksExtended[task.id] = {
      ...task,
      description: task.description || "",
      notes: task.notes || "",
      documents: [],
      timeline: [
        {
          type: "created",
          event: "Tâche créée",
          date: new Date().toISOString(),
          user: "System",
        },
      ],
    };
    console.log(
      "[SYNC] Task added to mockTasksExtended:",
      mockTasksExtended[task.id]
    );
  } else {
    console.log("[SYNC] Task already exists in mockTasksExtended");
  }
}

export function syncSessionToExtended(session) {
  console.log("[SYNC] Syncing session to extended:", session.id, session);
  if (!mockSessionsExtended[session.id]) {
    mockSessionsExtended[session.id] = {
      ...session,
      description: session.description || "",
      notes: session.notes || "",
      participants: session.participants || [],
      documents: [],
      timeline: [
        {
          type: "created",
          event: "Séance programmée",
          date: new Date().toISOString(),
          user: "System",
        },
      ],
    };
    console.log(
      "[SYNC] Session added to mockSessionsExtended:",
      mockSessionsExtended[session.id]
    );
  } else {
    console.log("[SYNC] Session already exists in mockSessionsExtended");
  }
}
