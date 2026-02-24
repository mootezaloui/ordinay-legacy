const service = require('../services/sessions.service');
const { parseId } = require('./_utils');
const { enforceDomainMutation } = require("./_domainMutation");

async function list(req, res, next) {
  try {
    const sessions = service.list();
    res.json(sessions);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const session = service.get(id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json(session);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    console.log('[sessions.controller] Received payload:', JSON.stringify(req.body, null, 2));
    enforceDomainMutation({ entityType: "session", operation: "create", payload: req.body, service });
    const session = service.create(req.body);
    res.status(201).json(session);
  } catch (error) {
    console.error('[sessions.controller] Create error:', error.message);
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    enforceDomainMutation({ entityType: "session", operation: "update", entityId: id, payload: req.body, service });
    const session = service.update(id, req.body);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json(session);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Session not found' });
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
