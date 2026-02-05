'use strict';

/**
 * Web Search Tool - Example Usage
 *
 * Demonstrates how to use the webSearch tool for factual information retrieval.
 * All examples show proper citation handling.
 */

/**
 * Example 1: Search for legal deadlines
 *
 * User asks: "What is the deadline for filing an appeal in German civil court?"
 */
const EXAMPLE_DEADLINE_SEARCH = {
  input: {
    query: 'Berufungsfrist Zivilprozess Deutschland',
    category: 'deadline',
    language: 'de',
    limit: 5,
  },
  expectedOutput: {
    query: 'Berufungsfrist Zivilprozess Deutschland',
    category: 'deadline',
    resultCount: 5,
    results: [
      {
        title: 'Berufungsfrist im Zivilprozess - Fristen und Termine',
        snippet: 'Die Berufungsfrist betragt einen Monat ab Zustellung des Urteils (§ 517 ZPO). Die Frist beginnt mit der Zustellung...',
        url: 'https://www.justiz.de/fristen/berufung',
        source: 'justiz.de',
        publishedDate: '2025-11-15T00:00:00Z',
        relevanceScore: 0.95,
      },
      // ... more results
    ],
    citations: [
      {
        index: 1,
        source: 'justiz.de',
        url: 'https://www.justiz.de/fristen/berufung',
        title: 'Berufungsfrist im Zivilprozess - Fristen und Termine',
        accessedAt: '2026-02-05T10:00:00Z',
      },
      // ... more citations
    ],
    searchMeta: {
      provider: 'brave',
      searchTime: 234,
      timestamp: '2026-02-05T10:00:00Z',
    },
  },
  agentResponse: `
## Berufungsfrist im Zivilprozess

Die Berufungsfrist im deutschen Zivilprozess betragt **einen Monat** ab Zustellung des erstinstanzlichen Urteils (§ 517 ZPO).

### Wichtige Hinweise:
- Die Frist beginnt mit der **Zustellung** des vollstandigen Urteils
- Bei fehlender oder fehlerhafter Rechtsmittelbelehrung gilt eine Frist von **einem Jahr**
- Die Berufungsschrift muss innerhalb der Frist beim Berufungsgericht eingehen

**Quellen:**
[1] justiz.de: https://www.justiz.de/fristen/berufung (abgerufen am 05.02.2026)
`,
};

/**
 * Example 2: Search for legal procedure
 *
 * User asks: "How do I register a company in Germany?"
 */
const EXAMPLE_PROCEDURE_SEARCH = {
  input: {
    query: 'GmbH Grundung Anmeldung Handelsregister',
    category: 'procedure',
    language: 'de',
    limit: 5,
  },
  expectedOutput: {
    query: 'GmbH Grundung Anmeldung Handelsregister',
    category: 'procedure',
    resultCount: 5,
    results: [
      {
        title: 'GmbH grunden: Schritt-fur-Schritt-Anleitung',
        snippet: 'Die GmbH-Grundung erfordert: 1. Gesellschaftsvertrag, 2. Notarielle Beurkundung, 3. Handelsregisteranmeldung, 4. Gewerbeanmeldung...',
        url: 'https://www.service-bw.de/verfahren/gmbh-gruendung',
        source: 'service-bw.de',
        publishedDate: '2025-09-01T00:00:00Z',
        relevanceScore: 0.92,
      },
    ],
    citations: [
      {
        index: 1,
        source: 'service-bw.de',
        url: 'https://www.service-bw.de/verfahren/gmbh-gruendung',
        title: 'GmbH grunden: Schritt-fur-Schritt-Anleitung',
        accessedAt: '2026-02-05T10:00:00Z',
      },
    ],
    searchMeta: {
      provider: 'brave',
      searchTime: 189,
      timestamp: '2026-02-05T10:00:00Z',
    },
  },
};

/**
 * Example 3: Search for legal definition
 *
 * User asks: "What does 'Vorsatz' mean in German criminal law?"
 */
const EXAMPLE_DEFINITION_SEARCH = {
  input: {
    query: 'Vorsatz Definition Strafrecht',
    category: 'definition',
    language: 'de',
    limit: 3,
  },
  expectedOutput: {
    query: 'Vorsatz Definition Strafrecht',
    category: 'definition',
    resultCount: 3,
    results: [
      {
        title: 'Vorsatz - Rechtslexikon',
        snippet: 'Vorsatz ist das Wissen und Wollen der Tatbestandsverwirklichung. Man unterscheidet: Absicht (dolus directus 1. Grades), direkter Vorsatz...',
        url: 'https://www.rechtslexikon.net/vorsatz',
        source: 'rechtslexikon.net',
        publishedDate: null,
        relevanceScore: 0.98,
      },
    ],
    citations: [
      {
        index: 1,
        source: 'rechtslexikon.net',
        url: 'https://www.rechtslexikon.net/vorsatz',
        title: 'Vorsatz - Rechtslexikon',
        accessedAt: '2026-02-05T10:00:00Z',
      },
    ],
    searchMeta: {
      provider: 'mock',
      searchTime: 45,
      timestamp: '2026-02-05T10:00:00Z',
    },
  },
};

/**
 * Example: How to use webSearch in agent code
 */
async function exampleUsageInAgent(agentEngine, policy) {
  // 1. Call the webSearch tool like any other READ tool
  const result = await agentEngine.callTool(
    'webSearch',
    {
      query: 'Kundigungsfrist Arbeitsvertrag Deutschland',
      category: 'legal',
      language: 'de',
      limit: 5,
    },
    policy,
    {} // context
  );

  // 2. Result includes data and citations
  console.log('Results:', result.result.resultCount);
  console.log('Provider:', result.result.searchMeta.provider);

  // 3. Format citations for response
  const { formatCitations } = require('./webSearch.normalizer');
  const citationText = formatCitations(result.result.citations, 'numbered');

  console.log('Citations:');
  console.log(citationText);

  // 4. Build agent response with citations
  const response = buildResponseWithCitations(result.result);
  return response;
}

/**
 * Build a response with properly formatted citations
 */
function buildResponseWithCitations(searchResult) {
  const { results, citations } = searchResult;

  // Build response sections
  const sections = results.map((r, i) => ({
    title: r.title,
    content: r.snippet,
    citationIndex: i + 1,
  }));

  // Format citation footnotes
  const footnotes = citations.map(c =>
    `[${c.index}] ${c.source}: ${c.url} (abgerufen am ${formatDate(c.accessedAt)})`
  ).join('\n');

  return {
    sections,
    footnotes,
    disclaimer: 'Diese Informationen wurden aus offentlich zuganglichen Quellen abgerufen und ersetzen keine Rechtsberatung.',
  };
}

/**
 * Format date for German locale
 */
function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Example: Agent plan using webSearch
 */
const EXAMPLE_PLAN_WITH_WEBSEARCH = {
  planId: 'plan_websearch_001',
  query: 'Was ist die Frist fur eine Kundigungsschutzklage?',
  steps: [
    {
      stepId: 'step_001',
      type: 'tool_call',
      tool: 'webSearch',
      params: {
        query: 'Kundigungsschutzklage Frist 3 Wochen § 4 KSchG',
        category: 'deadline',
        language: 'de',
        limit: 5,
      },
      purpose: 'Search for statutory deadline information',
    },
    {
      stepId: 'step_002',
      type: 'synthesis',
      purpose: 'Combine search results into answer with citations',
      citationRequired: true,
    },
  ],
  expectedOutput: {
    type: 'explanation',
    mustInclude: ['citations', 'disclaimer'],
  },
};

// Export examples for testing
module.exports = {
  EXAMPLE_DEADLINE_SEARCH,
  EXAMPLE_PROCEDURE_SEARCH,
  EXAMPLE_DEFINITION_SEARCH,
  EXAMPLE_PLAN_WITH_WEBSEARCH,
  exampleUsageInAgent,
  buildResponseWithCitations,
  formatDate,
};
