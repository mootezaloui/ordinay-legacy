"use strict";

const ACTION_TYPES = Object.freeze({
  CREATE_ENTITY: "CREATE_ENTITY",
  ADD_NOTE: "ADD_NOTE",
  GENERATE_DOCUMENT: "GENERATE_DOCUMENT",
  ENRICH_FIELD: "ENRICH_FIELD",
});

/**
 * Entity Relationship Norms Matrix
 *
 * For each source entity type, defines what proactive suggestions are relevant
 * when that entity is the focus of a conversation.
 *
 * Structure per entry:
 *   expectedRelations[]   — related entities that should exist (CREATE_ENTITY candidates)
 *   criticalMissingFields[] — fields that if empty warrant ENRICH_FIELD suggestions
 *   documentOpportunities[] — GENERATE_DOCUMENT candidates (need conversation signal)
 *   noteOpportunities[]    — ADD_NOTE candidates (need conversation signal)
 *
 * contextSignals: keywords in the conversation that boost relevance score.
 * urgency: base urgency weight (0.0–1.0). Higher = surfaces more aggressively.
 * conditionMet: true means the deterministic check passed (no LLM needed for gating).
 */
const ENTITY_NORMS = {
  dossier: {
    expectedRelations: [
      {
        actionType: ACTION_TYPES.CREATE_ENTITY,
        targetEntityType: "lawsuit",
        condition: "no_active_lawsuit",
        contextSignals: ["lawsuit", "litigation", "court", "claim", "filing", "case", "proceeding", "sue", "legal action", "guard", "custody", "divorce", "inheritance"],
        urgency: 0.75,
        label: "Open a lawsuit for this dossier",
        reasonTemplate: "This dossier has no linked lawsuit.",
      },
      {
        actionType: ACTION_TYPES.CREATE_ENTITY,
        targetEntityType: "session",
        condition: "no_upcoming_session",
        contextSignals: ["meeting", "hearing", "appointment", "session", "schedule", "next date", "when"],
        urgency: 0.55,
        label: "Schedule a session for this dossier",
        reasonTemplate: "No upcoming session is scheduled for this dossier.",
      },
      {
        actionType: ACTION_TYPES.CREATE_ENTITY,
        targetEntityType: "task",
        condition: "no_open_tasks",
        contextSignals: ["task", "action item", "todo", "follow up", "deadline", "prepare", "submit"],
        urgency: 0.45,
        label: "Add a task for this dossier",
        reasonTemplate: "This dossier has no open tasks.",
      },
    ],
    criticalMissingFields: [
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "description",
        urgency: 0.35,
        label: "Add a description to this dossier",
        reasonTemplate: "Dossier description is missing.",
      },
    ],
    documentOpportunities: [
      {
        actionType: ACTION_TYPES.GENERATE_DOCUMENT,
        documentType: "dossier_summary",
        contextSignals: ["summary", "report", "overview", "brief", "document"],
        urgency: 0.30,
        label: "Generate a dossier summary",
        reasonTemplate: "A summary document can be generated for this dossier.",
      },
    ],
    noteOpportunities: [
      {
        actionType: ACTION_TYPES.ADD_NOTE,
        contextSignals: ["note", "record", "update", "inform", "mention", "comment"],
        urgency: 0.30,
        label: "Add a note to this dossier",
        reasonTemplate: "A note can be recorded for this dossier.",
      },
    ],
  },

  client: {
    expectedRelations: [
      {
        actionType: ACTION_TYPES.CREATE_ENTITY,
        targetEntityType: "dossier",
        condition: "no_active_dossier",
        contextSignals: ["case", "matter", "dossier", "file", "work", "represent", "mandate", "engagement"],
        urgency: 0.65,
        label: "Open a dossier for this client",
        reasonTemplate: "This client has no active dossier.",
      },
    ],
    criticalMissingFields: [
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "phone",
        urgency: 0.50,
        label: "Add a phone number for this client",
        reasonTemplate: "Client phone number is missing.",
      },
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "email",
        urgency: 0.40,
        label: "Add an email address for this client",
        reasonTemplate: "Client email address is missing.",
      },
    ],
    documentOpportunities: [
      {
        actionType: ACTION_TYPES.GENERATE_DOCUMENT,
        documentType: "engagement_letter",
        contextSignals: ["engagement", "agreement", "contract", "letter", "mandate", "retainer"],
        urgency: 0.55,
        label: "Generate an engagement letter",
        reasonTemplate: "An engagement letter can be generated for this client.",
      },
    ],
    noteOpportunities: [
      {
        actionType: ACTION_TYPES.ADD_NOTE,
        contextSignals: ["note", "update", "contact", "spoke", "called", "informed", "discussed"],
        urgency: 0.30,
        label: "Add a note about this client",
        reasonTemplate: "A note can be recorded for this client interaction.",
      },
    ],
  },

  lawsuit: {
    expectedRelations: [
      {
        actionType: ACTION_TYPES.CREATE_ENTITY,
        targetEntityType: "session",
        condition: "no_upcoming_hearing",
        contextSignals: ["hearing", "court date", "session", "next date", "schedule", "appear"],
        urgency: 0.80,
        label: "Schedule a hearing session",
        reasonTemplate: "No upcoming hearing session is scheduled for this lawsuit.",
      },
      {
        actionType: ACTION_TYPES.CREATE_ENTITY,
        targetEntityType: "task",
        condition: "no_open_tasks",
        contextSignals: ["prepare", "file", "submit", "motion", "deadline", "task", "action", "brief"],
        urgency: 0.60,
        label: "Add a task for this lawsuit",
        reasonTemplate: "This lawsuit has no open tasks.",
      },
    ],
    criticalMissingFields: [
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "court",
        urgency: 0.60,
        label: "Specify the court for this lawsuit",
        reasonTemplate: "Court information is missing from this lawsuit.",
      },
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "next_hearing_date",
        urgency: 0.70,
        label: "Set the next hearing date",
        reasonTemplate: "No next hearing date is set for this lawsuit.",
      },
    ],
    documentOpportunities: [
      {
        actionType: ACTION_TYPES.GENERATE_DOCUMENT,
        documentType: "hearing_summary",
        contextSignals: ["summary", "hearing", "result", "outcome", "session", "minutes"],
        urgency: 0.50,
        label: "Generate a hearing summary",
        reasonTemplate: "A hearing summary can be generated for this lawsuit.",
      },
      {
        actionType: ACTION_TYPES.GENERATE_DOCUMENT,
        documentType: "pleading",
        contextSignals: ["pleading", "brief", "motion", "submission", "filing", "argue", "draft"],
        urgency: 0.60,
        label: "Draft a pleading document",
        reasonTemplate: "A pleading can be drafted for this lawsuit.",
      },
    ],
    noteOpportunities: [
      {
        actionType: ACTION_TYPES.ADD_NOTE,
        contextSignals: ["note", "update", "outcome", "result", "decision", "ruling", "judgment"],
        urgency: 0.50,
        label: "Add a case note",
        reasonTemplate: "A case note can be recorded for this lawsuit.",
      },
    ],
  },

  session: {
    expectedRelations: [],
    criticalMissingFields: [
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "location",
        urgency: 0.35,
        label: "Set the location for this session",
        reasonTemplate: "Session location is not specified.",
      },
    ],
    documentOpportunities: [
      {
        actionType: ACTION_TYPES.GENERATE_DOCUMENT,
        documentType: "session_minutes",
        contextSignals: ["minutes", "summary", "notes", "record", "outcome", "after"],
        urgency: 0.50,
        label: "Generate session minutes",
        reasonTemplate: "Session minutes can be generated for this session.",
      },
    ],
    noteOpportunities: [],
  },

  task: {
    expectedRelations: [],
    criticalMissingFields: [
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "due_date",
        urgency: 0.50,
        label: "Set a due date for this task",
        reasonTemplate: "This task has no due date set.",
      },
    ],
    documentOpportunities: [],
    noteOpportunities: [],
  },

  financial_entry: {
    expectedRelations: [],
    criticalMissingFields: [
      {
        actionType: ACTION_TYPES.ENRICH_FIELD,
        field: "invoice_date",
        urgency: 0.50,
        label: "Set an invoice date",
        reasonTemplate: "Invoice date is missing from this financial entry.",
      },
    ],
    documentOpportunities: [
      {
        actionType: ACTION_TYPES.GENERATE_DOCUMENT,
        documentType: "invoice",
        contextSignals: ["invoice", "bill", "payment", "receipt", "charge", "fee"],
        urgency: 0.60,
        label: "Generate an invoice",
        reasonTemplate: "An invoice can be generated for this financial entry.",
      },
    ],
    noteOpportunities: [],
  },
};

// Scoring weights for L3 arbitration
const SCORING_WEIGHTS = Object.freeze({
  confidence: 0.45,
  urgency: 0.35,
  actionTypeRank: 0.20,
});

// Action type priority ranks (1.0 = highest priority)
const ACTION_TYPE_RANKS = Object.freeze({
  [ACTION_TYPES.CREATE_ENTITY]: 1.0,
  [ACTION_TYPES.GENERATE_DOCUMENT]: 0.8,
  [ACTION_TYPES.ADD_NOTE]: 0.7,
  [ACTION_TYPES.ENRICH_FIELD]: 0.5,
});

// Anti-spam guard configuration
const SPAM_GUARDS = Object.freeze({
  minTurnCount: 2,
  maxSuggestionsPerTurn: 2,
  sessionDedupWindowMs: 5 * 60 * 1000,
});

module.exports = {
  ACTION_TYPES,
  ENTITY_NORMS,
  SCORING_WEIGHTS,
  ACTION_TYPE_RANKS,
  SPAM_GUARDS,
};
