const service = require('../services/officers.service');
const { parseId } = require('./_utils');
const { enforceDomainMutation } = require("./_domainMutation");

async function list(req, res, next) {
  try {
    const officers = service.list();
    res.json(officers);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const officer = service.get(id);
    if (!officer) return res.status(404).json({ message: 'Officer not found' });
    res.json(officer);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    console.log('[officers.controller] Received payload:', JSON.stringify(req.body, null, 2));
    enforceDomainMutation({ entityType: "officer", operation: "create", payload: req.body, service });
    const officer = service.create(req.body);
    res.status(201).json(officer);
  } catch (error) {
    console.error('[officers.controller] Create error:', error.message);
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    enforceDomainMutation({ entityType: "officer", operation: "update", entityId: id, payload: req.body, service });
    const officer = service.update(id, req.body);
    if (!officer) return res.status(404).json({ message: 'Officer not found' });
    res.json(officer);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Officer not found' });
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
