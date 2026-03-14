"use strict";

const TYPE_PRIORITY = Object.freeze({
  retrieval: 1,
  document: 2,
  tool: 3,
  summary: 4,
});

function createSourceTracker() {
  const turns = new Map();

  function beginTurn(turnId) {
    const key = normalizeTurnId(turnId);
    if (!key) {
      return;
    }
    turns.set(key, createEmptyTurnState(key));
  }

  function registerRetrievalMatches({ turnId, matches } = {}) {
    const state = ensureTurnState(turnId);
    if (!state) {
      return [];
    }

    const rows = Array.isArray(matches) ? matches : [];
    const registeredSourceIds = [];

    for (const match of rows) {
      const row = toRecord(match);
      if (!row) {
        continue;
      }

      const sourceId = normalizeOptionalString(row.sourceId);
      const chunkId = normalizeOptionalString(row.chunkId);
      const documentId = normalizeOptionalString(row.documentId);
      const chunkIndex = normalizeNonNegativeInt(row.chunkIndex);
      const retrievalId = buildRetrievalSourceId(sourceId, chunkId, documentId, chunkIndex);
      if (!retrievalId) {
        continue;
      }

      const source = {
        id: retrievalId,
        type: "retrieval",
        label:
          normalizeOptionalString(row?.metadata?.sourceLabel) ||
          `Retrieved chunk ${chunkIndex >= 0 ? chunkIndex + 1 : "?"}`,
        reference: buildRetrievalReference(documentId, chunkIndex, sourceId, chunkId),
        confidence: mapScoreToConfidence(row.score),
      };
      if (addSource(state, source)) {
        registeredSourceIds.push(source.id);
      }

      if (documentId) {
        const documentSource = {
          id: `document:${documentId}`,
          type: "document",
          label: normalizeOptionalString(row?.metadata?.documentLabel) || documentId,
          reference: documentId,
          confidence: "medium",
        };
        addSource(state, documentSource);
      }
    }

    return unique(registeredSourceIds);
  }

  function registerToolOutputs({ turnId, toolCalls } = {}) {
    const state = ensureTurnState(turnId);
    if (!state) {
      return [];
    }

    const rows = Array.isArray(toolCalls) ? toolCalls : [];
    const sourceIds = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = toRecord(rows[index]);
      if (!row) {
        continue;
      }

      const toolName = normalizeOptionalString(row.toolName) || "unknown_tool";
      const callId = normalizeOptionalString(row.id) || `call_${index + 1}`;
      const sourceId = `tool:${state.turnId}:${toolName}:${callId}`;
      const ok = row.ok === true;
      const source = {
        id: sourceId,
        type: "tool",
        label: `Tool ${toolName}`,
        reference: `${toolName} (${ok ? "ok" : "failed"})`,
        confidence: ok ? "high" : "low",
      };
      if (addSource(state, source)) {
        sourceIds.push(source.id);
      }
    }

    return unique(sourceIds);
  }

  function registerSummary({ turnId, sessionId, summary } = {}) {
    const state = ensureTurnState(turnId);
    const normalizedSummary = normalizeOptionalString(summary);
    const normalizedSessionId = normalizeOptionalString(sessionId);
    if (!state || !normalizedSummary || !normalizedSessionId) {
      return [];
    }

    const sourceId = `summary:session:${normalizedSessionId}`;
    const source = {
      id: sourceId,
      type: "summary",
      label: `Session ${normalizedSessionId} summary`,
      reference: `session:${normalizedSessionId}:summary`,
      confidence: "low",
    };

    return addSource(state, source) ? [sourceId] : [];
  }

  function attachSectionSourceIds(turnId, sectionSourceIds) {
    const state = ensureTurnState(turnId);
    const sections = toRecord(sectionSourceIds);
    if (!state || !sections) {
      return;
    }

    for (const [name, ids] of Object.entries(sections)) {
      const normalizedName = normalizeOptionalString(name);
      if (!normalizedName) {
        continue;
      }
      const current = Array.isArray(state.sectionSourceIds[normalizedName])
        ? state.sectionSourceIds[normalizedName]
        : [];
      const incoming = Array.isArray(ids)
        ? ids.map((id) => normalizeOptionalString(id)).filter(Boolean)
        : [];
      state.sectionSourceIds[normalizedName] = unique([...current, ...incoming]);
    }
  }

  function getTurnSources(turnId) {
    const key = normalizeTurnId(turnId);
    const state = key ? turns.get(key) : null;
    if (!state) {
      return [];
    }
    return sortSources([...state.sources.values()]);
  }

  function getTurnSectionSourceIds(turnId) {
    const key = normalizeTurnId(turnId);
    const state = key ? turns.get(key) : null;
    if (!state) {
      return {};
    }

    const clone = {};
    for (const [name, ids] of Object.entries(state.sectionSourceIds)) {
      clone[name] = Array.isArray(ids) ? [...ids] : [];
    }
    return clone;
  }

  function getAllSources() {
    const aggregate = new Map();
    for (const state of turns.values()) {
      for (const source of state.sources.values()) {
        aggregate.set(source.id, source);
      }
    }
    return sortSources([...aggregate.values()]);
  }

  function ensureTurnState(turnId) {
    const key = normalizeTurnId(turnId);
    if (!key) {
      return null;
    }
    if (!turns.has(key)) {
      turns.set(key, createEmptyTurnState(key));
    }
    return turns.get(key);
  }

  return {
    beginTurn,
    registerRetrievalMatches,
    registerToolOutputs,
    registerSummary,
    attachSectionSourceIds,
    getTurnSources,
    getTurnSectionSourceIds,
    getAllSources,
  };
}

function createEmptyTurnState(turnId) {
  return {
    turnId,
    sources: new Map(),
    sectionSourceIds: {},
  };
}

function addSource(state, source) {
  const normalized = normalizeSourceRecord(source);
  if (!normalized) {
    return false;
  }
  state.sources.set(normalized.id, normalized);
  return true;
}

function normalizeSourceRecord(source) {
  const row = toRecord(source);
  if (!row) {
    return null;
  }

  const id = normalizeOptionalString(row.id);
  const type = normalizeSourceType(row.type);
  const label = normalizeOptionalString(row.label);
  const reference = normalizeOptionalString(row.reference);
  const confidence = normalizeConfidence(row.confidence);

  if (!id || !type || !label || !reference) {
    return null;
  }

  return { id, type, label, reference, confidence };
}

function sortSources(sources) {
  return sources
    .slice()
    .sort((left, right) => {
      const leftPriority = TYPE_PRIORITY[left.type] || 99;
      const rightPriority = TYPE_PRIORITY[right.type] || 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return String(left.id).localeCompare(String(right.id));
    });
}

function buildRetrievalSourceId(sourceId, chunkId, documentId, chunkIndex) {
  const key = sourceId || chunkId || (documentId ? `${documentId}:${chunkIndex}` : "");
  if (!key) {
    return "";
  }
  return `retrieval:${key}`;
}

function buildRetrievalReference(documentId, chunkIndex, sourceId, chunkId) {
  if (documentId && chunkIndex >= 0) {
    return `${documentId}#chunk:${chunkIndex + 1}`;
  }
  if (documentId) {
    return documentId;
  }
  return sourceId || chunkId || "retrieval";
}

function mapScoreToConfidence(score) {
  const parsed = Number.parseFloat(String(score ?? ""));
  if (!Number.isFinite(parsed)) {
    return "medium";
  }
  if (parsed >= 0.7) {
    return "high";
  }
  if (parsed >= 0.35) {
    return "medium";
  }
  return "low";
}

function normalizeSourceType(value) {
  const normalized = normalizeOptionalString(value).toLowerCase();
  if (
    normalized === "retrieval" ||
    normalized === "tool" ||
    normalized === "summary" ||
    normalized === "document"
  ) {
    return normalized;
  }
  return "";
}

function normalizeConfidence(value) {
  const normalized = normalizeOptionalString(value).toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
}

function normalizeTurnId(value) {
  return normalizeOptionalString(value);
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizeNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
}

function unique(values) {
  return [...new Set(values)];
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  createSourceTracker,
};
