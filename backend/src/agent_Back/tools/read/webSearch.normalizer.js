'use strict';

/**
 * Web Search Result Normalizer
 *
 * Normalizes search results from various providers into a consistent format.
 * Handles citation generation for compliance.
 *
 * NORMALIZATION RULES:
 * - Strip tracking parameters from URLs
 * - Truncate snippets to reasonable length
 * - Extract clean source domains
 * - Score relevance based on category match
 * - Ensure no private/authenticated URLs
 */

/**
 * Maximum snippet length (characters)
 */
const MAX_SNIPPET_LENGTH = 300;

/**
 * URL patterns that indicate private/authenticated content (blocked)
 */
const BLOCKED_URL_PATTERNS = [
  /\/login/i,
  /\/signin/i,
  /\/auth/i,
  /\/account/i,
  /\/my\//i,
  /\/private/i,
  /\/internal/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /192\.168\./i,
  /10\.\d+\./i,
];

/**
 * Tracking parameters to strip from URLs
 */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'ref',
  'source',
  'tracking',
];

/**
 * Category-specific relevance keywords
 */
const CATEGORY_KEYWORDS = {
  legal: ['gesetz', 'recht', 'urteil', 'bgb', 'stgb', 'gericht', 'anwalt', 'law', 'court', 'statute'],
  deadline: ['frist', 'termin', 'deadline', 'ablauf', 'stichtag', 'bis zum', 'due date', 'expires'],
  procedure: ['verfahren', 'antrag', 'prozess', 'schritt', 'anleitung', 'procedure', 'process', 'how to'],
  definition: ['definition', 'bedeutung', 'erklarung', 'was ist', 'what is', 'meaning', 'refers to'],
  general: [],
};

/**
 * Normalize raw search results to consistent format
 * @param {Object} rawResults - Raw results from search provider
 * @param {Object} options - Normalization options
 * @param {string} options.category - Search category
 * @param {string} options.language - Search language
 * @returns {Object[]} Normalized results
 */
function normalizeSearchResults(rawResults, { category = 'general', language = 'de' } = {}) {
  const results = rawResults.results || rawResults.items || rawResults || [];

  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((result, index) => normalizeResult(result, { category, language, index }))
    .filter(result => result !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Normalize a single search result
 * @param {Object} result - Raw result
 * @param {Object} options - Options
 * @returns {Object|null} Normalized result or null if blocked
 */
function normalizeResult(result, { category, language, index }) {
  // Extract URL
  const url = result.url || result.link || result.href;
  if (!url) return null;

  // Check for blocked patterns
  if (isBlockedUrl(url)) return null;

  // Clean URL
  const cleanUrl = cleanUrlTracking(url);

  // Extract and clean snippet
  const snippet = cleanSnippet(
    result.snippet || result.description || result.content || result.text || ''
  );

  // Extract title
  const title = cleanText(result.title || result.name || 'Untitled');

  // Extract source domain
  const source = extractSourceDomain(cleanUrl);

  // Extract published date if available
  const publishedDate = extractDate(result);

  // Calculate relevance score
  const relevanceScore = calculateRelevance({ title, snippet, category, index });

  return {
    title,
    snippet,
    url: cleanUrl,
    source,
    publishedDate,
    relevanceScore,
  };
}

/**
 * Check if URL matches blocked patterns
 * @param {string} url - URL to check
 * @returns {boolean} True if blocked
 */
function isBlockedUrl(url) {
  return BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Remove tracking parameters from URL
 * @param {string} url - Original URL
 * @returns {string} Cleaned URL
 */
function cleanUrlTracking(url) {
  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Clean and truncate snippet
 * @param {string} snippet - Raw snippet
 * @returns {string} Cleaned snippet
 */
function cleanSnippet(snippet) {
  let clean = cleanText(snippet);

  // Truncate if too long
  if (clean.length > MAX_SNIPPET_LENGTH) {
    clean = clean.substring(0, MAX_SNIPPET_LENGTH - 3) + '...';
  }

  return clean;
}

/**
 * Clean text (remove HTML, normalize whitespace)
 * @param {string} text - Raw text
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  if (!text) return '';

  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract source domain from URL
 * @param {string} url - URL
 * @returns {string} Domain name
 */
function extractSourceDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Extract published date from result
 * @param {Object} result - Raw result
 * @returns {string|null} ISO date string or null
 */
function extractDate(result) {
  const dateFields = ['publishedDate', 'date', 'published', 'datePublished', 'created'];

  for (const field of dateFields) {
    if (result[field]) {
      try {
        const date = new Date(result[field]);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Calculate relevance score based on category keywords
 * @param {Object} options - Options
 * @returns {number} Relevance score (0-1)
 */
function calculateRelevance({ title, snippet, category, index }) {
  let score = 1 - (index * 0.05); // Base score decreases by position

  // Category keyword matching
  const keywords = CATEGORY_KEYWORDS[category] || [];
  const text = `${title} ${snippet}`.toLowerCase();

  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      score += 0.1;
    }
  }

  // Cap at 1.0
  return Math.min(1, Math.max(0, score));
}

/**
 * Build citations array from normalized results
 * @param {Object[]} results - Normalized results
 * @returns {Object[]} Citations array
 */
function buildCitations(results) {
  const accessedAt = new Date().toISOString();

  return results.map((result, index) => ({
    index: index + 1,
    source: result.source,
    url: result.url,
    title: result.title,
    accessedAt,
  }));
}

/**
 * Format citations for display in response
 * @param {Object[]} citations - Citations array
 * @param {string} format - Output format ('markdown', 'text', 'numbered')
 * @returns {string} Formatted citations
 */
function formatCitations(citations, format = 'numbered') {
  if (!citations || citations.length === 0) {
    return '';
  }

  switch (format) {
    case 'markdown':
      return citations
        .map(c => `[${c.index}] [${c.title}](${c.url}) - ${c.source}`)
        .join('\n');

    case 'text':
      return citations
        .map(c => `${c.title} (${c.source}): ${c.url}`)
        .join('\n');

    case 'numbered':
    default:
      return citations
        .map(c => `[${c.index}] ${c.source}: ${c.url}`)
        .join('\n');
  }
}

module.exports = {
  normalizeSearchResults,
  normalizeResult,
  buildCitations,
  formatCitations,
  isBlockedUrl,
  cleanUrlTracking,
  cleanSnippet,
  cleanText,
  extractSourceDomain,
  calculateRelevance,
  MAX_SNIPPET_LENGTH,
  BLOCKED_URL_PATTERNS,
  CATEGORY_KEYWORDS,
};
