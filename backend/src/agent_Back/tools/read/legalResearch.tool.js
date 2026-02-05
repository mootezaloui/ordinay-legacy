'use strict';

/**
 * READ TOOL: legalResearch
 *
 * Deep legal research for jurisprudence, statutes, and procedural rules.
 * Read-only, no side effects, safe for all agent versions.
 *
 * CAPABILITIES:
 * - Search case law (jurisprudence)
 * - Search statutes and regulations
 * - Search procedural rules
 * - Compare interpretations across sources
 * - Handle uncertainty explicitly
 *
 * CONSTRAINTS:
 * - NO legal advice claims
 * - NO hallucinated law
 * - ALWAYS cite sources
 * - Express uncertainty when present
 */

const { TOOL_CATEGORIES } = require('../tool.registry');
const { executeLegalResearch, LEGAL_SOURCE_TYPES } = require('./legalResearch.service');
const { normalizeResearchResults, buildResearchCitations, clusterResults } = require('./legalResearch.normalizer');

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 3,
      maxLength: 1000,
      description: 'The legal research query',
    },
    researchType: {
      type: 'string',
      enum: ['jurisprudence', 'statute', 'procedure', 'comprehensive'],
      default: 'comprehensive',
      description: 'Type of legal research to conduct',
    },
    jurisdiction: {
      type: 'string',
      enum: ['DE', 'EU', 'AT', 'CH'],
      default: 'DE',
      description: 'Legal jurisdiction',
    },
    sources: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['bgh', 'bverfg', 'bag', 'bfh', 'bsg', 'ovg', 'lg', 'ag', 'eugh', 'egmr', 'gesetze', 'commentary'],
      },
      default: [],
      description: 'Specific sources to search (empty = all relevant)',
    },
    dateRange: {
      type: 'object',
      properties: {
        from: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
        to: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' },
      },
      description: 'Date range for results',
    },
    includeCommentary: {
      type: 'boolean',
      default: true,
      description: 'Include legal commentary and doctrine',
    },
    maxResults: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 20,
      description: 'Maximum number of results',
    },
    language: {
      type: 'string',
      enum: ['de', 'en'],
      default: 'de',
      description: 'Language for results',
    },
  },
  required: ['query'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    researchType: { type: 'string' },
    jurisdiction: { type: 'string' },
    resultCount: { type: 'integer' },
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clusterId: { type: 'string' },
          topic: { type: 'string' },
          results: { type: 'array' },
          consensus: { type: ['string', 'null'] },
          conflictingViews: { type: 'array' },
        },
      },
      description: 'Results grouped by legal topic/issue',
    },
    primarySources: {
      type: 'array',
      description: 'Authoritative legal sources (statutes, high court decisions)',
    },
    secondarySources: {
      type: 'array',
      description: 'Commentary, doctrine, lower court decisions',
    },
    uncertainties: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issue: { type: 'string' },
          reason: { type: 'string' },
          conflictingSources: { type: 'array' },
        },
      },
      description: 'Areas of legal uncertainty identified',
    },
    citations: {
      type: 'array',
      description: 'Full citation list for all sources',
    },
    researchMeta: {
      type: 'object',
      properties: {
        sourcesSearched: { type: 'array' },
        searchTime: { type: 'number' },
        timestamp: { type: 'string', format: 'date-time' },
        disclaimer: { type: 'string' },
      },
    },
  },
  required: ['query', 'researchType', 'jurisdiction', 'resultCount', 'citations', 'researchMeta'],
  additionalProperties: false,
};

/**
 * Legal research handler
 */
async function handler({
  query,
  researchType = 'comprehensive',
  jurisdiction = 'DE',
  sources = [],
  dateRange,
  includeCommentary = true,
  maxResults = 20,
  language = 'de',
}) {
  const startTime = Date.now();

  // Execute research across sources
  const rawResults = await executeLegalResearch({
    query,
    researchType,
    jurisdiction,
    sources,
    dateRange,
    includeCommentary,
    maxResults,
    language,
  });

  // Normalize and classify results
  const normalizedResults = normalizeResearchResults(rawResults, { jurisdiction, language });

  // Cluster results by legal topic
  const clusters = clusterResults(normalizedResults, { researchType });

  // Separate primary and secondary sources
  const primarySources = normalizedResults.filter(r => r.sourceWeight >= 0.8);
  const secondarySources = normalizedResults.filter(r => r.sourceWeight < 0.8);

  // Identify uncertainties and conflicts
  const uncertainties = identifyUncertainties(clusters, normalizedResults);

  // Build citations
  const citations = buildResearchCitations(normalizedResults);

  return {
    query,
    researchType,
    jurisdiction,
    resultCount: normalizedResults.length,
    clusters,
    primarySources: primarySources.slice(0, 10),
    secondarySources: secondarySources.slice(0, 10),
    uncertainties,
    citations,
    researchMeta: {
      sourcesSearched: rawResults.sourcesSearched || [],
      searchTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      disclaimer: getDisclaimer(language),
    },
  };
}

/**
 * Identify areas of legal uncertainty
 */
function identifyUncertainties(clusters, results) {
  const uncertainties = [];

  for (const cluster of clusters) {
    // Check for conflicting interpretations
    if (cluster.conflictingViews && cluster.conflictingViews.length > 0) {
      uncertainties.push({
        issue: cluster.topic,
        reason: 'Conflicting interpretations found across sources',
        conflictingSources: cluster.conflictingViews.map(v => v.source),
      });
    }

    // Check for lack of high-court precedent
    const hasHighCourtPrecedent = cluster.results.some(r =>
      ['bgh', 'bverfg', 'bag', 'bfh', 'bsg', 'eugh'].includes(r.sourceType)
    );
    if (!hasHighCourtPrecedent && cluster.results.length > 0) {
      uncertainties.push({
        issue: cluster.topic,
        reason: 'No binding high court precedent found',
        conflictingSources: [],
      });
    }
  }

  // Check for recent legislative changes
  const recentStatutes = results.filter(r =>
    r.sourceType === 'statute' &&
    r.effectiveDate &&
    new Date(r.effectiveDate) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  );
  if (recentStatutes.length > 0) {
    uncertainties.push({
      issue: 'Recent legislative changes',
      reason: 'Statutes modified within the last year may lack settled interpretation',
      conflictingSources: recentStatutes.map(s => s.citation),
    });
  }

  return uncertainties;
}

/**
 * Get disclaimer text by language
 */
function getDisclaimer(language) {
  const disclaimers = {
    de: 'Diese Rechercheergebnisse stellen keine Rechtsberatung dar. Die Informationen wurden aus offentlich zuganglichen Quellen zusammengestellt und konnen unvollstandig oder veraltet sein. Fur verbindliche rechtliche Einschatzungen konsultieren Sie bitte einen zugelassenen Rechtsanwalt.',
    en: 'These research results do not constitute legal advice. The information has been compiled from publicly available sources and may be incomplete or outdated. For authoritative legal assessments, please consult a licensed attorney.',
  };
  return disclaimers[language] || disclaimers.de;
}

module.exports = {
  name: 'legalResearch',
  category: TOOL_CATEGORIES.READ,
  description: 'Conduct deep legal research across jurisprudence, statutes, and procedural rules. Results include source citations and explicit uncertainty handling. Does NOT provide legal advice.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
