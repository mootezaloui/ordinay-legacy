"use strict";

/**
 * Agent Domain Constraint Evaluator
 *
 * Evaluates whether a proposed mutation is allowed under domain business rules.
 * Called before any mutation proposal is created or executed.
 *
 * RECONSTRUCTED: Original file was deleted during pipeline migration.
 * Logic inferred from agentMutationConstraintResolver.js blocker codes and
 * agentMutationProposal.service.js usage patterns.
 */

const db = require("../../db/connection");

// ─── Helpers ───────────────────────────────────────────────────────────────

function _s(v) {
  return String(v || "").trim().toLowerCase();
}

function _isClosed(status) {
  return new Set(["closed", "archive", "archived"]).has(_s(status));
}

function _isInactiveLike(status) {
  return new Set(["inactive", "in_active", "not_active", "former_client"]).has(_s(status)) ||
    _s(status) === "inactive";
}

function _isOpenTask(status) {
  return !new Set(["completed", "cancelled", "done", "closed"]).has(_s(status));
}

function _isOpenSession(status) {
  return !new Set(["completed", "cancelled", "done", "closed"]).has(_s(status));
}

function _isOpenMission(status) {
  return !new Set(["completed", "cancelled", "done", "closed"]).has(_s(status));
}

function _isOpenDossier(status) {
  return !_isClosed(status);
}

function _safeQuery(sql, params = []) {
  try {
    return db.prepare(sql).all(...params) || [];
  } catch (_) {
    return [];
  }
}

function _safeGet(sql, params = []) {
  try {
    return db.prepare(sql).get(...params) || null;
  } catch (_) {
    return null;
  }
}

// ─── Lawsuit Closure Check ─────────────────────────────────────────────────

function _checkLawsuitCanClose(entityId) {
  const allTasks = _safeQuery(
    "SELECT id, title, status FROM tasks WHERE lawsuit_id = ? AND deleted_at IS NULL",
    [entityId],
  );
  const openTasks = allTasks.filter((r) => _isOpenTask(r.status));

  const allSessions = _safeQuery(
    "SELECT id, title, status FROM sessions WHERE lawsuit_id = ? AND deleted_at IS NULL",
    [entityId],
  );
  const openSessions = allSessions.filter((r) => _isOpenSession(r.status));

  const allMissions = _safeQuery(
    "SELECT id, title, status FROM missions WHERE lawsuit_id = ? AND deleted_at IS NULL",
    [entityId],
  );
  const openMissions = allMissions.filter((r) => _isOpenMission(r.status));

  if (openTasks.length === 0 && openSessions.length === 0 && openMissions.length === 0) {
    return null;
  }

  const counts = {
    openTasks: openTasks.length,
    openSessions: openSessions.length,
    openMissions: openMissions.length,
  };

  const parts = [];
  if (counts.openTasks) parts.push(`${counts.openTasks} open task${counts.openTasks > 1 ? "s" : ""}`);
  if (counts.openSessions) parts.push(`${counts.openSessions} open hearing${counts.openSessions > 1 ? "s" : ""}`);
  if (counts.openMissions) parts.push(`${counts.openMissions} active mission${counts.openMissions > 1 ? "s" : ""}`);

  return {
    code: "LAWSUIT_HAS_OPEN_CHILDREN",
    userFacingFactText: `This lawsuit still has ${parts.join(", ")}.`,
    facts: { openTasks, openSessions, openMissions, counts },
  };
}

// ─── Dossier Closure Check ─────────────────────────────────────────────────

function _checkDossierCanClose(entityId) {
  const allTasks = _safeQuery(
    "SELECT id, title, status FROM tasks WHERE dossier_id = ? AND deleted_at IS NULL",
    [entityId],
  );
  const openTasks = allTasks.filter((r) => _isOpenTask(r.status));

  const allSessions = _safeQuery(
    "SELECT id, title, status FROM sessions WHERE dossier_id = ? AND deleted_at IS NULL",
    [entityId],
  );
  const openSessions = allSessions.filter((r) => _isOpenSession(r.status));

  const allMissions = _safeQuery(
    "SELECT id, title, status FROM missions WHERE dossier_id = ? AND deleted_at IS NULL",
    [entityId],
  );
  const openMissions = allMissions.filter((r) => _isOpenMission(r.status));

  const allLawsuits = _safeQuery(
    "SELECT id, title, lawsuit_number, status FROM lawsuits WHERE dossier_id = ? AND deleted_at IS NULL",
    [entityId],
  );
  const openLawsuits = allLawsuits.filter((r) => !_isClosed(r.status));

  if (
    openTasks.length === 0 &&
    openSessions.length === 0 &&
    openMissions.length === 0 &&
    openLawsuits.length === 0
  ) {
    return null;
  }

  const counts = {
    openLawsuits: openLawsuits.length,
    openTasks: openTasks.length,
    openSessions: openSessions.length,
    openMissions: openMissions.length,
  };

  return {
    code: "DOSSIER_HAS_OPEN_CHILDREN",
    userFacingFactText: "This dossier still has open linked items that must be resolved first.",
    facts: { openTasks, openSessions, openMissions, openLawsuits, counts },
  };
}

// ─── Client Inactivation Check ─────────────────────────────────────────────

function _checkClientCanDeactivate(entityId) {
  const openDossiers = _safeQuery(
    "SELECT id, title, reference, status FROM dossiers WHERE client_id = ? AND deleted_at IS NULL",
    [entityId],
  ).filter((r) => _isOpenDossier(r.status));

  const openLawsuits = _safeQuery(
    "SELECT l.id, l.title, l.lawsuit_number, l.status FROM lawsuits l " +
    "INNER JOIN dossiers d ON l.dossier_id = d.id " +
    "WHERE d.client_id = ? AND l.deleted_at IS NULL",
    [entityId],
  ).filter((r) => !_isClosed(r.status));

  const pendingTasks = _safeQuery(
    "SELECT t.id, t.title, t.status FROM tasks t " +
    "INNER JOIN dossiers d ON t.dossier_id = d.id " +
    "WHERE d.client_id = ? AND t.deleted_at IS NULL",
    [entityId],
  ).filter((r) => _isOpenTask(r.status));

  const openSessions = _safeQuery(
    "SELECT s.id, s.title, s.status FROM sessions s " +
    "INNER JOIN lawsuits l ON s.lawsuit_id = l.id " +
    "INNER JOIN dossiers d ON l.dossier_id = d.id " +
    "WHERE d.client_id = ? AND s.deleted_at IS NULL",
    [entityId],
  ).filter((r) => _isOpenSession(r.status));

  const activeMissions = _safeQuery(
    "SELECT m.id, m.title, m.status FROM missions m " +
    "INNER JOIN dossiers d ON m.dossier_id = d.id " +
    "WHERE d.client_id = ? AND m.deleted_at IS NULL",
    [entityId],
  ).filter((r) => _isOpenMission(r.status));

  // Unpaid receivables: financial entries with positive balance not yet paid
  const unpaidRows = _safeQuery(
    "SELECT id, amount, currency FROM financial_entries WHERE client_id = ? AND deleted_at IS NULL AND status NOT IN ('paid', 'cancelled', 'voided')",
    [entityId],
  );
  const unpaidReceivables = {
    count: unpaidRows.length,
    totalAmount: unpaidRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    currency: unpaidRows.length > 0 ? (unpaidRows[0].currency || null) : null,
  };

  const hasBlockers =
    openDossiers.length > 0 ||
    openLawsuits.length > 0 ||
    pendingTasks.length > 0 ||
    openSessions.length > 0 ||
    activeMissions.length > 0 ||
    unpaidReceivables.count > 0;

  if (!hasBlockers) {
    return null;
  }

  const facts = {
    openDossiers,
    openLawsuits,
    pendingTasks,
    openSessions,
    activeMissions,
    unpaidReceivables,
  };

  return {
    code: "CLIENT_HAS_OPEN_DEPENDENCIES",
    userFacingFactText: "This client still has open dependencies that must be resolved before inactivation.",
    facts,
  };
}

// ─── Parent Closed Check (for child entity updates) ────────────────────────

function _checkParentNotClosed(entityType, entityId, payload) {
  const blockers = [];

  // Only check on update operations touching child entities
  const childTypes = new Set(["task", "session", "mission", "personal_task"]);
  if (!childTypes.has(entityType)) return blockers;

  // Get the entity's current parent references
  const tableMap = {
    task: "tasks",
    session: "sessions",
    mission: "missions",
    personal_task: "personal_tasks",
  };

  const table = tableMap[entityType];
  if (!table) return blockers;

  const row = _safeGet(`SELECT dossier_id, lawsuit_id FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [entityId]);
  if (!row) return blockers;

  if (row.dossier_id) {
    const dossier = _safeGet("SELECT id, status FROM dossiers WHERE id = ? AND deleted_at IS NULL", [row.dossier_id]);
    if (dossier && _isClosed(dossier.status)) {
      blockers.push({
        code: "PARENT_DOSSIER_CLOSED",
        userFacingFactText: `The parent dossier is closed. It must be reopened before this ${entityType} can be updated.`,
        facts: { parentId: row.dossier_id },
      });
    }
  }

  if (row.lawsuit_id) {
    const lawsuit = _safeGet("SELECT id, status FROM lawsuits WHERE id = ? AND deleted_at IS NULL", [row.lawsuit_id]);
    if (lawsuit && _isClosed(lawsuit.status)) {
      blockers.push({
        code: "PARENT_LAWSUIT_CLOSED",
        userFacingFactText: `The parent lawsuit is closed. It must be reopened before this ${entityType} can be updated.`,
        facts: { parentId: row.lawsuit_id },
      });
    }
  }

  return blockers;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Evaluate whether a mutation is allowed under domain constraints.
 *
 * @param {Object} params
 * @param {string} params.entityType
 * @param {string} params.operation - "create" | "update" | "delete"
 * @param {number|string|null} params.entityId
 * @param {Object} params.payload - Proposed changes
 * @param {Object|null} params.existing - Current entity state
 * @param {string} [params.mode]
 * @returns {{ allowed: boolean, requiresExtraConfirmation?: boolean, impactSummary?: any[], warnings?: any[], facts?: any, blockers?: any[] }}
 */
function evaluateMutationConstraints({
  entityType,
  operation,
  entityId,
  payload,
  existing,
  mode,
} = {}) {
  const type = _s(entityType);
  const op = _s(operation);
  const numericId = entityId != null && /^\d+$/.test(String(entityId)) ? parseInt(String(entityId), 10) : null;
  const payloadStatus = payload?.status;

  const blockers = [];

  try {
    // ── CREATE: generally allowed ──────────────────────────────────────────
    if (op === "create") {
      return { allowed: true, requiresExtraConfirmation: false, impactSummary: [], warnings: [], facts: null, blockers: [] };
    }

    // ── UPDATE checks ──────────────────────────────────────────────────────

    if (op === "update" && numericId != null) {
      // Lawsuit closure check
      if (type === "lawsuit" && payloadStatus && _isClosed(payloadStatus) && !_isClosed(existing?.status)) {
        const blocker = _checkLawsuitCanClose(numericId);
        if (blocker) blockers.push(blocker);
      }

      // Dossier closure check
      if (type === "dossier" && payloadStatus && _isClosed(payloadStatus) && !_isClosed(existing?.status)) {
        const blocker = _checkDossierCanClose(numericId);
        if (blocker) blockers.push(blocker);
      }

      // Client inactivation check
      if (type === "client" && payloadStatus && _isInactiveLike(payloadStatus)) {
        const blocker = _checkClientCanDeactivate(numericId);
        if (blocker) blockers.push(blocker);
      }

      // Child entity update with closed parent
      if (["task", "session", "mission", "personal_task"].includes(type)) {
        const parentBlockers = _checkParentNotClosed(type, numericId, payload);
        blockers.push(...parentBlockers);
      }
    }

    // ── DELETE: domain guard only if we have blockers logic ───────────────
    if (op === "delete" && numericId != null) {
      // Delete of dossier: treat like closure
      if (type === "dossier") {
        const blocker = _checkDossierCanClose(numericId);
        if (blocker) blockers.push(blocker);
      }
      // Delete of lawsuit: treat like closure
      if (type === "lawsuit") {
        const blocker = _checkLawsuitCanClose(numericId);
        if (blocker) blockers.push(blocker);
      }
    }
  } catch (_) {
    // Domain check errors must not block the system — allow with warning
    return {
      allowed: true,
      requiresExtraConfirmation: false,
      impactSummary: [],
      warnings: [{ code: "CONSTRAINT_CHECK_ERROR", message: "Domain constraint check encountered an error." }],
      facts: null,
      blockers: [],
    };
  }

  if (blockers.length === 0) {
    return { allowed: true, requiresExtraConfirmation: false, impactSummary: [], warnings: [], facts: null, blockers: [] };
  }

  // Collect facts from first blocker for top-level access (used by constraint resolver)
  const primaryFacts = blockers[0]?.facts || null;

  return {
    allowed: false,
    requiresExtraConfirmation: true,
    impactSummary: [],
    warnings: [],
    facts: primaryFacts,
    blockers,
  };
}

module.exports = { evaluateMutationConstraints };
