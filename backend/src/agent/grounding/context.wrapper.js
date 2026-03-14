"use strict";

const DEFAULT_MAX_CONTEXT_CHARS = 1200;
const MAX_SOURCE_IDS_PER_SECTION = 4;

function wrapGroundedContext({
  retrievalText,
  retrievalSourceIds,
  toolDataText,
  toolSourceIds,
  inferenceText,
  maxChars = DEFAULT_MAX_CONTEXT_CHARS,
} = {}) {
  const compactMaxChars = normalizePositiveInt(maxChars, DEFAULT_MAX_CONTEXT_CHARS);
  const sectionSourceIds = {
    retrievedEvidence: uniqueNonEmptyStrings(retrievalSourceIds),
    toolVerifiedData: uniqueNonEmptyStrings(toolSourceIds),
    modelInference: [],
  };

  const sections = [];
  sections.push(
    buildSection(
      "Retrieved Evidence",
      compact(retrievalText, 640),
      sectionSourceIds.retrievedEvidence,
      "No retrieved evidence for this turn.",
    ),
  );

  sections.push(
    buildSection(
      "Tool-Verified Data",
      compact(toolDataText, 420),
      sectionSourceIds.toolVerifiedData,
      "No tool-verified data for this turn.",
    ),
  );

  sections.push(
    buildSection(
      "Model Inference",
      compact(
        inferenceText ||
          "Reason only from the evidence above. Flag uncertainty when evidence is weak.",
        260,
      ),
      [],
      "Reason only from available evidence.",
    ),
  );

  const text = sections.join("\n\n");
  return {
    text: compact(text, compactMaxChars),
    sectionSourceIds,
  };
}

function buildSection(title, body, sourceIds, fallback) {
  const safeBody = body || fallback;
  const sourceNote = formatSourceNote(sourceIds);
  return `${title}${sourceNote}\n${safeBody}`;
}

function formatSourceNote(sourceIds) {
  const ids = uniqueNonEmptyStrings(sourceIds);
  if (ids.length === 0) {
    return "";
  }

  const visible = ids.slice(0, MAX_SOURCE_IDS_PER_SECTION);
  const hiddenCount = Math.max(ids.length - visible.length, 0);
  const suffix = hiddenCount > 0 ? ` +${hiddenCount} more` : "";
  return ` [sources: ${visible.join(", ")}${suffix}]`;
}

function compact(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, Math.max(maxChars - 3, 1)).trimEnd() + "...";
}

function uniqueNonEmptyStrings(values) {
  const rows = Array.isArray(values) ? values : [];
  return [...new Set(rows.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  wrapGroundedContext,
};
