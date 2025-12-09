/**
 * mockData.js
 * Central mock data for list views plus extended detail data for the DetailView.
 * This file avoids self-imports to prevent circular dependencies in Vite/ESM.
 */

// Base mock data used by list/table screens
export const mockClients = [
  {
    id: 1,
    name: "Ahmed Ben Ali",
    email: "ahmed.benali@email.com",
    phone: "+216 98 123 456",
    status: "Active",
    joinDate: "2024-01-15",
  },
  {
    id: 2,
    name: "Fatima Trabelsi",
    email: "fatima.trabelsi@email.com",
    phone: "+216 22 654 321",
    status: "Active",
    joinDate: "2024-02-20",
  },
  {
    id: 3,
    name: "Youssef Mansour",
    email: "y.mansour@email.com",
    phone: "+216 54 987 321",
    status: "En attente",
    joinDate: "2024-03-05",
  },
  {
    id: 4,
    name: "Nadia Baccar",
    email: "nadia.baccar@email.com",
    phone: "+216 23 111 222",
    status: "Inactive",
    joinDate: "2024-04-18",
  },
];

export const mockDossiers = [
  {
    id: 1,
    caseNumber: "DOS-2024-001",
    title: "Affaire Commerciale - Contrat",
    client: "Ahmed Ben Ali",
    status: "En cours",
    openDate: "2024-01-15",
    priority: "Haute",
  },
  {
    id: 2,
    caseNumber: "DOS-2024-002",
    title: "Divorce Contentieux",
    client: "Fatima Trabelsi",
    status: "En cours",
    openDate: "2024-02-10",
    priority: "Moyenne",
  },
  {
    id: 3,
    caseNumber: "DOS-2024-003",
    title: "Contentieux Fiscal",
    client: "Youssef Mansour",
    status: "En attente",
    openDate: "2024-03-20",
    priority: "Basse",
  },
];

export const mockTasks = [
  {
    id: 1,
    title: "Préparer dossier plaidoirie",
    dossier: "DOS-2024-001",
    assignedTo: "Me. Hammami",
    dueDate: "2025-12-15",
    status: "En cours",
    priority: "Haute",
  },
  {
    id: 2,
    title: "Rédiger conclusions",
    dossier: "DOS-2024-002",
    assignedTo: "Me. Sassi",
    dueDate: "2025-12-20",
    status: "En attente",
    priority: "Moyenne",
  },
  {
    id: 3,
    title: "Suivi fiscal trimestriel",
    dossier: "DOS-2024-003",
    assignedTo: "Me. Cherif",
    dueDate: "2025-01-10",
    status: "Terminée",
    priority: "Basse",
  },
];

export const mockCases = [
  {
    id: 1,
    caseNumber: "PRO-2024-001",
    title: "Litige commercial",
    dossier: "DOS-2024-001",
    court: "TPI Tunis",
    nextHearing: "2025-12-20",
    status: "En cours",
  },
  {
    id: 2,
    caseNumber: "PRO-2024-002",
    title: "Appel divorce",
    dossier: "DOS-2024-002",
    court: "Cour d'Appel Tunis",
    nextHearing: "2026-01-15",
    status: "En appel",
  },
];

export const mockSessions = [
  {
    id: 1,
    title: "Consultation initiale",
    type: "Consultation",
    date: "2024-12-10",
    time: "10:00",
    duration: "1h",
    location: "Cabinet",
    status: "Confirmée",
  },
  {
    id: 2,
    title: "Audience TPI",
    type: "Audience",
    date: "2024-12-20",
    time: "09:00",
    duration: "2h",
    location: "Tribunal Tunis",
    status: "En attente",
  },
  {
    id: 3,
    title: "Médiation familiale",
    type: "Médiation",
    date: "2025-01-05",
    time: "14:00",
    duration: "1h30",
    location: "En ligne",
    status: "Annulée",
  },
];

export const mockCourses = [
  {
    id: 1,
    title: "Droit des contrats avancé",
    instructor: "Dr. Amel Kefi",
    date: "2025-01-20",
    duration: "4h",
    price: "250 TND",
    status: "Planifiée",
  },
  {
    id: 2,
    title: "Médiation et arbitrage",
    instructor: "Me. Sami Ben Khalifa",
    date: "2025-02-10",
    duration: "3h",
    price: "200 TND",
    status: "Planifiée",
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
  },
  {
    id: 2,
    name: "Me. Rania Mbarek",
    specialization: "Constat",
    phone: "+216 27 333 444",
    email: "rania.mbarek@huissier.tn",
    location: "Ariana",
    status: "Occupé",
  },
];

export const mockAccounting = [
  {
    id: 1,
    invoiceNumber: "FACT-2024-001",
    client: "Ahmed Ben Ali",
    amount: "1,500 TND",
    date: "2024-11-15",
    dueDate: "2024-12-15",
    type: "Honoraires",
    status: "Payée",
  },
  {
    id: 2,
    invoiceNumber: "FACT-2024-002",
    client: "Fatima Trabelsi",
    amount: "2,200 TND",
    date: "2024-11-20",
    dueDate: "2024-12-20",
    type: "Honoraires",
    status: "En attente",
  },
  {
    id: 3,
    invoiceNumber: "FACT-2024-003",
    client: "Youssef Mansour",
    amount: "3,500 TND",
    date: "2024-10-01",
    dueDate: "2024-11-01",
    type: "Frais",
    status: "En retard",
  },
];

// Map a status string to a Tailwind color badge
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
    Terminée:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Payée:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    "En retard": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    Annulée:
      "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    Planifiée:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    Confirmée:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Occupé:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    Disponible:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };
  return (
    map[status] ||
    "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
  );
}

// Extended data used by the detail view (keep original rich objects)
export const mockClientsExtended = {
  1: {
    id: 1,
    name: "Ahmed Ben Ali",
    email: "ahmed.benali@email.com",
    phone: "+216 98 123 456",
    alternatePhone: "+216 71 234 567",
    status: "Active",
    joinDate: "2024-01-15",
    address: "15 Avenue Habib Bourguiba, Tunis 1000",
    cin: "12345678",
    dateOfBirth: "1985-05-20",
    profession: "Entrepreneur",
    company: "Tech Solutions SARL",
    taxId: "1234567X",
    notes:
      "Client important - Préfère les rendez-vous matinaux. Parle français et arabe.",
    documents: [
      {
        id: 1,
        name: "CIN - Recto Verso.pdf",
        type: "pdf",
        size: "245 KB",
        date: "2024-01-15",
        category: "Identité",
      },
      {
        id: 2,
        name: "Contrat Cabinet.pdf",
        type: "pdf",
        size: "890 KB",
        date: "2024-01-15",
        category: "Contrat",
      },
      {
        id: 3,
        name: "Procuration.pdf",
        type: "pdf",
        size: "156 KB",
        date: "2024-02-10",
        category: "Juridique",
      },
    ],
    relatedDossiers: [
      {
        id: 1,
        caseNumber: "DOS-2024-001",
        title: "Affaire Commerciale - Contrat",
        status: "En cours",
      },
      {
        id: 5,
        caseNumber: "DOS-2024-004",
        title: "Recouvrement Créances",
        status: "En cours",
      },
    ],
    invoices: [
      {
        id: 1,
        number: "FACT-2024-001",
        amount: "1,500 TND",
        status: "Payée",
        date: "2024-11-15",
      },
      {
        id: 6,
        number: "FACT-2024-006",
        amount: "2,800 TND",
        status: "Émise",
        date: "2024-12-01",
      },
    ],
    timeline: [
      { date: "2024-12-08", event: "Consultation téléphonique", type: "call" },
      { date: "2024-11-25", event: "Rendez-vous au cabinet", type: "meeting" },
      {
        date: "2024-11-15",
        event: "Paiement reçu - FACT-2024-001",
        type: "payment",
      },
      {
        date: "2024-02-10",
        event: "Document ajouté - Procuration",
        type: "document",
      },
      { date: "2024-01-15", event: "Client ajouté", type: "created" },
    ],
  },
  2: {
    id: 2,
    name: "Fatima Trabelsi",
    email: "fatima.trabelsi@email.com",
    phone: "+216 22 654 321",
    alternatePhone: "+216 71 456 789",
    status: "Active",
    joinDate: "2024-02-20",
    address: "42 Rue de la Liberté, Ariana 2080",
    cin: "87654321",
    dateOfBirth: "1990-08-15",
    profession: "Médecin",
    company: "Clinique Espoir",
    taxId: "9876543Y",
    notes: "Préfère être contactée par email. Dossier sensible.",
    documents: [
      {
        id: 4,
        name: "CIN.pdf",
        type: "pdf",
        size: "198 KB",
        date: "2024-02-20",
        category: "Identité",
      },
      {
        id: 5,
        name: "Acte de Mariage.pdf",
        type: "pdf",
        size: "456 KB",
        date: "2024-02-20",
        category: "État Civil",
      },
      {
        id: 6,
        name: "Jugement Divorce.pdf",
        type: "pdf",
        size: "1.2 MB",
        date: "2024-10-15",
        category: "Juridique",
      },
    ],
    relatedDossiers: [
      {
        id: 2,
        caseNumber: "DOS-2024-002",
        title: "Divorce Contentieux",
        status: "En cours",
      },
    ],
    invoices: [
      {
        id: 2,
        number: "FACT-2024-002",
        amount: "2,200 TND",
        status: "En attente",
        date: "2024-11-20",
      },
    ],
    timeline: [
      {
        date: "2024-11-20",
        event: "Facture émise - FACT-2024-002",
        type: "invoice",
      },
      {
        date: "2024-10-15",
        event: "Document ajouté - Jugement",
        type: "document",
      },
      { date: "2024-09-05", event: "Audience au tribunal", type: "hearing" },
      { date: "2024-02-20", event: "Client ajouté", type: "created" },
    ],
  },
};

// Dossiers with full details
export const mockDossiersExtended = {
  1: {
    id: 1,
    caseNumber: "DOS-2024-001",
    title: "Affaire Commerciale - Contrat",
    client: { id: 1, name: "Ahmed Ben Ali" },
    status: "En cours",
    openDate: "2024-01-15",
    closeDate: null,
    priority: "Haute",
    category: "Commercial",
    description:
      "Litige contractuel concernant un contrat de prestation de services informatiques. Le client réclame des dommages et intérêts pour non-respect des délais de livraison.",
    adversaryParty: "Digital Systems SA",
    adversaryLawyer: "Me. Karim Jlassi",
    estimatedValue: "50,000 TND",
    courtReference: "TPI-2024-1234",
    assignedLawyer: "Me. Mohamed Hammami",
    nextDeadline: "2025-12-15",
    documents: [
      {
        id: 7,
        name: "Contrat Principal.pdf",
        type: "pdf",
        size: "2.3 MB",
        date: "2024-01-15",
        category: "Contrat",
      },
      {
        id: 8,
        name: "Échange Emails.pdf",
        type: "pdf",
        size: "890 KB",
        date: "2024-01-20",
        category: "Correspondance",
      },
      {
        id: 9,
        name: "Mise en Demeure.pdf",
        type: "pdf",
        size: "345 KB",
        date: "2024-02-10",
        category: "Juridique",
      },
      {
        id: 10,
        name: "Conclusions.docx",
        type: "docx",
        size: "567 KB",
        date: "2024-11-30",
        category: "Plaidoirie",
      },
      {
        id: 11,
        name: "Expertise Technique.pdf",
        type: "pdf",
        size: "4.5 MB",
        date: "2024-10-15",
        category: "Expertise",
      },
    ],
    tasks: [
      {
        id: 1,
        title: "Préparer dossier plaidoirie",
        status: "En cours",
        dueDate: "2025-12-15",
        assignee: "Me. Hammami",
      },
      {
        id: 5,
        title: "Déposer requête tribunal",
        status: "En attente",
        dueDate: "2025-12-12",
        assignee: "Me. Hammami",
      },
    ],
    proceedings: [
      {
        id: 1,
        caseNumber: "PRO-2024-001",
        title: "Tribunal de Première Instance - Tunis",
        nextHearing: "2025-12-20",
        status: "En cours",
      },
    ],
    timeline: [
      {
        date: "2024-12-08",
        event: "Réunion préparatoire avec le client",
        type: "meeting",
      },
      {
        date: "2024-11-30",
        event: "Conclusions rédigées et déposées",
        type: "document",
      },
      {
        date: "2024-10-15",
        event: "Rapport d'expertise reçu",
        type: "document",
      },
      {
        date: "2024-09-20",
        event: "Audience de mise en état",
        type: "hearing",
      },
      { date: "2024-02-10", event: "Mise en demeure envoyée", type: "action" },
      { date: "2024-01-15", event: "Dossier ouvert", type: "created" },
    ],
    notes: [
      {
        id: 1,
        date: "2024-12-08",
        author: "Me. Hammami",
        content:
          "Client très coopératif. Tous les documents nécessaires ont été fournis. Préparation de l'audience finale.",
      },
      {
        id: 2,
        date: "2024-11-15",
        author: "Me. Hammami",
        content:
          "Expertise technique favorable. Preuves solides du non-respect des délais contractuels.",
      },
    ],
    financials: {
      totalFees: "3,500 TND",
      paidAmount: "1,500 TND",
      pendingAmount: "2,000 TND",
      expenses: "450 TND",
    },
  },
  2: {
    id: 2,
    caseNumber: "DOS-2024-002",
    title: "Divorce Contentieux",
    client: { id: 2, name: "Fatima Trabelsi" },
    status: "En cours",
    openDate: "2024-02-10",
    closeDate: null,
    priority: "Moyenne",
    category: "Famille",
    description:
      "Procédure de divorce contentieux avec litige sur la garde des enfants et la pension alimentaire.",
    adversaryParty: "Karim Trabelsi",
    adversaryLawyer: "Me. Sonia Mestiri",
    estimatedValue: "N/A",
    courtReference: "TPI-FAM-2024-567",
    assignedLawyer: "Me. Asma Sassi",
    nextDeadline: "2025-12-20",
    documents: [
      {
        id: 12,
        name: "Acte de Mariage.pdf",
        type: "pdf",
        size: "456 KB",
        date: "2024-02-10",
        category: "État Civil",
      },
      {
        id: 13,
        name: "Requête en Divorce.pdf",
        type: "pdf",
        size: "678 KB",
        date: "2024-02-15",
        category: "Juridique",
      },
      {
        id: 14,
        name: "Certificats Naissance Enfants.pdf",
        type: "pdf",
        size: "234 KB",
        date: "2024-02-10",
        category: "État Civil",
      },
      {
        id: 15,
        name: "Rapport Enquête Sociale.pdf",
        type: "pdf",
        size: "1.8 MB",
        date: "2024-09-20",
        category: "Expertise",
      },
    ],
    tasks: [
      {
        id: 2,
        title: "Rédiger conclusions",
        status: "Non commencée",
        dueDate: "2025-12-20",
        assignee: "Me. Sassi",
      },
    ],
    proceedings: [
      {
        id: 2,
        caseNumber: "PRO-2024-002",
        title: "Cour d'Appel - Affaire Civile",
        nextHearing: "2026-01-15",
        status: "En appel",
      },
    ],
    timeline: [
      {
        date: "2024-09-20",
        event: "Rapport d'enquête sociale reçu",
        type: "document",
      },
      {
        date: "2024-07-15",
        event: "Tentative de conciliation échouée",
        type: "mediation",
      },
      { date: "2024-05-10", event: "Première audience", type: "hearing" },
      {
        date: "2024-02-15",
        event: "Requête déposée au tribunal",
        type: "action",
      },
      { date: "2024-02-10", event: "Dossier ouvert", type: "created" },
    ],
    notes: [
      {
        id: 3,
        date: "2024-11-20",
        author: "Me. Sassi",
        content:
          "Cliente très stressée. Situation familiale complexe. Besoin de soutien psychologique.",
      },
      {
        id: 4,
        date: "2024-09-25",
        author: "Me. Sassi",
        content:
          "Rapport social favorable à notre cliente pour la garde des enfants.",
      },
    ],
    financials: {
      totalFees: "4,000 TND",
      paidAmount: "0 TND",
      pendingAmount: "4,000 TND",
      expenses: "320 TND",
    },
  },
};

// Tasks with full details
export const mockTasksExtended = {
  1: {
    id: 1,
    title: "Préparer dossier plaidoirie",
    description:
      "Préparer l'ensemble du dossier de plaidoirie pour l'audience du 20 décembre. Inclure tous les documents, conclusions, et pièces justificatives.",
    dossier: {
      id: 1,
      caseNumber: "DOS-2024-001",
      title: "Affaire Commerciale - Contrat",
    },
    assignedTo: "Me. Hammami",
    createdBy: "Me. Hammami",
    dueDate: "2025-12-15",
    createdDate: "2024-11-01",
    status: "En cours",
    priority: "Haute",
    progress: 75,
    estimatedHours: 8,
    actualHours: 6,
    checklist: [
      { id: 1, item: "Relire toutes les pièces du dossier", completed: true },
      { id: 2, item: "Vérifier la jurisprudence pertinente", completed: true },
      { id: 3, item: "Préparer les conclusions finales", completed: true },
      {
        id: 4,
        item: "Organiser les documents chronologiquement",
        completed: false,
      },
      {
        id: 5,
        item: "Préparer les questions pour contre-interrogatoire",
        completed: false,
      },
    ],
    attachments: [
      {
        id: 16,
        name: "Notes Plaidoirie.docx",
        type: "docx",
        size: "123 KB",
        date: "2024-12-05",
      },
      {
        id: 17,
        name: "Jurisprudence Similaire.pdf",
        type: "pdf",
        size: "567 KB",
        date: "2024-12-03",
      },
    ],
    comments: [
      {
        id: 1,
        date: "2024-12-05",
        author: "Me. Hammami",
        content: "Avancement bon. Toutes les pièces sont organisées.",
      },
      {
        id: 2,
        date: "2024-11-25",
        author: "Me. Hammami",
        content: "Recherche jurisprudentielle terminée.",
      },
    ],
    tags: ["urgent", "audience", "plaidoirie"],
  },
};

export const mockSessionsExtended = {
  1: {
    id: 1,
    title: "Consultation initiale",
    type: "Consultation",
    date: "2024-12-10",
    time: "10:00",
    duration: "1h",
    location: "Cabinet",
    status: "Confirmée",

    client: { id: 1, name: "Ahmed Ben Ali" },
    dossier: null,

    notes:
      "Analyse initiale du litige commercial. Le client a fourni tous les documents nécessaires.",
    documents: [
      {
        id: 101,
        name: "Notes Consultation.pdf",
        type: "pdf",
        size: "145 KB",
        date: "2024-12-10",
      },
    ],
    timeline: [
      { date: "2024-12-10", event: "Consultation effectuée", type: "meeting" },
      { date: "2024-12-05", event: "Rappel SMS envoyé", type: "notification" },
    ],
  },

  2: {
    id: 2,
    title: "Audience TPI",
    type: "Audience",
    date: "2024-12-20",
    time: "09:00",
    duration: "2h",
    location: "Tribunal Tunis",
    status: "En attente",

    client: { id: 2, name: "Fatima Trabelsi" },
    dossier: {
      id: 2,
      caseNumber: "DOS-2024-002",
      title: "Divorce Contentieux",
    },

    notes: "Audience importante concernant la garde temporaire.",
    documents: [
      {
        id: 102,
        name: "Convocation Audience.pdf",
        type: "pdf",
        size: "298 KB",
        date: "2024-12-01",
      },
    ],
    timeline: [
      { date: "2024-12-01", event: "Convocation reçue", type: "document" },
    ],
  },

  3: {
    id: 3,
    title: "Médiation familiale",
    type: "Médiation",
    date: "2025-01-05",
    time: "14:00",
    duration: "1h30",
    location: "En ligne",
    status: "Annulée",

    client: { id: 2, name: "Fatima Trabelsi" },
    dossier: {
      id: 2,
      caseNumber: "DOS-2024-002",
      title: "Divorce Contentieux",
    },

    notes: "Annulée suite à un empêchement de la partie adverse.",
    documents: [],
    timeline: [
      { date: "2025-01-04", event: "Annulation confirmée", type: "cancel" },
    ],
  },
};

export const mockPersonalTasks = [
  {
    id: 1,
    title: "Payer facture électricité",
    category: "Factures",
    dueDate: "2024-12-15",
    priority: "Haute",
    status: "En attente",
    notes: "Facture du mois de novembre",
  },
  {
    id: 2,
    title: "Rendez-vous médical annuel",
    category: "Santé",
    dueDate: "2025-01-10",
    priority: "Moyenne",
    status: "Confirmée",
    notes: "Chez le Dr. Amine Khelifi",
  },
  {
    id: 3,
    title: "Acheter cadeau anniversaire mère",
    category: "Personnel",
    dueDate: "2024-12-20",
    priority: "Basse",
    status: "En attente",
    notes: "Bijoux ou parfum",
  },
];

export const mockOfficersExtended = {
  1: {
    id: 1,
    name: "Me. Karim Jlassi",
    specialization: "Signification",
    phone: "+216 55 111 222",
    email: "karim.jlassi@huissier.tn",
    location: "Tunis",
    status: "Disponible",

    documents: [
      {
        id: 301,
        name: "Carte Professionnelle.pdf",
        type: "pdf",
        size: "350 KB",
        date: "2024-06-10",
      },
    ],
    assignments: [
      {
        dossierId: 1,
        title: "Mise en demeure - Affaire Commerciale",
        date: "2024-02-10",
      },
      { dossierId: 5, title: "Constat de présence", date: "2024-11-15" },
    ],
    timeline: [
      { date: "2024-11-15", event: "Constat effectué", type: "action" },
      { date: "2024-06-10", event: "Document vérifié", type: "document" },
    ],
  },

  2: {
    id: 2,
    name: "Me. Rania Mbarek",
    specialization: "Constat",
    phone: "+216 27 333 444",
    email: "rania.mbarek@huissier.tn",
    location: "Ariana",
    status: "Occupé",

    documents: [],
    assignments: [
      { dossierId: 2, title: "Constat domicile", date: "2024-08-05" },
    ],
    timeline: [
      { date: "2024-08-05", event: "Constat réalisé", type: "action" },
    ],
  },
};

export const mockAccountingExtended = {
  1: {
    id: 1,
    invoiceNumber: "FACT-2024-001",
    client: { id: 1, name: "Ahmed Ben Ali" },
    amount: "1,500 TND",
    date: "2024-11-15",
    dueDate: "2024-12-15",
    type: "Honoraires",
    status: "Payée",

    items: [
      { id: 1, description: "Consultation", quantity: 1, price: 300 },
      { id: 2, description: "Rédaction Contrat", quantity: 1, price: 1200 },
    ],
    payments: [{ id: 1, amount: 1500, date: "2024-11-15", method: "Virement" }],
    notes: "Payée intégralement le même jour.",
  },

  2: {
    id: 2,
    invoiceNumber: "FACT-2024-002",
    client: { id: 2, name: "Fatima Trabelsi" },
    amount: "2,200 TND",
    date: "2024-11-20",
    dueDate: "2024-12-20",
    type: "Honoraires",
    status: "En attente",

    items: [
      { id: 1, description: "Audience", quantity: 1, price: 800 },
      { id: 2, description: "Consultation", quantity: 2, price: 700 },
    ],
    payments: [],
    notes: "Cliente a demandé un échéancier.",
  },

  3: {
    id: 3,
    invoiceNumber: "FACT-2024-003",
    client: { id: 3, name: "Youssef Mansour" },
    amount: "3,500 TND",
    date: "2024-10-01",
    dueDate: "2024-11-01",
    type: "Frais",
    status: "En retard",

    items: [
      { id: 1, description: "Expertise Fiscale", quantity: 1, price: 3500 },
    ],
    payments: [],
    notes: "Plusieurs rappels envoyés. Client difficile à joindre.",
  },
};

export const mockCasesExtended = {
  1: {
    id: 1,
    caseNumber: "PRO-2024-001",
    title: "Litige commercial",
    dossier: {
      id: 1,
      caseNumber: "DOS-2024-001",
      title: "Affaire Commerciale - Contrat",
    },
    court: "TPI Tunis",
    nextHearing: "2025-12-20",
    status: "En cours",
    judge: "Mme. Leila Saidi",
    hearingHistory: [
      { date: "2024-09-20", outcome: "Audience de mise en état tenue" },
      { date: "2024-12-20", outcome: "Audience finale prévue" },
    ],
    documents: [
      {
        id: 401,
        name: "Ordonnance Mise en État.pdf",
        type: "pdf",
        size: "456 KB",
        date: "2024-09-25",
      },
    ],
    notes:
      "Le juge semble favorable à notre position selon les dernières audiences.",
  },

  2: {
    id: 2,
    caseNumber: "PRO-2024-002",
    title: "Appel divorce",
    dossier: {
      id: 2,
      caseNumber: "DOS-2024-002",
      title: "Divorce Contentieux",
    },
    court: "Cour d'Appel Tunis",
    nextHearing: "2026-01-15",
    status: "En appel",
    judge: "M. Hichem Bouazizi",
    hearingHistory: [
      { date: "2024-05-10", outcome: "Première audience tenue" },
      { date: "2025-01-15", outcome: "Audience d'appel prévue" },
    ],
    documents: [
      {
        id: 402,
        name: "Jugement TPI.pdf",
        type: "pdf",
        size: "1.2 MB",
        date: "2024-05-20",
      },
    ],
    notes:
      "L'appel est basé sur des erreurs de procédure lors du jugement initial.",
  },
};

// Helper to get extended data by ID
export function getExtendedData(type, id) {
  const dataMap = {
    client: mockClientsExtended,
    dossier: mockDossiersExtended,
    task: mockTasksExtended,
    session: mockSessionsExtended,
    personalTask: mockPersonalTasks,
    officer: mockOfficersExtended,
    invoice: mockAccountingExtended,
    case: mockCasesExtended,
  };

  return dataMap[type]?.[id] || null;
}
