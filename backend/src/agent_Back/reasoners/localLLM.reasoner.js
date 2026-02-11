'use strict';

const BaseReasoner = require('./base.reasoner');
const RuleReasoner = require('./rule.reasoner');

class LocalLLMReasoner extends BaseReasoner {
  constructor() {
    super('localLLM');
    this.fallback = new RuleReasoner();
  }

  async explain(params) {
    const base = await this.fallback.explain(params);
    return {
      ...base,
      summary: `${base.summary} (simulated local LLM reasoning)`,
    };
  }

  async summarize(params) {
    const base = await this.fallback.summarize(params);
    return {
      ...base,
      summary: `${base.summary} (simulated local LLM reasoning)`,
    };
  }

  async analyzeRisks(params) {
    const base = await this.fallback.analyzeRisks(params);
    return {
      ...base,
      overallAssessment: `${base.overallAssessment} Local LLM is stubbed; no model calls were made.`,
    };
  }

  async proposeActions(params) {
    const base = await this.fallback.proposeActions(params);
    return {
      ...base,
      objective: `${base.objective} (simulated local LLM reasoning)`,
    };
  }
}

module.exports = LocalLLMReasoner;
