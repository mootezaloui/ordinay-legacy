const service = require('../services/history.service');
const { parseId } = require('./_utils');

async function list(req, res, next) {
  try {
    const { entity_type, entity_id } = req.query;
    const filters = {};
    if (entity_type) filters.entity_type = entity_type;
    if (entity_id !== undefined) filters.entity_id = parseId(entity_id);
    const events = service.list(filters);
    res.json(events);
  } catch (error) {
    next(error);
  }
}

async function count(req, res, next) {
  try {
    const { entity_type, entity_id } = req.query;
    const filters = {};
    if (entity_type) filters.entity_type = entity_type;
    if (entity_id !== undefined) filters.entity_id = parseId(entity_id);
    const total = service.count(filters);
    res.json({ count: total });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const event = service.create(req.body);
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const deleted = service.remove(id);
    if (!deleted) {
      return res.status(404).json({ message: "History event not found" });
    }
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
}

async function deleteByEntity(req, res, next) {
  try {
    const { entity_type, entity_id } = req.query;
    if (!entity_type || entity_id === undefined) {
      return res.status(400).json({ message: "entity_type and entity_id are required" });
    }
    const deletedCount = service.deleteByEntity(entity_type, parseId(entity_id));
    return res.status(200).json({ message: `Deleted ${deletedCount} history entries`, deletedCount });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  count,
  create,
  remove,
  deleteByEntity,
};
