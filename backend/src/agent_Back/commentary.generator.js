"use strict";

/**
 * Commentary Generator — Conversational Layer for Agent V1
 *
 * This module generates conversational commentary ABOUT structured artifacts.
 * It runs AFTER artifact generation and NEVER blocks the artifact if it fails.
 *
 * CRITICAL DISTINCTION:
 *   - Structured Artifact: deterministic, rule-based, testable, boring on purpose
 *   - Conversational Commentary: LLM-generated, references artifact, never invents data
 *
 * The commentary is where the "intelligence" lives — it explains, contextualizes,
 * and suggests, but NEVER performs actions or mutates state.
 */

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "qwen2.5:7b-instruct";
const LLM_TIMEOUT = parseInt(process.env.LLM_COMMENTARY_TIMEOUT || "30000", 10);
const ALWAYS_GENERATE_COMMENTARY = process.env.LLM_COMMENTARY_ALWAYS !== "false";

// ─── Commentary Prompt Template ────────────────────────────────────────────

/**
 * PROMPT TEMPLATE FOR COMMENTARY GENERATION
 *
 * The prompt receives ONLY:
 *   - entity type
 *   - entity ID/reference
 *   - high-level signals (counts, status, flags)
 *   - interpretation summary (NOT raw DB rows)
 *   - follow-up options already computed
 *
 * The prompt does NOT receive:
 *   - full tables
 *   - raw database records
 *   - sensitive content (emails, phone numbers, etc.)
 *   - unnecessary fields
 */
const COMMENTARY_SYSTEM_PROMPT = `You are Organia Assistant, a helpful AI for a legal practice management system.
You have just retrieved structured information for the user. Your task is to provide a brief, conversational message that:

1. ACKNOWLEDGES what was found (1 sentence)
2. EXPLAINS relevance if there are urgent signals (1 sentence, only if needed)
3. ASKS for clarification if ambiguity exists (1 question, only if needed)
4. SUGGESTS read-only next steps (1 brief sentence)

RULES:
- Be concise (2-4 sentences max)
- Do NOT repeat the facts verbatim
- Do NOT restate the artifact structure
- Do NOT invent urgency that wasn't signaled
- Do NOT propose write actions (create, update, delete, send, assign)
- ONLY suggest read-only explorations (view, list, summarize, review)
- If the data already fully answers the request, you may be brief or silent

TONE: Professional, helpful, conversational. Not robotic.`;

/**
 * Builds a prompt context from the artifact summary.
 * Extracts ONLY what the LLM needs to generate commentary.
 *
 * @param {Object} artifactSummary - High-level summary of the artifact
 * @returns {string} - Context string for the LLM prompt
 */
function buildPromptContext(artifactSummary, semanticSignals = []) {
  const lines = [];

  // Entity identity
  if (artifactSummary.entityType) {
    lines.push(`Entity type: ${artifactSummary.entityType}`);
  }
  if (artifactSummary.entityReference) {
    lines.push(`Reference: ${artifactSummary.entityReference}`);
  }

  // High-level signals
  if (artifactSummary.signals && artifactSummary.signals.length > 0) {
    lines.push(`Signals: ${artifactSummary.signals.join("; ")}`);
  }

  // Interpretation summary (not raw statements)
  if (artifactSummary.interpretationSummary) {
    lines.push(`Status: ${artifactSummary.interpretationSummary}`);
  }

  // Counts (if list)
  if (typeof artifactSummary.totalCount === "number") {
    lines.push(`Total items: ${artifactSummary.totalCount}`);
  }
  if (typeof artifactSummary.urgentCount === "number" && artifactSummary.urgentCount > 0) {
    lines.push(`Urgent items: ${artifactSummary.urgentCount}`);
  }
  if (typeof artifactSummary.overdueCount === "number" && artifactSummary.overdueCount > 0) {
    lines.push(`Overdue items: ${artifactSummary.overdueCount}`);
  }

  // Ambiguity flag
  if (artifactSummary.isAmbiguous) {
    lines.push(`Note: Multiple matches found, clarification may be needed`);
  }
  if (artifactSummary.isIncomplete) {
    lines.push(`Note: Request may be incomplete, more details could help`);
  }

  // Available follow-ups (just labels)
  if (artifactSummary.followUpLabels && artifactSummary.followUpLabels.length > 0) {
    lines.push(`Available explorations: ${artifactSummary.followUpLabels.join(", ")}`);
  }

  if (Array.isArray(semanticSignals) && semanticSignals.length > 0) {
    lines.push(`Semantic signals: ${JSON.stringify(semanticSignals)}`);
  }

  return lines.join("\n");
}

/**
 * Extracts a high-level summary from a structured artifact.
 * This is what gets passed to the LLM — NOT raw data.
 *
 * @param {string} artifactType - Type of artifact (explanation, risk_analysis, etc.)
 * @param {Object} artifact - The full artifact output
 * @param {Object} context - Original request context
 * @returns {Object} - Summarized context for commentary
 */
function extractArtifactSummary(artifactType, artifact, context) {
  const summary = {
    entityType: artifact.entityType || context?.scope || "entity",
    entityReference: artifact.entityId || "unknown",
    signals: [],
    interpretationSummary: null,
    followUpLabels: [],
    isAmbiguous: false,
    isIncomplete: false,
    factsSummary: "",
    factsDetails: [],
    totalCount: null,
    urgentCount: null,
    overdueCount: null,
    resultCount: null,
  };

  if (artifactType === "clarification" && artifact?.reason) {
    summary.entityType = artifact.reason.entityType || summary.entityType;
    if (typeof artifact.reason.resultCount === "number") {
      summary.resultCount = artifact.reason.resultCount;
    }
    if (artifact.reason.type === "AMBIGUOUS_SELECTION") {
      summary.isAmbiguous = true;
    }
    if (artifact.reason.type === "MISSING_INFORMATION") {
      summary.isIncomplete = true;
    }
  }

  summary.factsSummary =
    artifact.facts?.summary || artifact.summary || summary.factsSummary;
  summary.factsDetails = Array.isArray(artifact.facts?.details)
    ? artifact.facts.details
    : Array.isArray(artifact.details)
      ? artifact.details
      : [];

  // Extract interpretation summary
  if (artifact.interpretation?.summary) {
    summary.interpretationSummary = artifact.interpretation.summary;
  }

  // Extract signals from interpretation statements
  if (artifact.interpretation?.statements) {
    for (const stmt of artifact.interpretation.statements) {
      if (stmt.level === "critical") {
        summary.signals.push(`CRITICAL: ${stmt.statement}`);
      } else if (stmt.level === "warning") {
        summary.signals.push(`Warning: ${stmt.statement}`);
      }
    }
  }

  // Extract follow-up labels (just the action names, not full objects)
  if (artifact.followUps && Array.isArray(artifact.followUps)) {
    summary.followUpLabels = artifact.followUps
      .slice(0, 4)
      .map((f) => f.label);
  }

  // Handle list-type artifacts (tasks, dossiers, etc.)
  if (Array.isArray(artifact.items)) {
    summary.totalCount = artifact.items.length;
    // Count urgent/overdue if available
    const urgent = artifact.items.filter(
      (item) =>
        item.priority === "urgent" ||
        item.priority === "high" ||
        item.status === "urgent"
    );
    const overdue = artifact.items.filter(
      (item) =>
        item.days_overdue > 0 ||
        item.is_overdue ||
        (item.due_date && new Date(item.due_date) < new Date())
    );
    summary.urgentCount = urgent.length;
    summary.overdueCount = overdue.length;
  }

  if (typeof context?._resultCount === "number") {
    summary.resultCount = context._resultCount;
  }

  if (summary.resultCount === null) {
    const summaryText = artifact.facts?.summary || artifact.summary || "";
    if (/no\s+\w+/i.test(summaryText)) {
      summary.resultCount = 0;
    } else {
      const countMatch = summaryText.match(/(\d+)\s+\w+/);
      if (countMatch) summary.resultCount = parseInt(countMatch[1], 10);
    }
  }

  if (summary.resultCount === null && Array.isArray(artifact.interpretation?.statements)) {
    const statementWithCount = artifact.interpretation.statements.find(
      (stmt) => typeof stmt.statement === "string" && /\d+/.test(stmt.statement),
    );
    if (statementWithCount) {
      const match = statementWithCount.statement.match(/(\d+)/);
      if (match) summary.resultCount = parseInt(match[1], 10);
    }
  }

  // Check for ambiguity (from context)
  if (context?._readOutcome === "ambiguous") {
    summary.isAmbiguous = true;
  }
  if (context?._readOutcome === "incomplete") {
    summary.isIncomplete = true;
  }

  return summary;
}

function deriveSemanticSignals(summary) {
  const signals = [];

  if (typeof summary.resultCount === "number" && summary.resultCount === 0) {
    signals.push({
      type: "EMPTY_RESULT",
      entityType: summary.entityType,
      resultCount: summary.resultCount,
    });
  }

  if (typeof summary.resultCount === "number" && summary.resultCount > 1) {
    signals.push({
      type: "MULTIPLE_RESULTS",
      entityType: summary.entityType,
      resultCount: summary.resultCount,
    });
  }

  if (summary.isAmbiguous) {
    signals.push({
      type: "AMBIGUOUS_SCOPE",
      entityType: summary.entityType,
      resultCount: summary.resultCount,
    });
  }

  if (summary.isIncomplete) {
    signals.push({
      type: "MISSING_INFORMATION",
      entityType: summary.entityType,
      reason: "incomplete_request",
    });
  }

  return signals;
}

function splitSentences(text) {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
}

function capSentences(text, maxSentences) {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return text.trim();
  return sentences.slice(0, maxSentences).join(" ").trim();
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
}

function isRedundant(commentary, reference) {
  if (!commentary || !reference) return false;
  const refTokens = new Set(tokenize(reference));
  if (refTokens.size < 4) return false;
  const commentTokens = tokenize(commentary);
  if (commentTokens.length === 0) return false;
  let overlap = 0;
  for (const token of commentTokens) {
    if (refTokens.has(token)) overlap += 1;
  }
  return overlap / refTokens.size >= 0.6;
}

function applyCommentaryPolicy(summary) {
  // Always generate commentary to provide conversational interaction
  // The LLM will keep it short if there's nothing important to add
  // This is the key to making the agent feel "alive" rather than silent
  return { action: "allow", reason: "always_engage" };
}

function sanitizeCommentary(text, summary, artifact, options = {}) {
  if (!text) return null;
  const allowIdentifiers = Boolean(options.allowIdentifiers);
  let cleaned = String(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // Only filter out truly useless responses
  const lower = cleaned.toLowerCase();
  const bannedPhrases = [
    "no data available",
    "error occurred",
    "something went wrong",
  ];
  if (bannedPhrases.some((phrase) => lower.includes(phrase))) {
    return null;
  }

  // Remove specific identifiers to keep commentary clean
  if (!allowIdentifiers) {
    const identifierPattern =
      /\b[A-Z]{2,5}-\d{3,6}-\d{2,6}\b|\bID[:\s]*\d+\b|\b#\d{2,}\b|\bDOS-\d{4}-\d+\b/i;
    if (identifierPattern.test(cleaned)) {
      // Instead of rejecting, strip the identifiers
      cleaned = cleaned.replace(identifierPattern, "").replace(/\s+/g, " ").trim();
    }
  }

  cleaned = capSentences(cleaned, 3);
  return cleaned || null;
}

/**
 * Generates conversational commentary about a structured artifact.
 * Uses Ollama LLM but NEVER blocks the artifact if it fails.
 *
 * @param {string} artifactType - Type of artifact (explanation, risk_analysis, etc.)
 * @param {Object} artifact - The structured artifact output
 * @param {Object} context - Original request context
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} - Commentary result { success, commentary, error }
 */
async function generateCommentary(artifactType, artifact, context = {}, options = {}) {
  // Skip commentary for chat-type artifacts (already conversational)
  if (artifactType === "chat") {
    return { success: true, commentary: null, skipped: true, reason: "chat_artifact" };
  }

  // Extract summary — this is what the LLM sees
  const artifactSummary = extractArtifactSummary(artifactType, artifact, context);
  const semanticSignals = Array.isArray(options.semanticSignals) ? options.semanticSignals : [];
  const forceResponse = Boolean(options.forceResponse);
  const minLength = typeof options.minLength === "number" ? options.minLength : 10;
  const promptContext = buildPromptContext(artifactSummary, semanticSignals);

  // Build the full prompt
  const userPrompt = `Based on the following retrieved data, provide a brief conversational comment:

${promptContext}

Remember: Be concise, acknowledge findings, and suggest read-only next steps only.
Do not mention specific record IDs, references, or list specific items.${forceResponse ? "\nYou must respond with 1-2 short sentences." : ""}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${COMMENTARY_SYSTEM_PROMPT}\n\nUser: ${userPrompt}\n\nAssistant:`,
        stream: false,
        options: {
          temperature: 0.6,
          num_predict: 150, // Keep it concise
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("[Commentary] LLM request failed:", response.status);
      return { success: false, commentary: null, error: `LLM_HTTP_${response.status}` };
    }

    const data = await response.json();
    const commentary = (data.response || "").trim();

    // Validate commentary isn't empty or too short
    if (!commentary || commentary.length < minLength) {
      return { success: true, commentary: null, skipped: true, reason: "empty_response" };
    }

    // Basic safety check — reject if commentary contains action verbs
    const actionVerbs = /\b(create|update|delete|send|assign|execute|modify|change|add|remove|schedule|book|submit|file)\b/i;
    if (actionVerbs.test(commentary)) {
      console.warn("[Commentary] Rejected — contains action verbs:", commentary.slice(0, 100));
      return { success: false, commentary: null, error: "ACTION_VERB_DETECTED" };
    }

    return { success: true, commentary };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      console.warn("[Commentary] LLM timeout");
      return { success: false, commentary: null, error: "TIMEOUT" };
    }

    console.warn("[Commentary] LLM error:", err.message);
    return { success: false, commentary: null, error: err.message };
  }
}

/**
 * Stream commentary generation with callbacks for real-time output.
 * Provides immediate responsiveness as the LLM generates text.
 *
 * @param {string} artifactType - Type of artifact
 * @param {Object} artifact - The structured artifact output
 * @param {Object} context - Original request context
 * @param {Object} callbacks - { onChunk, onDone, onError }
 * @param {AbortSignal} signal - Optional abort signal
 */
async function streamCommentary(artifactType, artifact, context, callbacks, signal) {
  // Skip commentary for chat-type artifacts
  if (artifactType === "chat") {
    callbacks.onDone?.({ commentary: null, source: "skipped", reason: "chat_artifact" });
    return;
  }

  const artifactSummary = extractArtifactSummary(artifactType, artifact, context);
  const semanticSignals = deriveSemanticSignals(artifactSummary);
  const promptContext = buildPromptContext(artifactSummary, semanticSignals);

  const userPrompt = `Based on the following retrieved data, provide a brief conversational comment:

${promptContext}

Remember: Be concise, acknowledge findings, and suggest read-only next steps only.
Do not mention specific record IDs, references, or list specific items.
You must respond with 1-2 short sentences.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  let fullContent = "";

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${COMMENTARY_SYSTEM_PROMPT}\n\nUser: ${userPrompt}\n\nAssistant:`,
        stream: true,
        options: {
          temperature: 0.6,
          num_predict: 150,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      callbacks.onError?.(`LLM request failed: ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullContent += data.response;
            callbacks.onChunk?.(data.response);
          }
          if (data.done) {
            // Sanitize final content
            const sanitized = sanitizeCommentary(fullContent, artifactSummary, artifact, {
              allowIdentifiers: false,
            });
            callbacks.onDone?.({
              commentary: sanitized,
              source: sanitized ? "llm" : "skipped",
              signals: semanticSignals,
            });
            return;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // Stream ended without done signal
    const sanitized = sanitizeCommentary(fullContent, artifactSummary, artifact, {
      allowIdentifiers: false,
    });
    callbacks.onDone?.({
      commentary: sanitized,
      source: sanitized ? "llm" : "skipped",
      signals: semanticSignals,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      callbacks.onDone?.({ commentary: null, source: "skipped", reason: "timeout" });
    } else {
      callbacks.onError?.(err.message);
    }
  }
}

/**
 * Determines if commentary should be generated for this artifact type.
 * Some artifact types don't need commentary (e.g., already conversational).
 *
 * @param {string} artifactType - Type of artifact
 * @param {Object} artifact - The artifact data
 * @returns {boolean} - Whether to generate commentary
 */
function shouldGenerateCommentary(artifactType, artifact) {
  // Always skip chat artifacts — they ARE the conversation
  if (artifactType === "chat") return false;

  // Skip if artifact is empty or error
  if (!artifact || artifact.type === "error") return false;

  // Generate for read-type artifacts
  const readTypes = ["explanation", "risk_analysis", "action_plan", "clarification"];
  if (readTypes.includes(artifactType)) return true;

  // Generate for draft artifacts (to explain what was drafted)
  if (artifactType === "draft") return true;

  // Default: generate commentary
  return true;
}

/**
 * Builds a fallback commentary when LLM fails.
 * Uses rule-based generation based on artifact signals.
 *
 * @param {Object} artifactSummary - Extracted summary from artifact
 * @returns {string|null} - Fallback commentary or null
 */
/**
 * Main entry point for commentary generation.
 * Ensures commentary NEVER blocks the artifact.
 *
 * @param {string} artifactType - Type of artifact
 * @param {Object} artifact - The structured artifact
 * @param {Object} context - Request context
 * @returns {Promise<Object>} - { commentary: string|null, source: 'llm'|'fallback'|'skipped' }
 */
async function generateAgentCommentary(artifactType, artifact, context = {}) {
  // Check if we should generate commentary at all
  if (!shouldGenerateCommentary(artifactType, artifact)) {
    return { commentary: null, source: "skipped" };
  }

  const artifactSummary = extractArtifactSummary(artifactType, artifact, context);
  const semanticSignals = deriveSemanticSignals(artifactSummary);
  const policy = applyCommentaryPolicy(artifactSummary);
  const needsClarification =
    artifactSummary.isAmbiguous ||
    artifactSummary.isIncomplete ||
    artifactSummary.resultCount === 0 ||
    (typeof artifactSummary.resultCount === "number" && artifactSummary.resultCount > 1);
  const forceNarration = ALWAYS_GENERATE_COMMENTARY;
  const forceResponse = forceNarration || needsClarification;

  if (policy.action === "skip") {
    return { commentary: null, source: "skipped", reason: policy.reason, signals: semanticSignals };
  }

  // Try LLM-based commentary
  let result = await generateCommentary(artifactType, artifact, context, {
    semanticSignals,
    forceResponse,
    minLength: forceResponse ? 4 : 10,
  });

  if (needsClarification && result.success && !result.commentary && result.skipped) {
    result = await generateCommentary(artifactType, artifact, context, {
      semanticSignals,
      forceResponse: true,
      minLength: 4,
    });
  }

  if (result.success && result.commentary) {
    let sanitized = sanitizeCommentary(result.commentary, artifactSummary, artifact, {
      allowRedundant: forceResponse,
      allowIdentifiers: false,
    });
    if (!sanitized) {
      const retry = await generateCommentary(artifactType, artifact, context, {
        semanticSignals,
        forceResponse: true,
        minLength: 4,
      });
      if (retry.success && retry.commentary) {
        sanitized = sanitizeCommentary(retry.commentary, artifactSummary, artifact, {
          allowRedundant: needsClarification,
          allowIdentifiers: false,
        });
      }
    }
    if (sanitized) {
      return { commentary: sanitized, source: "llm", signals: semanticSignals };
    }
    return { commentary: null, source: "skipped", reason: "redundant", signals: semanticSignals };
  }

  // No commentary generated
  return { commentary: null, source: result.skipped ? "skipped" : "failed", signals: semanticSignals };
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  generateAgentCommentary,
  generateCommentary,
  streamCommentary,
  extractArtifactSummary,
  buildPromptContext,
  shouldGenerateCommentary,
  COMMENTARY_SYSTEM_PROMPT,
};
