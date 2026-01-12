const service = require('../services/cases.service');
const { parseId } = require('./_utils');

async function list(req, res, next) {
  try {
    const cases = service.list();
    res.json(cases);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const caseItem = service.get(id);
    if (!caseItem) return res.status(404).json({ message: 'Case not found' });
    res.json(caseItem);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    console.log('[cases.controller] Received payload:', JSON.stringify(req.body, null, 2));
    const caseItem = service.create(req.body);
    res.status(201).json(caseItem);
  } catch (error) {
    console.error('[cases.controller] Create error:', error.message);
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const caseItem = service.update(id, req.body);
    if (!caseItem) return res.status(404).json({ message: 'Case not found' });
    res.json(caseItem);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Case not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
};
