"use strict";

const DEFAULT_RETRIES = 2;
const { buildAuditIntegrityEnvelope, hashAuditPayload } = require("../security/audit.integrity");
const {
  rebuildConversationTurns,
  rebuildHistoryEntry,
  rebuildPendingAction,
  normalizeRetries,
  normalizeString,
  normalizeNullableText,
  normalizeDate,
  serializePendingActionArgs,
  safeJsonStringify,
  safeParse,
  isRecord,
  safeErrorMessage,
} = require("./session.repository.utils");

function createSessionRepository(sqliteClient, options = {}) {
  if (!sqliteClient) {
    throw new Error("createSessionRepository requires a sqlite client");
  }

  const tables = resolveTableNames(sqliteClient);
  const maxRetries = normalizeRetries(options.maxRetries, DEFAULT_RETRIES);
  let queue = Promise.resolve();

  function enqueueWrite(label, task) {
    const run = async () => {
      let attempt = 0;
      while (true) {
        try {
          return await task();
        } catch (error) {
          if (attempt >= maxRetries) {
            throw error;
          }
          attempt += 1;
        }
      }
    };

    const execution = queue.then(run, run);
    queue = execution.catch(() => {});
    return execution.catch((error) => {
      console.warn(`[agent.persistence] ${label} failed:`, safeErrorMessage(error));
      throw error;
    });
  }

  async function loadSession(sessionId) {
    const key = normalizeString(sessionId);
    if (!key) return null;

    const row = await sqliteClient.get(
      `SELECT id, user_id, created_at, updated_at, summary, metadata_json
       FROM ${tables.sessions}
       WHERE id = @id
       LIMIT 1`,
      { id: key },
    );
    if (!row) {
      return null;
    }

    const metadata = safeParse(row.metadata_json, {});
    const turnRows = await sqliteClient.all(
      `SELECT id, input_json, output_json, created_at, completed_at
       FROM ${tables.turns}
       WHERE session_id = @session_id
       ORDER BY COALESCE(created_at, '') ASC, id ASC`,
      { session_id: key },
    );
    const historyRows = await sqliteClient.all(
      `SELECT role, tool_name, content, created_at
       FROM ${tables.history}
       WHERE session_id = @session_id
       ORDER BY id ASC`,
      { session_id: key },
    );
    const pendingRow = await sqliteClient.get(
      `SELECT id, tool_name, summary, args_json, created_at, requested_by_turn_id, risk
       FROM ${tables.pendingActions}
       WHERE session_id = @session_id
       LIMIT 1`,
      { session_id: key },
    );

    return {
      id: String(row.id),
      userId: row.user_id || undefined,
      state: {
        status: metadata.state?.status || "ACTIVE",
        pendingAction: pendingRow ? rebuildPendingAction(pendingRow) : null,
        lastTurnType: metadata.state?.lastTurnType || "NEW",
      },
      turns: rebuildConversationTurns(turnRows),
      history: historyRows.map((entry, index) => rebuildHistoryEntry(entry, index)),
      activeEntities: Array.isArray(metadata.activeEntities) ? metadata.activeEntities : [],
      currentDraft: isRecord(metadata.currentDraft) ? metadata.currentDraft : undefined,
      summary: normalizeNullableText(row.summary) || undefined,
      createdAt: normalizeDate(row.created_at),
      updatedAt: normalizeDate(row.updated_at),
      metadata: isRecord(metadata.metadata) ? metadata.metadata : undefined,
    };
  }

  function saveSession(session) {
    return enqueueWrite("saveSession", async () => {
      const payload = {
        id: normalizeString(session?.id),
        user_id: normalizeNullableText(session?.userId),
        created_at: normalizeDate(session?.createdAt),
        updated_at: normalizeDate(session?.updatedAt),
        summary: normalizeNullableText(session?.summary),
        metadata_json: safeJsonStringify({
          state: {
            status: session?.state?.status || "ACTIVE",
            lastTurnType: session?.state?.lastTurnType || "NEW",
          },
          activeEntities: Array.isArray(session?.activeEntities) ? session.activeEntities : [],
          metadata: isRecord(session?.metadata) ? session.metadata : undefined,
          currentDraft: isRecord(session?.currentDraft) ? session.currentDraft : undefined,
        }),
      };

      if (!payload.id) {
        throw new Error("saveSession requires a valid session id");
      }

      await sqliteClient.run(
        `INSERT INTO ${tables.sessions} (id, user_id, created_at, updated_at, summary, metadata_json)
         VALUES (@id, @user_id, @created_at, @updated_at, @summary, @metadata_json)
         ON CONFLICT(id) DO UPDATE SET
           user_id = excluded.user_id,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           summary = excluded.summary,
           metadata_json = excluded.metadata_json`,
        payload,
      );
    });
  }

  function saveTurnSnapshot(sessionId, turnId, input, output, createdAt, completedAt) {
    return enqueueWrite("saveTurnSnapshot", async () => {
      const payload = {
        id: normalizeString(turnId),
        session_id: normalizeString(sessionId),
        input_json: safeJsonStringify(input || {}),
        output_json: safeJsonStringify(output || {}),
        created_at: normalizeDate(createdAt),
        completed_at: normalizeDate(completedAt),
      };

      if (!payload.id || !payload.session_id) {
        throw new Error("saveTurnSnapshot requires sessionId and turnId");
      }

      await sqliteClient.run(
        `INSERT INTO ${tables.turns} (id, session_id, input_json, output_json, created_at, completed_at)
         VALUES (@id, @session_id, @input_json, @output_json, @created_at, @completed_at)
         ON CONFLICT(id) DO UPDATE SET
           session_id = excluded.session_id,
           input_json = excluded.input_json,
           output_json = excluded.output_json,
           created_at = excluded.created_at,
           completed_at = excluded.completed_at`,
        payload,
      );
    });
  }

  function appendHistory(sessionId, entry, toolName) {
    return enqueueWrite("appendHistory", async () => {
      const payload = {
        session_id: normalizeString(sessionId),
        role: normalizeString(entry?.role),
        tool_name: normalizeNullableText(toolName),
        content: safeJsonStringify({
          turnId: normalizeString(entry?.turnId),
          summary: normalizeString(entry?.summary),
        }),
        created_at: normalizeDate(entry?.createdAt),
      };

      if (!payload.session_id || !payload.role) {
        throw new Error("appendHistory requires sessionId and role");
      }

      await sqliteClient.run(
        `INSERT INTO ${tables.history} (session_id, role, tool_name, content, created_at)
         VALUES (@session_id, @role, @tool_name, @content, @created_at)`,
        payload,
      );
    });
  }

  function setPendingAction(sessionId, action) {
    return enqueueWrite("setPendingAction", async () => {
      if (!action || !normalizeString(action.id)) {
        throw new Error("setPendingAction requires a valid action");
      }

      const sessionKey = normalizeString(sessionId);
      if (!sessionKey) {
        throw new Error("setPendingAction requires sessionId");
      }

      await sqliteClient.run(`DELETE FROM ${tables.pendingActions} WHERE session_id = @session_id`, {
        session_id: sessionKey,
      });

      await sqliteClient.run(
        `INSERT INTO ${tables.pendingActions}
          (id, session_id, tool_name, summary, args_json, created_at, requested_by_turn_id, risk)
         VALUES
          (@id, @session_id, @tool_name, @summary, @args_json, @created_at, @requested_by_turn_id, @risk)`,
        {
          id: normalizeString(action.id),
          session_id: sessionKey,
          tool_name: normalizeString(action.toolName),
          summary: normalizeString(action.summary),
          args_json: serializePendingActionArgs(action),
          created_at: normalizeDate(action.createdAt),
          requested_by_turn_id: normalizeNullableText(action.requestedByTurnId),
          risk: normalizeNullableText(action.risk),
        },
      );
    });
  }

  function clearPendingAction(sessionId) {
    return enqueueWrite("clearPendingAction", async () => {
      const sessionKey = normalizeString(sessionId);
      if (!sessionKey) {
        throw new Error("clearPendingAction requires sessionId");
      }
      await sqliteClient.run(`DELETE FROM ${tables.pendingActions} WHERE session_id = @session_id`, {
        session_id: sessionKey,
      });
    });
  }

  function appendAudit(record) {
    return enqueueWrite("appendAudit", async () => {
      const normalizedData = normalizeAuditData(record?.data);
      const payload = {
        id: normalizeString(record?.id),
        session_id: normalizeString(record?.sessionId),
        turn_id: normalizeString(record?.turnId),
        event_type: normalizeString(record?.eventType),
        timestamp: normalizeDate(record?.timestamp),
        data_json: "",
      };

      if (!payload.id || !payload.session_id || !payload.turn_id || !payload.event_type) {
        throw new Error("appendAudit requires id, sessionId, turnId, eventType");
      }

      const hashBasis = {
        id: payload.id,
        sessionId: payload.session_id,
        turnId: payload.turn_id,
        eventType: payload.event_type,
        timestamp: payload.timestamp,
        data: normalizedData,
      };
      const integrity = buildAuditIntegrityEnvelope(hashBasis);
      const dataWithIntegrity = {
        ...normalizedData,
        __integrity: integrity,
      };
      payload.data_json = safeJsonStringify(dataWithIntegrity);

      const existing = await sqliteClient.get(
        `SELECT id, session_id, turn_id, event_type, timestamp, data_json
         FROM ${tables.auditRecords}
         WHERE id = @id
         LIMIT 1`,
        { id: payload.id },
      );
      if (existing) {
        const existingData = safeParse(existing.data_json, {});
        const existingHash = extractIntegrityHash(existingData);
        const comparableHash =
          existingHash ||
          hashAuditPayload({
            id: normalizeString(existing.id),
            sessionId: normalizeString(existing.session_id),
            turnId: normalizeString(existing.turn_id),
            eventType: normalizeString(existing.event_type),
            timestamp: normalizeDate(existing.timestamp),
            data: stripIntegrity(existingData),
          });
        if (comparableHash === integrity.hash) {
          return;
        }
        const message = `appendAudit integrity conflict for id "${payload.id}"`;
        console.warn(`[agent.persistence] ${message}`);
        throw new Error(message);
      }

      await sqliteClient.run(
        `INSERT INTO ${tables.auditRecords} (id, session_id, turn_id, event_type, timestamp, data_json)
         VALUES (@id, @session_id, @turn_id, @event_type, @timestamp, @data_json)`,
        payload,
      );
    });
  }

  async function getRecentAuditEvents({ limit = 25, eventTypes = [], sessionId } = {}) {
    const safeLimit = clampLimit(limit, 25, 100);
    const params = { limit: safeLimit };
    const clauses = [];
    const safeSessionId = normalizeString(sessionId);
    if (safeSessionId) {
      clauses.push("session_id = @session_id");
      params.session_id = safeSessionId;
    }

    const safeEventTypes = normalizeEventTypes(eventTypes);
    if (safeEventTypes.length > 0) {
      const placeholders = safeEventTypes.map((_, index) => `@event_type_${index}`);
      clauses.push(`event_type IN (${placeholders.join(", ")})`);
      safeEventTypes.forEach((value, index) => {
        params[`event_type_${index}`] = value;
      });
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await sqliteClient.all(
      `SELECT id, session_id, turn_id, event_type, timestamp, data_json
       FROM ${tables.auditRecords}
       ${where}
       ORDER BY COALESCE(timestamp, '') DESC, id DESC
       LIMIT @limit`,
      params,
    );
    return rows.map(normalizeAuditRow);
  }

  async function getTurnTraceByTurnId(turnId) {
    const key = normalizeString(turnId);
    if (!key) {
      return null;
    }
    const row = await sqliteClient.get(
      `SELECT id, session_id, turn_id, event_type, timestamp, data_json
       FROM ${tables.auditRecords}
       WHERE turn_id = @turn_id AND event_type = 'turn_trace'
       ORDER BY COALESCE(timestamp, '') DESC, id DESC
       LIMIT 1`,
      { turn_id: key },
    );
    return row ? normalizeAuditRow(row) : null;
  }

  async function getHealthSnapshots({ limit = 25 } = {}) {
    return getAuditEventsByType("health_snapshot", limit);
  }

  async function getPerformanceSnapshots({ limit = 25 } = {}) {
    return getAuditEventsByType("performance_snapshot", limit);
  }

  async function getAuditEventsByType(eventType, limit) {
    const safeType = normalizeString(eventType);
    if (!safeType) {
      return [];
    }
    const rows = await sqliteClient.all(
      `SELECT id, session_id, turn_id, event_type, timestamp, data_json
       FROM ${tables.auditRecords}
       WHERE event_type = @event_type
       ORDER BY COALESCE(timestamp, '') DESC, id DESC
       LIMIT @limit`,
      {
        event_type: safeType,
        limit: clampLimit(limit, 25, 100),
      },
    );
    return rows.map(normalizeAuditRow);
  }

  return {
    loadSession,
    saveSession,
    saveTurnSnapshot,
    appendHistory,
    setPendingAction,
    clearPendingAction,
    appendAudit,
    getRecentAuditEvents,
    getTurnTraceByTurnId,
    getHealthSnapshots,
    getPerformanceSnapshots,
  };
}

function resolveTableNames(sqliteClient) {
  const configured = isRecord(sqliteClient?.tables) ? sqliteClient.tables : {};
  return {
    sessions: normalizeIdentifier(configured.sessions, "sessions"),
    turns: normalizeIdentifier(configured.turns, "turns"),
    history: normalizeIdentifier(configured.history, "history"),
    pendingActions: normalizeIdentifier(configured.pendingActions, "pending_actions"),
    auditRecords: normalizeIdentifier(configured.auditRecords, "audit_records"),
  };
}

function normalizeIdentifier(value, fallback) {
  const candidate = normalizeString(value || fallback);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate) ? candidate : fallback;
}

module.exports = {
  createSessionRepository,
};

function normalizeAuditData(value) {
  if (!isRecord(value)) {
    return { value: value ?? null };
  }
  return stripIntegrity(value);
}

function stripIntegrity(value) {
  if (Array.isArray(value)) {
    return value.map(stripIntegrity);
  }
  if (!isRecord(value)) {
    return value ?? null;
  }
  const output = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    if (key === "__integrity") {
      continue;
    }
    output[key] = stripIntegrity(value[key]);
  }
  return output;
}

function extractIntegrityHash(value) {
  if (!isRecord(value) || !isRecord(value.__integrity)) {
    return "";
  }
  return normalizeString(value.__integrity.hash);
}

function normalizeAuditRow(row) {
  return {
    id: normalizeString(row?.id),
    sessionId: normalizeString(row?.session_id),
    turnId: normalizeString(row?.turn_id),
    eventType: normalizeString(row?.event_type),
    timestamp: normalizeDate(row?.timestamp),
    data: safeParse(row?.data_json, {}),
  };
}

function normalizeEventTypes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => normalizeString(entry)).filter(Boolean))].slice(0, 20);
}

function clampLimit(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}
