'use strict';

const BaseReasoner = require('./base.reasoner');
const RuleReasoner = require('./rule.reasoner');

class ApiLLMReasoner extends BaseReasoner {
  constructor() {
    super('apiLLM');
    this.fallback = new RuleReasoner();
  }

  async explain(params) {
    const base = await this.fallback.explain(params);
    return {
      ...base,
      summary: `${base.summary} (API LLM stub - no external call)`,
    };
  }

  async summarize(params) {
    const base = await this.fallback.summarize(params);
    return {
      ...base,
      summary: `${base.summary} (API LLM stub - no external call)`,
    };
  }

  async draft(params) {
    const base = await this.fallback.draft(params);
    return {
      ...base,
      body: `${base.body}\n\n[API LLM stub - output synthesized without external request]`,
    };
  }

  async analyzeRisks(params) {
    const base = await this.fallback.analyzeRisks(params);
    return {
      ...base,
      overallAssessment: `${base.overallAssessment} External API integrations are disabled.`,
    };
  }
}

module.exports = ApiLLMReasoner;
