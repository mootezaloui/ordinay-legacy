'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const documentsService = require('./documents.service');
const documentStorage = require('./documentStorage');
const { resolveIngestionDocType } = require('../domain/documentFormatGovernance');
const { chunkText } = require('../agent/retrieval/chunker');
const {
  RETRIEVAL_CHUNK_SIZE,
  RETRIEVAL_CHUNK_OVERLAP,
} = require('../agent/retrieval/retrieval.policy');

// ---------------------------------------------------------------------------
// Extractors (lazy-loaded to avoid startup cost on weak machines)
// ---------------------------------------------------------------------------

let _pdfParse = null;
function getPdfParse() {
  if (!_pdfParse) _pdfParse = require('pdf-parse');
  return _pdfParse;
}

let _mammoth = null;
function getMammoth() {
  if (!_mammoth) _mammoth = require('mammoth');
  return _mammoth;
}

let _xlsx = null;
function getXlsx() {
  if (!_xlsx) _xlsx = require('xlsx');
  return _xlsx;
}

let _tesseractWorker = null;
async function getTesseractWorker() {
  if (!_tesseractWorker) {
    const { createWorker } = require('tesseract.js');
    _tesseractWorker = await createWorker('eng+fra+ara');
  }
  return _tesseractWorker;
}

let _pdfjs = null;
function getPdfjs() {
  if (!_pdfjs) _pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  return _pdfjs;
}

let _canvasModule = null;
function getCanvasModule() {
  if (!_canvasModule) _canvasModule = require('canvas');
  return _canvasModule;
}
let _createCanvas = null;
function getCreateCanvas() {
  if (!_createCanvas) _createCanvas = getCanvasModule().createCanvas;
  return _createCanvas;
}

// ---------------------------------------------------------------------------
// PDF text extraction (hybrid-aware: per-page text + OCR for image-heavy pages)
// ---------------------------------------------------------------------------

const PAGE_TEXT_THRESHOLD = 30; // chars per page — below this the page is image-heavy

async function extractPdf(filePath) {
  const pdfParse = getPdfParse();
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const totalText = (data.text || '').trim();
  const numPages = data.numpages || 0;

  // Fast path: if total text is substantial and no pages are likely scanned, use pdf-parse
  // We estimate per-page average; if high enough, skip per-page analysis
  if (totalText.length > 0 && numPages > 0 && (totalText.length / numPages) >= PAGE_TEXT_THRESHOLD) {
    return { text: totalText, needsOcr: false, pages: numPages, source: 'pdf-parse' };
  }

  // If very little text overall, check if we need hybrid or full OCR
  // Use pdfjs-dist for per-page text extraction to decide which pages need OCR
  return extractPdfHybrid(filePath, buffer, numPages);
}

async function extractPdfHybrid(filePath, buffer, numPages) {
  const pdfjs = getPdfjs();
  const pdfData = new Uint8Array(buffer);
  const canvasMod = getCanvasModule();
  const createCanvas = canvasMod.createCanvas;
  const CanvasClass = canvasMod.Canvas;

  const canvasFactory = buildNodeCanvasFactory(createCanvas);
  const pdfDoc = await pdfjs.getDocument({ data: pdfData, canvasFactory }).promise;
  const actualPages = pdfDoc.numPages;

  // Phase 1: extract text per page via pdfjs getTextContent
  const pageResults = []; // { pageNum, text, needsOcr }
  for (let i = 1; i <= actualPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str || '')
      .join(' ')
      .trim();
    pageResults.push({ pageNum: i, text: pageText, needsOcr: pageText.length < PAGE_TEXT_THRESHOLD });
  }

  const ocrPages = pageResults.filter(p => p.needsOcr);

  // If no pages need OCR, just join the text
  if (ocrPages.length === 0) {
    const text = pageResults.map(p => p.text).join('\n\n');
    return { text, needsOcr: false, pages: actualPages, source: 'pdf-parse' };
  }

  // If ALL pages need OCR, delegate to full scanned pipeline
  if (ocrPages.length === actualPages) {
    return { text: '', needsOcr: true, pages: actualPages, source: 'pdf-parse' };
  }

  // Phase 2: hybrid — OCR only the image-heavy pages
  const worker = await getTesseractWorker();
  for (const pageInfo of ocrPages) {
    const page = await pdfDoc.getPage(pageInfo.pageNum);
    const ocrText = await ocrPdfPage(page, createCanvas, CanvasClass, canvasFactory, worker);
    pageInfo.text = ocrText;
  }

  const text = pageResults.map(p => p.text).join('\n\n');
  return { text, needsOcr: false, pages: actualPages, source: 'hybrid' };
}

// ---------------------------------------------------------------------------
// DOCX text extraction
// ---------------------------------------------------------------------------

async function extractDocx(filePath) {
  const mammoth = getMammoth();
  const result = await mammoth.extractRawText({ path: filePath });
  const text = (result.value || '').trim();
  return { text, needsOcr: false, pages: null, source: 'mammoth' };
}

// ---------------------------------------------------------------------------
// XLSX text extraction
// ---------------------------------------------------------------------------

function extractXlsx(filePath) {
  const XLSX = getXlsx();
  const workbook = XLSX.readFile(filePath, { type: 'file' });

  const parts = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv && csv.trim()) {
      parts.push(`[Sheet: ${sheetName}]\n${csv.trim()}`);
    }
  }

  const text = parts.join('\n\n');
  return {
    text,
    needsOcr: false,
    pages: null,
    source: 'sheetjs',
    sheets: workbook.SheetNames,
  };
}

// ---------------------------------------------------------------------------
// Plain text extraction (txt, csv, md, json, html, rtf)
// ---------------------------------------------------------------------------

function extractPlainText(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  return { text, needsOcr: false, pages: null, source: 'native' };
}

// ---------------------------------------------------------------------------
// Image OCR (tesseract.js — PNG, JPG, TIFF, BMP)
// ---------------------------------------------------------------------------

async function extractImageOcr(filePath) {
  const worker = await getTesseractWorker();
  const { data } = await worker.recognize(filePath);
  const text = (data.text || '').trim();
  return { text, needsOcr: false, pages: null, source: 'tesseract' };
}

// ---------------------------------------------------------------------------
// Scanned PDF OCR (pdfjs-dist → canvas → tesseract.js per page)
// ---------------------------------------------------------------------------

const OCR_RENDER_SCALE = 2; // 2x for readable OCR quality

function buildNodeCanvasFactory(createCanvas) {
  return {
    create(width, height) {
      const c = createCanvas(width, height);
      return { canvas: c, context: c.getContext('2d') };
    },
    reset(pair, width, height) { pair.canvas.width = width; pair.canvas.height = height; },
    destroy(pair) { pair.canvas.width = 0; pair.canvas.height = 0; },
  };
}

async function ocrPdfPage(page, createCanvas, CanvasClass, canvasFactory, worker) {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  // Patch drawImage: pdfjs may pass internal canvas objects that node-canvas
  // rejects (instanceof check fails). Convert them via getImageData.
  const origDrawImage = ctx.drawImage.bind(ctx);
  ctx.drawImage = function (srcImg, ...args) {
    if (srcImg && typeof srcImg === 'object' && !(srcImg instanceof CanvasClass)) {
      if (typeof srcImg.getContext === 'function') {
        const tmpCtx = srcImg.getContext('2d');
        if (tmpCtx && typeof tmpCtx.getImageData === 'function') {
          const imgData = tmpCtx.getImageData(0, 0, srcImg.width, srcImg.height);
          const nc = createCanvas(srcImg.width, srcImg.height);
          nc.getContext('2d').putImageData(imgData, 0, 0);
          return origDrawImage(nc, ...args);
        }
      }
    }
    return origDrawImage(srcImg, ...args);
  };

  await page.render({ canvasContext: ctx, viewport, canvasFactory }).promise;

  const pngBuffer = canvas.toBuffer('image/png');
  const { data: ocrData } = await worker.recognize(pngBuffer);
  return (ocrData.text || '').trim();
}

async function extractScannedPdfOcr(filePath) {
  const pdfjs = getPdfjs();
  const canvasMod = getCanvasModule();
  const createCanvas = canvasMod.createCanvas;
  const CanvasClass = canvasMod.Canvas;
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);

  const canvasFactory = buildNodeCanvasFactory(createCanvas);
  const pdfDoc = await pdfjs.getDocument({ data, canvasFactory }).promise;
  const numPages = pdfDoc.numPages;
  const worker = await getTesseractWorker();
  const pageTexts = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const pageText = await ocrPdfPage(page, createCanvas, CanvasClass, canvasFactory, worker);
    if (pageText) pageTexts.push(pageText);
  }

  const text = pageTexts.join('\n\n');
  return { text, needsOcr: false, pages: numPages, source: 'tesseract-pdf' };
}

// ---------------------------------------------------------------------------
// Router — picks the right extractor
// ---------------------------------------------------------------------------

async function routeExtraction(filePath, mimeType) {
  const docType = resolveIngestionDocType({ mimeType, filePath });

  switch (docType) {
    case 'pdf':
      return extractPdf(filePath);
    case 'docx':
      return extractDocx(filePath);
    case 'xlsx':
      return extractXlsx(filePath);
    case 'text':
      return extractPlainText(filePath);
    case 'image':
      return { text: '', needsOcr: true, pages: null, source: null };
    default:
      return { text: '', needsOcr: false, pages: null, source: null, unsupported: true };
  }
}

// ---------------------------------------------------------------------------
// Chunk persistence
// ---------------------------------------------------------------------------

const INSERT_CHUNK_SQL = `
  INSERT INTO document_chunks (document_id, chunk_order, page_start, page_end, chunk_text, token_estimate, chunk_type, sheet_name, metadata_json)
  VALUES (@document_id, @chunk_order, @page_start, @page_end, @chunk_text, @token_estimate, @chunk_type, @sheet_name, @metadata_json)
`;

const DELETE_CHUNKS_SQL = `DELETE FROM document_chunks WHERE document_id = @document_id`;

function deleteChunksForDocument(documentId) {
  db.prepare(DELETE_CHUNKS_SQL).run({ document_id: documentId });
}

function saveChunks(documentId, chunks) {
  const insert = db.prepare(INSERT_CHUNK_SQL);
  const runAll = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  const rows = chunks.map((chunk, index) => ({
    document_id: documentId,
    chunk_order: index,
    page_start: chunk.metadata?.pageStart || null,
    page_end: chunk.metadata?.pageEnd || null,
    chunk_text: chunk.text,
    token_estimate: Math.ceil(chunk.text.length / 4),
    chunk_type: chunk.metadata?.chunkType || 'text',
    sheet_name: chunk.metadata?.sheetName || null,
    metadata_json: null,
  }));

  runAll(rows);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Search (FTS5)
// ---------------------------------------------------------------------------

function searchChunks({ query, clientId, dossierId, lawsuitId, limit = 10 } = {}) {
  if (!query || !String(query).trim()) return [];

  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const ftsQuery = String(query).trim().replace(/"/g, '""');

  let sql = `
    SELECT
      dc.id as chunk_id,
      dc.document_id,
      dc.chunk_order,
      dc.page_start,
      dc.page_end,
      dc.chunk_text,
      dc.sheet_name,
      dc.token_estimate,
      d.title as file_name,
      d.mime_type,
      d.original_filename,
      d.client_id,
      d.dossier_id,
      d.lawsuit_id,
      rank
    FROM fts_document_chunks fts
    JOIN document_chunks dc ON dc.id = fts.rowid
    JOIN documents d ON d.id = dc.document_id AND d.deleted_at IS NULL
    WHERE fts_document_chunks MATCH @query
  `;
  const params = { query: `"${ftsQuery}"`, limit: safeLimit };

  if (clientId) {
    sql += ` AND d.client_id = @clientId`;
    params.clientId = clientId;
  }
  if (dossierId) {
    sql += ` AND d.dossier_id = @dossierId`;
    params.dossierId = dossierId;
  }
  if (lawsuitId) {
    sql += ` AND d.lawsuit_id = @lawsuitId`;
    params.lawsuitId = lawsuitId;
  }

  sql += ` ORDER BY rank LIMIT @limit`;

  try {
    return db.prepare(sql).all(params);
  } catch (err) {
    console.error('[documentExtraction] FTS5 search error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Core ingestion pipeline
// ---------------------------------------------------------------------------

function updateExtractionState(documentId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(
    `UPDATE documents SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`
  ).run({ ...fields, id: documentId });
}

async function ingestDocument(documentId) {
  const doc = documentsService.get(documentId);
  if (!doc) {
    console.warn(`[documentExtraction] document ${documentId} not found`);
    return null;
  }

  // Skip if already extracted
  if (doc.text_status === 'readable') {
    return doc;
  }

  // Skip generated documents (they don't need extraction)
  if (doc.copy_type === 'generated') {
    return doc;
  }

  const filePath = documentStorage.resolveManagedDocumentPath(doc.file_path, {
    mustExist: true,
  });
  if (!filePath) {
    updateExtractionState(documentId, {
      text_status: 'failed',
      failure_stage: 'extraction',
      failure_detail: 'Document path is invalid or outside managed storage',
      processing_finished_at: new Date().toISOString(),
    });
    return documentsService.get(documentId);
  }

  // Mark as extracting
  updateExtractionState(documentId, {
    text_status: 'extracting',
    processing_started_at: new Date().toISOString(),
    failure_stage: null,
    failure_detail: null,
  });

  try {
    const result = await routeExtraction(filePath, doc.mime_type);

    if (result.unsupported) {
      updateExtractionState(documentId, {
        text_status: 'unreadable',
        text_source: null,
        processing_finished_at: new Date().toISOString(),
        failure_stage: 'extraction',
        failure_detail: 'Unsupported file type',
      });
      return documentsService.get(documentId);
    }

    if (result.needsOcr) {
      updateExtractionState(documentId, {
        text_status: 'needs_ocr',
        text_source: result.source || null,
        document_text: null,
        text_length: null,
        processing_finished_at: new Date().toISOString(),
      });
      return documentsService.get(documentId);
    }

    if (!result.text || !result.text.trim()) {
      updateExtractionState(documentId, {
        text_status: 'unreadable',
        text_source: result.source || null,
        document_text: null,
        text_length: null,
        processing_finished_at: new Date().toISOString(),
        failure_stage: 'extraction',
        failure_detail: 'Extraction produced empty text',
      });
      return documentsService.get(documentId);
    }

    const text = result.text;

    // Save extracted text
    updateExtractionState(documentId, {
      document_text: text,
      text_status: 'readable',
      text_source: result.source,
      text_length: text.length,
      unreadable_text: 0,
      processing_finished_at: new Date().toISOString(),
      failure_stage: null,
      failure_detail: null,
    });

    // Generate and save chunks
    try {
      deleteChunksForDocument(documentId);
      const chunks = chunkText({
        documentId: String(documentId),
        sourceId: String(documentId),
        text,
        chunkSize: RETRIEVAL_CHUNK_SIZE,
        chunkOverlap: RETRIEVAL_CHUNK_OVERLAP,
      });
      if (chunks.length > 0) {
        saveChunks(documentId, chunks);
      }
    } catch (chunkErr) {
      console.error(`[documentExtraction] chunking failed for document ${documentId}:`, chunkErr.message);
      updateExtractionState(documentId, {
        failure_stage: 'chunking',
        failure_detail: chunkErr.message,
      });
    }

    return documentsService.get(documentId);
  } catch (err) {
    console.error(`[documentExtraction] extraction failed for document ${documentId}:`, err.message);
    deleteChunksForDocument(documentId);
    updateExtractionState(documentId, {
      text_status: 'failed',
      failure_stage: 'extraction',
      failure_detail: err.message,
      processing_finished_at: new Date().toISOString(),
    });
    return documentsService.get(documentId);
  }
}

// ---------------------------------------------------------------------------
// User-triggered OCR
// ---------------------------------------------------------------------------

async function runOcr(documentId) {
  const doc = documentsService.get(documentId);
  if (!doc) {
    console.warn(`[documentExtraction] document ${documentId} not found`);
    return null;
  }

  if (doc.text_status !== 'needs_ocr') {
    return doc;
  }

  const filePath = documentStorage.resolveManagedDocumentPath(doc.file_path, {
    mustExist: true,
  });
  if (!filePath) {
    updateExtractionState(documentId, {
      text_status: 'failed',
      failure_stage: 'ocr',
      failure_detail: 'Document path is invalid or outside managed storage',
      processing_finished_at: new Date().toISOString(),
    });
    return documentsService.get(documentId);
  }

  updateExtractionState(documentId, {
    text_status: 'extracting',
    processing_started_at: new Date().toISOString(),
    failure_stage: null,
    failure_detail: null,
  });

  try {
    const docType = resolveIngestionDocType({ mimeType: doc.mime_type, filePath });
    let result;

    if (docType === 'pdf') {
      result = await extractScannedPdfOcr(filePath);
    } else if (docType === 'image') {
      result = await extractImageOcr(filePath);
    } else {
      updateExtractionState(documentId, {
        text_status: 'failed',
        failure_stage: 'ocr',
        failure_detail: 'OCR not applicable to this file type',
        processing_finished_at: new Date().toISOString(),
      });
      return documentsService.get(documentId);
    }

    if (!result.text || !result.text.trim()) {
      updateExtractionState(documentId, {
        text_status: 'unreadable',
        text_source: result.source || null,
        document_text: null,
        text_length: null,
        processing_finished_at: new Date().toISOString(),
        failure_stage: 'ocr',
        failure_detail: 'OCR produced empty text',
      });
      return documentsService.get(documentId);
    }

    const text = result.text;

    updateExtractionState(documentId, {
      document_text: text,
      text_status: 'readable',
      text_source: result.source,
      text_length: text.length,
      unreadable_text: 0,
      processing_finished_at: new Date().toISOString(),
      failure_stage: null,
      failure_detail: null,
    });

    // Generate and save chunks
    try {
      deleteChunksForDocument(documentId);
      const chunks = chunkText({
        documentId: String(documentId),
        sourceId: String(documentId),
        text,
        chunkSize: RETRIEVAL_CHUNK_SIZE,
        chunkOverlap: RETRIEVAL_CHUNK_OVERLAP,
      });
      if (chunks.length > 0) {
        saveChunks(documentId, chunks);
      }
    } catch (chunkErr) {
      console.error(`[documentExtraction] chunking failed for document ${documentId}:`, chunkErr.message);
      updateExtractionState(documentId, {
        failure_stage: 'chunking',
        failure_detail: chunkErr.message,
      });
    }

    return documentsService.get(documentId);
  } catch (err) {
    console.error(`[documentExtraction] OCR failed for document ${documentId}:`, err.message);
    updateExtractionState(documentId, {
      text_status: 'failed',
      failure_stage: 'ocr',
      failure_detail: err.message,
      processing_finished_at: new Date().toISOString(),
    });
    return documentsService.get(documentId);
  }
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

async function retryExtraction(documentId) {
  deleteChunksForDocument(documentId);
  updateExtractionState(documentId, {
    document_text: null,
    text_status: 'unreadable',
    text_source: null,
    text_length: null,
    unreadable_text: 1,
    failure_stage: null,
    failure_detail: null,
    processing_started_at: null,
    processing_finished_at: null,
  });
  return ingestDocument(documentId);
}

// ---------------------------------------------------------------------------
// Backfill — process all existing unextracted documents
// ---------------------------------------------------------------------------

async function backfillAll() {
  const rows = db.prepare(
    `SELECT id FROM documents
     WHERE (text_status IS NULL OR text_status = 'unreadable')
       AND copy_type IS NOT 'generated'
       AND deleted_at IS NULL
     ORDER BY id ASC`
  ).all();

  const results = { total: rows.length, success: 0, needsOcr: 0, failed: 0, skipped: 0 };
  console.log(`[documentExtraction] backfill: ${rows.length} documents to process`);

  for (const row of rows) {
    try {
      const doc = await ingestDocument(row.id);
      if (!doc) {
        results.skipped++;
      } else if (doc.text_status === 'readable') {
        results.success++;
      } else if (doc.text_status === 'needs_ocr') {
        results.needsOcr++;
      } else {
        results.failed++;
      }
    } catch (err) {
      console.error(`[documentExtraction] backfill failed for document ${row.id}:`, err.message);
      results.failed++;
    }
  }

  console.log(`[documentExtraction] backfill complete:`, results);
  return results;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ingestDocument,
  retryExtraction,
  runOcr,
  searchChunks,
  deleteChunksForDocument,
  backfillAll,
};
