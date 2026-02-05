'use strict';

/**
 * Legal Research Service
 *
 * Executes legal research queries across multiple sources.
 * Supports jurisprudence, statutes, and procedural rules.
 *
 * SOURCES (German Legal System):
 * - BGH (Bundesgerichtshof) - Federal Court of Justice
 * - BVerfG (Bundesverfassungsgericht) - Federal Constitutional Court
 * - BAG (Bundesarbeitsgericht) - Federal Labor Court
 * - BFH (Bundesfinanzhof) - Federal Fiscal Court
 * - BSG (Bundessozialgericht) - Federal Social Court
 * - OVG (Oberverwaltungsgerichte) - Higher Administrative Courts
 * - LG (Landgerichte) - Regional Courts
 * - AG (Amtsgerichte) - Local Courts
 * - EuGH (Europaischer Gerichtshof) - European Court of Justice
 * - EGMR (Europaischer Gerichtshof fur Menschenrechte) - ECHR
 * - Gesetze (Statutes) - Federal and state legislation
 * - Commentary - Legal doctrine and commentary
 */

/**
 * Legal source types with metadata
 */
const LEGAL_SOURCE_TYPES = Object.freeze({
  // German Federal Courts (highest authority)
  BGH: { id: 'bgh', name: 'Bundesgerichtshof', weight: 1.0, type: 'jurisprudence', level: 'federal' },
  BVERFG: { id: 'bverfg', name: 'Bundesverfassungsgericht', weight: 1.0, type: 'jurisprudence', level: 'constitutional' },
  BAG: { id: 'bag', name: 'Bundesarbeitsgericht', weight: 1.0, type: 'jurisprudence', level: 'federal' },
  BFH: { id: 'bfh', name: 'Bundesfinanzhof', weight: 1.0, type: 'jurisprudence', level: 'federal' },
  BSG: { id: 'bsg', name: 'Bundessozialgericht', weight: 1.0, type: 'jurisprudence', level: 'federal' },

  // Higher Courts (high authority)
  OVG: { id: 'ovg', name: 'Oberverwaltungsgericht', weight: 0.85, type: 'jurisprudence', level: 'appellate' },
  OLG: { id: 'olg', name: 'Oberlandesgericht', weight: 0.85, type: 'jurisprudence', level: 'appellate' },
  LAG: { id: 'lag', name: 'Landesarbeitsgericht', weight: 0.85, type: 'jurisprudence', level: 'appellate' },

  // Lower Courts (moderate authority)
  LG: { id: 'lg', name: 'Landgericht', weight: 0.7, type: 'jurisprudence', level: 'regional' },
  AG: { id: 'ag', name: 'Amtsgericht', weight: 0.6, type: 'jurisprudence', level: 'local' },
  VG: { id: 'vg', name: 'Verwaltungsgericht', weight: 0.7, type: 'jurisprudence', level: 'regional' },
  ARBG: { id: 'arbg', name: 'Arbeitsgericht', weight: 0.6, type: 'jurisprudence', level: 'local' },

  // European Courts
  EUGH: { id: 'eugh', name: 'Europaischer Gerichtshof', weight: 1.0, type: 'jurisprudence', level: 'supranational' },
  EGMR: { id: 'egmr', name: 'EGMR', weight: 1.0, type: 'jurisprudence', level: 'supranational' },

  // Legislation
  STATUTE: { id: 'gesetze', name: 'Gesetzestexte', weight: 1.0, type: 'statute', level: 'primary' },
  REGULATION: { id: 'verordnung', name: 'Verordnungen', weight: 0.95, type: 'statute', level: 'secondary' },

  // Commentary
  COMMENTARY: { id: 'commentary', name: 'Kommentarliteratur', weight: 0.75, type: 'commentary', level: 'doctrine' },
});

/**
 * Source selection based on research type
 */
const RESEARCH_TYPE_SOURCES = {
  jurisprudence: ['bgh', 'bverfg', 'bag', 'bfh', 'bsg', 'ovg', 'olg', 'lg', 'eugh', 'egmr'],
  statute: ['gesetze', 'verordnung'],
  procedure: ['gesetze', 'bgh', 'ovg', 'commentary'],
  comprehensive: ['bgh', 'bverfg', 'bag', 'bfh', 'bsg', 'ovg', 'olg', 'lg', 'eugh', 'gesetze', 'commentary'],
};

/**
 * API configuration
 */
const LEGAL_API_URL = process.env.LEGAL_API_URL || null;
const LEGAL_API_KEY = process.env.LEGAL_API_KEY || null;
const LEGAL_API_TIMEOUT = parseInt(process.env.LEGAL_API_TIMEOUT || '15000', 10);

/**
 * Execute legal research across sources
 */
async function executeLegalResearch({
  query,
  researchType,
  jurisdiction,
  sources,
  dateRange,
  includeCommentary,
  maxResults,
  language,
}) {
  // Determine which sources to search
  const sourcesToSearch = sources.length > 0
    ? sources
    : RESEARCH_TYPE_SOURCES[researchType] || RESEARCH_TYPE_SOURCES.comprehensive;

  // Add commentary if requested
  const finalSources = includeCommentary && !sourcesToSearch.includes('commentary')
    ? [...sourcesToSearch, 'commentary']
    : sourcesToSearch;

  // Execute search
  let results;
  if (LEGAL_API_URL && LEGAL_API_KEY) {
    results = await searchLegalAPI({
      query,
      sources: finalSources,
      jurisdiction,
      dateRange,
      maxResults,
      language,
    });
  } else {
    results = await searchLegalMock({
      query,
      sources: finalSources,
      jurisdiction,
      dateRange,
      maxResults,
      language,
      researchType,
    });
  }

  return {
    ...results,
    sourcesSearched: finalSources,
  };
}

/**
 * Search via legal API (when configured)
 */
async function searchLegalAPI({ query, sources, jurisdiction, dateRange, maxResults, language }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LEGAL_API_TIMEOUT);

  try {
    const response = await fetch(`${LEGAL_API_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LEGAL_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        sources,
        jurisdiction,
        dateRange,
        maxResults,
        language,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Legal API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Legal research timeout');
    }
    throw error;
  }
}

/**
 * Mock search for development/testing
 */
async function searchLegalMock({ query, sources, jurisdiction, dateRange, maxResults, language, researchType }) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 150));

  const results = [];

  // Generate mock results for each source type
  for (const sourceId of sources) {
    const sourceInfo = Object.values(LEGAL_SOURCE_TYPES).find(s => s.id === sourceId);
    if (!sourceInfo) continue;

    const sourceResults = generateMockSourceResults(query, sourceInfo, jurisdiction, language, researchType);
    results.push(...sourceResults);
  }

  // Sort by weight and limit
  results.sort((a, b) => b.sourceWeight - a.sourceWeight);

  return {
    results: results.slice(0, maxResults),
    totalCount: results.length,
  };
}

/**
 * Generate mock results for a source
 */
function generateMockSourceResults(query, sourceInfo, jurisdiction, language, researchType) {
  const isGerman = language === 'de';
  const templates = getMockTemplates(sourceInfo, isGerman, researchType);

  return templates.map((template, index) => ({
    id: `${sourceInfo.id}_${Date.now()}_${index}`,
    sourceType: sourceInfo.id,
    sourceName: sourceInfo.name,
    sourceWeight: sourceInfo.weight,
    type: sourceInfo.type,
    level: sourceInfo.level,
    jurisdiction,

    // Content
    title: template.title.replace('{query}', query),
    citation: template.citation,
    summary: template.summary.replace('{query}', query),
    headnotes: template.headnotes || [],
    legalNorms: template.legalNorms || [],

    // Dates
    decisionDate: template.decisionDate || null,
    effectiveDate: template.effectiveDate || null,
    publicationDate: template.publicationDate || new Date().toISOString(),

    // URL
    url: template.url,
  }));
}

/**
 * Get mock templates by source type
 */
function getMockTemplates(sourceInfo, isGerman, researchType) {
  const baseDate = new Date();
  const year = baseDate.getFullYear();

  if (sourceInfo.type === 'jurisprudence') {
    return getJurisprudenceTemplates(sourceInfo, isGerman, year);
  } else if (sourceInfo.type === 'statute') {
    return getStatuteTemplates(sourceInfo, isGerman, year);
  } else if (sourceInfo.type === 'commentary') {
    return getCommentaryTemplates(sourceInfo, isGerman, year);
  }

  return [];
}

/**
 * Jurisprudence templates
 */
function getJurisprudenceTemplates(sourceInfo, isGerman, year) {
  const courtAbbrev = sourceInfo.id.toUpperCase();

  return [
    {
      title: isGerman
        ? `${sourceInfo.name} zur Frage: {query}`
        : `${sourceInfo.name} on the question: {query}`,
      citation: `${courtAbbrev}, ${year - 1}-03-15 - I ZR 123/${year - 2}`,
      summary: isGerman
        ? `Leitsatz: Der ${sourceInfo.name} hat entschieden, dass im Zusammenhang mit {query} besondere Anforderungen gelten. Die Revision wurde zuruckgewiesen.`
        : `Headnote: The ${sourceInfo.name} ruled that special requirements apply in connection with {query}. The appeal was dismissed.`,
      headnotes: isGerman
        ? ['Zur Auslegung der einschlagigen Vorschriften', 'Zu den Anforderungen an die Darlegungslast']
        : ['On interpretation of relevant provisions', 'On requirements for burden of proof'],
      legalNorms: ['§ 280 BGB', '§ 823 BGB'],
      decisionDate: `${year - 1}-03-15`,
      url: `https://www.rechtsprechung-im-internet.de/${courtAbbrev.toLowerCase()}/example`,
    },
    {
      title: isGerman
        ? `Grundsatzentscheidung zu {query}`
        : `Landmark decision on {query}`,
      citation: `${courtAbbrev}, ${year - 2}-11-22 - II ZR 456/${year - 3}`,
      summary: isGerman
        ? `In dieser Grundsatzentscheidung hat der ${sourceInfo.name} die Rechtslage zu {query} klargestellt.`
        : `In this landmark decision, the ${sourceInfo.name} clarified the legal situation regarding {query}.`,
      headnotes: isGerman
        ? ['Grundsatzliche Klarstellung der Rechtslage']
        : ['Fundamental clarification of legal situation'],
      legalNorms: ['§ 242 BGB'],
      decisionDate: `${year - 2}-11-22`,
      url: `https://www.rechtsprechung-im-internet.de/${courtAbbrev.toLowerCase()}/example2`,
    },
  ];
}

/**
 * Statute templates
 */
function getStatuteTemplates(sourceInfo, isGerman, year) {
  return [
    {
      title: isGerman
        ? `Gesetzliche Regelung zu {query}`
        : `Statutory regulation on {query}`,
      citation: 'BGB § 280 Abs. 1',
      summary: isGerman
        ? `Gesetzestext: Verletzt der Schuldner eine Pflicht aus dem Schuldverhaltnis, so kann der Glaubiger Ersatz des hierdurch entstehenden Schadens verlangen.`
        : `Statutory text: If the obligor breaches a duty arising from the obligation, the obligee may demand compensation for the resulting damage.`,
      legalNorms: ['§ 280 BGB', '§ 281 BGB', '§ 283 BGB'],
      effectiveDate: '2002-01-01',
      publicationDate: `${year}-01-01`,
      url: 'https://www.gesetze-im-internet.de/bgb/__280.html',
    },
    {
      title: isGerman
        ? `Verfahrensrechtliche Vorschrift: {query}`
        : `Procedural provision: {query}`,
      citation: 'ZPO § 253',
      summary: isGerman
        ? `Die Klage wird durch Zustellung eines Schriftsatzes (Klageschrift) erhoben.`
        : `An action shall be brought by service of a written document (statement of claim).`,
      legalNorms: ['§ 253 ZPO', '§ 130 ZPO'],
      effectiveDate: '1950-09-12',
      publicationDate: `${year}-01-01`,
      url: 'https://www.gesetze-im-internet.de/zpo/__253.html',
    },
  ];
}

/**
 * Commentary templates
 */
function getCommentaryTemplates(sourceInfo, isGerman, year) {
  return [
    {
      title: isGerman
        ? `Munchener Kommentar zu {query}`
        : `Munich Commentary on {query}`,
      citation: `MuKoBGB/Autor, 9. Aufl. ${year}, § 280 Rn. 15-23`,
      summary: isGerman
        ? `Die herrschende Meinung in der Literatur geht davon aus, dass bei {query} eine Abwagung der beiderseitigen Interessen erforderlich ist.`
        : `The prevailing view in legal doctrine assumes that {query} requires a balancing of mutual interests.`,
      headnotes: isGerman
        ? ['Herrschende Meinung', 'Literaturubersicht']
        : ['Prevailing view', 'Literature overview'],
      legalNorms: ['§ 280 BGB'],
      publicationDate: `${year}-01-01`,
      url: 'https://beck-online.beck.de/example',
    },
    {
      title: isGerman
        ? `Palandt Kurzkommentar: {query}`
        : `Palandt Short Commentary: {query}`,
      citation: `Palandt/Grunewald, 83. Aufl. ${year}, § 280 Rn. 8`,
      summary: isGerman
        ? `Kurzkommentierung zu den praktischen Anforderungen bei {query}.`
        : `Brief commentary on practical requirements for {query}.`,
      legalNorms: ['§ 280 BGB'],
      publicationDate: `${year}-01-01`,
      url: 'https://beck-online.beck.de/example2',
    },
  ];
}

/**
 * Get source weight by ID
 */
function getSourceWeight(sourceId) {
  const source = Object.values(LEGAL_SOURCE_TYPES).find(s => s.id === sourceId);
  return source ? source.weight : 0.5;
}

/**
 * Check if API is configured
 */
function isAPIConfigured() {
  return !!(LEGAL_API_URL && LEGAL_API_KEY);
}

module.exports = {
  executeLegalResearch,
  LEGAL_SOURCE_TYPES,
  RESEARCH_TYPE_SOURCES,
  getSourceWeight,
  isAPIConfigured,
};
