const service = require('../services/documents.service');
const { parseId } = require('./_utils');

async function list(req, res, next) {
  try {
    // Extract entity filters from query parameters
    const filters = {};
    if (req.query.client_id) filters.client_id = parseInt(req.query.client_id, 10);
    if (req.query.dossier_id) filters.dossier_id = parseInt(req.query.dossier_id, 10);
    if (req.query.case_id) filters.case_id = parseInt(req.query.case_id, 10);
    if (req.query.mission_id) filters.mission_id = parseInt(req.query.mission_id, 10);
    if (req.query.task_id) filters.task_id = parseInt(req.query.task_id, 10);
    if (req.query.session_id) filters.session_id = parseInt(req.query.session_id, 10);
    if (req.query.personal_task_id) filters.personal_task_id = parseInt(req.query.personal_task_id, 10);
    if (req.query.financial_entry_id) filters.financial_entry_id = parseInt(req.query.financial_entry_id, 10);

    const documents = service.list(filters);
    res.json(documents);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const document = service.get(id);
    if (!document) return res.status(404).json({ message: 'Document not found' });
    res.json(document);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const document = service.create(req.body);
    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const document = service.update(id, req.body);
    if (!document) return res.status(404).json({ message: 'Document not found' });
    res.json(document);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const removed = service.remove(id);
    if (!removed) return res.status(404).json({ message: 'Document not found' });
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
