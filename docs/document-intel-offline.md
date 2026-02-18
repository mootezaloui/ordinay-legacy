# Offline Document Intelligence (Electron)

## Goal
Run PDF/image/docx/text extraction fully offline without external OCR binaries.

## Key modules
- `backend/src/doc_intel/pipeline.js`
- `backend/src/doc_intel/rasterizePdfPdfjs.js`
- `backend/src/doc_intel/ocrTesseractWorker/manager.js`
- `backend/src/doc_intel/ocrTesseractWorker/worker.js`

## Limits defaults
- Weak profile (`cpu<=4` or `mem<=8GB`):
  - `maxConcurrentPages=1`
  - `renderScale=1.6`
  - `workerTimeoutMs=60000`
- Normal profile:
  - `maxConcurrentPages=2`
  - `renderScale=2.0`
  - `workerTimeoutMs=45000`
- Shared:
  - `maxPagesAuto=5`
  - `maxPagesHard=25`
  - `memoryStopThreshold=0.70`

## API
- `GET /agent/sessions/:sessionId/documents/:documentId/progress` (SSE)
- `POST /agent/sessions/:sessionId/documents/:documentId/continue`
- `POST /agent/sessions/:sessionId/documents/:documentId/cancel`

## Notes
- Cloud OCR path is disabled in offline mode.
- Existing ingestion endpoints remain backward compatible.

