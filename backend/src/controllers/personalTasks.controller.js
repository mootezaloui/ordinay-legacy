const service = require("../services/personalTasks.service");
const { parseId } = require("./_utils");

async function list(req, res, next) {
  try {
    const tasks = service.list();
    res.json(tasks);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const task = service.get(id);
    if (!task)
      return res.status(404).json({ message: "Personal task not found" });
    res.json(task);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    console.log(
      "[personalTasks.controller] Received payload:",
      JSON.stringify(req.body, null, 2)
    );
    const task = service.create(req.body);
    res.status(201).json(task);
  } catch (error) {
    console.error("[personalTasks.controller] Create error:", error.message);
    next(error);
  }
}

async function update(req, res, next) {
  try {
    console.log(
      "[personalTasks.controller] Update request body:",
      JSON.stringify(req.body, null, 2)
    );
    const id = parseId(req.params.id);
    const task = service.update(id, req.body);
    if (!task)
      return res.status(404).json({ message: "Personal task not found" });
    res.json(task);
  } catch (error) {
    console.error("[personalTasks.controller] Update error:", error.message);
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed)
      return res.status(404).json({ message: "Personal task not found" });
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
