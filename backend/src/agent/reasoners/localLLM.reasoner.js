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

  async draft(params) {
    const base = await this.fallback.draft(params);
    return {
      ...base,
      body: `${base.body}\n\n[Simulated locally with deterministic template]`,
    };
  }

  async analyzeRisks(params) {
    const base = await this.fallback.analyzeRisks(params);
    return {
      ...base,
      overallAssessment: `${base.overallAssessment} Local LLM is stubbed; no model calls were made.`,
    };
  }
}

module.exports = LocalLLMReasoner;
