const service = require('../services/documents.service');
const storage = require('../services/documentStorage');
const { parseId } = require('./_utils');

async function list(req, res, next) {
  try {
    const filters = parseEntityFilters(req.query);
    const documents = service.list(filters);
    res.json(documents);
  } catch (error) {
    next(error);
  }
}

async function count(req, res, next) {
  try {
    const filters = parseEntityFilters(req.query);
    const total = service.count(filters);
    res.json({ count: total });
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

async function upload(req, res, next) {
  try {
    const { filename, mime_type, data_base64 } = req.body || {};
    if (!filename) {
      return res.status(400).json({ message: 'filename is required' });
    }
    if (!data_base64) {
      return res.status(400).json({ message: 'data_base64 is required' });
    }
    const result = storage.saveUploadedDocument({
      originalName: filename,
      mimeType: mime_type,
      dataBase64: data_base64,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'file_too_large') {
      return res.status(413).json({ message: 'File too large' });
    }
    if (error.code === 'missing_file_data') {
      return res.status(400).json({ message: 'Missing file data' });
    }
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

function parseEntityFilters(query = {}) {
  const filters = {};
  if (query.client_id) filters.client_id = parseInt(query.client_id, 10);
  if (query.dossier_id) filters.dossier_id = parseInt(query.dossier_id, 10);
  if (query.lawsuit_id) filters.lawsuit_id = parseInt(query.lawsuit_id, 10);
  if (query.mission_id) filters.mission_id = parseInt(query.mission_id, 10);
  if (query.task_id) filters.task_id = parseInt(query.task_id, 10);
  if (query.session_id) filters.session_id = parseInt(query.session_id, 10);
  if (query.personal_task_id)
    filters.personal_task_id = parseInt(query.personal_task_id, 10);
  if (query.financial_entry_id)
    filters.financial_entry_id = parseInt(query.financial_entry_id, 10);
  if (query.officer_id) filters.officer_id = parseInt(query.officer_id, 10);
  return filters;
}

module.exports = {
  list,
  count,
  get,
  create,
  upload,
  update,
  remove,
};

