# RAG System — Retrieval-Augmented Generation Plan

**Local-first, lightweight RAG for the Ordinay legal practice agent**

**Status: Phase R1 ✅ | Phase R2 ✅ | Phase R3 ✅ | Phase R4 ✅ | Phase R5 ✅ | Phase R6 ✅ — All phases complete**

**Depends on: DOCUMENT_ENGINE.MD (Phases 1-6 ✅ complete)**

---

## Problem

The agent currently injects **full document text** into every LLM call. This works for 1-2 small files but breaks when:

- A single document is large (50+ pages → 50k+ chars)
- Many documents exist in a session (5-10+ files)
- Both — the LLM context window fills up, answers degrade

Current behavior in `context.assembler.js`:

```text
User uploads 8 files to session
  → ALL 8 full texts injected into system messages
  → Token count explodes
  → LLM gets confused by irrelevant context
  → Response quality drops
```

---

## Goal

Replace full-text injection with **smart retrieval**: only send the LLM the chunks most relevant to the user's current question.

Keep it:
- **Local-first** — no cloud APIs, no external vector databases
- **Lightweight** — runs on weak laptops, no GPU required
- **Built on existing infrastructure** — most components already exist

---

## What Already Exists (Audit Summary)

### Built and Working

| Component | File | Status |
|-----------|------|--------|
| Text extraction pipeline | `documentExtraction.service.js` | ✅ Operational — PDF, DOCX, XLSX, images, OCR |
| Database chunk storage | `document_chunks` table | ✅ Populated by extraction pipeline |
| FTS5 keyword index | `fts_document_chunks` virtual table | ✅ Auto-synced via triggers |
| FTS5 search function | `documentExtraction.service.searchChunks()` | ✅ Used by `searchDocuments` tool |
| In-memory retrieval index | `agent/retrieval/retrieval.index.js` | ✅ Functional — cosine similarity search |
| Sparse embedder | `agent/retrieval/simple.embedder.js` | ✅ TF-IDF + bigrams, lightweight |
| Chunker | `agent/retrieval/chunker.js` | ✅ 700 char chunks, 140 char overlap |
| Context builder | `agent/retrieval/retrieval.context.js` | ✅ Formats retrieval results for LLM |
| Retrieval loader | `agent/retrieval/retrieval.loader.js` | ✅ Indexes session artifacts into memory |
| Retrieval runtime | `agent/retrieval/index.js` | ✅ Factory + disabled fallback |
| Retrieval policy | `agent/retrieval/retrieval.policy.js` | ✅ Configurable constants |
| Grounding/citations | `agent/grounding/` | ✅ Can track and cite retrieval sources |
| Context assembler | `agent/memory/context.assembler.js` | ✅ Already calls `retrievalRuntime.buildRetrievalContext()` |
| Agent tool | `searchDocuments.tool.js` | ✅ FTS5 keyword search for agent |

### Built but NOT Wired (The Gap)

| Component | Issue |
|-----------|-------|
| In-memory retrieval index | **Never populated** — `addOrReplaceBySource()` never called for document chunks |
| Session artifact indexing | **Never triggered** — `indexSessionArtifacts()` / `indexTurnArtifacts()` never called from loop |
| Retrieval context in LLM | **Always empty** — `buildRetrievalContext()` queries empty index, returns nothing |
| Document text injection | **Always full text** — no budget enforcement, no retrieval fallback |

### The Core Problem

```text
Extraction pipeline:
  Upload → Extract → Chunk → Store in document_chunks → FTS5 index ✅

In-memory retrieval:
  Create index → (nothing loaded) → Query returns empty → No retrieval context ❌

Context assembly:
  Full document text → Injected raw into messages → No budget → Blows up ❌
```

The extraction pipeline feeds the database. The retrieval system reads from memory. **Nothing bridges the two.**

---

## Architecture

### Target Flow

```text
User sends message in agent session
       │
       ▼
┌──────────────────────────────────────────┐
│  Context Assembler (build phase)          │
│                                          │
│  1. Count total session document chars    │
│  2. If total ≤ FULL_TEXT_BUDGET:          │
│     → Inject full text (current behavior) │
│  3. If total > FULL_TEXT_BUDGET:          │
│     → Switch to RAG mode:                │
│     a. Hydrate session docs into          │
│        in-memory retrieval index          │
│     b. Query index with user message      │
│     c. Also query FTS5 for keyword hits   │
│     d. Merge + deduplicate results        │
│     e. Inject top-K chunks as context     │
│     f. Add document manifest (names only) │
└──────────────────────────────────────────┘
```

### Key Design Decision: Hybrid Search (FTS5 + In-Memory)

Neither FTS5 nor sparse TF-IDF alone is sufficient:

| Approach | Strength | Weakness |
|----------|----------|----------|
| FTS5 keyword search | Exact term matching, fast, persistent | Misses paraphrases, no semantic understanding |
| TF-IDF sparse vectors | Handles partial overlaps, bigram proximity | Still keyword-based, no true semantics |
| **Hybrid (both)** | **Best of both** | Slightly more complex |

In V1, we combine both. In the future, the TF-IDF embedder can be swapped for a local neural model (via Ollama) without changing the architecture.

### What Changes vs What Stays

| Component | Change |
|-----------|--------|
| `context.assembler.js` | **Modified** — add budget check, RAG mode branch |
| `documentExtraction.service.js` | **Extended** — add `getChunksForDocuments(docIds)` |
| `retrieval.index.js` | No changes — already functional |
| `retrieval.context.js` | No changes — already formats results |
| `retrieval.policy.js` | **Extended** — add RAG-specific constants |
| `agent/retrieval/index.js` | No changes — runtime factory stays |
| `simple.embedder.js` | No changes — TF-IDF is V1 strategy |
| `searchDocuments.tool.js` | No changes — tool remains for explicit agent search |
| `agentDocuments.service.js` | **Extended** — add `getSessionDocumentIds()` helper |

---

## Implementation Phases

---

### Phase R1 — Budget Gate + Document Manifest

**Goal:** Stop injecting full text when it exceeds a character budget. Instead, inject a manifest (document names + summaries) so the LLM knows what's available.

**Changes to `context.assembler.js`:**

```text
Before document injection:
  1. Calculate total chars across all session documents
  2. If total ≤ RAG_FULL_TEXT_BUDGET (default 8000 chars):
     → Current behavior (inject full text, with turn-specific separation)
  3. If total > RAG_FULL_TEXT_BUDGET:
     → Inject document manifest instead:
       "Session has N documents. [name1 (PDF, 45 pages), name2 (DOCX, 12 pages), ...]"
       "Use the document content provided below or call searchDocuments for more."
     → Proceed to Phase R2 retrieval
```

**New constants in `retrieval.policy.js`:**

```javascript
RAG_FULL_TEXT_BUDGET: 8000,       // chars — below this, inject full text
RAG_CHUNK_BUDGET: 4000,           // chars — max retrieval context for chunks
RAG_TOP_K: 8,                     // max chunks to retrieve
RAG_MIN_SCORE: 0.08,              // minimum similarity score
RAG_MAX_CHUNKS_PER_DOC: 3,        // per-document chunk limit
RAG_CURRENT_DOC_BUDGET: 5000,     // chars — budget for current-turn documents
```

**Behavior:**
- Documents attached to the current turn get priority budget (`RAG_CURRENT_DOC_BUDGET`)
- If a single current-turn document fits in budget → inject full text for that document
- Background documents always get manifest + retrieval only
- The LLM can still call `searchDocuments` tool for explicit deep search

**Done criteria:**
- [x] Full text injection has a budget gate
- [x] Large sessions get manifest instead of full text
- [x] Current-turn documents get priority budget
- [x] No behavior change for small sessions (≤ 8000 chars total)

**Files modified:**
| File | Change |
|------|--------|
| `agent/retrieval/retrieval.policy.js` | Added RAG constants (RAG_FULL_TEXT_BUDGET, RAG_CURRENT_DOC_BUDGET, etc.) |
| `agent/memory/context.assembler.js` | Budget gate + RAG mode branch with manifest for background docs |
| `agent/engine/agentic.loop.ts` | Same budget gate logic (fallback path) |
| `.agent-build/agent/engine/agentic.loop.js` | Same budget gate logic (compiled fallback) |

---

### Phase R2 — Hydrate In-Memory Index from Database Chunks

**Goal:** Load document chunks from `document_chunks` table into the in-memory retrieval index so `buildRetrievalContext()` returns actual results.

**New function in `documentExtraction.service.js`:**

```javascript
/**
 * Get all chunks for a set of document IDs.
 * Used to hydrate the in-memory retrieval index for RAG.
 */
function getChunksForDocuments(documentIds) {
  // SELECT id, document_id, chunk_order, chunk_text, page_start, page_end,
  //        sheet_name, token_estimate
  // FROM document_chunks
  // WHERE document_id IN (...)
  // ORDER BY document_id, chunk_order
}
```

**Hydration logic in `context.assembler.js`:**

```text
When RAG mode is triggered (total chars > budget):
  1. Get session document IDs
  2. Check if documents are already in retrieval index (by documentId)
  3. If not: load chunks from database via getChunksForDocuments()
  4. Feed each chunk into retrievalIndex.addOrReplaceBySource()
  5. Index is now populated for this session's documents
```

**Caching strategy:**
- The retrieval index already has session-aware LRU caching
- Documents hydrated once stay in memory until evicted
- `RETRIEVAL_CACHE_MAX_SESSIONS=120` and `RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION=80` already enforce limits
- No re-hydration needed if document hasn't changed (fingerprint check in loader)

**Done criteria:**
- [x] Database chunks loaded into in-memory index for RAG sessions
- [x] Hydration is lazy (only when RAG mode triggers)
- [x] Hydration is cached (not repeated every turn)
- [x] Index eviction policies work correctly

**Implementation approach (simpler than planned):**
Instead of adding `getChunksForDocuments()` to the extraction service, we feed the full document text (already loaded by `buildAgentDocumentContext()`) directly into the retrieval index. The index handles chunking + embedding internally. This avoids a separate DB query and reuses the existing `addOrReplaceBySource()` pipeline.

**Files modified:**
| File | Change |
|------|--------|
| `agent/retrieval/index.js` | Added `hydrateDocument()` and `isDocumentHydrated()` to active + disabled runtimes |
| `agent/memory/context.assembler.js` | Pre-load docContext before retrieval, hydrate in RAG mode, reuse for injection |

---

### Phase R3 — Hybrid Chunk Retrieval

**Goal:** Query both the in-memory index (TF-IDF similarity) and FTS5 (keyword match), merge results, inject top-K chunks into LLM context.

**Retrieval flow:**

```text
User message: "what are the deadlines in the lease agreement?"
       │
       ├─ In-memory query (TF-IDF cosine similarity)
       │   → Returns chunks scored by semantic overlap
       │   → ["...tenant must notify within 30 days..." (0.72)]
       │   → ["...lease term expires December 2026..." (0.65)]
       │
       ├─ FTS5 query (keyword match)
       │   → Returns chunks matching "deadlines" OR "lease" OR "agreement"
       │   → ["...deadline for renewal is 90 days before..." (rank 1)]
       │   → ["...lease agreement dated January 2024..." (rank 2)]
       │
       └─ Merge + deduplicate
           → Score normalization: TF-IDF scores [0-1], FTS5 rank → normalized
           → Deduplicate by chunk_id
           → Sort by combined score
           → Take top RAG_TOP_K (8)
           → Enforce RAG_MAX_CHUNKS_PER_DOC (3)
           → Truncate to RAG_CHUNK_BUDGET (4000 chars)
```

**Merge strategy:**

```javascript
// Normalize FTS5 rank to [0, 1] range for combination
// FTS5 bm25() returns negative scores (lower = better match)
// Convert: normalizedScore = 1 / (1 + abs(rank))

// Combined score:
// - If chunk appears in both: max(tfidfScore, fts5Score) + 0.1 bonus
// - If chunk appears in one: that score only
```

**Context injection format:**

```text
[system message]
Relevant excerpts from session documents (retrieved by relevance to your question):

--- From: lease_agreement.pdf (page 4) ---
"...tenant must provide written notice of intent to renew no fewer than 90 days
before the lease term expiration date. Failure to notify constitutes..."

--- From: lease_agreement.pdf (page 12) ---
"...all maintenance requests must be submitted within 14 business days of
discovering the issue. Emergency repairs..."

--- From: addendum_2025.docx (page 1) ---
"...the renewal deadline specified in Section 4.2 is extended to 120 days
for the 2026-2027 term..."

Session documents available: lease_agreement.pdf, addendum_2025.docx, tenant_info.xlsx
(Use searchDocuments tool for deeper search if needed)
```

**Done criteria:**
- [x] Hybrid search combines FTS5 + in-memory results
- [x] Results are deduplicated by normalized chunk text (first 200 chars)
- [x] Scores are normalized and combined (TF-IDF weight 0.6, FTS5 weight 0.4, overlap bonus 0.1)
- [x] Top-K chunks injected with document labels and page info
- [x] Document manifest appended so LLM knows what else is available
- [x] Stays within `RAG_CHUNK_BUDGET`

**Files modified:**
| File | Change |
|------|--------|
| `agent/memory/context.assembler.js` | Added `buildRagHybridContext()` function, RAG-aware retrieval branch in `build()` |
| `agent/retrieval/retrieval.policy.js` | Added `RAG_FTS5_WEIGHT`, `RAG_TFIDF_WEIGHT`, `RAG_OVERLAP_BONUS` constants |

**Hybrid search algorithm:**
```
1. TF-IDF: query in-memory index (hydrated in R2) with user message → scored chunks
2. FTS5: query database keyword index with user message → ranked chunks
3. Normalize FTS5 rank: score = 1 / (1 + |rank|)
4. Merge by normalized chunk text (first 200 chars):
   - In TF-IDF only: combinedScore = tfidfScore × 0.6
   - In FTS5 only: combinedScore = fts5Score × 0.4
   - In both: combinedScore = max(tfidfScore, fts5Score) + 0.1 bonus
5. Filter by RAG_MIN_SCORE (0.08), enforce RAG_MAX_CHUNKS_PER_DOC (3)
6. Take top RAG_TOP_K (8) within RAG_CHUNK_BUDGET (4000 chars)
7. Format with document labels + page numbers
8. Append footer listing unshown session documents
```

---

### Phase R4 — Current-Turn Document Priority

**Goal:** Documents attached to the current message get special treatment — they should dominate the retrieval context regardless of query relevance.

**Logic:**

```text
Documents attached this turn (via metadata.documentIds):
  1. If single doc and total text ≤ RAG_CURRENT_DOC_BUDGET:
     → Inject full text (same as today for small docs)
  2. If single doc but text > RAG_CURRENT_DOC_BUDGET:
     → Retrieve chunks from THAT document only, scored by user message
     → Use full RAG_CHUNK_BUDGET for this one document
  3. If multiple docs attached this turn:
     → Split RAG_CHUNK_BUDGET proportionally
     → Retrieve from each, merge

Background documents (not attached this turn):
  → Always retrieval-only (never full text in RAG mode)
  → Share remaining budget after current-turn docs
  → Appear in manifest
```

**This preserves the current UX:**
- "What does this file say?" → gets full text or dense chunks of THAT file
- "Compare these two files" → gets chunks from both attached files
- "What's the deadline?" (no attachment) → retrieves from all session docs

**Done criteria:**
- [x] Current-turn documents get priority budget
- [x] Small current-turn docs still get full text
- [x] Large current-turn docs get focused retrieval (boosted chunks + reference note)
- [x] Background docs are retrieval-only in RAG mode

**Implementation details:**

Three mechanisms ensure current-turn document priority:

1. **Score boost (+0.25)**: Chunks from current-turn documents get `RAG_CURRENT_TURN_BOOST = 0.25` added to their combined score, making them rank higher than equally-relevant background chunks.

2. **Sort priority**: At equal scores, current-turn chunks sort before background chunks (tie-breaker favors current turn).

3. **Relaxed per-doc limit**: Current-turn documents get `RAG_MAX_CHUNKS_PER_DOC × 2` (6 chunks) vs the normal limit (3 chunks), giving them more representation in results.

For document injection in RAG mode:
- Small current-turn docs (≤ `RAG_CURRENT_DOC_BUDGET`): full text injected as before
- Large current-turn docs: no truncation. Instead, a note tells the LLM which docs were just attached and that relevant excerpts are in the retrieved context above.
- Background docs: manifest only (name, type, size)

**Files modified:**
| File | Change |
|------|--------|
| `agent/memory/context.assembler.js` | `buildRagHybridContext` accepts `turnDocIds`, boost/sort/limit logic; document injection simplified for large current-turn docs |

---

### Phase R5 — Session Artifact Indexing

**Goal:** Index conversation history (turns, summaries) into the retrieval index so the agent can recall earlier conversation context when it falls outside the recent turns window.

**Wire existing `retrieval.loader.js`:**

```text
After each turn completes:
  1. Call retrievalLoader.indexTurnArtifacts(session, turn)
  2. This indexes the user message + assistant response
  3. Older turns that fall outside MAX_RECENT_TURNS become searchable via retrieval

On session load:
  1. Call retrievalLoader.indexSessionArtifacts(session)
  2. This indexes session summary + history entries
```

**Integration point:** The agentic loop or context assembler triggers indexing after the turn is recorded.

**This uses existing code that is built but never called.**

**Done criteria:**
- [x] Turn messages are indexed after each turn (already wired in `agentic.loop.ts:1822-1842` via `runMemoryMaintenance`)
- [x] Session summary is indexed on session load (added to `sse.handler.ts` in `getOrCreateSession` flow)
- [x] Old conversation context is retrievable via similarity search (retrieval index + context builder already support this)
- [x] No duplicate indexing (fingerprint check already exists in `retrieval.loader.js`)

**Implementation notes:**
- Turn-level indexing was already wired in `agentic.loop.ts` `runMemoryMaintenance()` — calls both `indexSessionArtifacts` and `indexTurnArtifacts` after each turn
- Session-level indexing added to `sse.handler.ts` (line ~127) — calls `runtime.retrieval.indexSessionArtifacts(session)` right after `getOrCreateSession` returns
- Same change synced to `.agent-build/agent/transport/sse.handler.js`
- Non-fatal try/catch so retrieval failures never block the agent turn

---

### Phase R6 — Observability + Tuning

**Goal:** Make RAG decisions visible for debugging and tuning.

**Logging:**

```text
[RAG] session=abc123 mode=rag total_chars=45000 budget=8000
[RAG] hydrated 3 documents (142 chunks) into retrieval index
[RAG] query="what are the deadlines" tfidf_hits=4 fts5_hits=6 merged=7 injected=5
[RAG] budget: current_turn=2400/5000 background=1600/4000
```

**Metrics (added to retrieval stats):**

```javascript
{
  ragActivations: number,     // how often RAG mode triggered
  fullTextInjections: number, // how often full text was used
  avgChunksInjected: number,  // average chunks per RAG query
  avgRetrievalScore: number,  // average top chunk score
  hydrationCount: number,     // times docs were loaded into index
  hydrationCacheHits: number, // times hydration was skipped (already loaded)
}
```

**Done criteria:**
- [x] RAG mode decisions are logged (4 log lines: mode decision, hydration, hybrid search breakdown, budget breakdown)
- [x] Retrieval stats include RAG-specific metrics (performance snapshot `rag` section + `caches.ragStats`)
- [x] Can debug why specific chunks were or weren't retrieved (hybrid search log shows tfidf/fts5/overlap/current-turn counts, budget log shows char usage)

**Implementation notes:**
- 4 `[RAG]` log lines in `context.assembler.js`: mode decision (R1), hydration count (R2), hybrid search stats (R3), budget breakdown (R6)
- `ragStats` accumulator in context assembler tracks: activations, full-text injections, chunks injected, avg score, hydrations, cache hits
- `getRagStats()` method exposed on context assembler, registered as cache provider via `runtime.factory.ts`
- `profile.snapshot.js` reads RAG stats from `caches.ragStats` and computes derived rates (activationRate, avgChunksInjected, avgScore)
- `metrics.aggregator.js` has RAG counter fields ready for future per-turn metric wiring if needed

---

## Future Enhancements (Not in V1)

### Neural Embeddings via Ollama

Replace `simple.embedder.js` with a local embedding model:

```text
Current:  text → TF-IDF sparse vector → cosine similarity
Future:   text → Ollama embedding model → dense vector → cosine similarity
```

Candidates:
- `nomic-embed-text` (137M params, fast, good multilingual)
- `mxbai-embed-large` (335M params, better quality)
- `snowflake-arctic-embed` (optimized for retrieval)

**Architecture change:** Only `simple.embedder.js` gets replaced. Everything else (index, context builder, policy) stays the same because the retrieval index already uses cosine similarity on vectors.

The in-memory index would need to switch from sparse object vectors to dense float arrays, but the `query()` and `addOrReplaceBySource()` interfaces stay identical.

### Cross-Session Document Sharing

Currently each session has its own document set. Future: allow agent to search ALL documents the user has ever uploaded, scoped by permissions.

### Automatic Summarization

For very large documents (100+ pages), auto-generate a 1-page summary using the LLM. Store in `artifact_json`. Use summary for manifest instead of just filename.

### Re-ranking

After initial retrieval, use the LLM to re-rank chunks by relevance before injection. Expensive but more accurate. Only worth it for complex multi-document queries.

---

## Policy Constants Reference

### Existing (from `retrieval.policy.js`)

```javascript
RETRIEVAL_ENABLED: true,
RETRIEVAL_TOP_K: 6,
RETRIEVAL_MAX_CHARS: 1400,
RETRIEVAL_MIN_SCORE: 0.1,
RETRIEVAL_MAX_CHUNKS_PER_DOC: 2,
RETRIEVAL_CHUNK_SIZE: 700,
RETRIEVAL_CHUNK_OVERLAP: 140,
RETRIEVAL_CACHE_MAX_SESSIONS: 120,
RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: 80,
```

### New RAG Constants (to add)

```javascript
RAG_FULL_TEXT_BUDGET: 8000,       // chars — below this, full text injection
RAG_CHUNK_BUDGET: 4000,           // chars — max retrieval chunks in context
RAG_TOP_K: 8,                     // max chunks to retrieve
RAG_MIN_SCORE: 0.08,              // minimum score for chunk inclusion
RAG_MAX_CHUNKS_PER_DOC: 3,        // per-document limit in RAG results
RAG_CURRENT_DOC_BUDGET: 5000,     // chars — priority budget for current-turn docs
RAG_FTS5_WEIGHT: 0.4,             // weight for FTS5 scores in hybrid merge
RAG_TFIDF_WEIGHT: 0.6,            // weight for TF-IDF scores in hybrid merge
RAG_OVERLAP_BONUS: 0.1,           // bonus for chunks found by both methods
```

---

## File Inventory

### Files to Modify

| File | Change |
|------|--------|
| `agent/memory/context.assembler.js` | Add budget gate, RAG mode branch, hydration trigger, chunk injection |
| `agent/retrieval/retrieval.policy.js` | Add RAG constants |
| `services/documentExtraction.service.js` | Add `getChunksForDocuments(docIds)` |
| `services/agentDocuments.service.js` | Add `getSessionDocumentIds(sessionId)` helper |

### Files That Stay Unchanged

| File | Why |
|------|-----|
| `agent/retrieval/retrieval.index.js` | Already functional — just needs to be populated |
| `agent/retrieval/simple.embedder.js` | TF-IDF is V1 strategy — works, swappable later |
| `agent/retrieval/retrieval.context.js` | Already formats results for LLM |
| `agent/retrieval/retrieval.loader.js` | Already indexes artifacts — just needs to be called |
| `agent/retrieval/chunker.js` | Already used by extraction pipeline |
| `agent/retrieval/index.js` | Factory stays the same |
| `agent/grounding/` | Citation tracking already works with retrieval |
| `agent/tools/read/searchDocuments.tool.js` | Explicit search tool stays for deep queries |

### No New Files

All changes fit into existing files. The RAG logic lives in `context.assembler.js` (the decision point) and uses existing retrieval infrastructure.

---

## Testing Strategy

### Unit Tests

- Budget gate: verify threshold triggers RAG mode
- Hybrid merge: verify score normalization and deduplication
- Document manifest: verify format with various document counts
- Priority logic: verify current-turn docs get priority budget

### Integration Tests

- Upload 10 documents → ask question → verify only relevant chunks returned
- Upload large PDF (100 pages) → verify RAG mode activates, full text NOT injected
- Upload small file (< 8000 chars) → verify full text injection still works
- Upload file + ask about it → verify current-turn priority
- Multi-turn: ask about doc A, then doc B → verify context switches correctly

### Performance Tests

- Hydration time: measure loading 100 documents (1000+ chunks) into memory index
- Query latency: measure hybrid search time for typical legal queries
- Memory usage: monitor index size with 80 documents per session

---

## Acceptance Criteria

The RAG system is complete when:

1. Sessions with small total document text (≤ 8000 chars) behave exactly as today
2. Sessions with large total text automatically switch to retrieval mode
3. Retrieved chunks are relevant to the user's question
4. Current-turn documents get priority in retrieval context
5. The LLM knows what documents exist (manifest) even when full text isn't injected
6. FTS5 and in-memory search both contribute to results
7. Retrieval decisions are logged for debugging
8. Memory usage stays bounded (existing cache eviction works)
9. No new dependencies — uses existing libraries
10. Runs on weak laptops without degradation

---

## Relationship to DOCUMENT_ENGINE.MD

```text
DOCUMENT_ENGINE.MD (Extraction Layer)
  Upload → Extract → Chunk → Store → FTS5 Index
  This is the DATA PIPELINE. It creates the raw material.

RAG_SYSTEM.MD (Retrieval Layer)
  Query → Hydrate → Search → Rank → Inject
  This is the QUERY PIPELINE. It selects what the LLM sees.
```

The extraction layer feeds the retrieval layer. They are separate concerns:
- Extraction runs at upload time (once per document)
- Retrieval runs at query time (every turn in RAG mode)

Both share the same infrastructure: `document_chunks` table, `chunker.js`, `retrieval.policy.js`.
