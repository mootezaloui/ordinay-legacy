"use strict";

/**
 * Turn Responder — Synthesis Layer
 *
 * Sits at the end of every turn pipeline.
 * Receives the resolved artifact + composite intent context.
 * Synthesizes the finalMessage the user reads.
 *
 * Replaces commentary.generator.js which was never wired into the pipeline.
 *
 * Response modes:
 *   REPORT  — neutral, factual display of retrieved data
 *   ADVISE  — advisory synthesis: priorities, next steps, recommendations
 *   CLARIFY — disambiguation: what is missing, focused question
 *   DRAFT   — document produced: explain what was generated
 *   RECOVER — error: plain explanation + concrete next step
 */

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
const LLM_RESPONDER_TIMEOUT = parseInt(process.env.LLM_RESPONDER_TIMEOUT || "20000", 10);

const RESPONSE_MODES = Object.freeze({
  REPORT: "REPORT",
  ADVISE: "ADVISE",
  CLARIFY: "CLARIFY",
  DRAFT: "DRAFT",
  RECOVER: "RECOVER",
});

function selectMode({ artifact, secondaries, intentMeta }) {
  const secondary = String(intentMeta?.secondary || "").toUpperCase();
  if (secondary === "ADVICE" || (Array.isArray(secondaries) && secondaries.includes("ADVICE"))) {
    return RESPONSE_MODES.ADVISE;
  }
  const artifactType = String(artifact?.type || "").toLowerCase();
  if (artifactType === "error") return RESPONSE_MODES.RECOVER;
  if (artifactType === "draft" || artifactType === "research_contract") return RESPONSE_MODES.DRAFT;
  if (
    artifactType === "context_suggestion" ||
    artifactType === "identity_collision" ||
    artifact?.ambiguous === true
  ) {
    return RESPONSE_MODES.CLARIFY;
  }
  return RESPONSE_MODES.REPORT;
}

function summarizeArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return "(no artifact)";
  const parts = [];
  if (artifact.type) parts.push(`type: ${artifact.type}`);
  if (artifact.listCategory) parts.push(`listCategory: ${artifact.listCategory}`);
  if (artifact.entityType) parts.push(`entityType: ${artifact.entityType}`);
  if (artifact.title) parts.push(`title: ${String(artifact.title).slice(0, 100)}`);
  const candidateArrays = ["items", "rows", "clients", "dossiers", "lawsuits", "tasks", "sessions", "documents"];
  for (const key of candidateArrays) {
    if (Array.isArray(artifact[key])) {
      parts.push(`${key}: ${artifact[key].length}`);
      break;
    }
  }
  if (typeof artifact.message === "string" && artifact.message.trim()) {
    parts.push(`summary: ${artifact.message.slice(0, 300)}`);
  }
  if (typeof artifact.content === "string" && artifact.content.trim()) {
    parts.push(`contentSnippet: ${artifact.content.slice(0, 300)}`);
  }
  if (!parts.length) {
    parts.push("summary: retrieved information is available");
  }
  return parts.join("\n");
}

function buildModeSystemPrompt({
  mode,
  userMessage,
  artifactSummary,
  scopeBlock,
  intentMeta,
  entityDetailsBlock,
  relatedEntitiesBlock,
  conversationTone,
}) {
  const extras = [];
  if (intentMeta?.emotionalLoad) {
    extras.push("The user's message carries emotional weight. Acknowledge it plainly before answering.");
  }
  if (String(intentMeta?.urgency || "").toLowerCase() === "high") {
    extras.push("Urgency detected. Lead with the most time-sensitive information.");
  }
  if (String(intentMeta?.secondary || "").toUpperCase() === "REASSURANCE") {
    extras.push("The user seems uncertain. Be direct and reassuring.");
  }
  if (String(intentMeta?.secondary || "").toUpperCase() === "EXPLANATION") {
    extras.push("Explain what the information means, not just what it says.");
  }
  if (String(intentMeta?.secondary || "").toUpperCase() === "DECISION_SUPPORT") {
    extras.push("The user is weighing options. State your read clearly.");
  }
  extras.push(
    "Use whatever length and format best serves this response. A simple confirmation can be one sentence. A case overview can use headers, tables, and bullets. You decide.",
  );
  extras.push(
    "If the user's intent is reasonably clear from context, act on the most likely interpretation and surface the result. Only ask a clarifying question if two genuinely different actions are equally likely and the wrong choice would cause a meaningful problem.",
  );

  const base = {
    [RESPONSE_MODES.REPORT]: `You are a senior legal practice assistant for a law firm.
You speak like a knowledgeable colleague - direct, clear, and expressive.
You may use prose, bullets, headings, or tables when they make the answer clearer.
You always synthesize retrieved information into a useful answer.

User message: ${String(userMessage || "").slice(0, 300)}
Retrieved artifact: ${artifactSummary}
Active scope: ${scopeBlock || "(no active scope)"}
Primary entity details: ${entityDetailsBlock || "(none)"}
Related entities in conversation: ${relatedEntitiesBlock || "(none)"}
Conversation tone so far: ${conversationTone || "routine lookup"}

Directly address what the user asked or said.
- If it confirms something the user expected, say so plainly.
- If the data reveals something worth flagging, surface it.
- If structured formatting would make the answer clearer, use it.
- Never return [silent]. Always produce a response.`,
    [RESPONSE_MODES.ADVISE]: `You are Ordinay Assistant. The user asked for advice, recommendations, or next steps.
Help the user prioritize and sequence their work.
Recommend what to address first and explain why the order matters.
Use the format that best serves the answer.`,
    [RESPONSE_MODES.CLARIFY]: `You are Ordinay Assistant. More information is needed to continue.
If the user's intent is reasonably clear from context, act on the most likely interpretation and surface the result.
Only ask a clarifying question if two genuinely different actions are equally likely and the wrong choice would cause a meaningful problem.`,
    [RESPONSE_MODES.DRAFT]: `You are Ordinay Assistant. A document or structured draft was prepared.
Explain what was produced and what the user should review or confirm.
Do not reproduce the draft content in your response.`,
    [RESPONSE_MODES.RECOVER]: `You are Ordinay Assistant. Something went wrong.
Explain what happened in plain terms and offer a concrete next step.
Never expose internal error codes to the user.`,
  }[mode];
  return extras.length > 0 ? `${base}\n${extras.join("\n")}` : base;
}

async function callLLM(systemPrompt, userContent) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_RESPONDER_TIMEOUT);
  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        system: systemPrompt,
        prompt: userContent,
        stream: false,
        options: { temperature: 0.2, num_predict: 1500 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    const text = String(data.response || "").trim();
    return text === "[silent]" ? null : text || null;
  } catch (_) {
    clearTimeout(timeoutId);
    return null;
  }
}

function buildFallback(mode) {
  switch (mode) {
    case RESPONSE_MODES.ADVISE:
      return "Here is the current situation and the most sensible next step.";
    case RESPONSE_MODES.CLARIFY:
      return "I need one more detail before acting safely on this.";
    case RESPONSE_MODES.DRAFT:
      return "The draft is prepared and ready for review.";
    case RESPONSE_MODES.RECOVER:
      return "I could not complete that request. The next step is to correct the missing or conflicting detail.";
    default:
      return "The relevant information is available.";
  }
}

/**
 * Synthesizes the final user-facing message for a completed agent turn.
 *
 * @param {object} params
 * @param {string} params.userMessage - The original user message
 * @param {object} params.artifact    - The resolved output artifact
 * @param {object} params.context     - Turn context
 * @param {string[]} params.context.secondaries   - Detected secondary intents (e.g. ["ADVICE"])
 * @param {string}   params.context.existingMessage - Pre-synthesized message from LLM loop (passthrough)
 * @returns {Promise<{finalMessage: string, responseMode: string}>}
 */
async function buildTurnResponse({ userMessage, artifact, context = {} }) {
  const secondaries = Array.isArray(context.secondaries) ? context.secondaries : [];
  const intentMeta = context.intentMeta && typeof context.intentMeta === "object" ? context.intentMeta : {};
  const mode = selectMode({ artifact, secondaries, intentMeta });

  if (
    typeof context.existingMessage === "string" &&
    context.existingMessage.trim() &&
    context.skipRefinement === true
  ) {
    return { finalMessage: context.existingMessage, responseMode: mode };
  }

  const artifactSummary = summarizeArtifact(artifact);
  const scopeBlock = String(context.scopeBlock || "").trim() || "(no active scope)";
  const entityDetailsBlock = String(context.entityDetailsBlock || "").trim() || "(none)";
  const relatedEntitiesBlock = String(context.relatedEntitiesBlock || "").trim() || "(none)";
  const conversationTone = String(context.conversationTone || "").trim() || "routine lookup";
  const systemPrompt = buildModeSystemPrompt({
    mode,
    userMessage,
    artifactSummary,
    scopeBlock,
    intentMeta,
    entityDetailsBlock,
    relatedEntitiesBlock,
    conversationTone,
  });
  const userContent = [
    `User message: ${String(userMessage || "").slice(0, 300)}`,
    "",
    "Artifact:",
    artifactSummary,
    "",
    "Active scope:",
    scopeBlock,
    "",
    "Primary entity details:",
    entityDetailsBlock,
    "",
    "Related entities in conversation:",
    relatedEntitiesBlock,
    "",
    "Conversation tone:",
    conversationTone,
  ].join("\n");

  const llmText = await callLLM(systemPrompt, userContent);

  let finalMessage;
  if (llmText) {
    finalMessage = llmText;
  } else {
    finalMessage = buildFallback(mode);
  }

  return { finalMessage, responseMode: mode };
}

module.exports = { buildTurnResponse, RESPONSE_MODES };
