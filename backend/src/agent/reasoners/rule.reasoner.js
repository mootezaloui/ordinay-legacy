'use strict';

const BaseReasoner = require('./base.reasoner');

class RuleReasoner extends BaseReasoner {
  constructor() {
    super('rule');
  }

  async explain({ message, context = {} }) {
    const timestamp = new Date().toISOString();
    const entityId = this._stringOrDefault(context.entityId, 'unknown');
    const entityType = this._stringOrDefault(context.entityType, 'general');
    const summary = `Explanation of ${entityType} ${entityId} based on provided context.`;

    const details = this._buildDetailLines(message, context);
    const sources = this._buildSources(entityId, context);

    return {
      type: 'explanation',
      entityId,
      entityType,
      summary,
      details,
      timestamp,
      confidence: 1,
      sources,
      status: 'draft',
    };
  }

  async summarize({ message, context = {} }) {
    const timestamp = new Date().toISOString();
    const sessionId = this._stringOrDefault(context.sessionId, 'unspecified-session');
    const audience = this._stringOrDefault(context.audience, 'internal');
    const agenda = Array.isArray(context.agenda) ? context.agenda : [];

    const summary = `Session ${sessionId} summary for ${audience} consumption.`;
    const detailLines = agenda.length
      ? agenda.map((item, index) => `Agenda item ${index + 1}: ${item}`)
      : [
          'No agenda items supplied; using request message for context anchoring.',
          `Request message: ${message}`,
        ];

    const sources = this._buildSources(sessionId, context);

    return {
      type: 'explanation',
      entityId: sessionId,
      entityType: 'session',
      summary,
      details: detailLines,
      timestamp,
      confidence: 1,
      sources,
      status: 'draft',
    };
  }

  async draft({ message, context = {}, draftType = 'generic' }) {
    const timestamp = new Date().toISOString();
    const audience = this._stringOrDefault(context.audience, 'client');
    const subject = this._deriveSubject(draftType, context);
    const tone = this._stringOrDefault(context.tone, 'formal');
    const sensitivity = this._stringOrDefault(context.sensitivity, 'medium');

    const bodyParts = [
      `Dear ${this._stringOrDefault(context.recipientName, 'recipient')},`,
      '',
      this._bodyLead(draftType, context, message),
      '',
      'Please confirm the details above or provide corrections in writing.',
      '',
      'Kind regards,',
      this._stringOrDefault(context.senderName, 'Organia Team'),
    ];

    const placeholders = this._collectPlaceholders(context, draftType);
    const assumptions = this._collectAssumptions(context);
    const contextReferences = this._collectContextReferences(context);

    return {
      type: 'draft',
      draftType,
      subject,
      body: bodyParts.join('\n'),
      audience,
      tone,
      sensitivity,
      placeholders,
      assumptions,
      contextReferences,
      timestamp,
    };
  }

  async analyzeRisks({ context = {}, message }) {
    const timestamp = new Date().toISOString();
    const scope = this._stringOrDefault(context.scope, 'agent_operation');
    const owner = this._stringOrDefault(context.owner, 'agent_guardrail');
    const baselineNote = 'Deterministic rule-based analysis; execution paths are disabled.';

    const risks = [
      {
        id: 'risk-1',
        title: 'Context insufficiency',
        category: 'operational',
        severity: 'medium',
        likelihood: 'possible',
        impact: 'Outputs may omit critical case details when context is sparse.',
        mitigation: 'Require structured context fields before producing actionable guidance.',
        owner,
        status: 'open',
        residualRisk: 'Low after manual review by operator.',
        notes: [baselineNote],
      },
      {
        id: 'risk-2',
        title: 'Execution guardrails',
        category: 'compliance',
        severity: 'low',
        likelihood: 'unlikely',
        impact: 'Unapproved actions could be inferred as supported.',
        mitigation: 'Keep execution flags disabled and surface policy stance in responses.',
        owner,
        status: 'monitor',
        residualRisk: 'Minimal while execution remains off.',
        notes: [`Request message anchored: ${message}`],
      },
    ];

    return {
      type: 'risk_analysis',
      scope,
      overallAssessment: 'Controlled: deterministic reasoning with strict policy enforcement.',
      risks,
      recommendations: [
        'Maintain manual oversight for any downstream actions.',
        'Verify context completeness before acting on outputs.',
      ],
      timestamp,
    };
  }

  _stringOrDefault(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  _buildDetailLines(message, context) {
    const details = [];
    if (context.status) {
      details.push(`Status: ${context.status}.`);
    }
    if (context.owner) {
      details.push(`Owner: ${context.owner}.`);
    }
    if (context.lastUpdated) {
      details.push(`Last updated: ${context.lastUpdated}.`);
    }
    if (!details.length) {
      details.push('No explicit state fields provided; defaulting to request-driven summary.');
    }
    details.push(`Request message: ${message}`);
    return details;
  }

  _buildSources(entityId, context) {
    const sources = [
      {
        sourceType: 'context',
        reference: entityId,
        note: 'Derived from provided context fields.',
      },
    ];

    if (context && context.origin) {
      sources.push({
        sourceType: 'user',
        reference: this._stringOrDefault(context.origin, 'request'),
        note: 'User supplied request origin.',
      });
    }

    return sources;
  }

  _deriveSubject(draftType, context) {
    if (draftType === 'invitation') {
      const event = this._stringOrDefault(context.eventName, 'Meeting');
      return `${event} invitation`;
    }
    if (draftType === 'client_email') {
      const caseId = this._stringOrDefault(context.caseId, 'your matter');
      return `Update regarding ${caseId}`;
    }
    return this._stringOrDefault(context.subject, 'Draft communication');
  }

  _bodyLead(draftType, context, message) {
    if (draftType === 'invitation') {
      const eventDate = this._stringOrDefault(context.eventDate, 'a scheduled meeting');
      const location = this._stringOrDefault(context.location, 'to be confirmed');
      return `You are invited to ${eventDate} at ${location}. Agenda: ${this._stringOrDefault(
        context.agendaOverview,
        'review current matters'
      )}.`;
    }
    if (draftType === 'client_email') {
      const caseId = this._stringOrDefault(context.caseId, 'your matter');
      const update = this._stringOrDefault(
        context.update,
        'We prepared a brief status update based on recent activity.'
      );
      return `Regarding ${caseId}: ${update}`;
    }
    return this._stringOrDefault(
      context.bodyLead,
      `Draft generated from request: ${message}`
    );
  }

  _collectPlaceholders(context, draftType) {
    const basePlaceholders = Array.isArray(context.placeholders) ? context.placeholders : [];
    const ensured = [...basePlaceholders];

    if (draftType === 'invitation' && !ensured.includes('{{event_datetime}}')) {
      ensured.push('{{event_datetime}}');
    }
    if (draftType === 'client_email' && !ensured.includes('{{case_reference}}')) {
      ensured.push('{{case_reference}}');
    }
    if (!ensured.includes('{{recipient_name}}')) {
      ensured.push('{{recipient_name}}');
    }

    return ensured;
  }

  _collectAssumptions(context) {
    if (Array.isArray(context.assumptions)) {
      return context.assumptions;
    }
    return ['All data provided is pre-vetted and non-confidential.'];
  }

  _collectContextReferences(context) {
    if (Array.isArray(context.contextReferences)) {
      return context.contextReferences;
    }
    const refs = [];
    if (context.caseId) {
      refs.push(`case:${context.caseId}`);
    }
    if (context.sessionId) {
      refs.push(`session:${context.sessionId}`);
    }
    return refs;
  }
}

module.exports = RuleReasoner;
