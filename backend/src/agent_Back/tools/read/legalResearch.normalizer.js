'use strict';

/**
 * Legal Research Normalizer
 *
 * Normalizes, clusters, and cites legal research results.
 *
 * FEATURES:
 * - Result normalization to consistent format
 * - Topic-based clustering
 * - Source weighting
 * - Conflict detection
 * - Citation building
 */

const { getSourceWeight } = require('./legalResearch.service');

/**
 * Legal topics for clustering
 */
const LEGAL_TOPICS = {
  // Contract Law
  CONTRACT_FORMATION: ['vertragsschluss', 'angebot', 'annahme', 'contract formation', 'offer', 'acceptance'],
  CONTRACT_BREACH: ['vertragsverletzung', 'pflichtverletzung', 'breach', 'violation'],
  DAMAGES: ['schadensersatz', 'schaden', 'damages', 'compensation'],
  TERMINATION: ['kundigung', 'rucktritt', 'termination', 'withdrawal'],

  // Procedural
  JURISDICTION: ['zustandigkeit', 'gerichtsstand', 'jurisdiction', 'venue'],
  DEADLINES: ['frist', 'verjahrung', 'deadline', 'limitation'],
  APPEALS: ['berufung', 'revision', 'rechtsmittel', 'appeal'],
  EVIDENCE: ['beweis', 'beweislast', 'evidence', 'burden of proof'],

  // Employment
  DISMISSAL: ['kundigung', 'entlassung', 'dismissal', 'termination'],
  WAGES: ['lohn', 'gehalt', 'vergutung', 'wages', 'salary'],

  // General
  LIABILITY: ['haftung', 'verantwortlichkeit', 'liability'],
  INTERPRETATION: ['auslegung', 'interpretation'],
};

/**
 * Normalize research results to consistent format
 */
function normalizeResearchResults(rawResults, { jurisdiction, language }) {
  const results = rawResults.results || rawResults || [];

  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map(result => normalizeResult(result, { jurisdiction, language }))
    .filter(result => result !== null);
}

/**
 * Normalize a single research result
 */
function normalizeResult(result, { jurisdiction, language }) {
  if (!result) return null;

  // Ensure required fields
  const normalized = {
    id: result.id || `result_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    sourceType: result.sourceType || 'unknown',
    sourceName: result.sourceName || 'Unknown Source',
    sourceWeight: result.sourceWeight || getSourceWeight(result.sourceType) || 0.5,
    type: result.type || 'jurisprudence',
    level: result.level || 'unknown',
    jurisdiction: result.jurisdiction || jurisdiction,

    // Content
    title: cleanText(result.title || 'Untitled'),
    citation: result.citation || null,
    summary: cleanText(result.summary || ''),
    headnotes: Array.isArray(result.headnotes) ? result.headnotes.map(cleanText) : [],
    legalNorms: Array.isArray(result.legalNorms) ? result.legalNorms : [],

    // Dates
    decisionDate: parseDate(result.decisionDate),
    effectiveDate: parseDate(result.effectiveDate),
    publicationDate: parseDate(result.publicationDate),

    // URL
    url: result.url || null,

    // Metadata
    language,
    normalizedAt: new Date().toISOString(),
  };

  // Detect topics
  normalized.topics = detectTopics(normalized);

  return normalized;
}

/**
 * Clean text content
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse date string
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Detect legal topics in result
 */
function detectTopics(result) {
  const topics = [];
  const searchText = `${result.title} ${result.summary} ${result.headnotes.join(' ')}`.toLowerCase();

  for (const [topic, keywords] of Object.entries(LEGAL_TOPICS)) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        if (!topics.includes(topic)) {
          topics.push(topic);
        }
        break;
      }
    }
  }

  return topics.length > 0 ? topics : ['GENERAL'];
}

/**
 * Cluster results by legal topic
 */
function clusterResults(results, { researchType }) {
  const clusters = new Map();

  // Group by primary topic
  for (const result of results) {
    const primaryTopic = result.topics[0] || 'GENERAL';

    if (!clusters.has(primaryTopic)) {
      clusters.set(primaryTopic, {
        clusterId: `cluster_${primaryTopic.toLowerCase()}`,
        topic: formatTopicName(primaryTopic),
        results: [],
        interpretations: [],
      });
    }

    clusters.get(primaryTopic).results.push(result);
  }

  // Analyze each cluster for consensus/conflicts
  const analyzedClusters = [];
  for (const [topic, cluster] of clusters) {
    const analysis = analyzeCluster(cluster);
    analyzedClusters.push({
      ...cluster,
      ...analysis,
    });
  }

  // Sort by result count and weight
  return analyzedClusters.sort((a, b) => {
    const aWeight = a.results.reduce((sum, r) => sum + r.sourceWeight, 0);
    const bWeight = b.results.reduce((sum, r) => sum + r.sourceWeight, 0);
    return bWeight - aWeight;
  });
}

/**
 * Format topic name for display
 */
function formatTopicName(topic) {
  const names = {
    CONTRACT_FORMATION: 'Vertragsschluss / Contract Formation',
    CONTRACT_BREACH: 'Vertragsverletzung / Contract Breach',
    DAMAGES: 'Schadensersatz / Damages',
    TERMINATION: 'Kundigung / Termination',
    JURISDICTION: 'Zustandigkeit / Jurisdiction',
    DEADLINES: 'Fristen / Deadlines',
    APPEALS: 'Rechtsmittel / Appeals',
    EVIDENCE: 'Beweisrecht / Evidence',
    DISMISSAL: 'Kundigung / Dismissal',
    WAGES: 'Vergutung / Wages',
    LIABILITY: 'Haftung / Liability',
    INTERPRETATION: 'Auslegung / Interpretation',
    GENERAL: 'Allgemein / General',
  };
  return names[topic] || topic;
}

/**
 * Analyze cluster for consensus and conflicts
 */
function analyzeCluster(cluster) {
  const results = cluster.results;

  // Group by source level
  const byLevel = {
    federal: results.filter(r => r.level === 'federal' || r.level === 'constitutional'),
    supranational: results.filter(r => r.level === 'supranational'),
    appellate: results.filter(r => r.level === 'appellate'),
    regional: results.filter(r => r.level === 'regional' || r.level === 'local'),
    doctrine: results.filter(r => r.level === 'doctrine'),
  };

  // Determine consensus
  let consensus = null;
  let conflictingViews = [];

  // Check for high-authority consensus
  const highAuthority = [...byLevel.federal, ...byLevel.supranational];
  if (highAuthority.length >= 2) {
    consensus = 'High court consensus established';
  } else if (highAuthority.length === 1) {
    consensus = 'Single high court precedent';
  }

  // Check for conflicting views
  const interpretations = extractInterpretations(results);
  if (interpretations.length > 1) {
    const uniqueViews = detectConflicts(interpretations);
    if (uniqueViews.length > 1) {
      conflictingViews = uniqueViews;
      if (consensus) {
        consensus += ' (with some lower court variation)';
      } else {
        consensus = null;
      }
    }
  }

  return {
    consensus,
    conflictingViews,
    sourceDistribution: {
      highAuthority: highAuthority.length,
      appellate: byLevel.appellate.length,
      lowerCourts: byLevel.regional.length,
      commentary: byLevel.doctrine.length,
    },
  };
}

/**
 * Extract interpretations from results
 */
function extractInterpretations(results) {
  return results.map(r => ({
    source: r.citation || r.sourceName,
    sourceType: r.sourceType,
    sourceWeight: r.sourceWeight,
    summary: r.summary,
    headnotes: r.headnotes,
  }));
}

/**
 * Detect conflicting interpretations
 */
function detectConflicts(interpretations) {
  // Simple conflict detection based on headnotes
  // In production, this would use NLP/semantic analysis
  const viewGroups = [];

  for (const interp of interpretations) {
    let foundGroup = false;

    for (const group of viewGroups) {
      // Check if this interpretation aligns with group
      const similarity = calculateSimilarity(interp, group[0]);
      if (similarity > 0.7) {
        group.push(interp);
        foundGroup = true;
        break;
      }
    }

    if (!foundGroup) {
      viewGroups.push([interp]);
    }
  }

  // Return groups with multiple views as potential conflicts
  if (viewGroups.length > 1) {
    return viewGroups.map(group => ({
      source: group[0].source,
      sourceType: group[0].sourceType,
      representativeSummary: group[0].summary.substring(0, 200),
      supportingCount: group.length,
    }));
  }

  return [];
}

/**
 * Calculate simple similarity between interpretations
 */
function calculateSimilarity(a, b) {
  // Simple word overlap similarity
  const wordsA = new Set(a.summary.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.summary.toLowerCase().split(/\s+/));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Build citations array from results
 */
function buildResearchCitations(results) {
  const accessedAt = new Date().toISOString();

  return results.map((result, index) => ({
    index: index + 1,
    citation: result.citation,
    source: result.sourceName,
    sourceType: result.sourceType,
    sourceWeight: result.sourceWeight,
    title: result.title,
    url: result.url,
    decisionDate: result.decisionDate,
    legalNorms: result.legalNorms,
    accessedAt,
  }));
}

/**
 * Format citations for display
 */
function formatResearchCitations(citations, format = 'legal') {
  if (!citations || citations.length === 0) {
    return '';
  }

  switch (format) {
    case 'legal':
      // German legal citation format
      return citations
        .map(c => {
          if (c.citation) {
            return `[${c.index}] ${c.citation}`;
          }
          return `[${c.index}] ${c.source}: ${c.title}`;
        })
        .join('\n');

    case 'academic':
      // Academic citation format
      return citations
        .map(c => {
          const date = c.decisionDate ? ` (${c.decisionDate.substring(0, 10)})` : '';
          return `[${c.index}] ${c.source}${date}, ${c.title}`;
        })
        .join('\n');

    case 'full':
      // Full citation with URL
      return citations
        .map(c => {
          const parts = [`[${c.index}]`];
          if (c.citation) parts.push(c.citation);
          else parts.push(`${c.source}: ${c.title}`);
          if (c.url) parts.push(`URL: ${c.url}`);
          if (c.legalNorms.length > 0) parts.push(`Normen: ${c.legalNorms.join(', ')}`);
          return parts.join('\n    ');
        })
        .join('\n\n');

    default:
      return formatResearchCitations(citations, 'legal');
  }
}

module.exports = {
  normalizeResearchResults,
  normalizeResult,
  clusterResults,
  buildResearchCitations,
  formatResearchCitations,
  detectTopics,
  analyzeCluster,
  LEGAL_TOPICS,
};
