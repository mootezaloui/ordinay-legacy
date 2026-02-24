"use strict";

const db = require("../../db/connection");

function _normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function _isClosedStatus(value) {
  const token = _normalizeToken(value);
  return new Set([
    "closed",
    "archive",
    "archived",
    "ferme",
    "cloture",
    "cloturee",
    "complete",
    "completed",
  ]).has(token);
}

function _isTerminalTaskStatus(value) {
  return new Set([
    "done",
    "completed",
    "terminee",
    "cancelled",
    "canceled",
    "annulee",
    "void",
    "closed",
  ]).has(_normalizeToken(value));
}

function _isTerminalSessionStatus(value) {
  return new Set(["completed", "cancelled", "canceled", "closed"]).has(
    _normalizeToken(value),
  );
}

function _isTerminalMissionStatus(value) {
  return new Set(["completed", "cancelled", "canceled", "closed"]).has(
    _normalizeToken(value),
  );
}

function _isClientInactiveStatus(value) {
  const token = _normalizeToken(value);
  return (
    new Set(["inactive", "in_active", "not_active", "former_client"]).has(token) ||
    String(value || "") === "inActive"
  );
}

function _mkBlocker({ code, severity = "high", facts = {}, text }) {
  return {
    code,
    severity,
    facts,
    userFacingFactText: String(text || "").trim(),
  };
}

function _mkWarning({ code, severity = "medium", facts = {}, text }) {
  return {
    code,
    severity,
    facts,
    userFacingFactText: String(text || "").trim(),
  };
}

function _getEntityStatus(table, id) {
  if (!id) return null;
  return (
    db
      .prepare(`SELECT id, status FROM ${table} WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(id)) || null
  );
}

function _getClientById(id) {
  if (!id) return null;
  return (
    db
      .prepare(`SELECT id, status, name FROM clients WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(id)) || null
  );
}

function _getDossierById(id) {
  if (!id) return null;
  return (
    db
      .prepare(`SELECT id, client_id, status, title, reference FROM dossiers WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(id)) || null
  );
}

function _getLawsuitById(id) {
  if (!id) return null;
  return (
    db
      .prepare(`SELECT id, dossier_id, status, title, reference, lawsuit_number FROM lawsuits WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(id)) || null
  );
}

function _getOfficerById(id) {
  if (!id) return null;
  return (
    db
      .prepare(`SELECT id, status, name FROM officers WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(id)) || null
  );
}

function _getTaskById(id) {
  if (!id) return null;
  return (
    db
      .prepare(`SELECT id, dossier_id, lawsuit_id, status, title FROM tasks WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(id)) || null
  );
}

function _getMissionById(id) {
  if (!id) return null;
  return (
    db
      .prepare(`SELECT id, dossier_id, lawsuit_id, officer_id, status, title FROM missions WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(id)) || null
  );
}

function _resolveClientStatusForChain({ clientId = null, dossierId = null, lawsuitId = null }) {
  let resolvedDossier = dossierId ? _getDossierById(dossierId) : null;
  let resolvedLawsuit = lawsuitId ? _getLawsuitById(lawsuitId) : null;

  if (!resolvedDossier && resolvedLawsuit?.dossier_id) {
    resolvedDossier = _getDossierById(resolvedLawsuit.dossier_id);
  }

  const finalClientId =
    clientId != null ? Number(clientId) : resolvedDossier?.client_id != null ? Number(resolvedDossier.client_id) : null;
  const client = finalClientId ? _getClientById(finalClientId) : null;

  return { client, dossier: resolvedDossier, lawsuit: resolvedLawsuit };
}

function _mkEntityNotFoundBlocker(entityType, id) {
  return _mkBlocker({
    code: `${String(entityType || "entity").toUpperCase()}_NOT_FOUND`,
    severity: "high",
    facts: { entityType, id: Number(id) },
    text: `The linked ${String(entityType || "entity").replace(/_/g, " ")} record was not found.`,
  });
}

function _mkRelationshipBlocker(code, text, facts = {}) {
  return _mkBlocker({
    code,
    severity: "high",
    facts,
    text,
  });
}

function _evaluateInactiveClientAncestor({ clientId = null, dossierId = null, lawsuitId = null, childEntityType, operation }) {
  const { client } = _resolveClientStatusForChain({ clientId, dossierId, lawsuitId });
  if (!client || !_isClientInactiveStatus(client.status)) {
    return [];
  }
  return [
    _mkBlocker({
      code: "ANCESTOR_CLIENT_INACTIVE",
      facts: {
        clientId: Number(client.id),
        clientStatus: client.status,
        childEntityType,
        operation,
      },
      text: `The linked client is inactive, so I can’t ${operation === "create" ? "create" : "update"} this ${childEntityType.replace(/_/g, " ")}.`,
    }),
  ];
}

function _evaluateOfficerAvailabilityForMission({ payload, existing }) {
  const officerId =
    payload?.officer_id !== undefined ? payload.officer_id : existing?.officer_id;
  if (!officerId) return [];
  const officer = _getOfficerById(officerId);
  if (!officer) return [_mkEntityNotFoundBlocker("officer", officerId)];
  if (String(officer.status || "").toLowerCase() !== "active") {
    return [
      _mkBlocker({
        code: "MISSION_OFFICER_INACTIVE",
        facts: { officerId: Number(officer.id), officerStatus: officer.status },
        text: "The selected bailiff/officer is inactive, so this mission cannot be assigned.",
      }),
    ];
  }
  return [];
}

function _evaluateRelationalIntegrity({ entityType, operation, payload, existing }) {
  if (!["create", "update"].includes(operation)) return [];

  const blockers = [];
  const current = { ...(existing || {}), ...(payload || {}) };

  if (entityType === "dossier") {
    const clientId = current.client_id;
    if (clientId != null) {
      const client = _getClientById(clientId);
      if (!client) blockers.push(_mkEntityNotFoundBlocker("client", clientId));
    }
    return blockers;
  }

  if (entityType === "lawsuit") {
    const dossierId = current.dossier_id;
    if (dossierId != null) {
      const dossier = _getDossierById(dossierId);
      if (!dossier) blockers.push(_mkEntityNotFoundBlocker("dossier", dossierId));
    }
    return blockers;
  }

  if (["task", "session", "mission"].includes(entityType)) {
    const dossierId = current.dossier_id;
    const lawsuitId = current.lawsuit_id;
    if (dossierId != null) {
      const dossier = _getDossierById(dossierId);
      if (!dossier) blockers.push(_mkEntityNotFoundBlocker("dossier", dossierId));
    }
    if (lawsuitId != null) {
      const lawsuit = _getLawsuitById(lawsuitId);
      if (!lawsuit) blockers.push(_mkEntityNotFoundBlocker("lawsuit", lawsuitId));
    }
    if (entityType === "mission") {
      blockers.push(..._evaluateOfficerAvailabilityForMission({ payload, existing }));
    }
    return blockers;
  }

  if (entityType === "financial_entry") {
    const clientId = current.client_id;
    const dossierId = current.dossier_id;
    const lawsuitId = current.lawsuit_id;
    const missionId = current.mission_id;
    const taskId = current.task_id;

    const client = clientId != null ? _getClientById(clientId) : null;
    const dossier = dossierId != null ? _getDossierById(dossierId) : null;
    const lawsuit = lawsuitId != null ? _getLawsuitById(lawsuitId) : null;
    const mission = missionId != null ? _getMissionById(missionId) : null;
    const task = taskId != null ? _getTaskById(taskId) : null;

    if (clientId != null && !client) blockers.push(_mkEntityNotFoundBlocker("client", clientId));
    if (dossierId != null && !dossier) blockers.push(_mkEntityNotFoundBlocker("dossier", dossierId));
    if (lawsuitId != null && !lawsuit) blockers.push(_mkEntityNotFoundBlocker("lawsuit", lawsuitId));
    if (missionId != null && !mission) blockers.push(_mkEntityNotFoundBlocker("mission", missionId));
    if (taskId != null && !task) blockers.push(_mkEntityNotFoundBlocker("task", taskId));

    if (client && dossier && Number(dossier.client_id) !== Number(client.id)) {
      blockers.push(
        _mkRelationshipBlocker(
          "DOSSIER_CLIENT_MISMATCH",
          "The selected dossier does not belong to the selected client.",
          { clientId: Number(client.id), dossierId: Number(dossier.id), dossierClientId: Number(dossier.client_id) },
        ),
      );
    }
    if (lawsuit && dossier && Number(lawsuit.dossier_id) !== Number(dossier.id)) {
      blockers.push(
        _mkRelationshipBlocker(
          "LAWSUIT_DOSSIER_MISMATCH",
          "The selected lawsuit does not belong to the selected dossier.",
          { lawsuitId: Number(lawsuit.id), lawsuitDossierId: Number(lawsuit.dossier_id), dossierId: Number(dossier.id) },
        ),
      );
    }
    if (mission && dossierId != null && mission.dossier_id != null && Number(mission.dossier_id) !== Number(dossierId)) {
      blockers.push(_mkRelationshipBlocker("MISSION_DOSSIER_MISMATCH", "The selected mission does not belong to the selected dossier."));
    }
    if (mission && lawsuitId != null && mission.lawsuit_id != null && Number(mission.lawsuit_id) !== Number(lawsuitId)) {
      blockers.push(_mkRelationshipBlocker("MISSION_LAWSUIT_MISMATCH", "The selected mission does not belong to the selected lawsuit."));
    }
    if (task && dossierId != null && task.dossier_id != null && Number(task.dossier_id) !== Number(dossierId)) {
      blockers.push(_mkRelationshipBlocker("TASK_DOSSIER_MISMATCH", "The selected task does not belong to the selected dossier."));
    }
    if (task && lawsuitId != null && task.lawsuit_id != null && Number(task.lawsuit_id) !== Number(lawsuitId)) {
      blockers.push(_mkRelationshipBlocker("TASK_LAWSUIT_MISMATCH", "The selected task does not belong to the selected lawsuit."));
    }
    return blockers;
  }

  if (entityType === "officer" && operation === "update" && payload && Object.prototype.hasOwnProperty.call(payload, "status")) {
    const nextStatus = String(payload.status || "");
    if (_isClientInactiveStatus(nextStatus) || ["inactive", "disabled", "suspended"].includes(_normalizeToken(nextStatus))) {
      const officerId = Number(existing?.id);
      if (officerId) {
        const activeMissions = db
          .prepare(`SELECT id, title, status FROM missions WHERE officer_id = ? AND deleted_at IS NULL`)
          .all(officerId)
          .filter((m) => !_isTerminalMissionStatus(m.status));
        if (activeMissions.length > 0) {
          blockers.push(
            _mkBlocker({
              code: "OFFICER_HAS_ACTIVE_MISSIONS",
              facts: { officerId, count: activeMissions.length, items: activeMissions.slice(0, 10) },
              text: "This bailiff/officer still has active missions.",
            }),
          );
        }
      }
    }
    return blockers;
  }

  return blockers;
}

function _queryClientDependencyFacts(clientId) {
  const numericClientId = Number(clientId);
  const dossiers = db
    .prepare(
      `SELECT id, reference, title, status
       FROM dossiers
       WHERE client_id = ? AND deleted_at IS NULL`,
    )
    .all(numericClientId);
  const openDossiers = dossiers.filter((d) => !_isClosedStatus(d.status));

  const lawsuits = db
    .prepare(
      `SELECT l.id, l.lawsuit_number, l.reference, l.title, l.status, l.dossier_id
       FROM lawsuits l
       JOIN dossiers d ON d.id = l.dossier_id
       WHERE d.client_id = ? AND d.deleted_at IS NULL AND l.deleted_at IS NULL`,
    )
    .all(numericClientId);
  const openLawsuits = lawsuits.filter((l) => !_isClosedStatus(l.status));

  const lawsuitIds = lawsuits.map((l) => l.id);
  const dossierIds = dossiers.map((d) => d.id);

  const tasks = db
    .prepare(
      `SELECT id, title, status, dossier_id, lawsuit_id
       FROM tasks
       WHERE deleted_at IS NULL AND (
         dossier_id IN (SELECT id FROM dossiers WHERE client_id = ? AND deleted_at IS NULL)
         OR lawsuit_id IN (
           SELECT l.id FROM lawsuits l
           JOIN dossiers d ON d.id = l.dossier_id
           WHERE d.client_id = ? AND d.deleted_at IS NULL AND l.deleted_at IS NULL
         )
       )`,
    )
    .all(numericClientId, numericClientId);
  const pendingTasks = tasks.filter((t) => !_isTerminalTaskStatus(t.status));

  const sessions = db
    .prepare(
      `SELECT id, title, session_type, status, scheduled_at, dossier_id, lawsuit_id
       FROM sessions
       WHERE deleted_at IS NULL AND (
         dossier_id IN (SELECT id FROM dossiers WHERE client_id = ? AND deleted_at IS NULL)
         OR lawsuit_id IN (
           SELECT l.id FROM lawsuits l
           JOIN dossiers d ON d.id = l.dossier_id
           WHERE d.client_id = ? AND d.deleted_at IS NULL AND l.deleted_at IS NULL
         )
       )`,
    )
    .all(numericClientId, numericClientId);
  const openSessions = sessions.filter((s) => !_isTerminalSessionStatus(s.status));

  const missions = db
    .prepare(
      `SELECT id, reference, title, status, dossier_id, lawsuit_id
       FROM missions
       WHERE deleted_at IS NULL AND (
         dossier_id IN (SELECT id FROM dossiers WHERE client_id = ? AND deleted_at IS NULL)
         OR lawsuit_id IN (
           SELECT l.id FROM lawsuits l
           JOIN dossiers d ON d.id = l.dossier_id
           WHERE d.client_id = ? AND d.deleted_at IS NULL AND l.deleted_at IS NULL
         )
       )`,
    )
    .all(numericClientId, numericClientId);
  const activeMissions = missions.filter((m) => !_isTerminalMissionStatus(m.status));

  const receivables = db
    .prepare(
      `SELECT id, amount, currency, status, due_date, paid_at, title, description
       FROM financial_entries
       WHERE client_id = ?
         AND deleted_at IS NULL
         AND (direction = 'receivable' OR direction IS NULL)
         AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'void')
         AND paid_at IS NULL`,
    )
    .all(numericClientId);
  const unpaidTotal = receivables.reduce(
    (sum, r) => sum + (Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0),
    0,
  );

  return {
    clientId: numericClientId,
    dossiers,
    openDossiers,
    lawsuits,
    openLawsuits,
    tasks,
    pendingTasks,
    sessions,
    openSessions,
    missions,
    activeMissions,
    receivables,
    unpaidReceivables: {
      count: receivables.length,
      totalAmount: unpaidTotal,
      currency: receivables[0]?.currency || null,
      items: receivables,
    },
    ids: {
      dossierIds,
      lawsuitIds,
    },
  };
}

function _isPaidFinancialEntry(existing, payload = {}) {
  const status = String(existing?.status || "").toLowerCase();
  const nextStatus = payload?.status == null ? null : String(payload.status || "").toLowerCase();
  const paidStatuses = new Set(["paid", "payee", "payée", "paye", "payé"]);
  const wasPaid = paidStatuses.has(status) || Boolean(existing?.paid_at);
  const remainsPaid = nextStatus == null || paidStatuses.has(nextStatus);
  return { wasPaid, remainsPaid };
}

function _buildRelationalImpactWarnings({ entityType, operation, payload, existing }) {
  if (operation !== "update" || !payload || !existing) {
    return { warnings: [], requiresExtraConfirmation: false, impactSummary: [] };
  }

  const warnings = [];
  const impactSummary = [];

  const addImpact = (code, text, lines = [], facts = {}) => {
    warnings.push(_mkWarning({ code, severity: "high", facts, text }));
    for (const line of lines) impactSummary.push(String(line));
  };

  if (entityType === "dossier" && Object.prototype.hasOwnProperty.call(payload, "client_id")) {
    const oldClientId = existing.client_id == null ? null : Number(existing.client_id);
    const newClientId = payload.client_id == null ? null : Number(payload.client_id);
    if (oldClientId !== newClientId) {
      addImpact(
        "DOSSIER_CLIENT_REASSIGNMENT_CONFIRMATION",
        "Reassigning this dossier to another client affects linked history and follow-up context.",
        [
          "This dossier will be moved to another client.",
          "Linked work history and related items may need review after the move.",
        ],
        { fromClientId: oldClientId, toClientId: newClientId },
      );
    }
  }

  if (entityType === "lawsuit" && Object.prototype.hasOwnProperty.call(payload, "dossier_id")) {
    const oldDossierId = existing.dossier_id == null ? null : Number(existing.dossier_id);
    const newDossierId = payload.dossier_id == null ? null : Number(payload.dossier_id);
    if (oldDossierId !== newDossierId) {
      addImpact(
        "LAWSUIT_DOSSIER_REASSIGNMENT_CONFIRMATION",
        "Moving this lawsuit to another dossier affects linked tasks, hearings, and reporting context.",
        [
          "This lawsuit will be moved to another dossier.",
          "Linked tasks, hearings, and reporting context may be affected.",
        ],
        { fromDossierId: oldDossierId, toDossierId: newDossierId },
      );
    }
  }

  if (entityType === "task" || entityType === "session" || entityType === "mission") {
    const changedParentRefs = [];
    for (const key of ["dossier_id", "lawsuit_id"]) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      const before = existing[key] == null ? null : Number(existing[key]);
      const after = payload[key] == null ? null : Number(payload[key]);
      if (before !== after) changedParentRefs.push({ key, before, after });
    }
    if (entityType === "mission" && Object.prototype.hasOwnProperty.call(payload, "officer_id")) {
      const before = existing.officer_id == null ? null : Number(existing.officer_id);
      const after = payload.officer_id == null ? null : Number(payload.officer_id);
      if (before !== after) {
        addImpact(
          "MISSION_OFFICER_REASSIGNMENT_CONFIRMATION",
          "Reassigning this mission to another officer requires confirmation.",
          [
            "This mission will be reassigned to another officer.",
            "Schedules and responsibility tracking may be affected.",
          ],
          { fromOfficerId: before, toOfficerId: after },
        );
      }
    }
    if (changedParentRefs.length > 0) {
      addImpact(
        `${entityType.toUpperCase()}_PARENT_REASSIGNMENT_CONFIRMATION`,
        `Moving this ${entityType.replace(/_/g, " ")} to another parent requires confirmation.`,
        [
          `This ${entityType.replace(/_/g, " ")} will be moved to a different parent record.`,
          "Related reporting and timelines may need review after the move.",
        ],
        { changes: changedParentRefs },
      );
    }
  }

  if (entityType === "financial_entry") {
    const { wasPaid, remainsPaid } = _isPaidFinancialEntry(existing, payload);
    if (wasPaid) {
      const changedKeys = Object.keys(payload || {});
      if (changedKeys.length > 0) {
        addImpact(
          "FINANCIAL_ENTRY_PAID_EDIT_CONFIRMATION",
          "Editing a paid financial entry requires confirmation.",
          [
            "This entry is already marked as paid.",
            "Changing it may affect balances, reporting, and audit review.",
          ],
          { changedFields: changedKeys, remainsPaid },
        );
      }
    }

    const parentChanges = [];
    for (const key of ["client_id", "dossier_id", "lawsuit_id", "mission_id"]) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      const before = existing[key] == null ? null : Number(existing[key]);
      const after = payload[key] == null ? null : Number(payload[key]);
      if (before !== after) parentChanges.push({ key, before, after });
    }
    if (parentChanges.length > 0) {
      addImpact(
        "FINANCIAL_ENTRY_RELINK_CONFIRMATION",
        "Moving this financial entry to another record requires confirmation.",
        [
          "This financial entry will be relinked to a different record.",
          "Financial reporting context may change after this update.",
        ],
        { changes: parentChanges },
      );
    }
  }

  return {
    warnings,
    requiresExtraConfirmation: warnings.length > 0,
    impactSummary,
  };
}

function _evaluateClientInactive({ entityId, payload, existing }) {
  const blockers = [];
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, "status")) {
    return { allowed: true, blockers, warnings: [], facts: null };
  }
  if (!_isClientInactiveStatus(payload.status)) {
    return { allowed: true, blockers, warnings: [], facts: null };
  }
  if (
    existing &&
    (_normalizeToken(existing.status) === _normalizeToken(payload.status) ||
      existing.status === payload.status)
  ) {
    return { allowed: true, blockers, warnings: [], facts: null };
  }

  const facts = _queryClientDependencyFacts(entityId);

  if (facts.openDossiers.length > 0) {
    blockers.push(
      _mkBlocker({
        code: "CLIENT_HAS_OPEN_DOSSIERS",
        facts: { count: facts.openDossiers.length, items: facts.openDossiers.slice(0, 5) },
        text: `${facts.openDossiers.length} open dossier${facts.openDossiers.length > 1 ? "s are" : " is"} still linked to this client.`,
      }),
    );
  }
  if (facts.openLawsuits.length > 0) {
    blockers.push(
      _mkBlocker({
        code: "CLIENT_HAS_OPEN_LAWSUITS",
        facts: { count: facts.openLawsuits.length, items: facts.openLawsuits.slice(0, 5) },
        text: `${facts.openLawsuits.length} open lawsuit${facts.openLawsuits.length > 1 ? "s are" : " is"} still linked to this client.`,
      }),
    );
  }
  if (facts.pendingTasks.length > 0) {
    blockers.push(
      _mkBlocker({
        code: "CLIENT_HAS_PENDING_TASKS",
        facts: { count: facts.pendingTasks.length, items: facts.pendingTasks.slice(0, 5) },
        text: `${facts.pendingTasks.length} pending task${facts.pendingTasks.length > 1 ? "s are" : " is"} still open for this client.`,
      }),
    );
  }
  if (facts.openSessions.length > 0) {
    blockers.push(
      _mkBlocker({
        code: "CLIENT_HAS_OPEN_SESSIONS",
        facts: { count: facts.openSessions.length, items: facts.openSessions.slice(0, 5) },
        text: `${facts.openSessions.length} open hearing${facts.openSessions.length > 1 ? "s are" : " is"} still linked to this client.`,
      }),
    );
  }
  if (facts.activeMissions.length > 0) {
    blockers.push(
      _mkBlocker({
        code: "CLIENT_HAS_ACTIVE_MISSIONS",
        facts: { count: facts.activeMissions.length, items: facts.activeMissions.slice(0, 5) },
        text: `${facts.activeMissions.length} active bailiff mission${facts.activeMissions.length > 1 ? "s are" : " is"} still linked to this client.`,
      }),
    );
  }
  if (facts.unpaidReceivables.count > 0) {
    blockers.push(
      _mkBlocker({
        code: "CLIENT_HAS_UNPAID_RECEIVABLES",
        severity: "high",
        facts: facts.unpaidReceivables,
        text: `Unpaid receivables are still open${facts.unpaidReceivables.totalAmount ? ` (${facts.unpaidReceivables.totalAmount} ${facts.unpaidReceivables.currency || ""}`.trim() + ")" : ""}.`,
      }),
    );
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings: [],
    requiresExtraConfirmation: false,
    impactSummary: [],
    facts,
    remediation: { possible: blockers.length > 0, kind: "workflow", requiresClarification: false },
  };
}

function _evaluateParentClosed({ parentType, parentId, childEntityType, operation }) {
  if (!parentId) return { allowed: true, blockers: [], warnings: [] };
  const table = parentType === "dossier" ? "dossiers" : "lawsuits";
  const parent = _getEntityStatus(table, parentId);
  if (!parent || !_isClosedStatus(parent.status)) return { allowed: true, blockers: [], warnings: [] };
  const verb = operation === "create" ? "create" : "update";
  return {
    allowed: false,
    blockers: [
      _mkBlocker({
        code: parentType === "dossier" ? "PARENT_DOSSIER_CLOSED" : "PARENT_LAWSUIT_CLOSED",
        facts: { parentType, parentId: Number(parentId), parentStatus: parent.status },
        text: `The linked ${parentType} is closed, so I can’t ${verb} this ${childEntityType.replace(/_/g, " ")} yet.`,
      }),
    ],
    warnings: [],
    requiresExtraConfirmation: false,
    impactSummary: [],
    remediation: { possible: false, kind: "none", requiresClarification: false },
  };
}

function _evaluateClosedParentRulesForChild({ entityType, operation, payload, existing }) {
  if (!["task", "session", "mission", "financial_entry"].includes(entityType)) {
    return { allowed: true, blockers: [], warnings: [] };
  }
  if (!["create", "update"].includes(operation)) {
    return { allowed: true, blockers: [], warnings: [] };
  }
  let dossierId =
    payload?.dossier_id !== undefined ? payload.dossier_id : existing?.dossier_id;
  let lawsuitId =
    payload?.lawsuit_id !== undefined ? payload.lawsuit_id : existing?.lawsuit_id;

  if (entityType === "financial_entry") {
    const taskId = payload?.task_id !== undefined ? payload.task_id : existing?.task_id;
    const missionId = payload?.mission_id !== undefined ? payload.mission_id : existing?.mission_id;
    const task = !dossierId && !lawsuitId && taskId ? _getTaskById(taskId) : null;
    const mission = !dossierId && !lawsuitId && missionId ? _getMissionById(missionId) : null;
    if (!dossierId) dossierId = task?.dossier_id ?? mission?.dossier_id ?? dossierId;
    if (!lawsuitId) lawsuitId = task?.lawsuit_id ?? mission?.lawsuit_id ?? lawsuitId;
  }

  const blockers = [];
  if (dossierId) {
    blockers.push(..._evaluateParentClosed({
      parentType: "dossier",
      parentId: dossierId,
      childEntityType: entityType,
      operation,
    }).blockers);
  }
  if (lawsuitId) {
    blockers.push(..._evaluateParentClosed({
      parentType: "lawsuit",
      parentId: lawsuitId,
      childEntityType: entityType,
      operation,
    }).blockers);
  }
  blockers.push(
    ..._evaluateInactiveClientAncestor({
      dossierId,
      lawsuitId,
      childEntityType: entityType,
      operation,
    }),
  );
  blockers.push(..._evaluateRelationalIntegrity({ entityType, operation, payload, existing }));
  return {
    allowed: blockers.length === 0,
    blockers,
    warnings: [],
    requiresExtraConfirmation: false,
    impactSummary: [],
    remediation: { possible: false, kind: "none", requiresClarification: false },
  };
}

function _evaluateLawsuitRules({ operation, entityId, payload, existing }) {
  const blockers = [];
  const dossierId =
    payload?.dossier_id !== undefined ? payload.dossier_id : existing?.dossier_id;

  blockers.push(..._evaluateParentClosed({
    parentType: "dossier",
    parentId: dossierId,
    childEntityType: "lawsuit",
    operation,
  }).blockers);
  blockers.push(
    ..._evaluateInactiveClientAncestor({
      dossierId,
      childEntityType: "lawsuit",
      operation,
    }),
  );
  blockers.push(..._evaluateRelationalIntegrity({ entityType: "lawsuit", operation, payload, existing }));

  if (
    operation === "update" &&
    payload &&
    Object.prototype.hasOwnProperty.call(payload, "status") &&
    _isClosedStatus(payload.status) &&
    !_isClosedStatus(existing?.status)
  ) {
    const numericId = Number(entityId);
    const tasks = db
      .prepare(`SELECT id, title, status FROM tasks WHERE lawsuit_id = ? AND deleted_at IS NULL`)
      .all(numericId);
    const sessions = db
      .prepare(`SELECT id, title, status FROM sessions WHERE lawsuit_id = ? AND deleted_at IS NULL`)
      .all(numericId);
    const missions = db
      .prepare(`SELECT id, title, status FROM missions WHERE lawsuit_id = ? AND deleted_at IS NULL`)
      .all(numericId);
    const openTasks = tasks.filter((r) => !_isTerminalTaskStatus(r.status));
    const openSessions = sessions.filter((r) => !_isTerminalSessionStatus(r.status));
    const openMissions = missions.filter((r) => !_isTerminalMissionStatus(r.status));
    if (openTasks.length + openSessions.length + openMissions.length > 0) {
      blockers.push(
        _mkBlocker({
          code: "LAWSUIT_HAS_OPEN_CHILDREN",
          facts: {
            openTasks: openTasks.slice(0, 20),
            openSessions: openSessions.slice(0, 20),
            openMissions: openMissions.slice(0, 20),
            counts: {
              openTasks: openTasks.length,
              openSessions: openSessions.length,
              openMissions: openMissions.length,
            },
          },
          text: "This lawsuit still has open tasks, hearings, or missions.",
        }),
      );
    }
  }

  const relationalWarnings = _buildRelationalImpactWarnings({
    entityType: "lawsuit",
    operation,
    payload,
    existing,
  });

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings: relationalWarnings.warnings,
    requiresExtraConfirmation: relationalWarnings.requiresExtraConfirmation,
    impactSummary: relationalWarnings.impactSummary,
    remediation: { possible: blockers.length > 0, kind: "workflow", requiresClarification: false },
  };
}

function _evaluateDossierRules({ operation, entityId, payload, existing }) {
  const blockers = [];
  blockers.push(
    ..._evaluateInactiveClientAncestor({
      clientId: payload?.client_id !== undefined ? payload.client_id : existing?.client_id,
      childEntityType: "dossier",
      operation,
    }),
  );
  blockers.push(..._evaluateRelationalIntegrity({ entityType: "dossier", operation, payload, existing }));
  if (
    operation === "update" &&
    payload &&
    Object.prototype.hasOwnProperty.call(payload, "status") &&
    _isClosedStatus(payload.status) &&
    !_isClosedStatus(existing?.status)
  ) {
    const dossierId = Number(entityId);
    const lawsuits = db
      .prepare(`SELECT id, title, lawsuit_number, status FROM lawsuits WHERE dossier_id = ? AND deleted_at IS NULL`)
      .all(dossierId);
    const openLawsuits = lawsuits.filter((r) => !_isClosedStatus(r.status));
    const openTasks = db
      .prepare(
        `SELECT id, title, status FROM tasks
         WHERE deleted_at IS NULL AND (
           dossier_id = ?
           OR lawsuit_id IN (SELECT id FROM lawsuits WHERE dossier_id = ? AND deleted_at IS NULL)
         )`,
      )
      .all(dossierId, dossierId)
      .filter((r) => !_isTerminalTaskStatus(r.status));
    const openSessions = db
      .prepare(
        `SELECT id, title, status FROM sessions
         WHERE deleted_at IS NULL AND (
           dossier_id = ?
           OR lawsuit_id IN (SELECT id FROM lawsuits WHERE dossier_id = ? AND deleted_at IS NULL)
         )`,
      )
      .all(dossierId, dossierId)
      .filter((r) => !_isTerminalSessionStatus(r.status));
    const openMissions = db
      .prepare(
        `SELECT id, title, status FROM missions
         WHERE deleted_at IS NULL AND (
           dossier_id = ?
           OR lawsuit_id IN (SELECT id FROM lawsuits WHERE dossier_id = ? AND deleted_at IS NULL)
         )`,
      )
      .all(dossierId, dossierId)
      .filter((r) => !_isTerminalMissionStatus(r.status));

    if (openLawsuits.length + openTasks.length + openSessions.length + openMissions.length > 0) {
      blockers.push(
        _mkBlocker({
          code: "DOSSIER_HAS_OPEN_CHILDREN",
          facts: {
            openLawsuits: openLawsuits.slice(0, 20),
            openTasks: openTasks.slice(0, 20),
            openSessions: openSessions.slice(0, 20),
            openMissions: openMissions.slice(0, 20),
            counts: {
              openLawsuits: openLawsuits.length,
              openTasks: openTasks.length,
              openSessions: openSessions.length,
              openMissions: openMissions.length,
            },
          },
          text: "This dossier still has open lawsuits, tasks, hearings, or missions.",
        }),
      );
    }
  }

  const relationalWarnings = _buildRelationalImpactWarnings({
    entityType: "dossier",
    operation,
    payload,
    existing,
  });

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings: relationalWarnings.warnings,
    requiresExtraConfirmation: relationalWarnings.requiresExtraConfirmation,
    impactSummary: relationalWarnings.impactSummary,
    remediation: { possible: blockers.length > 0, kind: "workflow", requiresClarification: false },
  };
}

function _evaluateOfficerRules({ operation, payload, existing }) {
  const blockers = _evaluateRelationalIntegrity({
    entityType: "officer",
    operation,
    payload,
    existing,
  });
  return {
    allowed: blockers.length === 0,
    blockers,
    warnings: [],
    requiresExtraConfirmation: false,
    impactSummary: [],
    remediation: { possible: blockers.length > 0, kind: "workflow", requiresClarification: false },
  };
}

function evaluateMutationConstraints({
  entityType,
  operation,
  entityId = null,
  payload = {},
  existing = null,
  mode = "proposal_preflight",
} = {}) {
  const normalizedEntityType = String(entityType || "").trim().toLowerCase();
  const normalizedOperation = String(operation || "").trim().toLowerCase();
  if (!normalizedEntityType || !normalizedOperation) {
    return {
      allowed: true,
      blockers: [],
      warnings: [],
      remediation: { possible: false, kind: "none", requiresClarification: false },
      facts: null,
      mode,
    };
  }

  let result;
  if (normalizedEntityType === "client") {
    result = _evaluateClientInactive({
      entityId,
      payload,
      existing,
    });
  } else if (normalizedEntityType === "dossier") {
    result = _evaluateDossierRules({
      operation: normalizedOperation,
      entityId,
      payload,
      existing,
    });
  } else if (normalizedEntityType === "lawsuit") {
    result = _evaluateLawsuitRules({
      operation: normalizedOperation,
      entityId,
      payload,
      existing,
    });
  } else if (normalizedEntityType === "officer") {
    result = _evaluateOfficerRules({
      operation: normalizedOperation,
      payload,
      existing,
    });
  } else {
    result = _evaluateClosedParentRulesForChild({
      entityType: normalizedEntityType,
      operation: normalizedOperation,
      payload,
      existing,
    });
  }

  const relationalWarnings = _buildRelationalImpactWarnings({
    entityType: normalizedEntityType,
    operation: normalizedOperation,
    payload,
    existing,
  });
  const mergedWarnings = [
    ...(Array.isArray(result.warnings) ? result.warnings : []),
    ...relationalWarnings.warnings,
  ];
  const impactSummary = [
    ...(Array.isArray(result.impactSummary) ? result.impactSummary : []),
    ...relationalWarnings.impactSummary,
  ];
  const requiresExtraConfirmation =
    Boolean(result.requiresExtraConfirmation) || relationalWarnings.requiresExtraConfirmation;

  return {
    mode,
    entityType: normalizedEntityType,
    operation: normalizedOperation,
    entityId: entityId == null ? null : Number(entityId),
    allowed: Boolean(result.allowed),
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    warnings: mergedWarnings,
    requiresExtraConfirmation,
    impactSummary,
    remediation:
      result.remediation || { possible: false, kind: "none", requiresClarification: false },
    facts: result.facts || null,
  };
}

module.exports = {
  evaluateMutationConstraints,
  _internal: {
    _normalizeToken,
    _isClosedStatus,
    _isTerminalTaskStatus,
    _isTerminalSessionStatus,
    _isTerminalMissionStatus,
    _isClientInactiveStatus,
    _queryClientDependencyFacts,
    _buildRelationalImpactWarnings,
    _isPaidFinancialEntry,
  },
};
