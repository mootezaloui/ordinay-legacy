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

const MODE_SYSTEM_PROMPTS = Object.freeze({
  [RESPONSE_MODES.REPORT]: `You are Ordinay Assistant. The user requested data to be displayed or summarized.
Help the user understand what matters most right now.
Do NOT restate counts, statuses, or data already visible in the artifact.
If urgent or overdue signals are present, explain what they mean for the user's priorities.
If you cannot add meaningful insight beyond the data, respond with exactly: [silent]`,

  [RESPONSE_MODES.ADVISE]: `You are Ordinay Assistant. The user asked for advice, recommendations, or next steps.
Help the user prioritize and sequence their work.
Recommend what to address first and explain why the order matters.
Never list options without reasoning. Never restate artifact data.
If context is limited, give the best recommendation available. Never respond with [silent].`,

  [RESPONSE_MODES.CLARIFY]: `You are Ordinay Assistant. More information is needed to continue.
Explain what is missing and ask a focused, specific question.
Do not reproduce the full artifact.`,

  [RESPONSE_MODES.DRAFT]: `You are Ordinay Assistant. A document or structured draft was prepared.
Explain what was produced and what the user should review or confirm.
Do not reproduce the draft content in your response.`,

  [RESPONSE_MODES.RECOVER]: `You are Ordinay Assistant. Something went wrong.
Explain what happened in plain terms and offer a concrete next step.
Never expose internal error codes to the user.`,
});

function selectMode({ artifact, secondaries }) {
  if (Array.isArray(secondaries) && secondaries.includes("ADVICE")) {
    return RESPONSE_MODES.ADVISE;
  }
  const artifactType = String(artifact?.type || "").toLowerCase();
  if (artifactType === "error") return RESPONSE_MODES.RECOVER;
  if (artifactType === "draft" || artifactType === "research_contract") return RESPONSE_MODES.DRAFT;
  if (artifactType === "context_suggestion" || artifact?.ambiguous === true) return RESPONSE_MODES.CLARIFY;
  return RESPONSE_MODES.REPORT;
}

function summarizeArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return "(no artifact)";
  const parts = [];
  if (artifact.type) parts.push(`type: ${artifact.type}`);
  if (artifact.listCategory) parts.push(`listCategory: ${artifact.listCategory}`);
  if (artifact.entityType) parts.push(`entityType: ${artifact.entityType}`);
  if (artifact.title) parts.push(`title: ${String(artifact.title).slice(0, 100)}`);
  if (typeof artifact.message === "string" && artifact.message.trim()) {
    parts.push(`summary: ${artifact.message.slice(0, 300)}`);
  }
  if (typeof artifact.content === "string" && artifact.content.trim()) {
    parts.push(`contentSnippet: ${artifact.content.slice(0, 300)}`);
  }
  return parts.join("\n");
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
      return "Here is the current situation. Let me know which area you would like to address first.";
    case RESPONSE_MODES.CLARIFY:
      return "I need one more detail to continue. Could you clarify which record you mean?";
    case RESPONSE_MODES.DRAFT:
      return "The draft has been prepared. Please review and let me know if you need adjustments.";
    case RESPONSE_MODES.RECOVER:
      return "I could not complete that request. Please try again or rephrase.";
    default:
      return "";
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
  const mode = selectMode({ artifact, secondaries });

  // LLM loop paths pass their already-synthesized message — use it directly.
  if (typeof context.existingMessage === "string" && context.existingMessage.trim()) {
    return { finalMessage: context.existingMessage, responseMode: mode };
  }

  const systemPrompt = MODE_SYSTEM_PROMPTS[mode];
  const userContent = [
    `User message: ${String(userMessage || "").slice(0, 300)}`,
    "",
    "Artifact:",
    summarizeArtifact(artifact),
  ].join("\n");

  const llmText = await callLLM(systemPrompt, userContent);

  // Silent policy: only allowed for REPORT when artifact already contains a summary.
  const canBeSilent =
    mode === RESPONSE_MODES.REPORT &&
    typeof artifact?.message === "string" &&
    artifact.message.trim().length > 20;

  let finalMessage;
  if (llmText) {
    finalMessage = llmText;
  } else if (canBeSilent) {
    finalMessage = "";
  } else {
    finalMessage = buildFallback(mode);
  }

  return { finalMessage, responseMode: mode };
}

module.exports = { buildTurnResponse, RESPONSE_MODES };
