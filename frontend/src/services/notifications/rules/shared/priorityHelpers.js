/**
 * Priority mapping utilities for notification rules
 */

/**
 * Get priority weight (for frequency calculation)
 */
export function getPriorityWeight(priority) {
  const weights = {
    Haute: 3,
    High: 3,
    Urgent: 3,
    Moyenne: 2,
    Medium: 2,
    Normale: 2,
    Basse: 1,
    Low: 1,
  };
  return weights[priority] || 1;
}
