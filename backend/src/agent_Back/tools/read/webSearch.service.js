'use strict';

/**
 * Web Search Service
 *
 * Executes web searches via configured providers.
 * Supports multiple backends: MCP, Brave API, Tavily API, or mock.
 *
 * PROVIDER PRIORITY:
 * 1. MCP server (if connected)
 * 2. Brave Search API (if API key configured)
 * 3. Tavily API (if API key configured)
 * 4. Mock/fallback (for development)
 */

/**
 * Environment configuration
 */
const SEARCH_PROVIDER = process.env.SEARCH_PROVIDER || 'mock';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_API_URL = process.env.BRAVE_API_URL || 'https://api.search.brave.com/res/v1/web/search';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_API_URL = process.env.TAVILY_API_URL || 'https://api.tavily.com/search';
const SEARCH_TIMEOUT = parseInt(process.env.SEARCH_TIMEOUT || '10000', 10);

/**
 * Execute web search via configured provider
 * @param {Object} options - Search options
 * @param {string} options.query - Search query
 * @param {string} options.category - Search category
 * @param {string} options.language - Language code
 * @param {number} options.limit - Result limit
 * @returns {Promise<Object>} Search results
 */
async function executeWebSearch({ query, category, language, limit }) {
  const startTime = Date.now();

  let results;
  let provider;

  // Select provider based on configuration
  if (SEARCH_PROVIDER === 'brave' && BRAVE_API_KEY) {
    results = await searchBrave({ query, language, limit });
    provider = 'brave';
  } else if (SEARCH_PROVIDER === 'tavily' && TAVILY_API_KEY) {
    results = await searchTavily({ query, category, limit });
    provider = 'tavily';
  } else {
    results = await searchMock({ query, category, language, limit });
    provider = 'mock';
  }

  return {
    ...results,
    provider,
    searchTime: Date.now() - startTime,
  };
}

/**
 * Search via Brave Search API
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Results
 */
async function searchBrave({ query, language, limit }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

  try {
    const params = new URLSearchParams({
      q: query,
      count: limit.toString(),
      search_lang: language,
      safesearch: 'moderate',
    });

    const response = await fetch(`${BRAVE_API_URL}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform Brave response format
    return {
      results: (data.web?.results || []).map(r => ({
        title: r.title,
        snippet: r.description,
        url: r.url,
        publishedDate: r.page_age,
      })),
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Search timeout');
    }
    throw error;
  }
}

/**
 * Search via Tavily API
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Results
 */
async function searchTavily({ query, category, limit }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

  try {
    // Map category to Tavily search depth
    const searchDepth = category === 'legal' ? 'advanced' : 'basic';

    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: searchDepth,
        max_results: limit,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform Tavily response format
    return {
      results: (data.results || []).map(r => ({
        title: r.title,
        snippet: r.content,
        url: r.url,
        publishedDate: r.published_date,
      })),
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Search timeout');
    }
    throw error;
  }
}

/**
 * Mock search for development/testing
 * Returns realistic but static results
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Mock results
 */
async function searchMock({ query, category, language, limit }) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // Generate mock results based on category
  const mockResults = generateMockResults(query, category, language, limit);

  return {
    results: mockResults,
  };
}

/**
 * Generate mock search results
 * @param {string} query - Search query
 * @param {string} category - Search category
 * @param {string} language - Language
 * @param {number} limit - Result limit
 * @returns {Object[]} Mock results
 */
function generateMockResults(query, category, language, limit) {
  const templates = getMockTemplates(category, language);

  return templates.slice(0, limit).map((template, index) => ({
    title: template.title.replace('{query}', query),
    snippet: template.snippet.replace('{query}', query),
    url: template.url,
    publishedDate: new Date(Date.now() - index * 86400000).toISOString(),
  }));
}

/**
 * Get mock result templates by category
 * @param {string} category - Category
 * @param {string} language - Language
 * @returns {Object[]} Templates
 */
function getMockTemplates(category, language) {
  const isGerman = language === 'de';

  const templates = {
    legal: [
      {
        title: isGerman ? 'Rechtsprechung zu {query}' : 'Case law on {query}',
        snippet: isGerman
          ? 'Aktuelle Urteile und Rechtsprechung zum Thema {query}. Wichtige Entscheidungen des BGH und der Oberlandesgerichte.'
          : 'Current rulings and case law on {query}. Important decisions from federal and appellate courts.',
        url: 'https://www.bundesgerichtshof.de/example',
      },
      {
        title: isGerman ? 'Gesetzliche Regelungen: {query}' : 'Legal regulations: {query}',
        snippet: isGerman
          ? 'Gesetzestexte und Kommentare zu {query}. Aktuelle Fassung und relevante Anderungen.'
          : 'Statutory texts and commentary on {query}. Current version and relevant amendments.',
        url: 'https://www.gesetze-im-internet.de/example',
      },
    ],
    deadline: [
      {
        title: isGerman ? 'Fristen fur {query}' : 'Deadlines for {query}',
        snippet: isGerman
          ? 'Wichtige Fristen und Termine fur {query}. Ubersicht der einzuhaltenden Zeitraume und Stichtage.'
          : 'Important deadlines and dates for {query}. Overview of applicable time periods and due dates.',
        url: 'https://www.justiz.de/fristen/example',
      },
      {
        title: isGerman ? 'Fristberechnung: {query}' : 'Deadline calculation: {query}',
        snippet: isGerman
          ? 'Anleitung zur Fristberechnung bei {query}. Gesetzliche Grundlagen und Berechnungsbeispiele.'
          : 'Guide to deadline calculation for {query}. Legal basis and calculation examples.',
        url: 'https://www.anwalt.de/fristen/example',
      },
    ],
    procedure: [
      {
        title: isGerman ? 'Verfahrensablauf: {query}' : 'Procedure guide: {query}',
        snippet: isGerman
          ? 'Schritt-fur-Schritt-Anleitung zum Verfahren bei {query}. Erforderliche Unterlagen und Ablauf.'
          : 'Step-by-step guide to the procedure for {query}. Required documents and process flow.',
        url: 'https://www.service-bw.de/verfahren/example',
      },
      {
        title: isGerman ? 'Antragstellung: {query}' : 'Application process: {query}',
        snippet: isGerman
          ? 'Wie Sie einen Antrag fur {query} stellen. Formulare, Zustandigkeiten und Bearbeitungszeiten.'
          : 'How to submit an application for {query}. Forms, responsibilities, and processing times.',
        url: 'https://www.behoerdenwegweiser.de/example',
      },
    ],
    definition: [
      {
        title: isGerman ? 'Definition: {query}' : 'Definition: {query}',
        snippet: isGerman
          ? 'Rechtliche Definition und Bedeutung von {query}. Verwendung im juristischen Kontext.'
          : 'Legal definition and meaning of {query}. Usage in legal context.',
        url: 'https://www.rechtslexikon.net/example',
      },
      {
        title: isGerman ? 'Was bedeutet {query}?' : 'What does {query} mean?',
        snippet: isGerman
          ? 'Erklarung des Begriffs {query}. Herkunft, Bedeutung und praktische Anwendung.'
          : 'Explanation of the term {query}. Origin, meaning, and practical application.',
        url: 'https://www.juraforum.de/lexikon/example',
      },
    ],
    general: [
      {
        title: isGerman ? 'Informationen zu {query}' : 'Information on {query}',
        snippet: isGerman
          ? 'Umfassende Informationen zum Thema {query}. Aktuelle Nachrichten und Hintergrunde.'
          : 'Comprehensive information on {query}. Current news and background.',
        url: 'https://www.example.de/info',
      },
      {
        title: isGerman ? 'Aktuelles: {query}' : 'Latest on {query}',
        snippet: isGerman
          ? 'Aktuelle Entwicklungen und Neuigkeiten zu {query}. Stand der Dinge und Ausblick.'
          : 'Current developments and news on {query}. State of affairs and outlook.',
        url: 'https://www.news.de/example',
      },
    ],
  };

  return templates[category] || templates.general;
}

/**
 * Check if search API is configured
 * @returns {Object} Configuration status
 */
function getSearchConfig() {
  return {
    provider: SEARCH_PROVIDER,
    braveConfigured: !!BRAVE_API_KEY,
    tavilyConfigured: !!TAVILY_API_KEY,
    timeout: SEARCH_TIMEOUT,
  };
}

module.exports = {
  executeWebSearch,
  searchBrave,
  searchTavily,
  searchMock,
  getSearchConfig,
};
