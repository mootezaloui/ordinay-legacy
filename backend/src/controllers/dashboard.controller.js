const service = require('../services/dashboard.service');

/**
 * GET /api/dashboard/summary
 * Returns aggregated dashboard metrics derived from persisted data.
 */
function getSummary(req, res, next) {
  try {
    const summary = service.getSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
};
