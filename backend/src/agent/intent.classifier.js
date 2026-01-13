'use strict';

const { INTENTS, INTENT_LIST } = require('./intents');

function classifyIntent(message, context = {}) {
  if (typeof message !== 'string' || !message.trim()) {
    throw classificationError('Message is required for intent classification.');
  }

  // Explicit user-provided intent takes precedence when valid.
  if (context.intent) {
    if (!INTENT_LIST.includes(context.intent)) {
      throw classificationError(`Unsupported intent provided in context: ${context.intent}`);
    }
    return context.intent;
  }

  const normalized = message.toLowerCase();
  const matches = [];

  // Rule: Operational risk requests must contain explicit risk language or operation flag.
  if (
    normalized.includes('risk') ||
    normalized.includes('mitigation') ||
    normalized.includes('control') ||
    context.operation === 'analyze_risks'
  ) {
    matches.push(INTENTS.ANALYZE_OPERATIONAL_RISKS);
  }

  // Rule: Action planning must reference proposed actions or next steps explicitly.
  if (
    normalized.includes('propose actions') ||
    normalized.includes('proposed actions') ||
    normalized.includes('action plan') ||
    normalized.includes('next steps') ||
    context.operation === 'propose_actions'
  ) {
    matches.push(INTENTS.PROPOSE_ACTIONS);
  }

  // Rule: Invitations are identified by invitation keywords or explicit draft type.
  if (
    normalized.includes('invite') ||
    normalized.includes('invitation') ||
    normalized.includes('rsvp') ||
    context.draftType === 'invitation'
  ) {
    matches.push(INTENTS.DRAFT_INVITATION);
  }

  // Rule: Client emails require both client targeting and email drafting signals.
  if (
    (normalized.includes('client') && normalized.includes('email')) ||
    (context.recipientType === 'client' && normalized.includes('email')) ||
    context.draftType === 'client_email'
  ) {
    matches.push(INTENTS.DRAFT_CLIENT_EMAIL);
  }

  // Rule: Session summaries are detected via summary language or explicit operation.
  if (
    normalized.includes('summary') ||
    normalized.includes('summarize') ||
    normalized.includes('recap') ||
    normalized.includes('minutes') ||
    context.operation === 'summarize_session'
  ) {
    matches.push(INTENTS.SUMMARIZE_SESSION);
  }

  // Rule: Entity state explanations require explicit explain/status language or context operation.
  if (
    normalized.includes('explain') ||
    normalized.includes('status') ||
    normalized.includes('state') ||
    context.operation === 'explain_state'
  ) {
    matches.push(INTENTS.EXPLAIN_ENTITY_STATE);
  }

  const uniqueMatches = [...new Set(matches)];

  if (uniqueMatches.length === 0) {
    throw classificationError('Unable to classify intent deterministically from provided input.');
  }

  if (uniqueMatches.length > 1) {
    throw classificationError(`Ambiguous intent; matched multiple intents: ${uniqueMatches.join(', ')}`);
  }

  return uniqueMatches[0];
}

function classificationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

module.exports = classifyIntent;
module.exports.INTENTS = INTENTS;
