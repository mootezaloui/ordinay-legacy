const db = require("../db/connection");

/**
 * Get profile statistics from real database data.
 * Returns aggregated metrics for the profile screen.
 */
function getStats() {
  // Count total clients (excluding soft-deleted)
  const totalClients = db
    .prepare(
      "SELECT COUNT(*) as count FROM clients WHERE deleted_at IS NULL AND validated = 1"
    )
    .get().count;

  // Count active dossiers (open, in_progress, on_hold)
  const activeDossiers = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM dossiers
      WHERE status IN ('open', 'in_progress', 'on_hold')
      AND deleted_at IS NULL
      AND validated = 1
    `
    )
    .get().count;

  // Count resolved dossiers (closed)
  const resolvedDossiers = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM dossiers
      WHERE status = 'closed'
      AND deleted_at IS NULL
      AND validated = 1
    `
    )
    .get().count;

  return {
    activeDossiers,
    totalClients,
    resolvedDossiers,
  };
}

module.exports = {
  getStats,
};
