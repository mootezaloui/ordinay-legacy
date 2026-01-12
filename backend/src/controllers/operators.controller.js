const service = require('../services/operators.service');

/**
 * GET /api/operators/current
 * Get the current operator (for MVP, always returns the single active operator)
 */
function getCurrent(req, res, next) {
  try {
    const operator = service.getCurrentOperator();
    res.json(operator);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/operators
 * List all operators
 */
function list(req, res, next) {
  try {
    const operators = service.list();
    res.json(operators);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/operators/:id
 * Get operator by id
 */
function get(req, res, next) {
  try {
    const operator = service.getById(req.params.id);
    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }
    res.json(operator);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/operators/:id
 * Update operator profile
 * This is identity management, NOT authentication
 */
function update(req, res, next) {
  try {
    const operatorId = req.params.id;
    const updates = req.body;

    const updated = service.update(operatorId, updates);

    if (!updated) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCurrent,
  list,
  get,
  update,
};
