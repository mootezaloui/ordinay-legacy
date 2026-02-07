"use strict";

const { classifyIntentWithLLM } = require("./llm.client");

/**
 * Interaction Posture Resolver
 *
 * PRIMARY CONTROL PLANE: Resolves what kind of interaction the user wants
 * BEFORE any execution gates fire.
 *
 * Three postures:
 * - ASSISTANT: General help, emails, brainstorming (no Ordinay data)
 * - WORK: Specific client/dossier/task focus (entity reasoning)
 * - INSPECTION: Listing entities, factual status (multi-entity display)
 *
 * Resolution strategy: Rule-based (fast path) → LLM fallback (slow path)
 */

/**
 * Interaction postures
 */
const POSTURES = Object.freeze({
  ASSISTANT: "ASSISTANT",
  WORK: "WORK",
  INSPECTION: "INSPECTION",
});

/**
 * Entity keywords that suggest Ordinay data usage
 */
const ENTITY_KEYWORDS = [
  "client",
  "clients",
  "dossier",
  "dossiers",
  "lawsuit",
  "lawsuits",
  "task",
  "tasks",
  "session",
  "sessions",
  "mission",
  "missions",
  "hearing",
  "hearings",
  "overdue",
  "pending",
  "upcoming",
];

/**
 * Generic domain usage patterns (examples, templates)
 * These indicate ASSISTANT mode even if entity keywords present
 */
const GENERIC_DOMAIN_PATTERNS = [
  /\bexample\s+(client|dossier|task|email|letter)/i,
  /\bsample\s+(client|dossier|task|email|letter)/i,
  /\btemplate\s+(for|of)\s+/i,
  /\bhow\s+to\s+(write|draft|create)/i,
  /\bhelp\s+me\s+(write|draft|create)/i,
  /\bexplain\s+(the\s+)?(concept|idea|difference)/i,
  /\bwhat\s+is\s+a\s+/i,
  /\bbrainstorm/i,
  /\badvice\s+(on|about)/i,
  /\bsuggestions?\s+(for|on)/i,
];

/**
 * List/plural patterns that suggest INSPECTION mode
 */
const LIST_PATTERNS = [
  /\b(list|show|display|get|find)\s+(all|my)?\s*(clients?|dossiers?|tasks?|sessions?)/i,
  /\b(clients?|dossiers?|tasks?|sessions?)\s+(list|overview)/i,
  /\bhow\s+many\s+(clients?|dossiers?|tasks?|sessions?)/i,
  /\boverdue\s+(tasks?|sessions?)/i,
  /\bupcoming\s+(tasks?|sessions?)/i,
  /\bpending\s+(tasks?|dossiers?)/i,
];

/**
 * Specific entity reference patterns (names, IDs) that suggest WORK mode
 */
const SPECIFIC_REFERENCE_PATTERNS = [
  /\b(for|about|regarding)\s+[A-Z][a-z]+\s*[A-Z]?[a-z]*/i, // "for Emma Smith"
  /\bDOS-\d{4}-\d{3}/i, // Dossier reference
  /\bTSK-\d+/i, // Task reference
  /\bclient\s+#?\d+/i, // Client ID
  /\bdossier\s+#?\d+/i, // Dossier ID
];

/**
 * Work planning keywords
 */
const WORK_PLANNING_KEYWORDS = [
  /\bplan\s+(my|the)\s+(day|week|work)/i,
  /\bwhat\s+should\s+i\s+(do|work\s+on)\s+(today|now|next)/i,
  /\bmy\s+(priorities|workload|schedule)/i,
  /\bfocus\s+on\s+[A-Z]/i, // "focus on Emma"
];

/**
 * Follow-up indicators (inherit posture from context)
 */
const FOLLOW_UP_INDICATORS = [
  /\b(what\s+about|how\s+about|and)\s+(the|those|them)/i,
  /\bshow\s+(me\s+)?(more|again|them|those)/i,
  /\b(yes|yeah|ok|sure|no|nope|cancel)\b/i,
  /\bwhat\s+else/i,
  /\btell\s+me\s+(more|about)/i,
];

/**
 * Check if message uses generic domain language (examples, templates)
 */
function isGenericDomainUsage(normalized) {
  return GENERIC_DOMAIN_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Check if message contains entity keywords
 */
function hasEntityKeywords(normalized) {
  return ENTITY_KEYWORDS.some((keyword) =>
    new RegExp(`\\b${keyword}\\b`, "i").test(normalized),
  );
}

/**
 * Check if message has list/plural patterns
 */
function hasListPattern(normalized) {
  return LIST_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Check if message references specific entity (name, ID)
 */
function hasSpecificEntityReference(message, context) {
  // Check for explicit references in message
  if (SPECIFIC_REFERENCE_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }

  // Check if context has active entity focus
  if (context?.activeEntityId || context?.dossierId || context?.clientId) {
    return true;
  }

  return false;
}

/**
 * Check if message has work planning keywords
 */
function hasWorkPlanningKeywords(normalized) {
  return WORK_PLANNING_KEYWORDS.some((pattern) => pattern.test(normalized));
}

/**
 * Check if message is likely a follow-up (inherit prior posture)
 */
function isFollowUpMessage(message, context) {
  const normalized = message.toLowerCase().trim();

  // Very short messages are likely follow-ups
  if (normalized.split(/\s+/).length <= 3) {
    return true;
  }

  // Explicit follow-up indicators
  return FOLLOW_UP_INDICATORS.some((pattern) => pattern.test(normalized));
}

/**
 * Classify posture using LLM (fallback for ambiguous cases)
 */
async function classifyPostureWithLLM(message) {
  try {
    const prompt = `Classify this user request into one of three interaction postures:

1. ASSISTANT: General help, examples, advice, brainstorming (no specific system data needed)
2. WORK: Specific client/dossier/task work, planning, entity focus (requires system data + context)
3. INSPECTION: Listing entities, viewing records, factual queries (requires system data + display)

User message: "${message}"

Reply with ONLY the posture name in ALL CAPS: ASSISTANT, WORK, or INSPECTION.`;

    const response = await classifyIntentWithLLM(prompt);
    const mode = response?.trim().toUpperCase();

    if (Object.values(POSTURES).includes(mode)) {
      console.log(
        `[Posture] LLM classified as ${mode} (confidence: 0.7)`,
      );
      return {
        mode,
        confidence: 0.7,
        signals: ["llm_classification"],
      };
    }

    // LLM failed, default to ASSISTANT (safest)
    console.warn(
      `[Posture] LLM returned invalid posture "${mode}", defaulting to ASSISTANT`,
    );
    return {
      mode: POSTURES.ASSISTANT,
      confidence: 0.5,
      signals: ["llm_fallback_default"],
    };
  } catch (error) {
    console.error("[Posture] LLM classification failed:", error.message);
    // On error, default to ASSISTANT (safest fallback)
    return {
      mode: POSTURES.ASSISTANT,
      confidence: 0.5,
      signals: ["llm_error_fallback"],
    };
  }
}

/**
 * Resolve interaction posture (PRIMARY CONTROL PLANE)
 *
 * @param {string} message - User message
 * @param {Object} context - Request context (userId, scope, etc.)
 * @returns {Promise<{mode: string, confidence: number, signals: string[]}>}
 */
async function resolveInteractionPosture(message, context = {}) {
  const normalized = message.toLowerCase().trim();

  // RULE 1: Generic domain language → ASSISTANT
  if (isGenericDomainUsage(normalized)) {
    console.log(
      "[Posture] Generic domain usage detected → ASSISTANT (confidence: 0.95)",
    );
    return {
      mode: POSTURES.ASSISTANT,
      confidence: 0.95,
      signals: ["generic_domain"],
    };
  }

  // RULE 2: Follow-up inherits posture from context
  if (isFollowUpMessage(message, context)) {
    const inheritedPosture = context?.lastPosture || POSTURES.ASSISTANT;
    console.log(
      `[Posture] Follow-up detected → Inherited ${inheritedPosture} (confidence: 0.85)`,
    );
    return {
      mode: inheritedPosture,
      confidence: 0.85,
      signals: ["follow_up_inherit"],
    };
  }

  // RULE 3: No entity keywords → ASSISTANT
  if (!hasEntityKeywords(normalized)) {
    console.log(
      "[Posture] No entity keywords → ASSISTANT (confidence: 0.9)",
    );
    return {
      mode: POSTURES.ASSISTANT,
      confidence: 0.9,
      signals: ["no_entity_keywords"],
    };
  }

  // RULE 4: Entity keywords present → disambiguate WORK vs INSPECTION
  // Check for specific entity reference (name, ID) → WORK
  if (hasSpecificEntityReference(message, context)) {
    console.log(
      "[Posture] Specific entity reference → WORK (confidence: 0.95)",
    );
    return {
      mode: POSTURES.WORK,
      confidence: 0.95,
      signals: ["entity_reference"],
    };
  }

  // Check for list/plural patterns → INSPECTION
  if (hasListPattern(normalized)) {
    console.log(
      "[Posture] List pattern detected → INSPECTION (confidence: 0.95)",
    );
    return {
      mode: POSTURES.INSPECTION,
      confidence: 0.95,
      signals: ["list_pattern"],
    };
  }

  // RULE 5: Work planning keywords → WORK
  if (hasWorkPlanningKeywords(normalized)) {
    console.log(
      "[Posture] Work planning keywords → WORK (confidence: 0.85)",
    );
    return {
      mode: POSTURES.WORK,
      confidence: 0.85,
      signals: ["work_planning"],
    };
  }

  // FALLBACK: LLM classification for ambiguous cases
  console.log("[Posture] Ambiguous case, using LLM fallback...");
  return await classifyPostureWithLLM(message);
}

module.exports = {
  resolveInteractionPosture,
  POSTURES,
};
