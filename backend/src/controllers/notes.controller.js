const service = require("../services/notes.service");
const { parseId } = require("./_utils");

function parseEntityId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("entity_id must be a positive number");
    err.status = 400;
    throw err;
  }
  return id;
}

async function list(req, res, next) {
  try {
    const { entity_type, entity_id } = req.query;
    if (!entity_type || entity_id === undefined) {
      const err = new Error("entity_type and entity_id are required query parameters");
      err.status = 400;
      throw err;
    }
    const notes = service.listByEntity(entity_type, parseEntityId(entity_id));
    res.json(notes);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const note = service.get(parseId(req.params.id));
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const note = service.create(req.body || {});
    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const note = service.update(parseId(req.params.id), req.body || {});
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const removed = service.remove(parseId(req.params.id));
    if (!removed) return res.status(404).json({ message: "Note not found" });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function bulkSave(req, res, next) {
  try {
    const { entity_type, entity_id, notes } = req.body || {};
    if (!entity_type || entity_id === undefined || !Array.isArray(notes)) {
      const err = new Error("entity_type, entity_id, and notes array are required");
      err.status = 400;
      throw err;
    }
    const saved = service.saveNotesForEntity(entity_type, parseEntityId(entity_id), notes);
    res.json(saved);
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
  bulkSave,
};
