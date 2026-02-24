const service = require('../services/dossiers.service');
const { parseId } = require('./_utils');
const { enforceDomainMutation } = require("./_domainMutation");

async function list(req, res, next) {
  try {
    const dossiers = service.list();
    res.json(dossiers);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const dossier = service.get(id);
    if (!dossier) return res.status(404).json({ message: 'Dossier not found' });
    res.json(dossier);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    enforceDomainMutation({ entityType: "dossier", operation: "create", payload: req.body, service });
    const dossier = service.create(req.body);
    res.status(201).json(dossier);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    enforceDomainMutation({ entityType: "dossier", operation: "update", entityId: id, payload: req.body, service });
    const dossier = service.update(id, req.body);
    if (!dossier) return res.status(404).json({ message: 'Dossier not found' });
    res.json(dossier);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Dossier not found' });
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
