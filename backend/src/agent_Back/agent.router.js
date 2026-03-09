"use strict";

const express = require("express");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const AgentEngine = require("./agent.engine");
const { ChatAgentService } = require("./chat/chat.agent.service");
const { ChatOrchestrator } = require("./orchestrator/chat.orchestrator");
const {
  detectStrongMutationIntent,
  getMutationIntentDetectorConfig,
} = require("./chat/chat.mutationIntentDetector");
const { getAvailableCommands, detectReadIntent, READ_INTENTS } = require("./intent.classifier");
const { detectDocumentGenerationIntent: detectSharedDocumentGenerationIntent } = require("./documentGeneration.intent");
const db = require("../db/connection");
const documentGenerationService = require("../services/documentGeneration/documentGeneration.service");
const documentGenerationPreviewService = require("../services/documentGeneration/documentGenerationPreview.service");
const documentAiSettingsService = require("../services/documentAiSettings.service");
const dossiersService = require("../services/dossiers.service");
const lawsuitsService = require("../services/lawsuits.service");
const sessionsService = require("../services/sessions.service");
const tasksService = require("../services/tasks.service");
const missionsService = require("../services/missions.service");
const financialService = require("../services/financial.service");
const { resolveInteractionMode } = require("./interactionMode.resolver");
const { discoverScopedTarget } = require("./context/scopeDiscovery");
const { mapUserFailure } = require("./failure/userFailure.mapper");
const { toProposalArtifact } = require("./proposals/proposalArtifact");
const { generateChatResponse } = require("./llm.client");
const { runPAAE } = require("./mutation/proactiveAssistiveActionEngine");
const { enforceUserSafeResponsePolicy } = require("./chat/chat.userSafeResponsePolicy");
const eventEnvelopeSchema = require("./schemas/event-envelope.schema.json");
const failureSchema = require("./schemas/failure.schema.json");
const {
  DEFAULT_CANONICAL_FORMAT,
  DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  DEFAULT_PREVIEW_FORMAT,
  chooseOutputFormats,
  normalizeOutputFormatPreference,
  normalizeFormat,
  isCanonicalFormat,
  isPreviewFormat,
} = require("../domain/documentFormatGovernance");
const {
  StorageHint,
  resolveStorageTarget,
} = require("../domain/document.storage.resolver");
const {
  subscribeEntityMutationSuccess,
} = require("../realtime/entityMutationEvents");

const router = express.Router();
const agentEngine = new AgentEngine();
let chatAgentService = new ChatAgentService({ engine: agentEngine });
let chatOrchestrator = new ChatOrchestrator({ engine: agentEngine });
const streamAjv = new Ajv({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
addFormats(streamAjv);

const validateEnvelope = streamAjv.compile(eventEnvelopeSchema);
const validateFailure = streamAjv.compile(failureSchema);

const DELTA_MAX_CHARS = Math.min(
  Math.max(parseInt(process.env.AGENT_STREAM_DELTA_MAX_CHARS || "32", 10), 20),
  40,
);
const DELTA_FLUSH_MS = Math.min(
  Math.max(parseInt(process.env.AGENT_STREAM_DELTA_FLUSH_MS || "80", 10), 50),
  120,
);
// ============================================================================
// Unified SSE Event Lifecycle
// ============================================================================
/**
 * CRITICAL: SSE Event Contract
 *
 * Event sequence: start → artifact/chunk → done
 *
 * Guarantees:
 * - `done` is ALWAYS emitted (even on error)
 * - `error` always terminates with `done`
 * - No artifact suppression based on posture
 * - Single state machine for all streams
 *
 * Events:
 * - start: { intent: "PENDING", agentVersion }
 * - artifact: { output, intent }
 * - done: { status: "success"|"error", error? }
 */

/**
 * Maps intent to status action text.
 * These are deterministic, no LLM involvement.
 *
 * @param {string} intent - The detected intent
 * @param {string} phase - The processing phase (classifying, fetching, analyzing, etc.)
 * @returns {string} Human-readable status action
 */
function getStatusAction(intent, phase = "processing") {
  const n = (intent || "").toUpperCase();

  // Phase-based status messages
  if (phase === "classifying") {
    return "Analyzing your request…";
  }

  if (phase === "fetching") {
    if (n.includes("SEARCH_WEB")) return "Searching the web…";
    if (n.includes("SEARCH_DEEP_WEB")) return "Running deep search…";
    if (n.includes("WEB_SEARCH")) return "Searching the web…";
    if (n.includes("DEEP_SEARCH")) return "Running deep search…";
    if (n.includes("CLIENT")) return "Retrieving client data…";
    if (n.includes("DOSSIER")) return "Loading dossier records…";
    if (n.includes("LAWSUIT")) return "Fetching lawsuit details…";
    if (n.includes("TASK")) return "Reading task information…";
    if (n.includes("SESSION")) return "Loading session data…";
    if (n.includes("FINANCIAL")) return "Retrieving financial records…";
    return "Fetching data…";
  }

  if (phase === "analyzing") {
    if (n.includes("SEARCH_WEB")) return "Compiling web sources…";
    if (n.includes("SEARCH_DEEP_WEB")) return "Compiling deep-search findings…";
    if (n.includes("WEB_SEARCH")) return "Compiling web sources…";
    if (n.includes("DEEP_SEARCH")) return "Compiling deep-search findings…";
    if (n.includes("EXPLAIN")) return "Analyzing current state…";
    if (n.includes("SUMMARIZE")) return "Compiling summary…";
    if (n.includes("RISK")) return "Evaluating operational risks…";
    if (n.includes("DRAFT")) return "Preparing draft content…";
    if (n.includes("PROPOSE") || n.includes("ACTION"))
      return "Identifying possible actions…";
    return "Processing request…";
  }

  if (phase === "interpreting") {
    return "Building interpretation…";
  }

  if (phase === "commentary") {
    return "Preparing response…";
  }

  // Default
  return "Processing…";
}

function isDocumentFocusedPrompt(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return false;
  return /\b(file|document|pdf|image|photo|picture|scan|scanned|attachment|attached|ocr)\b/.test(
    value,
  );
}

function hasProcessingDocuments(documentContext) {
  if (!documentContext || !Array.isArray(documentContext.documents)) return false;
  return documentContext.documents.some((doc) => {
    const textStatus = String(doc?.text_status || "").toLowerCase();
    const understandingStatus = String(doc?.understanding_status || "").toLowerCase();
    if (["failed", "completed", "unreadable", "readable"].includes(understandingStatus)) {
      return false;
    }
    return textStatus === "processing" || understandingStatus === "processing";
  });
}

function waitMs(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function getStreamMutationDetectionState(requestContext = {}) {
  const operationalStore = agentEngine.contextStore?._operationalStore;
  const conversationId = requestContext?.conversationId;
  const userId = requestContext?.userId || "default";
  if (
    !operationalStore ||
    typeof operationalStore.get !== "function" ||
    !conversationId
  ) {
    return null;
  }
  return operationalStore.get(userId, conversationId);
}

function updateStreamMutationDetectionState(requestContext = {}, updates = {}) {
  const operationalStore = agentEngine.contextStore?._operationalStore;
  const conversationId = requestContext?.conversationId;
  const userId = requestContext?.userId || "default";
  if (
    !operationalStore ||
    typeof operationalStore.update !== "function" ||
    !conversationId
  ) {
    return null;
  }
  return operationalStore.update(userId, conversationId, updates);
}

async function waitForDocumentContextStabilization({
  sessionId,
  documentIds,
  signal,
  maxWaitMs = Number.parseInt(process.env.AGENT_DOC_WAIT_MAX_MS || "8000", 10),
  pollMs = Number.parseInt(process.env.AGENT_DOC_WAIT_POLL_MS || "400", 10),
}) {
  let latest = resolveDocumentContext(sessionId, documentIds);
  if (!hasProcessingDocuments(latest)) return latest;
  const deadline = Date.now() + Math.max(0, maxWaitMs);

  while (Date.now() < deadline) {
    if (signal?.aborted) break;
    await waitMs(pollMs);
    latest = resolveDocumentContext(sessionId, documentIds);
    if (!hasProcessingDocuments(latest)) break;
  }
  return latest;
}

async function streamTextAsChunksWithPacing(
  text,
  onChunk,
  { delayMs = 14, shouldStop } = {},
) {
  if (!text || typeof text !== "string") return;
  const tokens = text.match(/\S+\s*/g) || [];
  for (const token of tokens) {
    if (typeof shouldStop === "function" && shouldStop()) return;
    onChunk(token);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function extractDomain(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return String(url || "").trim();
  }
}

/**
 * GET /agent/commands - Get available slash commands for UI autocomplete
 */
router.get("/agent/commands", (req, res) => {
  const commands = getAvailableCommands();
  res.json({
    status: "ok",
    data: commands,
  });
});

function resolveDocumentContext(sessionId, documentIds) {
  if (!sessionId && (!Array.isArray(documentIds) || documentIds.length === 0)) {
    return null;
  }

  try {
    const agentDocumentsService = require("../services/agentDocuments.service");
    if (sessionId) {
      return agentDocumentsService.buildAgentDocumentContext(sessionId);
    }
  } catch (err) {
    console.warn("[Agent] Failed to load document context:", err.message);
  }

  return null;
}

function buildRequestContext(context, sessionId, documentContext, metadata) {
  const requestContext = { ...(context || {}) };
  if (sessionId && !requestContext.conversationId) {
    requestContext.conversationId = sessionId;
  }
  if (
    documentContext &&
    Array.isArray(documentContext.documents) &&
    documentContext.documents.length > 0
  ) {
    requestContext._hasDocumentContext = true;
    requestContext.documentCount = documentContext.documents.length;
    requestContext.documentContext = {
      sessionId: documentContext.sessionId || sessionId || null,
      totalDocuments: documentContext.totalDocuments || documentContext.documents.length,
      readableCount: documentContext.readableCount || 0,
      processingCount: documentContext.processingCount || 0,
      unreadableCount: documentContext.unreadableCount || 0,
      documents: documentContext.documents.map((doc) => ({
        document_id: doc.document_id,
        title: doc.title,
        original_filename: doc.original_filename || null,
        mime_type: doc.mime_type || null,
        text_status: doc.text_status || null,
        text_source: doc.text_source || null,
        understanding_status: doc.understanding_status || doc.text_status || null,
        understanding_confidence: Number.isFinite(doc.understanding_confidence)
          ? doc.understanding_confidence
          : null,
        has_text: Boolean(doc.has_text),
        text: typeof doc.text === "string" ? doc.text : null,
        artifacts: doc.artifacts || null,
      })),
    };
  }
  const workspaceSettings = documentAiSettingsService.getDocumentAiSettings();
  const workspacePreference =
    normalizeOutputFormatPreference(workspaceSettings?.document_output_format_preference) ||
    DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
  const contextMetadata =
    requestContext.requestMetadata &&
    typeof requestContext.requestMetadata === "object" &&
    !Array.isArray(requestContext.requestMetadata)
      ? requestContext.requestMetadata
      : {};
  const incomingMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const mergedMetadata = {
    ...contextMetadata,
    ...incomingMetadata,
  };
  const resolvedPreference =
    normalizeOutputFormatPreference(
      mergedMetadata.documentOutputFormatPreference ||
        requestContext.documentOutputFormatPreference ||
        workspacePreference,
    ) || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
  requestContext.documentOutputFormatPreference = resolvedPreference;
  requestContext.requestMetadata = {
    ...mergedMetadata,
    documentOutputFormatPreference: resolvedPreference,
  };
  return requestContext;
}

function getLifecycleStatusAction(contextLifecycle) {
  const type = String(contextLifecycle?.type || "").toLowerCase();
  if (type === "expired") {
    return "Previous context expired; starting with a fresh context.";
  }
  if (type === "posture_reset") {
    return "Context reset because interaction mode changed.";
  }
  if (type === "posture_transition") {
    return "Interaction mode changed; conversation context was preserved.";
  }
  if (type === "cleared") {
    return "Conversation context was cleared.";
  }
  return "Conversation context changed.";
}

function normalizeChatSearchArtifact(entry) {
  const output = entry?.result;
  if (!output || typeof output !== "object") return null;

  function cleanSummaryText(text, maxLen = 220) {
    const normalized = String(text || "")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+([,.;:!?%])/g, "$1")
      .replace(/([(\[])\s+/g, "$1")
      .replace(/\s+([)\]])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, maxLen - 3).trim()}...`;
  }

  function normalizeRows(results) {
    return Array.isArray(results)
      ? results
          .map((item, idx) => ({
            id: String(item?.id || idx + 1),
            title: String(item?.title || "Untitled result"),
            snippet: String(item?.snippet || ""),
            url: String(item?.url || "").trim(),
            source: item?.source ? String(item.source) : null,
            publishedDate: item?.publishedDate
              ? String(item.publishedDate)
              : item?.datePublished
                ? String(item.datePublished)
                : null,
          }))
          .filter((item) => item.url)
      : [];
  }

  function buildCitations(rows, max = 10) {
    const citations = [];
    for (let i = 0; i < rows.length && citations.length < max; i += 1) {
      const url = String(rows[i]?.url || "").trim();
      if (!url) continue;
      citations.push({ index: i + 1, url });
    }
    return citations;
  }

  function buildHeuristicSummary(query, rows, citations) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const queryText = cleanSummaryText(query || "the requested topic", 120);
    const firstSnippet = cleanSummaryText(rows[0]?.snippet || "", 280);
    const secondSnippet = cleanSummaryText(rows[1]?.snippet || "", 220);
    const sourceNames = Array.from(
      new Set(
        rows
          .slice(0, 5)
          .map((row) => String(row?.source || "").trim() || extractDomain(row?.url || ""))
          .filter(Boolean),
      ),
    );
    const sourceLine =
      sourceNames.length > 0
        ? `Coverage includes ${sourceNames.join(", ")}.`
        : "Coverage includes multiple independent publications.";
    const snippetLine = firstSnippet
      ? `Current coverage suggests: ${firstSnippet} [1]`
      : "Current coverage suggests converging viewpoints across multiple sources [1].";
    const breadthLine = secondSnippet
      ? `Additional reporting notes: ${secondSnippet} [2]`
      : "Additional reporting reinforces similar themes with differences in framing [2].";
    const caveatLine =
      citations.length >= 3
        ? "Cross-source comparison shows recurring claims with meaningful differences in emphasis [3]."
        : "The evidence remains directional and should be cross-checked against primary technical disclosures [1].";
    return {
      shortAnswer: [
        `Based on ${rows.length} web source${rows.length === 1 ? "" : "s"}, ${queryText} is currently documented as follows.`,
        `${snippetLine} ${sourceLine}`,
        `${breadthLine} ${caveatLine}`,
      ].join("\n\n").trim(),
      keyHighlights: rows
        .slice(0, 3)
        .map((row) => cleanSummaryText(row?.title || "", 120))
        .filter(Boolean),
      citations,
    };
  }

  function resolveAiSummary(existingAiSummary, query, rows, citations) {
    const shortAnswer = String(existingAiSummary?.shortAnswer || "").trim();
    if (shortAnswer) {
      return {
        shortAnswer,
        keyHighlights: Array.isArray(existingAiSummary?.keyHighlights)
          ? existingAiSummary.keyHighlights
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [],
        citations:
          Array.isArray(existingAiSummary?.citations) &&
          existingAiSummary.citations.length > 0
            ? existingAiSummary.citations
            : citations,
      };
    }
    return buildHeuristicSummary(query, rows, citations);
  }

  const existingType = String(output?.type || "").toLowerCase();
  if (
    existingType === "web_search_results" ||
    existingType === "web_deep_search_results"
  ) {
    const rows = normalizeRows(output.results);
    const citations = buildCitations(rows, 10);
    const aiSummary = resolveAiSummary(
      output.aiSummary,
      String(output?.query || ""),
      rows,
      citations,
    );
    return {
      ...output,
      results: rows,
      resultCount:
        typeof output?.resultCount === "number" ? output.resultCount : rows.length,
      message:
        rows.length === 0
          ? String(output?.message || "No external results found.")
          : output?.message ?? null,
      status:
        rows.length === 0
          ? "no_results"
          : aiSummary
            ? "search_done_summary_complete"
            : String(output?.status || "search_done_summary_pending"),
      aiSummary,
      sources: Array.isArray(output?.sources)
        ? output.sources
        : rows.slice(0, 10).map((row) => ({
            sourceType: "web",
            reference: row.url,
            note: row.source || row.title,
          })),
    };
  }

  const toolName = String(entry?.toolName || "").trim();
  const isMcpWeb = toolName === "mcpWebSearch";
  const isMcpDeep = toolName === "mcpDeepSearch";
  if (!isMcpWeb && !isMcpDeep) return null;

  const rows = normalizeRows(output.results);
  const citations = buildCitations(rows, 10);
  const aiSummary = buildHeuristicSummary(String(output?.query || ""), rows, citations);

  const base = {
    query: String(output?.query || ""),
    triggeredBy: String(output?.triggeredBy || "explicit_language"),
    provider: String(output?.provider || "langsearch"),
    results: rows,
    resultCount:
      typeof output?.resultCount === "number" ? output.resultCount : rows.length,
    message: null,
    sources: rows.slice(0, 10).map((row) => ({
      sourceType: "web",
      reference: row.url,
      note: row.source || row.title,
    })),
    timestamp: new Date().toISOString(),
    status:
      rows.length === 0
        ? "no_results"
        : aiSummary
          ? "search_done_summary_complete"
          : String(output?.status || "search_done_summary_pending"),
    aiSummary,
    source: "chat_tool",
    requires_validation: true,
  };

  if (isMcpDeep) {
    return {
      type: "web_deep_search_results",
      searchIntent: "DEEP_SEARCH",
      queries: Array.isArray(output?.queries)
        ? output.queries.map((q) => String(q))
        : [String(output?.query || "")],
      totalEstimatedMatches:
        typeof output?.totalEstimatedMatches === "number"
          ? output.totalEstimatedMatches
          : rows.length,
      reason: output?.reason ? String(output.reason) : null,
      ...base,
    };
  }

  return {
    type: "web_search_results",
    searchIntent: "WEB_SEARCH",
    ...base,
  };
}

function sanitizeChatbotAssistantText(text) {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!raw) return "";
  let cleaned = raw;
  cleaned = cleaned.replace(
    /^(got it\s*[—-]\s*|you(?:’|')re asking(?: about)?\s+|based on (?:your request|\d+\s+sources?)[:,]?\s*|here(?:’|')s what i found regarding\s+)/i,
    "",
  );
  cleaned = cleaned.replace(
    /\b(snapshot|scope|diagnostic|internal state|system state|reasoning|chain of thought)\b/gi,
    "",
  );
  cleaned = cleaned
    .split("\n")
    .map((line) =>
      line
        .replace(/(?<=\S)[ \t]+/g, " ")
        .replace(/\s+([,.;:!?%])/g, "$1")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (/^\{[\s\S]*\}$/.test(cleaned) || /^\[[\s\S]*\]$/.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function isChatbotActionArtifact(output) {
  const type = String(output?.type || "").toLowerCase();
  return (
    type === "proposal" ||
    type === "document_draft" ||
    type === "document_generation_preview" ||
    type === "document_generation_missing_fields" ||
    type === "actions" ||
    type === "action_plan" ||
    type === "context_suggestion" ||
    type === "clarification" ||
    type === "routing_clarification"
  );
}

function normalizeChatbotDupKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeChatbotMarkdownOutput(text, { classification } = {}) {
  let out = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!out) return "";

  const hasMarkdownSyntax =
    /(^|\n)([-*]\s+|\d+\.\s+|#{1,6}\s+)/m.test(out) ||
    /\*\*[^*]+\*\*/.test(out) ||
    /_[^_]+_/.test(out);
  const hasParagraphs = out.includes("\n\n");

  // Light formatting only when the model returned a flat paragraph.
  if (!hasMarkdownSyntax && !hasParagraphs && classification?.includeIntent) {
    const sentences = out
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length >= 2) {
      const intentSentence = sentences.shift();
      out = `_${intentSentence}_\n\n${sentences.join(" ")}`.trim();
    }
  }

  return out;
}

function classifyChatbotResponseShape({ userMessage, output, intent }) {
  const text = String(userMessage || "").trim().toLowerCase();
  const type = String(output?.type || "").toLowerCase();
  const intentUpper = String(intent || "").toUpperCase();

  const trivial =
    !type &&
    /^(hi|hello|hey|yo|thanks|thank you|good morning|good evening)\b/.test(text);
  const joke =
    /\b(joke|funny|make me laugh)\b/.test(text) &&
    !/\b(document|client|dossier|search|research|draft|generate)\b/.test(text);
  if (trivial || joke) {
    return { task: "trivial", includeIntent: false, includeCommentary: false };
  }

  const isGeneration =
    [
      "document_generation_preview",
      "document_generation_missing_fields",
      "proposal",
      "action_plan",
      "actions",
    ].includes(type) ||
    /\b(generate|draft|prepare|write)\b/.test(text);
  if (isGeneration) {
    return { task: "generation", includeIntent: true, includeCommentary: true };
  }

  const isSearch =
    type === "web_search_results" ||
    type === "web_deep_search_results" ||
    intentUpper.includes("SEARCH") ||
    /\b(search|research|find on the web|look up)\b/.test(text);
  if (isSearch) {
    return { task: "search", includeIntent: true, includeCommentary: true };
  }

  const isRetrieval =
    [
      "explanation",
      "collection",
      "context_suggestion",
      "clarification",
      "routing_clarification",
    ].includes(type) ||
    /\b(show|list|open|retrieve|read|summarize|analy[sz]e|review|client|dossier|lawsuit|task|session)\b/.test(text) ||
    /(READ|LIST|EXPLAIN|SUMMARIZE|ANALYZE)/.test(intentUpper);

  if (isRetrieval) {
    return { task: "retrieval", includeIntent: true, includeCommentary: true };
  }

  return { task: "general", includeIntent: false, includeCommentary: false };
}

function extractChatbotMainResult({ text, fallbackText, output, intent }) {
  const direct = sanitizeChatbotAssistantText(text);
  if (direct) return direct;

  const type = String(output?.type || "").toLowerCase();
  if (type === "web_search_results" || type === "web_deep_search_results") {
    const aiSummary = sanitizeChatbotAssistantText(
      String(output?.aiSummary?.shortAnswer || "").replace(
        /^based on\s+\d+\s+[^,]+,\s*/i,
        "",
      ),
    );
    if (aiSummary) return aiSummary;
    return "I found relevant public sources and summarized the key points.";
  }
  if (type === "document_generation_preview") {
    return "The draft preview is ready.";
  }
  if (type === "proposal") {
    return "The proposal is ready for your review.";
  }
  if (type === "document_generation_missing_fields") {
    return sanitizeChatbotAssistantText(output?.message) || "I still need a few details to generate that document.";
  }
  if (type === "context_suggestion" || type === "clarification" || type === "routing_clarification") {
    return sanitizeChatbotAssistantText(output?.message || output?.prompt) || "I need one detail to continue.";
  }
  if (type === "recovery") {
    return sanitizeChatbotAssistantText(output?.whatHappened || output?.message) || "I could not complete that request.";
  }
  if (type === "explanation") {
    const summary = sanitizeChatbotAssistantText(output?.facts?.summary || output?.summary || "");
    if (summary) return summary;
  }
  if (type === "collection") {
    const summary = sanitizeChatbotAssistantText(output?.summary || "");
    if (summary) return summary;
    if (Array.isArray(output?.items)) {
      return `I found ${output.items.length} matching item${output.items.length === 1 ? "" : "s"}.`;
    }
  }

  const summary = sanitizeChatbotAssistantText(output?.summary || output?.message || "");
  if (summary) return summary;
  const fallback = sanitizeChatbotAssistantText(fallbackText);
  if (fallback) return fallback;
  if (String(intent || "").toUpperCase().includes("SEARCH")) return "I found relevant results for your question.";
  return "Done.";
}


function buildChatbotAssistantMessage({ userMessage, text, fallbackText, output, intent }) {
  const classification = classifyChatbotResponseShape({ userMessage, output, intent });
  const direct = normalizeChatbotMarkdownOutput(
    sanitizeChatbotAssistantText(text),
    { classification },
  );
  if (direct) return direct;

  const mainResult = extractChatbotMainResult({ text, fallbackText, output, intent });
  return normalizeChatbotMarkdownOutput(mainResult, { classification }) || "Done.";
}

function resolveChatbotStatusAction({ output, toolExecutions, userMessage }) {
  const type = String(output?.type || "").toLowerCase();
  if (type === "web_search_results") return "Searching...";
  if (type === "web_deep_search_results") return "Running deep research...";
  if (type === "document_generation_preview") return "Preparing document preview...";
  if (type === "proposal") return "Preparing action proposal...";
  const toolNames = Array.isArray(toolExecutions)
    ? toolExecutions.map((row) => String(row?.toolName || "").toLowerCase())
    : [];
  if (toolNames.some((name) => name.includes("search"))) return "Searching...";
  if (toolNames.some((name) => name.includes("entity") || name.includes("dossier") || name.includes("client"))) {
    return "Reading records...";
  }
  if (/\b(search|find on the web|research)\b/i.test(String(userMessage || ""))) {
    return "Searching...";
  }
  return "Working...";
}

function buildChatbotAttachmentArtifact({ output, toolExecutions = [] }) {
  if (output && typeof output === "object") {
    if (isChatbotActionArtifact(output)) return output;
  }
  return null;
}

function normalizeRefText(value) {
  return String(value || "").replace(/[\u2010-\u2015\u2212]/g, "-");
}

function canonicalizeReferenceToken(value) {
  const normalized = normalizeRefText(value)
    .toUpperCase()
    .replace(/[^\w-]/g, "")
    .replace(/_+/g, "")
    .trim();
  return normalized;
}

function canonicalizeSqlRefExpr(columnName) {
  // Normalizes common punctuation/spacing variants directly in SQLite.
  return `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${columnName}), ' ', ''), '–', '-'), '—', '-'), '−', '-'), '.', ''))`;
}

async function resolveGenerationTargetFromReference(text) {
  const dossierRefMatch = text.match(/\bDOS-\d{4}-\d+\b/i);
  if (dossierRefMatch) {
    const reference = canonicalizeReferenceToken(String(dossierRefMatch[0]));
    const normalizedExpr = canonicalizeSqlRefExpr("reference");
    const dossier = db
      .prepare(
        `SELECT id
         FROM dossiers
         WHERE ${normalizedExpr} = @reference
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .get({ reference });
    if (dossier?.id) {
      return { type: "dossier", id: Number(dossier.id) };
    }
  }

  const lawsuitRefMatch = text.match(/\bL-\d{4}-\d+\b/i);
  if (lawsuitRefMatch) {
    const reference = canonicalizeReferenceToken(String(lawsuitRefMatch[0]));
    const normalizedExpr = canonicalizeSqlRefExpr("reference");
    const lawsuit = db
      .prepare(
        `SELECT id
         FROM lawsuits
         WHERE ${normalizedExpr} = @reference
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .get({ reference });
    if (lawsuit?.id) {
      return { type: "lawsuit", id: Number(lawsuit.id) };
    }
  }

  return null;
}

function extractTargetHints(text) {
  const hintedTypeMatch = text.match(/\b(client|dossier|lawsuit|mission|task|session)\b/i);
  const dossierRefMatch = text.match(/\bDOS-\d{4}-\d+\b/i);
  const lawsuitRefMatch = text.match(/\bL-\d{4}-\d+\b/i);
  return {
    hintedType: hintedTypeMatch ? String(hintedTypeMatch[1]).toLowerCase() : null,
    reference: dossierRefMatch
      ? canonicalizeReferenceToken(String(dossierRefMatch[0]))
      : lawsuitRefMatch
        ? canonicalizeReferenceToken(String(lawsuitRefMatch[0]))
        : null,
  };
}

const GENERATION_TARGET_TABLE_MAP = Object.freeze({
  client: "clients",
  dossier: "dossiers",
  lawsuit: "lawsuits",
  mission: "missions",
  task: "tasks",
  session: "sessions",
  personal_task: "personal_tasks",
  financial_entry: "financial_entries",
  officer: "officers",
});

function targetEntityExists(target) {
  if (!target?.type || !Number.isInteger(Number(target?.id))) return false;
  const table = GENERATION_TARGET_TABLE_MAP[String(target.type).toLowerCase()];
  if (!table) return false;
  const row = db
    .prepare(`SELECT id FROM ${table} WHERE id = @id AND deleted_at IS NULL LIMIT 1`)
    .get({ id: Number(target.id) });
  return Boolean(row?.id);
}

function loadRecentEntityIds(entityType, limit = 5) {
  const table = GENERATION_TARGET_TABLE_MAP[String(entityType || "").toLowerCase()];
  if (!table) return [];
  const rows = db
    .prepare(
      `SELECT id
       FROM ${table}
       WHERE deleted_at IS NULL
       ORDER BY id DESC
       LIMIT @limit`,
    )
    .all({ limit: Math.max(1, Math.min(Number(limit) || 5, 8)) });
  return Array.isArray(rows) ? rows.map((r) => Number(r.id)).filter(Boolean) : [];
}

function inferPendingBindingEntityType(generationRequest = {}) {
  const hinted = String(generationRequest?.targetHints?.hintedType || "")
    .trim()
    .toLowerCase();
  if (hinted) return hinted;
  const ref = String(generationRequest?.targetHints?.reference || "").toUpperCase();
  if (ref.startsWith("DOS-")) return "dossier";
  if (ref.startsWith("L-")) return "lawsuit";
  return "dossier";
}

function normalizeGenerationRequestFormats(generationRequest = {}, options = {}) {
  const canonicalCandidate = normalizeFormat(
    generationRequest?.canonicalFormat || generationRequest?.format,
  );
  const previewCandidate = normalizeFormat(generationRequest?.previewFormat);
  const explicitCanonical = isCanonicalFormat(canonicalCandidate) ? canonicalCandidate : null;
  const resolvedPreference =
    normalizeOutputFormatPreference(
      options.documentOutputFormatPreference ||
        generationRequest?.documentOutputFormatPreference,
    ) || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
  const formatSelection = chooseOutputFormats({
    preference: explicitCanonical || resolvedPreference,
    artifactKind: "document",
    structureHints: {
      hasTabularData: false,
      requiresEditing: false,
      intendedForFiling: false,
    },
  });
  if (explicitCanonical) {
    formatSelection.selectionMode = "explicit";
    formatSelection.selectionSource = "explicit_request";
  }
  const canonicalFormat = explicitCanonical || formatSelection.canonicalFormat || DEFAULT_CANONICAL_FORMAT;
  const previewFormat = isPreviewFormat(previewCandidate)
    ? previewCandidate
    : formatSelection.previewFormat || DEFAULT_PREVIEW_FORMAT;
  return {
    ...(generationRequest || {}),
    canonicalFormat,
    previewFormat,
    formatSelection,
    // Backward compatibility for legacy payloads.
    format: canonicalFormat,
  };
}

function buildDocumentGenerationPendingDescriptor({
  generationRequest,
  agentVersion = "v3",
  sourceRoute = "/agent/chat",
} = {}) {
  const normalizedGenerationRequest = normalizeGenerationRequestFormats(generationRequest, {
    documentOutputFormatPreference: generationRequest?.documentOutputFormatPreference,
  });
  const bindingEntityType = inferPendingBindingEntityType(normalizedGenerationRequest);
  return {
    operationType: "document_generation",
    lockedCapability: "draft",
    originalIntent: "DOCUMENT_GENERATION",
    originalMessage: normalizedGenerationRequest?.instructions || null,
    policyVersion: agentVersion || "v3",
    requiredBindings: [
      {
        entityType: bindingEntityType,
        resolverStrategy: "reference_or_name",
        scopeConstraints: null,
      },
    ],
    resolvedBindings: {},
    executionDescriptor: {
      resumeType: "document_generation_preview",
      generationRequest: {
        target: null,
        targetHints: normalizedGenerationRequest?.targetHints || null,
        documentType: normalizedGenerationRequest?.documentType || null,
        language: normalizedGenerationRequest?.language || "en",
        canonicalFormat: normalizedGenerationRequest.canonicalFormat,
        previewFormat: normalizedGenerationRequest.previewFormat,
        formatSelection: normalizedGenerationRequest.formatSelection || null,
        // Backward compatibility for legacy resumption payloads.
        format: normalizedGenerationRequest.canonicalFormat,
        instructions: normalizedGenerationRequest?.instructions || "",
      },
    },
    auditMeta: {
      route: sourceRoute,
      reason: "target_unresolved",
    },
  };
}

async function tryResumePendingDocumentGeneration({
  requestContext,
  message,
  followUpIntent,
  sessionId,
  userId,
} = {}) {
  const pending = agentEngine.getPendingOperation(requestContext);
  if (!pending || String(pending.operationType || "").toLowerCase() !== "document_generation") {
    return null;
  }

  const normalizedMessage = String(message || "").trim();
  if (/^(cancel|stop|never\s*mind|nevermind|start over|forget it)$/i.test(normalizedMessage)) {
    agentEngine.clearPendingOperation(requestContext, "user_cancelled");
    return null;
  }

  if (
    followUpIntent?.pendingOperationId &&
    String(followUpIntent.pendingOperationId) !== String(pending.id)
  ) {
    return null;
  }

  const updated = await agentEngine.applyResolutionInput(
    requestContext,
    normalizedMessage,
    followUpIntent,
  );
  const candidate = updated || pending;
  if (!agentEngine.canResumePendingOperation(candidate)) {
    return null;
  }

  const resumed = await agentEngine.resumePendingOperation(requestContext, {
    document_generation: async ({ pendingOperation, executionDescriptor }) => {
      const resolvedBindings = pendingOperation?.resolvedBindings || {};
      const descriptorReq =
        executionDescriptor?.generationRequest ||
        pendingOperation?.executionDescriptor?.generationRequest ||
        null;
      if (!descriptorReq || typeof descriptorReq !== "object") return null;

      const targetType = inferPendingBindingEntityType({
        targetHints: descriptorReq?.targetHints || null,
      });
      const boundEntity =
        resolvedBindings[targetType] ||
        Object.values(resolvedBindings || {}).find((row) => row && row.id) ||
        null;
      if (!boundEntity?.id) return null;

      const generationRequest = {
        ...descriptorReq,
        target: {
          type: boundEntity.type || targetType,
          id: Number(boundEntity.id),
        },
      };
      const output = await buildDocumentGenerationPreviewArtifact({
        requestContext,
        userId,
        sessionId,
        generationRequest,
      });
      return {
        intent: "DOCUMENT_GENERATION",
        output,
      };
    },
  });

  return resumed && resumed.output ? resumed : null;
}

async function detectDocumentGenerationIntent(message, context = {}) {
  return detectSharedDocumentGenerationIntent(message, context);
}

async function createGeneratedDocumentProposalFromPlan({
  requestContext,
  sessionId,
  userId,
  plan,
}) {
  const targetResolution = await resolveGeneratedDocumentAttachTarget({
    requestContext,
    plan,
  });
  if (targetResolution?.artifact) {
    return targetResolution.artifact;
  }
  const effectivePlan = {
    ...plan,
    target: targetResolution?.target || plan?.target,
    storageGovernance: {
      ...(plan?.storageGovernance || {}),
      ...(targetResolution?.storageGovernancePatch || {}),
    },
  };

  const targetType = String(effectivePlan?.target?.type || "").toLowerCase();
  const targetId = Number(effectivePlan?.target?.id || 0);
  const hasScopeBinding =
    effectivePlan?.storageGovernance?.hasScopeBinding === true ||
    requestContext?.hasScopeBinding === true ||
    (targetType && targetType !== "client");

  const policy = agentEngine._resolvePolicy("v3");
  const proposal = await agentEngine.executeToolV2(
    "universalMutation",
    {
      operations: [
        {
          op: "ATTACH_TO_ENTITY",
          entityType: String(effectivePlan?.target?.type || "").toLowerCase() || "document",
          payload: {
            target: effectivePlan.target,
            attachmentType: "generated_document",
            payload: {
              documentType: effectivePlan.documentType,
              templateKey: effectivePlan.templateKey,
              language: effectivePlan.language,
              canonicalFormat: effectivePlan.canonicalFormat || effectivePlan.format,
              previewFormat: effectivePlan.previewFormat || DEFAULT_PREVIEW_FORMAT,
              formatSelection: effectivePlan.formatSelection || null,
              // Backward compatibility for legacy payload readers.
              format: effectivePlan.canonicalFormat || effectivePlan.format,
              schemaVersion: effectivePlan.schemaVersion,
              contentJson: effectivePlan.contentJson,
              title: effectivePlan.contentJson?.content?.title || effectivePlan.documentType,
            },
          },
          reason: "Attach generated document artifact from approved plan",
        },
      ],
      idempotencyKey: `docgen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      origin: "system",
      risk: "medium",
    },
    policy,
    {
      ...requestContext,
      confirmed: true,
      sessionId: sessionId || null,
      userId: userId || null,
      posture: "WORK",
    },
  );

  if (proposal?.result?.proposalId && proposal?.result?.requiresConfirmation) {
    const scopeBindingAudit = hasScopeBinding
      ? {
          applied: true,
          source:
            effectivePlan?.storageGovernance?.resolutionMode === "hint"
              ? "storage_hint"
              : String(targetResolution?.source || "scope_resolution"),
          target: {
            entityType: targetType || null,
            entityId: Number.isInteger(targetId) && targetId > 0 ? targetId : null,
          },
        }
      : null;
    agentEngine.storeProposal(proposal.result, {
      conversationId: requestContext?.conversationId || null,
      sessionId: sessionId || null,
      userId: userId || null,
      tenantId: requestContext?.tenantId || null,
      scopeBinding: scopeBindingAudit,
    });
    return proposal.result;
  }

  throw new Error("Failed to create document generation proposal");
}

async function resolveGeneratedDocumentAttachTarget({
  requestContext,
  plan,
} = {}) {
  const targetType = String(plan?.target?.type || "").toLowerCase();
  const targetId = Number(plan?.target?.id || 0);
  const hasScopeBinding =
    plan?.storageGovernance?.hasScopeBinding === true ||
    requestContext?.hasScopeBinding === true ||
    (targetType && targetType !== "client");

  if (
    targetType !== "client" ||
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    hasScopeBinding
  ) {
    return {
      target: plan?.target || null,
      storageGovernancePatch: null,
      source: "existing_scope",
      artifact: null,
    };
  }

  if (clientHasDeeperScopeEntities(targetId)) {
    let discovery = null;
    try {
      discovery = await discoverScopedTarget({
        engine: buildDeterministicScopeDiscoveryEngine(),
        clientId: targetId,
        message:
          String(plan?.contentJson?.content?.markdown || "").trim() ||
          String(plan?.contentJson?.content?.title || "").trim(),
        hint:
          plan?.storageGovernance?.scopeDiscoveryHint &&
          typeof plan.storageGovernance.scopeDiscoveryHint === "object"
            ? plan.storageGovernance.scopeDiscoveryHint
            : null,
        limits: { maxClarifyCandidates: 5 },
      });
    } catch (_) {
      discovery = null;
    }

    if (
      discovery?.status === "resolved" &&
      discovery?.target?.entityType &&
      Number.isInteger(Number(discovery?.target?.entityId)) &&
      Number(discovery.target.entityId) > 0
    ) {
      return {
        target: {
          type: String(discovery.target.entityType).toLowerCase(),
          id: Number(discovery.target.entityId),
        },
        storageGovernancePatch: {
          hasScopeBinding: true,
          status: "resolved",
          resolvedTarget: {
            entityType: String(discovery.target.entityType).toLowerCase(),
            entityId: Number(discovery.target.entityId),
          },
          resolutionMode: "inherit",
        },
        source: "scope_discovery_recovery",
        artifact: null,
      };
    }

    const candidateSuggestions = Array.isArray(discovery?.candidates)
      ? discovery.candidates
          .map((candidate, index) => {
            const entityType = String(candidate?.entityType || "").toLowerCase();
            const entityId = Number(candidate?.entityId || 0);
            if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return null;
            return {
              id: `scope-guard-${entityType}-${entityId}-${index}`,
              entityType,
              entityId,
              label: String(candidate?.label || `${entityType} #${entityId}`),
              subtitle: candidate?.reference ? `Reference: ${String(candidate.reference)}` : null,
              metadata: {
                score: Number.isFinite(Number(candidate?.score))
                  ? Number(Number(candidate.score).toFixed(3))
                  : null,
              },
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
            };
          })
          .filter(Boolean)
      : [];

    return {
      target: plan?.target || null,
      storageGovernancePatch: null,
      source: "scope_guard_clarify",
      artifact: buildStorageScopeSuggestionArtifact({
        message:
          "I found deeper records under this client. Please confirm the exact dossier/lawsuit/task/session/mission/financial entry before I attach this generated document.",
        originalMessage: String(plan?.contentJson?.content?.markdown || "").trim() || null,
        suggestions: candidateSuggestions,
      }),
    };
  }
  return {
    target: plan?.target || null,
    storageGovernancePatch: null,
    source: "no_deeper_entities",
    artifact: null,
  };
}

async function buildDocumentGenerationPreviewArtifact({
  requestContext,
  userId,
  sessionId,
  generationRequest,
}) {
  const normalizedGenerationRequest = normalizeGenerationRequestFormats(generationRequest, {
    documentOutputFormatPreference: requestContext?.documentOutputFormatPreference,
  });
  const toTargetRecovery = async ({ code = "TARGET_UNRESOLVED" } = {}) => {
    const targetType = String(
      normalizedGenerationRequest?.target?.type ||
        normalizedGenerationRequest?.targetHints?.hintedType ||
        "entity",
    ).toLowerCase();
    const rawTargetId = normalizedGenerationRequest?.target?.id;
    const normalizedTargetId = Number.isFinite(Number(rawTargetId))
      ? Number(rawTargetId)
      : null;
    const reference = String(normalizedGenerationRequest?.targetHints?.reference || "").trim() || null;
    const mapped = await mapUserFailure(
      {
        code,
        message: "Target entity could not be resolved for generation.",
      },
      {
        intent: "DOCUMENT_GENERATION",
        targetType,
        targetId: normalizedTargetId,
        reference,
        pendingOperationId: requestContext?.pendingOperationId || null,
      },
    );
    return mapped.recovery;
  };

  if (!normalizedGenerationRequest?.target?.type || !normalizedGenerationRequest?.target?.id) {
    return toTargetRecovery({ code: "TARGET_UNRESOLVED" });
  }

  if (!targetEntityExists(normalizedGenerationRequest.target)) {
    return toTargetRecovery({ code: "TARGET_NOT_FOUND" });
  }

  let plan;
  try {
    plan = await documentGenerationService.planDocument(normalizedGenerationRequest);
  } catch (error) {
    if (
      /Target entity not found/i.test(String(error?.message || "")) ||
      String(error?.code || "") === "TARGET_NOT_FOUND"
    ) {
      return toTargetRecovery({ code: "TARGET_NOT_FOUND" });
    }
    if (error?.code === "TEMPLATE_NOT_FOUND") {
        return {
          type: "document_generation_missing_fields",
          message: error.message || "Template not found for the requested document.",
          documentType: normalizedGenerationRequest?.documentType || null,
          target: normalizedGenerationRequest?.target || null,
          missingFields: [
          {
            path: "template",
            label: "Template",
            reason: "template_not_found",
            example: "Install a template for this documentType/language/version.",
          },
        ],
        schemaVersion: null,
        templateKey: null,
      };
    }
    throw error;
  }

  if (plan.status === "missing_fields") {
    return {
      type: "document_generation_missing_fields",
      message: "Required fields are missing before generation.",
      documentType: plan.documentType,
      target: plan.target,
      missingFields: plan.missingFields,
      schemaVersion: plan.schemaVersion,
      templateKey: plan.templateKey,
    };
  }

  return documentGenerationPreviewService.createPreview(plan, {
    conversationId: requestContext?.conversationId || null,
    sessionId: sessionId || null,
    createdBy: userId ? String(userId) : null,
  });
}

router.post("/agent/run", async (req, res, next) => {
  const {
    message,
    context,
    agentVersion,
    reasoner,
    followUpIntent,
    sessionId,
    documentIds,
    metadata,
  } = req.body || {};
  try {
    const documentContext = resolveDocumentContext(sessionId, documentIds);
    const requestContext = buildRequestContext(
      context,
      sessionId,
      documentContext,
      metadata,
    );
    const hasMessage =
      typeof message === "string" && String(message).trim().length > 0;
    const hasDocuments =
      documentContext &&
      Array.isArray(documentContext.documents) &&
      documentContext.documents.length > 0;
    const effectiveMessage =
      hasMessage || followUpIntent || !hasDocuments ? message : "uploaded file";

    const resumedPending = await tryResumePendingDocumentGeneration({
      requestContext,
      message: effectiveMessage,
      followUpIntent,
      sessionId,
      userId: req.user?.id || null,
    });
    if (resumedPending) {
      return res.json({
        status: "ok",
        data: {
          intent: resumedPending.intent || "DOCUMENT_GENERATION",
          output: resumedPending.output,
          agentVersion: agentVersion || "v3",
          reasoner: "pending-operation",
          needsClarification:
            resumedPending?.output?.type === "document_generation_missing_fields",
        },
      });
    }

    const generationIntent = await detectDocumentGenerationIntent(
      effectiveMessage,
      requestContext,
    );
    if (generationIntent) {
      const generationRequest = normalizeGenerationRequestFormats(generationIntent, {
        documentOutputFormatPreference: requestContext?.documentOutputFormatPreference,
      });
      if (!generationRequest?.target?.id) {
        const pendingOperation = agentEngine.beginPendingOperation(
          requestContext,
          buildDocumentGenerationPendingDescriptor({
            generationRequest,
            agentVersion: agentVersion || "v3",
            sourceRoute: "/agent/run",
          }),
        );
        requestContext.pendingOperationId = pendingOperation?.id || null;
      } else {
        const currentPending = agentEngine.getPendingOperation(requestContext);
        if (
          currentPending &&
          String(currentPending.operationType || "").toLowerCase() ===
            "document_generation"
        ) {
          agentEngine.clearPendingOperation(requestContext, "target_resolved_new_turn");
        }
      }
      const output = await buildDocumentGenerationPreviewArtifact({
        requestContext,
        userId: req.user?.id || null,
        sessionId,
        generationRequest,
      });
      return res.json({
        status: "ok",
        data: {
          intent: "PROPOSE_ACTIONS",
          output,
          agentVersion: agentVersion || "v3",
          reasoner: "document-generation",
          needsClarification: output.type === "document_generation_missing_fields",
        },
      });
    }

    const chatResult = await chatOrchestrator.runChatTurn({
      message: effectiveMessage,
      context: requestContext,
      agentVersion: agentVersion || "v3",
      followUpIntent,
      sessionId,
      metadata,
      userId: req.user?.id || null,
      tenantId: req.user?.tenantId || requestContext?.tenantId || null,
    });
    const _runSearchArtifact = Array.isArray(chatResult?.toolExecutions)
      ? chatResult.toolExecutions
          .filter((e) => e?.ok === true)
          .map((e) => normalizeChatSearchArtifact(e))
          .find(Boolean) || null
      : null;
    const result = {
      intent: chatResult?.intent || "CHATBOT_AGENT_MODE",
      output: chatResult?.outputArtifact || chatResult?.ambiguityArtifact || _runSearchArtifact || { type: "chat", message: chatResult?.message || "" },
      agentVersion: agentVersion || "v3",
      reasoner: reasoner || "chat",
    };
    const contextLifecycle =
      typeof agentEngine.contextStore?.consumeLifecycleEvent === "function"
        ? agentEngine.contextStore.consumeLifecycleEvent(requestContext)
        : null;
    res.json({
      status: "ok",
      data: contextLifecycle ? { ...result, contextLifecycle } : result,
    });
  } catch (err) {
    const mapped = await mapUserFailure(err, {
      intent: "AGENT_RUN",
    });
    agentEngine.ledger.record({
      type: "user_failure_mapped",
      endpoint: "/agent/run",
      code: mapped.code,
      message: mapped.internalMessage,
      timestamp: new Date().toISOString(),
    });
    res.json({
      status: "ok",
      data: {
        intent: "RECOVERY",
        output: mapped.recovery,
        agentVersion: agentVersion || "v3",
        reasoner: "failure-mapper",
      },
    });
  }
});

router.post("/agent/chat", async (req, res) => {
  const {
    message,
    context,
    agentVersion,
    sessionId,
    documentIds,
    metadata,
    followUpIntent,
  } = req.body || {};

  const hasMessage =
    typeof message === "string" && String(message).trim().length > 0;
  if (!hasMessage) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  let aborted = false;
  const abortController = new AbortController();
  res.on("close", () => {
    aborted = true;
    abortController.abort();
  });
  let assistantFinalEmitted = false;

  const emit = (event, payload) => {
    if (aborted) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`);
    if (typeof res.flush === "function") {
      res.flush();
    }
  };
  const detachMutationListener = subscribeEntityMutationSuccess((mutationEvent) => {
    if (aborted) return;
    const eventSessionId = String(mutationEvent?.sessionId || "");
    if (!eventSessionId || String(sessionId || "") !== eventSessionId) return;
    emit("entity_mutation_success", mutationEvent);
  });

  const emitVisibleAssistantText = async ({
    text,
    interactionMode = "operational",
  }) => {
    await streamTextAsChunksWithPacing(
      String(text || ""),
      (token) => {
        if (aborted) return;
        emit("chunk", {
          content: token,
          timestamp: new Date().toISOString(),
          visibility: "visible",
          interactionMode,
        });
      },
      { delayMs: 14, shouldStop: () => aborted },
    );
  };

  const emitStatus = (action, phase = "working", interactionMode = "operational") => {
    const safeAction = String(action || "").trim();
    if (!safeAction) return;
    emit("status", {
      action: safeAction,
      phase,
      visibility: "visible",
      interactionMode,
      timestamp: new Date().toISOString(),
    });
  };

  const emitAssistantFinal = async ({
    text,
    fallbackText,
    output,
    mutationOutcome = null,
    intent = "CHATBOT_AGENT_MODE",
    interactionMode = "operational",
  }) => {
    if (assistantFinalEmitted) return;
    assistantFinalEmitted = true;
    const safe = enforceUserSafeResponsePolicy({
      text,
      output,
      mutationOutcome,
      route: "/agent/chat",
      logger: (entry) => agentEngine.ledger.record(entry),
    });
    await emitVisibleAssistantText({
      text: buildChatbotAssistantMessage({
        userMessage: message,
        text: safe.text,
        fallbackText,
        output: safe.output,
        intent,
      }),
      interactionMode,
    });
  };

  const emitSafeChatResult = ({ output, intent, interactionMode, mutationOutcome = null }) => {
    const safe = enforceUserSafeResponsePolicy({
      text: "",
      output,
      mutationOutcome,
      route: "/agent/chat",
      logger: (entry) => agentEngine.ledger.record(entry),
    });
    emit("result", {
      output: safe.output,
      intent,
      visibility: "visible",
      interactionMode,
    });
    return safe.output;
  };

  try {
    let documentContext = resolveDocumentContext(sessionId, documentIds);
    if (
      isDocumentFocusedPrompt(message) &&
      hasProcessingDocuments(documentContext)
    ) {
      documentContext = await waitForDocumentContextStabilization({
        sessionId,
        documentIds,
        signal: abortController.signal,
      });
    }
    const requestContext = buildRequestContext(
      context,
      sessionId,
      documentContext,
      metadata,
    );
    emit("start", {
      intent: "CHATBOT_AGENT_MODE",
      agentVersion: agentVersion || "v3",
      timestamp: new Date().toISOString(),
    });

    if (
      requestContext?.documentContext &&
      !requestContext.draftSession &&
      isDocumentFocusedPrompt(message)
    ) {
      requestContext.draftSession = {
        kind: "document_context",
        source: "chat",
        sessionId: sessionId || requestContext?.conversationId || null,
      };
    }

    const result = await chatOrchestrator.runChatTurn({
      message,
      context: requestContext,
      followUpIntent,
      sessionId,
      agentVersion: agentVersion || "v3",
      metadata,
      userId: req.user?.id || null,
      tenantId: req.user?.tenantId || requestContext?.tenantId || null,
      signal: abortController.signal,
    });

    const searchArtifact = Array.isArray(result?.toolExecutions)
      ? result.toolExecutions
          .filter((entry) => entry?.ok === true)
          .map((entry) => normalizeChatSearchArtifact(entry))
          .find((output) => Boolean(output)) || null
      : null;
    const toolExecutions = Array.isArray(result?.toolExecutions)
      ? result.toolExecutions
      : [];
    const effectiveOutput = result?.outputArtifact || result?.ambiguityArtifact || searchArtifact || {
      type: "chat",
      message: result?.message || "",
    };
    const interactionMode = resolveInteractionMode({
      output: effectiveOutput,
      intent: result?.intent || "CHATBOT_AGENT_MODE",
      result,
      toolExecutions,
      documentContext: requestContext?.documentContext || null,
    });
    agentEngine.ledger.record({
      type: "interaction_mode_selected",
      mode: interactionMode,
      endpoint: "/agent/chat",
      timestamp: new Date().toISOString(),
    });
    if (toolExecutions.length > 0) {
      emitStatus(
        resolveChatbotStatusAction({
          output: effectiveOutput,
          toolExecutions,
          userMessage: message,
        }),
        "working",
        interactionMode,
      );
    }

    const emittedArtifactKeys = new Set();
    const artifactKeyFor = (artifact) => {
      const type = String(artifact?.type || "").toLowerCase();
      if (!type) return null;
      if (type === "proposal") return `${type}:${String(artifact?.proposalId || "")}`;
      return `${type}:${String(artifact?.entityType || "")}:${String(artifact?.message || artifact?.title || "")}`;
    };
    const emitComposedArtifact = (artifact) => {
      if (!artifact || typeof artifact !== "object") return;
      const key = artifactKeyFor(artifact);
      if (key && emittedArtifactKeys.has(key)) return;
      if (key) emittedArtifactKeys.add(key);
      emitSafeChatResult({
        output: artifact,
        intent: "CHATBOT_AGENT_MODE",
        interactionMode,
        mutationOutcome: result?.mutationOutcome || null,
      });
    };
    const composedArtifacts = Array.isArray(result?.composedArtifacts)
      ? result.composedArtifacts.filter((artifact) => artifact && typeof artifact === "object")
      : [];
    if (composedArtifacts.length > 0) {
      composedArtifacts.forEach(emitComposedArtifact);
    } else {
      const chatbotAttachment = buildChatbotAttachmentArtifact({
        output: result?.outputArtifact || result?.ambiguityArtifact || searchArtifact || null,
        toolExecutions,
      });
      if (chatbotAttachment) {
        emitComposedArtifact(chatbotAttachment);
      }
    }
    await emitAssistantFinal({
      text: result?.message,
      output: effectiveOutput,
      mutationOutcome: result?.mutationOutcome || null,
      intent: result?.intent || "CHATBOT_AGENT_MODE",
      interactionMode,
    });
    const hasComposedSuggestions =
      Array.isArray(result?.artifactComposition?.suggestions) &&
      result.artifactComposition.suggestions.length > 0;
    if (toolExecutions.length > 0 && !hasComposedSuggestions) {
      try {
        const paaeOutput = await runPAAE({
          toolExecutions,
          userMessage: message,
          conversationId: requestContext?.conversationId || sessionId || null,
          turnCount: 2,
          isClarification: effectiveOutput.type === "context_suggestion" || effectiveOutput.type === "clarification",
          cognitiveDecision:
            result?.resolutionMeta?.cognitiveDecision || result?.cognitiveDecision || null,
          llmClient: generateChatResponse,
        });
        console.log("[PAAE][router] paaeOutput:", paaeOutput ? `${paaeOutput.suggestions?.length} suggestions` : "null");
        if (paaeOutput && !aborted) {
          emit("result", {
            output: paaeOutput,
            intent: "PROACTIVE_ASSIST",
            visibility: "visible",
            interactionMode,
          });
        }
      } catch (_paaeErr) {
        console.error("[PAAE][router] error:", _paaeErr?.message || _paaeErr);
      }
    }
    emit("done", {
      timestamp: new Date().toISOString(),
      mode: "chatbot",
      toolCalls: toolExecutions.length,
      interactionMode,
      mutationOutcome: result?.mutationOutcome || null,
    });
  } catch (error) {
    console.error(
      "[/agent/chat] Unhandled error",
      error?.stack || error?.message || error,
    );
    const mapped = await mapUserFailure(error, {
      intent: "CHATBOT_AGENT_MODE",
    });
    agentEngine.ledger.record({
      type: "user_failure_mapped",
      endpoint: "/agent/chat",
      code: mapped.code,
      message: mapped.internalMessage,
      timestamp: new Date().toISOString(),
    });
    emitSafeChatResult({
      output: mapped.recovery,
      intent: "RECOVERY",
      interactionMode: "operational",
    });
    await emitAssistantFinal({
      fallbackText: "I could not complete that request.",
      output: mapped.recovery,
      intent: "RECOVERY",
      interactionMode: "operational",
    });
    emit("done", {
      timestamp: new Date().toISOString(),
      mode: "chatbot",
      status: "success",
      interactionMode: "operational",
    });
  } finally {
    detachMutationListener();
    if (!aborted) {
      res.end();
    }
  }
});

router.__setChatAgentServiceForTests = (service) => {
  if (service && typeof service.run === "function") {
    chatAgentService = service;
  }
};

router.__getAgentEngineForTests = () => agentEngine;

/**
 * POST /agent/edit - Edit the last user message
 *
 * Creates a new version and marks the old one as superseded
 * Invalidates any downstream agent responses
 * Frontend should re-call /agent/stream after edit
 */
router.post("/agent/edit", async (req, res, next) => {
  const { message, sessionId, userId } = req.body || {};

  // Validation
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      error: 'MESSAGE_REQUIRED',
      message: 'Message is required',
    });
  }

  if (!sessionId) {
    return res.status(400).json({
      status: 'error',
      error: 'SESSION_REQUIRED',
      message: 'Session ID is required',
    });
  }

  try {
    // Use sessionId as conversationId (same pattern as /agent/stream and /agent/message)
    const conversationId = sessionId || `conv:${userId || 'default'}:GLOBAL`;

    // Get the last user turn from transcript store
    let lastUserTurn = agentEngine.contextStore._transcriptStore.getLastUserTurn(conversationId);

    // If no turn exists (e.g., after app restart), accept the edit anyway
    // Frontend has persistent conversation state in localStorage, backend doesn't
    // This is a temporary solution until transcript is persisted to database
    if (!lastUserTurn) {
      console.log('[Edit] No turn found in transcript (likely after restart), creating synthetic turn');

      // Create a synthetic turn representing the original message
      // We don't know the original message text, but we accept the edit request
      // The frontend will handle showing the edited state correctly
      lastUserTurn = agentEngine.contextStore._transcriptStore.addTurn(conversationId, userId || 'default', {
        userMessage: message.trim(),  // Use the edited message as if it was the original
        agentIntent: null,
        agentOutput: null,
      });

      // Return success without creating an edit chain (no previousVersion)
      // This allows editing to work after reload
      return res.json({
        status: 'ok',
        editedTurn: {
          turnId: lastUserTurn.turnId,
          message: lastUserTurn.userMessage,
          editedAt: null,  // Not an edit, just a sync
          previousVersion: null,
        },
        originalTurn: null,
      });
    }

    // Edit the turn (normal flow when turn exists)
    const { editedTurn, originalTurn } = agentEngine.contextStore._transcriptStore.editLastUserTurn(
      conversationId,
      userId || 'default',
      message.trim()
    );

    // TODO: Cancel any pending proposals associated with the original turn
    // This would require tracking proposals by turnId

    console.log('[Edit] Message edited:', {
      originalTurnId: originalTurn.turnId,
      editedTurnId: editedTurn.turnId,
      sessionId,
    });

    return res.json({
      status: 'ok',
      editedTurn: {
        turnId: editedTurn.turnId,
        message: editedTurn.userMessage,
        editedAt: editedTurn.editedAt,
        previousVersion: editedTurn.previousVersion,
      },
      originalTurn: {
        turnId: originalTurn.turnId,
        message: originalTurn.userMessage,
      },
    });
  } catch (err) {
    console.error('[Edit] Error editing message:', err);
    return res.status(500).json({
      status: 'error',
      error: 'EDIT_FAILED',
      message: err.message || 'Failed to edit message',
    });
  }
});

/**
 * POST /agent/confirm - Confirm and execute a proposal (V3 only)
 *
 * Validates posture, snapshot, permissions, then executes action
 */
router.post("/agent/confirm", async (req, res, next) => {
  const { proposalId, sessionId, ackRisk } = req.body || {};
  if (["1", "true", "yes", "on"].includes(String(process.env.AGENT_CHAT_MUTATION_DEBUG || "").toLowerCase())) {
    try {
      console.warn("[agent-confirm-debug]", "route_confirm_received", {
        proposalId: proposalId || null,
        sessionId: sessionId || null,
        ackRisk: ackRisk === true,
        bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
      });
    } catch (_) {}
  }

  try {
    const result = await agentEngine.confirmProposal({
      proposalId,
      sessionId,
      userId: req.user?.id,
      ackRisk: ackRisk === true,
    });

    res.json({ status: "ok", data: result });
  } catch (err) {
    next(err);
  }
});

router.post("/agent/document-generation/preview/confirm", async (req, res, next) => {
  const { previewId, sessionId, editedMarkdown } = req.body || {};
  try {
    const proposalOrOutput = await documentGenerationPreviewService.confirmPreview(previewId, {
      transformPayload: (payload) => {
        const text = String(editedMarkdown || "").trim();
        if (!text) return payload;
        const contentJson = {
          ...(payload.contentJson || {}),
          content: {
            ...((payload.contentJson && payload.contentJson.content) || {}),
            markdown: text,
          },
        };
        return {
          ...payload,
          contentJson,
        };
      },
      createProposal: async ({ target, payload, preview }) => {
        const effectiveSessionId =
          sessionId || preview?.session_id || preview?.conversation_id || null;
        const requestContext = buildRequestContext(
          {
            ...(req.body?.context || {}),
            conversationId:
              req.body?.context?.conversationId ||
              preview?.conversation_id ||
              effectiveSessionId ||
              null,
          },
          effectiveSessionId,
          null,
          req.body?.metadata || null,
        );

        const storageGovernance =
          payload?.storageGovernance &&
          typeof payload.storageGovernance === "object" &&
          !Array.isArray(payload.storageGovernance)
            ? payload.storageGovernance
            : null;
        let resolvedStorageTarget = null;
        if (storageGovernance) {
          try {
            resolvedStorageTarget = resolveStorageTarget({
              activeScope: storageGovernance.activeScope || {},
              storageHint: storageGovernance.storageHint || StorageHint.INHERIT,
            });
          } catch (error) {
            if (String(error?.code || "") === "STORAGE_SCOPE_MISSING") {
              return buildStorageScopeSuggestionArtifact({
                message:
                  String(error?.message || "").trim() ||
                  "I need the target record before I can store this generated document.",
                originalMessage:
                  String(payload?.contentJson?.content?.markdown || "").trim() || null,
              });
            }
            throw error;
          }
        }
        const effectiveTarget = resolvedStorageTarget
          ? {
              type: resolvedStorageTarget.entityType,
              id: resolvedStorageTarget.entityId,
            }
          : target;

        return createGeneratedDocumentProposalFromPlan({
          requestContext,
          sessionId: effectiveSessionId,
          userId: req.user?.id || null,
          plan: {
            target: effectiveTarget,
            documentType: payload.documentType,
            templateKey: payload.templateKey,
            language: payload.language,
            canonicalFormat: payload.canonicalFormat || payload.format,
            previewFormat: payload.previewFormat || DEFAULT_PREVIEW_FORMAT,
            formatSelection: payload.formatSelection || null,
            // Backward compatibility for legacy readers.
            format: payload.canonicalFormat || payload.format,
            schemaVersion: payload.schemaVersion,
            contentJson: payload.contentJson,
            storageGovernance:
              payload?.storageGovernance && typeof payload.storageGovernance === "object"
                ? payload.storageGovernance
                : null,
          },
        });
      },
    });
    if (
      proposalOrOutput &&
      typeof proposalOrOutput === "object" &&
      ["context_suggestion", "identity_collision", "entity_creation_form"].includes(
        String(proposalOrOutput.type || ""),
      )
    ) {
      return res.json({
        status: "ok",
        data: {
          output: proposalOrOutput,
        },
      });
    }
    const effectiveSessionId = sessionId || proposalOrOutput?.sessionId || null;
    return res.json({
      status: "ok",
      data: {
        output: toProposalArtifact(proposalOrOutput, effectiveSessionId),
      },
    });
  } catch (err) {
    if (String(err?.code || "") === "PREVIEW_NOT_CONFIRMABLE") {
      try {
        const preview = documentGenerationPreviewService.getPreviewByUid(previewId);
        const status = String(preview?.status || "").toLowerCase();
        if (status === "expired" || status === "cancelled") {
          const effectiveSessionId =
            sessionId || preview?.session_id || preview?.conversation_id || null;
          clearPendingConfirmationStateForSession(effectiveSessionId, req.user?.id || null);
          recordPreviewCancelledTurn({
            sessionId: effectiveSessionId,
            userId: req.user?.id || null,
            previewId,
            reason: status || "cancelled",
          });
          return res.json({
            status: "ok",
            data: {
              output: buildPreviewCancelledArtifact({
                previewId,
                reason: status || "cancelled",
              }),
            },
          });
        }
      } catch (_) {
        // fall through to default error handling
      }
    }
    return next(err);
  }
});

router.post("/agent/document-generation/preview/cancel", async (req, res, next) => {
  const { previewId, sessionId } = req.body || {};
  try {
    const preview = documentGenerationPreviewService.getPreviewByUid(previewId);
    const result = documentGenerationPreviewService.cancelPreview(previewId);
    const effectiveSessionId =
      sessionId || preview?.session_id || preview?.conversation_id || null;
    clearPendingConfirmationStateForSession(effectiveSessionId, req.user?.id || null);
    recordPreviewCancelledTurn({
      sessionId: effectiveSessionId,
      userId: req.user?.id || null,
      previewId,
      reason: result?.reason || "cancelled",
    });
    return res.json({
      status: "ok",
      data: {
        ...result,
        output: buildPreviewCancelledArtifact({
          previewId,
          reason: result?.reason || "cancelled",
        }),
      },
    });
  } catch (err) {
    return next(err);
  }
});

function newEventId(prefix = "evt") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildArtifactDigest(output) {
  if (!output || typeof output !== "object") return { type: "unknown" };
  const digest = {
    type: String(output.type || "unknown"),
    summary: String(output.summary || output.message || "").slice(0, 360),
  };
  if (Array.isArray(output.items)) {
    digest.itemCount = output.items.length;
  }
  if (Array.isArray(output.results)) {
    digest.resultCount = output.results.length;
  }
  if (output.entityType) {
    digest.entityType = output.entityType;
  }
  if (output.entityId) {
    digest.entityId = output.entityId;
  }
  return digest;
}

function buildPreviewCancelledArtifact({ previewId = null, reason = "cancelled" } = {}) {
  return {
    type: "document_generation_preview_cancelled",
    message: "Preview cancelled.",
    previewId: previewId || null,
    reason: String(reason || "cancelled"),
    status: "cancelled",
    timestamp: new Date().toISOString(),
  };
}

function buildStorageScopeSuggestionArtifact({
  message = "I need the exact target record before storing this document.",
  originalMessage = null,
  suggestions = [],
} = {}) {
  return {
    type: "context_suggestion",
    message: String(message || "").trim() || "I need the exact target record before storing this document.",
    entityType: "dossier",
    reason: "missing_context",
    originalIntent: "CHATBOT_AGENT_MODE",
    originalMessage: originalMessage || null,
    suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 5) : [],
    timestamp: new Date().toISOString(),
    confidence: 0.9,
    source: "document_storage_scope",
    allowManualInput: true,
    manualInputHint:
      "Open or select the target client, dossier, lawsuit, task, session, mission, or financial entry and try again.",
  };
}

function clientHasDeeperScopeEntities(clientId) {
  const normalizedClientId = Number(clientId || 0);
  if (!Number.isInteger(normalizedClientId) || normalizedClientId <= 0) return false;
  try {
    const row = db
      .prepare(
        `SELECT CASE
          WHEN EXISTS (SELECT 1 FROM dossiers d WHERE d.client_id = @client_id AND d.deleted_at IS NULL LIMIT 1) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM lawsuits l
            JOIN dossiers d ON d.id = l.dossier_id
            WHERE d.client_id = @client_id
              AND l.deleted_at IS NULL
              AND d.deleted_at IS NULL
            LIMIT 1
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM sessions s
            LEFT JOIN dossiers d ON d.id = s.dossier_id
            LEFT JOIN lawsuits l ON l.id = s.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE (
              d.client_id = @client_id OR dl.client_id = @client_id
            )
              AND s.deleted_at IS NULL
              AND (d.id IS NULL OR d.deleted_at IS NULL)
              AND (l.id IS NULL OR l.deleted_at IS NULL)
              AND (dl.id IS NULL OR dl.deleted_at IS NULL)
            LIMIT 1
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM tasks t
            LEFT JOIN dossiers d ON d.id = t.dossier_id
            LEFT JOIN lawsuits l ON l.id = t.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE (
              d.client_id = @client_id OR dl.client_id = @client_id
            )
              AND t.deleted_at IS NULL
              AND (d.id IS NULL OR d.deleted_at IS NULL)
              AND (l.id IS NULL OR l.deleted_at IS NULL)
              AND (dl.id IS NULL OR dl.deleted_at IS NULL)
            LIMIT 1
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM missions m
            LEFT JOIN dossiers d ON d.id = m.dossier_id
            LEFT JOIN lawsuits l ON l.id = m.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE (
              d.client_id = @client_id OR dl.client_id = @client_id
            )
              AND m.deleted_at IS NULL
              AND (d.id IS NULL OR d.deleted_at IS NULL)
              AND (l.id IS NULL OR l.deleted_at IS NULL)
              AND (dl.id IS NULL OR dl.deleted_at IS NULL)
            LIMIT 1
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM financial_entries fe
            LEFT JOIN dossiers d ON d.id = fe.dossier_id
            LEFT JOIN lawsuits l ON l.id = fe.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE (
              fe.client_id = @client_id OR d.client_id = @client_id OR dl.client_id = @client_id
            )
              AND fe.deleted_at IS NULL
              AND (d.id IS NULL OR d.deleted_at IS NULL)
              AND (l.id IS NULL OR l.deleted_at IS NULL)
              AND (dl.id IS NULL OR dl.deleted_at IS NULL)
            LIMIT 1
          ) THEN 1
          ELSE 0
        END AS has_deeper`,
      )
      .get({ client_id: normalizedClientId });
    return Number(row?.has_deeper || 0) === 1;
  } catch (_) {
    return false;
  }
}

function buildDeterministicScopeDiscoveryEngine() {
  return {
    async _callReadTool(toolName, params = {}) {
      const limit = Math.max(1, Math.min(Number(params?.limit) || 50, 200));
      if (toolName === "listDossiersForClient") {
        const clientId = Number(params?.clientId || 0);
        const rows = dossiersService
          .list()
          .filter((row) => Number(row?.client_id || 0) === clientId)
          .slice(0, limit);
        return { dossiers: rows };
      }
      if (toolName === "listLawsuits") {
        const dossierId = Number(params?.dossierId || 0);
        const rows = lawsuitsService
          .list()
          .filter((row) => (dossierId > 0 ? Number(row?.dossier_id || 0) === dossierId : true))
          .slice(0, limit);
        return { lawsuits: rows };
      }
      if (toolName === "listSessions") {
        const dossierId = Number(params?.dossierId || 0);
        const lawsuitId = Number(params?.lawsuitId || 0);
        const rows = sessionsService
          .list()
          .filter((row) => {
            if (lawsuitId > 0) return Number(row?.lawsuit_id || 0) === lawsuitId;
            if (dossierId > 0) return Number(row?.dossier_id || 0) === dossierId;
            return true;
          })
          .slice(0, limit);
        return { sessions: rows };
      }
      if (toolName === "listTasks") {
        const dossierId = Number(params?.dossierId || 0);
        const lawsuitId = Number(params?.lawsuitId || 0);
        const rows = tasksService
          .list()
          .filter((row) => {
            if (lawsuitId > 0) return Number(row?.lawsuit_id || 0) === lawsuitId;
            if (dossierId > 0) return Number(row?.dossier_id || 0) === dossierId;
            return true;
          })
          .slice(0, limit);
        return { tasks: rows };
      }
      if (toolName === "listMissions") {
        const dossierId = Number(params?.dossierId || 0);
        const lawsuitId = Number(params?.lawsuitId || 0);
        const rows = missionsService
          .list()
          .filter((row) => {
            if (lawsuitId > 0) return Number(row?.lawsuit_id || 0) === lawsuitId;
            if (dossierId > 0) return Number(row?.dossier_id || 0) === dossierId;
            return true;
          })
          .slice(0, limit);
        return { missions: rows };
      }
      if (toolName === "listFinancialEntries") {
        const clientId = Number(params?.clientId || 0);
        const rows = financialService
          .list(false)
          .filter((row) => Number(row?.client_id || 0) === clientId)
          .slice(0, limit);
        return { financialEntries: rows };
      }
      return {};
    },
  };
}

function clearPendingConfirmationStateForSession(sessionId, userId) {
  if (!sessionId) return;
  try {
    if (typeof agentEngine.clearPendingMutationProposal === "function") {
      agentEngine.clearPendingMutationProposal({
        sessionId: String(sessionId),
        userId: userId || "default",
      });
    }
  } catch (_) {
    // best-effort cleanup
  }
}

function recordPreviewCancelledTurn({ sessionId, userId, previewId, reason }) {
  if (!sessionId) return;
  const transcriptStore = agentEngine.contextStore?._transcriptStore;
  if (!transcriptStore || typeof transcriptStore.addTurn !== "function") return;
  try {
    const artifact = buildPreviewCancelledArtifact({ previewId, reason });
    transcriptStore.addTurn(String(sessionId), userId || "default", {
      userMessage: null,
      agentIntent: "CHATBOT_AGENT_MODE",
      agentOutput: {
        type: "chat",
        message: artifact.message,
        posture: "ASSISTANT",
        toolCalls: 0,
      },
      artifactType: artifact.type,
    });
  } catch (_) {
    // best-effort transcript marker
  }
}

function createDeltaEmitter(emitDelta) {
  let buffer = "";
  let lastFlushAt = Date.now();
  return {
    push(text) {
      const value = String(text || "");
      if (!value) return;
      buffer += value;
      while (buffer.length >= DELTA_MAX_CHARS) {
        const chunk = buffer.slice(0, DELTA_MAX_CHARS);
        buffer = buffer.slice(DELTA_MAX_CHARS);
        lastFlushAt = Date.now();
        emitDelta(chunk);
      }
      if (buffer.length > 0 && Date.now() - lastFlushAt >= DELTA_FLUSH_MS) {
        const chunk = buffer;
        buffer = "";
        lastFlushAt = Date.now();
        emitDelta(chunk);
      }
    },
    flush() {
      if (!buffer) return;
      emitDelta(buffer);
      buffer = "";
      lastFlushAt = Date.now();
    },
  };
}

router.post("/agent/stream", async (req, res) => {
  const {
    message,
    context,
    agentVersion = "v1",
    reasoner,
    followUpIntent,
    sessionId,
    documentIds,
    metadata,
  } = req.body || {};

  const documentContext = resolveDocumentContext(sessionId, documentIds);
  const hasMessage = message && typeof message === "string" && message.trim();
  const hasDocuments =
    documentContext &&
    Array.isArray(documentContext.documents) &&
    documentContext.documents.length > 0;

  if (!hasMessage && !followUpIntent && !hasDocuments) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const requestContext = buildRequestContext(
    context,
    sessionId,
    documentContext,
    metadata,
  );
  const effectiveMessage =
    hasMessage || followUpIntent || !hasDocuments ? message : "uploaded file";
  const turnId = newEventId("turn");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Encoding", "identity");
  res.flushHeaders();

  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  let aborted = false;
  const abortController = new AbortController();
  res.on("close", () => {
    aborted = true;
    abortController.abort();
  });

  let seq = 0;
  let didEnd = false;
  let artifactTerminal = false;
  let hasStageFailure = false;
  let hasVisibleArtifact = false;

  const emit = (type, payload) => {
    if (aborted) return;
    const envelope = {
      eventId: newEventId("evt"),
      turnId,
      seq: ++seq,
      type,
      timestamp: new Date().toISOString(),
      payload: payload && typeof payload === "object" ? payload : {},
    };
    if (!validateEnvelope(envelope)) {
      return;
    }
    res.write(`event: ${type}\ndata: ${JSON.stringify(envelope)}\n\n`);
    if (typeof res.flush === "function") {
      res.flush();
    }
  };

  const emitFailed = (eventName, failure) => {
    hasStageFailure = true;
    const safeFailure = {
      stage: failure?.stage || "turn",
      code: String(failure?.code || "UNKNOWN_ERROR"),
      message: String(failure?.message || "Unknown stream failure"),
      retryable: Boolean(failure?.retryable),
      visibility:
        String(failure?.visibility || "visible").toLowerCase() === "metadata"
          ? "metadata"
          : "visible",
      interactionMode:
        failure?.interactionMode === "conversational"
          ? "conversational"
          : failure?.interactionMode === "operational"
            ? "operational"
            : undefined,
      details:
        failure?.details && typeof failure.details === "object"
          ? failure.details
          : {},
    };
    if (!validateFailure(safeFailure)) {
      safeFailure.code = "FAILURE_SCHEMA_INVALID";
      safeFailure.message = "Failure payload could not be validated";
      safeFailure.retryable = false;
      safeFailure.details = {};
    }
    emit(eventName, safeFailure);
  };

  const emitRecoveryArtifact = async ({
    error,
    code,
    context = {},
    interactionMode = "operational",
  } = {}) => {
    if (hasVisibleArtifact) return;
    const mapped = await mapUserFailure(
      {
        ...(error && typeof error === "object" ? error : {}),
        code: code || error?.code,
      },
      context,
    );
    agentEngine.ledger.record({
      type: "user_failure_mapped",
      endpoint: "/agent/stream",
      code: mapped.code,
      message: mapped.internalMessage,
      timestamp: new Date().toISOString(),
    });
    emit("artifact.final", {
      intent: "RECOVERY",
      output: mapped.recovery,
      contextLifecycle: null,
      visibility: "visible",
      interactionMode,
    });
    hasVisibleArtifact = true;
  };

  try {
    emit("turn.start", {
      agentVersion,
      intent: "PENDING",
    });

    const detectorConfig = getMutationIntentDetectorConfig();
    const streamDetectorEnabled =
      envFlag("AGENT_MUTATION_INTENT_STREAM_DETECTION", false) &&
      detectorConfig.enabled &&
      (!detectorConfig.chatOnly || envFlag("AGENT_MUTATION_INTENT_STREAM_DETECTION", false));
    const scopeBindingEnabled = envFlag("AGENT_SCOPE_BINDING_ENABLED", true);

    if (streamDetectorEnabled && typeof effectiveMessage === "string") {
      const state = getStreamMutationDetectionState(requestContext) || {};
      const pendingProposal = state.pendingMutationProposal || null;
      const pendingProposalActive =
        pendingProposal &&
        pendingProposal.proposalId &&
        (!pendingProposal.expiresAt || Date.parse(pendingProposal.expiresAt) > Date.now());

      if (
        !(
          state.suppressMutationDetectionUntilResolved === true &&
          pendingProposalActive
        )
      ) {
        const llmHistory =
          typeof agentEngine.contextStore?.getContextForLLMInjection === "function"
            ? agentEngine.contextStore.getContextForLLMInjection(requestContext)
            : {};
        const policy = agentEngine._resolvePolicy(agentVersion);
        const detectorDecision = await detectStrongMutationIntent({
          message: effectiveMessage,
          llmHistory,
          executionContext: {
            ...requestContext,
            posture: "WORK",
            confirmed: true,
            sessionId: sessionId || requestContext?.conversationId || null,
            userId: requestContext?.userId || null,
            tenantId: requestContext?.tenantId || null,
            dataAccess:
              requestContext?.dataAccess && typeof requestContext.dataAccess === "object"
                ? requestContext.dataAccess
                : {},
          },
          pendingClarification: state.pendingMutationClarification || null,
          llmExtractor: generateChatResponse,
          logger: (entry) => agentEngine.ledger.record(entry),
          sourceRoute: "/agent/stream",
        });

        if (detectorDecision?.decision === "clarify") {
          updateStreamMutationDetectionState(requestContext, {
            pendingMutationClarification:
              detectorDecision.clearPendingClarification === true
                ? null
                : detectorDecision.pendingClarification !== undefined
                  ? detectorDecision.pendingClarification
                  : state.pendingMutationClarification || null,
            suppressMutationDetectionUntilResolved: Boolean(
              detectorDecision.pendingClarification,
            ),
          });

          const output = {
            type: "explanation",
            summary:
              String(detectorDecision.question || "").trim() ||
              "I need one more detail to prepare a mutation proposal.",
            details: {
              reason: detectorDecision.reason || null,
              detectionConfidence: detectorDecision?.scores?.finalConfidence ?? null,
            },
          };
          const interactionMode = "conversational";
          emit("artifact.final", {
            intent: "CHATBOT_AGENT_MODE",
            output,
            contextLifecycle: null,
            visibility: "visible",
            interactionMode,
          });
          hasVisibleArtifact = true;
          artifactTerminal = true;
          emit("turn.end", {
            status: "success",
            hadStageFailures: false,
            preview: { intent: "CHATBOT_AGENT_MODE" },
            interactionMode,
          });
          didEnd = true;
          res.end();
          return;
        }

        if (detectorDecision?.decision === "propose" && detectorDecision.shadowMode !== true) {
          let resolvedProposalInput = detectorDecision.proposalInput;
          let scopeBindingAudit = null;
          if (
            scopeBindingEnabled &&
            agentEngine.scopeManager &&
            typeof agentEngine.scopeManager.resolveBindingsForProposalInput === "function"
          ) {
            const scopeBindingResult = await agentEngine.scopeManager.resolveBindingsForProposalInput({
              proposalInput: detectorDecision.proposalInput,
              requestContext,
              executionContext: {
                ...requestContext,
                sessionId: sessionId || requestContext?.conversationId || null,
                userId: requestContext?.userId || null,
                tenantId: requestContext?.tenantId || null,
              },
              lookupFns: {},
            });
            resolvedProposalInput = scopeBindingResult?.proposalInput || detectorDecision.proposalInput;
            scopeBindingAudit = scopeBindingResult?.bindingAudit || null;
          }

          const execCtx = {
            ...requestContext,
            posture: "WORK",
            confirmed: true,
            explicitMutationCommand: false,
            strongMutationIntent: true,
            sessionId: sessionId || requestContext?.conversationId || null,
            userId: requestContext?.userId || null,
            tenantId: requestContext?.tenantId || null,
            dataAccess:
              requestContext?.dataAccess && typeof requestContext.dataAccess === "object"
                ? requestContext.dataAccess
                : {},
            sourceRoute: "/agent/stream",
          };

          const v2Result = await agentEngine.executeToolV2(
            "propose_entity_mutation",
            resolvedProposalInput,
            policy,
            execCtx,
          );
          const proposal = v2Result?.result;
          if (!proposal?.proposalId || proposal.requiresConfirmation !== true) {
            throw new Error("Failed to create mutation proposal.");
          }

          if (typeof agentEngine.storeProposal === "function") {
            agentEngine.storeProposal(proposal, {
              explicitMutationCommand: false,
              strongMutationIntent: true,
              origin: "strong_mutation_intent",
              proposalKind: "entity_mutation",
              sourceRoute: "/agent/stream",
              conversationId: requestContext?.conversationId || null,
              sessionId: execCtx.sessionId || null,
              userId: execCtx.userId || null,
              tenantId: execCtx.tenantId || null,
              detectionConfidence: detectorDecision.scores?.finalConfidence ?? null,
              detectionScores: detectorDecision.scores || null,
              riskLevel: detectorDecision.risk || "low",
              requiresExtraConfirmation:
                detectorDecision.requiresExtraConfirmation === true,
              scopeBinding: scopeBindingAudit || null,
            });
          }

          updateStreamMutationDetectionState(requestContext, {
            pendingMutationClarification: null,
            pendingMutationProposal: {
              proposalId: proposal.proposalId,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 300000).toISOString(),
              riskLevel: detectorDecision.risk || "low",
            },
            suppressMutationDetectionUntilResolved: true,
          });

          const artifactProposal =
            scopeBindingAudit && scopeBindingAudit.applied
              ? {
                  ...proposal,
                  confirmation: {
                    ...(proposal?.confirmation || {}),
                    scopeBinding: scopeBindingAudit,
                  },
                }
              : proposal;
          const output = toProposalArtifact(artifactProposal, execCtx.sessionId);
          const interactionMode = "operational";
          emit("artifact.final", {
            intent: "COMMAND",
            output,
            contextLifecycle: null,
            visibility: "visible",
            interactionMode,
          });
          hasVisibleArtifact = true;
          artifactTerminal = true;
          emit("turn.end", {
            status: "success",
            hadStageFailures: false,
            preview: { intent: "COMMAND" },
            interactionMode,
          });
          didEnd = true;
          res.end();
          return;
        }
      }
    }

    const chatResult = await chatOrchestrator.runChatTurn({
      message: effectiveMessage,
      context: requestContext,
      agentVersion: agentVersion || "v3",
      followUpIntent,
      sessionId,
      metadata,
      userId: req.user?.id || null,
      tenantId: req.user?.tenantId || requestContext?.tenantId || null,
      signal: abortController.signal,
    });
    const _streamSearchArtifact = Array.isArray(chatResult?.toolExecutions)
      ? chatResult.toolExecutions
          .filter((e) => e?.ok === true)
          .map((e) => normalizeChatSearchArtifact(e))
          .find(Boolean) || null
      : null;
    const contextLifecycle =
      typeof agentEngine.contextStore?.consumeLifecycleEvent === "function"
        ? agentEngine.contextStore.consumeLifecycleEvent(requestContext)
        : null;
    const unifiedResult = {
      intent: chatResult?.intent || "CHATBOT_AGENT_MODE",
      output: chatResult?.outputArtifact || chatResult?.ambiguityArtifact || _streamSearchArtifact || { type: "chat", message: chatResult?.message || "" },
      contextLifecycle,
    };
    const artifactOutput = unifiedResult?.output;
    const interactionMode = resolveInteractionMode({
      output: artifactOutput,
      intent: unifiedResult?.intent,
      result: unifiedResult,
      toolExecutions: [],
      documentContext: requestContext?.documentContext || null,
    });
    agentEngine.ledger.record({
      type: "interaction_mode_selected",
      mode: interactionMode,
      endpoint: "/agent/stream",
      timestamp: new Date().toISOString(),
    });

    if (!artifactOutput || typeof artifactOutput !== "object") {
      emitFailed("artifact.failed", {
        stage: "artifact",
        code: "INVALID_ARTIFACT",
        message: "Artifact payload missing from agent run result",
        retryable: false,
        visibility: "metadata",
        interactionMode,
      });
      await emitRecoveryArtifact({
        code: "INVALID_ARTIFACT",
        context: { intent: unifiedResult?.intent || "UNKNOWN" },
        interactionMode,
      });
      artifactTerminal = true;
    } else {
      const artifactDelta = createDeltaEmitter((chunk) =>
        emit("artifact.delta", { chunk, visibility: "visible", interactionMode }),
      );
      artifactDelta.push(JSON.stringify(buildArtifactDigest(artifactOutput)));
      artifactDelta.flush();

      try {
        console.log(
          "[AgentRouter][artifact.final]",
          JSON.stringify({
            intent: unifiedResult.intent || null,
            artifactType:
              artifactOutput && typeof artifactOutput === "object"
                ? artifactOutput.type || "object_without_type"
                : null,
            proposalId:
              artifactOutput?.proposalId ||
              artifactOutput?.proposals?.[0]?.proposalId ||
              null,
            entityType: artifactOutput?.entityType || artifactOutput?.target?.type || null,
            entityId: artifactOutput?.entityId || artifactOutput?.target?.id || null,
            interactionMode,
          }),
        );
      } catch (_) {
        // Debug logging only
      }

      emit("artifact.final", {
        intent: unifiedResult.intent,
        output: artifactOutput,
        contextLifecycle: unifiedResult.contextLifecycle || null,
        visibility: "visible",
        interactionMode,
      });
      hasVisibleArtifact = true;
      artifactTerminal = true;
    }

    emit("turn.end", {
      status: "success",
      hadStageFailures: hasStageFailure,
      preview: {
        intent: unifiedResult?.intent || "UNKNOWN",
      },
      interactionMode,
    });
    didEnd = true;
  } catch (err) {
    if (!artifactTerminal) {
      emitFailed("artifact.failed", {
        stage: "artifact",
        code: "ARTIFACT_ABORTED",
        message: "Artifact stage aborted before finalization",
        retryable: false,
        visibility: "metadata",
        interactionMode: "operational",
      });
      artifactTerminal = true;
    }
    await emitRecoveryArtifact({
      error: err,
      context: { intent: "STREAM_EXECUTION" },
      interactionMode: "operational",
    });
    emit("turn.end", {
      status: "success",
      error: null,
      interactionMode: "operational",
    });
    didEnd = true;
  }

  if (!didEnd) {
    await emitRecoveryArtifact({
      code: "STREAM_TERMINATED",
      context: { intent: "STREAM_EXECUTION" },
      interactionMode: "operational",
    });
    emit("turn.end", {
      status: "success",
      error: null,
      interactionMode: "operational",
    });
  }
  res.end();
});

router.__private = {
  clientHasDeeperScopeEntities,
  resolveGeneratedDocumentAttachTarget,
};

module.exports = router;
