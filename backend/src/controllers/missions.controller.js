const service = require('../services/missions.service');
const { parseId } = require('./_utils');
const { enforceDomainMutation } = require("./_domainMutation");

async function list(req, res, next) {
  try {
    const missions = service.list();
    res.json(missions);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const mission = service.get(id);
    if (!mission) return res.status(404).json({ message: 'Mission not found' });
    res.json(mission);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    console.log('[missions.controller] Received payload:', JSON.stringify(req.body, null, 2));
    enforceDomainMutation({ entityType: "mission", operation: "create", payload: req.body, service });
    const mission = service.create(req.body);
    res.status(201).json(mission);
  } catch (error) {
    console.error('[missions.controller] Create error:', error.message);
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    enforceDomainMutation({ entityType: "mission", operation: "update", entityId: id, payload: req.body, service });
    const mission = service.update(id, req.body);
    if (!mission) return res.status(404).json({ message: 'Mission not found' });
    res.json(mission);
  } catch (error) {
    next(error);
  }
}

async function getDeleteImpact(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const impact = service.getDeleteImpact(id);
    if (!impact) return res.status(404).json({ message: 'Mission not found' });
    res.json(impact);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Mission not found' });
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
  getDeleteImpact,
};
