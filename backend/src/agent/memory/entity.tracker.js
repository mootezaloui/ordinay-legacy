"use strict";

const { ENTITY_HARD_CAP, ENTITY_PRUNE_TURNS } = require("./memory.policy");

const SINGULAR_KEYS = {
  client: "client",
  dossier: "dossier",
  lawsuit: "lawsuit",
  task: "task",
  mission: "mission",
  session: "session",
  document: "document",
  officer: "officer",
  notification: "notification",
  personalTask: "personal_task",
  financialEntry: "financial_entry",
};

const PLURAL_KEYS = {
  clients: "client",
  dossiers: "dossier",
  lawsuits: "lawsuit",
  tasks: "task",
  missions: "mission",
  sessions: "session",
  documents: "document",
  officers: "officer",
  notifications: "notification",
  personalTasks: "personal_task",
  financialEntries: "financial_entry",
};

function createEntityTracker(options = {}) {
  const pruneWindow = normalizePositiveInt(options.entityPruneTurns, ENTITY_PRUNE_TURNS);
  const hardCap = normalizePositiveInt(options.hardCap, ENTITY_HARD_CAP);

  return {
    trackFromToolResult(session, result, toolName, turnId) {
      if (!isSessionLike(session)) {
        return [];
      }

      const payload = isRecord(result) && result.ok === true ? result.data : undefined;
      const extracted = extractEntities(payload, toolName, turnId);
      if (extracted.length === 0) {
        return [];
      }

      ensureActiveEntities(session);
      for (const entity of extracted) {
        upsertEntity(session.activeEntities, entity);
      }
      return [...session.activeEntities];
    },

    getActiveEntities(session) {
      if (!isSessionLike(session)) {
        return [];
      }
      ensureActiveEntities(session);
      return [...session.activeEntities];
    },

    pruneUnusedEntities(session, currentTurnId) {
      if (!isSessionLike(session)) {
        return [];
      }

      ensureActiveEntities(session);
      const turnOrder = buildTurnOrder(session.turns);
      const fallbackCurrentIndex = Math.max(session.turns.length - 1, 0);
      const currentIndex = turnOrder.get(String(currentTurnId || "")) ?? fallbackCurrentIndex;

      let retained = session.activeEntities.filter((entity) => {
        const lastRef = String(entity?.lastReferencedTurnId || "").trim();
        if (!lastRef) {
          return true;
        }
        const refIndex = turnOrder.get(lastRef);
        if (typeof refIndex !== "number") {
          return true;
        }
        return currentIndex - refIndex <= pruneWindow;
      });

      if (retained.length > hardCap) {
        retained = retained
          .slice()
          .sort((left, right) => {
            const rightRank = rankEntity(right, turnOrder);
            const leftRank = rankEntity(left, turnOrder);
            return rightRank - leftRank;
          })
          .slice(0, hardCap);
      }

      session.activeEntities = retained;
      return [...retained];
    },
  };
}

function extractEntities(payload, toolName, turnId) {
  if (!isRecord(payload)) {
    return [];
  }

  const output = [];
  const now = new Date().toISOString();

  for (const [key, type] of Object.entries(SINGULAR_KEYS)) {
    const value = payload[key];
    const entity = normalizeEntity(type, value, toolName, turnId, now);
    if (entity) {
      output.push(entity);
    }
  }

  for (const [key, type] of Object.entries(PLURAL_KEYS)) {
    const value = payload[key];
    if (!Array.isArray(value)) {
      continue;
    }
    for (const row of value) {
      const entity = normalizeEntity(type, row, toolName, turnId, now);
      if (entity) {
        output.push(entity);
      }
    }
  }

  const graphEntityRows = collectGraphEntities(payload);
  for (const graphRow of graphEntityRows) {
    const entity = normalizeEntity(graphRow.type, graphRow.value, toolName, turnId, now);
    if (entity) {
      output.push(entity);
    }
  }

  return output;
}

function collectGraphEntities(payload) {
  const output = [];

  if (isRecord(payload.root) && payload.root.type) {
    output.push({ type: String(payload.root.type), value: payload.root });
  }

  if (isRecord(payload.parents)) {
    for (const value of Object.values(payload.parents)) {
      if (isRecord(value) && value.type) {
        output.push({ type: String(value.type), value });
      }
    }
  }

  if (isRecord(payload.children)) {
    for (const [key, rows] of Object.entries(payload.children)) {
      if (!Array.isArray(rows)) {
        continue;
      }
      const guessedType = String(key || "").replace(/s$/i, "").toLowerCase();
      for (const row of rows) {
        if (!isRecord(row)) {
          continue;
        }
        const rowType = row.type ? String(row.type) : guessedType;
        output.push({ type: rowType, value: row });
      }
    }
  }

  return output;
}

function normalizeEntity(type, value, toolName, turnId, now) {
  if (!type || !isRecord(value)) {
    return null;
  }

  const normalizedType = String(type).trim().toLowerCase();
  if (!normalizedType) {
    return null;
  }

  const id = extractId(value);
  if (id === null || id === undefined || id === "") {
    return null;
  }

  const label = extractLabel(value);
  return {
    type: normalizedType,
    id,
    ...(label ? { label } : {}),
    sourceTool: String(toolName || "").trim() || undefined,
    lastMentionedAt: now,
    lastReferencedTurnId: String(turnId || "").trim() || undefined,
  };
}

function extractId(value) {
  const keys = [
    "id",
    "client_id",
    "dossier_id",
    "lawsuit_id",
    "task_id",
    "mission_id",
    "session_id",
    "document_id",
  ];
  for (const key of keys) {
    if (!(key in value)) {
      continue;
    }
    const raw = value[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    const text = String(raw || "").trim();
    if (!text) {
      continue;
    }
    if (/^\d+$/.test(text)) {
      return Number.parseInt(text, 10);
    }
    return text;
  }
  return null;
}

function extractLabel(value) {
  const keys = ["label", "name", "title", "reference", "case_number", "subject"];
  for (const key of keys) {
    const text = String(value[key] || "").trim();
    if (text) {
      return text;
    }
  }
  return undefined;
}

function upsertEntity(collection, next) {
  const key = entityKey(next.type, next.id);
  const index = collection.findIndex((item) => entityKey(item?.type, item?.id) === key);
  if (index === -1) {
    collection.push(next);
    return;
  }

  collection[index] = {
    ...collection[index],
    ...next,
    lastMentionedAt: next.lastMentionedAt || collection[index].lastMentionedAt,
    lastReferencedTurnId: next.lastReferencedTurnId || collection[index].lastReferencedTurnId,
  };
}

function rankEntity(entity, turnOrder) {
  const turnId = String(entity?.lastReferencedTurnId || "").trim();
  if (turnId && turnOrder.has(turnId)) {
    return turnOrder.get(turnId);
  }
  const time = Date.parse(String(entity?.lastMentionedAt || ""));
  return Number.isFinite(time) ? time : -1;
}

function buildTurnOrder(turns) {
  const order = new Map();
  if (!Array.isArray(turns)) {
    return order;
  }
  for (let index = 0; index < turns.length; index += 1) {
    const id = String(turns[index]?.id || "").trim();
    if (id) {
      order.set(id, index);
    }
  }
  return order;
}

function entityKey(type, id) {
  return `${String(type || "").toLowerCase()}:${String(id)}`;
}

function ensureActiveEntities(session) {
  if (!Array.isArray(session.activeEntities)) {
    session.activeEntities = [];
  }
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionLike(value) {
  return isRecord(value) && Array.isArray(value.turns);
}

module.exports = {
  createEntityTracker,
};
