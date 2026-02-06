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
 *
 * COMMENTARY MODES (MANDATORY):
 *   - REPORTING: Neutral, factual. For summaries, lists, displays.
 *   - INTERPRETIVE: Analytical, cautious. For risk analysis, assessments.
 *   - GUIDANCE: Calm, suggestive. For "what next" questions.
 */

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "qwen2.5:7b-instruct";
const LLM_TIMEOUT = parseInt(process.env.LLM_COMMENTARY_TIMEOUT || "30000", 10);
const ALWAYS_GENERATE_COMMENTARY = process.env.LLM_COMMENTARY_ALWAYS !== "false";

// ─── Commentary Modes (MANDATORY) ──────────────────────────────────────────

/**
 * Commentary modes determine tone and content constraints.
 * Mode MUST be derived from PRIMARY USER INTENT, not artifact signals.
 */
const COMMENTARY_MODES = Object.freeze({
  REPORTING: "REPORTING",       // For: summarize, list, show, display, read
  INTERPRETIVE: "INTERPRETIVE", // For: analyze, assess, explain risks, evaluate
  GUIDANCE: "GUIDANCE",         // For: what next, help me with, suggest, recommend
});

/**
 * Prohibited language by mode.
 * These phrases MUST be filtered out of generated commentary.
 */
const MODE_PROHIBITED_PHRASES = Object.freeze({
  [COMMENTARY_MODES.REPORTING]: [
    // Evaluative language
    "great to see",
    "good news",
    "good to see",
    "glad to see",
    "happy to see",
    "pleased to",
    "excellent",
    "wonderful",
    "fantastic",
    "perfect",
    // Safety/reassurance language
    "no issues",
    "no problems",
    "no concerns",
    "nothing to worry",
    "everything looks fine",
    "everything is fine",
    "all is well",
    "safe",
    "secure",
    "in good shape",
    "in great shape",
    "healthy",
    // Judgment language
    "fortunately",
    "unfortunately",
    "luckily",
    "thankfully",
    "it's good that",
    "it's great that",
    "it's nice that",
  ],
  [COMMENTARY_MODES.INTERPRETIVE]: [
    // Emotional language (analysis should be clinical)
    "great to see",
    "good news",
    "happy to",
    "glad to",
    "wonderful",
    "fantastic",
    "perfect",
    "nothing to worry",
    "everything is fine",
  ],
  [COMMENTARY_MODES.GUIDANCE]: [
    // Authority language (guidance should be suggestive, not commanding)
    "you must",
    "you need to",
    "you have to",
    "you should definitely",
    "it's essential that you",
    "it's critical that you",
    "i will",
    "i'll handle",
    "i'll take care",
  ],
});

/**
 * Mode-specific system prompts.
 * Each mode has distinct tone and content instructions.
 */
const MODE_PROMPTS = Object.freeze({
  [COMMENTARY_MODES.REPORTING]: `You are Organia Assistant providing a FACTUAL REPORT.

The user requested information to be DISPLAYED or SUMMARIZED.
Your response must be in REPORTING MODE.

TONE: Neutral, factual, descriptive. Like a news anchor.

REQUIRED:
- State what was found (counts, types, status)
- Mention if results are filtered or complete
- Suggest relevant follow-up queries if applicable

PROHIBITED (CRITICAL - DO NOT USE):
- Evaluative language: "great", "good", "excellent", "wonderful"
- Reassuring language: "no issues", "safe", "nothing to worry about"
- Emotional reactions: "glad to see", "happy to report", "pleased"
- Safety judgments: "everything looks fine", "all is well"
- Opinions about the data quality or state

Remember: Absence of flagged issues ≠ absence of risk.
You are REPORTING data, not EVALUATING it.`,

  [COMMENTARY_MODES.INTERPRETIVE]: `You are Organia Assistant providing ANALYTICAL INTERPRETATION.

The user requested ANALYSIS, ASSESSMENT, or EXPLANATION of risks/issues.
Your response must be in INTERPRETIVE MODE.

TONE: Analytical, professional, cautious. Like a consultant.

REQUIRED:
- Explain what the data suggests
- Note patterns or potential concerns if present
- Be specific about what was analyzed

PROHIBITED:
- Emotional language: "great", "wonderful", "happy"
- False reassurance: "nothing to worry about", "all is fine"
- Speculation beyond the data

You MAY express professional observations about implications.
You MUST remain analytical, not celebratory.`,

  [COMMENTARY_MODES.GUIDANCE]: `You are Organia Assistant providing GUIDANCE.

The user asked for SUGGESTIONS or NEXT STEPS.
Your response must be in GUIDANCE MODE.

TONE: Calm, suggestive, helpful. Like an advisor.

REQUIRED:
- Suggest concrete next actions
- Frame suggestions as options, not commands
- Focus on read-only explorations when possible

PROHIBITED:
- Commanding language: "you must", "you need to", "you have to"
- Implying you will execute actions: "I will", "I'll handle"
- Making promises about outcomes

Use language like: "You might consider...", "One option is...", "It could help to..."`,
});

/**
 * Maps intent to commentary mode.
 * This is DETERMINISTIC and REQUIRED.
 *
 * @param {string} intent - The detected user intent
 * @returns {string} - One of COMMENTARY_MODES
 */
function deriveCommentaryMode(intent) {
  if (!intent) return COMMENTARY_MODES.REPORTING;

  const normalized = String(intent).toUpperCase();

  // REPORTING: summarize, list, show, display, read
  if (
    normalized.includes("LIST") ||
    normalized.includes("SUMMARIZE") ||
    normalized.includes("READ") ||
    normalized.includes("SHOW") ||
    normalized.includes("DISPLAY") ||
    normalized === "GENERAL_CHAT"
  ) {
    return COMMENTARY_MODES.REPORTING;
  }

  // INTERPRETIVE: analyze, assess, explain state, risks
  if (
    normalized.includes("ANALYZE") ||
    normalized.includes("RISK") ||
    normalized.includes("ASSESS") ||
    normalized.includes("EXPLAIN") ||
    normalized.includes("EVALUATE")
  ) {
    return COMMENTARY_MODES.INTERPRETIVE;
  }

  // GUIDANCE: propose, suggest, next steps, what should I do
  if (
    normalized.includes("PROPOSE") ||
    normalized.includes("SUGGEST") ||
    normalized.includes("RECOMMEND") ||
    normalized.includes("NEXT") ||
    normalized.includes("HELP") ||
    normalized.includes("DRAFT")
  ) {
    return COMMENTARY_MODES.GUIDANCE;
  }

  // Default to REPORTING (safest mode - no evaluation)
  return COMMENTARY_MODES.REPORTING;
}

/**
 * Checks if commentary violates mode constraints.
 * Returns true if the commentary contains prohibited phrases.
 *
 * @param {string} commentary - The generated commentary
 * @param {string} mode - The commentary mode
 * @returns {boolean} - True if commentary violates constraints
 */
function violatesModeConstraints(commentary, mode) {
  if (!commentary || !mode) return false;

  const prohibited = MODE_PROHIBITED_PHRASES[mode] || [];
  const lower = commentary.toLowerCase();

  for (const phrase of prohibited) {
    if (lower.includes(phrase.toLowerCase())) {
      console.warn(`[Commentary] Mode violation detected: "${phrase}" in ${mode} mode`);
      return true;
    }
  }

  return false;
}

// ─── Legacy System Prompt (kept for reference, not used) ───────────────────

const COMMENTARY_SYSTEM_PROMPT_LEGACY = `You are Organia Assistant, a helpful AI for a legal practice management system.
You have just retrieved structured information for the user. Your task is to provide a brief, conversational message.
RULES: Be concise. Do NOT repeat facts verbatim. Do NOT propose write actions.`;

/**
 * Builds a prompt context from the artifact summary.
 * Extracts ONLY what the LLM needs to generate commentary.
 * DOES NOT include interpretation signals that could trigger evaluative responses.
 *
 * @param {Object} artifactSummary - High-level summary of the artifact
 * @param {Array} semanticSignals - Semantic signals (used sparingly)
 * @param {string} mode - Commentary mode (REPORTING, INTERPRETIVE, GUIDANCE)
 * @returns {string} - Context string for the LLM prompt
 */
function buildPromptContext(artifactSummary, semanticSignals = [], mode = COMMENTARY_MODES.REPORTING) {
  const lines = [];

  // Entity identity
  if (artifactSummary.entityType) {
    lines.push(`Entity type: ${artifactSummary.entityType}`);
  }
  if (artifactSummary.entityReference) {
    lines.push(`Reference: ${artifactSummary.entityReference}`);
  }

  // Counts (factual, always safe to include)
  if (typeof artifactSummary.totalCount === "number") {
    lines.push(`Total items: ${artifactSummary.totalCount}`);
  }
  if (typeof artifactSummary.urgentCount === "number" && artifactSummary.urgentCount > 0) {
    lines.push(`Urgent items: ${artifactSummary.urgentCount}`);
  }
  if (typeof artifactSummary.overdueCount === "number" && artifactSummary.overdueCount > 0) {
    lines.push(`Overdue items: ${artifactSummary.overdueCount}`);
  }

  // Situation signals — work-context implications from interpretation layer
  // Include in INTERPRETIVE and GUIDANCE modes (these modes analyze and suggest)
  if (mode === COMMENTARY_MODES.INTERPRETIVE || mode === COMMENTARY_MODES.GUIDANCE) {
    if (artifactSummary.signals && artifactSummary.signals.length > 0) {
      lines.push(`Situation signals:`);
      for (const signal of artifactSummary.signals) {
        lines.push(`  - ${signal}`);
      }
    }
    if (artifactSummary.implications && artifactSummary.implications.length > 0) {
      lines.push(`Work implications:`);
      for (const impl of artifactSummary.implications) {
        lines.push(`  - ${impl}`);
      }
    }
    if (artifactSummary.interpretationSummary) {
      lines.push(`Interpretation: ${artifactSummary.interpretationSummary}`);
    }
  }
  // In REPORTING mode, include only critical/warning signals (not implications)
  if (mode === COMMENTARY_MODES.REPORTING) {
    if (artifactSummary.signals && artifactSummary.signals.length > 0) {
      const criticalSignals = artifactSummary.signals.filter(
        (s) => s.startsWith("CRITICAL:") || s.startsWith("Warning:")
      );
      if (criticalSignals.length > 0) {
        lines.push(`Noted signals: ${criticalSignals.join("; ")}`);
      }
    }
  }

  // Ambiguity flags (always relevant)
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

  // Only include semantic signals in INTERPRETIVE mode
  if (mode === COMMENTARY_MODES.INTERPRETIVE && Array.isArray(semanticSignals) && semanticSignals.length > 0) {
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
    implications: [],
    dataPointNumbers: [],
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

  // Extract signals, implications, and dataPoints from interpretation statements
  if (artifact.interpretation?.statements) {
    for (const stmt of artifact.interpretation.statements) {
      if (stmt.level === "critical") {
        summary.signals.push(`CRITICAL: ${stmt.statement}`);
      } else if (stmt.level === "warning") {
        summary.signals.push(`Warning: ${stmt.statement}`);
      }
      // Extract implications for work-context commentary
      if (stmt.implication && (stmt.level === "critical" || stmt.level === "warning")) {
        const signalTag = stmt.signal ? `[${stmt.signal}] ` : "";
        summary.implications.push(`${signalTag}${stmt.implication}`);
      }
      // Collect numeric values from dataPoints for grounding validation
      if (stmt.dataPoints && typeof stmt.dataPoints === "object") {
        for (const val of Object.values(stmt.dataPoints)) {
          if (typeof val === "number") {
            summary.dataPointNumbers.push(val);
          }
        }
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

// ─── Numeric Grounding Validation ─────────────────────────────────────────
// Commentary must not introduce numeric claims that contradict or are absent
// from the structured facts. If the LLM hallucinates counts, reject.

const WORD_TO_NUMBER = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, hundred: 100,
});

/**
 * Extracts all numeric values (digit and written-out) from text.
 * @param {string} text
 * @returns {number[]}
 */
function extractNumbers(text) {
  if (!text) return [];
  const nums = new Set();
  const digitMatches = text.match(/\b\d+\b/g) || [];
  digitMatches.forEach((m) => nums.add(Number(m)));
  const lower = text.toLowerCase();
  for (const [word, value] of Object.entries(WORD_TO_NUMBER)) {
    const pattern = new RegExp(`\\b${word}\\b`, "gi");
    if (pattern.test(lower)) nums.add(value);
  }
  return Array.from(nums);
}

/**
 * Checks if commentary contains numeric claims not present in the artifact data.
 * Returns true if all numeric claims are grounded, false if any are ungrounded.
 *
 * @param {string} commentary - The generated commentary text
 * @param {Object} summary - The artifact summary with known counts
 * @returns {boolean} - True if commentary is numerically grounded
 */
function isNumericallyGrounded(commentary, summary) {
  const commentaryNumbers = extractNumbers(commentary);
  if (commentaryNumbers.length === 0) return true;

  // Build the set of valid numbers from structured artifact data
  const validNumbers = new Set();
  if (typeof summary.totalCount === "number") validNumbers.add(summary.totalCount);
  if (typeof summary.urgentCount === "number") validNumbers.add(summary.urgentCount);
  if (typeof summary.overdueCount === "number") validNumbers.add(summary.overdueCount);
  if (typeof summary.resultCount === "number") validNumbers.add(summary.resultCount);

  // Extract numbers from interpretation signals (these contain grounded entity counts)
  if (Array.isArray(summary.signals)) {
    for (const signal of summary.signals) {
      extractNumbers(signal).forEach((n) => validNumbers.add(n));
    }
  }

  // Extract numbers from implications and dataPoints (work-context numbers)
  if (Array.isArray(summary.implications)) {
    for (const impl of summary.implications) {
      extractNumbers(impl).forEach((n) => validNumbers.add(n));
    }
  }
  if (Array.isArray(summary.dataPointNumbers)) {
    for (const n of summary.dataPointNumbers) {
      validNumbers.add(n);
    }
  }

  // Extract numbers from the facts summary
  if (summary.factsSummary) {
    extractNumbers(summary.factsSummary).forEach((n) => validNumbers.add(n));
  }

  // Extract numbers from facts details
  if (Array.isArray(summary.factsDetails)) {
    for (const detail of summary.factsDetails) {
      extractNumbers(detail).forEach((n) => validNumbers.add(n));
    }
  }

  // Check each commentary number against valid numbers
  for (const num of commentaryNumbers) {
    if (!validNumbers.has(num)) {
      console.warn(
        `[Commentary] Grounding violation: number ${num} not found in artifact data`,
      );
      return false;
    }
  }
  return true;
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

/**
 * Sanitizes commentary text and enforces mode constraints.
 * Returns null if commentary violates mode constraints.
 * Silence is preferred over misleading tone.
 *
 * @param {string} text - Raw commentary text
 * @param {Object} summary - Artifact summary
 * @param {Object} artifact - Original artifact
 * @param {Object} options - Sanitization options including mode
 * @returns {string|null} - Sanitized commentary or null if suppressed
 */
function sanitizeCommentary(text, summary, artifact, options = {}) {
  if (!text) return null;
  const allowIdentifiers = Boolean(options.allowIdentifiers);
  const mode = options.mode || COMMENTARY_MODES.REPORTING;

  let cleaned = String(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // Universal banned phrases (always filter)
  const lower = cleaned.toLowerCase();
  const universalBanned = [
    "no data available",
    "error occurred",
    "something went wrong",
  ];
  if (universalBanned.some((phrase) => lower.includes(phrase))) {
    return null;
  }

  // MODE-SPECIFIC FILTERING (CRITICAL)
  // If commentary violates mode constraints, suppress entirely
  const prohibitedPhrases = MODE_PROHIBITED_PHRASES[mode] || [];
  for (const phrase of prohibitedPhrases) {
    if (lower.includes(phrase.toLowerCase())) {
      console.warn(`[Commentary] Suppressed - mode violation: "${phrase}" in ${mode} mode`);
      return null; // Silence is preferred over misleading tone
    }
  }

  // NUMERIC GROUNDING CHECK (CRITICAL)
  // If commentary introduces numbers not present in the artifact data, suppress.
  // Silence is preferred over confident but incorrect summaries.
  if (summary && !isNumericallyGrounded(cleaned, summary)) {
    console.warn("[Commentary] Suppressed - numeric grounding violation");
    return null;
  }

  // Remove specific identifiers to keep commentary clean
  if (!allowIdentifiers) {
    const identifierPattern =
      /\b[A-Z]{2,5}-\d{3,6}-\d{2,6}\b|\bID[:\s]*\d+\b|\b#\d{2,}\b|\bDOS-\d{4}-\d+\b/i;
    if (identifierPattern.test(cleaned)) {
      cleaned = cleaned.replace(identifierPattern, "").replace(/\s+/g, " ").trim();
    }
  }

  cleaned = capSentences(cleaned, 3);
  return cleaned || null;
}

function shouldSkipDocumentCommentary(artifact, context = {}) {
  const entityType = String(
    artifact?.entityType || context?._activeEntityType || "",
  ).toLowerCase();
  if (entityType !== "document") return false;

  const readOutcome = String(context?._readOutcome || "").toLowerCase();
  if (
    ["error", "processing", "incomplete", "ambiguous", "not_found"].includes(
      readOutcome,
    )
  ) {
    return true;
  }

  const summaryText = String(artifact?.facts?.summary || artifact?.summary || "").toLowerCase();
  const detailText = Array.isArray(artifact?.facts?.details)
    ? artifact.facts.details.join(" ").toLowerCase()
    : Array.isArray(artifact?.details)
      ? artifact.details.join(" ").toLowerCase()
      : "";
  const combined = `${summaryText} ${detailText}`;
  return (
    combined.includes("unsupported file type") ||
    combined.includes("still being processed") ||
    combined.includes("ocr cannot read pdf") ||
    combined.includes("ocr is unavailable") ||
    combined.includes("not readable") ||
    combined.includes("unreadable")
  );
}

/**
 * Generates conversational commentary about a structured artifact.
 * Uses Ollama LLM but NEVER blocks the artifact if it fails.
 *
 * CRITICAL: Commentary is now MODE-CONDITIONED based on PRIMARY USER INTENT.
 *
 * @param {string} artifactType - Type of artifact (explanation, risk_analysis, etc.)
 * @param {Object} artifact - The structured artifact output
 * @param {Object} context - Original request context (MUST include intent)
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} - Commentary result { success, commentary, error, mode }
 */
async function generateCommentary(artifactType, artifact, context = {}, options = {}) {
  // Skip commentary for chat-type artifacts (already conversational)
  if (artifactType === "chat") {
    return { success: true, commentary: null, skipped: true, reason: "chat_artifact" };
  }
  if (shouldSkipDocumentCommentary(artifact, context)) {
    return {
      success: true,
      commentary: null,
      skipped: true,
      reason: "document_non_success",
    };
  }

  // DERIVE COMMENTARY MODE FROM PRIMARY USER INTENT (CRITICAL)
  const intent = context?.intent || context?.lastIntent || options?.intent || "";
  const mode = deriveCommentaryMode(intent);
  console.log(`[Commentary] Mode: ${mode} (derived from intent: ${intent})`);

  // Get mode-specific system prompt
  const systemPrompt = MODE_PROMPTS[mode] || MODE_PROMPTS[COMMENTARY_MODES.REPORTING];

  // Extract summary — this is what the LLM sees
  const artifactSummary = extractArtifactSummary(artifactType, artifact, context);
  const semanticSignals = Array.isArray(options.semanticSignals) ? options.semanticSignals : [];
  const forceResponse = Boolean(options.forceResponse);
  const minLength = typeof options.minLength === "number" ? options.minLength : 10;

  // Build prompt context with mode awareness
  const promptContext = buildPromptContext(artifactSummary, semanticSignals, mode);

  // Build the full prompt with mode-specific instructions
  const userPrompt = `Based on the following retrieved data, provide a brief comment in ${mode} mode:

${promptContext}

Remember: You are in ${mode} mode.
- Be concise (1-2 sentences)
- Do NOT mention specific record IDs or references
- Do NOT restate field values the user can already see. Instead, explain what the situation means for their work.
${mode === COMMENTARY_MODES.REPORTING ? "- Do NOT evaluate, reassure, or use emotional language\n- If situation signals are present, mention them factually" : ""}
${mode === COMMENTARY_MODES.INTERPRETIVE ? "- Reference the work implications to explain what the data means for the user's work\n- Connect signals to consequences, do not just echo field names" : ""}
${mode === COMMENTARY_MODES.GUIDANCE ? "- Reference the work implications when suggesting next actions\n- Suggest options, do not command" : ""}
${forceResponse ? "\nYou must respond with 1-2 short sentences." : ""}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`,
        stream: false,
        options: {
          temperature: 0.5, // Lower temperature for more consistent mode adherence
          num_predict: 150,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("[Commentary] LLM request failed:", response.status);
      return { success: false, commentary: null, error: `LLM_HTTP_${response.status}`, mode };
    }

    const data = await response.json();
    const commentary = (data.response || "").trim();

    // Validate commentary isn't empty or too short
    if (!commentary || commentary.length < minLength) {
      return { success: true, commentary: null, skipped: true, reason: "empty_response", mode };
    }

    // Basic safety check — reject if commentary contains action verbs
    const actionVerbs = /\b(create|update|delete|send|assign|execute|modify|change|add|remove|schedule|book|submit|file)\b/i;
    if (actionVerbs.test(commentary)) {
      console.warn("[Commentary] Rejected — contains action verbs:", commentary.slice(0, 100));
      return { success: false, commentary: null, error: "ACTION_VERB_DETECTED", mode };
    }

    // MODE CONSTRAINT CHECK (CRITICAL)
    // If commentary violates mode, suppress it entirely
    if (violatesModeConstraints(commentary, mode)) {
      console.warn(`[Commentary] Rejected — violates ${mode} mode constraints`);
      return { success: true, commentary: null, skipped: true, reason: "mode_violation", mode };
    }

    return { success: true, commentary, mode };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      console.warn("[Commentary] LLM timeout");
      return { success: false, commentary: null, error: "TIMEOUT", mode };
    }

    console.warn("[Commentary] LLM error:", err.message);
    return { success: false, commentary: null, error: err.message, mode };
  }
}

/**
 * Stream commentary generation with callbacks for real-time output.
 * Provides immediate responsiveness as the LLM generates text.
 *
 * CRITICAL: Commentary is now MODE-CONDITIONED based on PRIMARY USER INTENT.
 *
 * @param {string} artifactType - Type of artifact
 * @param {Object} artifact - The structured artifact output
 * @param {Object} context - Original request context (MUST include intent)
 * @param {Object} callbacks - { onChunk, onDone, onError }
 * @param {AbortSignal} signal - Optional abort signal
 */
async function streamCommentary(artifactType, artifact, context, callbacks, signal) {
  // Skip commentary for chat-type artifacts
  if (artifactType === "chat") {
    callbacks.onDone?.({ commentary: null, source: "skipped", reason: "chat_artifact" });
    return;
  }
  if (shouldSkipDocumentCommentary(artifact, context)) {
    callbacks.onDone?.({
      commentary: null,
      source: "skipped",
      reason: "document_non_success",
    });
    return;
  }

  // DERIVE COMMENTARY MODE FROM PRIMARY USER INTENT (CRITICAL)
  const intent = context?.intent || context?.lastIntent || "";
  const mode = deriveCommentaryMode(intent);
  console.log(`[Commentary Stream] Mode: ${mode} (derived from intent: ${intent})`);

  // Get mode-specific system prompt
  const systemPrompt = MODE_PROMPTS[mode] || MODE_PROMPTS[COMMENTARY_MODES.REPORTING];

  const artifactSummary = extractArtifactSummary(artifactType, artifact, context);
  const semanticSignals = deriveSemanticSignals(artifactSummary);

  // Build prompt context with mode awareness
  const promptContext = buildPromptContext(artifactSummary, semanticSignals, mode);

  // Build the full prompt with mode-specific instructions
  const userPrompt = `Based on the following retrieved data, provide a brief comment in ${mode} mode:

${promptContext}

Remember: You are in ${mode} mode.
- Be concise (1-2 sentences)
- Do NOT mention specific record IDs or references
- Do NOT restate field values the user can already see. Instead, explain what the situation means for their work.
${mode === COMMENTARY_MODES.REPORTING ? "- Do NOT evaluate, reassure, or use emotional language\n- If situation signals are present, mention them factually" : ""}
${mode === COMMENTARY_MODES.INTERPRETIVE ? "- Reference the work implications to explain what the data means for the user's work\n- Connect signals to consequences, do not just echo field names" : ""}
${mode === COMMENTARY_MODES.GUIDANCE ? "- Reference the work implications when suggesting next actions\n- Suggest options, do not command" : ""}
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
        prompt: `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`,
        stream: true,
        options: {
          temperature: 0.5, // Lower temperature for more consistent mode adherence
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
            // Sanitize final content WITH MODE CONSTRAINT CHECKING
            const sanitized = sanitizeCommentary(fullContent, artifactSummary, artifact, {
              allowIdentifiers: false,
              mode, // Pass mode for constraint checking
            });
            callbacks.onDone?.({
              commentary: sanitized,
              source: sanitized ? "llm" : "skipped",
              signals: semanticSignals,
              mode,
              reason: sanitized ? undefined : "mode_violation",
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
      mode, // Pass mode for constraint checking
    });
    callbacks.onDone?.({
      commentary: sanitized,
      source: sanitized ? "llm" : "skipped",
      signals: semanticSignals,
      mode,
      reason: sanitized ? undefined : "mode_violation",
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      callbacks.onDone?.({ commentary: null, source: "skipped", reason: "timeout", mode });
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
 * CRITICAL: Commentary is now MODE-CONDITIONED based on PRIMARY USER INTENT.
 *
 * @param {string} artifactType - Type of artifact
 * @param {Object} artifact - The structured artifact
 * @param {Object} context - Request context (MUST include intent)
 * @returns {Promise<Object>} - { commentary: string|null, source: 'llm'|'fallback'|'skipped', mode }
 */
async function generateAgentCommentary(artifactType, artifact, context = {}) {
  // Check if we should generate commentary at all
  if (!shouldGenerateCommentary(artifactType, artifact)) {
    return { commentary: null, source: "skipped" };
  }

  // DERIVE COMMENTARY MODE FROM PRIMARY USER INTENT (CRITICAL)
  const intent = context?.intent || context?.lastIntent || "";
  const mode = deriveCommentaryMode(intent);

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
    return { commentary: null, source: "skipped", reason: policy.reason, signals: semanticSignals, mode };
  }

  // Try LLM-based commentary (with mode)
  let result = await generateCommentary(artifactType, artifact, context, {
    semanticSignals,
    forceResponse,
    minLength: forceResponse ? 4 : 10,
    intent, // Pass intent for mode derivation
  });

  if (needsClarification && result.success && !result.commentary && result.skipped) {
    result = await generateCommentary(artifactType, artifact, context, {
      semanticSignals,
      forceResponse: true,
      minLength: 4,
      intent,
    });
  }

  if (result.success && result.commentary) {
    // Sanitize with mode constraint checking
    let sanitized = sanitizeCommentary(result.commentary, artifactSummary, artifact, {
      allowRedundant: forceResponse,
      allowIdentifiers: false,
      mode, // Pass mode for constraint checking
    });
    if (!sanitized) {
      const retry = await generateCommentary(artifactType, artifact, context, {
        semanticSignals,
        forceResponse: true,
        minLength: 4,
        intent,
      });
      if (retry.success && retry.commentary) {
        sanitized = sanitizeCommentary(retry.commentary, artifactSummary, artifact, {
          allowRedundant: needsClarification,
          allowIdentifiers: false,
          mode,
        });
      }
    }
    if (sanitized) {
      return { commentary: sanitized, source: "llm", signals: semanticSignals, mode };
    }
    return { commentary: null, source: "skipped", reason: "mode_violation", signals: semanticSignals, mode };
  }

  // No commentary generated
  return { commentary: null, source: result.skipped ? "skipped" : "failed", signals: semanticSignals, mode };
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  // Core functions
  generateAgentCommentary,
  generateCommentary,
  streamCommentary,
  extractArtifactSummary,
  buildPromptContext,
  shouldGenerateCommentary,
  // Mode system (CRITICAL for correct commentary generation)
  COMMENTARY_MODES,
  deriveCommentaryMode,
  violatesModeConstraints,
  MODE_PROHIBITED_PHRASES,
  MODE_PROMPTS,
  // Grounding validation
  isNumericallyGrounded,
  extractNumbers,
};
