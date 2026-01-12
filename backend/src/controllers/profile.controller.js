const service = require('../services/profile.service');

/**
 * GET /api/profile/stats
 * Get profile statistics (active dossiers, total clients, resolved dossiers, success rate)
 */
function getStats(req, res, next) {
  try {
    const stats = service.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
};
