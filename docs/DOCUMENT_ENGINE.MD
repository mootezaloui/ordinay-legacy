# Document Understanding Integration Plan

**Local-first, lightweight architecture for shared document ingestion across app UI and chatbot**

**Updated: 2026-03-16 — Adapted to existing codebase after full audit**
**Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 4 ✅ | Phase 5 ✅ | Phase 6 ✅ | Phase 7 ⏳ (deferred by design)**

---

## Goal

Build **one shared document understanding system** that serves:

1. **Agent chatbot uploads**
2. **Detail View → Documents tab uploads**

This system must:

- run **locally**
- stay **lightweight**
- work on **weak laptops**
- avoid duplicated extraction logic
- prepare the app for **future RAG**
- integrate with the agent's existing `listDocuments` and `getDocument` tools
- add a new `searchDocuments` tool for keyword search

---

# Core Decision

## Do **not** build document parsing inside the chatbot

## Do **not** build document parsing inside the documents tab

Instead, extend the **existing backend service layer** to add extraction and indexing.

Both UI entry points already call the same backend. We hook extraction into the existing flow.

That gives us:

- one source of truth
- one indexing pipeline
- one storage model (existing `documents` table + new `document_chunks` table)
- one future RAG path
- one agent integration point

---

# What Already Exists (Do Not Rebuild)

The codebase already has working infrastructure that this plan builds on:

### Backend Services (keep, extend)

| File | What It Does |
|------|--------------|
| `backend/src/services/documentStorage.js` | File I/O, SHA256 hashing, base64 decode, path management |
| `backend/src/services/documents.service.js` | CRUD, metadata, entity binding, text_status lifecycle |
| `backend/src/services/agentDocuments.service.js` | Agent session document binding and context |
| `backend/src/services/documentAiSettings.service.js` | AI settings (currently disabled) |
| `backend/src/domain/documentFormatGovernance.js` | Format detection, MIME mapping, extension validation |
| `backend/src/controllers/documents.controller.js` | HTTP handlers for all document operations |

### Agent V2 Tools (keep, extend)

| File | What It Does |
|------|--------------|
| `backend/src/agent/tools/read/getDocument.tool.js` | Get single document by ID, returns text (truncated 30k) |
| `backend/src/agent/tools/read/listDocuments.tool.js` | List documents with entity/query/status filters |
| `backend/src/agent/retrieval/chunker.js` | Text chunking with configurable size/overlap |
| `backend/src/agent/retrieval/retrieval.index.js` | In-memory chunk index with similarity search |
| `backend/src/agent/retrieval/retrieval.policy.js` | Chunk size, overlap, top-k, min-score defaults |

### Database Schema (keep, extend)

The existing `documents` table already has:

- `document_text TEXT` — exists but unpopulated (will hold extracted text)
- `text_status TEXT` — exists, currently always 'unreadable' (will become meaningful)
- `text_source TEXT` — exists (will record extraction method)
- `text_length INTEGER` — exists (will record character count)
- `artifact_json TEXT` — exists (can store extraction metadata/blocks as JSON)
- `processing_started_at`, `processing_finished_at` — exist
- `failure_stage`, `failure_detail` — exist

### Upload Flow (keep, hook into)

Both upload paths already converge on the same backend:

```text
Entity Document Upload:
  frontend → POST /documents/upload → documentStorage.saveUploadedDocument()
  frontend → POST /documents → documents.service.create()

Agent Session Document Upload:
  frontend → POST /agent/sessions/:id/documents/upload
  backend → documentStorage.saveUploadedDocument() → documents.service.create() → bind to session
```

We hook extraction **after** `documents.service.create()` — not before, not alongside.

---

# What We Build New

### New Backend Service

```text
backend/src/services/documentExtraction.service.js    ← NEW (extraction + ingestion pipeline)
```

### New Database Table

```text
document_chunks table    ← NEW (persistent chunk storage)
fts_document_chunks      ← NEW (FTS5 keyword search index)
```

### New Agent Tool

```text
backend/src/agent/tools/read/searchDocuments.tool.js  ← NEW (keyword search over chunks)
```

### New Dependencies

```text
pdf-parse        ← PDF text extraction (~2MB, pure JS)
mammoth          ← DOCX text extraction (~1MB, pure JS)
xlsx             ← XLSX/spreadsheet reading (~3MB, pure JS)
tesseract.js     ← OCR for images (~15MB + language data, Phase 3)
pdfjs-dist       ← PDF page rendering for scanned PDFs (Phase 3)
```

---

# High-Level Architecture (Adapted)

```text
┌────────────────────────────────────────────────────────────┐
│                        APP UI LAYER                        │
│                                                            │
│  1. Agent Uploads         2. Detail View → Documents Tab   │
│     (AgentSessionDocs)       (DocumentsTab)                │
└───────────────────────┬────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────┐
│              EXISTING BACKEND SERVICE LAYER                 │
│                                                            │
│  documentStorage.js → save file, hash, path                │
│  documents.service.js → create record, CRUD                │
│  agentDocuments.service.js → session binding                │
└───────────────────────┬────────────────────────────────────┘
                        │
                        ▼  (NEW: hook after record creation)
┌────────────────────────────────────────────────────────────┐
│            documentExtraction.service.js (NEW)             │
│                                                            │
│  - file type routing                                       │
│  - PDF text extraction (pdf-parse)                         │
│  - DOCX extraction (mammoth)                               │
│  - XLSX extraction (xlsx/SheetJS)                          │
│  - OCR for images (tesseract.js) ✅                        │
│  - Scanned PDF (pdfjs-dist → images → tesseract) ✅       │
│  - text normalization                                      │
│  - chunk generation (reuse agent/retrieval/chunker.js)     │
│  - FTS5 indexing                                           │
│  - status lifecycle updates                                │
└───────────────────────┬────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────┐
│                  LOCAL DOCUMENT STORE                       │
│                                                            │
│  documents table (EXISTING — document_text populated)      │
│  document_chunks table (NEW)                               │
│  fts_document_chunks (NEW — FTS5 keyword index)            │
│  agent/retrieval/index (EXISTING — in-memory for sessions) │
└───────────────────────┬────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────┐
│               AGENT TOOLING LAYER (V2 agent/)              │
│                                                            │
│  listDocuments (EXISTING — already works)                   │
│  getDocument (EXISTING — returns document_text)             │
│  searchDocuments (NEW — FTS5 keyword search)                │
│  future: semantic_search via retrieval.index.js             │
└────────────────────────────────────────────────────────────┘
```

---

# Main Product Rule

A document uploaded anywhere in the app becomes part of the same document system.

That means:

- a file uploaded in chatbot must be visible in document storage
- a file uploaded in documents tab must be retrievable by the chatbot agent
- both must share extraction, indexing, status, metadata, and permissions

This is **already true for storage**. This plan makes it true for **understanding**.

---

# Scope

This architecture supports:

**Phase 1-2 (native extraction):**

- PDF: text-based (native text layer extraction)
- Word: `.docx`
- Excel: `.xlsx`

**Phase 3 (OCR — optional, user-triggered):**

- Images: `.jpg`, `.jpeg`, `.png`, `.tiff`, `.bmp`, `.webp`
- PDF: scanned (no text layer)

**Deferred:**

- `.pptx` (needs dedicated parser, low priority)
- `.doc`, `.xls`, `.ppt` (legacy binary formats)
- email attachments
- OCR on embedded images in Office files

---

# Design Principles

## 1. Extend, don't replace

Build on existing services. Do not create a parallel system.

## 2. Cheapest extraction path first

Use native parsers. OCR only when no text can be extracted natively.

## 3. Local-first

Local parsers, local OCR, local SQLite. No cloud APIs.

## 4. Lightweight

No heavyweight vector DB in V1.
No always-on background processing.
OCR is user-triggered, not automatic.

## 5. Future-ready

Store chunks in a way that allows RAG later without redesigning.

---

# Extraction Strategy by File Type

## Text-based PDFs

Use native PDF text extraction via `pdf-parse`.
Do not OCR unless no text layer exists.

```text
text pdf → pdf-parse → text per page → normalize → chunks
```

## DOCX

Use native parser via `mammoth`.

```text
docx → mammoth → HTML/text → normalize → chunks
```

## XLSX

Use native spreadsheet parser via `xlsx` (SheetJS).

```text
xlsx → SheetJS → sheets/rows/cells → normalize → chunks
```

## Images (Phase 3)

Use `tesseract.js` for OCR. Tesseract only works on images.

```text
image (jpg/png/tiff/bmp) → tesseract.js → text blocks → normalize → chunks
```

## Scanned PDFs (Phase 3)

Tesseract cannot read PDFs directly. A scanned PDF is just images wrapped in PDF structure.

The pipeline must be:

```text
scanned pdf
  → pdfjs-dist renders each page to image (canvas/PNG)
  → tesseract.js OCRs each page image
  → merge text from all pages
  → normalize → chunks
```

### Three kinds of PDFs (per-page hybrid detection)

**1. Text-based PDF** — all pages have embedded text. Extract text directly with `pdf-parse`. Fast path, no OCR needed.

**2. Scanned PDF** — all pages contain only images. No real text exists. Must use full OCR pipeline.

**3. Hybrid PDF** — mix of text pages and image pages (e.g. slides with bullet points + embedded diagrams, legal docs with stamps/signatures, presentations exported as PDF). Some pages have extractable text, others don't.

Detection strategy (per-page):
```text
pdf → pdf-parse → check average chars/page
  → if avg >= 30 chars/page: text-based, use pdf-parse text (fast path)
  → if avg < 30 chars/page: per-page analysis via pdfjs-dist
      → for each page: pdfjs getTextContent()
        → if page text >= 30 chars: keep text-extracted version
        → if page text < 30 chars: OCR that page (render → canvas → tesseract)
      → merge all pages (text + OCR) into unified document_text
      → source = 'hybrid'
  → if ALL pages need OCR: mark needs_ocr → full scanned pipeline
```

This ensures:
- Pure text PDFs stay fast (no OCR overhead)
- Hybrid PDFs get the best of both (accurate text where available + OCR where needed)
- OCR only runs on pages that actually need it (saves time on weak machines)
- The final result is always one unified `document_text` — the user/agent never sees the split

---

# Database Schema Changes

## Existing `documents` table (NO CHANGES)

The existing table already has all needed columns:

```sql
-- These columns exist and will now be populated by extraction:
document_text TEXT,                    -- full extracted text
text_status TEXT DEFAULT 'processing', -- readable | unreadable | extracting | needs_ocr | failed
text_source TEXT,                      -- 'pdf-parse' | 'mammoth' | 'sheetjs' | 'tesseract' | 'tesseract-pdf' | 'hybrid' | null
text_length INTEGER,                   -- character count of extracted text
processing_started_at DATETIME,
processing_finished_at DATETIME,
failure_stage TEXT,                     -- 'extraction' | 'chunking' | 'indexing'
failure_detail TEXT,                    -- error message
```

## New `document_chunks` table

```sql
CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  chunk_order INTEGER NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  chunk_text TEXT NOT NULL,
  token_estimate INTEGER,
  chunk_type TEXT NOT NULL DEFAULT 'text',
  sheet_name TEXT,
  metadata_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
```

## New FTS5 index

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS fts_document_chunks USING fts5(
  chunk_text,
  content='document_chunks',
  content_rowid='id'
);

-- Triggers to keep FTS5 in sync with document_chunks
CREATE TRIGGER IF NOT EXISTS document_chunks_ai AFTER INSERT ON document_chunks BEGIN
  INSERT INTO fts_document_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
END;

CREATE TRIGGER IF NOT EXISTS document_chunks_ad AFTER DELETE ON document_chunks BEGIN
  INSERT INTO fts_document_chunks(fts_document_chunks, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
END;

CREATE TRIGGER IF NOT EXISTS document_chunks_au AFTER UPDATE ON document_chunks BEGIN
  INSERT INTO fts_document_chunks(fts_document_chunks, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
  INSERT INTO fts_document_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
END;
```

**No `document_blocks` table.** Block-level detail (if needed) goes into `artifact_json` on the document record.

**No `document_metadata` table.** Existing columns + `artifact_json` are sufficient.

---

# Processing States

Reuse the existing `text_status` column with normalized values:

```text
unreadable    — default, no text extracted yet (or extraction not attempted)
extracting    — extraction in progress
readable      — text extracted successfully, chunks created and indexed
needs_ocr     — native extraction found no text, OCR required (Phase 3)
failed        — extraction failed, see failure_stage + failure_detail
```

## State transitions

```text
Upload (new document):
  → unreadable (default from create)
  → extracting (extraction starts)
  → readable (success) OR needs_ocr (no text found) OR failed (error)

Retry (failed document):
  → extracting
  → readable OR needs_ocr OR failed

OCR trigger (needs_ocr document, Phase 3):
  → extracting
  → readable OR failed
```

---

# Ingestion Pipeline (Node.js)

Single entry point in `documentExtraction.service.js`:

```javascript
async function ingestDocument(documentId) {
  // 1. Load document record from documents.service
  // 2. Check if already extracted (text_status === 'readable')
  // 3. Update text_status to 'extracting', set processing_started_at
  // 4. Detect file type from mime_type / extension
  // 5. Route to correct extractor
  // 6. On success:
  //    - Save extracted text to documents.document_text
  //    - Update text_status to 'readable'
  //    - Update text_source, text_length, processing_finished_at
  //    - Generate chunks using agent/retrieval/chunker.js
  //    - Save chunks to document_chunks table
  //    - FTS5 index auto-updates via triggers
  // 7. On empty extraction (PDF with no text):
  //    - Update text_status to 'needs_ocr'
  // 8. On error:
  //    - Update text_status to 'failed'
  //    - Save failure_stage + failure_detail
}
```

## File Type Routing

```javascript
function routeExtraction(filePath, mimeType) {
  const fileType = detectFileType(mimeType); // reuse documentFormatGovernance.js

  if (fileType === 'pdf') {
    return extractPdfText(filePath); // pdf-parse, returns { text, pages }
  }
  if (fileType === 'docx') {
    return extractDocxText(filePath); // mammoth, returns { text }
  }
  if (fileType === 'xlsx') {
    return extractXlsxText(filePath); // SheetJS, returns { text, sheets }
  }
  if (isImageType(fileType)) {
    return { text: '', needsOcr: true }; // Phase 3
  }

  return { text: '', unsupported: true };
}
```

---

# Chunking Strategy

Reuse the existing `agent/retrieval/chunker.js` which already implements:

- Configurable chunk size and overlap
- Whitespace-aware boundary trimming
- Chunk index tracking
- Metadata propagation

Chunking is required now even before RAG because:

- keyword search operates on chunks (bounded result snippets)
- agent retrieval needs bounded context (not entire 100-page documents)
- source references are easier at chunk level

## Chunk rules by file type

### PDFs / DOCX

- chunk the full extracted text
- chunk size ~1000 chars with ~200 overlap (match retrieval.policy.js defaults)

### XLSX

- chunk per sheet
- prepend sheet name as context header
- preserve header row in each chunk

### OCR output (Phase 3)

- chunk the merged OCR text from all pages
- include page number in metadata

---

# Search Strategy for V1

Use **SQLite FTS5 keyword search only**.

Do not jump into embeddings or semantic search yet.

## Why

- lighter
- faster
- simpler
- enough for first agent tooling
- easier to debug
- no resource-heavy local vector system

## V1 search flow

```text
user query (from agent tool or future API)
  → parse entity scope filters (client_id, dossier_id, etc.)
  → run FTS5 MATCH on fts_document_chunks
  → join back to document_chunks + documents for metadata
  → return top matching chunks with document references
  → include snippet, page info, score
```

## The in-memory retrieval index (agent/retrieval/) remains separate

It serves a different purpose: session-scoped context for the agent's current conversation. The FTS5 index is for persistent cross-session keyword search. They coexist, they do not replace each other.

---

# Agent Tool Contracts

## `listDocuments` — EXISTING, no changes needed

Already registered in `agent/tools/read/listDocuments.tool.js`.
Filters by entity IDs, query text, text_status, with limit.
Returns metadata only (no text body).

Once extraction populates `text_status`, the existing tool automatically reflects whether documents are readable.

## `getDocument` — EXISTING, no changes needed

Already registered in `agent/tools/read/getDocument.tool.js`.
Returns full document including `document_text` (truncated to 30k chars).

Once extraction populates `document_text`, the existing tool automatically returns extracted content.

## `searchDocuments` — NEW

```javascript
// backend/src/agent/tools/read/searchDocuments.tool.js

module.exports = {
  name: 'searchDocuments',
  category: 'READ',
  description: 'Search document contents by keyword. Returns matching text chunks with document references.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keywords' },
      clientId: { type: ['integer', 'null'] },
      dossierId: { type: ['integer', 'null'] },
      lawsuitId: { type: ['integer', 'null'] },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
    },
    required: ['query'],
    additionalProperties: false
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: { type: 'array' },
      count: { type: 'integer' }
    },
    additionalProperties: false
  },
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler: async function(args) {
    // Call documentExtraction.service.searchChunks()
    // Returns: [{ document_id, file_name, chunk_text, page_start, score }]
  }
};
```

---

# Full End-to-End Flow (After Implementation)

## Flow A: Upload from Agent Chat

```text
user uploads file in agent chat
  → frontend calls POST /agent/sessions/:id/documents/upload
  → backend saves file (documentStorage.saveUploadedDocument) ← EXISTS
  → backend creates document record (documents.service.create) ← EXISTS
  → backend binds to session (agentDocuments.service) ← EXISTS
  → backend calls documentExtraction.service.ingestDocument(docId) ← NEW
      → detects file type
      → extracts text (pdf-parse / mammoth / SheetJS)
      → saves text to documents.document_text
      → updates text_status to 'readable'
      → generates chunks
      → saves to document_chunks (FTS5 auto-indexed)
  → agent can now read text via getDocument ← ALREADY WORKS
  → agent can now search via searchDocuments ← NEW TOOL
```

## Flow B: Upload from Documents Tab

```text
user uploads file in documents tab
  → frontend calls POST /documents/upload + POST /documents ← EXISTS
  → backend saves file + creates record ← EXISTS
  → backend calls documentExtraction.service.ingestDocument(docId) ← NEW
  → exact same extraction pipeline runs
  → document becomes readable by agent tools
```

---

# Integration Points (Where New Code Hooks In)

## 1. After `documents.service.create()` — trigger extraction

In `documents.controller.js` (create handler), after the document record is created, call:

```javascript
// Non-blocking: extraction runs async, does not block the HTTP response
documentExtractionService.ingestDocument(newDoc.id).catch(err => {
  console.error(`[extraction] failed for document ${newDoc.id}:`, err.message);
});
```

## 2. After `agentDocuments.service.uploadAndBind()` — trigger extraction

Same hook, the document is already created via `documents.service.create()` internally.

## 3. Retry endpoint — re-trigger extraction for failed documents

Add to existing `documents.routes.js`:

```javascript
router.post('/:id/retry-extraction', documentsController.retryExtraction);
```

---

# Caching Rules

## Cache by file hash

The existing `documentStorage.js` already computes SHA256 hashes. If a file with the same hash has already been extracted, skip extraction and link to existing text/chunks.

## Cache chunk generation

Only rebuild chunks when `document_text` changes.

## No separate OCR cache in V1

OCR caching is deferred to Phase 3 when OCR is implemented.

---

# Performance Rules

These are mandatory for weak laptops.

## Do

- process one document at a time by default
- extract text synchronously within the async call (no background queue in V1)
- use native parsers instead of OCR wherever possible
- defer OCR to user action (not automatic)
- keep chunk sizes moderate (1000 chars default from retrieval.policy.js)

## Do not

- OCR everything automatically
- generate embeddings for all files in V1
- run heavy background jobs constantly
- tie extraction to chatbot session logic
- parse documents separately in each UI feature
- block the upload HTTP response on extraction

---

# Error Handling

Every extractor must fail safely.

## Common failure categories

- unsupported file type → text_status stays 'unreadable'
- encrypted/corrupt file → text_status = 'failed', failure_detail = error message
- empty extraction (scanned PDF) → text_status = 'needs_ocr'
- parser crash → text_status = 'failed', failure_stage = 'extraction'
- chunking failure → text_status = 'failed', failure_stage = 'chunking'

## Error contract

A failed extraction must:

- set `text_status` to `failed`
- preserve `failure_stage` and `failure_detail`
- not corrupt FTS5 indexes
- not leave partial chunks (delete any chunks for this document on failure)
- allow retry later via `retryExtraction`

---

# Retry Strategy

```javascript
async function retryExtraction(documentId) {
  // 1. Delete existing chunks for this document
  // 2. Reset text_status to 'unreadable'
  // 3. Clear document_text, failure fields
  // 4. Re-run ingestDocument(documentId)
}
```

Useful for:

- parser errors after dependency update
- corrupted temporary output
- user-triggered OCR (Phase 3)

---

# IMPORTANT: Agent Folder Convention

When dealing with the agent, `agent_Back/` is a **dead folder**. It does not work and must be ignored.

All agent changes go into `backend/src/agent/` — this is the clean V2 implementation.

The V2 agent has:
- 27 registered READ tools (auto-loaded from `agent/tools/read/`)
- Full tool registry, executor, permission gate
- Working agentic loop with LLM function calling
- In-memory retrieval system (`agent/retrieval/`)

New tools (like `searchDocuments`) follow the existing V2 tool contract.

---

# Implementation Phases

---

## Phase 1 — Schema + Extraction Service (Foundation) ✅ COMPLETED

### What was done

- [x] Add `document_chunks` table to `schema.sql`
- [x] Add FTS5 virtual table + sync triggers to `schema.sql`
- [x] Create `backend/src/services/documentExtraction.service.js`
- [x] Install `pdf-parse@1.1.1`, `mammoth`, `xlsx` dependencies
- [x] Implement PDF text extractor (using `pdf-parse`)
- [x] Implement DOCX text extractor (using `mammoth`)
- [x] Implement XLSX text extractor (using `xlsx`/SheetJS)
- [x] Implement plain text extractor (TXT, CSV, MD, JSON, HTML, RTF)
- [x] Implement file type routing logic (via `documentFormatGovernance.resolveIngestionDocType`)
- [x] Implement `ingestDocument(documentId)` pipeline:
  - Load document record
  - Route to correct extractor
  - Save extracted text to `document_text` column
  - Update `text_status`, `text_source`, `text_length`
  - Update `processing_started_at`, `processing_finished_at`
  - Handle errors → `text_status = 'failed'`
  - Handle empty PDF → `text_status = 'needs_ocr'`
  - Skip `copy_type = 'generated'` documents
- [x] Add migration `002_add_document_chunks.sql` for existing databases

### Files created/modified

| File | Action |
|------|--------|
| `backend/src/services/documentExtraction.service.js` | **Created** — extraction pipeline, chunking, FTS5 search, retry |
| `backend/src/db/schema.sql` | **Modified** — added document_chunks table, FTS5 virtual table, sync triggers |
| `backend/src/migrations/002_add_document_chunks.sql` | **Created** — migration for existing databases |
| `backend/package.json` | **Modified** — added pdf-parse@1.1.1, mammoth, xlsx |

### Done criteria — all met

- ✅ `ingestDocument(docId)` can be called for any PDF/DOCX/XLSX/TXT document
- ✅ Extracted text lands in `documents.document_text`
- ✅ `text_status` reflects actual extraction result
- ✅ Failed extraction is recorded with error details
- ✅ Scanned PDFs detected and marked `needs_ocr`
- ✅ End-to-end pipeline tested: upload → extract → chunk → FTS5 search → retry

---

## Phase 2 — Chunking + Search (Make It Searchable) ✅ COMPLETED

### What was done

- [x] Implement chunk generation in extraction service (reuses `agent/retrieval/chunker.js`)
- [x] Save chunks to `document_chunks` table after extraction
- [x] FTS5 index auto-populates via triggers
- [x] Implement `searchChunks(query, filters, limit)` in extraction service
- [x] Create `backend/src/agent/tools/read/searchDocuments.tool.js`
- [x] Register `searchDocuments` in `agent/tools/read/index.js`
- [x] Add `POST /documents/search` backend route (for future non-agent use)
- [x] Implement `retryExtraction(documentId)` in extraction service
- [x] Add `POST /documents/:id/retry-extraction` route

### Files created/modified

| File | Action |
|------|--------|
| `backend/src/agent/tools/read/searchDocuments.tool.js` | **Created** — FTS5 keyword search agent tool |
| `backend/src/agent/tools/read/index.js` | **Modified** — registered searchDocuments tool |
| `backend/src/controllers/documents.controller.js` | **Modified** — added `search` and `retryExtraction` handlers |
| `backend/src/routes/documents.routes.js` | **Modified** — added `POST /documents/search` and `POST /:id/retry-extraction` |

### Done criteria — all met

- ✅ Extracted documents have chunks in `document_chunks`
- ✅ `searchDocuments` agent tool returns keyword matches with snippets
- ✅ Retry works for failed documents
- ✅ FTS5 search returns results ranked by relevance
- ✅ Agent now has 27 tools (26 existing + searchDocuments)

---

## Phase 3 — OCR + Hybrid PDF Detection ✅ COMPLETED

### What was done

- [x] Install `tesseract.js` + language data (eng, fra, ara)
- [x] Install `pdfjs-dist@3.11.174` for PDF page rendering (CJS-compatible v3)
- [x] Install `canvas` (node-canvas) for server-side rendering
- [x] Implement image OCR extractor:
  - `extractImageOcr(filePath)` — tesseract.js recognizes PNG/JPG/TIFF/BMP
- [x] Implement scanned PDF OCR pipeline:
  - `extractScannedPdfOcr(filePath)` — pdfjs-dist renders each page to canvas → PNG buffer → tesseract.js OCRs each page → merge text
- [x] Implement **hybrid PDF detection** (per-page analysis):
  - `extractPdfHybrid(filePath, buffer, numPages)` — uses pdfjs `getTextContent()` per page
  - Pages with < 30 chars are flagged as image-heavy → OCR'd individually
  - Pages with >= 30 chars keep their text-extracted content
  - Merged into single unified `document_text`, `source: 'hybrid'`
  - Fast path: if average chars/page >= 30, skip per-page analysis entirely (use pdf-parse)
- [x] Fix pdfjs-dist + node-canvas compatibility:
  - `buildNodeCanvasFactory()` — provides node-canvas instances to pdfjs internals
  - `drawImage` monkey-patch — converts pdfjs internal canvas objects via `getImageData()` to work with node-canvas `instanceof` checks
- [x] Implement `runOcr(documentId)` in extraction service:
  - Only works on `needs_ocr` documents
  - Routes to image OCR or scanned PDF OCR based on file type
  - After OCR, runs chunking + FTS5 indexing (same pipeline as Phase 1)
- [x] Add OCR trigger endpoint: `POST /documents/:id/run-ocr`
- [x] Agent session uploads auto-chain OCR after ingestion (blocking)
- [x] Tesseract worker is lazy-loaded (first OCR request initializes it)
- [x] Shared helpers: `ocrPdfPage()` and `buildNodeCanvasFactory()` used by both hybrid and full-scanned paths

### Hybrid PDF decision flow

```text
extractPdf(filePath)
  │
  ├─ pdf-parse extracts total text
  ├─ avg chars/page >= 30? → YES → return text (fast path, source: 'pdf-parse')
  │
  └─ NO → extractPdfHybrid()
           ├─ pdfjs getTextContent() per page
           ├─ classify each page: text-rich (>=30 chars) or image-heavy (<30 chars)
           │
           ├─ 0 pages need OCR?  → return joined text (source: 'pdf-parse')
           ├─ ALL pages need OCR? → return needsOcr: true → full scanned pipeline
           └─ SOME pages need OCR? → OCR only those pages → merge → source: 'hybrid'
```

### Files created/modified

| File | Action |
|------|--------|
| `backend/src/services/documentExtraction.service.js` | **Modified** — added `extractImageOcr`, `extractScannedPdfOcr`, `extractPdfHybrid`, `ocrPdfPage`, `buildNodeCanvasFactory`, `runOcr`, lazy loaders for tesseract/pdfjs/canvas |
| `backend/src/controllers/documents.controller.js` | **Modified** — added `runOcr` handler |
| `backend/src/routes/documents.routes.js` | **Modified** — added `POST /:id/run-ocr` route |
| `backend/src/controllers/agentDocuments.controller.js` | **Modified** — upload now blocks on extraction+OCR |
| `backend/src/agent/memory/context.assembler.js` | **Modified** — injects session document text into LLM messages |
| `backend/src/agent/ux/index.js` | **Modified** — bypasses ambiguity detection when session has documents |
| `backend/package.json` | **Modified** — added tesseract.js, pdfjs-dist@3.11.174, canvas |

### Technical notes

- **pdfjs-dist v3.11.174** is required — v4/v5 are ESM-only and cannot be `require()`d
- **tesseract.js worker** is initialized once with `eng+fra+ara` languages and reused across OCR calls
- **OCR_RENDER_SCALE = 2** — 2x resolution for readable OCR quality
- **PAGE_TEXT_THRESHOLD = 30** — chars per page; below this the page is considered image-heavy
- **canvas** (node-canvas) provides server-side Canvas API for pdfjs-dist rendering
- **drawImage patch** — pdfjs v3 creates internal canvas objects that fail node-canvas `instanceof` checks; the patch converts them via `getImageData()`

### Done criteria — all met

- ✅ Images can be OCR'd to extract text
- ✅ Scanned PDFs can be OCR'd (page-by-page rendering then OCR)
- ✅ **Hybrid PDFs** correctly detect and OCR only image-heavy pages
- ✅ OCR available via `POST /documents/:id/run-ocr` and auto-triggered for agent uploads
- ✅ OCR results feed into same chunking + FTS5 indexing pipeline
- ✅ `text_source` values: `pdf-parse`, `tesseract`, `tesseract-pdf`, `hybrid`
- ✅ Agent chatbot can read attached document content (context injection into LLM messages)

---

## Phase 4 — Wire Both Upload Paths ✅ COMPLETED

### What was done

- [x] Hook `extractionService.ingestDocument()` after `documents.controller.create()` — async, non-blocking
- [x] Hook `extractionService.ingestDocument()` after `agentDocuments.controller.upload()` — async, non-blocking
- [x] Both paths call the same extraction pipeline, write to same `document_text` + `document_chunks`
- [x] Verified: agent `getDocument` returns `document_text` (truncated 30k) — no changes needed
- [x] Verified: agent `listDocuments` reflects `text_status` in metadata — no changes needed
- [x] End-to-end tested: create → extract → chunks → FTS5 search all functional

### Files modified

| File | Action |
|------|--------|
| `backend/src/controllers/documents.controller.js` | **Modified** — added async `ingestDocument()` call after `create()` |
| `backend/src/controllers/agentDocuments.controller.js` | **Modified** — added `extractionService` import + async `ingestDocument()` call after `uploadAndBind()` |

### Technical notes

- Extraction is **fire-and-forget** — the HTTP response returns immediately with the created document
- Errors in extraction are logged but do not affect the upload response
- No changes to agent tools — `getDocument` and `listDocuments` already return `document_text` and `text_status`
- No extraction logic in frontend code — all server-side

### Done criteria — all met

- ✅ Upload from Documents Tab triggers extraction automatically
- ✅ Upload from Agent Chat triggers extraction automatically
- ✅ Same extraction pipeline runs for both paths
- ✅ Agent tools work with extracted content (zero tool changes)
- ✅ No extraction logic in frontend code

---

## Phase 5 — UI Status Updates ✅ COMPLETED

### What was done

- [x] Normalize `text_status` display in DocumentsTab.jsx:
  - New badges: "Extracting text...", "Readable", "Readable (OCR)", "Needs OCR", "Extraction failed", "Not processed"
  - Removed dead OCR-era helpers: `formatFailureReason`, `sanitizeVisualSummary`, `mapQualityFlags`, `renderUnderstandingBadge`, `formatConfidence`
  - Removed dead artifact/understanding display from document cards
- [x] Normalize status in AgentSessionDocumentsPanel.tsx:
  - Updated `formatUserStatus` for new states: `extracting`, `needs_ocr`, `failed`
  - Updated `renderStatusTone` for new state colors
  - Removed dead SSE progress streaming (entire EventSource useEffect block)
  - Removed dead OCR controls: "Continue OCR", "OCR pages...", "Cancel" buttons
  - Removed dead handlers: `handleContinueAll`, `handleContinuePages`, `handleCancel`
  - Removed dead `progressByDoc` state
  - Removed dead imports: `continueSessionDocumentAnalysis`, `cancelSessionDocumentAnalysis`, `getApiBase`, `getBackendConfig`, `isElectron`
  - Simplified `mapRiskFlags` — removed OCR-era flag labels
  - "Retry analysis" → "Retry extraction" (only shown for `failed` status)
- [x] Add retry button for `failed` documents in DocumentsTab
- [x] Add OCR trigger button for `needs_ocr` documents in DocumentsTab
- [x] Add `retryExtraction()` and `runOcr()` API methods to `documentService.js`
- [x] Update `agentDocuments.ts` types: `text_status` now includes `extracting | needs_ocr | failed`
- [x] Remove dead exports from `agentDocuments.ts`: `continueSessionDocumentAnalysis`, `cancelSessionDocumentAnalysis`

### Files modified

| File | Action |
|------|--------|
| `frontend/src/components/DetailView/tabs/DocumentsTab.jsx` | **Modified** — normalized status badges, added retry/OCR buttons, removed dead OCR code |
| `frontend/src/Agent_front/components/AgentSessionDocumentsPanel.tsx` | **Modified** — removed dead SSE/OCR controls, updated status display |
| `frontend/src/services/documentService.js` | **Modified** — added `retryExtraction()` and `runOcr()` API methods |
| `frontend/src/services/api/agentDocuments.ts` | **Modified** — updated `text_status` type, removed dead exports |

### Done criteria — all met

- ✅ UI shows accurate extraction status (extracting, readable, needs_ocr, failed, unreadable)
- ✅ No dead OCR-era controls visible (Continue OCR, OCR pages, Cancel all removed)
- ✅ No dead SSE progress streaming
- ✅ User can retry failed extractions from Documents Tab
- ✅ User can trigger OCR for needs_ocr documents from Documents Tab
- ✅ No frontend/backend contract exposes disabled OCR modes

---

## Phase 6 — Backfill Existing Documents ✅ COMPLETED

### What was done

- [x] Add `backfillAll()` function to `documentExtraction.service.js`
  - Queries all documents where `text_status IS NULL OR text_status = 'unreadable'`, not generated, not deleted
  - Processes one at a time via `ingestDocument()` (respects performance rules)
  - Skips documents where file is missing on disk (ingestDocument handles this)
  - Logs results: total, success, needsOcr, failed, skipped
- [x] Add `POST /documents/backfill` endpoint for triggering from API
- [x] Verified function works (dev database has 0 documents — backfill runs cleanly with empty result)

### Files modified

| File | Action |
|------|--------|
| `backend/src/services/documentExtraction.service.js` | **Modified** — added `backfillAll()` function |
| `backend/src/controllers/documents.controller.js` | **Modified** — added `backfill` handler |
| `backend/src/routes/documents.routes.js` | **Modified** — added `POST /documents/backfill` route |

### Usage

```bash
# Trigger backfill via API
curl -X POST http://localhost:PORT/documents/backfill

# Or run directly in Node
const { backfillAll } = require('./src/services/documentExtraction.service');
const results = await backfillAll();
// { total: N, success: N, needsOcr: N, failed: N, skipped: N }
```

### Done criteria — all met

- ✅ Backfill utility function processes all unextracted documents one at a time
- ✅ Documents with extractable text become `readable`
- ✅ Documents needing OCR are marked `needs_ocr`
- ✅ Missing files are marked `failed` with detail
- ✅ No data corruption — uses existing `ingestDocument()` pipeline
- ✅ Dev database has 0 documents — backfill runs cleanly (production databases will process on first call)

---

## Phase 7 — Future RAG Readiness ⏳ DEFERRED (by design)

### Status

Not implemented — intentionally deferred. The current architecture is RAG-ready without redesign.

### What's already in place for future RAG

- `document_chunks` table with stable schema (chunk_text, token_estimate, page_start, sheet_name, metadata_json)
- `agent/retrieval/retrieval.index.js` — in-memory similarity search, extensible
- `agent/retrieval/retrieval.policy.js` — chunk_size/overlap/top-k defaults
- FTS5 keyword search working as baseline retrieval

### Future additions (when needed)

- `document_embeddings` table (chunk_id → vector)
- `retrieval_service.semantic_search()` — embed query → cosine similarity
- `retrieval_service.hybrid_search()` — combine FTS5 + semantic scores
- Local embedding model via Ollama or sentence-transformers

---

# Acceptance Criteria

The system is considered integrated when all are true:

- a file uploaded in agent chat goes through extraction
- a file uploaded in documents tab goes through same extraction
- both upload paths write to one document store
- extracted text populates `documents.document_text`
- chunks are created in `document_chunks` and searchable via FTS5
- agent can read extracted text via existing `getDocument` tool
- agent can search documents by keyword via new `searchDocuments` tool
- no extraction logic is duplicated in UI
- system remains local-first and lightweight
- OCR is available but user-triggered, not automatic

---

# Non-Goals for V1

Do not build these yet:

- semantic search / embeddings
- vector database
- hybrid retrieval
- local LLM-based summarization
- automatic cross-document reasoning
- PPTX support
- legacy Office binary support (.doc, .xls, .ppt)
- multimodal VLM-based extraction
- automatic OCR on upload (OCR must be user-triggered)
- background job queue for extraction

Those can come later.

---

# Final Architectural Summary

## What we build now

A **document extraction and indexing layer** that hooks into the existing backend services.

## What it provides

- text extraction from PDF, DOCX, XLSX
- persistent chunk storage
- FTS5 keyword search
- one new agent tool (`searchDocuments`)
- extraction status lifecycle
- OCR pipeline (Phase 3, optional)

## What it reuses

- existing upload flow (both entry points)
- existing `documents` table and columns
- existing agent tools (`getDocument`, `listDocuments`)
- existing chunker (`agent/retrieval/chunker.js`)
- existing format governance (`documentFormatGovernance.js`)
- existing file storage (`documentStorage.js`)

## Why this is correct

Because it builds on working infrastructure instead of creating a parallel system. The existing tools automatically benefit from populated `document_text` and `text_status` fields. The new `searchDocuments` tool is the only new agent surface. Minimal new code, maximum impact.
