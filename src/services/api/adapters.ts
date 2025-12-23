// Map backend payloads to frontend shapes while keeping display labels in French.

const statusMapClient: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
};

const statusMapCommon: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  on_hold: "En attente",
  closed: "Fermé",
};

const caseStatusMap: Record<string, string> = {
  open: "En cours",
  in_progress: "En cours",
  on_hold: "En attente",
  closed: "Clos",
  Suspendu: "Suspendu",
  "En cours": "En cours",
  "En attente": "En attente",
  "Clos": "Clos",
};

const priorityMap: Record<string, string> = {
  "Basse": "Basse",
  "Moyenne": "Moyenne",
  "Haute": "Haute",
  "Urgent": "Urgent",
  // Fallbacks for English values
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgent",
};

const taskStatusMap: Record<string, string> = {
  "Non commencee": "Non commencée",
  "En cours": "En cours",
  "Bloqué": "Bloqué",
  "Terminee": "Terminée",
  "Annulé": "Annulé",
  "En attente": "En attente",
  "Planifiee": "Planifiée",
  // Fallbacks for English values
  todo: "Non commencée",
  in_progress: "En cours",
  blocked: "Bloqué",
  done: "Terminée",
  cancelled: "Annulé",
};

const sessionStatusMap: Record<string, string> = {
  scheduled: "Programmée",
  completed: "Terminée",
  cancelled: "Annulée",
  postponed: "Reportée",
};

const sessionTypeMap: Record<string, string> = {
  hearing: "Audience",
  consultation: "Consultation",
  mediation: "Médiation",
  expertise: "Expertise",
  phone: "Téléphone",
  other: "Autre",
};

const dateOnly = (value?: string | null) =>
  value ? value.split("T")[0] : null;

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  return value.replace("T", " ").split(".")[0];
};

const officerStatusMap: Record<string, string> = {
  active: "Disponible",
  busy: "Occupé",
  inactive: "Inactif",
  suspended: "Suspendu",
};

const financialStatusMap: Record<string, string> = {
  pending: "draft",
  posted: "confirmed",
  paid: "paid",
  void: "cancelled",
};

const missionStatusMap: Record<string, string> = {
  planned: "Planifiée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

export function adaptClient(api: any) {
  return {
    id: api.id,
    name: api.name ?? "",
    email: api.email ?? "",
    phone: api.phone ?? "",
    alternatePhone: api.alternate_phone ?? "",
    status: statusMapClient[api.status] ?? api.status ?? "",
    joinDate: dateOnly(api.join_date) || dateOnly(api.created_at),
    cin: api.cin ?? "",
    dateOfBirth: dateOnly(api.date_of_birth),
    profession: api.profession ?? "",
    company: api.company ?? "",
    taxId: api.tax_id ?? "",
    address: api.address ?? "",
    notes: api.notes ?? "",
  };
}

export function adaptDossier(api: any, clientsById: Record<number, any>) {
  const clientName = clientsById[api.client_id]?.name ?? `Client #${api.client_id}`;
  return {
    id: api.id,
    caseNumber: api.reference ?? api.case_number ?? "",
    title: api.title ?? "",
    clientId: api.client_id,
    client: clientName,
    status: statusMapCommon[api.status] ?? api.status ?? "",
    openDate: dateOnly(api.opened_at),
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    phase: api.phase ?? "",
    category: api.category ?? "",
    assignedLawyer: api.assigned_lawyer ?? "",
    description: api.description ?? "",
    adversary: api.adversary_party ?? "",
    adversaryParty: api.adversary_party ?? "",
    adversaryLawyer: api.adversary_lawyer ?? "",
    estimatedValue: api.estimated_value ?? "",
    courtReference: api.court_reference ?? "",
    nextDeadline: dateOnly(api.next_deadline),
    relatedCases: api.relatedCases || [],
  };
}

export function adaptCase(api: any, dossiersById: Record<number, any>) {
  const dossierTitle = dossiersById[api.dossier_id]?.caseNumber ?? "";
  return {
    id: api.id,
    caseNumber: api.reference ?? api.case_number ?? "",
    title: api.title ?? "",
    dossierId: api.dossier_id,
    dossier: dossierTitle,
    status: caseStatusMap[api.status] ?? api.status ?? "",
    openDate: dateOnly(api.opened_at),
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    adversaire: api.adversary ?? "",
    adversaryParty: api.adversary_party ?? "",
    adversaryLawyer: api.adversary_lawyer ?? "",
    court: api.court ?? "",
    courtRoom: api.court_room ?? "",
    judge: api.judge ?? "",
    filingDate: dateOnly(api.filing_date),
    nextHearing: dateOnly(api.next_hearing),
    referenceNumber: api.reference_number ?? "",
    description: api.description ?? "",
  };
}

export function adaptTask(api: any, dossiersById: Record<number, any>, casesById: Record<number, any>) {
  const parentType = api.dossier_id ? "dossier" : "case";
  const dossierLabel =
    api.dossier_id && dossiersById[api.dossier_id]
      ? dossiersById[api.dossier_id].caseNumber ?? dossiersById[api.dossier_id].title
      : "";
  const caseLabel =
    api.case_id && casesById[api.case_id]
      ? casesById[api.case_id].caseNumber ?? casesById[api.case_id].title
      : "";

  return {
    id: api.id,
    title: api.title ?? "",
    parentType,
    dossierId: api.dossier_id ?? null,
    caseId: api.case_id ?? null,
    dossier: dossierLabel,
    case: caseLabel,
    assignedTo: api.assigned_to ?? "",
    dueDate: dateOnly(api.due_date),
    estimatedTime: api.estimated_time ?? "",
    status: taskStatusMap[api.status] ?? api.status ?? "",
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    description: api.description ?? "",
    createdDate: dateOnly(api.created_at),
  };
}

export function adaptSession(api: any, dossiersById: Record<number, any>, casesById: Record<number, any>) {
  const dossierLabel =
    api.dossier_id && dossiersById[api.dossier_id]
      ? dossiersById[api.dossier_id].caseNumber ?? dossiersById[api.dossier_id].title
      : "";
  const caseLabel =
    api.case_id && casesById[api.case_id]
      ? casesById[api.case_id].caseNumber ?? casesById[api.case_id].title
      : "";
  return {
    id: api.id,
    title: api.title || api.notes || api.session_type || "Session",
    type: sessionTypeMap[api.session_type] ?? api.session_type ?? "",
    dossierId: api.dossier_id ?? null,
    caseId: api.case_id ?? null,
    dossier: dossierLabel,
    caseName: caseLabel,
    date: dateOnly(api.scheduled_at),
    time: api.scheduled_at ? api.scheduled_at.split("T")[1]?.slice(0, 5) ?? "" : "",
    scheduledAt: api.scheduled_at ?? "",
    status: sessionStatusMap[api.status] ?? api.status ?? "",
    location: api.location ?? "",
    duration: api.duration ?? "",
    outcome: api.outcome ?? "",
    notes: api.notes ?? "",
    description: api.description ?? api.notes ?? "",
  };
}

export function adaptOfficer(api: any) {
  return {
    id: api.id,
    name: api.name ?? "",
    specialization: api.specialization ?? "",
    phone: api.phone ?? "",
    email: api.email ?? "",
    location: api.agency ?? "",
    status: officerStatusMap[api.status] ?? api.status ?? "",
    registrationNumber: api.registration_number ?? "",
    notes: api.notes ?? "",
    missions: [],
  };
}

export function adaptFinancialEntry(
  api: any,
  clientsById: Record<number, any>,
  dossiersById: Record<number, any>,
  casesById: Record<number, any>
) {
  const clientName = api.client_id ? (clientsById[api.client_id]?.name ?? `Client #${api.client_id}`) : "";
  const dossierRef = api.dossier_id ? (dossiersById[api.dossier_id]?.caseNumber ?? `DOS-${api.dossier_id}`) : "";
  const caseRef = api.case_id ? (casesById[api.case_id]?.caseNumber ?? `PRO-${api.case_id}`) : "";
  const mappedStatus = financialStatusMap[api.status] ?? api.status ?? "draft";
  const type = api.entry_type === "income" ? "revenue" : "expense";

  return {
    id: api.id,
    type,
    category: api.category ?? "other",
    amount: Number(api.amount || 0),
    currency: api.currency ?? "USD",
    date: dateOnly(api.due_date) || dateOnly(api.created_at) || "",
    description: api.description ?? "",
    status: mappedStatus,
    scope: api.scope ?? "client",
    clientId: api.client_id ?? null,
    clientName,
    dossierId: api.dossier_id ?? null,
    dossierReference: dossierRef,
    caseId: api.case_id ?? null,
    caseReference: caseRef,
    missionId: api.mission_id ?? null,
    taskId: null,
    personalTaskId: null,
    documentId: null,
    reference: api.reference ?? "",
  };
}

export function adaptMission(
  api: any,
  dossiersById: Record<number, any>,
  casesById: Record<number, any>
) {
  const entityType = api.dossier_id ? "dossier" : api.case_id ? "case" : null;
  const dossierRef =
    api.dossier_id && dossiersById[api.dossier_id]
      ? dossiersById[api.dossier_id].caseNumber ?? `DOS-${api.dossier_id}`
      : "";
  const caseRef =
    api.case_id && casesById[api.case_id]
      ? casesById[api.case_id].caseNumber ?? `PRO-${api.case_id}`
      : "";

  return {
    id: api.id,
    missionNumber: api.reference ?? `MIS-${api.id}`,
    title: api.title ?? "",
    missionType: api.mission_type ?? "",
    status: missionStatusMap[api.status] ?? api.status ?? "",
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    dueDate: dateOnly(api.due_date),
    closedAt: dateOnly(api.closed_at),
    officerId: api.officer_id ?? null,
    officerName: "",
    entityType,
    entityId: api.dossier_id ?? api.case_id ?? null,
    entityReference: entityType === "dossier" ? dossierRef : caseRef,
    description: api.description ?? "",
  };
}

const personalTaskStatusMap: Record<string, string> = {
  "Non commencée": "Non commencée",
  "En attente": "En attente",
  "En cours": "En cours",
  "Planifiée": "Planifiée",
  "Terminée": "Terminée",
  // Fallbacks for English values
  todo: "Non commencée",
  in_progress: "En cours",
  blocked: "Bloqué",
  done: "Terminé",
  cancelled: "Annulé",
};

export function adaptPersonalTask(api: any) {
  return {
    id: api.id,
    title: api.title ?? "",
    description: api.description ?? "",
    category: api.category ?? "",
    status: personalTaskStatusMap[api.status] ?? api.status ?? "",
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    dueDate: dateOnly(api.due_date),
    completedAt: dateOnly(api.completed_at),
    notes: api.notes ?? "",
    createdDate: dateOnly(api.created_at),
  };
}

export function adaptHistory(api: any) {
  return {
    id: api.id,
    entityType: api.entity_type,
    entityId: api.entity_id,
    action: api.action,
    description: api.description,
    createdAt: api.created_at,
    actor: api.actor || "system",
    changedFields: api.changed_fields,
    timelineEntry: {
      type: api.action || "action",
      event: api.description || api.action || "Événement",
      date: formatDateTime(api.created_at),
    },
  };
}
