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
  const normalizedStatus = typeof status === 'string' ? status.trim() : status;
  const statusKey = statusKeyMap[normalizedStatus];

  if (!namespace || !statusKey) {
    return normalizedStatus || '';
  }

  // Try existing translation locations before falling back
  const translationPaths = [
    `detail.quickActions.status.${statusKey}`,
    `detail.status.${statusKey}`,
    `table.status.${statusKey}`,
    `status.${statusKey}`,
  ];

  for (const key of translationPaths) {
    const translated = t(key, { ns: namespace, defaultValue: key });
    if (translated !== key) {
      return translated;
    }
  }

  // Fallback to original value if no translation found
  return normalizedStatus;
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
    'commercial law': 'commercialLaw',
    'family law': 'familyLaw',
    'criminal law': 'criminalLaw',
    'labor law': 'laborLaw',
    'real estate law': 'realEstateLaw',
    'administrative law': 'administrativeLaw',
    'tax law': 'taxLaw'
  };

  const normalizedCategory = typeof category === 'string' ? category.trim() : category;
  const lookupKey = typeof normalizedCategory === 'string'
    ? normalizedCategory.toLowerCase()
    : normalizedCategory;
  const categoryKey = categoryKeyMap[lookupKey];

  if (categoryKey) {
    return t(`detail.category.options.${categoryKey}`, { ns: 'dossiers', defaultValue: normalizedCategory });
  }

  // Fallback to original value if it's a custom category
  return normalizedCategory;
}

/**
 * Translate mission status values
 * @param {string} status - Raw status value (e.g., "Planned", "In Progress")
 * @param {function} t - i18next translation function
 * @returns {string} Translated status or original value if no translation found
 */
export function translateMissionStatus(status, t) {
  if (!status) return '';

  // Map status values to translation keys (camelCase)
  const statusKeyMap = {
    'Planned': 'planned',
    'Scheduled': 'scheduled',
    'In Progress': 'inProgress',
    'Completed': 'completed',
    'Cancelled': 'cancelled'
  };

  const normalizedStatus = typeof status === 'string' ? status.trim() : status;
  const statusKey = statusKeyMap[normalizedStatus];

  if (!statusKey) {
    return normalizedStatus || '';
  }

  // Try existing translation locations
  const translationPaths = [
    `detail.quickActions.status.${statusKey}`,
    `detail.overview.statuses.${statusKey}`,
    `form.options.status.${statusKey}`,
  ];

  for (const key of translationPaths) {
    const translated = t(key, { ns: 'missions', defaultValue: key });
    if (translated !== key) {
      return translated;
    }
  }

  // Fallback to original value
  return normalizedStatus;
}

/**
 * Translate mission priority values
 * @param {string} priority - Raw priority value (e.g., "High", "Medium", "Low")
 * @param {function} t - i18next translation function
 * @returns {string} Translated priority or original value if no translation found
 */
export function translateMissionPriority(priority, t) {
  if (!priority) return '';

  // Map priority values to translation keys (camelCase)
  const priorityKeyMap = {
    'Low': 'low',
    'Medium': 'medium',
    'High': 'high',
    'Urgent': 'urgent'
  };

  const normalizedPriority = typeof priority === 'string' ? priority.trim() : priority;
  const priorityKey = priorityKeyMap[normalizedPriority];

  if (!priorityKey) {
    return normalizedPriority || '';
  }

  // Try existing translation locations
  const translationPaths = [
    `detail.quickActions.priority.${priorityKey}`,
    `detail.overview.priorities.${priorityKey}`,
  ];

  for (const key of translationPaths) {
    const translated = t(key, { ns: 'missions', defaultValue: key });
    if (translated !== key) {
      return translated;
    }
  }

  // Fallback to original value
  return normalizedPriority;
}

/**
 * Translate mission type values
 * @param {string} missionType - Raw mission type value (e.g., "Service", "Execution")
 * @param {function} t - i18next translation function
 * @returns {string} Translated mission type or original value if no translation found
 */
export function translateMissionType(missionType, t) {
  if (!missionType) return '';

  // Map mission type values to translation keys (camelCase)
  const typeKeyMap = {
    'Service': 'service',
    'Execution': 'execution',
    'Observation': 'observation',
    'Inspection': 'inspection',
    'Seizure': 'seizure',
    'Investigation': 'investigation',
    'Other': 'other'
  };

  const normalizedType = typeof missionType === 'string' ? missionType.trim() : missionType;
  const typeKey = typeKeyMap[normalizedType];

  if (!typeKey) {
    // Return the custom value as-is if not in the standard list
    return normalizedType || '';
  }

  // Try existing translation locations
  const translationPaths = [
    `detail.overview.missionTypes.${typeKey}`,
    `form.options.missionType.${normalizedType}`,
  ];

  for (const key of translationPaths) {
    const translated = t(key, { ns: 'missions', defaultValue: key });
    if (translated !== key) {
      return translated;
    }
  }

  // Fallback to original value
  return normalizedType;
}
