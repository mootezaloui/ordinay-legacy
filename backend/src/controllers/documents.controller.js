const service = require('../services/documents.service');
const storage = require('../services/documentStorage');
const documentAiSettings = require('../services/documentAiSettings.service');
const documentGenerationService = require('../services/documentGeneration/documentGeneration.service');
const extractionService = require('../services/documentExtraction.service');
const {
  getFormatGovernanceSnapshot,
} = require("../domain/documentFormatGovernance");
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
    // Non-blocking: extraction runs async, does not block the HTTP response
    extractionService.ingestDocument(document.id).catch(err => {
      console.error(`[extraction] failed for document ${document.id}:`, err.message);
    });
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

async function getFormatGovernance(req, res, next) {
  try {
    res.json(getFormatGovernanceSnapshot());
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

async function planGeneration(req, res, next) {
  try {
    const result = await documentGenerationService.planDocument(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function generate(req, res, next) {
  try {
    const result = await documentGenerationService.generateDocument(req.body || {}, {
      createdBy: req.user?.id ? String(req.user.id) : null,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'MISSING_REQUIRED_FIELDS') {
      return res.status(400).json({
        message: error.message,
        code: error.code,
        missingFields: Array.isArray(error.details) ? error.details : [],
      });
    }
    next(error);
  }
}

async function getGeneration(req, res, next) {
  try {
    const generationId = parseId(req.params.generationId);
    const generation = documentGenerationService.getGeneration(generationId);
    if (!generation) {
      return res.status(404).json({ message: 'Generation not found' });
    }
    res.json(generation);
  } catch (error) {
    next(error);
  }
}

async function generationProgress(req, res, next) {
  try {
    const generationId = parseId(req.params.generationId);
    const generation = documentGenerationService.getGeneration(generationId);
    if (!generation) {
      return res.status(404).json({ message: 'Generation not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event) => {
      res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    };

    const latest = documentGenerationService.getLatestGenerationEvent(generationId);
    if (latest) send(latest);

    const unsubscribe = documentGenerationService.subscribeGenerationEvents(
      generationId,
      send,
    );

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
      if (typeof res.flush === 'function') res.flush();
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  } catch (error) {
    next(error);
  }
}

async function download(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const document = service.get(id);
    if (!document) return res.status(404).json({ message: 'Document not found' });
    if (!document.file_path) {
      return res.status(404).json({ message: 'Document file path not found' });
    }
    const safePath = storage.resolveManagedDocumentPath(document.file_path, {
      mustExist: true,
    });
    if (!safePath) {
      return res.status(403).json({ message: 'Document path is outside managed storage' });
    }
    const filename = document.original_filename || document.title || `document-${id}`;
    res.download(safePath, filename);
  } catch (error) {
    next(error);
  }
}

async function getAiSettings(req, res, next) {
  try {
    const settings = documentAiSettings.getDocumentAiSettings();
    res.json({
      ...settings,
      document_ai_enabled: false,
      document_ai_provider: "local",
    });
  } catch (error) {
    next(error);
  }
}

async function updateAiSettings(req, res, next) {
  try {
    const patch = {
      ...(req.body || {}),
      document_ai_enabled: false,
      document_ai_provider: "local",
    };
    const updated = documentAiSettings.updateDocumentAiSettings(patch);
    res.json({
      ...updated,
      document_ai_enabled: false,
      document_ai_provider: "local",
    });
  } catch (error) {
    next(error);
  }
}

async function listAiAuditLogs(req, res, next) {
  try {
    const limit = req.query?.limit ? Number.parseInt(String(req.query.limit), 10) : 100;
    const logs = documentAiSettings.listDocumentAiAuditLogs({ limit });
    res.json({ logs });
  } catch (error) {
    next(error);
  }
}

async function search(req, res, next) {
  try {
    const { query, client_id, dossier_id, lawsuit_id, limit } = req.body || {};
    if (!query || !String(query).trim()) {
      return res.status(400).json({ message: 'query is required' });
    }
    const results = extractionService.searchChunks({
      query: String(query).trim(),
      clientId: client_id ? Number(client_id) : undefined,
      dossierId: dossier_id ? Number(dossier_id) : undefined,
      lawsuitId: lawsuit_id ? Number(lawsuit_id) : undefined,
      limit: limit ? Number(limit) : 10,
    });
    res.json({ results, count: results.length });
  } catch (error) {
    next(error);
  }
}

async function retryExtraction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const doc = service.get(id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const result = await extractionService.retryExtraction(id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function runOcr(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const doc = service.get(id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.text_status !== 'needs_ocr') {
      return res.status(400).json({ message: 'Document does not need OCR' });
    }
    const result = await extractionService.runOcr(id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function backfill(req, res, next) {
  try {
    const results = await extractionService.backfillAll();
    res.json(results);
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
  getFormatGovernance,
  planGeneration,
  generate,
  getGeneration,
  generationProgress,
  download,
  getAiSettings,
  updateAiSettings,
  listAiAuditLogs,
  update,
  remove,
  search,
  retryExtraction,
  runOcr,
  backfill,
};

