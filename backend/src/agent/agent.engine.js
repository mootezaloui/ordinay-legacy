'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const classifyIntent = require('./intent.classifier');
const { INTENTS } = classifyIntent;

const agentV1Policy = require('./policies/agent.v1.policy');
const agentV2Policy = require('./policies/agent.v2.policy');
const agentV3Policy = require('./policies/agent.v3.policy');

const RuleReasoner = require('./reasoners/rule.reasoner');
const LocalLLMReasoner = require('./reasoners/localLLM.reasoner');
const ApiLLMReasoner = require('./reasoners/apiLLM.reasoner');

const AgentLedgerService = require('./ledger/agent.ledger.service');

const explanationSchema = require('./schemas/explanation.schema.json');
const draftSchema = require('./schemas/draft.schema.json');
const riskSchema = require('./schemas/risk.schema.json');

class AgentEngine {
  constructor(options = {}) {
    this.policies = {
      v1: agentV1Policy,
      v2: agentV2Policy,
      v3: agentV3Policy,
    };

    this.reasoners = {
      rule: new RuleReasoner(),
      localLLM: new LocalLLMReasoner(),
      apiLLM: new ApiLLMReasoner(),
    };

    this.ledger = options.ledgerService || new AgentLedgerService();

    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: false,
      strict: true,
    });
    addFormats(this.ajv);

    this.validators = {
      explanation: this.ajv.compile(explanationSchema),
      draft: this.ajv.compile(draftSchema),
      risk_analysis: this.ajv.compile(riskSchema),
    };
  }

  async run({ message, context = {}, agentVersion = 'v1', reasoner: preferredReasoner } = {}) {
    if (typeof message !== 'string' || !message.trim()) {
      const error = new Error('message is required');
      error.status = 400;
      throw error;
    }

    const policy = this._resolvePolicy(agentVersion);
    this._assertExecutionIntent(context, policy);

    const intent = classifyIntent(message, context);
    this._ensureIntentAllowed(intent, policy);

    const reasoner = this._resolveReasoner(policy, preferredReasoner);
    const response = await this._executeIntent(intent, reasoner, { message, context });

    this._validateAgainstSchema(intent, response);

    const ledgerEntry = this.ledger.record({
      intent,
      agentVersion: policy.version,
      policySnapshot: {
        allowExecution: policy.allowExecution,
        allowExternalSearch: policy.allowExternalSearch,
        allowedIntents: policy.allowedIntents,
        allowedToolCategories: policy.allowedToolCategories,
        allowEnrichment: policy.allowEnrichment,
      },
      reasoner: reasoner.name,
      request: {
        message,
        context,
      },
      response,
      validation: {
        schema: this._schemaKeyForIntent(intent),
        valid: true,
      },
      execution: {
        permitted: policy.allowExecution,
        invoked: false,
      },
    });

    return {
      intent,
      agentVersion: policy.version,
      reasoner: reasoner.name,
      output: response,
      ledgerEntryId: ledgerEntry.id,
    };
  }

  _resolvePolicy(agentVersion) {
    const normalized = String(agentVersion || '').toLowerCase();
    const key = normalized.startsWith('v') ? normalized : `v${normalized}`;
    const policy = this.policies[key];
    if (!policy) {
      const error = new Error(`Unsupported agent version: ${agentVersion}`);
      error.status = 400;
      throw error;
    }
    return policy;
  }

  _resolveReasoner(policy, preferredReasoner) {
    const allowed = this._allowedReasonersForPolicy(policy.version);
    const preferred = typeof preferredReasoner === 'string' ? preferredReasoner : policy.defaultReasoner;
    const reasonerKey = allowed.includes(preferred) ? preferred : policy.defaultReasoner || 'rule';
    return this.reasoners[reasonerKey] || this.reasoners.rule;
  }

  _allowedReasonersForPolicy(version) {
    if (version === 'v3') {
      return ['rule', 'localLLM', 'apiLLM'];
    }
    return ['rule'];
  }

  _assertExecutionIntent(context, policy) {
    const requestedTools = (context && context.requestedTools) || [];
    const executionRequested = Boolean(context && context.execute === true);
    if (!policy.allowExecution && (executionRequested || (Array.isArray(requestedTools) && requestedTools.length))) {
      const error = new Error('Tool execution is not permitted for this agent version.');
      error.status = 400;
      throw error;
    }
  }

  _ensureIntentAllowed(intent, policy) {
    if (!policy.allowedIntents.includes(intent)) {
      const error = new Error(`Intent ${intent} is not permitted for agent version ${policy.version}.`);
      error.status = 400;
      throw error;
    }
  }

  async _executeIntent(intent, reasoner, payload) {
    const { message, context } = payload;
    switch (intent) {
      case INTENTS.EXPLAIN_ENTITY_STATE:
        return reasoner.explain({ message, context });
      case INTENTS.SUMMARIZE_SESSION:
        return reasoner.summarize({ message, context });
      case INTENTS.DRAFT_INVITATION:
        return reasoner.draft({ message, context, draftType: 'invitation' });
      case INTENTS.DRAFT_CLIENT_EMAIL:
        return reasoner.draft({ message, context, draftType: 'client_email' });
      case INTENTS.ANALYZE_OPERATIONAL_RISKS:
        return reasoner.analyzeRisks({ message, context });
      default: {
        const error = new Error(`Unsupported intent: ${intent}`);
        error.status = 400;
        throw error;
      }
    }
  }

  _validateAgainstSchema(intent, output) {
    const schemaKey = this._schemaKeyForIntent(intent);
    const validator = this.validators[schemaKey];
    if (!validator) {
      const error = new Error(`No validator configured for schema ${schemaKey}`);
      error.status = 500;
      throw error;
    }

    const valid = validator(output);
    if (!valid) {
      const error = new Error(
        `Agent output failed schema validation: ${this.ajv.errorsText(validator.errors)}`
      );
      error.status = 500;
      throw error;
    }
  }

  _schemaKeyForIntent(intent) {
    if (intent === INTENTS.EXPLAIN_ENTITY_STATE || intent === INTENTS.SUMMARIZE_SESSION) {
      return 'explanation';
    }
    if (intent === INTENTS.DRAFT_INVITATION || intent === INTENTS.DRAFT_CLIENT_EMAIL) {
      return 'draft';
    }
    if (intent === INTENTS.ANALYZE_OPERATIONAL_RISKS) {
      return 'risk_analysis';
    }
    return 'explanation';
  }
}

module.exports = AgentEngine;
