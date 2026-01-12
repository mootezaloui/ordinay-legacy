'use strict';

const INTENTS = {
  EXPLAIN_ENTITY_STATE: 'EXPLAIN_ENTITY_STATE',
  SUMMARIZE_SESSION: 'SUMMARIZE_SESSION',
  ANALYZE_OPERATIONAL_RISKS: 'ANALYZE_OPERATIONAL_RISKS',
  DRAFT_INVITATION: 'DRAFT_INVITATION',
  DRAFT_CLIENT_EMAIL: 'DRAFT_CLIENT_EMAIL',
};

function classifyIntent(message, context = {}) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('Message is required for intent classification.');
  }

  if (context.intent && Object.values(INTENTS).includes(context.intent)) {
    return context.intent;
  }

  const normalized = message.toLowerCase();

  if (normalized.includes('risk') || normalized.includes('mitigation')) {
    return INTENTS.ANALYZE_OPERATIONAL_RISKS;
  }

  if (normalized.includes('invite') || normalized.includes('invitation') || normalized.includes('rsvp')) {
    return INTENTS.DRAFT_INVITATION;
  }

  if (normalized.includes('email') && normalized.includes('client')) {
    return INTENTS.DRAFT_CLIENT_EMAIL;
  }

  if (normalized.includes('summary') || normalized.includes('summarize') || normalized.includes('recap')) {
    return INTENTS.SUMMARIZE_SESSION;
  }

  if (context && (context.operation === 'explain' || context.entityId)) {
    return INTENTS.EXPLAIN_ENTITY_STATE;
  }

  return INTENTS.EXPLAIN_ENTITY_STATE;
}

module.exports = classifyIntent;
module.exports.INTENTS = INTENTS;
