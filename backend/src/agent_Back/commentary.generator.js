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
const LLM_TIMEOUT = parseInt(process.env.LLM_COMMENTARY_TIMEOUT || "15000", 10);

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
function buildPromptContext(artifactSummary) {
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
    totalCount: null,
    urgentCount: null,
    overdueCount: null,
  };

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

  // Check for ambiguity (from context)
  if (context?._readOutcome === "ambiguous") {
    summary.isAmbiguous = true;
  }
  if (context?._readOutcome === "incomplete") {
    summary.isIncomplete = true;
  }

  return summary;
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
  const promptContext = buildPromptContext(artifactSummary);

  // Build the full prompt
  const userPrompt = `Based on the following retrieved data, provide a brief conversational comment:

${promptContext}

Remember: Be concise, acknowledge findings, and suggest read-only next steps only.`;

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
          num_predict: 200, // Keep it concise
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
    if (!commentary || commentary.length < 10) {
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
  const readTypes = ["explanation", "risk_analysis", "action_plan"];
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
function buildFallbackCommentary(artifactSummary) {
  const parts = [];

  // Acknowledge the entity
  if (artifactSummary.entityType && artifactSummary.entityReference) {
    parts.push(
      `I found the ${artifactSummary.entityType} you requested (${artifactSummary.entityReference}).`
    );
  }

  // Mention urgent signals
  if (artifactSummary.signals.length > 0) {
    const criticals = artifactSummary.signals.filter((s) => s.startsWith("CRITICAL:"));
    if (criticals.length > 0) {
      parts.push(`Note: There are ${criticals.length} critical issue(s) to review.`);
    }
  }

  // Mention counts
  if (artifactSummary.overdueCount > 0) {
    parts.push(`${artifactSummary.overdueCount} item(s) are overdue.`);
  }

  // Suggest exploration
  if (artifactSummary.followUpLabels.length > 0) {
    parts.push(
      `You can explore: ${artifactSummary.followUpLabels.slice(0, 2).join(" or ")}.`
    );
  }

  // Handle ambiguity
  if (artifactSummary.isAmbiguous) {
    parts.push(`Multiple matches were found. Which one would you like to focus on?`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

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

  // Try LLM-based commentary
  const result = await generateCommentary(artifactType, artifact, context);

  if (result.success && result.commentary) {
    return { commentary: result.commentary, source: "llm" };
  }

  // If LLM failed or skipped, try fallback
  if (!result.skipped) {
    const artifactSummary = extractArtifactSummary(artifactType, artifact, context);
    const fallback = buildFallbackCommentary(artifactSummary);

    if (fallback) {
      return { commentary: fallback, source: "fallback" };
    }
  }

  // No commentary generated
  return { commentary: null, source: result.skipped ? "skipped" : "failed" };
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  generateAgentCommentary,
  generateCommentary,
  extractArtifactSummary,
  buildPromptContext,
  shouldGenerateCommentary,
  buildFallbackCommentary,
  COMMENTARY_SYSTEM_PROMPT,
};
