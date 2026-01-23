/**
 * Data mappers for notification context
 * Transform data between API and frontend formats
 */

/**
 * Map priority to valid severity (database constraint: info, warning, error)
 */
export function mapPriorityToSeverity(priority) {
  const priorityLower = (priority || '').toLowerCase();
  if (priorityLower === 'urgent' || priorityLower === 'critical' || priorityLower === 'high') {
    return 'error';
  }
  if (priorityLower === 'medium' || priorityLower === 'soon') {
    return 'warning';
  }
  // info, low, success, normal, etc.
  return 'info';
}

/**
 * Map notification type to valid entity_type (database constraint)
 */
export function mapTypeToEntityType(type) {
  const typeMap = {
    'hearing': 'session',
    'payment': 'financial_entry',
    'deadline': 'dossier',
    'proceeding': 'lawsuit',
    // Valid types that map directly
    'client': 'client',
    'dossier': 'dossier',
    'lawsuit': 'lawsuit',
    'task': 'task',
    'session': 'session',
    'mission': 'mission',
    'financial': 'financial_entry',
    'financial_entry': 'financial_entry',
    'financialEntry': 'financial_entry',
    'personal_task': 'personal_task',
    'personalTask': 'personal_task',
    'document': 'document',
    'app': 'app',
    'system': 'system',
  };
  return typeMap[type] || null;
}

/**
 * Get icon based on entity type and severity
 */
export function getIconForEntityType(entityType, severity) {
  if (!entityType) {
    return severity === "error" ? "fas fa-exclamation-circle" : "fas fa-bell";
  }

  const iconMap = {
    client: "fas fa-user",
    dossier: "fas fa-folder",
    lawsuit: "fas fa-gavel",
    task: "fas fa-tasks",
    session: "fas fa-calendar-check",
    mission: "fas fa-briefcase",
    financial_entry: "fas fa-dollar-sign",
    personal_task: "fas fa-clipboard-check",
    document: "fas fa-file-upload",
  };

  return iconMap[entityType] || "fas fa-bell";
}

/**
 * Get navigation link based on entity type and ID
 */
export function getLinkForEntity(entityType, entityId) {
  if (!entityType || !entityId) return null;

  const linkMap = {
    client: `/clients/${entityId}`,
    dossier: `/dossiers/${entityId}`,
    lawsuit: `/lawsuits/${entityId}`,
    task: `/tasks/${entityId}`,
    session: `/sessions/${entityId}`,
    mission: `/missions/${entityId}`,
    financial_entry: `/accounting/${entityId}`,
    personal_task: `/personal-tasks/${entityId}`,
    document: `/documents/${entityId}`,
  };

  return linkMap[entityType] || null;
}

/**
 * Map entity_type to notification type
 */
export function mapEntityTypeToNotificationType(entityType) {
  const typeMap = {
    'task': 'task',
    'personal_task': 'personalTask',
    'session': 'session',
    'lawsuit': 'lawsuit',
    'mission': 'mission',
    'financial_entry': 'financialEntry',
    'dossier': 'dossier',
    'client': 'client',
    'document': 'document',
  };
  return entityType ? typeMap[entityType] || 'app' : 'app';
}


