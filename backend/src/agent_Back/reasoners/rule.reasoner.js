"use strict";

const BaseReasoner = require("./base.reasoner");
const { generateChatResponse } = require("../llm.client");

class RuleReasoner extends BaseReasoner {
  constructor() {
    super("rule");
  }

  async chat({ message }) {
    const timestamp = this._now();
    const llmResponse = await generateChatResponse(message);

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

    return {
      type: "explanation",
      entityId,
      entityType,
      summary: `State overview for ${entityType} ${entityId}.`,
      details: [
        `Status: ${status}.`,
        `Owner: ${owner}.`,
        `Last updated: ${lastUpdated}.`,
        `Request recorded for audit: ${message}`,
      ],
      timestamp,
      confidence: 1,
      sources: this._buildSources(entityId, context),
      status: "draft",
      source: "rule-based",
      requires_validation: true,
    };
  }

  /**
   * Build explanation from enriched context (fetched local data)
   * @private
   */
  _buildEnrichedExplanation(message, context, timestamp) {
    const details = [];
    const sources = [];
    let entityId = "unknown";
    let entityType = "entity";
    let summary = "";

    // Handle dossier-based explanations
    if (context.dossierData) {
      const d = context.dossierData;
      entityId = d.reference || String(d.id);
      entityType = "dossier";
      summary = `Status overview for dossier ${d.reference || d.id}: "${d.title}"`;

      details.push(`Status: ${d.status || "unknown"}`);
      details.push(`Phase: ${d.phase || "not specified"}`);
      details.push(`Priority: ${d.priority || "medium"}`);
      details.push(`Assigned to: ${d.assigned_lawyer || "unassigned"}`);

      if (d.next_deadline) {
        details.push(`Next deadline: ${d.next_deadline}`);
      }
      if (d.client_name) {
        details.push(`Client: ${d.client_name}`);
      }
      if (d.adversary_party) {
        details.push(`Adversary: ${d.adversary_party}`);
      }
      if (d.court_reference) {
        details.push(`Court reference: ${d.court_reference}`);
      }
      if (d.updated_at) {
        details.push(`Last updated: ${d.updated_at}`);
      }

      sources.push({
        sourceType: "database",
        reference: `dossier:${d.id}`,
        note: "Fetched from local dossiers table",
      });
    }

    // Handle client-based explanations
    if (context.clientData && !context.dossierData) {
      const c = context.clientData;
      entityId = String(c.id);
      entityType = "client";
      summary = `Client profile: ${c.name}`;

      details.push(`Name: ${c.name}`);
      details.push(`Status: ${c.status || "active"}`);
      if (c.email) details.push(`Email: ${c.email}`);
      if (c.phone) details.push(`Phone: ${c.phone}`);
      if (c.company) details.push(`Company: ${c.company}`);
      if (c.profession) details.push(`Profession: ${c.profession}`);

      sources.push({
        sourceType: "database",
        reference: `client:${c.id}`,
        note: "Fetched from local clients table",
      });
    }

    // Add overdue tasks information if available
    if (context.overdueTasks && context.overdueTasks.length > 0) {
      details.push("");
      details.push(`⚠ Overdue tasks: ${context.overdueTasks.length}`);
      context.overdueTasks.slice(0, 5).forEach((task) => {
        details.push(
          `  - ${task.title} (${task.priority}, ${Math.round(task.days_overdue)} days overdue)`,
        );
      });
      if (context.overdueTasks.length > 5) {
        details.push(`  ... and ${context.overdueTasks.length - 5} more`);
      }
      if (context.overdueAnalysis) {
        const analysis = context.overdueAnalysis;
        if (analysis.averageDaysOverdue) {
          details.push(
            `  Average days overdue: ${analysis.averageDaysOverdue}`,
          );
        }
      }

      sources.push({
        sourceType: "analysis",
        reference: "overdue_task_detection",
        note: "Computed from tasks with past due dates",
      });
    }

    // Add regular tasks summary if available
    if (context.tasks && context.tasks.length > 0 && !context.overdueTasks) {
      details.push("");
      details.push(`Tasks: ${context.tasks.length} total`);
      const byStatus = {};
      context.tasks.forEach((t) => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      });
      Object.entries(byStatus).forEach(([status, count]) => {
        details.push(`  - ${status}: ${count}`);
      });
    }

    // Add dossiers list if available (for client context)
    if (context.dossiers && context.dossiers.length > 0) {
      details.push("");
      details.push(`Associated dossiers: ${context.dossiers.length}`);
      context.dossiers.slice(0, 5).forEach((d) => {
        details.push(`  - ${d.reference}: ${d.title} (${d.status})`);
      });
      if (context.dossiers.length > 5) {
        details.push(`  ... and ${context.dossiers.length - 5} more`);
      }
    }

    // Handle resolution failures (entity not found)
    if (context._dataResolution && context._dataResolution.failed > 0) {
      details.push("");
      details.push("Note: Some requested data could not be found:");
      context._dataResolution.failedDetails.forEach((failure) => {
        details.push(`  - ${failure.message}`);
      });
    }

    // Fallback if no data was found
    if (details.length === 0) {
      summary = "No data found for the requested query";
      details.push(
        "The requested information could not be located in the system.",
      );
      details.push("Please verify the entity name or reference and try again.");

      // Add a default source for the fallback case
      if (sources.length === 0) {
        sources.push({
          sourceType: "system",
          reference: "data-lookup",
          note: "Attempted data retrieval returned no results",
        });
      }
    }

    return {
      type: "explanation",
      entityId,
      entityType,
      summary: summary || `Information for ${entityType} ${entityId}`,
      details,
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

    return {
      type: "explanation",
      entityId: sessionId,
      entityType: "session",
      summary: `Session ${sessionId} summary for ${audience}.`,
      details: detailLines,
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

  async draft({ context = {}, draftType = "generic" }) {
    if (draftType === "invitation") {
      return this._draftInvitation(context);
    }
    if (draftType === "client_email") {
      return this._draftClientEmail(context);
    }
    throw this._error(`Unsupported draft type: ${draftType}`, 400);
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
      recommendations: [
        "Assign accountable owner for each risk and capture acceptance or mitigation.",
        "Schedule follow-up review to confirm mitigations are applied.",
      ],
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

  _draftInvitation(context) {
    const eventName = this._requireString(context.eventName, "eventName");
    const eventDate = this._requireString(context.eventDate, "eventDate");
    const location = this._requireString(context.location, "location");
    const recipientName = this._requireString(
      context.recipientName,
      "recipientName",
    );
    const senderName = this._requireString(context.senderName, "senderName");
    const audience = this._stringOrDefault(context.audience, "client");
    const timestamp = this._now();

    const subject = `Invitation: ${eventName}`;
    const body = [
      `Dear ${recipientName},`,
      "",
      `You are invited to ${eventName} on ${eventDate} at ${location}.`,
      `Purpose: ${this._stringOrDefault(context.purpose, "Review current matter status and next decisions.")}`,
      `Requested preparation: ${this._stringOrDefault(
        context.preparation,
        "Review relevant documents and confirm availability.",
      )}`,
      "",
      "Please confirm attendance and advise of any constraints.",
      "",
      `Regards,`,
      senderName,
    ].join("\n");

    return {
      type: "draft",
      draftType: "invitation",
      subject,
      body,
      audience,
      tone: "formal",
      sensitivity: "medium",
      placeholders: [
        "{{recipient_name}}",
        "{{event_datetime}}",
        "{{location}}",
        "{{response_deadline}}",
      ],
      assumptions: this._collectAssumptions(context),
      contextReferences: this._collectContextReferences(context),
      timestamp,
      source: "rule-based",
      status: "draft",
      requires_validation: true,
    };
  }

  _draftClientEmail(context) {
    const lawsuitId = this._requireString(context.lawsuitId, "lawsuitId");
    const updateSummary = this._requireString(
      context.updateSummary,
      "updateSummary",
    );
    const recipientName = this._requireString(
      context.recipientName,
      "recipientName",
    );
    const senderName = this._requireString(context.senderName, "senderName");
    const audience = this._stringOrDefault(context.audience, "client");
    const timestamp = this._now();

    const subject = `Lawsuit ${lawsuitId} - Client Update`;
    const body = [
      `Dear ${recipientName},`,
      "",
      `We are providing an update on lawsuit ${lawsuitId}.`,
      `Summary: ${updateSummary}`,
      `Open items: ${this._stringOrDefault(
        context.openItems,
        "Please confirm if any additional documents or clarifications are needed.",
      )}`,
      "",
      "No commitments or filings have been executed with this communication.",
      "",
      `Regards,`,
      senderName,
    ].join("\n");

    return {
      type: "draft",
      draftType: "client_email",
      subject,
      body,
      audience,
      tone: "formal",
      sensitivity: "medium",
      placeholders: [
        "{{recipient_name}}",
        "{{lawsuit_reference}}",
        "{{meeting_time}}",
      ],
      assumptions: this._collectAssumptions(context),
      contextReferences: this._collectContextReferences({
        ...context,
        lawsuitId,
      }),
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
