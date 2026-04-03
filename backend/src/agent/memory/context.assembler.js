"use strict";

const {
  MAX_ENTITY_DIGEST_CHARS,
  MAX_ENTITY_DIGEST_ITEMS,
  MAX_RECENT_TURNS,
} = require("./memory.policy");
const {
  buildDeterministicKey,
  stableStringify,
} = require("../performance/hotpath.optimizer");
const {
  RAG_FULL_TEXT_BUDGET,
  RAG_CURRENT_DOC_BUDGET,
  RAG_CHUNK_BUDGET,
  RAG_TOP_K,
  RAG_MIN_SCORE,
  RAG_MAX_CHUNKS_PER_DOC,
  RAG_FTS5_WEIGHT,
  RAG_TFIDF_WEIGHT,
  RAG_OVERLAP_BONUS,
} = require("../retrieval/retrieval.policy");

let _agentDocumentsService;
try {
  _agentDocumentsService = require("../../services/agentDocuments.service");
} catch (_e) {
  _agentDocumentsService = null;
}

let _extractionService;
try {
  _extractionService = require("../../services/documentExtraction.service");
} catch (_e) {
  _extractionService = null;
}

const ALLOWED_ROLES = new Set(["system", "user", "assistant", "tool"]);
const READ_POLICY_INSTRUCTIONS = [
  "DATA ACCESS POLICY",
  "",
  "The system manages structured legal practice data stored in the database.",
  "",
  "When a user question references any of the following:",
  "",
  "- client",
  "- dossier",
  "- lawsuit",
  "- task",
  "- document",
  "- financial entry",
  "- notification",
  "- history event",
  "- workload",
  "- cases",
  "- deadlines",
  "- sessions",
  "",
  "the information must be retrieved using READ tools.",
  "",
  "Never infer database state without retrieving it.",
  "",
  "If a question refers to database records, the agent must use READ tools before producing the final answer.",
  "",
  "Questions about general legal knowledge, concepts, or explanations do not require tools.",
  "",
  "This rule guides tool usage but does not enforce it programmatically.",
  "",
  "GRAPH TRAVERSAL GUIDELINES",
  "",
  "Entity relationships in the system:",
  "",
  "Client -> Dossiers -> Lawsuits -> Tasks/Sessions",
  "Dossier -> Tasks / Sessions / Documents",
  "Lawsuit -> Sessions",
  "Document -> History",
  "",
  "Recommended traversal depths:",
  "",
  "- Client workload queries: depth 2-3",
  "- Dossier context queries: depth 1-2",
  "- Document history queries: depth 1",
  "",
  "Avoid shallow traversal when the user asks about workload, cases, or related activity.",
  "",
  "PRESENTATION QUALITY GUIDELINES",
  "",
  "Use the format (table, bullets, or concise prose) that is most readable for the current answer.",
  "Keep one consistent date/time style in a response and prefer explicit UTC labels for database-derived timestamps.",
  "Do not output raw JSON, tool payload wrappers, or stream-event fragments in user-facing text.",
  "Keep sections compact and non-redundant; avoid repeating the same fact in multiple sections.",
  "If data is partial or uncertain, state that clearly instead of filling gaps with assumptions.",
  "",
  "INTERNAL IDENTIFIER POLICY",
  "",
  "Never include internal database identifiers (numeric IDs such as id, client_id, dossier_id, task_id, entity_id, etc.) in any user-facing output.",
  "These are system-internal values and must never appear in response text, tables, structured data, or field labels.",
  "When referring to entities, use their human-readable attributes: name, title, reference code, date, or description.",
  "This rule applies to all entity types without exception.",
  "",
  "PLAN-FIRST MUTATION POLICY",
  "",
  "For create/update/delete mutation intent on database entities:",
  "- Use PLAN tools only: proposeCreate, proposeUpdate, proposeDelete.",
  "- Do NOT call WRITE or EXECUTE tools to initiate mutations.",
  "- PLAN tools only prepare proposals; they never write to the database directly.",
  "- Never say a mutation is completed before explicit user confirmation and execution result.",
  "- If the user amends a pending mutation, call a PLAN tool again with revised args to replace the pending proposal.",
  "",
  "SUGGESTION POLICY (when suggestAction tool is available)",
  "",
  "Priority order for suggestion behavior:",
  "1) Safety and constraints first (permission, policy, and non-mutating guarantees).",
  "2) Disambiguation and missing-context clarification second.",
  "3) Suggestion only after safety and disambiguation are satisfied.",
  "",
  "Suggestion rules:",
  "- At most one suggestAction call per turn.",
  "- Suggestions must be specific and grounded in current session context.",
  "- suggestion_artifact is advisory only; it must not create pending actions or execute mutations.",
  "",
  "Anti-noise rule:",
  "- If the user request is explicit and complete (clear direct command + clear target + sufficient details), skip suggestAction and continue with normal flow.",
  "- For explicit draft requests, proceed with draft flow and generateDraft when details/context are sufficient.",
  "- For explicit mutation requests, proceed with PLAN flow (proposeCreate/proposeUpdate/proposeDelete).",
  "- Do not inject proactive suggestions into confirmation/rejection/amendment handling unless explicitly requested.",
].join("\n");

function createContextAssembler(options = {}) {
  const maxRecentTurns = normalizePositiveInt(options.maxRecentTurns, MAX_RECENT_TURNS);
  const maxEntityItems = normalizePositiveInt(options.maxEntityItems, MAX_ENTITY_DIGEST_ITEMS);
  const maxEntityChars = normalizePositiveInt(options.maxEntityChars, MAX_ENTITY_DIGEST_CHARS);
  const retrievalRuntime = options.retrievalRuntime;
  const groundingRuntime = options.groundingRuntime;
  const operationsRuntime = options.operationsRuntime;
  const summaryBlockCache = normalizeCache(options.summaryBlockCache);
  const entityDigestCache = normalizeCache(options.entityDigestCache);
  const pendingBlockCache = normalizeCache(options.pendingBlockCache);
  const cacheStats = {
    summary: { hits: 0, misses: 0 },
    entities: { hits: 0, misses: 0 },
    pending: { hits: 0, misses: 0 },
  };
  const ragStats = {
    ragActivations: 0,
    fullTextInjections: 0,
    ragChunksInjectedTotal: 0,
    ragChunksInjectedSamples: 0,
    ragScoreTotal: 0,
    ragScoreSamples: 0,
    ragHydrations: 0,
    ragHydrationCacheHits: 0,
  };

  return {
    build(session, input) {
      const messages = [];
      messages.push({
        role: "system",
        content: READ_POLICY_INSTRUCTIONS,
      });
      const turnId = normalizeTurnId(input?.turnId);
      const sessionId = String(session?.id || "").trim();
      if (groundingRuntime && turnId && typeof groundingRuntime.beginTurn === "function") {
        groundingRuntime.beginTurn(turnId);
      }

      const summary = String(session?.summary || "").trim();
      if (summary) {
        if (
          groundingRuntime &&
          turnId &&
          typeof groundingRuntime.registerSummary === "function"
        ) {
          groundingRuntime.registerSummary({
            turnId,
            sessionId,
            summary,
          });
        }

        const summaryBlock = getCachedPureValue({
          cache: summaryBlockCache,
          cacheKey: buildDeterministicKey(["summary_block", summary]),
          statsBucket: cacheStats.summary,
          compute: () => `Conversation summary:\n${summary}`,
        });
        messages.push({
          role: "system",
          content: summaryBlock,
        });
      }

      const entityDigest = getCachedPureValue({
        cache: entityDigestCache,
        cacheKey: buildDeterministicKey([
          "entity_digest",
          maxEntityItems,
          maxEntityChars,
          stableStringify(buildEntityDigestCacheInput(session?.activeEntities)),
        ]),
        statsBucket: cacheStats.entities,
        compute: () => buildEntityDigest(session?.activeEntities, maxEntityItems, maxEntityChars),
      });
      if (entityDigest) {
        messages.push({
          role: "system",
          content: `Active entities:\n${entityDigest}`,
        });
      }

      const pending = session?.state?.pendingAction;
      if (pending && typeof pending === "object") {
        const pendingBlock = getCachedPureValue({
          cache: pendingBlockCache,
          cacheKey: buildDeterministicKey([
            "pending_block",
            stableStringify({
              toolName: pending.toolName,
              summary: pending.summary,
            }),
          ]),
          statsBucket: cacheStats.pending,
          compute: () =>
            [
              "Pending action awaiting confirmation:",
              `- Tool: ${String(pending.toolName || "unknown")}`,
              `- Summary: ${String(pending.summary || "")}`,
            ].join("\n"),
        });
        messages.push({
          role: "system",
          content: pendingBlock,
        });
      }

      // Pre-load session documents for budget check and potential RAG hydration.
      // This docContext is reused later for document injection.
      let _docContext = null;
      let _ragMode = false;
      try {
        if (_agentDocumentsService && typeof _agentDocumentsService.buildAgentDocumentContext === "function") {
          const resolvedSid = String(session?.id || input?.sessionId || "").trim();
          _docContext = _agentDocumentsService.buildAgentDocumentContext(resolvedSid);
          if (_docContext && Array.isArray(_docContext.documents) && _docContext.documents.length > 0) {
            let totalChars = 0;
            for (const doc of _docContext.documents) {
              if (doc.has_text && doc.text) totalChars += doc.text.length;
            }
            _ragMode = totalChars > RAG_FULL_TEXT_BUDGET;
            if (_ragMode) {
              ragStats.ragActivations += 1;
              console.info(`[RAG] session=${resolvedSid} mode=rag total_chars=${totalChars} budget=${RAG_FULL_TEXT_BUDGET} docs=${_docContext.documents.length}`);
            } else {
              ragStats.fullTextInjections += 1;
            }
            // Hydrate documents into retrieval index so buildRetrievalContext finds them
            if (_ragMode && retrievalRuntime && typeof retrievalRuntime.hydrateDocument === "function") {
              let hydrated = 0;
              for (const doc of _docContext.documents) {
                if (!doc.has_text || !doc.text) continue;
                const result = retrievalRuntime.hydrateDocument({
                  documentId: String(doc.document_id),
                  text: doc.text,
                  metadata: {
                    sourceLabel: doc.original_filename || doc.title || `doc-${doc.document_id}`,
                    sessionId: resolvedSid,
                    mimeType: doc.mime_type,
                  },
                });
                if (result && result.chunkCount > 0) {
                  hydrated++;
                  ragStats.ragHydrations += 1;
                } else {
                  ragStats.ragHydrationCacheHits += 1;
                }
              }
              if (hydrated > 0) {
                console.info(`[RAG] hydrated ${hydrated} documents into retrieval index for session=${resolvedSid}`);
              }
            }
          }
        }
      } catch (_preloadErr) {
        // Non-critical: continue without pre-loaded doc context
      }

      // Retrieval context: in RAG mode, run hybrid search (TF-IDF + FTS5).
      // In non-RAG mode, use existing retrieval pipeline (session artifacts).
      if (_ragMode) {
        const inputMeta = (input && typeof input === "object") ? input.metadata : null;
        const _turnDocIds = new Set(
          Array.isArray(inputMeta?.documentIds) ? inputMeta.documentIds.map(Number) : []
        );
        const ragContext = buildRagHybridContext(
          retrievalRuntime,
          _extractionService,
          _docContext,
          input,
          _turnDocIds,
          ragStats,
        );
        if (ragContext) {
          messages.push({
            role: "system",
            content: ragContext,
          });
        }
      } else {
        const retrievalPayload = buildRetrievalContextPayload(
          retrievalRuntime,
          operationsRuntime,
          session,
          input,
        );
        if (retrievalPayload.text) {
          const grounded = wrapGroundedContext({
            groundingRuntime,
            turnId,
            session,
            retrievalText: retrievalPayload.text,
            retrievalMatches: retrievalPayload.matches,
          });
          if (grounded.text) {
            messages.push({
              role: "system",
              content: grounded.text,
            });
          } else {
            messages.push({
              role: "system",
              content: `Retrieved context:\n${retrievalPayload.text}`,
            });
          }
        }
      }

      const turns = Array.isArray(session?.turns) ? session.turns.slice(-maxRecentTurns) : [];
      for (const turn of turns) {
        const role = normalizeRole(turn?.role);
        const content = String(turn?.message || "").trim();
        if (!content) {
          continue;
        }
        messages.push({ role, content });
      }

      // Inject attached session document content so the LLM can reason about them.
      // Budget gate: if total text exceeds RAG_FULL_TEXT_BUDGET, inject manifest
      // instead of full text for background docs. Current-turn docs get priority.
      // Reuse _docContext loaded earlier for RAG hydration (avoids double DB query).
      try {
        const docContext = _docContext;
        if (docContext && Array.isArray(docContext.documents) && docContext.documents.length > 0) {
            const metadata = (input && typeof input === "object") ? input.metadata : null;
            const turnDocIds = new Set(
              Array.isArray(metadata?.documentIds) ? metadata.documentIds.map(Number) : []
            );

            // Separate current-turn vs background documents
            const currentDocs = [];
            const backgroundDocs = [];
            for (const doc of docContext.documents) {
              if (turnDocIds.size > 0 && turnDocIds.has(doc.document_id)) {
                currentDocs.push(doc);
              } else {
                backgroundDocs.push(doc);
              }
            }

            const useFullText = !_ragMode;

            if (useFullText) {
              // Under budget — inject full text (original behavior)
              const currentParts = [];
              const backgroundParts = [];
              for (const doc of docContext.documents) {
                const label = doc.original_filename || doc.title;
                const line = doc.has_text && doc.text
                  ? `--- Document: ${label} (${doc.mime_type}) ---\n${doc.text}`
                  : `--- Document: ${label} (${doc.mime_type}) --- [text not available: ${doc.text_status}]`;
                if (turnDocIds.size > 0 && turnDocIds.has(doc.document_id)) {
                  currentParts.push(line);
                } else {
                  backgroundParts.push(line);
                }
              }

              if (turnDocIds.size > 0 && currentParts.length > 0) {
                messages.push({
                  role: "system",
                  content: `Documents attached to the current message (focus your answer on these):\n\n${currentParts.join("\n\n")}`,
                });
                if (backgroundParts.length > 0) {
                  messages.push({
                    role: "system",
                    content: `Other session documents (for reference only, the user is NOT asking about these right now):\n\n${backgroundParts.join("\n\n")}`,
                  });
                }
              } else {
                const allParts = [...currentParts, ...backgroundParts];
                if (allParts.length > 0) {
                  messages.push({
                    role: "system",
                    content: `Session documents available for reference:\n\n${allParts.join("\n\n")}`,
                  });
                }
              }
            } else {
              // Over budget — RAG mode: hybrid retrieval already injected above.
              // Current-turn docs: full text if small, otherwise reference retrieval.
              // Background docs: manifest only.

              if (currentDocs.length > 0) {
                let currentChars = 0;
                for (const doc of currentDocs) {
                  if (doc.has_text && doc.text) currentChars += doc.text.length;
                }

                if (currentChars <= RAG_CURRENT_DOC_BUDGET) {
                  // Current-turn docs fit in priority budget — inject full text
                  const parts = [];
                  for (const doc of currentDocs) {
                    const label = doc.original_filename || doc.title;
                    parts.push(doc.has_text && doc.text
                      ? `--- Document: ${label} (${doc.mime_type}) ---\n${doc.text}`
                      : `--- Document: ${label} (${doc.mime_type}) --- [text not available: ${doc.text_status}]`);
                  }
                  messages.push({
                    role: "system",
                    content: `Documents attached to the current message (focus your answer on these):\n\n${parts.join("\n\n")}`,
                  });
                } else {
                  // Current-turn docs too large for full text — retrieval above has
                  // prioritized chunks from these docs. Just note which docs are attached.
                  const docNames = currentDocs.map((d) => d.original_filename || d.title).join(", ");
                  messages.push({
                    role: "system",
                    content: `The user just attached: ${docNames}. Relevant excerpts from ${currentDocs.length === 1 ? "this document" : "these documents"} are included in the retrieved context above. Focus your answer on ${currentDocs.length === 1 ? "this document" : "these documents"}. Use searchDocuments tool if you need more detail.`,
                  });
                }
              }

              // Background documents: manifest only (no full text)
              if (backgroundDocs.length > 0) {
                const manifestLines = [];
                for (const doc of backgroundDocs) {
                  const label = doc.original_filename || doc.title;
                  const status = doc.has_text ? "readable" : (doc.text_status || "unknown");
                  const size = doc.text ? `${Math.round(doc.text.length / 1000)}k chars` : "no text";
                  manifestLines.push(`- ${label} (${doc.mime_type}, ${status}, ${size})`);
                }
                messages.push({
                  role: "system",
                  content: `Other session documents (available for reference — use searchDocuments tool to search their content):\n\n${manifestLines.join("\n")}`,
                });
              }
            }
          }
      } catch (_docErr) {
        // Non-critical: continue without document context
      }

      messages.push({
        role: "user",
        content: String(input?.message || "").trim(),
      });

      return messages;
    },
    getCacheStats() {
      return {
        summaryBlock: buildStatsRow("summaryBlock", summaryBlockCache, cacheStats.summary),
        entityDigest: buildStatsRow("entityDigest", entityDigestCache, cacheStats.entities),
        pendingBlock: buildStatsRow("pendingBlock", pendingBlockCache, cacheStats.pending),
      };
    },
    getRagStats() {
      return { ...ragStats };
    },
  };
}

const RAG_CURRENT_TURN_BOOST = 0.25;

function buildRagHybridContext(retrievalRuntime, extractionService, docContext, input, turnDocIds, stats) {
  const userMessage = String(input?.message || "").trim();
  if (!userMessage) return "";
  const safeTurnDocIds = turnDocIds instanceof Set ? turnDocIds : new Set();

  // Collect session document IDs for scoping FTS5 results
  const sessionDocIds = new Set();
  if (docContext && Array.isArray(docContext.documents)) {
    for (const doc of docContext.documents) {
      sessionDocIds.add(Number(doc.document_id));
    }
  }
  if (sessionDocIds.size === 0) return "";

  // Build a filename lookup for labeling
  const docLabels = new Map();
  for (const doc of docContext.documents) {
    docLabels.set(Number(doc.document_id), doc.original_filename || doc.title || `doc-${doc.document_id}`);
  }

  // --- Source 1: In-memory TF-IDF retrieval (already hydrated in R2) ---
  const tfidfResults = [];
  try {
    if (retrievalRuntime && typeof retrievalRuntime.buildRetrievalContext === "function" && retrievalRuntime.isEnabled()) {
      const ctx = retrievalRuntime.buildRetrievalContext({ input });
      if (ctx && Array.isArray(ctx.matches)) {
        for (const match of ctx.matches) {
          const docId = Number(match.documentId);
          if (!sessionDocIds.has(docId)) continue;
          tfidfResults.push({
            chunkKey: normalizeChunkKey(match.text),
            documentId: docId,
            text: String(match.text || ""),
            score: Number(match.score || 0),
            source: "tfidf",
            pageStart: null,
            pageEnd: null,
          });
        }
      }
    }
  } catch (_tfidfErr) {
    // Non-critical
  }

  // --- Source 2: FTS5 keyword search ---
  const fts5Results = [];
  try {
    if (extractionService && typeof extractionService.searchChunks === "function") {
      const rows = extractionService.searchChunks({ query: userMessage, limit: RAG_TOP_K * 2 });
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const docId = Number(row.document_id);
          if (!sessionDocIds.has(docId)) continue;
          // Normalize FTS5 rank to [0,1]: rank is negative, lower = better
          const normalizedScore = 1 / (1 + Math.abs(Number(row.rank || 0)));
          fts5Results.push({
            chunkKey: normalizeChunkKey(row.chunk_text),
            documentId: docId,
            text: String(row.chunk_text || ""),
            score: normalizedScore,
            source: "fts5",
            pageStart: row.page_start || null,
            pageEnd: row.page_end || null,
          });
        }
      }
    }
  } catch (_fts5Err) {
    // Non-critical
  }

  if (tfidfResults.length === 0 && fts5Results.length === 0) return "";

  // --- Merge + deduplicate ---
  const merged = new Map(); // chunkKey → combined result
  for (const r of tfidfResults) {
    const isCurrent = safeTurnDocIds.has(r.documentId);
    merged.set(r.chunkKey, {
      ...r,
      tfidfScore: r.score,
      fts5Score: 0,
      isCurrentTurn: isCurrent,
      combinedScore: r.score * RAG_TFIDF_WEIGHT + (isCurrent ? RAG_CURRENT_TURN_BOOST : 0),
    });
  }
  for (const r of fts5Results) {
    const isCurrent = safeTurnDocIds.has(r.documentId);
    const existing = merged.get(r.chunkKey);
    if (existing) {
      // Found in both sources — boost
      existing.fts5Score = r.score;
      existing.combinedScore = Math.max(existing.tfidfScore, r.score) + RAG_OVERLAP_BONUS + (existing.isCurrentTurn ? RAG_CURRENT_TURN_BOOST : 0);
      if (r.pageStart && !existing.pageStart) existing.pageStart = r.pageStart;
      if (r.pageEnd && !existing.pageEnd) existing.pageEnd = r.pageEnd;
    } else {
      merged.set(r.chunkKey, {
        ...r,
        tfidfScore: 0,
        fts5Score: r.score,
        isCurrentTurn: isCurrent,
        combinedScore: r.score * RAG_FTS5_WEIGHT + (isCurrent ? RAG_CURRENT_TURN_BOOST : 0),
      });
    }
  }

  // Sort: current-turn docs first at equal score, then by combined score
  const sorted = [...merged.values()]
    .filter((r) => r.combinedScore >= RAG_MIN_SCORE)
    .sort((a, b) => {
      if (a.isCurrentTurn !== b.isCurrentTurn) return a.isCurrentTurn ? -1 : 1;
      return b.combinedScore - a.combinedScore;
    });

  // Enforce per-document limit + top-K + budget
  // Current-turn docs get relaxed per-doc limit (double)
  const perDocCount = new Map();
  const selected = [];
  let usedChars = 0;

  for (const chunk of sorted) {
    const maxPerDoc = chunk.isCurrentTurn ? RAG_MAX_CHUNKS_PER_DOC * 2 : RAG_MAX_CHUNKS_PER_DOC;
    const docCount = perDocCount.get(chunk.documentId) || 0;
    if (docCount >= maxPerDoc) continue;
    if (selected.length >= RAG_TOP_K) break;
    if (usedChars + chunk.text.length > RAG_CHUNK_BUDGET) {
      if (selected.length > 0) break;
    }

    selected.push(chunk);
    perDocCount.set(chunk.documentId, docCount + 1);
    usedChars += chunk.text.length;
  }

  if (selected.length === 0) return "";

  // --- Format ---
  const lines = [];
  for (const chunk of selected) {
    const label = docLabels.get(chunk.documentId) || `doc-${chunk.documentId}`;
    const pagePart = chunk.pageStart ? ` (page ${chunk.pageStart}${chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `-${chunk.pageEnd}` : ""})` : "";
    lines.push(`--- From: ${label}${pagePart} ---\n${chunk.text}`);
  }

  const remainingDocs = [];
  for (const [docId, label] of docLabels) {
    if (!perDocCount.has(docId)) {
      remainingDocs.push(label);
    }
  }

  let footer = "";
  if (remainingDocs.length > 0) {
    footer = `\n\nOther session documents not shown above: ${remainingDocs.join(", ")}\n(Use searchDocuments tool for deeper search if needed)`;
  }

  const tfidfCount = selected.filter((s) => s.tfidfScore > 0).length;
  const fts5Count = selected.filter((s) => s.fts5Score > 0).length;
  const overlapCount = selected.filter((s) => s.tfidfScore > 0 && s.fts5Score > 0).length;
  const currentTurnCount = selected.filter((s) => s.isCurrentTurn).length;
  const currentTurnChars = selected.filter((s) => s.isCurrentTurn).reduce((sum, s) => sum + s.text.length, 0);
  const backgroundChars = usedChars - currentTurnChars;
  console.info(`[RAG] hybrid search: tfidf=${tfidfCount} fts5=${fts5Count} overlap=${overlapCount} current_turn=${currentTurnCount} selected=${selected.length}/${sorted.length}`);
  console.info(`[RAG] budget: current_turn=${currentTurnChars}/${RAG_CURRENT_DOC_BUDGET} background=${backgroundChars}/${RAG_CHUNK_BUDGET} total=${usedChars}`);

  if (stats) {
    stats.ragChunksInjectedTotal += selected.length;
    stats.ragChunksInjectedSamples += 1;
    for (const s of selected) {
      stats.ragScoreTotal += s.combinedScore;
      stats.ragScoreSamples += 1;
    }
  }

  return `Relevant excerpts from session documents (retrieved by relevance to your question):\n\n${lines.join("\n\n")}${footer}`;
}

function normalizeChunkKey(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}

function buildRetrievalContextPayload(retrievalRuntime, operationsRuntime, session, input) {
  if (isRetrievalDisabledBySafeMode(operationsRuntime)) {
    maybeLogRetrievalDecision(operationsRuntime, "retrieval context skipped by safe mode");
    return { text: "", matches: [] };
  }

  if (
    !retrievalRuntime ||
    typeof retrievalRuntime.isEnabled !== "function" ||
    typeof retrievalRuntime.buildRetrievalContext !== "function"
  ) {
    maybeLogRetrievalDecision(operationsRuntime, "retrieval runtime unavailable");
    return { text: "", matches: [] };
  }

  if (!retrievalRuntime.isEnabled()) {
    maybeLogRetrievalDecision(operationsRuntime, "retrieval runtime disabled");
    return { text: "", matches: [] };
  }

  try {
    const context = retrievalRuntime.buildRetrievalContext({ session, input });
    if (typeof context === "string") {
      return { text: context.trim(), matches: [] };
    }
    if (typeof context?.text === "string") {
      return {
        text: context.text.trim(),
        matches: Array.isArray(context.matches) ? context.matches : [],
      };
    }
    maybeLogRetrievalDecision(operationsRuntime, "retrieval context produced no text");
    return { text: "", matches: [] };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error || "unknown retrieval context error");
    console.warn(`[agent.retrieval] context block skipped: ${message}`);
    maybeLogRetrievalDecision(operationsRuntime, `retrieval context failed: ${message}`);
    return { text: "", matches: [] };
  }
}

function wrapGroundedContext({
  groundingRuntime,
  turnId,
  session,
  retrievalText,
  retrievalMatches,
}) {
  if (!groundingRuntime || !turnId) {
    return { text: retrievalText, sectionSourceIds: {} };
  }

  const retrievalSourceIds =
    typeof groundingRuntime.registerRetrievalMatches === "function"
      ? groundingRuntime.registerRetrievalMatches({
          turnId,
          matches: retrievalMatches,
        })
      : [];

  const toolData = buildToolVerifiedData(session);
  const wrapped =
    typeof groundingRuntime.wrapContext === "function"
      ? groundingRuntime.wrapContext({
          retrievalText,
          retrievalSourceIds,
          toolDataText: toolData.text,
          toolSourceIds: toolData.sourceIds,
          inferenceText:
            "Use the evidence above for factual claims. State uncertainty when support is limited.",
        })
      : { text: retrievalText, sectionSourceIds: {} };

  if (
    wrapped &&
    typeof groundingRuntime.attachSectionSourceIds === "function" &&
    wrapped.sectionSourceIds
  ) {
    groundingRuntime.attachSectionSourceIds(turnId, wrapped.sectionSourceIds);
  }

  return wrapped && typeof wrapped.text === "string"
    ? wrapped
    : { text: retrievalText, sectionSourceIds: {} };
}

function buildToolVerifiedData(session) {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  const latestToolTurns = turns.filter((row) => row?.role === "tool").slice(-2);
  if (latestToolTurns.length === 0) {
    return { text: "", sourceIds: [] };
  }

  const lines = [];
  for (const turn of latestToolTurns) {
    const parsed = parseJsonRecord(turn?.message);
    const toolName =
      normalizeOptionalString(parsed?.tool) ||
      normalizeOptionalString(turn?.toolCalls?.[0]?.toolName) ||
      "tool";
    const ok = parsed?.result?.ok === true;
    lines.push(`- ${toolName}: ${ok ? "ok" : "reported result"}`);
  }

  return {
    text: lines.join("\n"),
    sourceIds: [],
  };
}

function buildEntityDigest(activeEntities, maxItems, maxChars) {
  if (!Array.isArray(activeEntities) || activeEntities.length === 0) {
    return "";
  }

  const sorted = activeEntities
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(String(left?.lastMentionedAt || ""));
      const rightTime = Date.parse(String(right?.lastMentionedAt || ""));
      if (Number.isFinite(rightTime) && Number.isFinite(leftTime)) {
        return rightTime - leftTime;
      }
      return 0;
    });

  const visible = sorted.slice(0, maxItems);
  const hiddenCount = Math.max(sorted.length - visible.length, 0);

  const lines = visible.map((entity) => {
    const type = String(entity?.type || "entity");
    const label = String(entity?.label || "").trim();
    const source = String(entity?.sourceTool || "").trim();
    const labelPart = label || "unnamed";
    const sourcePart = source ? ` [${source}]` : "";
    return `- ${type}: ${labelPart}${sourcePart}`;
  });

  if (hiddenCount > 0) {
    lines.push(`- +${hiddenCount} more entities`);
  }

  const digest = lines.join("\n");
  if (digest.length <= maxChars) {
    return digest;
  }
  return digest.slice(0, Math.max(maxChars - 3, 1)).trimEnd() + "...";
}

function normalizeRole(role) {
  const normalized = String(role || "assistant").trim().toLowerCase();
  return ALLOWED_ROLES.has(normalized) ? normalized : "assistant";
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonRecord(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTurnId(value) {
  return normalizeOptionalString(value);
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function buildEntityDigestCacheInput(activeEntities) {
  if (!Array.isArray(activeEntities)) {
    return [];
  }
  return activeEntities.map((entity) => ({
    type: String(entity?.type || ""),
    id: String(entity?.id ?? ""),
    label: String(entity?.label || ""),
    sourceTool: String(entity?.sourceTool || ""),
    lastMentionedAt: String(entity?.lastMentionedAt || ""),
    lastReferencedTurnId: String(entity?.lastReferencedTurnId || ""),
  }));
}

function normalizeCache(value) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.get === "function" &&
    typeof value.set === "function"
  ) {
    return value;
  }
  return null;
}

function isRetrievalDisabledBySafeMode(operationsRuntime) {
  return (
    operationsRuntime &&
    operationsRuntime.safeMode &&
    typeof operationsRuntime.safeMode.isRetrievalDisabled === "function" &&
    operationsRuntime.safeMode.isRetrievalDisabled() === true
  );
}

function maybeLogRetrievalDecision(operationsRuntime, message) {
  const shouldLog =
    operationsRuntime &&
    operationsRuntime.debugFlags &&
    typeof operationsRuntime.debugFlags.shouldLogRetrievalDecisions === "function" &&
    operationsRuntime.debugFlags.shouldLogRetrievalDecisions() === true;
  if (shouldLog) {
    console.info(`[agent.operations] ${message}`);
  }
}

function getCachedPureValue({ cache, cacheKey, statsBucket, compute }) {
  if (!cache || !cacheKey) {
    statsBucket.misses += 1;
    return compute();
  }
  const cached = cache.get(cacheKey);
  if (typeof cached === "string") {
    statsBucket.hits += 1;
    return cached;
  }
  statsBucket.misses += 1;
  const value = compute();
  cache.set(cacheKey, value);
  return value;
}

function buildStatsRow(name, cache, statsBucket) {
  const base = {
    name,
    hits: Number(statsBucket?.hits || 0),
    misses: Number(statsBucket?.misses || 0),
  };
  if (!cache || typeof cache.stats !== "function") {
    return base;
  }
  try {
    return {
      ...base,
      ...cache.stats(),
    };
  } catch {
    return base;
  }
}

module.exports = {
  createContextAssembler,
};
