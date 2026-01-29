const db = require("../db/connection");
const notesService = require("./notes.service");
const { assert } = require("./_utils");

const table = "legacy_imports";
const ENTITY_TYPES = ["client"];

const ENTITY_TABLES = {
  client: "clients",
};

const STATUS_ENUMS = {
  client: ["active", "inActive"],
  dossier: ["open", "in_progress", "on_hold", "closed"],
  lawsuit: ["open", "in_progress", "on_hold", "closed"],
  task: ["todo", "in_progress", "blocked", "done", "cancelled"],
  session: ["scheduled", "confirmed", "pending", "completed", "cancelled"],
  mission: ["planned", "in_progress", "completed", "cancelled"],
  personal_task: ["todo", "in_progress", "blocked", "done", "cancelled", "scheduled"],
  financial_entry: ["draft", "confirmed", "cancelled", "paid", "pending", "posted", "void"],
  officer: ["active", "busy", "inActive"],
};

const PRIORITY_ENUMS = ["urgent", "high", "medium", "low"];
const SESSION_TYPES = ["hearing", "consultation", "mediation", "expertise", "phone", "other"];
const FINANCIAL_SCOPES = ["client", "internal"];
const FINANCIAL_ENTRY_TYPES = ["income", "expense", "revenue"];

const REQUIRED_FIELDS = {
  client: ["name"],
  dossier: ["reference", "client_id", "title", "status"],
  lawsuit: ["reference", "dossier_id", "title", "status"],
  task: ["title", "status"],
  session: ["session_type", "status", "scheduled_at"],
  mission: ["reference", "title", "status"],
  financial_entry: ["scope", "entry_type", "status", "amount", "currency"],
  personal_task: ["title", "status"],
  officer: ["name"],
  document: ["title", "file_path"],
};

const AUTO_IMPORT_ENTITIES = new Set(["client"]);

const CLIENT_REAL_WORLD_FIELDS = ["email", "phone", "address", "cin"];

const CLIENT_CANONICAL_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "alternate_phone",
  "address",
  "cin",
  "date_of_birth",
  "profession",
  "company",
  "tax_id",
  "notes",
  "join_date",
  "status",
];

// Alias dictionary for client imports (EN/FR/AR). Normalization removes accents,
// punctuation, and spacing, so both "Nom complet" and "Nom-complet" resolve.
const CLIENT_FIELD_ALIASES = {
  name: [
    "name",
    "full name",
    "fullname",
    "full_name",
    "client name",
    "client_name",
    "customer name",
    "contact name",
    "person name",
    "nom",
    "nom complet",
    "nomcomplet",
    "nom du client",
    "nom client",
    "nom & prenom",
    "nom prenom",
    "nom prénom",
    "nom et prenom",
    "الاسم",
    "الإسم",
    "اسم",
    "الاسم الكامل",
    "الإسم الكامل",
    "الاسم واللقب",
    "الاسم و اللقب",
    "اسم و لقب",
    "اسم ولقب",
    "اسم العميل",
    "إسم العميل",
  ],
  first_name: [
    "first name",
    "firstname",
    "first_name",
    "given name",
    "givenname",
    "prenom",
    "prénom",
    "prenom client",
    "prénom client",
    "الاسم الأول",
    "الاسم الاول",
    "الإسم الأول",
    "الإسم الاول",
    "الاسم الشخصي",
    "الإسم الشخصي",
  ],
  last_name: [
    "last name",
    "lastname",
    "last_name",
    "surname",
    "family name",
    "familyname",
    "nom de famille",
    "nom famille",
    "nomdefamille",
    "اللقب",
    "اسم العائلة",
    "إسم العائلة",
    "اسم العائله",
    "النسب",
  ],
  email: [
    "email",
    "e-mail",
    "e mail",
    "mail",
    "courriel",
    "adresse email",
    "adresse e-mail",
    "email address",
    "mail address",
    "البريد الالكتروني",
    "البريد الإلكتروني",
    "بريد إلكتروني",
    "الايميل",
    "الإيميل",
    "ايميل",
    "البريد",
  ],
  phone: [
    "phone",
    "phone number",
    "phone_number",
    "telephone",
    "téléphone",
    "tel",
    "mobile",
    "cell",
    "gsm",
    "contact",
    "contact phone",
    "numero telephone",
    "num telephone",
    "numéro de téléphone",
    "numero de telephone",
    "portable",
    "الهاتف",
    "هاتف",
    "رقم الهاتف",
    "رقم التليفون",
    "رقم الجوال",
    "رقم المحمول",
    "الهاتف المحمول",
    "موبايل",
    "جوال",
  ],
  alternate_phone: [
    "alternate_phone",
    "alt phone",
    "alt_phone",
    "phone2",
    "telephone2",
    "secondary phone",
    "secondary_phone",
    "second phone",
    "autre numero",
    "numero secondaire",
    "num secondaire",
    "téléphone 2",
    "هاتف ثان",
    "هاتف ثاني",
    "رقم هاتف ثان",
    "رقم هاتف ثاني",
    "هاتف إضافي",
    "هاتف اضافي",
  ],
  address: [
    "address",
    "street",
    "street address",
    "location",
    "residence",
    "adresse",
    "adresse client",
    "adresse complète",
    "adresse complete",
    "adresse complète client",
    "العنوان",
    "عنوان",
    "عنوان السكن",
    "العنوان الكامل",
    "عنوان كامل",
    "المقر",
    "المقر الاجتماعي",
  ],
  status: [
    "status",
    "etat",
    "état",
    "state",
    "statut",
    "الحالة",
    "الحاله",
    "الوضع",
    "الوضعية",
  ],
  cin: [
    "cin",
    "cni",
    "id",
    "id number",
    "id_number",
    "idcard",
    "national id",
    "national_id",
    "carte nationale",
    "carte d'identité",
    "carte identite",
    "numero cin",
    "num cin",
    "رقم بطاقة التعريف",
    "رقم بطاقة تعريف",
    "بطاقة التعريف",
    "بطاقة تعريف",
    "رقم الهوية",
    "رقم الهوية الوطنية",
    "بطاقة الهوية",
    "بطاقة الهوية الوطنية",
  ],
  date_of_birth: [
    "date of birth",
    "date_of_birth",
    "dateofbirth",
    "dob",
    "birthdate",
    "birth date",
    "date naissance",
    "date de naissance",
    "datenaissance",
    "تاريخ الميلاد",
    "تاريخ الولادة",
    "تاريخ ميلاد",
    "تاريخ الإزدياد",
    "تاريخ الازدياد",
  ],
  profession: [
    "profession",
    "job",
    "occupation",
    "metier",
    "métier",
    "fonction",
    "poste",
    "المهنة",
    "الوظيفة",
    "العمل",
  ],
  company: [
    "company",
    "company name",
    "company_name",
    "societe",
    "société",
    "entreprise",
    "raison sociale",
    "nom entreprise",
    "nom société",
    "nom societe",
    "organisme",
    "شركة",
    "اسم الشركة",
    "إسم الشركة",
    "المؤسسة",
    "مؤسسة",
    "جهة العمل",
  ],
  tax_id: [
    "tax id",
    "tax_id",
    "taxid",
    "fiscal id",
    "identifiant fiscal",
    "matricule fiscal",
    "matriculefiscal",
    "numero fiscal",
    "num fiscal",
    "المعرف الجبائي",
    "المعرّف الجبائي",
    "الرقم الجبائي",
    "الرقم الضريبي",
    "رقم جبائي",
  ],
  notes: [
    "notes",
    "note",
    "comment",
    "comments",
    "remarks",
    "remark",
    "observation",
    "observations",
    "infos",
    "additional info",
    "information",
    "memo",
    "remarques",
    "commentaires",
    "ملاحظات",
    "ملاحظة",
    "تعليقات",
    "بيانات إضافية",
    "معلومة إضافية",
  ],
  join_date: [
    "join date",
    "join_date",
    "joindate",
    "registration date",
    "registrationdate",
    "date inscription",
    "date d'inscription",
    "dateinscription",
    "date adhesion",
    "date d'adhesion",
    "تاريخ التسجيل",
    "تاريخ الانضمام",
    "تاريخ الالتحاق",
    "تاريخ الإضافة",
  ],
};

const DOSSIER_FIELD_ALIASES = {
  reference: ["reference", "ref", "lawsuit_number", "dossier_number", "filenumber", "numerodossier", "numero"],
  title: ["title", "titre", "objet", "subject", "name"],
  client_id: ["client_id", "clientid"],
  client_name: ["client", "client_name", "nom_client", "clientname"],
  status: ["status", "etat", "state"],
  priority: ["priority", "priorite", "urgence"],
  category: ["category", "categorie", "type"],
  description: ["description", "desc", "details", "resume"],
  phase: ["phase"],
  adversary_party: ["adversary_party", "adversary", "partieadverse", "opponent"],
  adversary_lawyer: ["adversary_lawyer", "avocat", "avocatadverse", "lawyer"],
  estimated_value: ["estimated_value", "estimate", "value", "montant", "amount"],
  court_reference: ["court_reference", "courtref", "tribunalref"],
  assigned_lawyer: ["assigned_lawyer", "lawyer_assigned", "responsable"],
  opened_at: ["opened_at", "open_date", "date_ouverture", "dateouverture"],
  next_deadline: ["next_deadline", "deadline", "echeance", "prochaine_echeance"],
  closed_at: ["closed_at", "close_date", "date_cloture", "datecloture"],
};

const LAWSUIT_FIELD_ALIASES = {
  reference: ["reference", "ref", "case_reference", "case_ref", "lawsuit_reference", "reference_number", "numero_affaire", "lawsuit_number"],
  lawsuit_number: ["lawsuit_number", "numero_affaire", "numero", "casenumber"],
  dossier_id: ["dossier_id", "dossierid"],
  dossier_reference: ["dossier_reference", "dossier_ref", "dossier", "dossier_number", "dossierreference"],
  title: ["title", "titre", "objet", "subject", "name"],
  status: ["status", "etat", "state"],
  priority: ["priority", "priorite", "urgence"],
  court: ["court", "tribunal", "juridiction"],
  adversary: ["adversary", "adverse_party", "opponent"],
  adversary_party: ["adversary_party", "partieadverse", "opponent_party"],
  adversary_lawyer: ["adversary_lawyer", "avocat", "avocatadverse"],
  filing_date: ["filing_date", "filed_at", "date_filing", "date_depot", "datedepot"],
  next_hearing: ["next_hearing", "hearing_date", "next_session", "prochaine_audience"],
  reference_number: ["reference_number", "reference_no", "ref_number"],
  opened_at: ["opened_at", "open_date", "date_ouverture", "dateouverture"],
  closed_at: ["closed_at", "close_date", "date_cloture", "datecloture"],
};

const PRIORITY_MAP = {
  urgent: "urgent",
  critical: "urgent",
  high: "high",
  haute: "high",
  medium: "medium",
  moyenne: "medium",
  low: "low",
  basse: "low",
  faible: "low",
};

const CLIENT_STATUS_MAP = {
  active: "active",
  actif: "active",
  enabled: "active",
  yes: "active",
  "1": "active",
  pending: "active",
  pendingvalidation: "active",
  awaiting: "active",
  awaitingvalidation: "active",
  enattente: "active",
  enattentedevalidation: "active",
  attentedevalidation: "active",
  inactive: "inActive",
  inactif: "inActive",
  disabled: "inActive",
  no: "inActive",
  "0": "inActive",
  archived: "inActive",
  closed: "inActive",
};

const DOSSIER_STATUS_MAP = {
  open: "open",
  opened: "open",
  ouvert: "open",
  inprogress: "in_progress",
  "in_progress": "in_progress",
  progress: "in_progress",
  encours: "in_progress",
  onhold: "on_hold",
  "on_hold": "on_hold",
  hold: "on_hold",
  pause: "on_hold",
  closed: "closed",
  close: "closed",
  completed: "closed",
  done: "closed",
  finished: "closed",
  cloture: "closed",
  ferme: "closed",
};

const LAWSUIT_STATUS_MAP = DOSSIER_STATUS_MAP;

function normalizePayload(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {
      return { value };
    }
  }
  return { value };
}

function normalizeImportedNotes(notes) {
  if (notes === null || notes === undefined) return null;
  if (Array.isArray(notes)) {
    const normalized = notes
      .map((note) => {
        if (typeof note === "string") return { content: note };
        if (note && typeof note === "object") return note;
        return null;
      })
      .filter((note) => note && typeof note.content === "string" && note.content.trim());
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof notes === "string") {
    const trimmed = notes.trim();
    if (!trimmed) return null;
    return [{ content: trimmed }];
  }
  if (notes && typeof notes === "object" && typeof notes.content === "string") {
    const trimmed = notes.content.trim();
    if (!trimmed) return null;
    return [{ ...notes, content: trimmed }];
  }
  return null;
}

function stringifyPayload(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

function normalizeTextKey(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeEmailKey(value) {
  return normalizeTextKey(value);
}

function normalizeCinKey(value) {
  return normalizeTextKey(value);
}

function normalizePhoneKey(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/[^\d]+/g, "");
  return digits ? digits : null;
}

function buildRawObject(record) {
  if (!record) return {};
  if (Array.isArray(record.columns) && Array.isArray(record.values)) {
    const output = {};
    const length = Math.min(record.columns.length, record.values.length);
    for (let i = 0; i < length; i += 1) {
      const key = record.columns[i];
      if (!key) continue;
      output[key] = record.values[i];
    }
    return output;
  }
  if (typeof record === "object") return record;
  return { value: record };
}

function buildKeyMap(raw) {
  const map = new Map();
  Object.entries(raw || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) return;
    if (map.has(normalizedKey)) return;
    const normalizedValue = normalizeValue(value);
    if (normalizedValue === null) return;
    map.set(normalizedKey, normalizedValue);
  });
  return map;
}

function pickValue(map, aliases = []) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (!normalizedAlias) continue;
    if (map.has(normalizedAlias)) {
      return map.get(normalizedAlias);
    }
  }
  return null;
}

function normalizePriority(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return PRIORITY_MAP[normalized] || null;
}

function normalizeStatus(entityType, value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "");
  if (entityType === "client") {
    return CLIENT_STATUS_MAP[normalized] || null;
  }
  return LAWSUIT_STATUS_MAP[normalized] || null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = excelEpoch.getTime() + value * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{8}$/.test(trimmed) && (trimmed.startsWith("19") || trimmed.startsWith("20"))) {
      return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
    }
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const ms = excelEpoch.getTime() + numeric * 24 * 60 * 60 * 1000;
        return new Date(ms).toISOString().split("T")[0];
      }
    }
    const isoMatch = trimmed.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const euroMatch = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
    if (euroMatch) {
      return `${euroMatch[3]}-${euroMatch[2]}-${euroMatch[1]}`;
    }
    return trimmed;
  }
  return null;
}

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

function listMissingClientFields(payload) {
  return CLIENT_REAL_WORLD_FIELDS.filter((field) => isMissing(payload[field]));
}

function validateEnum(field, value, allowed, errors) {
  if (isMissing(value)) return;
  if (!allowed.includes(value)) {
    errors.push({
      field,
      message: `Invalid ${field} value`,
      allowed,
    });
  }
}

function validateXor(fields, payload, errors) {
  const present = fields.filter((field) => !isMissing(payload[field]));
  if (present.length !== 1) {
    errors.push({
      field: fields.join("|"),
      message: `Exactly one of ${fields.join(", ")} is required`,
    });
  }
}

function validateExclusivePair(left, right, payload, errors) {
  if (!isMissing(payload[left]) && !isMissing(payload[right])) {
    errors.push({
      field: `${left}|${right}`,
      message: `Only one of ${left} or ${right} can be set`,
    });
  }
}

function validateParentReference(payload, errors) {
  const parentFields = [
    "client_id",
    "dossier_id",
    "lawsuit_id",
    "mission_id",
    "task_id",
    "session_id",
    "personal_task_id",
    "financial_entry_id",
  ];

  const present = parentFields.filter((field) => !isMissing(payload[field]));
  if (present.length !== 1) {
    errors.push({
      field: parentFields.join("|"),
      message: "Exactly one parent reference is required",
    });
  }
}

function checkReference(tableName, id, errors, field) {
  if (isMissing(id)) return;
  const row = db
    .prepare(
      `SELECT 1 FROM ${tableName} WHERE id = @id AND deleted_at IS NULL AND validated = 1`
    )
    .get({ id });
  if (!row) {
    errors.push({
      field,
      message: "Referenced entity not found or not validated",
    });
  }
}

function validateNormalizedPayload(entityType, payload, options = {}) {
  const errors = [];
  const missingFields = [];
  const conflicts = [];
  const required = REQUIRED_FIELDS[entityType] || [];
  const skipDuplicateCheck = options.skipDuplicateCheck === true;
  const duplicateLookups = options.lookups || null;

  required.forEach((field) => {
    if (isMissing(payload[field])) {
      missingFields.push(field);
      errors.push({ field, message: "Required field is missing" });
    }
  });

  if (STATUS_ENUMS[entityType]) {
    validateEnum("status", payload.status, STATUS_ENUMS[entityType], errors);
  }

  if (!isMissing(payload.priority)) {
    validateEnum("priority", payload.priority, PRIORITY_ENUMS, errors);
  }

  if (entityType === "session") {
    validateEnum("session_type", payload.session_type, SESSION_TYPES, errors);
    validateXor(["dossier_id", "lawsuit_id"], payload, errors);
  }

  if (entityType === "mission") {
    validateXor(["dossier_id", "lawsuit_id"], payload, errors);
  }

  if (entityType === "task") {
    validateXor(["dossier_id", "lawsuit_id"], payload, errors);
  }

  if (entityType === "financial_entry") {
    validateEnum("scope", payload.scope, FINANCIAL_SCOPES, errors);
    validateEnum("entry_type", payload.entry_type, FINANCIAL_ENTRY_TYPES, errors);
    validateEnum("status", payload.status, STATUS_ENUMS.financial_entry, errors);
    validateExclusivePair("dossier_id", "lawsuit_id", payload, errors);

    if (payload.scope === "client" && isMissing(payload.client_id)) {
      missingFields.push("client_id");
      errors.push({
        field: "client_id",
        message: "client_id is required for client scope entries",
      });
    }

    if (payload.scope === "internal" && !isMissing(payload.client_id)) {
      errors.push({
        field: "client_id",
        message: "client_id must be empty for internal scope entries",
      });
    }
  }

  if (entityType === "document") {
    validateParentReference(payload, errors);
  }

  if (entityType === "client" && !skipDuplicateCheck) {
    const lookups = duplicateLookups || buildLookups("client");
    const duplicate = findDuplicateClient(payload, lookups);
    if (duplicate) {
      errors.push({
        field: duplicate.field,
        message: "Duplicate client detected",
        existing_id: duplicate.id,
      });
    }
  }

  if (entityType === "dossier") {
    checkReference("clients", payload.client_id, errors, "client_id");
  }

  if (entityType === "lawsuit") {
    checkReference("dossiers", payload.dossier_id, errors, "dossier_id");
  }

  if (entityType === "task") {
    checkReference("dossiers", payload.dossier_id, errors, "dossier_id");
    checkReference("lawsuits", payload.lawsuit_id, errors, "lawsuit_id");
  }

  if (entityType === "session") {
    checkReference("dossiers", payload.dossier_id, errors, "dossier_id");
    checkReference("lawsuits", payload.lawsuit_id, errors, "lawsuit_id");
  }

  if (entityType === "mission") {
    checkReference("dossiers", payload.dossier_id, errors, "dossier_id");
    checkReference("lawsuits", payload.lawsuit_id, errors, "lawsuit_id");
    checkReference("officers", payload.officer_id, errors, "officer_id");
  }

  if (entityType === "financial_entry") {
    checkReference("clients", payload.client_id, errors, "client_id");
    checkReference("dossiers", payload.dossier_id, errors, "dossier_id");
    checkReference("lawsuits", payload.lawsuit_id, errors, "lawsuit_id");
    checkReference("missions", payload.mission_id, errors, "mission_id");
    checkReference("tasks", payload.task_id, errors, "task_id");
    checkReference("personal_tasks", payload.personal_task_id, errors, "personal_task_id");
  }

  if (entityType === "document") {
    checkReference("clients", payload.client_id, errors, "client_id");
    checkReference("dossiers", payload.dossier_id, errors, "dossier_id");
    checkReference("lawsuits", payload.lawsuit_id, errors, "lawsuit_id");
    checkReference("missions", payload.mission_id, errors, "mission_id");
    checkReference("tasks", payload.task_id, errors, "task_id");
    checkReference("sessions", payload.session_id, errors, "session_id");
    checkReference("personal_tasks", payload.personal_task_id, errors, "personal_task_id");
    checkReference("financial_entries", payload.financial_entry_id, errors, "financial_entry_id");
  }

  const statusValue =
    typeof payload.status === "string" ? payload.status.toLowerCase() : payload.status;

  if (
    (entityType === "dossier" || entityType === "lawsuit") &&
    statusValue === "closed" &&
    isMissing(payload.closed_at)
  ) {
    conflicts.push({
      field: "closed_at",
      message: "Closed status requires closed_at",
    });
  }

  if (entityType === "task" && statusValue === "done" && isMissing(payload.completed_at)) {
    conflicts.push({
      field: "completed_at",
      message: "Done status requires completed_at",
    });
  }

  if (
    entityType === "mission" &&
    statusValue === "completed" &&
    isMissing(payload.completion_date)
  ) {
    conflicts.push({
      field: "completion_date",
      message: "Completed status requires completion_date",
    });
  }

  if (
    entityType === "financial_entry" &&
    statusValue === "paid" &&
    isMissing(payload.paid_at)
  ) {
    conflicts.push({
      field: "paid_at",
      message: "Paid status requires paid_at",
    });
  }

  return {
    valid: errors.length === 0 && conflicts.length === 0,
    errors,
    missingFields,
    conflicts,
  };
}

function resolveClientId(rawMap, clientsByName) {
  const direct = pickValue(rawMap, DOSSIER_FIELD_ALIASES.client_id);
  if (direct !== null && direct !== undefined) {
    const parsed = parseInt(direct, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const name = pickValue(rawMap, DOSSIER_FIELD_ALIASES.client_name);
  if (!name) return null;
  return clientsByName.get(String(name).trim().toLowerCase()) || null;
}

function resolveDossierId(rawMap, dossiersByReference) {
  const direct = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.dossier_id);
  if (direct !== null && direct !== undefined) {
    const parsed = parseInt(direct, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const reference = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.dossier_reference);
  if (!reference) return null;
  return dossiersByReference.get(String(reference).trim().toLowerCase()) || null;
}

function normalizeClientPayload(raw) {
  const rawMap = buildKeyMap(raw);
  const payload = {};

  const email = pickValue(rawMap, CLIENT_FIELD_ALIASES.email);
  const phone = pickValue(rawMap, CLIENT_FIELD_ALIASES.phone);
  const alternatePhone = pickValue(rawMap, CLIENT_FIELD_ALIASES.alternate_phone);
  const address = pickValue(rawMap, CLIENT_FIELD_ALIASES.address);
  const cin = pickValue(rawMap, CLIENT_FIELD_ALIASES.cin);
  const dateOfBirth = normalizeDate(pickValue(rawMap, CLIENT_FIELD_ALIASES.date_of_birth));
  const profession = pickValue(rawMap, CLIENT_FIELD_ALIASES.profession);
  const company = pickValue(rawMap, CLIENT_FIELD_ALIASES.company);
  const taxId = pickValue(rawMap, CLIENT_FIELD_ALIASES.tax_id);
  const notes = pickValue(rawMap, CLIENT_FIELD_ALIASES.notes);
  const joinDate = normalizeDate(pickValue(rawMap, CLIENT_FIELD_ALIASES.join_date));
  const rawName = pickValue(rawMap, CLIENT_FIELD_ALIASES.name);
  const firstName = pickValue(rawMap, CLIENT_FIELD_ALIASES.first_name);
  const lastName = pickValue(rawMap, CLIENT_FIELD_ALIASES.last_name);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const derivedName = rawName || combinedName || company || email || phone || cin;

  if (derivedName) {
    payload.name = String(derivedName).trim();
  }

  payload.email = email;
  payload.phone = phone;
  payload.alternate_phone = alternatePhone;
  payload.address = address;
  payload.status =
    normalizeStatus("client", pickValue(rawMap, CLIENT_FIELD_ALIASES.status)) || "active";
  payload.cin = cin;
  payload.date_of_birth = dateOfBirth;
  payload.profession = profession;
  payload.company = company;
  payload.tax_id = taxId;
  payload.notes = notes;
  payload.join_date = joinDate;

  const missingFields = listMissingClientFields(payload);
  if (missingFields.length > 0) {
    payload.missing_fields = JSON.stringify(missingFields);
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === null || payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

function normalizeDossierPayload(raw, lookups) {
  const rawMap = buildKeyMap(raw);
  const payload = {};

  const reference = pickValue(rawMap, DOSSIER_FIELD_ALIASES.reference);
  payload.reference = reference;
  payload.title = pickValue(rawMap, DOSSIER_FIELD_ALIASES.title);
  payload.client_id = resolveClientId(rawMap, lookups.clientsByName);
  payload.status = normalizeStatus("dossier", pickValue(rawMap, DOSSIER_FIELD_ALIASES.status));
  payload.priority = normalizePriority(pickValue(rawMap, DOSSIER_FIELD_ALIASES.priority));
  payload.category = pickValue(rawMap, DOSSIER_FIELD_ALIASES.category);
  payload.description = pickValue(rawMap, DOSSIER_FIELD_ALIASES.description);
  payload.phase = pickValue(rawMap, DOSSIER_FIELD_ALIASES.phase);
  payload.adversary_party = pickValue(rawMap, DOSSIER_FIELD_ALIASES.adversary_party);
  payload.adversary_lawyer = pickValue(rawMap, DOSSIER_FIELD_ALIASES.adversary_lawyer);
  payload.estimated_value = normalizeNumber(pickValue(rawMap, DOSSIER_FIELD_ALIASES.estimated_value));
  payload.court_reference = pickValue(rawMap, DOSSIER_FIELD_ALIASES.court_reference);
  payload.assigned_lawyer = pickValue(rawMap, DOSSIER_FIELD_ALIASES.assigned_lawyer);
  payload.opened_at = normalizeDate(pickValue(rawMap, DOSSIER_FIELD_ALIASES.opened_at));
  payload.next_deadline = normalizeDate(pickValue(rawMap, DOSSIER_FIELD_ALIASES.next_deadline));
  payload.closed_at = normalizeDate(pickValue(rawMap, DOSSIER_FIELD_ALIASES.closed_at));

  Object.keys(payload).forEach((key) => {
    if (payload[key] === null || payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

function normalizeLawsuitPayload(raw, lookups) {
  const rawMap = buildKeyMap(raw);
  const payload = {};

  const lawsuitNumber = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.lawsuit_number);
  const reference = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.reference) || lawsuitNumber;

  payload.reference = reference;
  if (lawsuitNumber) payload.lawsuit_number = lawsuitNumber;
  payload.dossier_id = resolveDossierId(rawMap, lookups.dossiersByReference);
  payload.title = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.title);
  payload.status = normalizeStatus("lawsuit", pickValue(rawMap, LAWSUIT_FIELD_ALIASES.status));
  payload.priority = normalizePriority(pickValue(rawMap, LAWSUIT_FIELD_ALIASES.priority));
  payload.court = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.court);
  payload.adversary = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.adversary);
  payload.adversary_party = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.adversary_party);
  payload.adversary_lawyer = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.adversary_lawyer);
  payload.filing_date = normalizeDate(pickValue(rawMap, LAWSUIT_FIELD_ALIASES.filing_date));
  payload.next_hearing = normalizeDate(pickValue(rawMap, LAWSUIT_FIELD_ALIASES.next_hearing));
  payload.reference_number = pickValue(rawMap, LAWSUIT_FIELD_ALIASES.reference_number);
  payload.opened_at = normalizeDate(pickValue(rawMap, LAWSUIT_FIELD_ALIASES.opened_at));
  payload.closed_at = normalizeDate(pickValue(rawMap, LAWSUIT_FIELD_ALIASES.closed_at));

  Object.keys(payload).forEach((key) => {
    if (payload[key] === null || payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

function buildNormalizedPayload(entityType, raw, lookups) {
  if (entityType === "client") return normalizeClientPayload(raw);
  if (entityType === "dossier") return normalizeDossierPayload(raw, lookups);
  if (entityType === "lawsuit") return normalizeLawsuitPayload(raw, lookups);
  return {};
}

function buildValidationErrors(validation) {
  if (validation.valid) return null;
  return stringifyPayload({
    errors: validation.errors,
    missing_fields: validation.missingFields,
    conflicts: validation.conflicts,
  });
}

function buildLookups(entityType) {
  const lookups = {
    clientsByName: new Map(),
    dossiersByReference: new Map(),
    clientEmails: new Map(),
    clientPhones: new Map(),
    clientCins: new Map(),
    clientNames: new Map(),
    clientNameAddress: new Map(),
    clientNameDob: new Map(),
  };

  if (entityType === "client") {
    const clients = db
      .prepare(
        "SELECT id, name, email, phone, cin, address, date_of_birth FROM clients WHERE deleted_at IS NULL"
      )
      .all();
    clients.forEach((client) => {
      const emailKey = normalizeEmailKey(client.email);
      if (emailKey && !lookups.clientEmails.has(emailKey)) {
        lookups.clientEmails.set(emailKey, client.id);
      }

      const phoneKey = normalizePhoneKey(client.phone);
      if (phoneKey && !lookups.clientPhones.has(phoneKey)) {
        lookups.clientPhones.set(phoneKey, client.id);
      }

      const cinKey = normalizeCinKey(client.cin);
      if (cinKey && !lookups.clientCins.has(cinKey)) {
        lookups.clientCins.set(cinKey, client.id);
      }

      const nameKey = normalizeTextKey(client.name);
      if (nameKey && !lookups.clientNames.has(nameKey)) {
        lookups.clientNames.set(nameKey, client.id);
      }

      const addressKey = normalizeTextKey(client.address);
      if (nameKey && addressKey) {
        const compositeKey = `${nameKey}|${addressKey}`;
        if (!lookups.clientNameAddress.has(compositeKey)) {
          lookups.clientNameAddress.set(compositeKey, client.id);
        }
      }

      const dobKey = normalizeTextKey(client.date_of_birth);
      if (nameKey && dobKey) {
        const compositeKey = `${nameKey}|${dobKey}`;
        if (!lookups.clientNameDob.has(compositeKey)) {
          lookups.clientNameDob.set(compositeKey, client.id);
        }
      }
    });
  }

  if (entityType === "dossier") {
    const clients = db
      .prepare("SELECT id, name FROM clients WHERE deleted_at IS NULL")
      .all();
    clients.forEach((client) => {
      if (!client?.name) return;
      const key = String(client.name).trim().toLowerCase();
      if (!lookups.clientsByName.has(key)) {
        lookups.clientsByName.set(key, client.id);
      }
    });
  }

  if (entityType === "lawsuit") {
    const dossiers = db
      .prepare("SELECT id, reference, title FROM dossiers WHERE deleted_at IS NULL")
      .all();
    dossiers.forEach((dossier) => {
      if (dossier?.reference) {
        const referenceKey = String(dossier.reference).trim().toLowerCase();
        if (!lookups.dossiersByReference.has(referenceKey)) {
          lookups.dossiersByReference.set(referenceKey, dossier.id);
        }
      }
      if (dossier?.title) {
        const titleKey = String(dossier.title).trim().toLowerCase();
        if (!lookups.dossiersByReference.has(titleKey)) {
          lookups.dossiersByReference.set(titleKey, dossier.id);
        }
      }
    });
  }

  return lookups;
}

function findDuplicateClient(payload, lookups) {
  const emailKey = normalizeEmailKey(payload.email);
  if (emailKey && lookups.clientEmails.has(emailKey)) {
    return { field: "email", id: lookups.clientEmails.get(emailKey) };
  }

  const phoneKey = normalizePhoneKey(payload.phone);
  if (phoneKey && lookups.clientPhones.has(phoneKey)) {
    return { field: "phone", id: lookups.clientPhones.get(phoneKey) };
  }

  const cinKey = normalizeCinKey(payload.cin);
  if (cinKey && lookups.clientCins.has(cinKey)) {
    return { field: "cin", id: lookups.clientCins.get(cinKey) };
  }

  if (!emailKey && !phoneKey && !cinKey) {
    const nameKey = normalizeTextKey(payload.name);
    if (!nameKey) return null;

    const addressKey = normalizeTextKey(payload.address);
    if (addressKey) {
      const compositeKey = `${nameKey}|${addressKey}`;
      if (lookups.clientNameAddress.has(compositeKey)) {
        return { field: "name+address", id: lookups.clientNameAddress.get(compositeKey) };
      }
    }

    const dobKey = normalizeTextKey(payload.date_of_birth);
    if (dobKey) {
      const compositeKey = `${nameKey}|${dobKey}`;
      if (lookups.clientNameDob.has(compositeKey)) {
        return { field: "name+date_of_birth", id: lookups.clientNameDob.get(compositeKey) };
      }
    }

    if (lookups.clientNames.has(nameKey)) {
      return { field: "name", id: lookups.clientNames.get(nameKey) };
    }
  }

  return null;
}

function registerClientLookup(lookups, payload, clientId) {
  const emailKey = normalizeEmailKey(payload.email);
  if (emailKey && !lookups.clientEmails.has(emailKey)) {
    lookups.clientEmails.set(emailKey, clientId);
  }

  const phoneKey = normalizePhoneKey(payload.phone);
  if (phoneKey && !lookups.clientPhones.has(phoneKey)) {
    lookups.clientPhones.set(phoneKey, clientId);
  }

  const cinKey = normalizeCinKey(payload.cin);
  if (cinKey && !lookups.clientCins.has(cinKey)) {
    lookups.clientCins.set(cinKey, clientId);
  }

  const nameKey = normalizeTextKey(payload.name);
  if (nameKey && !lookups.clientNames.has(nameKey)) {
    lookups.clientNames.set(nameKey, clientId);
  }

  const addressKey = normalizeTextKey(payload.address);
  if (nameKey && addressKey) {
    const compositeKey = `${nameKey}|${addressKey}`;
    if (!lookups.clientNameAddress.has(compositeKey)) {
      lookups.clientNameAddress.set(compositeKey, clientId);
    }
  }

  const dobKey = normalizeTextKey(payload.date_of_birth);
  if (nameKey && dobKey) {
    const compositeKey = `${nameKey}|${dobKey}`;
    if (!lookups.clientNameDob.has(compositeKey)) {
      lookups.clientNameDob.set(compositeKey, clientId);
    }
  }
}

function buildDuplicateValidationErrors(duplicate, payload) {
  return stringifyPayload({
    errors: [
      {
        field: duplicate.field,
        message: "Duplicate client detected",
        existing_id: duplicate.id,
      },
    ],
    missing_fields: listMissingClientFields(payload),
    conflicts: [],
  });
}

function list(filters = {}) {
  const where = [];
  const params = {};

  if (filters.entity_type) {
    where.push("entity_type = @entity_type");
    params.entity_type = filters.entity_type;
  }

  if (filters.validated !== undefined) {
    where.push("validated = @validated");
    params.validated = filters.validated ? 1 : 0;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT * FROM ${table} ${whereClause} ORDER BY imported_at DESC, id DESC`
    )
    .all(params);
}

function get(id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = @id`).get({ id });
}

function createRaw(payload) {
  const entity_type = payload.entity_type;
  assert(ENTITY_TYPES.includes(entity_type), "entity_type is invalid");
  assert(payload.payload !== undefined, "payload is required");

  const insert = db.prepare(
    `INSERT INTO ${table} (entity_type, payload, import_source, imported_at)
     VALUES (@entity_type, @payload, @import_source, COALESCE(@imported_at, CURRENT_TIMESTAMP))`
  );

  const result = insert.run({
    entity_type,
    payload: stringifyPayload(payload.payload),
    import_source: payload.import_source || null,
    imported_at: payload.imported_at || null,
  });

  return get(result.lastInsertRowid);
}

function createBatch(entity_type, records = [], import_source = null) {
  assert(ENTITY_TYPES.includes(entity_type), "entity_type is invalid");
  assert(Array.isArray(records), "records must be an array");

  const insert = db.prepare(
    `INSERT INTO ${table} (entity_type, payload, import_source, imported_at)
     VALUES (@entity_type, @payload, @import_source, COALESCE(@imported_at, CURRENT_TIMESTAMP))`
  );

  const insertMany = db.transaction((items) => {
    let total = 0;
    items.forEach((item) => {
      if (!item) return;
      insert.run({
        entity_type,
        payload: stringifyPayload(item.payload ?? item),
        import_source: item.import_source || import_source || null,
        imported_at: item.imported_at || null,
      });
      total += 1;
    });
    return total;
  });

  return { created: insertMany(records) };
}

function autoImportBatch(entity_type, records = [], import_source = null) {
  assert(AUTO_IMPORT_ENTITIES.has(entity_type), "entity_type is not supported");
  assert(Array.isArray(records), "records must be an array");

  const lookups = buildLookups(entity_type);
  const insertRaw = db.prepare(
    `INSERT INTO ${table} (entity_type, payload, import_source, imported_at)
     VALUES (@entity_type, @payload, @import_source, COALESCE(@imported_at, CURRENT_TIMESTAMP))`
  );

  const updateInvalid = db.prepare(
    `UPDATE ${table}
     SET normalized_payload = @normalized_payload,
         validation_errors = @validation_errors
     WHERE id = @id`
  );

  const updateValid = db.prepare(
    `UPDATE ${table}
     SET normalized_payload = @normalized_payload,
         validation_errors = NULL,
         validated = 1,
         resolved_entity_id = @resolved_entity_id,
         resolved_at = CURRENT_TIMESTAMP
     WHERE id = @id`
  );

  const summary = {
    total: records.length,
    created: 0,
    queued: 0,
    duplicates: 0,
  };

  const runImport = db.transaction((items) => {
    items.forEach((item) => {
      if (!item) return;
      const rawObject = buildRawObject(item);
      const result = insertRaw.run({
        entity_type,
        payload: stringifyPayload(rawObject),
        import_source: import_source || item.import_source || null,
        imported_at: item.imported_at || null,
      });
      const importId = result.lastInsertRowid;
      const normalized = buildNormalizedPayload(entity_type, rawObject, lookups);
      const normalizedPayload = stringifyPayload(normalized);
      if (entity_type === "client") {
        const duplicate = findDuplicateClient(normalized, lookups);
        if (duplicate) {
          updateInvalid.run({
            id: importId,
            normalized_payload: normalizedPayload,
            validation_errors: buildDuplicateValidationErrors(duplicate, normalized),
          });
          summary.queued += 1;
          summary.duplicates += 1;
          return;
        }
      }

      const validation = validateNormalizedPayload(entity_type, normalized, {
        lookups,
        skipDuplicateCheck: true,
      });
      if (!validation.valid) {
        updateInvalid.run({
          id: importId,
          normalized_payload: normalizedPayload,
          validation_errors: buildValidationErrors(validation),
        });
        summary.queued += 1;
        return;
      }

      const importRecord = get(importId);
      const created = insertValidatedEntity(entity_type, normalized, importRecord, {
        validated: 0,
      });
      updateValid.run({
        id: importId,
        normalized_payload: normalizedPayload,
        resolved_entity_id: created.id,
      });
      summary.created += 1;
      if (entity_type === "client") {
        registerClientLookup(lookups, normalized, created.id);
      }
    });
  });

  runImport(records);

  return summary;
}

function normalize(id, normalized_payload) {
  assert(normalized_payload, "normalized_payload is required");
  const record = get(id);
  assert(record, "Import record not found", 404);

  const normalized = normalizePayload(normalized_payload);
  const validation = validateNormalizedPayload(record.entity_type, normalized);
  const validationErrors = validation.valid
    ? null
    : stringifyPayload({
        errors: validation.errors,
        missing_fields: validation.missingFields,
        conflicts: validation.conflicts,
      });

  db.prepare(
    `UPDATE ${table}
     SET normalized_payload = @normalized_payload,
         validation_errors = @validation_errors
     WHERE id = @id`
  ).run({
    id,
    normalized_payload: stringifyPayload(normalized),
    validation_errors: validationErrors,
  });

  return {
    import: get(id),
    validation,
  };
}

function insertValidatedEntity(entityType, payload, importRecord, options = {}) {
  const tableName = ENTITY_TABLES[entityType];
  assert(tableName, "Unsupported entity type");

  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((col) => col.name)
    .filter((name) => name !== "id" && name !== "deleted_at");

  const insertData = {};
  columns.forEach((column) => {
    if (payload[column] !== undefined) {
      insertData[column] = payload[column];
    }
  });

  insertData.imported = 1;
  insertData.validated = options.validated === undefined ? 1 : options.validated ? 1 : 0;
  insertData.import_source = importRecord.import_source || payload.import_source || null;
  insertData.imported_at = importRecord.imported_at || new Date().toISOString();

  const keys = Object.keys(insertData);
  assert(keys.length > 0, "Normalized payload has no insertable fields");

  const stmt = db.prepare(
    `INSERT INTO ${tableName} (${keys.join(", ")})
     VALUES (${keys.map((key) => `@${key}`).join(", ")})`
  );

  const result = stmt.run(insertData);

  if (entityType === "client" && payload.notes !== undefined) {
    const notesArray = normalizeImportedNotes(payload.notes);
    if (notesArray) {
      // Persist imported notes into the notes table so the Notes tab can display them.
      notesService.saveNotesForEntity("client", result.lastInsertRowid, notesArray);
    }
  }

  return db
    .prepare(`SELECT * FROM ${tableName} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id: result.lastInsertRowid });
}

function validateAndApply(id, normalizedOverride = null) {
  const record = get(id);
  assert(record, "Import record not found", 404);
  assert(record.entity_type, "Import record missing entity_type");

  const normalized =
    normalizePayload(normalizedOverride) ||
    normalizePayload(record.normalized_payload);

  assert(normalized, "normalized_payload is required");

  const validation = validateNormalizedPayload(record.entity_type, normalized);
  if (!validation.valid) {
    const validationErrors = stringifyPayload({
      errors: validation.errors,
      missing_fields: validation.missingFields,
      conflicts: validation.conflicts,
    });

    db.prepare(
      `UPDATE ${table}
       SET validation_errors = @validation_errors,
           normalized_payload = @normalized_payload
       WHERE id = @id`
    ).run({
      id,
      validation_errors: validationErrors,
      normalized_payload: stringifyPayload(normalized),
    });

    return { import: get(id), validation, entity: null };
  }

  const created = insertValidatedEntity(record.entity_type, normalized, record);

  db.prepare(
    `UPDATE ${table}
     SET validated = 1,
         resolved_entity_id = @resolved_entity_id,
         resolved_at = CURRENT_TIMESTAMP,
         validation_errors = NULL,
         normalized_payload = @normalized_payload
     WHERE id = @id`
  ).run({
    id,
    resolved_entity_id: created.id,
    normalized_payload: stringifyPayload(normalized),
  });

  return { import: get(id), validation, entity: created };
}

module.exports = {
  list,
  get,
  createRaw,
  createBatch,
  autoImportBatch,
  normalize,
  validateAndApply,
  getClientImportSchema: () => ({
    fields: CLIENT_CANONICAL_FIELDS,
    aliases: CLIENT_FIELD_ALIASES,
  }),
};



