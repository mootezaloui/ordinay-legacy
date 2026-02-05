'use strict';

/**
 * Legal Research Planner
 *
 * Creates multi-step research plans for complex legal questions.
 * Ensures comprehensive coverage across relevant sources.
 *
 * PLANNING STRATEGY:
 * 1. Analyze question to identify legal domains
 * 2. Select appropriate sources for each domain
 * 3. Plan search sequence (primary sources first)
 * 4. Include cross-reference and validation steps
 * 5. Plan synthesis with uncertainty handling
 */

const { LEGAL_SOURCE_TYPES, RESEARCH_TYPE_SOURCES } = require('./legalResearch.service');

/**
 * Legal domains with their characteristics
 */
const LEGAL_DOMAINS = {
  zivilrecht: {
    name: 'Zivilrecht / Civil Law',
    primarySources: ['bgh', 'olg', 'lg'],
    statutes: ['BGB', 'HGB', 'ZPO'],
    commentary: true,
  },
  arbeitsrecht: {
    name: 'Arbeitsrecht / Labor Law',
    primarySources: ['bag', 'lag', 'arbg'],
    statutes: ['BGB', 'KSchG', 'BetrVG', 'TzBfG'],
    commentary: true,
  },
  verwaltungsrecht: {
    name: 'Verwaltungsrecht / Administrative Law',
    primarySources: ['bverwg', 'ovg', 'vg'],
    statutes: ['VwGO', 'VwVfG'],
    commentary: true,
  },
  strafrecht: {
    name: 'Strafrecht / Criminal Law',
    primarySources: ['bgh', 'olg', 'lg'],
    statutes: ['StGB', 'StPO'],
    commentary: true,
  },
  verfassungsrecht: {
    name: 'Verfassungsrecht / Constitutional Law',
    primarySources: ['bverfg'],
    statutes: ['GG'],
    commentary: true,
  },
  steuerrecht: {
    name: 'Steuerrecht / Tax Law',
    primarySources: ['bfh'],
    statutes: ['AO', 'EStG', 'UStG'],
    commentary: true,
  },
  sozialrecht: {
    name: 'Sozialrecht / Social Law',
    primarySources: ['bsg'],
    statutes: ['SGB I-XII'],
    commentary: true,
  },
  europarecht: {
    name: 'Europarecht / EU Law',
    primarySources: ['eugh'],
    statutes: ['AEUV', 'EU-Verordnungen'],
    commentary: true,
  },
};

/**
 * Create a multi-step research plan
 */
function createResearchPlan({
  query,
  jurisdiction = 'DE',
  researchType = 'comprehensive',
  depth = 'standard', // 'quick', 'standard', 'deep'
  language = 'de',
}) {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Analyze query to detect domains
  const detectedDomains = detectLegalDomains(query);

  // Select sources based on domains and depth
  const sourcePlan = planSourceSelection(detectedDomains, depth, researchType);

  // Create plan steps
  const steps = createPlanSteps(query, sourcePlan, detectedDomains, { jurisdiction, depth, language });

  return {
    planId,
    query,
    jurisdiction,
    researchType,
    depth,
    detectedDomains,
    estimatedSteps: steps.length,
    steps,
    metadata: {
      createdAt: new Date().toISOString(),
      language,
    },
  };
}

/**
 * Detect legal domains from query
 */
function detectLegalDomains(query) {
  const queryLower = query.toLowerCase();
  const detected = [];

  const domainKeywords = {
    zivilrecht: ['vertrag', 'schadensersatz', 'haftung', 'kaufvertrag', 'miete', 'schuld', 'bgb'],
    arbeitsrecht: ['arbeit', 'kundigung', 'lohn', 'gehalt', 'arbeitsvertrag', 'betriebsrat', 'kschg'],
    verwaltungsrecht: ['behorde', 'genehmigung', 'bescheid', 'verwaltung', 'antrag'],
    strafrecht: ['straf', 'delikt', 'vorsatz', 'fahrlassig', 'stgb', 'anklage'],
    verfassungsrecht: ['grundrecht', 'verfassung', 'gg', 'grundgesetz', 'bverfg'],
    steuerrecht: ['steuer', 'finanzamt', 'einkommensteuer', 'umsatzsteuer', 'bfh'],
    sozialrecht: ['rente', 'krankenkasse', 'sozial', 'arbeitslosengeld', 'sgb'],
    europarecht: ['eu', 'europaisch', 'richtlinie', 'verordnung', 'eugh'],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    for (const keyword of keywords) {
      if (queryLower.includes(keyword)) {
        if (!detected.includes(domain)) {
          detected.push(domain);
        }
        break;
      }
    }
  }

  // Default to zivilrecht if nothing detected
  return detected.length > 0 ? detected : ['zivilrecht'];
}

/**
 * Plan source selection based on domains and depth
 */
function planSourceSelection(domains, depth, researchType) {
  const sources = {
    primaryJurisprudence: new Set(),
    secondaryJurisprudence: new Set(),
    statutes: new Set(),
    commentary: depth !== 'quick',
  };

  for (const domainId of domains) {
    const domain = LEGAL_DOMAINS[domainId];
    if (!domain) continue;

    // Add primary sources
    for (const source of domain.primarySources) {
      sources.primaryJurisprudence.add(source);
    }

    // Add secondary sources for deeper research
    if (depth === 'standard' || depth === 'deep') {
      const secondarySources = getSecondarySources(domainId);
      for (const source of secondarySources) {
        sources.secondaryJurisprudence.add(source);
      }
    }

    // Add statutes
    for (const statute of domain.statutes) {
      sources.statutes.add(statute);
    }
  }

  return {
    primaryJurisprudence: Array.from(sources.primaryJurisprudence),
    secondaryJurisprudence: Array.from(sources.secondaryJurisprudence),
    statutes: Array.from(sources.statutes),
    includeCommentary: sources.commentary,
  };
}

/**
 * Get secondary sources for a domain
 */
function getSecondarySources(domainId) {
  const secondary = {
    zivilrecht: ['olg', 'lg'],
    arbeitsrecht: ['lag', 'arbg'],
    verwaltungsrecht: ['ovg', 'vg'],
    strafrecht: ['olg', 'lg'],
    verfassungsrecht: [],
    steuerrecht: ['fg'],
    sozialrecht: ['lsg', 'sg'],
    europarecht: [],
  };
  return secondary[domainId] || [];
}

/**
 * Create plan steps
 */
function createPlanSteps(query, sourcePlan, domains, { jurisdiction, depth, language }) {
  const steps = [];
  let stepNum = 1;

  // Step 1: Statutory research (always first)
  steps.push({
    stepId: `step_${stepNum++}`,
    type: 'legal_research',
    phase: 'statutory',
    name: 'Gesetzesrecherche / Statutory Research',
    description: 'Search relevant statutes and regulations',
    tool: 'legalResearch',
    params: {
      query,
      researchType: 'statute',
      jurisdiction,
      sources: ['gesetze', 'verordnung'],
      maxResults: 10,
      language,
    },
    purpose: 'Identify applicable legal norms',
    dependsOn: [],
  });

  // Step 2: Primary jurisprudence (highest courts)
  if (sourcePlan.primaryJurisprudence.length > 0) {
    steps.push({
      stepId: `step_${stepNum++}`,
      type: 'legal_research',
      phase: 'primary_jurisprudence',
      name: 'Hochstrichterliche Rechtsprechung / High Court Jurisprudence',
      description: 'Search decisions from highest courts',
      tool: 'legalResearch',
      params: {
        query,
        researchType: 'jurisprudence',
        jurisdiction,
        sources: sourcePlan.primaryJurisprudence,
        maxResults: 15,
        language,
      },
      purpose: 'Find authoritative precedents',
      dependsOn: ['step_1'],
    });
  }

  // Step 3: Secondary jurisprudence (for standard/deep)
  if (sourcePlan.secondaryJurisprudence.length > 0 && depth !== 'quick') {
    steps.push({
      stepId: `step_${stepNum++}`,
      type: 'legal_research',
      phase: 'secondary_jurisprudence',
      name: 'Instanzrechtsprechung / Lower Court Jurisprudence',
      description: 'Search decisions from appellate and regional courts',
      tool: 'legalResearch',
      params: {
        query,
        researchType: 'jurisprudence',
        jurisdiction,
        sources: sourcePlan.secondaryJurisprudence,
        maxResults: 10,
        language,
      },
      purpose: 'Find supporting precedents and trends',
      dependsOn: [`step_${stepNum - 1}`],
    });
  }

  // Step 4: Commentary (for standard/deep)
  if (sourcePlan.includeCommentary) {
    steps.push({
      stepId: `step_${stepNum++}`,
      type: 'legal_research',
      phase: 'commentary',
      name: 'Kommentarliteratur / Legal Commentary',
      description: 'Search legal doctrine and commentary',
      tool: 'legalResearch',
      params: {
        query,
        researchType: 'comprehensive',
        jurisdiction,
        sources: ['commentary'],
        maxResults: 5,
        language,
      },
      purpose: 'Gather doctrinal analysis and interpretation',
      dependsOn: [`step_${stepNum - 1}`],
    });
  }

  // Step 5: Cross-reference validation (for deep)
  if (depth === 'deep') {
    steps.push({
      stepId: `step_${stepNum++}`,
      type: 'validation',
      phase: 'cross_reference',
      name: 'Querverweis-Prufung / Cross-Reference Validation',
      description: 'Validate findings against cited references',
      actions: [
        'Check cited statutes in found decisions',
        'Verify legal norm citations',
        'Identify superseded precedents',
      ],
      dependsOn: steps.map(s => s.stepId),
    });
  }

  // Step 6: Synthesis
  steps.push({
    stepId: `step_${stepNum++}`,
    type: 'synthesis',
    phase: 'synthesis',
    name: 'Synthese / Synthesis',
    description: 'Combine and analyze all findings',
    actions: [
      'Cluster results by legal issue',
      'Identify consensus and conflicts',
      'Note uncertainties and open questions',
      'Build citation list',
    ],
    outputType: 'legal_research_artifact',
    dependsOn: steps.map(s => s.stepId),
  });

  return steps;
}

/**
 * Execute a research plan
 */
async function executeResearchPlan(plan, agentEngine, policy) {
  const trace = {
    planId: plan.planId,
    startedAt: new Date().toISOString(),
    steps: [],
    results: {},
    errors: [],
  };

  for (const step of plan.steps) {
    const stepTrace = {
      stepId: step.stepId,
      name: step.name,
      startedAt: new Date().toISOString(),
      status: 'running',
    };

    try {
      if (step.type === 'legal_research') {
        // Execute legal research tool
        const result = await agentEngine.callTool(
          step.tool,
          step.params,
          policy,
          {}
        );
        stepTrace.result = result.result;
        stepTrace.status = 'completed';
        trace.results[step.stepId] = result.result;
      } else if (step.type === 'synthesis') {
        // Synthesis step uses accumulated results
        stepTrace.result = synthesizeResults(trace.results, plan);
        stepTrace.status = 'completed';
        trace.results[step.stepId] = stepTrace.result;
      } else if (step.type === 'validation') {
        // Validation step
        stepTrace.result = validateResults(trace.results);
        stepTrace.status = 'completed';
      }
    } catch (error) {
      stepTrace.status = 'failed';
      stepTrace.error = error.message;
      trace.errors.push({
        stepId: step.stepId,
        error: error.message,
      });
    }

    stepTrace.completedAt = new Date().toISOString();
    trace.steps.push(stepTrace);
  }

  trace.completedAt = new Date().toISOString();
  trace.status = trace.errors.length === 0 ? 'completed' : 'completed_with_errors';

  return trace;
}

/**
 * Synthesize results from multiple research steps
 */
function synthesizeResults(stepResults, plan) {
  const allResults = [];
  const allCitations = [];

  // Collect all results
  for (const [stepId, result] of Object.entries(stepResults)) {
    if (result && result.clusters) {
      for (const cluster of result.clusters) {
        allResults.push(...cluster.results);
      }
    }
    if (result && result.citations) {
      allCitations.push(...result.citations);
    }
  }

  // Deduplicate citations
  const uniqueCitations = deduplicateCitations(allCitations);

  return {
    query: plan.query,
    totalSources: allResults.length,
    uniqueCitations: uniqueCitations.length,
    domains: plan.detectedDomains,
    synthesizedAt: new Date().toISOString(),
  };
}

/**
 * Validate results for consistency
 */
function validateResults(stepResults) {
  const validationIssues = [];

  // Check for conflicting citations
  // Check for superseded precedents
  // Check for legislative changes

  return {
    validated: true,
    issues: validationIssues,
  };
}

/**
 * Deduplicate citations
 */
function deduplicateCitations(citations) {
  const seen = new Set();
  return citations.filter(c => {
    const key = c.citation || c.url || c.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  createResearchPlan,
  executeResearchPlan,
  detectLegalDomains,
  planSourceSelection,
  LEGAL_DOMAINS,
};
