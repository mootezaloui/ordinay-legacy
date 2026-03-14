"use strict";

function embedText(text) {
  const normalizedText = normalizeText(text);
  const tokens = tokenize(normalizedText);
  const vector = buildSparseVector(tokens);
  const norm = computeNorm(vector);

  return {
    normalizedText,
    vector,
    norm,
    tokenCount: tokens.length,
  };
}

function scoreSimilarity(queryEmbedding, chunkEmbedding) {
  if (!isEmbedding(queryEmbedding) || !isEmbedding(chunkEmbedding)) {
    return 0;
  }
  if (queryEmbedding.norm <= 0 || chunkEmbedding.norm <= 0) {
    return 0;
  }

  const queryEntries = Object.entries(queryEmbedding.vector);
  let dot = 0;
  for (const [token, weight] of queryEntries) {
    const chunkWeight = chunkEmbedding.vector[token];
    if (typeof chunkWeight === "number") {
      dot += weight * chunkWeight;
    }
  }

  const cosine = dot / (queryEmbedding.norm * chunkEmbedding.norm);
  const phraseBoost = computePhraseBoost(queryEmbedding.normalizedText, chunkEmbedding.normalizedText);
  return clamp(cosine + phraseBoost, 0, 1);
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalizedText) {
  if (!normalizedText) {
    return [];
  }
  return normalizedText.split(" ").filter((token) => token.length > 1);
}

function buildSparseVector(tokens) {
  const counts = {};

  for (const token of tokens) {
    counts[token] = (counts[token] || 0) + 1;
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = `${tokens[index]}_${tokens[index + 1]}`;
    const key = `bg:${bigram}`;
    counts[key] = (counts[key] || 0) + 0.5;
  }

  return counts;
}

function computeNorm(vector) {
  let total = 0;
  for (const weight of Object.values(vector)) {
    total += weight * weight;
  }
  return Math.sqrt(total);
}

function computePhraseBoost(queryText, chunkText) {
  if (!queryText || !chunkText) {
    return 0;
  }

  if (queryText.length >= 12 && chunkText.includes(queryText)) {
    return 0.15;
  }

  const queryTokens = queryText.split(" ").filter((token) => token.length > 2);
  if (queryTokens.length === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of queryTokens) {
    if (chunkText.includes(token)) {
      matches += 1;
    }
  }

  const coverage = matches / queryTokens.length;
  return Math.min(coverage * 0.12, 0.12);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isEmbedding(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.normalizedText === "string" &&
    typeof value.vector === "object" &&
    value.vector !== null &&
    typeof value.norm === "number"
  );
}

module.exports = {
  embedText,
  scoreSimilarity,
  normalizeText,
};
