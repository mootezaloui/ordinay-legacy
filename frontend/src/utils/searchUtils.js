/**
 * Global search utilities.
 * All data must be provided explicitly (no mock or in-memory fallbacks).
 */

/**
 * Search all data across all entities
 * Returns categorized results
 */
export function searchAllData(query, data = {}) {
  if (!query || query.trim().length === 0) {
    return null;
  }

  const searchTerm = query.toLowerCase().trim();
  const {
    clients = [],
    dossiers = [],
    tasks = [],
    lawsuits = [],
    sessions = [],
    officers = [],
    accounting = [],
  } = data;

  return {
    clients: searchClients(searchTerm, clients),
    dossiers: searchDossiers(searchTerm, dossiers),
    tasks: searchTasks(searchTerm, tasks),
    lawsuits: searchCases(searchTerm, lawsuits),
    sessions: searchSessions(searchTerm, sessions),
    officers: searchOfficers(searchTerm, officers),
    accounting: searchAccounting(searchTerm, accounting),
  };
}

function searchClients(query, clients) {
  return clients.filter((client) => {
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

function searchDossiers(query, dossiers) {
  return dossiers.filter((dossier) => {
    return (
      dossier.lawsuitNumber?.toLowerCase().includes(query) ||
      dossier.title?.toLowerCase().includes(query) ||
      dossier.client?.toLowerCase().includes(query) ||
      dossier.category?.toLowerCase().includes(query) ||
      dossier.adversaryParty?.toLowerCase().includes(query) ||
      dossier.description?.toLowerCase().includes(query)
    );
  });
}

function searchTasks(query, tasks) {
  return tasks.filter((task) => {
    return (
      task.title?.toLowerCase().includes(query) ||
      task.assignedTo?.toLowerCase().includes(query) ||
      task.dossier?.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query)
    );
  });
}

function searchCases(query, lawsuits) {
  return lawsuits.filter((caseItem) => {
    return (
      caseItem.lawsuitNumber?.toLowerCase().includes(query) ||
      caseItem.title?.toLowerCase().includes(query) ||
      caseItem.dossier?.toLowerCase().includes(query) ||
      caseItem.court?.toLowerCase().includes(query)
    );
  });
}

function searchSessions(query, sessions) {
  return sessions.filter((session) => {
    return (
      session.title?.toLowerCase().includes(query) ||
      session.type?.toLowerCase().includes(query) ||
      session.location?.toLowerCase().includes(query)
    );
  });
}

function searchOfficers(query, officers) {
  return officers.filter((officer) => {
    return (
      officer.name?.toLowerCase().includes(query) ||
      officer.specialization?.toLowerCase().includes(query) ||
      officer.location?.toLowerCase().includes(query) ||
      officer.phone?.toLowerCase().includes(query) ||
      officer.email?.toLowerCase().includes(query)
    );
  });
}

function searchAccounting(query, entries) {
  return entries.filter((invoice) => {
    return (
      invoice.invoiceNumber?.toLowerCase().includes(query) ||
      invoice.client?.toLowerCase().includes(query) ||
      invoice.type?.toLowerCase().includes(query)
    );
  });
}

export function getTotalResultsCount(results) {
  if (!results) return 0;

  return Object.values(results).reduce((total, categoryResults) => {
    return (
      total + (Array.isArray(categoryResults) ? categoryResults.length : 0)
    );
  }, 0);
}

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

export function getRecentSearches() {
  try {
    const recent = localStorage.getItem("recentSearches");
    return recent ? JSON.parse(recent) : [];
  } catch (error) {
    return [];
  }
}

export function saveRecentSearch(query) {
  try {
    const recent = getRecentSearches();
    const updated = [query, ...recent.filter((q) => q !== query)].slice(0, 5);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save recent search:", error);
  }
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem("recentSearches");
  } catch (error) {
    console.error("Failed to clear recent searches:", error);
  }
}


