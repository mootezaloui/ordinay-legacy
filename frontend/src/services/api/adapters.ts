/* eslint-disable @typescript-eslint/no-explicit-any */
// Map backend payloads to frontend shapes while keeping display labels in French.

import { getStoredCurrency } from "../../utils/currency";

const statusMapClient: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  inActive: "Inactive", // Handle mixed-case variant from legacy database
};

const statusMapCommon: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  closed: "Closed",
};

const lawsuitStatusMap: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  closed: "Closed",
  Suspended: "Suspended",
 
};

const priorityMap: Record<string, string> = {
  "Low": "Low",
  "Medium": "Medium",
  "High": "High",
  "Urgent": "Urgent",
  // Fallbacks for English values
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const taskStatusMap: Record<string, string> = {
  "Not Started": "Not Started",
  "In Progress": "In Progress",
  "Blocked": "Blocked",
  "Done": "Done",
  "Cancelled": "Cancelled",
  // Database values
  todo: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const sessionStatusMap: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

const sessionTypeMap: Record<string, string> = {
  hearing: "Audience",
  consultation: "Consultation",
  mediation: "Mediation",
  expertise: "Expertise",
  phone: "Telephone",
  other: "Other",
};

const dateOnly = (value?: string | null) =>
  value ? value.split("T")[0] : null;

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  return value.replace("T", " ").split(".")[0];
};

const officerStatusMap: Record<string, string> = {
  active: "Available",
  busy: "Busy",
  inactive: "Inactive",
};

// ========================================
// FINANCIAL STATUS NORMALIZATION (Phase 1 Stabilization)
// ========================================
// Canonical statuses: draft, confirmed, cancelled
// All legacy values are mapped to canonical ones

const financialStatusMap: Record<string, string> = {
  // Canonical statuses (pass through)
  draft: "draft",
  confirmed: "confirmed",
  cancelled: "cancelled",
  // Legacy mappings from database
  pending: "draft",
  posted: "confirmed",
  paid: "confirmed", // paid = confirmed + paidAt set
  void: "cancelled",
};

/**
 * Normalize financial status to canonical value
 */
// Accepts status and paid_at (optional)
const normalizeFinancialStatus = (status: string | null | undefined): string => {
  if (!status) return "draft";
  const lowered = String(status).toLowerCase();
  // Only show 'paid' if status is 'paid'. If status is 'confirmed', always show 'confirmed' (even if paidAt is set)
  if (lowered === "paid") {
    return "paid";
  }
  if (lowered === "confirmed") {
    return "confirmed";
  }
  return financialStatusMap[lowered] || financialStatusMap[status] || "draft";
};

/**
 * Determine direction based on entry type and scope
 * receivable = client owes money
 * payable = firm expense (not client's obligation)
 */
const determineDirection = (
  entryType: string | null | undefined,
  scope: string | null | undefined,
  existingDirection: string | null | undefined
): string => {
  // Use existing direction if provided
  if (existingDirection) return existingDirection;
  
  // Internal expenses are firm costs, not client obligations
  if (scope === "internal") {
    return "payable";
  }
  // Revenue/income and client-scoped expenses are receivable
  return "receivable";
};

const missionStatusMap: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Adapt notes array from backend (snake_case) to frontend (camelCase)
 */
function adaptNotes(notes: any): any[] {
  if (!notes) return [];
  if (!Array.isArray(notes)) return [];

  return notes.map((note) => ({
    id: note.id,
    content: note.content,
    createdAt: note.created_at || note.createdAt,
    updatedAt: note.updated_at || note.updatedAt,
    createdBy: note.created_by || note.createdBy,
    entityType: note.entity_type || note.entityType,
    entityId: note.entity_id || note.entityId,
  }));
}

const parseParticipants = (value: any): any[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeFlag = (value: any, defaultValue: boolean) => {
  if (value === undefined || value === null) return defaultValue;
  if (value === "1") return true;
  if (value === "0") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  return value === true || value === 1;
};

const adaptImportState = (api: any) => ({
  imported: normalizeFlag(api.imported, false),
  validated: normalizeFlag(api.validated, true),
  importSource: api.import_source ?? null,
  importedAt: api.imported_at ?? null,
});

export function adaptClient(api: any) {
  return {
    id: api.id,
    name: api.name ?? "",
    email: api.email ?? "",
    phone: api.phone ?? "",
    alternatePhone: api.alternate_phone ?? "",
    status: statusMapClient[api.status] ?? api.status ?? "",
    joinDate: dateOnly(api.join_date) || dateOnly(api.created_at),
    createdAt: api.created_at ?? null,
    updatedAt: api.updated_at ?? null,
    cin: api.cin ?? "",
    dateOfBirth: dateOnly(api.date_of_birth),
    profession: api.profession ?? "",
    company: api.company ?? "",
    taxId: api.tax_id ?? "",
    address: api.address ?? "",
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
  };
}

export function adaptDossier(api: any, clientsById: Record<number, any>) {
  const clientName = clientsById[api.client_id]?.name ?? `Client #${api.client_id}`;
  const adversaryName = api.adversary_name ?? api.adversary_party ?? "";
  return {
    id: api.id,
    lawsuitNumber: api.reference ?? api.lawsuit_number ?? "",
    title: api.title ?? "",
    clientId: api.client_id,
    client: clientName,
    status: statusMapCommon[api.status] ?? api.status ?? "",
    openDate: dateOnly(api.opened_at),
    createdAt: api.created_at ?? null,
    updatedAt: api.updated_at ?? null,
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    phase: api.phase ?? "",
    category: api.category ?? "",
    assignedLawyer: api.assigned_lawyer ?? "",
    description: api.description ?? "",
    adversaryName,
    adversary: adversaryName,
    adversaryParty: adversaryName,
    adversaryLawyer: api.adversary_lawyer ?? "",
    estimatedValue: api.estimated_value ?? "",
    courtReference: api.court_reference ?? "",
    nextDeadline: dateOnly(api.next_deadline),
    relatedCases: api.relatedCases || [],
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
  };
}

export function adaptLawsuit(api: any, dossiersById: Record<number, any>) {
  const dossierTitle = dossiersById[api.dossier_id]?.lawsuitNumber ?? "";
  const adversaryName =
    api.adversary_name ?? api.adversary_party ?? api.adversary ?? "";
  return {
    id: api.id,
    lawsuitNumber: api.reference ?? api.lawsuit_number ?? "",
    title: api.title ?? "",
    dossierId: api.dossier_id,
    dossier: dossierTitle,
    status: lawsuitStatusMap[api.status] ?? api.status ?? "",
    openDate: dateOnly(api.opened_at),
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    adversaryName,
    adversaire: api.adversary ?? adversaryName ?? "",
    adversaryParty: api.adversary_party ?? api.adversary_name ?? "",
    adversaryLawyer: api.adversary_lawyer ?? "",
    judgmentNumber: api.judgment_number ?? "",
    judgmentDate: dateOnly(api.judgment_date),
    court: api.court ?? "",
    filingDate: dateOnly(api.filing_date),
    nextHearing: dateOnly(api.next_hearing),
    courtReference: api.reference_number ?? "",
    description: api.description ?? "",
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
  };
}

export function adaptTask(api: any, dossiersById: Record<number, any>, lawsuitsById: Record<number, any>) {
  const parentType = api.dossier_id ? "dossier" : "lawsuit";
  const dossierLabel =
    api.dossier_id && dossiersById[api.dossier_id]
      ? dossiersById[api.dossier_id].lawsuitNumber ?? dossiersById[api.dossier_id].title
      : "";
  const lawsuitLabel =
    api.lawsuit_id && lawsuitsById[api.lawsuit_id]
      ? lawsuitsById[api.lawsuit_id].lawsuitNumber ?? lawsuitsById[api.lawsuit_id].title
      : "";

  return {
    id: api.id,
    title: api.title ?? "",
    parentType,
    dossierId: api.dossier_id ?? null,
    lawsuitId: api.lawsuit_id ?? null,
    dossier: dossierLabel,
    lawsuit: lawsuitLabel,
    assignedTo: api.assigned_to ?? "",
    dueDate: dateOnly(api.due_date),
    estimatedTime: api.estimated_time ?? "",
    status: taskStatusMap[api.status] ?? api.status ?? "",
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    description: api.description ?? "",
    createdDate: dateOnly(api.created_at),
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
  };
}

export function adaptSession(api: any, dossiersById: Record<number, any>, lawsuitsById: Record<number, any>) {
  const dossierLabel =
    api.dossier_id && dossiersById[api.dossier_id]
      ? dossiersById[api.dossier_id].lawsuitNumber ?? dossiersById[api.dossier_id].title
      : "";
  const lawsuitLabel =
    api.lawsuit_id && lawsuitsById[api.lawsuit_id]
      ? lawsuitsById[api.lawsuit_id].lawsuitNumber ?? lawsuitsById[api.lawsuit_id].title
      : "";
  return {
    id: api.id,
    title: api.title || api.notes || api.session_type || "Session",
    type: sessionTypeMap[api.session_type] ?? api.session_type ?? "",
    dossierId: api.dossier_id ?? null,
    lawsuitId: api.lawsuit_id ?? null,
    dossier: dossierLabel,
    lawsuit: lawsuitLabel,
    date: dateOnly(api.session_date) || dateOnly(api.scheduled_at),
    sessionDate: dateOnly(api.session_date) || dateOnly(api.scheduled_at),
    time: api.scheduled_at ? api.scheduled_at.split("T")[1]?.slice(0, 5) ?? "" : "",
    scheduledAt: api.scheduled_at ?? "",
    createdAt: api.created_at ?? null,
    updatedAt: api.updated_at ?? null,
    status: sessionStatusMap[api.status] ?? api.status ?? "",
    location: api.location ?? "",
    courtRoom: api.court_room ?? "",
    judge: api.judge ?? "",
    duration: api.duration ?? "",
    outcome: api.outcome ?? "",
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
    description: api.description ?? "",
    participants: parseParticipants(api.participants),
  };
}

export function adaptOfficer(api: any) {
  return {
    id: api.id,
    name: api.name ?? "",
    specialization: api.specialization ?? "",
    phone: api.phone ?? "",
    alternatePhone: api.alternate_phone ?? "",
    email: api.email ?? "",
    location: api.location ?? api.agency ?? "",
    address: api.address ?? "",
    agency: api.agency ?? "",
    status: officerStatusMap[api.status] ?? api.status ?? "",
    registrationNumber: api.registration_number ?? "",
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
    missions: [],
  };
}

export function adaptFinancialEntry(
  api: any,
  clientsById: Record<number, any>,
  dossiersById: Record<number, any>,
  lawsuitsById: Record<number, any>
) {
  const currency = getStoredCurrency();
  const clientName = api.client_id ? (clientsById[api.client_id]?.name ?? `Client #${api.client_id}`) : "";
  const dossierRef = api.dossier_id ? (dossiersById[api.dossier_id]?.lawsuitNumber ?? `DOS-${api.dossier_id}`) : "";
  const lawsuitRef = api.lawsuit_id ? (lawsuitsById[api.lawsuit_id]?.lawsuitNumber ?? `PRO-${api.lawsuit_id}`) : "";

  const dueDate = dateOnly(api.due_date);
  const occurredDate = dateOnly(api.occurred_at) || dateOnly(api.created_at) || "";
  
  // Normalize status to canonical value (pass paid_at to logic)
  const rawStatus = api.status;
  const mappedStatus = normalizeFinancialStatus(rawStatus);

  // Canonical payment state: paid_at is the source of truth.
  // Keep legacy fallback for old rows that still carry status='paid'.
  const isPaid =
    Boolean(api.paid_at) || String(rawStatus || "").toLowerCase() === "paid";
  
  // Map entry_type to frontend type
  const type = api.entry_type === "income" ? "revenue" : "expense";
  
  // Determine direction (receivable vs payable)
  const direction = determineDirection(api.entry_type, api.scope, api.direction);

  return {
    id: api.id,
    type,
    category: api.category ?? "other",
    amount: Number(api.amount || 0),
    currency,
    date: occurredDate || dueDate,
    dueDate,
    title: api.title ?? "",
    description: api.description ?? "",
    status: mappedStatus,
    // Financial stabilization fields
    direction,
    isPaid,
    paidAt: api.paid_at ?? null,
    cancelledAt: api.cancelled_at ?? null,
    cancellationReason: api.cancellation_reason ?? null,
    // Scope and relationships
    scope: api.scope ?? "client",
    clientId: api.client_id ?? null,
    clientName,
    dossierId: api.dossier_id ?? null,
    dossierReference: dossierRef,
    lawsuitId: api.lawsuit_id ?? null,
    lawsuitReference: lawsuitRef,
    missionId: api.mission_id ?? null,
    taskId: api.task_id ?? null,
    personalTaskId: api.personal_task_id ?? null,
    documentId: null,
    reference: api.reference ?? "",
    // Metadata
    createdAt: api.created_at ?? null,
    updatedAt: api.updated_at ?? null,
    ...adaptImportState(api),
  };
}

export function adaptMission(
  api: any,
  dossiersById: Record<number, any>,
  lawsuitsById: Record<number, any>
) {
  const entityType = api.dossier_id ? "dossier" : api.lawsuit_id ? "lawsuit" : null;
  const dossierRef =
    api.dossier_id && dossiersById[api.dossier_id]
      ? dossiersById[api.dossier_id].lawsuitNumber ?? `DOS-${api.dossier_id}`
      : "";
  const lawsuitRef =
    api.lawsuit_id && lawsuitsById[api.lawsuit_id]
      ? lawsuitsById[api.lawsuit_id].lawsuitNumber ?? `PRO-${api.lawsuit_id}`
      : "";

  return {
    id: api.id,
    missionNumber: api.reference ?? `MIS-${api.id}`,
    title: api.title ?? "",
    missionType: api.mission_type ?? "",
    status: missionStatusMap[api.status] ?? api.status ?? "",
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    assignDate: dateOnly(api.assign_date),
    dueDate: dateOnly(api.due_date),
    completionDate: dateOnly(api.completion_date),
    closedAt: dateOnly(api.closed_at),
    result: api.result ?? "",
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
    description: api.description ?? "",
    dossierId: api.dossier_id ?? null,
    lawsuitId: api.lawsuit_id ?? null,
    officerId: api.officer_id ?? null,
    officerName: "",
    entityType,
    entityId: api.dossier_id ?? api.lawsuit_id ?? null,
    entityReference: entityType === "dossier" ? dossierRef : lawsuitRef,
  };
}

const personalTaskStatusMap: Record<string, string> = {
  todo: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const personalTaskCategoryMap: Record<string, string> = {
  invoices: "Invoices",
  office: "Office",
  personal: "Personal",
  it: "IT",
  administrative: "Administrative",
  other: "Other",
};

export function adaptPersonalTask(api: any) {
  return {
    id: api.id,
    title: api.title ?? "",
    description: api.description ?? "",
    category: personalTaskCategoryMap[api.category] ?? api.category ?? "",
    status: personalTaskStatusMap[api.status] ?? api.status ?? "",
    priority: priorityMap[api.priority] ?? api.priority ?? "",
    dueDate: dateOnly(api.due_date),
    completedAt: dateOnly(api.completed_at),
    notes: adaptNotes(api.notes), // ✅ Adapt notes with proper field names
    ...adaptImportState(api),
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



