const service = require('../services/lawsuits.service');
const { parseId } = require('./_utils');
const { enforceDomainMutation } = require("./_domainMutation");

async function list(req, res, next) {
  try {
    const lawsuits = service.list();
    res.json(lawsuits);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const lawsuit = service.get(id);
    if (!lawsuit) return res.status(404).json({ message: 'Lawsuit not found' });
    res.json(lawsuit);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    console.log('[lawsuits.controller] Received payload:', JSON.stringify(req.body, null, 2));
    enforceDomainMutation({ entityType: "lawsuit", operation: "create", payload: req.body, service });
    const lawsuit = service.create(req.body);
    res.status(201).json(lawsuit);
  } catch (error) {
    console.error('[lawsuits.controller] Create error:', error.message);
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    enforceDomainMutation({ entityType: "lawsuit", operation: "update", entityId: id, payload: req.body, service });
    const lawsuit = service.update(id, req.body);
    if (!lawsuit) return res.status(404).json({ message: 'Lawsuit not found' });
    res.json(lawsuit);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Lawsuit not found' });
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
