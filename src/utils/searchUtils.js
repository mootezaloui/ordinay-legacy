/**
 * searchUtils.js
 * Utility functions for global search across all entities
 */

import { 
  mockClients, 
  mockDossiers, 
  mockTasks, 
  mockCases, 
  mockSessions,
  mockOfficers,
  mockAccounting
} from "./mockData";

/**
 * Search all data across all entities
 * Returns categorized results
 */
export function searchAllData(query) {
  if (!query || query.trim().length === 0) {
    return null;
  }

  const searchTerm = query.toLowerCase().trim();

  return {
    clients: searchClients(searchTerm),
    dossiers: searchDossiers(searchTerm),
    tasks: searchTasks(searchTerm),
    cases: searchCases(searchTerm),
    sessions: searchSessions(searchTerm),
    officers: searchOfficers(searchTerm),
    accounting: searchAccounting(searchTerm),
  };
}

/**
 * Search clients
 * Searches: name, email, phone, cin, profession, company
 */
function searchClients(query) {
  return mockClients.filter(client => {
    return (
      client.name?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.toLowerCase().includes(query) ||
      client.cin?.toLowerCase().includes(query) ||
      client.profession?.toLowerCase().includes(query) ||
      client.company?.toLowerCase().includes(query)
    );
  });
}

/**
 * Search dossiers
 * Searches: caseNumber, title, client, category, adversaryParty
 */
function searchDossiers(query) {
  return mockDossiers.filter(dossier => {
    return (
      dossier.caseNumber?.toLowerCase().includes(query) ||
      dossier.title?.toLowerCase().includes(query) ||
      dossier.client?.toLowerCase().includes(query) ||
      dossier.category?.toLowerCase().includes(query) ||
      dossier.adversaryParty?.toLowerCase().includes(query) ||
      dossier.description?.toLowerCase().includes(query)
    );
  });
}

/**
 * Search tasks
 * Searches: title, assignedTo, dossier, description
 */
function searchTasks(query) {
  return mockTasks.filter(task => {
    return (
      task.title?.toLowerCase().includes(query) ||
      task.assignedTo?.toLowerCase().includes(query) ||
      task.dossier?.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query)
    );
  });
}

/**
 * Search cases (proceedings)
 * Searches: caseNumber, title, dossier, court
 */
function searchCases(query) {
  return mockCases.filter(caseItem => {
    return (
      caseItem.caseNumber?.toLowerCase().includes(query) ||
      caseItem.title?.toLowerCase().includes(query) ||
      caseItem.dossier?.toLowerCase().includes(query) ||
      caseItem.court?.toLowerCase().includes(query)
    );
  });
}

/**
 * Search sessions
 * Searches: title, type, location
 */
function searchSessions(query) {
  return mockSessions.filter(session => {
    return (
      session.title?.toLowerCase().includes(query) ||
      session.type?.toLowerCase().includes(query) ||
      session.location?.toLowerCase().includes(query)
    );
  });
}

/**
 * Search officers
 * Searches: name, specialization, location
 */
function searchOfficers(query) {
  return mockOfficers.filter(officer => {
    return (
      officer.name?.toLowerCase().includes(query) ||
      officer.specialization?.toLowerCase().includes(query) ||
      officer.location?.toLowerCase().includes(query) ||
      officer.phone?.toLowerCase().includes(query) ||
      officer.email?.toLowerCase().includes(query)
    );
  });
}

/**
 * Search accounting/invoices
 * Searches: invoiceNumber, client, type
 */
function searchAccounting(query) {
  return mockAccounting.filter(invoice => {
    return (
      invoice.invoiceNumber?.toLowerCase().includes(query) ||
      invoice.client?.toLowerCase().includes(query) ||
      invoice.type?.toLowerCase().includes(query)
    );
  });
}

/**
 * Get total results count
 */
export function getTotalResultsCount(results) {
  if (!results) return 0;
  
  return Object.values(results).reduce((total, categoryResults) => {
    return total + (Array.isArray(categoryResults) ? categoryResults.length : 0);
  }, 0);
}

/**
 * Filter results to only show categories with results
 */
export function filterEmptyCategories(results) {
  if (!results) return null;
  
  const filtered = {};
  Object.entries(results).forEach(([category, items]) => {
    if (Array.isArray(items) && items.length > 0) {
      filtered[category] = items;
    }
  });
  
  return filtered;
}

/**
 * Get search suggestions based on recent searches
 * Can be implemented with localStorage
 */
export function getRecentSearches() {
  try {
    const recent = localStorage.getItem("recentSearches");
    return recent ? JSON.parse(recent) : [];
  } catch (error) {
    return [];
  }
}

/**
 * Save search to recent searches
 */
export function saveRecentSearch(query) {
  try {
    const recent = getRecentSearches();
    const updated = [query, ...recent.filter(q => q !== query)].slice(0, 5);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save recent search:", error);
  }
}

/**
 * Clear recent searches
 */
export function clearRecentSearches() {
  try {
    localStorage.removeItem("recentSearches");
  } catch (error) {
    console.error("Failed to clear recent searches:", error);
  }
}