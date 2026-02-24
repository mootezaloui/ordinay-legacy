const service = require('../services/clients.service');
const { parseId } = require('./_utils');
const { enforceDomainMutation } = require("./_domainMutation");

async function list(req, res, next) {
  try {
    const clients = service.list();
    res.json(clients);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const client = service.get(id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    enforceDomainMutation({ entityType: "client", operation: "create", payload: req.body, service });
    const client = service.create(req.body);
    res.status(201).json(client);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    enforceDomainMutation({ entityType: "client", operation: "update", entityId: id, payload: req.body, service });
    const client = service.update(id, req.body);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Client not found' });
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
