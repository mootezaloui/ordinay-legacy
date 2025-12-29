/**
 * formConfigs_UPDATED.js
 * Updated form configurations with proper relationship fields
 *
 * KEY CHANGES:
 * - Added relationship dropdowns (clientId, dossierId, caseId)
 * - Options will be populated dynamically from mockData
 * - Forms now properly handle entity relationships
 */

import {
  getAllAssignees,
  addCustomAssignee,
} from "../../utils/assigneeManager";
import { getAllCourts, addCustomCourt } from "../../utils/courtManager";
import { getAllPhases, addCustomPhase } from "../../utils/phaseManager";
import { getAllJudges, addCustomJudge } from "../../utils/judgeManager";
import {
  getAllAdversaryLawyers,
  addCustomAdversaryLawyer,
} from "../../utils/adversaryLawyerManager";
import {
  getAllCategories,
  addCustomCategory,
} from "../../utils/categoryManager";
import {
  getAllMissionTypes,
  addCustomMissionType,
} from "../../utils/missionTypeManager";

// Default assignees that are always available
const DEFAULT_ASSIGNEES = [
  { value: "Myself", label: "Myself" },
  { value: "Intern", label: "Intern" },
];

// Default courts that are always available
const DEFAULT_COURTS = [
  {
    value: "Court of First Instance",
    label: "Court of First Instance",
  },
  { value: "Court of First Instance - Tunis", label: "CFI Tunis" },
  { value: "Court of First Instance - Ariana", label: "CFI Ariana" },
  {
    value: "Court of First Instance - Ben Arous",
    label: "CFI Ben Arous",
  },
  { value: "Court of Appeal", label: "Court of Appeal" },
  { value: "Court of Appeal - Tunis", label: "Court of Appeal Tunis" },
  { value: "Supreme Court", label: "Supreme Court" },
  { value: "Administrative Court", label: "Administrative Court" },
];

// Default phases that are always available
const DEFAULT_PHASES = [
  { value: "Opening", label: "Opening" },
  { value: "Investigation", label: "Investigation" },
  { value: "Negotiation", label: "Negotiation" },
  { value: "Pleading", label: "Pleading" },
  { value: "Judgment", label: "Judgment" },
  { value: "Execution", label: "Execution" },
];

// Default categories for dossiers
const DEFAULT_CATEGORIES = [
  { value: "Commercial Law", label: "Commercial Law" },
  { value: "Family Law", label: "Family Law" },
  { value: "Criminal Law", label: "Criminal Law" },
  { value: "Labor Law", label: "Labor Law" },
  { value: "Real Estate Law", label: "Real Estate Law" },
  { value: "Administrative Law", label: "Administrative Law" },
  { value: "Tax Law", label: "Tax Law" },
];

// Default mission types
const DEFAULT_MISSION_TYPES = [
  { value: "Service", label: "Service" },
  { value: "Execution", label: "Execution" },
  { value: "Observation", label: "Observation" },
  { value: "Seizure", label: "Seizure" },
  { value: "Investigation", label: "Investigation" },
];

// ========================================
// CLIENT FORM (No changes - clients are top level)
// ========================================

export const clientFormFields = [
  {
    name: "name",
    label: "Full Name",
    type: "text",
    placeholder: "Ex: Ahmed Ben Ali",
    required: true,
    fullWidth: false,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "example@email.com",
    required: true,
    validate: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value) ? null : "Invalid email";
    },
  },
  {
    name: "phone",
    label: "Phone",
    type: "tel",
    placeholder: "+216 98 123 456",
    required: true,
  },
  {
    name: "alternatePhone",
    label: "Alternate Phone",
    type: "tel",
    placeholder: "+216 71 234 567",
    required: false,
  },
  {
    name: "cin",
    label: "ID Number",
    type: "text",
    placeholder: "12345678",
    required: true,
  },
  {
    name: "dateOfBirth",
    label: "Date of Birth",
    type: "date",
    required: false,
  },
  {
    name: "address",
    label: "Address",
    type: "textarea",
    placeholder: "Full address",
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
    label: "Company",
    type: "text",
    placeholder: "Company name",
    required: false,
  },
  {
    name: "taxId",
    label: "Tax ID",
    type: "text",
    placeholder: "1234567X",
    required: false,
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Active",
    statusOptions: [
      { value: "Active", label: "Active", color: "green" },
      { value: "Inactive", label: "Inactive", color: "red" },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Important notes about the client...",
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
    label: "Reference / Number",
    type: "text",
    placeholder: "Ex: DOS-2025-001 (auto-generated if empty)",
    required: false,
    helpText: "Optional - Leave blank for automatic generation (DOS-YEAR-XXX)",
  },
  {
    name: "title",
    label: "Dossier Title",
    type: "text",
    placeholder: "Ex: Commercial Case - Contract",
    required: true,
    fullWidth: true,
  },
  {
    // ✅ RELATIONSHIP FIELD - Client
    name: "clientId",
    label: "Client",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: true,
    options: [], // ← Will be populated dynamically with []
    helpText: "Select the concerned client",
  },
  {
    name: "category",
    label: "Category",
    type: "searchable-select",
    required: true,
    getOptions: () => getAllCategories(DEFAULT_CATEGORIES),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomCategory(name);
        return true;
      } catch (error) {
        console.error("Error adding category:", error);
        return false;
      }
    },
  },
  {
    name: "priority",
    label: "Priority",
    type: "inline-priority",
    required: true,
    defaultValue: "Medium",
  },
  {
    name: "phase",
    label: "Phase",
    type: "searchable-select",
    required: true,
    defaultValue: "Investigation",
    getOptions: () => getAllPhases(DEFAULT_PHASES),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomPhase(name);
        return true;
      } catch (error) {
        console.error("Error adding phase:", error);
        return false;
      }
    },
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Open",
    statusOptions: [
      { value: "Open", label: "Open", color: "green" },
      { value: "In Progress", label: "In Progress", color: "blue" },
      { value: "On Hold", label: "On Hold", color: "amber" },
      { value: "Closed", label: "Closed", color: "slate" },
    ],
  },
  {
    name: "openDate",
    label: "Opening Date",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Detailed description of the Dossier...",
    required: true,
    fullWidth: true,
    rows: 4,
  },
  {
    name: "adversaryParty",
    label: "Opposing Party",
    type: "text",
    placeholder: "Name of opposing party",
    required: false,
  },
  {
    name: "adversaryLawyer",
    label: "Opposing Lawyer",
    type: "searchable-select",
    placeholder: "Me. Lawyer's name",
    required: false,
    getOptions: () => getAllAdversaryLawyers([]),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomAdversaryLawyer(name);
        return true;
      } catch (error) {
        console.error("Error adding adversary lawyer:", error);
        return false;
      }
    },
  },
  {
    name: "estimatedValue",
    label: "Estimated Value",
    type: "text",
    placeholder: "Ex: 50,000 TND",
    required: false,
  },
  {
    name: "courtReference",
    label: "Court Reference",
    type: "text",
    placeholder: "Ex: TPI-2024-1234",
    required: false,
  },
  // ✅ REMOVED: nextDeadline - now auto-calculated from sessions/tasks/financial entries
];

// ========================================
// CASE (PROCÈS) FORM
// ========================================

export const caseFormFields = [
  {
    name: "caseNumber",
    label: "Reference / Number",
    type: "text",
    placeholder: "Ex: PRO-2025-001 (auto-generated if empty)",
    required: false,
    helpText: "Optional - Leave blank for automatic generation (PRO-YEAR-XXX)",
  },
  {
    name: "title",
    label: "Lawsuit Title",
    type: "text",
    placeholder: "Ex: Commercial Dispute - Hearing",
    required: true,
    fullWidth: true,
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (MANDATORY - every procès needs a dossier/client)
    name: "dossierId",
    label: "Dossier",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: true,
    options: [], // ← Will be populated dynamically with []
    helpText: "Required - Each case must be linked to a Dossier",
  },
  {
    name: "court",
    label: "Court",
    type: "searchable-select",
    required: true,
    getOptions: () => getAllCourts(DEFAULT_COURTS),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomCourt(name);
        return true;
      } catch (error) {
        alert(error.message);
        throw error;
      }
    },
    createLabel: "Add",
  },
  {
    name: "filingDate",
    label: "Filing Date",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  // ✅ REMOVED: nextHearing - now auto-calculated from related sessions
  {
    name: "referenceNumber",
    label: "Reference Number",
    type: "text",
    placeholder: "Ex: TPI-2024-COM-1234",
    required: false,
  },
  {
    name: "adversaryParty",
    label: "Opposing Party",
    type: "text",
    placeholder: "Name of opposing party",
    required: false,
  },
  {
    name: "adversaryLawyer",
    label: "Opposing Lawyer",
    type: "searchable-select",
    placeholder: "Me. Lawyer's name",
    required: false,
    getOptions: () => getAllAdversaryLawyers([]),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomAdversaryLawyer(name);
        return true;
      } catch (error) {
        console.error("Error adding adversary lawyer:", error);
        return false;
      }
    },
  },
  {
    name: "status",
    label: "Case Status",
    type: "inline-status",
    required: true,
    defaultValue: "In Progress",
    statusOptions: [
      { value: "In Progress", label: "In Progress", color: "blue" },
      { value: "On Hold", label: "On Hold", color: "amber" },
      { value: "Closed", label: "Closed", color: "slate" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Description of the case...",
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
    label: "Session Title",
    type: "text",
    placeholder: "Ex: Preliminary hearing",
    required: true,
    fullWidth: true,
  },
  {
    name: "type",
    label: "Type",
    type: "select",
    required: true,
    defaultValue: "Hearing",
    options: [
      { value: "Hearing", label: "Hearing" },
      { value: "Consultation", label: "Consultation" },
      { value: "Mediation", label: "Mediation" },
      { value: "Expert Assessment", label: "Expert Assessment" },
      { value: "Phone Call", label: "Phone Call" },
      { value: "Other", label: "Other" },
    ],
  },
  {
    // ✅ NEW: Choose between linking to Procès or Dossier
    name: "linkType",
    label: "Linked to",
    type: "select",
    required: true,
    defaultValue: "case",
    options: [
      { value: "case", label: "Lawsuit" },
      { value: "dossier", label: "Dossier" },
    ],
    helpText: "A hearing can be linked to a case or directly to a Dossier",
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
    label: "Case",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with []
    helpText: "Select the concerned case",
    hideIf: (formData) => formData.linkType !== "case",
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (shown when linkType is "dossier")
    name: "dossierId",
    label: "Dossier",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with []
    helpText: "Select the concerned Dossier",
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
    label: "Time",
    type: "select",
    required: true,
    helpText: "Select start time",
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
    label: "Estimated Duration",
    type: "select",
    required: true,
    defaultValue: "01:00",
    options: [
      { value: "00:15", label: "15 minutes" },
      { value: "00:30", label: "30 minutes" },
      { value: "00:45", label: "45 minutes" },
      { value: "01:00", label: "1 hour" },
      { value: "01:30", label: "1h30" },
      { value: "02:00", label: "2 hours" },
      { value: "02:30", label: "2h30" },
      { value: "03:00", label: "3 hours" },
      { value: "04:00", label: "4 hours" },
    ],
    helpText: "Expected duration of the session",
  },
  {
    name: "location",
    label: "Location",
    type: "text",
    placeholder: "Office, Court, etc.",
    required: true,
  },
  {
    name: "courtRoom",
    label: "Court Room",
    type: "text",
    required: false,
    placeholder: "e.g., Courtroom 5A",
    helpText: "The specific courtroom where this hearing takes place",
  },
  {
    name: "judge",
    label: "Judge",
    type: "text",
    required: false,
    placeholder: "e.g., Judge Smith",
    helpText: "The judge presiding over this hearing",
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Scheduled",
    statusOptions: [
      { value: "Scheduled", label: "Scheduled", color: "blue" },
      { value: "Confirmed", label: "Confirmed", color: "green" },
      { value: "Pending", label: "Pending", color: "amber" },
      { value: "Completed", label: "Completed", color: "slate" },
      { value: "Cancelled", label: "Cancelled", color: "red" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Description of the session...",
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
    label: "Task Title",
    type: "text",
    placeholder: "Ex: Prepare pleading file",
    required: true,
    fullWidth: true,
  },
  {
    // ✅ PARENT TYPE - Choose between Dossier or Case
    name: "parentType",
    label: "Linked to",
    type: "select",
    required: true,
    defaultValue: "dossier",
    options: [
      { value: "dossier", label: "Dossier" },
      { value: "case", label: "Case" },
    ],
    helpText: "A task can be linked to a Dossier or a case",
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (conditionally shown)
    name: "dossierId",
    label: "Dossier",
    type: "searchable-select",
    required: false, // Will be conditionally required
    options: [], // Will be populated by parent component (Tasks.jsx)
    // ✅ Conditional visibility
    hideIf: (formData) => formData.parentType !== "dossier",
  },
  {
    // ✅ RELATIONSHIP FIELD - Case (conditionally shown)
    name: "caseId",
    label: "Case",
    type: "searchable-select",
    required: false, // Will be conditionally required
    options: [], // Will be populated by parent component (Tasks.jsx)
    // ✅ Conditional visibility
    hideIf: (formData) => formData.parentType !== "case",
  },
  {
    name: "assignedTo",
    label: "Assigned to",
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
    createLabel: "Add",
  },
  {
    name: "dueDate",
    label: "Due Date",
    type: "date",
    required: true,
  },
  {
    name: "priority",
    label: "Priority",
    type: "inline-priority",
    required: true,
    defaultValue: "Medium",
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Not Started",
    statusOptions: [
      { value: "Not Started", label: "Not Started", color: "slate" },
      { value: "In Progress", label: "In Progress", color: "blue" },
      { value: "Blocked", label: "Blocked", color: "red" },
      { value: "Done", label: "Done", color: "green" },
      { value: "Cancelled", label: "Cancelled", color: "amber" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Detailed description of the task...",
    required: false,
    fullWidth: true,
    rows: 4,
  },
  {
    name: "estimatedTime",
    label: "Estimated Time",
    type: "select",
    required: false,
    options: [
      { value: "0.5h", label: "30 minutes" },
      { value: "1h", label: "1 hour" },
      { value: "1.5h", label: "1h30" },
      { value: "2h", label: "2 hours" },
      { value: "3h", label: "3 hours" },
      { value: "4h", label: "4 hours" },
      { value: "6h", label: "6 hours" },
      { value: "8h", label: "8 hours" },
      { value: "12h", label: "12 hours" },
      { value: "16h", label: "16 hours" },
      { value: "20h", label: "20 hours" },
      { value: "24h", label: "1 day" },
      { value: "40h", label: "2 days" },
      { value: "80h", label: "1 week" },
    ],
    helpText: "Estimated duration to complete the task",
  },
];

// ========================================
// PERSONAL TASK FORM
// ========================================

export const personalTaskFormFields = [
  {
    name: "title",
    label: "Task Title",
    type: "text",
    placeholder: "Ex: Pay electricity bill",
    required: true,
    fullWidth: true,
  },
  {
    name: "category",
    label: "Category",
    type: "select",
    required: true,
    options: [
      { value: "Bills", label: "Bills" },
      { value: "Office", label: "Office" },
      { value: "Personal", label: "Personal" },
      { value: "IT", label: "IT" },
      { value: "Administrative", label: "Administrative" },
      { value: "Other", label: "Other" },
    ],
  },
  {
    name: "dueDate",
    label: "Due Date",
    type: "date",
    required: true,
  },
  {
    name: "priority",
    label: "Priority",
    type: "inline-priority",
    required: true,
    defaultValue: "Medium",
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Not Started",
    statusOptions: [
      { value: "Not Started", label: "Not Started", color: "slate" },
      { value: "In Progress", label: "In Progress", color: "blue" },
      { value: "Blocked", label: "Blocked", color: "red" },
      { value: "Done", label: "Done", color: "green" },
      { value: "Cancelled", label: "Cancelled", color: "amber" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Detailed description of the task...",
    required: false,
    fullWidth: true,
    rows: 4,
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Additional notes...",
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
    label: "Mission Number",
    type: "text",
    placeholder: "MIS-2024-001",
    required: true,
    helpText: "Format: MIS-YEAR-NUMBER",
  },
  {
    name: "title",
    label: "Mission Title",
    type: "text",
    placeholder: "Ex: Service of judicial act",
    required: true,
    fullWidth: true,
  },
  {
    // ✅ RELATIONSHIP FIELD - Officer
    name: "officerId",
    label: "Bailiff",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: true,
    options: [], // ← Will be populated dynamically with []
  },
  {
    name: "entityType",
    label: "Linked to",
    type: "select",
    required: true,
    options: [
      { value: "dossier", label: "Dossier" },
      { value: "case", label: "Lawsuite" },
    ],
    helpText: "This mission concerns a Dossier or a Lawsuite",
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
    label: "Reference (Dossier/Lawsuite)",
    type: "searchable-select", // ✅ NEW: Searchable dropdown
    placeholder: "Search or enter: DOS-2024-001 or PRO-2024-001",
    required: true,
    helpText: "Select from the list or enter manually",
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
    label: "Mission Type",
    type: "searchable-select",
    required: true,
    getOptions: () => getAllMissionTypes(DEFAULT_MISSION_TYPES),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomMissionType(name);
        return true;
      } catch (error) {
        console.error("Error adding mission type:", error);
        return false;
      }
    },
  },
  {
    name: "assignDate",
    label: "Assignment Date",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "dueDate",
    label: "Due Date",
    type: "date",
    required: false,
    helpText: "Optional - deadline to complete the mission",
  },
  {
    name: "priority",
    label: "Priority",
    type: "inline-priority",
    required: true,
    defaultValue: "Medium",
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Planned",
    statusOptions: [
      { value: "Planned", label: "Planned", color: "blue" },
      { value: "In Progress", label: "In Progress", color: "amber" },
      { value: "Completed", label: "Completed", color: "green" },
      { value: "Cancelled", label: "Cancelled", color: "red" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "Detailed description of the mission...",
    required: false,
    fullWidth: true,
    rows: 3,
  },
  {
    name: "notes",
    label: "Internal Notes",
    type: "textarea",
    placeholder: "Internal notes about this mission...",
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
    label: "Invoice Number",
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
    options: [], // ← Will be populated dynamically with []
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (optional)
    name: "dossierId",
    label: "Dossier (optional)",
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with []
    helpText: "Link the invoice to a specific Dossier",
  },
  {
    name: "type",
    label: "Type",
    type: "select",
    required: true,
    options: [
      { value: "Fees", label: "Fees" },
      { value: "Consultation", label: "Consultation" },
      { value: "Expenses", label: "Expenses" },
    ],
  },
  {
    name: "amount",
    label: "Amount TTC",
    type: "text",
    placeholder: "Ex: 1,500 TND",
    required: true,
  },
  {
    name: "date",
    label: "Issue Date",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "dueDate",
    label: "Due Date",
    type: "date",
    required: true,
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Pending",
    statusOptions: [
      { value: "Paid", label: "Paid", color: "green" },
      { value: "Pending", label: "Pending", color: "amber" },
      { value: "Overdue", label: "Overdue", color: "red" },
      { value: "Cancelled", label: "Cancelled", color: "slate" },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Notes about the invoice...",
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
    label: "Bailiff",
    type: "searchable-select",
    required: true,
    placeholder: "Select a bailiff...",
    options: [], // Will be populated dynamically
  },
  {
    name: "entityType",
    label: "Entity Type",
    type: "select",
    required: true,
    disabled: true, // Will be set based on context
    options: [
      { value: "dossier", label: "Dossier" },
      { value: "case", label: "Case" },
    ],
  },
  {
    name: "entityReference",
    label: "Reference",
    type: "text",
    required: true,
    disabled: true, // Will be pre-filled based on context
    helpText: "Reference of the Dossier or case",
  },
  {
    name: "missionNumber",
    label: "Reference / Number",
    type: "text",
    required: false,
    disabled: false, // Allow user input
    placeholder: "Ex: MIS-2025-001 (auto-generated if empty)",
    helpText: "Optional - Leave blank for automatic generation (MIS-YEAR-XXX)",
  },
  {
    name: "title",
    label: "Mission Title",
    type: "text",
    required: true,
    fullWidth: true,
    placeholder: "Ex: Service of judicial act",
  },
  {
    name: "missionType",
    label: "Mission Type",
    type: "searchable-select",
    required: true,
    getOptions: () => getAllMissionTypes(DEFAULT_MISSION_TYPES),
    allowCreate: true,
    onCreateOption: async (name) => {
      try {
        addCustomMissionType(name);
        return true;
      } catch (error) {
        console.error("Error adding mission type:", error);
        return false;
      }
    },
  },
  {
    name: "priority",
    label: "Priority",
    type: "inline-priority",
    required: true,
    defaultValue: "Medium",
  },
  {
    name: "assignDate",
    label: "Assignment Date",
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "dueDate",
    label: "Due Date",
    type: "date",
    required: true,
  },
  {
    name: "status",
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "Planned",
    statusOptions: [
      { value: "Planned", label: "Planned", color: "blue" },
      { value: "In Progress", label: "In Progress", color: "amber" },
      { value: "Completed", label: "Completed", color: "green" },
      { value: "Cancelled", label: "Cancelled", color: "red" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    required: true,
    fullWidth: true,
    rows: 3,
    placeholder: "Detailed description of the mission...",
  },
  {
    name: "result",
    label: "Report / Result",
    type: "textarea",
    required: false,
    fullWidth: true,
    rows: 3,
    placeholder: "Detailed report of the mission execution...",
    helpText: "To be filled once the mission is completed",
  },
  {
    name: "completionDate",
    label: "Completion Date",
    type: "date",
    required: false,
    helpText: "Completion date of the mission (if completed)",
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    required: false,
    fullWidth: true,
    rows: 2,
    placeholder: "Additional notes...",
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
      "Add documents related to this mission (PDF, DOC, XLS, PPT, Images, Archives)",
  },
  {
    name: "financialEntries",
    label: "Bailiff Fees",
    type: "financial-entries",
    required: false,
    fullWidth: true,
    helpText:
      "Add fees related to this mission. These fees will be automatically linked to the mission and client.",
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
    label: "Financial Scope",
    type: "select",
    required: true,
    defaultValue: "client",
    options: [
      { value: "client", label: "Client (affects client balance)" },
      { value: "internal", label: "Internal (office expenses)" },
    ],
    helpText:
      "Choose 'Client' for client-related operations, 'Internal' for office expenses",
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
    label: "Operation Type",
    type: "select",
    required: true,
    defaultValue: "expense",
    options: [
      { value: "revenue", label: "Revenue (money received)" },
      { value: "expense", label: "Expense (money paid)" },
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
    label: "Category",
    type: "select",
    required: true,
    getOptions: (formData) => {
      const type = formData.type || "expense";
      const scope = formData.scope || "client";

      // Revenue categories
      if (type === "revenue") {
        return [
          { value: "honoraires", label: "Fees" },
          { value: "advance", label: "Client advance" },
          { value: "other", label: "Other revenue" },
        ];
      }

      // Expense categories
      if (scope === "internal") {
        return [
          { value: "frais_bureau", label: "Office expenses" },
          { value: "other", label: "Other expense" },
        ];
      }

      return [
        { value: "frais_judiciaires", label: "Court fees" },
        { value: "frais_huissier", label: "Bailiff fees" },
        { value: "other", label: "Other expense" },
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
    label: "Amount (TND)",
    type: "number",
    required: true,
    placeholder: "0.00",
    min: 0,
    step: 0.01,
    validate: (value) => {
      const amount = parseFloat(value);
      if (isNaN(amount) || amount <= 0) {
        return "Amount must be greater than 0";
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
    label: "Status",
    type: "inline-status",
    required: true,
    defaultValue: "confirmed",
    statusOptions: [
      { value: "draft", label: "Draft", color: "slate" },
      { value: "confirmed", label: "Confirmed", color: "blue" },
      { value: "paid", label: "Paid", color: "green" },
    ],
  },
  {
    name: "title",
    label: "Title",
    type: "text",
    required: true,
    fullWidth: true,
    placeholder: "Ex: Court filing fee, Bailiff travel expenses, Legal consultation...",
    helpText: "Short, descriptive title for this financial entry",
  },
  {
    name: "description",
    label: "Additional Details (optional)",
    type: "textarea",
    required: false,
    fullWidth: true,
    rows: 3,
    placeholder: "Optional additional details about this financial entry...",
  },
  {
    name: "clientId",
    label: "Client",
    type: "searchable-select",
    required: false,
    options: [], // Will be populated dynamically
    hideIf: (formData) => formData.scope === "internal",
    helpText: "Client concerned by this operation (required if scope = Client)",
    validate: (value, formData) => {
      if (formData.scope === "client" && (!value || value === "")) {
        return "Client is required when scope is 'Client'.";
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
    label: "Dossier (optional)",
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
    helpText: "Concerned Dossier (optional)",
    onChange: (value, formData, setFormData) => {
      // Clear case when dossier changes (DB constraint: only one can be set)
      // However, if the current case belongs to this dossier, we can keep both
      setFormData({
        ...formData,
        dossierId: value,
        caseId: "", // Always clear case when dossier changes to avoid constraint violation
      });
    },
  },
  {
    name: "caseId",
    label: "Case (optional)",
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
    helpText: "Concerned case (optional)",
    onChange: (value, formData, setFormData) => {
      // Clear dossier when case is selected (DB constraint: only one can be set)
      // The case already has a dossier_id in the cases table, so we don't need to duplicate it here
      setFormData({
        ...formData,
        caseId: value,
        dossierId: value ? "" : formData.dossierId, // Clear dossierId only if selecting a case
      });
    },
  },
  {
    name: "missionId",
    label: "Associated Mission **",
    type: "searchable-select",
    required: false,
    options: [], // Base options - will be filtered by getOptions
    getOptions: (formData, allOptions) => {
      // Only show missions related to selected dossier or case
      const dossierId = formData.dossierId;
      const caseId = formData.caseId;

      if (!allOptions?.missions) {
        return [{ value: "", label: "No mission available" }];
      }

      let filteredMissions = allOptions.missions;

      // Filter missions based on selected entity
      if (dossierId) {
        filteredMissions = filteredMissions.filter(
          (m) => m.entityType === "dossier" && String(m.entityId) === String(dossierId)
        );
      } else if (caseId) {
        filteredMissions = filteredMissions.filter(
          (m) => m.entityType === "case" && String(m.entityId) === String(caseId)
        );
      } else {
        // No dossier or case selected - don't show missions
        return [
          {
            value: "",
            label: "Please first select a Dossier or case",
          },
        ];
      }

      if (filteredMissions.length === 0) {
        return [{ value: "", label: "No mission for this Dossier/case" }];
      }

      return [
        { value: "", label: "Select the mission related to these fees" },
        ...filteredMissions.map((m) => ({
          value: m.id,
          label: `${m.missionNumber} - ${m.title} (${
            m.officerName || "Bailiff not defined"
          }) - ${m.status}`,
        })),
      ];
    },
    hideIf: (formData) =>
      formData.scope === "internal" || formData.category !== "frais_huissier",
    helpText: "Select the bailiff mission related to these fees",
    onChange: (value, formData, setFormData, allOptions) => {
      // Auto-populate description when mission is selected
      if (value && allOptions?.missions) {
        const selectedMission = allOptions.missions.find((m) => m.id === value);
        if (selectedMission && !formData.description) {
          setFormData({
            ...formData,
            missionId: value,
            description: `Bailiff fees - ${selectedMission.missionNumber} - ${selectedMission.title}`,
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
    client: isEdit ? "Edit Client" : "New Client",
    dossier: isEdit ? "Edit Dossier" : "New Dossier",
    case: isEdit ? "Edit Case" : "New Case",
    session: isEdit ? "Edit Session" : "New Session",
    task: isEdit ? "Edit Task" : "New Task",
    personalTask: isEdit ? "Edit Personal Task" : "New Personal Task",
    invoice: isEdit ? "Edit Invoice" : "New Invoice",
    officerAssignment: isEdit ? "Edit Mission" : "Assign Bailiff",
    mission: isEdit ? "Edit Bailiff Mission" : "New Bailiff Mission",
    financialEntry: isEdit ? "Edit Financial Entry" : "New Financial Entry",
  };

  return titles[entityType] || "Form";
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
          { value: null, label: "None (consultation)" },
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
