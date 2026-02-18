# Offline Document Intelligence

This module provides fully offline document analysis for agent attachments.

## Pipeline stages
- `detect_type`
- `cache_lookup`
- `extract_embedded_text`
- `evaluate_text_signal`
- `rasterize_pdf`
- `ocr_pages`
- `merge_context`

## Runtime characteristics
- PDF rasterization: `pdfjs-dist` + `@napi-rs/canvas`
- OCR: `tesseract.js` in `worker_threads`
- Memory guard: stops work when RSS crosses configured threshold
- Page strategy: auto OCR first `DOC_INTEL_MAX_PAGES_AUTO`, then `needsUserContinue`

## Progress events
Events are published per document id:
- `stage_start`
- `page_progress`
- `stage_end`
- `warning`
- `result`
- `error`

## Cache
Persistent SQLite table: `document_intel_cache`
- keyed by `content_hash + pipeline_version + options_signature`

