/**
 * formConfigs_UPDATED.js
 * Updated form configurations with proper relationship fields
 *
 * KEY CHANGES:
 * - Added relationship dropdowns (clientId, dossierId, lawsuitId)
 * - Options will be populated dynamically from mockData
 * - Forms now properly handle entity relationships
 */

import i18next from "i18next";
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
import { translateAssignee } from "../../utils/entityTranslations";
import { getStoredCurrency } from "../../utils/currency";

// Fallback translator for static configs defined at module scope
const t = i18next.t.bind(i18next);

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

export const clientFormFields = (t) => [
  {
    name: "name",
    label: t("form.fields.name.label"),
    type: "text",
    placeholder: t("form.fields.name.placeholder"),
    required: true,
    fullWidth: false,
  },
  {
    name: "email",
    label: t("form.fields.email.label"),
    type: "email",
    placeholder: t("form.fields.email.placeholder"),
    required: true,
    validate: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value) ? null : t("form.errors.emailInvalid");
    },
  },
  {
    name: "phone",
    label: t("form.fields.phone.label"),
    type: "tel",
    placeholder: t("form.fields.phone.placeholder"),
    required: true,
  },
  {
    name: "alternatePhone",
    label: t("form.fields.alternatePhone.label"),
    type: "tel",
    placeholder: t("form.fields.alternatePhone.placeholder"),
    required: false,
  },
  {
    name: "cin",
    label: t("form.fields.cin.label"),
    type: "text",
    placeholder: t("form.fields.cin.placeholder"),
    required: true,
  },
  {
    name: "dateOfBirth",
    label: t("form.fields.dateOfBirth.label"),
    type: "date",
    required: false,
  },
  {
    name: "address",
    label: t("form.fields.address.label"),
    type: "textarea",
    placeholder: t("form.fields.address.placeholder"),
    required: false,
    fullWidth: true,
    rows: 2,
  },
  {
    name: "profession",
    label: t("form.fields.profession.label"),
    type: "text",
    placeholder: t("form.fields.profession.placeholder"),
    required: false,
  },
  {
    name: "company",
    label: t("form.fields.company.label"),
    type: "text",
    placeholder: t("form.fields.company.placeholder"),
    required: false,
  },
  {
    name: "taxId",
    label: t("form.fields.taxId.label"),
    type: "text",
    placeholder: t("form.fields.taxId.placeholder"),
    required: false,
  },
  {
    name: "status",
    label: t("form.fields.status.label"),
    type: "inline-status",
    required: true,
    defaultValue: "Active",
    statusOptions: [
      {
        value: "Active",
        label: t("form.fields.status.options.active"),
        color: "green",
      },
      {
        value: "Inactive",
        label: t("form.fields.status.options.inactive"),
        color: "red",
      },
    ],
  },
  {
    name: "notes",
    label: t("form.fields.notes.label"),
    type: "textarea",
    placeholder: t("form.fields.notes.placeholder"),
    required: false,
    fullWidth: true,
    rows: 3,
  },
];

// ========================================
// DOSSIER FORM
// ========================================

export const dossierFormFields = (t) => {
  const categoryOptions = [
    {
      value: "Commercial Law",
      label: t("form.fields.category.options.commercialLaw"),
    },
    { value: "Family Law", label: t("form.fields.category.options.familyLaw") },
    {
      value: "Criminal Law",
      label: t("form.fields.category.options.criminalLaw"),
    },
    { value: "Labor Law", label: t("form.fields.category.options.laborLaw") },
    {
      value: "Real Estate Law",
      label: t("form.fields.category.options.realEstateLaw"),
    },
    {
      value: "Administrative Law",
      label: t("form.fields.category.options.administrativeLaw"),
    },
    { value: "Tax Law", label: t("form.fields.category.options.taxLaw") },
  ];

  const phaseOptions = [
    { value: "Opening", label: t("form.fields.phase.options.opening") },
    {
      value: "Investigation",
      label: t("form.fields.phase.options.investigation"),
    },
    { value: "Negotiation", label: t("form.fields.phase.options.negotiation") },
    { value: "Pleading", label: t("form.fields.phase.options.pleading") },
    { value: "Judgment", label: t("form.fields.phase.options.judgment") },
    { value: "Execution", label: t("form.fields.phase.options.execution") },
  ];

  return [
    {
      name: "lawsuitNumber",
      label: t("form.fields.lawsuitNumber.label"),
      type: "text",
      placeholder: t("form.fields.lawsuitNumber.placeholder"),
      required: false,
      helpText: t("form.fields.lawsuitNumber.helper"),
    },
    {
      name: "title",
      label: t("form.fields.title.label"),
      type: "text",
      placeholder: t("form.fields.title.placeholder"),
      required: true,
      fullWidth: true,
    },
    {
      // ?o. RELATIONSHIP FIELD - Client
      name: "clientId",
      label: t("form.fields.clientId.label"),
      type: "searchable-select", // ?o. Use searchable select for scalability
      required: true,
      options: [], // ?+? Will be populated dynamically with []
      helpText: t("form.fields.clientId.helper"),
    },
    {
      name: "category",
      label: t("form.fields.category.label"),
      type: "searchable-select",
      required: true,
      getOptions: () => getAllCategories(categoryOptions),
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
      label: t("form.fields.priority.label"),
      type: "inline-priority",
      required: true,
      defaultValue: "Medium",
    },
    {
      name: "phase",
      label: t("form.fields.phase.label"),
      type: "searchable-select",
      required: true,
      defaultValue: "Investigation",
      getOptions: () => getAllPhases(phaseOptions),
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
      label: t("form.fields.status.label"),
      type: "inline-status",
      required: true,
      defaultValue: "Open",
      statusOptions: [
        {
          value: "Open",
          label: t("form.fields.status.options.open"),
          color: "green",
        },
        {
          value: "In Progress",
          label: t("form.fields.status.options.inProgress"),
          color: "blue",
        },
        {
          value: "On Hold",
          label: t("form.fields.status.options.onHold"),
          color: "amber",
        },
        {
          value: "Closed",
          label: t("form.fields.status.options.closed"),
          color: "slate",
        },
      ],
    },
    {
      name: "openDate",
      label: t("form.fields.openDate.label"),
      type: "date",
      required: true,
      defaultValue: new Date().toISOString().split("T")[0],
    },
    {
      name: "description",
      label: t("form.fields.description.label"),
      type: "textarea",
      placeholder: t("form.fields.description.placeholder"),
      required: true,
      fullWidth: true,
      rows: 4,
    },
    {
      name: "adversaryParty",
      label: t("form.fields.adversaryParty.label"),
      type: "text",
      placeholder: t("form.fields.adversaryParty.placeholder"),
      required: false,
    },
    {
      name: "adversaryLawyer",
      label: t("form.fields.adversaryLawyer.label"),
      type: "searchable-select",
      placeholder: t("form.fields.adversaryLawyer.placeholder"),
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
      label: t("form.fields.estimatedValue.label"),
      type: "text",
      placeholder: t("form.fields.estimatedValue.placeholder"),
      required: false,
    },
    {
      name: "courtReference",
      label: t("form.fields.courtReference.label"),
      type: "text",
      placeholder: t("form.fields.courtReference.placeholder"),
      required: false,
    },
    // ?o. REMOVED: nextDeadline - now auto-calculated from sessions/tasks/financial entries
  ];
};
// ========================================
// LAWSUIT (PROCÈS) FORM
// ========================================

export const lawsuitFormFields = (t) => [
  {
    name: "lawsuitNumber",
    label: t("form.fields.lawsuitNumber.label"),
    type: "text",
    placeholder: t("form.fields.lawsuitNumber.placeholder"),
    required: false,
    helpText: t("form.fields.lawsuitNumber.helper"),
  },
  {
    name: "title",
    label: t("form.fields.title.label"),
    type: "text",
    placeholder: t("form.fields.title.placeholder"),
    required: true,
    fullWidth: true,
  },
  {
    name: "dossierId",
    label: t("form.fields.dossierId.label"),
    type: "searchable-select",
    required: true,
    options: [],
    helpText: t("form.fields.dossierId.helper"),
  },
  {
    name: "court",
    label: t("form.fields.court.label"),
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
    createLabel: t("form.fields.court.createLabel"),
  },
  {
    name: "filingDate",
    label: t("form.fields.filingDate.label"),
    type: "date",
    required: true,
    defaultValue: new Date().toISOString().split("T")[0],
  },
  {
    name: "courtReference",
    label: t("form.fields.courtReference.label"),
    type: "text",
    placeholder: t("form.fields.courtReference.placeholder"),
    required: false,
    helpText: t("form.fields.courtReference.helper"),
  },
  {
    name: "adversaryParty",
    label: t("form.fields.adversaryParty.label"),
    type: "text",
    placeholder: t("form.fields.adversaryParty.placeholder"),
    required: false,
  },
  {
    name: "adversaryLawyer",
    label: t("form.fields.adversaryLawyer.label"),
    type: "searchable-select",
    placeholder: t("form.fields.adversaryLawyer.placeholder"),
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
    label: t("form.fields.status.label"),
    type: "inline-status",
    required: true,
    defaultValue: "In Progress",
    statusOptions: [
      {
        value: "In Progress",
        label: t("form.fields.status.options.inProgress"),
        color: "blue",
      },
      {
        value: "On Hold",
        label: t("form.fields.status.options.onHold"),
        color: "amber",
      },
      {
        value: "Closed",
        label: t("form.fields.status.options.closed"),
        color: "slate",
      },
    ],
  },
  {
    name: "description",
    label: t("form.fields.description.label"),
    type: "textarea",
    placeholder: t("form.fields.description.placeholder"),
    required: false,
    fullWidth: true,
    rows: 3,
  },
]; // ========================================
// SESSION (SÉANCE JUDICIAIRE) FORM
// ========================================

export const sessionFormFields = (t) => [
  {
    name: "title",
    label: t("form.fields.title.label", { ns: "sessions" }),
    type: "text",
    placeholder: t("form.fields.title.placeholder", { ns: "sessions" }),
    required: true,
    fullWidth: true,
  },
  {
    name: "type",
    label: t("form.fields.type.label", { ns: "sessions" }),
    type: "select",
    required: true,
    defaultValue: "Audience",
    options: [
      {
        value: "Audience",
        label: t("form.fields.type.options.hearing", { ns: "sessions" }),
      },
      {
        value: "Consultation",
        label: t("form.fields.type.options.consultation", { ns: "sessions" }),
      },
      {
        value: "Mediation",
        label: t("form.fields.type.options.mediation", { ns: "sessions" }),
      },
      {
        value: "Expertise",
        label: t("form.fields.type.options.expertAssessment", {
          ns: "sessions",
        }),
      },
      {
        value: "Telephone",
        label: t("form.fields.type.options.phoneCall", { ns: "sessions" }),
      },
      {
        value: "Other",
        label: t("form.fields.type.options.other", { ns: "sessions" }),
      },
    ],
  },
  {
    // ✅ NEW: Choose between linking to Procès or Dossier
    name: "linkType",
    label: t("form.fields.linkType.label", { ns: "sessions" }),
    type: "select",
    required: true,
    defaultValue: "lawsuit",
    options: [
      {
        value: "lawsuit",
        label: t("form.fields.linkType.options.lawsuit", { ns: "sessions" }),
      },
      {
        value: "dossier",
        label: t("form.fields.linkType.options.dossier", { ns: "sessions" }),
      },
    ],
    helpText: t("form.fields.linkType.helper", { ns: "sessions" }),
    onChange: (value, formData, setFormData) => {
      // Clear the other field when type changes
      setFormData({
        ...formData,
        linkType: value,
        lawsuitId: value === "lawsuit" ? formData.lawsuitId : "",
        dossierId: value === "dossier" ? formData.dossierId : "",
      });
    },
  },
  {
    // ✅ RELATIONSHIP FIELD - Procès (shown when linkType is "lawsuit")
    name: "lawsuitId",
    label: t("form.fields.lawsuitId.label", { ns: "sessions" }),
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with []
    helpText: t("form.fields.lawsuitId.helper", { ns: "sessions" }),
    hideIf: (formData) => formData.linkType !== "lawsuit",
  },
  {
    // ✅ RELATIONSHIP FIELD - Dossier (shown when linkType is "dossier")
    name: "dossierId",
    label: t("form.fields.dossierId.label", { ns: "sessions" }),
    type: "searchable-select", // ✅ Use searchable select for scalability
    required: false,
    options: [], // ← Will be populated dynamically with []
    helpText: t("form.fields.dossierId.helper", { ns: "sessions" }),
    hideIf: (formData) => formData.linkType !== "dossier",
  },
  {
    name: "date",
    label: t("form.fields.date.label", { ns: "sessions" }),
    type: "date",
    required: true,
  },
  {
    name: "time",
    label: t("form.fields.time.label", { ns: "sessions" }),
    type: "select",
    required: true,
    helpText: t("form.fields.time.helper", { ns: "sessions" }),
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
    label: t("form.fields.duration.label", { ns: "sessions" }),
    type: "select",
    required: true,
    defaultValue: "01:00",
    options: [
      {
        value: "00:15",
        label: t("form.fields.duration.options.00_15", { ns: "sessions" }),
      },
      {
        value: "00:30",
        label: t("form.fields.duration.options.00_30", { ns: "sessions" }),
      },
      {
        value: "00:45",
        label: t("form.fields.duration.options.00_45", { ns: "sessions" }),
      },
      {
        value: "01:00",
        label: t("form.fields.duration.options.01_00", { ns: "sessions" }),
      },
      {
        value: "01:30",
        label: t("form.fields.duration.options.01_30", { ns: "sessions" }),
      },
      {
        value: "02:00",
        label: t("form.fields.duration.options.02_00", { ns: "sessions" }),
      },
      {
        value: "02:30",
        label: t("form.fields.duration.options.02_30", { ns: "sessions" }),
      },
      {
        value: "03:00",
        label: t("form.fields.duration.options.03_00", { ns: "sessions" }),
      },
      {
        value: "04:00",
        label: t("form.fields.duration.options.04_00", { ns: "sessions" }),
      },
    ],
    helpText: t("form.fields.duration.helper", { ns: "sessions" }),
  },
  {
    name: "location",
    label: t("form.fields.location.label", { ns: "sessions" }),
    type: "text",
    placeholder: t("form.fields.location.placeholder", { ns: "sessions" }),
    required: true,
  },
  {
    name: "courtRoom",
    label: t("form.fields.courtRoom.label", { ns: "sessions" }),
    type: "text",
    required: false,
    placeholder: t("form.fields.courtRoom.placeholder", { ns: "sessions" }),
    helpText: t("form.fields.courtRoom.helper", { ns: "sessions" }),
  },
  {
    name: "judge",
    label: t("form.fields.judge.label", { ns: "sessions" }),
    type: "text",
    required: false,
    placeholder: t("form.fields.judge.placeholder", { ns: "sessions" }),
    helpText: t("form.fields.judge.helper", { ns: "sessions" }),
  },
  {
    name: "status",
    label: t("form.fields.status.label", { ns: "sessions" }),
    type: "inline-status",
    required: true,
    defaultValue: "Scheduled",
    statusOptions: [
      {
        value: "Scheduled",
        label: t("form.fields.status.options.scheduled", { ns: "sessions" }),
        color: "blue",
      },
      {
        value: "Confirmed",
        label: t("form.fields.status.options.confirmed", { ns: "sessions" }),
        color: "green",
      },
      {
        value: "Pending",
        label: t("form.fields.status.options.pending", { ns: "sessions" }),
        color: "amber",
      },
      {
        value: "Completed",
        label: t("form.fields.status.options.completed", { ns: "sessions" }),
        color: "slate",
      },
      {
        value: "Cancelled",
        label: t("form.fields.status.options.cancelled", { ns: "sessions" }),
        color: "red",
      },
    ],
  },
  {
    name: "description",
    label: t("form.fields.description.label", { ns: "sessions" }),
    type: "textarea",
    placeholder: t("form.fields.description.placeholder", { ns: "sessions" }),
    required: false,
    fullWidth: true,
    rows: 3,
  },
];

// ========================================
// TASK FORM
// ========================================

export const taskFormFields = (t) => [
  {
    name: "title",
    label: t("form.fields.title.label"),
    type: "text",
    placeholder: t("form.fields.title.placeholder"),
    required: true,
    fullWidth: true,
  },
  {
    // ?. PARENT TYPE - Choose between Dossier or Case
    name: "parentType",
    label: t("form.fields.parentType.label"),
    type: "select",
    required: true,
    defaultValue: "dossier",
    options: [
      { value: "dossier", label: t("form.fields.parentType.options.dossier") },
      { value: "lawsuit", label: t("form.fields.parentType.options.lawsuit") },
    ],
    helpText: t("form.fields.parentType.helper"),
  },
  {
    // ?. RELATIONSHIP FIELD - Dossier (conditionally shown)
    name: "dossierId",
    label: t("form.fields.dossierId.label"),
    type: "searchable-select",
    required: false,
    options: [],
    hideIf: (formData) => formData.parentType !== "dossier",
  },
  {
    // ?. RELATIONSHIP FIELD - Case (conditionally shown)
    name: "lawsuitId",
    label: t("form.fields.lawsuitId.label"),
    type: "searchable-select",
    required: false,
    options: [],
    hideIf: (formData) => formData.parentType !== "lawsuit",
  },
  {
    name: "assignedTo",
    label: t("form.fields.assignedTo.label"),
    type: "searchable-select",
    required: true,
    getOptions: () =>
      getAllAssignees(DEFAULT_ASSIGNEES).map((option) => ({
        ...option,
        label: translateAssignee(option.label || option.value, t, "tasks"),
      })),
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
    createLabel: t("form.fields.assignedTo.createLabel"),
  },
  {
    name: "dueDate",
    label: t("form.fields.dueDate.label"),
    type: "date",
    required: true,
  },
  {
    name: "estimatedTime",
    label: t("form.fields.estimatedTime.label"),
    type: "select",
    required: false,
    options: [
      { value: "0.5h", label: t("form.fields.estimatedTime.options.0_5h") },
      { value: "1h", label: t("form.fields.estimatedTime.options.1h") },
      { value: "1.5h", label: t("form.fields.estimatedTime.options.1_5h") },
      { value: "2h", label: t("form.fields.estimatedTime.options.2h") },
      { value: "3h", label: t("form.fields.estimatedTime.options.3h") },
      { value: "4h", label: t("form.fields.estimatedTime.options.4h") },
      { value: "6h", label: t("form.fields.estimatedTime.options.6h") },
      { value: "8h", label: t("form.fields.estimatedTime.options.8h") },
      { value: "12h", label: t("form.fields.estimatedTime.options.12h") },
      { value: "16h", label: t("form.fields.estimatedTime.options.16h") },
      { value: "20h", label: t("form.fields.estimatedTime.options.20h") },
      { value: "24h", label: t("form.fields.estimatedTime.options.24h") },
      { value: "40h", label: t("form.fields.estimatedTime.options.40h") },
      { value: "80h", label: t("form.fields.estimatedTime.options.80h") },
    ],
    helpText: t("form.fields.estimatedTime.helper"),
  },
  {
    name: "priority",
    label: t("form.fields.priority.label"),
    type: "inline-priority",
    required: true,
    defaultValue: "Medium",
  },
  {
    name: "status",
    label: t("form.fields.status.label"),
    type: "inline-status",
    required: true,
    defaultValue: "Not Started",
    statusOptions: [
      {
        value: "Not Started",
        label: t("form.fields.status.options.notStarted"),
        color: "slate",
      },
      {
        value: "In Progress",
        label: t("form.fields.status.options.inProgress"),
        color: "blue",
      },
      {
        value: "Blocked",
        label: t("form.fields.status.options.blocked"),
        color: "red",
      },
      {
        value: "Done",
        label: t("form.fields.status.options.done"),
        color: "green",
      },
      {
        value: "Cancelled",
        label: t("form.fields.status.options.cancelled"),
        color: "amber",
      },
    ],
  },
  {
    name: "description",
    label: t("form.fields.description.label"),
    type: "textarea",
    placeholder: t("form.fields.description.placeholder"),
    required: false,
    fullWidth: true,
    rows: 4,
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
      { value: "Other", label: t("form.fields.type.options.other") },
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
    label: t("form.fields.status.label"),
    type: "inline-status",
    required: true,
    defaultValue: "Not Started",
    statusOptions: [
      {
        value: "Not Started",
        label: t("form.fields.status.options.notStarted"),
        color: "slate",
      },
      {
        value: "In Progress",
        label: t("form.fields.status.options.inProgress"),
        color: "blue",
      },
      {
        value: "Blocked",
        label: t("form.fields.status.options.blocked"),
        color: "red",
      },
      {
        value: "Done",
        label: t("form.fields.status.options.done"),
        color: "green",
      },
      {
        value: "Cancelled",
        label: t("form.fields.status.options.cancelled"),
        color: "amber",
      },
    ],
  },
  {
    name: "description",
    label: t("form.fields.description.label"),
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
    label: t("form.fields.linkType.label"),
    type: "select",
    required: true,
    options: [
      { value: "dossier", label: t("form.fields.dossierId.label") },
      { value: "lawsuit", label: "Lawsuite" },
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
      } else if (entityType === "lawsuit") {
        // Return lawsuits/procès from mockData - will be populated dynamically
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
    label: t("form.fields.status.label"),
    type: "inline-status",
    required: true,
    defaultValue: "Planned",
    statusOptions: [
      { value: "Planned", label: "Planned", color: "blue" },
      {
        value: "In Progress",
        label: t("form.fields.status.options.inProgress"),
        color: "amber",
      },
      {
        value: "Completed",
        label: t("form.fields.status.options.completed"),
        color: "green",
      },
      {
        value: "Cancelled",
        label: t("form.fields.status.options.cancelled"),
        color: "red",
      },
    ],
  },
  {
    name: "description",
    label: t("form.fields.description.label"),
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

export const getInvoiceFormFields = () => {
  const currency = getStoredCurrency();
  return [
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
    label: t("form.fields.type.label"),
    type: "select",
    required: true,
    options: [
      { value: "Fees", label: "Fees" },
      {
        value: "Consultation",
        label: t("form.fields.type.options.consultation"),
      },
      { value: "Expenses", label: "Expenses" },
    ],
  },
  {
    name: "amount",
    label: i18next.t("common:forms.invoice.amountLabel", {
      defaultValue: "Amount TTC ({{currency}})",
      currency,
    }),
    type: "text",
    placeholder: i18next.t("common:forms.invoice.amountPlaceholder", {
      defaultValue: "Ex: 1,500 {{currency}}",
      currency,
    }),
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
    label: t("form.fields.status.label"),
    type: "inline-status",
    required: true,
    defaultValue: "Pending",
    statusOptions: [
      { value: "Paid", label: "Paid", color: "green" },
      {
        value: "Pending",
        label: t("form.fields.status.options.pending"),
        color: "amber",
      },
      { value: "Overdue", label: "Overdue", color: "red" },
      {
        value: "Cancelled",
        label: t("form.fields.status.options.cancelled"),
        color: "slate",
      },
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
};

// ========================================
// MISSION FORM (Huissier Mission)
// ========================================

export const getMissionFormFields = () => {
  // Use i18next.t directly to get translations in current language
  const tMissions = (key, options = {}) =>
    i18next.t(`missions:${key}`, options);

  return [
    {
      name: "officerId",
      label: tMissions("form.fields.officer", { defaultValue: "Bailiff" }),
      type: "searchable-select",
      required: true,
      placeholder: tMissions("form.placeholders.officer", {
        defaultValue: "Select a bailiff...",
      }),
      options: [], // Will be populated dynamically
    },
    {
      name: "entityType",
      label: tMissions("form.fields.entityType", {
        defaultValue: "Entity Type",
      }),
      type: "select",
      required: true,
      disabled: true, // Will be set based on context
      options: [
        {
          value: "dossier",
          label: tMissions("detail.overview.entityTypes.dossier", {
            defaultValue: "Dossier",
          }),
        },
        {
          value: "lawsuit",
          label: tMissions("detail.overview.entityTypes.lawsuit", {
            defaultValue: "Lawsuit",
          }),
        },
      ],
    },
    {
      name: "entityReference",
      label: tMissions("form.fields.entityReference", {
        defaultValue: "Reference",
      }),
      type: "text",
      required: true,
      disabled: true, // Will be pre-filled based on context
      helpText: tMissions("form.help.entityReference", {
        defaultValue: "Reference of the dossier or lawsuit",
      }),
    },
    {
      name: "missionNumber",
      label: tMissions("form.fields.missionNumber", {
        defaultValue: "Reference / Number",
      }),
      type: "text",
      required: false,
      disabled: false, // Allow user input
      placeholder: tMissions("form.placeholders.missionNumber", {
        defaultValue: "Ex: MIS-2025-001 (auto-generated if empty)",
      }),
      helpText: tMissions("form.help.missionNumber", {
        defaultValue:
          "Optional - Leave blank for automatic generation (MIS-YEAR-XXX)",
      }),
    },
    {
      name: "title",
      label: tMissions("form.fields.title", { defaultValue: "Mission Title" }),
      type: "text",
      required: true,
      fullWidth: true,
      placeholder: tMissions("form.placeholders.title", {
        defaultValue: "Ex: Service of judicial act",
      }),
    },
    {
      name: "missionType",
      label: tMissions("form.fields.missionType", {
        defaultValue: "Mission Type",
      }),
      type: "searchable-select",
      required: true,
      getOptions: () =>
        getAllMissionTypes(DEFAULT_MISSION_TYPES).map((type) => ({
          ...type,
          label: tMissions(`form.options.missionType.${type.value}`, {
            defaultValue: type.label,
          }),
        })),
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
      label: tMissions("form.fields.priority", { defaultValue: "Priority" }),
      type: "inline-priority",
      required: true,
      defaultValue: "Medium",
    },
    {
      name: "assignDate",
      label: tMissions("form.fields.assignDate", {
        defaultValue: "Assignment Date",
      }),
      type: "date",
      required: true,
      defaultValue: new Date().toISOString().split("T")[0],
    },
    {
      name: "dueDate",
      label: tMissions("form.fields.dueDate", { defaultValue: "Due Date" }),
      type: "date",
      required: true,
    },
    {
      name: "status",
      label: tMissions("form.fields.status", { defaultValue: "Status" }),
      type: "inline-status",
      required: true,
      defaultValue: "Planned",
      statusOptions: [
        {
          value: "Planned",
          label: tMissions("form.options.status.planned", {
            defaultValue: "Planned",
          }),
          color: "blue",
        },
        {
          value: "In Progress",
          label: tMissions("form.options.status.inProgress", {
            defaultValue: "In Progress",
          }),
          color: "amber",
        },
        {
          value: "Completed",
          label: tMissions("form.options.status.completed", {
            defaultValue: "Completed",
          }),
          color: "green",
        },
        {
          value: "Cancelled",
          label: tMissions("form.options.status.cancelled", {
            defaultValue: "Cancelled",
          }),
          color: "red",
        },
      ],
    },
    {
      name: "description",
      label: tMissions("form.fields.description", {
        defaultValue: "Description",
      }),
      type: "textarea",
      required: true,
      fullWidth: true,
      rows: 3,
      placeholder: tMissions("form.placeholders.description", {
        defaultValue: "Detailed description of the mission...",
      }),
    },
    {
      name: "result",
      label: tMissions("form.fields.result", {
        defaultValue: "Report / Result",
      }),
      type: "textarea",
      required: false,
      fullWidth: true,
      rows: 3,
      placeholder: tMissions("form.placeholders.result", {
        defaultValue: "Detailed report of the mission execution...",
      }),
      helpText: tMissions("form.help.result", {
        defaultValue: "To be filled once the mission is completed",
      }),
    },
    {
      name: "completionDate",
      label: tMissions("form.fields.completionDate", {
        defaultValue: "Completion Date",
      }),
      type: "date",
      required: false,
      helpText: tMissions("form.help.completionDate", {
        defaultValue: "Completion date of the mission (if completed)",
      }),
    },
    {
      name: "notes",
      label: tMissions("form.fields.notes", { defaultValue: "Notes" }),
      type: "textarea",
      required: false,
      fullWidth: true,
      rows: 2,
      placeholder: tMissions("form.placeholders.notes", {
        defaultValue: "Additional notes...",
      }),
    },
    {
      name: "documents",
      label: tMissions("form.fields.documents", { defaultValue: "Documents" }),
      type: "file",
      required: false,
      fullWidth: true,
      multiple: true,
      accept:
        ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.rar,.txt",
      helpText: tMissions("form.help.documents", {
        defaultValue:
          "Add documents related to this mission (PDF, DOC, XLS, PPT, Images, Archives)",
      }),
    },
    {
      name: "financialEntries",
      label: tMissions("form.fields.financialEntries", {
        defaultValue: "Bailiff Fees",
      }),
      type: "financial-entries",
      required: false,
      fullWidth: true,
      helpText: tMissions("form.help.financialEntries", {
        defaultValue:
          "Add fees related to this mission. These fees will be automatically linked to the mission and client.",
      }),
      // Financial entries will be an array of objects with: amount, date, description
      defaultValue: [],
    },
  ];
};

// For backward compatibility, export as static array but it will be evaluated at module load
// Configs should call getMissionFormFields() to get fresh translations
export const missionFormFields = getMissionFormFields();

// ========================================
// FINANCIAL ENTRY FORM
// ========================================

export const getFinancialEntryFormFields = () => {
  // Use i18next.t directly to get translations in current language
  const tAccounting = (key, options = {}) =>
    i18next.t(`accounting:${key}`, options);
  const currency = getStoredCurrency();

  return [
    {
      name: "scope",
      label: tAccounting("form.fields.scope.label", {
        defaultValue: "Financial Scope",
      }),
      type: "select",
      required: true,
      defaultValue: "client",
      options: [
        {
          value: "client",
          label: tAccounting("form.fields.scope.options.client", {
            defaultValue: "Client (affects client balance)",
          }),
        },
        {
          value: "internal",
          label: tAccounting("form.fields.scope.options.internal", {
            defaultValue: "Internal (office expenses)",
          }),
        },
      ],
      helpText: tAccounting("form.fields.scope.help", {
        defaultValue:
          "Choose 'Client' for client-related operations, 'Internal' for office expenses",
      }),
      onChange: (value, formData, setFormData) => {
        // Clear client/dossier/lawsuit when switching to internal
        if (value === "internal") {
          setFormData({
            ...formData,
            scope: value,
            clientId: "",
            dossierId: "",
            lawsuitId: "",
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
      label: tAccounting("form.fields.type.label", {
        defaultValue: "Operation Type",
      }),
      type: "select",
      required: true,
      defaultValue: "expense",
      options: [
        {
          value: "revenue",
          label: tAccounting("form.fields.type.options.revenue", {
            defaultValue: "Revenue (money received)",
          }),
        },
        {
          value: "expense",
          label: tAccounting("form.fields.type.options.expense", {
            defaultValue: "Expense (money paid)",
          }),
        },
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
      label: tAccounting("form.fields.category.label", {
        defaultValue: "Category",
      }),
      type: "select",
      required: true,
      getOptions: (formData) => {
        const type = formData.type || "expense";
        const scope = formData.scope || "client";

        // Revenue categories
        if (type === "revenue") {
          return [
            {
              value: "honoraires",
              label: tAccounting("form.fields.category.options.honoraires", {
                defaultValue: "Fees",
              }),
            },
            {
              value: "advance",
              label: tAccounting("form.fields.category.options.advance", {
                defaultValue: "Client advance",
              }),
            },
            {
              value: "other",
              label: tAccounting("form.fields.category.options.other", {
                defaultValue: "Other",
              }),
            },
          ];
        }

        // Expense categories
        if (scope === "internal") {
          return [
            {
              value: "frais_bureau",
              label: tAccounting("form.fields.category.options.frais_bureau", {
                defaultValue: "Office expenses",
              }),
            },
            {
              value: "other",
              label: tAccounting("form.fields.category.options.other", {
                defaultValue: "Other",
              }),
            },
          ];
        }

        return [
          {
            value: "frais_judiciaires",
            label: tAccounting(
              "form.fields.category.options.frais_judiciaires",
              { defaultValue: "Court fees" }
            ),
          },
          {
            value: "frais_huissier",
            label: tAccounting("form.fields.category.options.frais_huissier", {
              defaultValue: "Bailiff fees",
            }),
          },
          {
            value: "other",
            label: tAccounting("form.fields.category.options.other", {
              defaultValue: "Other",
            }),
          },
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
      label: tAccounting("form.fields.amount.label", {
        defaultValue: "Amount ({{currency}})",
        currency,
      }),
      type: "number",
      required: true,
      placeholder: tAccounting("form.fields.amount.placeholder", {
        defaultValue: "0.00",
      }),
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
      label: tAccounting("form.fields.date.label", { defaultValue: "Date" }),
      type: "date",
      required: false,
      defaultValue: new Date().toISOString().split("T")[0],
      helpText: tAccounting("form.fields.date.help", {
        defaultValue: "If empty, today's date will be used",
      }),
    },
    {
      name: "dueDate",
      label: tAccounting("form.fields.dueDate.label", {
        defaultValue: "Due date",
      }),
      type: "date",
      required: true,
      defaultValue: new Date().toISOString().split("T")[0],
      helpText: tAccounting("form.fields.dueDate.help", {
        defaultValue: "Required: payment deadline or expected settlement date",
      }),
    },
    {
      name: "status",
      label: tAccounting("form.fields.status.label", {
        defaultValue: "Status",
      }),
      type: "inline-status",
      required: true,
      defaultValue: "confirmed",
      statusOptions: [
        {
          value: "draft",
          label: tAccounting("form.options.status.draft", {
            defaultValue: "Draft",
          }),
          color: "slate",
        },
        {
          value: "confirmed",
          label: tAccounting("form.options.status.confirmed", {
            defaultValue: "Confirmed",
          }),
          color: "blue",
        },
        {
          value: "paid",
          label: tAccounting("form.options.status.paid", {
            defaultValue: "Paid",
          }),
          color: "green",
        },
      ],
    },
    {
      name: "title",
      label: tAccounting("form.fields.title.label", { defaultValue: "Title" }),
      type: "text",
      required: true,
      fullWidth: true,
      placeholder: tAccounting("form.fields.title.placeholder", {
        defaultValue:
          "Ex: Court filing fee, Bailiff travel expenses, Legal consultation...",
      }),
      helpText: tAccounting("form.fields.title.help", {
        defaultValue: "Short, descriptive title for this financial entry",
      }),
    },
    {
      name: "description",
      label: tAccounting("form.fields.description.label", {
        defaultValue: "Additional Details (optional)",
      }),
      type: "textarea",
      required: false,
      fullWidth: true,
      rows: 3,
      placeholder: tAccounting("form.fields.description.placeholder", {
        defaultValue:
          "Optional additional details about this financial entry...",
      }),
    },
    {
      name: "clientId",
      label: tAccounting("form.fields.client.label", {
        defaultValue: "Client",
      }),
      type: "searchable-select",
      required: false,
      options: [], // Will be populated dynamically
      hideIf: (formData) => formData.scope === "internal",
      helpText: tAccounting("form.fields.client.help", {
        defaultValue:
          "Client concerned by this operation (required if scope = Client)",
      }),
      validate: (value, formData) => {
        if (formData.scope === "client" && (!value || value === "")) {
          return "Client is required when scope is 'Client'.";
        }
        return null;
      },
      onChange: (value, formData, setFormData) => {
        // Clear dossier and lawsuit when client changes
        setFormData({
          ...formData,
          clientId: value,
          dossierId: "",
          lawsuitId: "",
        });
      },
    },
    {
      name: "dossierId",
      label: tAccounting("form.fields.dossier.label", {
        defaultValue: "Dossier (optional)",
      }),
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
          .map((d) => ({ value: d.id, label: `${d.lawsuitNumber} - ${d.title}` }));
      },
      hideIf: (formData) => formData.scope === "internal",
      helpText: tAccounting("form.fields.dossier.help", {
        defaultValue: "Concerned dossier (optional)",
      }),
      onChange: (value, formData, setFormData) => {
        // Clear lawsuit when dossier changes (DB constraint: only one can be set)
        // However, if the current lawsuit belongs to this dossier, we can keep both
        setFormData({
          ...formData,
          dossierId: value,
          lawsuitId: "", // Always clear lawsuit when dossier changes to avoid constraint violation
        });
      },
    },
    {
      name: "lawsuitId",
      label: tAccounting("form.fields.lawsuit.label", {
        defaultValue: "Case (optional)",
      }),
      type: "searchable-select",
      required: false,
      options: [], // Base options - will be filtered by getOptions
      getOptions: (formData, allOptions) => {
        // Filter lawsuits by selected client or dossier
        const clientId = formData.clientId;
        const dossierId = formData.dossierId;
        if (!allOptions?.lawsuits) {
          return [];
        }

        let filteredCases = allOptions.lawsuits;

        // If dossier is selected, filter by dossier
        if (dossierId) {
          filteredCases = filteredCases.filter(
            (c) => c.dossierId === dossierId
          );
        } else if (clientId) {
          // If only client is selected, filter by client
          filteredCases = filteredCases.filter((c) => c.clientId === clientId);
        } else {
          return [];
        }

        return filteredCases.map((c) => ({
          value: c.id,
          label: `${c.lawsuitNumber} - ${c.title}`,
        }));
      },
      hideIf: (formData) => formData.scope === "internal",
      helpText: tAccounting("form.fields.lawsuit.help", {
        defaultValue: "Concerned lawsuit (optional)",
      }),
      onChange: (value, formData, setFormData) => {
        // Clear dossier when lawsuit is selected (DB constraint: only one can be set)
        // The lawsuit already has a dossier_id in the lawsuits table, so we don't need to duplicate it here
        setFormData({
          ...formData,
          lawsuitId: value,
          dossierId: value ? "" : formData.dossierId, // Clear dossierId only if selecting a lawsuit
        });
      },
    },
    {
      name: "missionId",
      label: tAccounting("form.fields.mission.label", {
        defaultValue: "Associated Mission",
      }),
      type: "searchable-select",
      required: false,
      options: [], // Base options - will be filtered by getOptions
      getOptions: (formData, allOptions) => {
        // Only show missions related to selected dossier or lawsuit
        const dossierId = formData.dossierId;
        const lawsuitId = formData.lawsuitId;

        if (!allOptions?.missions) {
          return [
            {
              value: "",
              label: tAccounting("form.fields.mission.noneAvailable", {
                defaultValue: "No mission available",
              }),
            },
          ];
        }

        let filteredMissions = allOptions.missions;

        // Filter missions based on selected entity
        if (dossierId) {
          filteredMissions = filteredMissions.filter(
            (m) =>
              m.entityType === "dossier" &&
              String(m.entityId) === String(dossierId)
          );
        } else if (lawsuitId) {
          filteredMissions = filteredMissions.filter(
            (m) =>
              m.entityType === "lawsuit" && String(m.entityId) === String(lawsuitId)
          );
        } else {
          // No dossier or lawsuit selected - don't show missions
          return [
            {
              value: "",
              label: tAccounting("form.fields.mission.selectPrerequisite", {
                defaultValue: "Please first select a dossier or lawsuit",
              }),
            },
          ];
        }

        if (filteredMissions.length === 0) {
          return [
            {
              value: "",
              label: tAccounting("form.fields.mission.noneForEntity", {
                defaultValue: "No mission for this dossier/lawsuit",
              }),
            },
          ];
        }

        return [
          {
            value: "",
            label: tAccounting("form.fields.mission.selectMission", {
              defaultValue: "Select the mission related to these fees",
            }),
          },
          ...filteredMissions.map((m) => ({
            value: m.id,
            label: `${m.missionNumber} - ${m.title} (${
              m.officerName ||
              tAccounting("form.fields.mission.fallbackOfficer", {
                defaultValue: "Bailiff not defined",
              })
            }) - ${m.status}`,
          })),
        ];
      },
      hideIf: (formData) =>
        formData.scope === "internal" || formData.category !== "frais_huissier",
      helpText: tAccounting("form.fields.mission.help", {
        defaultValue: "Select the bailiff mission related to these fees",
      }),
      onChange: (value, formData, setFormData, allOptions) => {
        // Auto-populate description when mission is selected
        if (value && allOptions?.missions) {
          const selectedMission = allOptions.missions.find(
            (m) => m.id === value
          );
          if (selectedMission && !formData.description) {
            setFormData({
              ...formData,
              missionId: value,
              description: tAccounting("form.fields.mission.autoDescription", {
                defaultValue: "Bailiff fees - {{missionNumber}} - {{title}}",
                missionNumber: selectedMission.missionNumber,
                title: selectedMission.title,
              }),
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
};

// For backward compatibility, export as static array but it will be evaluated at module load
// Configs should call getFinancialEntryFormFields() to get fresh translations
export const financialEntryFormFields = getFinancialEntryFormFields();

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get form fields for a specific entity type
 */
export function getFormFields(entityType) {
  const tWithNs = (ns) => (key, options) =>
    i18next.t(key, { ns, ...options });
  const fieldsMap = {
    client: clientFormFields,
    dossier: dossierFormFields,
    lawsuit: lawsuitFormFields(tWithNs("lawsuits")),
    session: sessionFormFields(tWithNs("sessions")),
    task: taskFormFields,
    personalTask: personalTaskFormFields,
    invoice: getInvoiceFormFields(),
    officerAssignment: officerAssignmentFormFields,
    mission: missionFormFields,
    financialEntry: getFinancialEntryFormFields(),
  };

  return fieldsMap[entityType] || [];
}

/**
 * Get form title for entity type
 */
export function getFormTitle(entityType, isEdit = false) {
  const defaultTitles = {
    client: { new: "New Client", edit: "Edit Client" },
    dossier: { new: "New Dossier", edit: "Edit Dossier" },
    lawsuit: { new: "New Lawsuit", edit: "Edit Lawsuit" },
    session: { new: "New Session", edit: "Edit Session" },
    task: { new: "New Task", edit: "Edit Task" },
    personalTask: { new: "New Personal Task", edit: "Edit Personal Task" },
    invoice: { new: "New Invoice", edit: "Edit Invoice" },
    officerAssignment: { new: "Assign Bailiff", edit: "Edit Mission" },
    mission: { new: "New Bailiff Mission", edit: "Edit Bailiff Mission" },
    financialEntry: {
      new: "New Financial Entry",
      edit: "Edit Financial Entry",
    },
  };

  const entityDefaults = defaultTitles[entityType];
  const mode = isEdit ? "edit" : "new";
  const defaultValue = entityDefaults ? entityDefaults[mode] : "Form";

  return i18next.t(`common:forms.titles.${entityType}.${mode}`, {
    defaultValue,
  });
}

/**
 * Populate relationship dropdowns dynamically
 * This function should be called before opening the form modal
 *
 * For fields with getOptions function, raw data is passed via allOptions
 * so the function can filter dynamically based on formData
 */
export function populateRelationshipOptions(fields, data) {
  const { clients, dossiers, lawsuits, officers, missions } = data;

  return fields.map((field) => {
    // For fields with getOptions, pass the raw data so they can filter dynamically
    if (field.getOptions) {
      return {
        ...field,
        allOptions: { clients, dossiers, lawsuits, officers, missions },
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
          label: `${d.lawsuitNumber} - ${d.title}`,
        })),
      };
    }
    if (field.name === "lawsuitId" && lawsuits) {
      // Only populate static options if no getOptions function
      return {
        ...field,
        options: [
          { value: null, label: "None (consultation)" },
          ...lawsuits.map((c) => ({
            value: c.id,
            label: `${c.lawsuitNumber} - ${c.title}`,
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





