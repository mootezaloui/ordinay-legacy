"use strict";

function normalizeEntityType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "case") return "lawsuit";
  if (v === "hearing") return "session";
  if (v === "personal task") return "personal_task";
  if (v === "financial entry") return "financial_entry";
  if (v === "history event") return "history_event";
  return v;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_]/gu, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pluralizeToken(token) {
  const t = String(token || "").toLowerCase().trim();
  if (!t) return [];
  if (t.endsWith("y") && t.length > 1 && !/[aeiou]y$/.test(t)) {
    return [`${t.slice(0, -1)}ies`];
  }
  if (/(s|x|z|ch|sh)$/.test(t)) return [`${t}es`];
  return [`${t}s`];
}

function singularizeToken(token) {
  const t = String(token || "").toLowerCase().trim();
  if (!t) return [];
  if (t.endsWith("ies") && t.length > 3) return [`${t.slice(0, -3)}y`];
  if (t.endsWith("es") && t.length > 2) return [t.slice(0, -2)];
  if (t.endsWith("s") && t.length > 1) return [t.slice(0, -1)];
  return [];
}

function buildEntityTerms(entityType) {
  const canonical = normalizeEntityType(entityType);
  if (!canonical) return [];
  const terms = new Set();
  const phrase = canonical.replace(/_/g, " ");
  const tokens = phrase.split(/\s+/).filter(Boolean);
  terms.add(phrase);
  terms.add(canonical);
  if (tokens.length <= 1) {
    for (const token of tokens) {
      terms.add(token);
      for (const p of pluralizeToken(token)) terms.add(p);
      for (const s of singularizeToken(token)) terms.add(s);
    }
  } else {
    // Compound entity types should be matched by compound phrase, not generic tail tokens.
    const head = tokens[0];
    if (head) terms.add(head);
    const last = tokens[tokens.length - 1];
    if (last) {
      for (const p of pluralizeToken(last)) {
        terms.add([...tokens.slice(0, -1), p].join(" "));
      }
      for (const s of singularizeToken(last)) {
        terms.add([...tokens.slice(0, -1), s].join(" "));
      }
    }
  }
  if (canonical === "session") {
    terms.add("hearing");
    terms.add("hearings");
    terms.add("meeting");
    terms.add("meetings");
  }
  // Data-driven generic expansion for financial_entry phrase family.
  if (tokens.includes("financial") && tokens.includes("entry")) {
    terms.add("accounting");
    terms.add("invoice");
    terms.add("invoices");
    terms.add("payment");
    terms.add("payments");
    terms.add("billing");
  }
  return Array.from(terms)
    .map((v) => normalizeText(v))
    .filter(Boolean);
}

function findExplicitEntityTypeMatches(userMessage, knownEntityTypes = []) {
  const text = normalizeText(userMessage);
  if (!text) return [];
  const matches = [];
  for (const rawType of knownEntityTypes) {
    const entityType = normalizeEntityType(rawType);
    if (!entityType) continue;
    const terms = buildEntityTerms(entityType);
    const termMatches = [];
    for (const term of terms) {
      if (!term) continue;
      const pattern = new RegExp(
        `(^|\\s)${term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(\\s|$)`,
        "i",
      );
      const match = pattern.exec(text);
      if (!match || typeof match.index !== "number") continue;
      const normalizedTerm = normalizeText(term);
      termMatches.push({
        term: normalizedTerm,
        index: match.index,
        tokenCount: normalizedTerm.split(/\s+/).filter(Boolean).length,
      });
    }
    if (termMatches.length > 0) {
      matches.push({
        entityType,
        matchedTerms: termMatches,
      });
    }
  }
  return matches;
}

function findMutationActionAnchors(userMessage) {
  const text = normalizeText(userMessage);
  if (!text) return [];
  const regex = /\b(create|add|open|schedule|update|edit|change|set|mark|assign|delete|remove)\b/gi;
  const anchors = [];
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    anchors.push({
      verb: String(match[1] || "").toLowerCase(),
      index: Number(match.index || 0),
    });
  }
  return anchors;
}

function computeAnchorAffinity(termIndex, anchors = []) {
  if (!Number.isFinite(Number(termIndex)) || !Array.isArray(anchors) || anchors.length === 0) {
    return 0;
  }
  let best = -Infinity;
  for (const anchor of anchors) {
    const anchorIndex = Number(anchor?.index || 0);
    const delta = Number(termIndex) - anchorIndex;
    const afterBoost = delta >= 0 ? 40 : 10;
    const distancePenalty = Math.abs(delta) * 0.2;
    const score = afterBoost - distancePenalty;
    if (score > best) best = score;
  }
  return Number.isFinite(best) ? best : 0;
}

function hasStrongMutationIntent(message) {
  const text = normalizeText(message);
  if (!text) return false;
  return /\b(create|add|open|update|edit|change|set|mark|assign|schedule|delete|remove)\b/.test(
    text,
  );
}

function canReusePreviousEntityType({ userMessage, previousMutationContext = null } = {}) {
  const previousType = normalizeEntityType(previousMutationContext?.entityType || "");
  if (!previousType) return false;
  if (!hasStrongMutationIntent(userMessage)) return false;
  const text = normalizeText(userMessage);
  // Conservative reuse: only when user is clearly referring to prior entity.
  return /\b(it|this|that|same|same one|same record|same item|continue)\b/.test(text);
}

function resolveEntityTypeFromMessage({
  userMessage,
  knownEntityTypes = [],
  previousMutationContext = null,
} = {}) {
  const normalizedKnown = Array.from(
    new Set((Array.isArray(knownEntityTypes) ? knownEntityTypes : []).map(normalizeEntityType).filter(Boolean)),
  );
  const explicitMatches = findExplicitEntityTypeMatches(userMessage, normalizedKnown);
  const uniqueExplicit = Array.from(new Set(explicitMatches.map((row) => row.entityType)));
  const anchors = findMutationActionAnchors(userMessage);
  if (explicitMatches.length > 1) {
    const ranked = explicitMatches
      .map((row) => {
        const bestTerm = (Array.isArray(row.matchedTerms) ? row.matchedTerms : [])
          .slice()
          .sort((a, b) => {
            if (Number(b?.tokenCount || 0) !== Number(a?.tokenCount || 0)) {
              return Number(b?.tokenCount || 0) - Number(a?.tokenCount || 0);
            }
            return Number(a?.index || 0) - Number(b?.index || 0);
          })[0];
        return {
          entityType: row.entityType,
          bestTerm,
          score:
            Number(bestTerm?.tokenCount || 0) * 10 -
            Number(bestTerm?.index || 0) * 0.01 +
            computeAnchorAffinity(bestTerm?.index, anchors),
        };
      })
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    if (ranked.length >= 2 && Number(ranked[0]?.score || 0) - Number(ranked[1]?.score || 0) >= 5) {
      return {
        status: "resolved",
        entityType: ranked[0].entityType,
        source: "explicit_noun_weighted",
        candidates: ranked.map((r) => r.entityType),
        matchedTerms: explicitMatches
          .filter((row) => row.entityType === ranked[0].entityType)
          .flatMap((row) => row.matchedTerms || []),
      };
    }
  }
  if (uniqueExplicit.length === 1) {
    return {
      status: "resolved",
      entityType: uniqueExplicit[0],
      source: "explicit_noun",
      candidates: uniqueExplicit,
      matchedTerms: explicitMatches[0]?.matchedTerms || [],
    };
  }
  if (uniqueExplicit.length > 1) {
    return {
      status: "ambiguous",
      entityType: null,
      source: "explicit_noun_ambiguous",
      candidates: uniqueExplicit,
      matchedTerms: explicitMatches.flatMap((row) => row.matchedTerms || []),
    };
  }
  if (canReusePreviousEntityType({ userMessage, previousMutationContext })) {
    return {
      status: "resolved",
      entityType: normalizeEntityType(previousMutationContext.entityType),
      source: "previous_context_reuse",
      candidates: [],
      matchedTerms: [],
    };
  }
  return {
    status: "none",
    entityType: null,
    source: "none",
    candidates: [],
    matchedTerms: [],
  };
}

module.exports = {
  resolveEntityTypeFromMessage,
  normalizeEntityType,
};
