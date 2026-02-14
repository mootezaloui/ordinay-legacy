"use strict";

const BaseReasoner = require("./base.reasoner");
const { generateChatResponse } = require("../llm.client");
const {
  interpret: postReadInterpret,
} = require("../interpreters/post-read.interpreter");

class RuleReasoner extends BaseReasoner {
  constructor() {
    super("rule");
  }

  async chat({ message, context = {} }) {
    const timestamp = this._now();
    const llmResponse = await generateChatResponse(
      message,
      context.llmContext || null,
    );

    return {
      type: "chat",
      message:
        llmResponse ||
        "I apologize, but I am unable to respond right now. Please try again.",
      timestamp,
      source: llmResponse ? "llm" : "fallback",
    };
  }

  async explain({ message, context = {} }) {
    const timestamp = this._now();

    // If context was enriched with fetched data, build explanation from it
    if (context._dataEnriched) {
      return this._buildEnrichedExplanation(message, context, timestamp);
    }

    // Original behavior: require explicit context fields
    const entityId = this._requireString(context.entityId, "entityId");
    const entityType = this._requireString(context.entityType, "entityType");
    const status = this._requireString(context.status, "status");
    const owner = this._stringOrDefault(context.owner, "unassigned");
    const lastUpdated = this._stringOrDefault(
      context.lastUpdated,
      "unspecified",
    );

    const factsSummary = `State overview for ${entityType} ${entityId}.`;
    const factsDetails = [
      `Status: ${status}.`,
      ...(String(entityType || "").toLowerCase() === "dossier"
        ? []
        : [`Owner: ${owner}.`]),
      `Last updated: ${lastUpdated}.`,
      `Request recorded for audit: ${message}`,
    ];

    const scopeKeyMap = {
      client: "clientId",
      dossier: "dossierId",
      lawsuit: "lawsuitId",
      session: "sessionId",
      task: "taskId",
      mission: "missionId",
      personal_task: "personalTaskId",
      financial_entry: "financialEntryId",
    };

    const normalizedType = String(entityType || "").toLowerCase();
    const numericId =
      typeof entityId === "number"
        ? entityId
        : typeof entityId === "string" && /^\d+$/.test(entityId)
          ? parseInt(entityId, 10)
          : null;

    const interpretationContext = {
      ...context,
      scope: normalizedType || context.scope,
      ...(scopeKeyMap[normalizedType] && numericId
        ? { [scopeKeyMap[normalizedType]]: numericId }
        : {}),
      _readOutcome: "success",
    };

    const interpretationResult = postReadInterpret(
      normalizedType || "entity",
      { id: numericId || entityId },
      interpretationContext,
    );

    return {
      type: "explanation",
      entityId,
      entityType,

      facts: {
        summary: factsSummary,
        details: factsDetails,
      },
      interpretation: interpretationResult.interpretation,
      navigation: interpretationResult.navigation,
      followUps: interpretationResult.followUps,

      timestamp,
      confidence: 1,
      sources: this._buildSources(entityId, context),
      status: "draft",
      source: "rule-based",
      requires_validation: true,
    };
  }

  /**
   * Build explanation from enriched context (fetched local data).
   *
   * This method implements the MANDATORY post-read interpretation layer.
   * Every entity read produces:
   *   1. Facts — what was read
   *   2. Interpretation — why it matters now (MANDATORY)
   *   3. Navigation — entity role context (MANDATORY)
   *   4. Follow-ups — guided next steps (MANDATORY, min 2)
   *
   * @private
   */
  _buildEnrichedExplanation(message, context, timestamp) {
    const sources = [];

    // ─── Step 1: Extract entity identity and build facts ───

    let entityId = "unknown";
    let entityType = "entity";
    let entityData = null;
    let factsSummary = "";
    const factsDetails = [];

    // Dossier entity
    if (context.dossierData) {
      const d = context.dossierData;
      entityId = d.reference || String(d.id);
      entityType = "dossier";
      entityData = d;
      factsSummary = `Dossier ${d.reference || d.id}: "${d.title}"`;

      factsDetails.push(`Status: ${d.status || "unknown"}`);
      factsDetails.push(`Phase: ${d.phase || "not specified"}`);
      factsDetails.push(`Priority: ${d.priority || "medium"}`);
      if (d.next_deadline)
        factsDetails.push(`Next deadline: ${d.next_deadline}`);
      if (d.client_name) factsDetails.push(`Client: ${d.client_name}`);
      if (d.adversary_party)
        factsDetails.push(`Adversary: ${d.adversary_party}`);
      if (d.court_reference)
        factsDetails.push(`Court reference: ${d.court_reference}`);

      sources.push({
        sourceType: "database",
        reference: `dossier:${d.id}`,
        note: "Fetched from local dossiers table",
      });
    }

    // Client entity (only if no dossier — dossier takes precedence)
    if (context.clientData && !context.dossierData) {
      const c = context.clientData;
      entityId = String(c.id);
      entityType = "client";
      entityData = c;
      factsSummary = `Client: ${c.name}`;

      factsDetails.push(`Name: ${c.name}`);
      factsDetails.push(`Status: ${c.status || "active"}`);
      if (c.email) factsDetails.push(`Email: ${c.email}`);
      if (c.phone) factsDetails.push(`Phone: ${c.phone}`);
      if (c.company) factsDetails.push(`Company: ${c.company}`);
      if (c.profession) factsDetails.push(`Profession: ${c.profession}`);

      sources.push({
        sourceType: "database",
        reference: `client:${c.id}`,
        note: "Fetched from local clients table",
      });
    }

    // Task entity
    if (context.taskData) {
      const t = context.taskData;
      entityId = String(t.id);
      entityType = "task";
      entityData = t;
      factsSummary = `Task: ${t.title}`;

      factsDetails.push(`Title: ${t.title}`);
      factsDetails.push(`Status: ${t.status || "pending"}`);
      factsDetails.push(`Priority: ${t.priority || "medium"}`);
      if (t.due_date) factsDetails.push(`Due date: ${t.due_date}`);
      if (t.assigned_to) factsDetails.push(`Assigned to: ${t.assigned_to}`);

      sources.push({
        sourceType: "database",
        reference: `task:${t.id}`,
        note: "Fetched from local tasks table",
      });
    }

    // Add contextual data to facts
    if (context.overdueTasks && context.overdueTasks.length > 0) {
      factsDetails.push(`Overdue tasks: ${context.overdueTasks.length}`);
      sources.push({
        sourceType: "analysis",
        reference: "overdue_task_detection",
        note: "Computed from tasks with past due dates",
      });
    }

    if (context.tasks && context.tasks.length > 0) {
      factsDetails.push(`Total tasks: ${context.tasks.length}`);
    }

    if (context.dossiers && context.dossiers.length > 0) {
      factsDetails.push(`Associated dossiers: ${context.dossiers.length}`);
    }

    // Handle not-found case
    if (factsDetails.length === 0) {
      factsSummary = "No data found for the requested query";
      factsDetails.push("The requested information could not be located.");
      factsDetails.push("Verify the entity name or reference and try again.");

      if (sources.length === 0) {
        sources.push({
          sourceType: "system",
          reference: "data-lookup",
          note: "Attempted data retrieval returned no results",
        });
      }
    }

    // ─── Step 2: MANDATORY Post-Read Interpretation ───

    // This is NOT optional. The interpreter MUST run.
    const interpretationResult = postReadInterpret(
      entityType,
      entityData || {},
      context,
    );

    // ─── Step 3: Assemble final response with mandatory structure ───

    return {
      type: "explanation",
      entityId,
      entityType,

      // Section 1: FACTS — what was read
      facts: {
        summary: factsSummary,
        details: factsDetails,
      },

      // Section 2: INTERPRETATION — why it matters now (MANDATORY)
      interpretation: interpretationResult.interpretation,

      // Section 3: NAVIGATION — entity role context (MANDATORY)
      navigation: interpretationResult.navigation,

      // Section 4: FOLLOW-UPS — guided next steps (MANDATORY, min 2)
      followUps: interpretationResult.followUps,

      // Metadata
      timestamp,
      confidence: context._dataResolution?.failed === 0 ? 1 : 0.8,
      sources,
      status: "draft",
      source: "rule-based",
      requires_validation: true,
    };
  }

  async summarize({ message, context = {} }) {
    const sessionId = this._requireString(context.sessionId, "sessionId");
    const audience = this._stringOrDefault(context.audience, "internal");
    const agenda = this._requireNonEmptyArray(context.agenda, "agenda");
    const timestamp = this._now();

    const detailLines = agenda.map(
      (item, index) => `Agenda item ${index + 1}: ${item}`,
    );

    const numericId =
      typeof sessionId === "number"
        ? sessionId
        : typeof sessionId === "string" && /^\d+$/.test(sessionId)
          ? parseInt(sessionId, 10)
          : null;

    const interpretationContext = {
      ...context,
      scope: "session",
      ...(numericId ? { sessionId: numericId } : {}),
      _readOutcome: "success",
    };

    const interpretationResult = postReadInterpret(
      "session",
      { id: numericId || sessionId },
      interpretationContext,
    );

    return {
      type: "explanation",
      entityId: sessionId,
      entityType: "session",

      facts: {
        summary: `Session ${sessionId} summary for ${audience}.`,
        details: detailLines.length > 0 ? detailLines : ["No agenda provided."],
      },
      interpretation: interpretationResult.interpretation,
      navigation: interpretationResult.navigation,
      followUps: interpretationResult.followUps,

      timestamp,
      confidence: 1,
      sources: this._buildSources(sessionId, {
        ...context,
        origin: context.origin || "session_summary",
      }),
      status: "draft",
      source: "rule-based",
      requires_validation: true,
    };
  }

  async analyzeRisks({ context = {} }) {
    const scope = this._requireString(context.scope, "scope");
    const concerns = this._requireNonEmptyArray(context.concerns, "concerns");
    const timestamp = this._now();

    const risks = concerns.map((concern, index) => ({
      id: `OP-${index + 1}`,
      title: concern,
      category: this._mapConcernToCategory(concern),
      severity: "medium",
      likelihood: "possible",
      impact: "Operational disruption if unaddressed.",
      mitigation: "Document clear owner, timeframe, and verification steps.",
      owner: this._stringOrDefault(context.owner, "operations_control"),
      status: "open",
      residualRisk: "Pending review",
      notes: ["Rule-based operational risk analysis only."],
    }));

    return {
      type: "risk_analysis",
      scope,
      overallAssessment:
        "Operational risks identified; requires manual validation.",
      risks,
      timestamp,
      source: "rule-based",
      status: "draft",
      requires_validation: true,
    };
  }

  async proposeActions({ context = {} }) {
    const scope = this._requireString(context.scope, "scope");
    const objective = this._requireString(context.objective, "objective");
    const observations = this._requireNonEmptyArray(
      context.observations,
      "observations",
    );
    const timestamp = this._now();

    const actions = observations.map((observation, index) => ({
      id: `ACT-${index + 1}`,
      title: `Action for: ${observation}`,
      description: `Address observation: ${observation} with a documented next step.`,
      rationale: `Observation ${observation} impacts objective: ${objective}.`,
      priority: "medium",
      status: "proposed",
      requires_review: true,
      risksAddressed: [observation],
      dependencies: [],
      owner: this._stringOrDefault(context.owner, "operations_owner"),
    }));

    return {
      type: "action_plan",
      scope,
      objective,
      constraints: Array.isArray(context.constraints)
        ? context.constraints
        : [],
      contextReferences: this._collectContextReferences(context),
      actions,
      timestamp,
      source: "rule-based",
      status: "draft",
      requires_validation: true,
    };
  }

  _buildSources(entityId, context) {
    const sources = [
      {
        sourceType: "context",
        reference: entityId,
        note: "Derived from provided context fields.",
      },
    ];

    if (context && context.origin) {
      sources.push({
        sourceType: "user",
        reference: this._stringOrDefault(context.origin, "request"),
        note: "User supplied request origin.",
      });
    }

    return sources;
  }

  _mapConcernToCategory(concern) {
    const text = (concern || "").toLowerCase();
    if (text.includes("data") || text.includes("record")) {
      return "data_handling";
    }
    if (text.includes("access") || text.includes("permission")) {
      return "access_control";
    }
    if (text.includes("downtime") || text.includes("availability")) {
      return "continuity";
    }
    if (text.includes("communication") || text.includes("handoff")) {
      return "communication";
    }
    return "process_integrity";
  }

  _collectAssumptions(context) {
    if (Array.isArray(context.assumptions) && context.assumptions.length) {
      return context.assumptions;
    }
    return ["Content is a draft and requires legal review before sharing."];
  }

  _collectContextReferences(context) {
    if (Array.isArray(context.contextReferences)) {
      return context.contextReferences;
    }
    const refs = [];
    if (context.lawsuitId) {
      refs.push(`lawsuit:${context.lawsuitId}`);
    }
    if (context.sessionId) {
      refs.push(`session:${context.sessionId}`);
    }
    if (context.eventName) {
      refs.push(`event:${context.eventName}`);
    }
    return refs;
  }

  _requireString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
      throw this._error(`Missing required context: ${fieldName}`, 400);
    }
    return value.trim();
  }

  _requireNonEmptyArray(value, fieldName) {
    if (!Array.isArray(value) || value.length === 0) {
      throw this._error(`Missing required list: ${fieldName}`, 400);
    }
    return value;
  }

  _stringOrDefault(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  _now() {
    return new Date().toISOString();
  }

  _error(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
  }
}

module.exports = RuleReasoner;
