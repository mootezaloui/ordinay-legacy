/**
 * mockData_UPDATED.js
 * Updated mock data with proper relationships:
 * - Client → Dossiers (1:many)
 * - Dossier → Procès (1:many)
 * - Procès → Séances Judiciaires (1:many)
 * - Dossier/Procès → Huissiers (many:many)
 * - All entities → Accounting (for invoices)
 */

// ========================================
// BASE LIST DATA (for tables/screens)
// ========================================

export const mockClients = [
  {
    id: 1,
    name: "Ahmed Ben Ali",
    email: "ahmed.benali@email.com",
    phone: "+216 98 123 456",
    status: "Active",
    joinDate: "2024-01-15",
    cin: "12345678",
    profession: "Entrepreneur",
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
    profession: "Médecin",
    address: "Rue de la Liberté, Ariana",
  },
  {
    id: 3,
    name: "Youssef Mansour",
    email: "y.mansour@email.com",
    phone: "+216 54 987 321",
    status: "Inactive",
    joinDate: "2024-03-05",
    cin: "11223344",
    profession: "Commerçant",
    address: "Boulevard Mohamed V, Sfax",
  },
];

export const mockDossiers = [
  {
    id: 1,
    caseNumber: "DOS-2024-001",
    title: "Affaire Commerciale - Contrat",
    clientId: 1, // ← CLIENT RELATIONSHIP
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
    clientId: 2, // ← CLIENT RELATIONSHIP
    client: "Fatima Trabelsi",
    status: "Ouvert",
    openDate: "2024-02-10",
    priority: "Moyenne",
    category: "Famille",
    assignedLawyer: "Me. Sassi",
  },
  {
    id: 3,
    caseNumber: "DOS-2024-003",
    title: "Contentieux Fiscal",
    clientId: 3, // ← CLIENT RELATIONSHIP
    client: "Youssef Mansour",
    status: "Fermé",
    openDate: "2024-03-20",
    priority: "Basse",
    category: "Fiscal",
    assignedLawyer: "Me. Cherif",
  },
];

export const mockCases = [
  {
    id: 1,
    caseNumber: "PRO-2024-001",
    title: "Litige commercial - Audience",
    dossierId: 1, // ← DOSSIER RELATIONSHIP
    dossier: "DOS-2024-001",
    court: "Tribunal de première instance - Tunis",
    nextHearing: "2025-12-20",
    status: "En cours",
    judge: "M. Kamel Gharbi",
    filingDate: "2024-02-01",
  },
  {
    id: 2,
    caseNumber: "PRO-2024-002",
    title: "Appel divorce",
    dossierId: 2, // ← DOSSIER RELATIONSHIP
    dossier: "DOS-2024-002",
    court: "Cour d'Appel - Tunis",
    nextHearing: "2026-01-15",
    status: "En cours",
    judge: "Mme. Leila Fourati",
    filingDate: "2024-03-15",
  },
  {
    id: 3,
    caseNumber: "PRO-2024-003",
    title: "Contentieux fiscal - Recours",
    dossierId: 3, // ← DOSSIER RELATIONSHIP
    dossier: "DOS-2024-003",
    court: "Tribunal Administratif",
    nextHearing: "2025-11-30",
    status: "Terminé",
    judge: "M. Habib Dridi",
    filingDate: "2024-04-01",
  },
];

export const mockSessions = [
  {
    id: 1,
    title: "Audience préliminaire",
    type: "Audience",
    caseId: 1, // ← PROCÈS RELATIONSHIP
    caseName: "PRO-2024-001 - Litige commercial",
    date: "2024-12-20",
    time: "10:00",
    duration: "1h30",
    location: "TPI Tunis - Salle 3",
    status: "Programmée",
  },
  {
    id: 2,
    title: "Audience de plaidoirie",
    type: "Audience",
    caseId: 1, // ← Same procès, different séance
    caseName: "PRO-2024-001 - Litige commercial",
    date: "2025-01-10",
    time: "09:00",
    duration: "2h",
    location: "TPI Tunis - Salle 3",
    status: "Programmée",
  },
  {
    id: 3,
    title: "Audience d'appel",
    type: "Audience",
    caseId: 2, // ← PROCÈS RELATIONSHIP
    caseName: "PRO-2024-002 - Appel divorce",
    date: "2026-01-15",
    time: "14:00",
    duration: "1h",
    location: "Cour d'Appel Tunis",
    status: "Programmée",
  },
  {
    id: 4,
    title: "Consultation client",
    type: "Consultation",
    caseId: null, // ← No procès, just a consultation
    caseName: null,
    date: "2024-12-15",
    time: "15:00",
    duration: "1h",
    location: "Cabinet",
    status: "Confirmée",
  },
];

export const mockTasks = [
  {
    id: 1,
    title: "Préparer dossier plaidoirie",
    dossierId: 1, // ← DOSSIER RELATIONSHIP
    dossier: "DOS-2024-001",
    assignedTo: "Me. Hammami",
    dueDate: "2025-12-15",
    status: "En cours",
    priority: "Haute",
  },
  {
    id: 2,
    title: "Rédiger conclusions",
    dossierId: 2, // ← DOSSIER RELATIONSHIP
    dossier: "DOS-2024-002",
    assignedTo: "Me. Sassi",
    dueDate: "2025-12-20",
    status: "En attente",
    priority: "Moyenne",
  },
  {
    id: 3,
    title: "Suivi fiscal trimestriel",
    dossierId: 3, // ← DOSSIER RELATIONSHIP
    dossier: "DOS-2024-003",
    assignedTo: "Me. Cherif",
    dueDate: "2024-11-30",
    status: "Terminée",
    priority: "Basse",
  },
];

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
    status: "Occupé",
    registrationNumber: "HU-ARI-2018-456",
  },
  {
    id: 3,
    name: "Me. Sami Gharbi",
    specialization: "Constat",
    phone: "+216 98 555 666",
    email: "sami.gharbi@huissier.tn",
    location: "Sfax",
    status: "Disponible",
    registrationNumber: "HU-SFX-2020-789",
  },
];

// Huissier assignments (many-to-many relationship)
export const mockOfficerAssignments = [
  {
    id: 1,
    officerId: 1,
    officerName: "Me. Karim Jlassi",
    entityType: "dossier", // or "case"
    entityId: 1,
    entityName: "DOS-2024-001 - Affaire Commerciale",
    taskType: "Signification",
    assignDate: "2024-11-01",
    status: "En cours",
    notes: "Signification de l'assignation",
  },
  {
    id: 2,
    officerId: 2,
    officerName: "Me. Rania Mbarek",
    entityType: "case",
    entityId: 1,
    entityName: "PRO-2024-001 - Litige commercial",
    taskType: "Exécution",
    assignDate: "2024-11-15",
    status: "Terminée",
    notes: "Exécution du jugement",
  },
  {
    id: 3,
    officerId: 3,
    officerName: "Me. Sami Gharbi",
    entityType: "dossier",
    entityId: 2,
    entityName: "DOS-2024-002 - Divorce Contentieux",
    taskType: "Constat",
    assignDate: "2024-12-01",
    status: "Programmée",
    notes: "Constat domicile conjugal",
  },
];

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
    status: "Payée",
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
    dueDate: "2024-12-20",
    type: "Honoraires",
    status: "En attente",
  },
  {
    id: 3,
    invoiceNumber: "FACT-2024-003",
    clientId: 3,
    client: "Youssef Mansour",
    dossierId: 3,
    dossier: "DOS-2024-003",
    amount: "3,500 TND",
    date: "2024-10-01",
    dueDate: "2024-11-01",
    type: "Frais",
    status: "En retard",
  },
];

export const mockPersonalTasks = [
  {
    id: 1,
    title: "Payer facture électricité",
    category: "Factures",
    dueDate: "2024-12-15",
    priority: "Haute",
    status: "En attente",
  },
  {
    id: 2,
    title: "Acheter fournitures bureau",
    category: "Bureau",
    dueDate: "2024-12-20",
    priority: "Moyenne",
    status: "Non commencée",
  },
  {
    id: 3,
    title: "Rendez-vous dentiste",
    category: "Personnel",
    dueDate: "2024-12-18",
    priority: "Basse",
    status: "Planifiée",
  },
];

// ========================================
// EXTENDED DATA FOR DETAIL VIEWS
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
    company: "Tech Solutions SARL",
    taxId: "1234567A",
    status: "Active",
    joinDate: "2024-01-15",
    notes: "Client important - Partenaire de longue date",

    // RELATIONSHIPS
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
      {
        id: 2,
        name: "Contrat.pdf",
        type: "pdf",
        size: "1.2 MB",
        date: "2024-01-20",
        category: "Contrat",
      },
    ],
    timeline: [
      { type: "created", event: "Client créé", date: "2024-01-15 10:00" },
      {
        type: "document",
        event: "Documents ajoutés",
        date: "2024-01-15 14:30",
      },
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
    alternatePhone: "+216 71 888 999",
    cin: "87654321",
    dateOfBirth: "1990-08-22",
    address: "Rue de la Liberté, Ariana 2080",
    profession: "Médecin",
    company: "Clinique La Rose",
    taxId: "7654321B",
    status: "Active",
    joinDate: "2024-02-20",
    notes: "Cas délicat - Divorce contentieux en cours",

    relatedDossiers: mockDossiers.filter((d) => d.clientId === 2),
    invoices: mockAccounting.filter((i) => i.clientId === 2),

    documents: [
      {
        id: 3,
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
        type: "document",
        event: "Documents ajoutés",
        date: "2024-03-01 10:00",
      },
    ],
  },
  3: {
    id: 3,
    name: "Youssef Mansour",
    email: "y.mansour@email.com",
    phone: "+216 54 987 321",
    cin: "11223344",
    dateOfBirth: "1978-12-10",
    address: "Boulevard Mohamed V, Sfax 3000",
    profession: "Commerçant",
    company: "Import-Export YM",
    taxId: "1122334C",
    status: "Inactive",
    joinDate: "2024-03-05",
    notes: "Dossier clôturé - Client satisfait",

    relatedDossiers: mockDossiers.filter((d) => d.clientId === 3),
    invoices: mockAccounting.filter((i) => i.clientId === 3),

    documents: [],
    timeline: [
      { type: "created", event: "Client créé", date: "2024-03-05 09:00" },
      { type: "action", event: "Dossier ouvert", date: "2024-03-20 14:00" },
      { type: "action", event: "Dossier clôturé", date: "2024-10-15 16:30" },
    ],
  },
};

export const mockDossiersExtended = {
  1: {
    id: 1,
    caseNumber: "DOS-2024-001",
    title: "Affaire Commerciale - Contrat",
    clientId: 1,
    client: { id: 1, name: "Ahmed Ben Ali" },
    status: "Ouvert",
    openDate: "2024-01-15",
    priority: "Haute",
    category: "Commercial",
    assignedLawyer: "Me. Hammami",
    nextDeadline: "2025-12-20",
    description:
      "Litige concernant l'exécution d'un contrat commercial entre Tech Solutions SARL et une société tierce.",
    adversaryParty: "Global Trade Inc.",
    adversaryLawyer: "Me. Slim Karoui",
    estimatedValue: "50,000 TND",
    courtReference: "TPI-2024-COM-1234",
    notes: "Dossier prioritaire - Échéance importante en décembre",

    // RELATIONSHIPS
    tasks: mockTasks.filter((t) => t.dossierId === 1),
    proceedings: mockCases.filter((c) => c.dossierId === 1),
    officerAssignments: mockOfficerAssignments.filter(
      (a) => a.entityType === "dossier" && a.entityId === 1
    ),

    documents: [
      {
        id: 101,
        name: "Contrat_Initial.pdf",
        type: "pdf",
        size: "2.1 MB",
        date: "2024-01-15",
        category: "Contrat",
      },
      {
        id: 102,
        name: "Correspondance.docx",
        type: "docx",
        size: "156 KB",
        date: "2024-02-10",
        category: "Courrier",
      },
    ],
    notes: [],
    timeline: [
      { type: "created", event: "Dossier ouvert", date: "2024-01-15 09:00" },
      { type: "document", event: "Contrat ajouté", date: "2024-01-15 14:30" },
      { type: "action", event: "Procès déposé", date: "2024-02-01 10:00" },
      {
        type: "meeting",
        event: "Réunion avec client",
        date: "2024-11-15 11:00",
      },
    ],
    financials: {
      totalFees: "15,000 TND",
      paidAmount: "10,000 TND",
      pendingAmount: "5,000 TND",
      expenses: "2,500 TND",
    },
  },
  2: {
    id: 2,
    caseNumber: "DOS-2024-002",
    title: "Divorce Contentieux",
    clientId: 2,
    client: { id: 2, name: "Fatima Trabelsi" },
    status: "Ouvert",
    openDate: "2024-02-10",
    priority: "Moyenne",
    category: "Famille",
    assignedLawyer: "Me. Sassi",
    nextDeadline: "2026-01-15",
    description:
      "Procédure de divorce contentieux avec règlement de la garde des enfants et pension alimentaire.",
    adversaryParty: "Mohamed Trabelsi",
    adversaryLawyer: "Me. Nadia Khelifi",
    estimatedValue: "N/A",
    notes: "Cas sensible - Médiation en cours",

    tasks: mockTasks.filter((t) => t.dossierId === 2),
    proceedings: mockCases.filter((c) => c.dossierId === 2),
    officerAssignments: mockOfficerAssignments.filter(
      (a) => a.entityType === "dossier" && a.entityId === 2
    ),

    documents: [
      {
        id: 201,
        name: "Acte_Mariage.pdf",
        type: "pdf",
        size: "450 KB",
        date: "2024-02-10",
        category: "État civil",
      },
    ],
    notes: [],
    timeline: [
      { type: "created", event: "Dossier ouvert", date: "2024-02-10 10:30" },
      {
        type: "meeting",
        event: "Première consultation",
        date: "2024-02-25 15:00",
      },
      {
        type: "mediation",
        event: "Séance de médiation",
        date: "2024-05-10 14:00",
      },
    ],
    financials: {
      totalFees: "8,000 TND",
      paidAmount: "5,000 TND",
      pendingAmount: "3,000 TND",
      expenses: "500 TND",
    },
  },
  3: {
    id: 3,
    caseNumber: "DOS-2024-003",
    title: "Contentieux Fiscal",
    clientId: 3,
    client: { id: 3, name: "Youssef Mansour" },
    status: "Fermé",
    openDate: "2024-03-20",
    priority: "Basse",
    category: "Fiscal",
    assignedLawyer: "Me. Cherif",
    description: "Recours contre un redressement fiscal de l'administration.",
    estimatedValue: "75,000 TND",
    notes: "Dossier clôturé avec succès - Gain du recours",

    tasks: mockTasks.filter((t) => t.dossierId === 3),
    proceedings: mockCases.filter((c) => c.dossierId === 3),
    officerAssignments: [],

    documents: [],
    notes: [],
    timeline: [
      { type: "created", event: "Dossier ouvert", date: "2024-03-20 09:00" },
      {
        type: "hearing",
        event: "Audience tribunal administratif",
        date: "2024-09-15 10:00",
      },
      { type: "action", event: "Jugement favorable", date: "2024-10-15 16:00" },
    ],
    financials: {
      totalFees: "12,000 TND",
      paidAmount: "12,000 TND",
      pendingAmount: "0 TND",
      expenses: "1,200 TND",
    },
  },
};

export const mockCasesExtended = {
  1: {
    id: 1,
    caseNumber: "PRO-2024-001",
    title: "Litige commercial - Audience",
    dossierId: 1,
    dossier: {
      id: 1,
      caseNumber: "DOS-2024-001",
      title: "Affaire Commerciale",
    },
    court: "Tribunal de première instance - Tunis",
    courtRoom: "Salle 3",
    nextHearing: "2025-12-20",
    status: "En cours",
    judge: "M. Kamel Gharbi",
    filingDate: "2024-02-01",
    referenceNumber: "TPI-2024-COM-1234",
    adversaryParty: "Global Trade Inc.",
    adversaryLawyer: "Me. Slim Karoui",
    description: "Procès concernant la violation d'un contrat commercial.",

    // RELATIONSHIPS
    hearings: mockSessions.filter((s) => s.caseId === 1),
    officerAssignments: mockOfficerAssignments.filter(
      (a) => a.entityType === "case" && a.entityId === 1
    ),

    documents: [
      {
        id: 301,
        name: "Assignation.pdf",
        type: "pdf",
        size: "890 KB",
        date: "2024-02-01",
        category: "Procédure",
      },
      {
        id: 302,
        name: "Conclusions.pdf",
        type: "pdf",
        size: "1.5 MB",
        date: "2024-11-01",
        category: "Plaidoirie",
      },
    ],
    notes: [],
    timeline: [
      { type: "created", event: "Procès déposé", date: "2024-02-01 10:00" },
      {
        type: "hearing",
        event: "Audience préliminaire programmée",
        date: "2024-11-15 14:00",
      },
      {
        type: "document",
        event: "Conclusions déposées",
        date: "2024-11-20 09:00",
      },
    ],
  },
  2: {
    id: 2,
    caseNumber: "PRO-2024-002",
    title: "Appel divorce",
    dossierId: 2,
    dossier: {
      id: 2,
      caseNumber: "DOS-2024-002",
      title: "Divorce Contentieux",
    },
    court: "Cour d'Appel - Tunis",
    courtRoom: "Salle A",
    nextHearing: "2026-01-15",
    status: "En cours",
    judge: "Mme. Leila Fourati",
    filingDate: "2024-03-15",
    referenceNumber: "CA-2024-FAM-567",
    adversaryParty: "Mohamed Trabelsi",
    adversaryLawyer: "Me. Nadia Khelifi",
    description:
      "Appel du jugement de première instance concernant le divorce et la garde des enfants.",

    hearings: mockSessions.filter((s) => s.caseId === 2),
    officerAssignments: [],

    documents: [],
    notes: [],
    timeline: [
      { type: "created", event: "Appel déposé", date: "2024-03-15 11:00" },
      {
        type: "hearing",
        event: "Audience d'appel programmée",
        date: "2024-10-01 15:00",
      },
    ],
  },
  3: {
    id: 3,
    caseNumber: "PRO-2024-003",
    title: "Contentieux fiscal - Recours",
    dossierId: 3,
    dossier: { id: 3, caseNumber: "DOS-2024-003", title: "Contentieux Fiscal" },
    court: "Tribunal Administratif",
    nextHearing: "2024-09-15",
    status: "Terminé",
    judge: "M. Habib Dridi",
    filingDate: "2024-04-01",
    description: "Recours contre un redressement fiscal.",

    hearings: mockSessions.filter((s) => s.caseId === 3),
    officerAssignments: [],

    documents: [],
    notes: [],
    timeline: [
      { type: "created", event: "Recours déposé", date: "2024-04-01 09:30" },
      { type: "hearing", event: "Audience tribunal", date: "2024-09-15 10:00" },
      { type: "action", event: "Jugement favorable", date: "2024-10-15 16:00" },
    ],
  },
};

export const mockSessionsExtended = {
  1: {
    id: 1,
    title: "Audience préliminaire",
    type: "Audience",
    caseId: 1,
    case: { id: 1, caseNumber: "PRO-2024-001", title: "Litige commercial" },
    date: "2024-12-20",
    time: "10:00",
    duration: "1h30",
    location: "TPI Tunis - Salle 3",
    status: "Programmée",
    description: "Première audience pour présentation des arguments et pièces.",
    notes: "Préparer dossier complet avec toutes les pièces justificatives",

    participants: [
      {
        id: 1,
        name: "Me. Hammami",
        role: "Avocat",
        email: "hammami@cabinet.tn",
        phone: "+216 71 123 456",
      },
      {
        id: 2,
        name: "M. Kamel Gharbi",
        role: "Juge",
        email: null,
        phone: null,
      },
      {
        id: 3,
        name: "Ahmed Ben Ali",
        role: "Client",
        email: "ahmed.benali@email.com",
        phone: "+216 98 123 456",
      },
    ],
    documents: [],
    timeline: [
      { type: "created", event: "Séance programmée", date: "2024-11-15 14:00" },
      {
        type: "action",
        event: "Convocation envoyée",
        date: "2024-11-20 09:00",
      },
    ],
  },
  2: {
    id: 2,
    title: "Audience de plaidoirie",
    type: "Audience",
    caseId: 1,
    case: { id: 1, caseNumber: "PRO-2024-001", title: "Litige commercial" },
    date: "2025-01-10",
    time: "09:00",
    duration: "2h",
    location: "TPI Tunis - Salle 3",
    status: "Programmée",
    description: "Plaidoirie finale",

    participants: [],
    documents: [],
    timeline: [],
  },
  3: {
    id: 3,
    title: "Audience d'appel",
    type: "Audience",
    caseId: 2,
    case: { id: 2, caseNumber: "PRO-2024-002", title: "Appel divorce" },
    date: "2026-01-15",
    time: "14:00",
    duration: "1h",
    location: "Cour d'Appel Tunis",
    status: "Programmée",
    description: "Audience d'appel pour le divorce contentieux",

    participants: [],
    documents: [],
    timeline: [],
  },
  4: {
    id: 4,
    title: "Consultation client",
    type: "Consultation",
    caseId: null,
    case: null,
    date: "2024-12-15",
    time: "15:00",
    duration: "1h",
    location: "Cabinet",
    status: "Confirmée",
    description: "Consultation initiale pour nouveau client",

    participants: [],
    documents: [],
    timeline: [],
  },
};

export const mockTasksExtended = {
  1: {
    id: 1,
    title: "Préparer dossier plaidoirie",
    dossierId: 1,
    dossier: {
      id: 1,
      caseNumber: "DOS-2024-001",
      title: "Affaire Commerciale",
    },
    assignedTo: "Me. Hammami",
    dueDate: "2025-12-15",
    status: "En cours",
    priority: "Haute",
    createdDate: "2024-11-15",
    description:
      "Préparer l'ensemble du dossier pour l'audience de plaidoirie du 20 décembre.",
    estimatedTime: "8h",
    progress: 60,

    documents: [],
    comments: [],
    timeline: [
      { type: "created", event: "Tâche créée", date: "2024-11-15 09:00" },
      {
        type: "action",
        event: "Documents rassemblés",
        date: "2024-12-01 14:00",
      },
    ],
  },
  2: {
    id: 2,
    title: "Rédiger conclusions",
    dossierId: 2,
    dossier: {
      id: 2,
      caseNumber: "DOS-2024-002",
      title: "Divorce Contentieux",
    },
    assignedTo: "Me. Sassi",
    dueDate: "2025-12-20",
    status: "En attente",
    priority: "Moyenne",
    createdDate: "2024-12-01",
    description: "Rédiger les conclusions pour l'appel",
    estimatedTime: "4h",
    progress: 0,

    documents: [],
    comments: [],
    timeline: [],
  },
  3: {
    id: 3,
    title: "Suivi fiscal trimestriel",
    dossierId: 3,
    dossier: { id: 3, caseNumber: "DOS-2024-003", title: "Contentieux Fiscal" },
    assignedTo: "Me. Cherif",
    dueDate: "2024-11-30",
    status: "Terminée",
    priority: "Basse",
    createdDate: "2024-10-01",
    description: "Suivi du contentieux fiscal - clôture dossier",
    estimatedTime: "2h",
    progress: 100,

    documents: [],
    comments: [],
    timeline: [],
  },
};

export const mockOfficersExtended = {
  1: {
    id: 1,
    name: "Me. Karim Jlassi",
    specialization: "Signification",
    phone: "+216 55 111 222",
    alternatePhone: "+216 71 333 444",
    email: "karim.jlassi@huissier.tn",
    location: "Tunis",
    address: "Rue de la République, Tunis 1001",
    office: "Étude Jlassi & Associés",
    registrationNumber: "HU-TUN-2015-123",
    yearsOfExperience: 9,
    status: "Disponible",
    rating: 4.5,
    completedCases: 145,
    notes: "Très professionnel - Disponible rapidement",

    // RELATIONSHIPS - Show assignments
    cases: mockOfficerAssignments.filter((a) => a.officerId === 1),

    documents: [],
    timeline: [
      { type: "created", event: "Huissier ajouté", date: "2024-01-10 10:00" },
      {
        type: "action",
        event: "Mission terminée DOS-2024-001",
        date: "2024-11-25 16:00",
      },
    ],
  },
  2: {
    id: 2,
    name: "Me. Rania Mbarek",
    specialization: "Exécution",
    phone: "+216 27 333 444",
    email: "rania.mbarek@huissier.tn",
    location: "Ariana",
    address: "Avenue de la Liberté, Ariana 2080",
    office: "Cabinet Mbarek",
    registrationNumber: "HU-ARI-2018-456",
    yearsOfExperience: 6,
    status: "Occupé",
    rating: 4.8,
    completedCases: 98,

    cases: mockOfficerAssignments.filter((a) => a.officerId === 2),

    documents: [],
    timeline: [],
  },
  3: {
    id: 3,
    name: "Me. Sami Gharbi",
    specialization: "Constat",
    phone: "+216 98 555 666",
    email: "sami.gharbi@huissier.tn",
    location: "Sfax",
    address: "Boulevard du 18 Janvier, Sfax 3000",
    office: "Étude Gharbi",
    registrationNumber: "HU-SFX-2020-789",
    yearsOfExperience: 4,
    status: "Disponible",
    rating: 4.2,
    completedCases: 52,

    cases: mockOfficerAssignments.filter((a) => a.officerId === 3),

    documents: [],
    timeline: [],
  },
};

export const mockAccountingExtended = {
  1: {
    id: 1,
    invoiceNumber: "FACT-2024-001",
    clientId: 1,
    client: {
      id: 1,
      name: "Ahmed Ben Ali",
      email: "ahmed.benali@email.com",
      phone: "+216 98 123 456",
      address: "Avenue Habib Bourguiba, Tunis",
    },
    dossierId: 1,
    dossier: "DOS-2024-001",
    amount: "1,500 TND",
    subtotal: "1,260 TND",
    tax: "240 TND",
    paidAmount: "1,500 TND",
    date: "2024-11-15",
    dueDate: "2024-12-15",
    type: "Honoraires",
    status: "Payée",
    paymentMethod: "Virement",
    notes: "Facture honoraires consultation initiale",

    items: [
      {
        id: 1,
        description: "Consultation initiale",
        quantity: 1,
        unitPrice: "500 TND",
        total: "500 TND",
      },
      {
        id: 2,
        description: "Analyse dossier",
        quantity: 1,
        unitPrice: "760 TND",
        total: "760 TND",
      },
    ],
    payments: [
      {
        id: 1,
        date: "2024-11-20",
        amount: "1,500 TND",
        method: "Virement",
        reference: "VIR-2024-1120",
      },
    ],
    documents: [],
    timeline: [
      { type: "created", event: "Facture émise", date: "2024-11-15 09:00" },
      {
        type: "payment",
        event: "Paiement reçu 1,500 TND",
        date: "2024-11-20 16:00",
      },
    ],
  },
  2: {
    id: 2,
    invoiceNumber: "FACT-2024-002",
    clientId: 2,
    client: {
      id: 2,
      name: "Fatima Trabelsi",
      email: "fatima.trabelsi@email.com",
      phone: "+216 22 654 321",
      address: "Rue de la Liberté, Ariana",
    },
    dossierId: 2,
    dossier: "DOS-2024-002",
    amount: "2,200 TND",
    subtotal: "1,848 TND",
    tax: "352 TND",
    paidAmount: "0 TND",
    date: "2024-11-20",
    dueDate: "2024-12-20",
    type: "Honoraires",
    status: "En attente",
    notes: "Facture procédure divorce - Échéance 20 décembre",

    items: [
      {
        id: 3,
        description: "Honoraires procédure divorce",
        quantity: 1,
        unitPrice: "1,848 TND",
        total: "1,848 TND",
      },
    ],
    payments: [],
    documents: [],
    timeline: [
      { type: "invoice", event: "Facture émise", date: "2024-11-20 10:00" },
    ],
  },
  3: {
    id: 3,
    invoiceNumber: "FACT-2024-003",
    clientId: 3,
    client: {
      id: 3,
      name: "Youssef Mansour",
      email: "y.mansour@email.com",
      phone: "+216 54 987 321",
      address: "Boulevard Mohamed V, Sfax",
    },
    dossierId: 3,
    dossier: "DOS-2024-003",
    amount: "3,500 TND",
    subtotal: "2,941 TND",
    tax: "559 TND",
    paidAmount: "0 TND",
    date: "2024-10-01",
    dueDate: "2024-11-01",
    type: "Frais",
    status: "En retard",
    notes: "URGENT - Relance nécessaire",

    items: [
      {
        id: 4,
        description: "Frais contentieux fiscal",
        quantity: 1,
        unitPrice: "2,941 TND",
        total: "2,941 TND",
      },
    ],
    payments: [],
    documents: [],
    timeline: [
      { type: "invoice", event: "Facture émise", date: "2024-10-01 09:00" },
      { type: "action", event: "Relance envoyée", date: "2024-11-05 14:00" },
    ],
  },
};

export const mockPersonalTasksExtended = {
  1: {
    id: 1,
    title: "Payer facture électricité",
    category: "Factures",
    dueDate: "2024-12-15",
    priority: "Haute",
    status: "En attente",
    createdDate: "2024-12-01",
    description: "Paiement mensuel de la facture d'électricité du bureau",
    notes: "Montant estimé: 150 TND",

    documents: [],
    timeline: [
      { type: "created", event: "Tâche créée", date: "2024-12-01 09:00" },
    ],
  },
  2: {
    id: 2,
    title: "Acheter fournitures bureau",
    category: "Bureau",
    dueDate: "2024-12-20",
    priority: "Moyenne",
    status: "Non commencée",
    createdDate: "2024-12-05",
    description: "Renouveler stock fournitures bureau (papier, stylos, etc.)",

    documents: [],
    timeline: [],
  },
  3: {
    id: 3,
    title: "Rendez-vous dentiste",
    category: "Personnel",
    dueDate: "2024-12-18",
    priority: "Basse",
    status: "Planifiée",
    createdDate: "2024-11-20",
    description: "Contrôle dentaire annuel",
    notes: "Dr. Kamel Ferchichi - Clinique Dentaire Lac",

    documents: [],
    timeline: [],
  },
};

// Status color helper (unchanged)
export function getStatusColor(status) {
  const map = {
    Active:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Inactive:
      "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    "En cours":
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "En appel":
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    "En attente":
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    Ouvert:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Fermé: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
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
      "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    Planifiée:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  return (
    map[status] ||
    "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
  );
}
