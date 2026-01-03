/**
 * Entity Translations Utility
 * Centralized helper functions to translate entity-related values like status and categories
 * This ensures consistent translation across all aggregated tabs
 */

/**
 * Translate status values based on entity type
 * @param {string} status - Raw status value (e.g., "Open", "In Progress")
 * @param {string} aggregationType - Entity type (e.g., "dossiers", "cases", "sessions")
 * @param {function} t - i18next translation function
 * @returns {string} Translated status or original value if no translation found
 */
export function translateStatus(status, aggregationType, t) {
  if (!status) return '';

  // Define namespace mapping for each entity type
  const namespaceMap = {
    'dossiers': 'dossiers',
    'cases': 'cases',
    'sessions': 'sessions',
    'tasks': 'tasks',
    'missions': 'missions',
    'personalTasks': 'personalTasks'
  };

  // Map status values to translation keys (camelCase)
  const statusKeyMap = {
    'Open': 'open',
    'In Progress': 'inProgress',
    'On Hold': 'onHold',
    'Closed': 'closed',
    'Pending': 'pending',
    'Completed': 'completed',
    'Cancelled': 'cancelled',
    'Scheduled': 'scheduled'
  };

  const namespace = namespaceMap[aggregationType];
  const statusKey = statusKeyMap[status];

  if (namespace && statusKey) {
    return t(`status.${statusKey}`, { ns: namespace, defaultValue: status });
  }

  // Fallback to original value if no translation found
  return status;
}

/**
 * Translate category values for dossiers
 * @param {string} category - Raw category value (e.g., "Criminal Law")
 * @param {function} t - i18next translation function
 * @returns {string} Translated category or original value if no translation found
 */
export function translateCategory(category, t) {
  if (!category) return '';

  // Map category values to translation keys
  const categoryKeyMap = {
    'Criminal Law': 'criminalLaw',
    'Commercial Law': 'commercialLaw',
    'Family Law': 'familyLaw',
    'Labor Law': 'laborLaw',
    'Real Estate Law': 'realEstateLaw',
    'Administrative Law': 'administrativeLaw',
    'Tax Law': 'taxLaw'
  };

  const categoryKey = categoryKeyMap[category];

  if (categoryKey) {
    return t(`detail.category.options.${categoryKey}`, { ns: 'dossiers', defaultValue: category });
  }

  // Fallback to original value if it's a custom category
  return category;
}
