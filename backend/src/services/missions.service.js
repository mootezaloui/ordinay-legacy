const db = require('../db/connection');
const { assert, filterPayload, buildUpdateClause, ensureXor, normalizeData } = require('./_utils');
const notesService = require('./notes.service');
const { withTx } = require('../db/withTx');
const auditMutations = require('./auditMutations.service');

const table = 'missions';
const allowedFields = [
  'reference',
  'title',
  'description',
  'mission_type',
  'status',
  'priority',
  'assign_date',
  'due_date',
  'completion_date',
  'closed_at',
  'result',
  'notes',
  'dossier_id',
  'lawsuit_id',
  'officer_id',
];

function generateReference() {
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-6);
  return `MIS-${year}-${suffix}`;
}

function list() {
  const missions = db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();

  // Attach notes for each mission so UI gets the persisted notes on initial load
  return missions.map((mission) => ({
    ...mission,
    notes: notesService.getNotesForEntity('mission', mission.id),
  }));
}

function listByDossier(dossierId) {
  if (!Number.isInteger(Number(dossierId))) {
    return [];
  }

  const missions = db
    .prepare(
      `SELECT * FROM ${table} WHERE dossier_id = @dossierId AND deleted_at IS NULL ORDER BY id ASC`,
    )
    .all({ dossierId: Number(dossierId) });

  return missions.map((mission) => ({
    ...mission,
    notes: notesService.getNotesForEntity('mission', mission.id),
  }));
}

function listByLawsuit(lawsuitId) {
  if (!Number.isInteger(Number(lawsuitId))) {
    return [];
  }

  const missions = db
    .prepare(
      `SELECT * FROM ${table} WHERE lawsuit_id = @lawsuitId AND deleted_at IS NULL ORDER BY id ASC`,
    )
    .all({ lawsuitId: Number(lawsuitId) });

  return missions.map((mission) => ({
    ...mission,
    notes: notesService.getNotesForEntity('mission', mission.id),
  }));
}

function listFiltered({
  query = null,
  status = null,
  priority = null,
  dossierId = null,
  lawsuitId = null,
  limit = 50,
} = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (Number.isInteger(Number(dossierId)) && Number(dossierId) > 0) {
    where.push("dossier_id = @dossierId");
    params.dossierId = Number(dossierId);
  }

  if (Number.isInteger(Number(lawsuitId)) && Number(lawsuitId) > 0) {
    where.push("lawsuit_id = @lawsuitId");
    params.lawsuitId = Number(lawsuitId);
  }

  if (status) {
    where.push("LOWER(COALESCE(status, '')) = @status");
    params.status = String(status).trim().toLowerCase();
  }

  if (priority) {
    where.push("LOWER(COALESCE(priority, '')) = @priority");
    params.priority = String(priority).trim().toLowerCase();
  }

  if (query) {
    where.push(
      "(LOWER(COALESCE(reference, '')) LIKE @query OR LOWER(COALESCE(title, '')) LIKE @query)",
    );
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const missions = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(due_date, assign_date, created_at) DESC, id DESC
       LIMIT @limit`,
    )
    .all(params);

  return missions.map((mission) => ({
    ...mission,
    notes: notesService.getNotesForEntity("mission", mission.id),
  }));
}

function get(id) {
  const mission = db.prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`).get({ id });
  if (!mission) return null;

  // Load notes from notes table
  const notes = notesService.getNotesForEntity('mission', id);
  mission.notes = notes;

  return mission;
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    dossier_id: null,
    lawsuit_id: null,
    description: null,
    mission_type: null,
    assign_date: null,
    due_date: null,
    completion_date: null,
    closed_at: null,
    result: null,
    notes: null,
    officer_id: null,
    ...data,
  };
  ensureXor([insertData.dossier_id, insertData.lawsuit_id], 'Provide either dossier_id or lawsuit_id (exclusive)');
  assert(insertData.title, 'title is required');
  if (!insertData.status) insertData.status = 'planned';
  if (!insertData.priority) insertData.priority = 'medium';
  // ✅ FIXED: Trust frontend's reference generation (sequential MIS-2025-001 format)
  // Only generate reference if frontend didn't provide one (backward compatibility)
  if (!insertData.reference) insertData.reference = generateReference();

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (reference, title, description, mission_type, status, priority, assign_date, due_date, completion_date, closed_at, result, notes, dossier_id, lawsuit_id, officer_id)
       VALUES (@reference, @title, @description, @mission_type, @status, @priority, @assign_date, @due_date, @completion_date, @closed_at, @result, @notes, @dossier_id, @lawsuit_id, @officer_id)`
    );
    const result = stmt.run(insertData);
    return get(result.lastInsertRowid);
  } catch (error) {
    console.error('[missions.service] Create failed:', error.message);
    console.error('[missions.service] Insert data:', JSON.stringify(insertData, null, 2));
    throw error;
  }
}

function update(id, payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  if (data.dossier_id !== undefined || data.lawsuit_id !== undefined) {
    ensureXor([data.dossier_id, data.lawsuit_id], 'Provide either dossier_id or lawsuit_id (exclusive)');
  }

  // Handle notes separately - save to notes table
  let notesArray = null;
  if (data.notes !== undefined) {
    notesArray = data.notes;
    delete data.notes; // Remove from main update
  }

  // Only update mission table if there are fields other than notes
  if (Object.keys(data).length > 0) {
    const setClause = buildUpdateClause(data);
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
    );
    const result = stmt.run({ ...data, id });
    if (result.changes === 0) return null;
  }

  // Save notes if provided
  if (notesArray !== null) {
    notesService.saveNotesForEntity('mission', id, notesArray);
  }

  return get(id);
}

/**
 * Analyzes the impact of deleting a mission
 * Returns all dependent entities that would be affected
 */
function getDeleteImpact(id) {
  const mission = get(id);
  if (!mission) return null;

  const impacts = {};

  // Check financial entries
  const financialEntries = db.prepare(
    `SELECT id, title, amount, currency, entry_type, status
     FROM financial_entries
     WHERE mission_id = @id AND deleted_at IS NULL`
  ).all({ id });
  if (financialEntries.length > 0) {
    impacts.financialEntries = financialEntries.map(e => ({
      id: e.id,
      title: e.title || `${e.entry_type} - ${e.amount} ${e.currency}`,
      amount: e.amount,
      currency: e.currency,
      type: e.entry_type,
      status: e.status
    }));
  }

  // Check documents
  const documents = db.prepare(
    `SELECT id, title, mime_type, size_bytes
     FROM documents
     WHERE mission_id = @id AND deleted_at IS NULL`
  ).all({ id });
  if (documents.length > 0) {
    impacts.documents = documents.map(d => ({
      id: d.id,
      title: d.title,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes
    }));
  }

  // Check notes (from notes table)
  const notes = notesService.getNotesForEntity('mission', id);
  if (notes.length > 0) {
    impacts.notes = notes.map(n => ({
      id: n.id,
      content: n.content.substring(0, 100) + (n.content.length > 100 ? '...' : ''),
      createdAt: n.created_at
    }));
  }

  // Check notifications
  const notifications = db.prepare(
    `SELECT id, type, sub_type, template_key, payload, severity, status
     FROM notifications
     WHERE entity_type = 'mission' AND entity_id = @id AND deleted_at IS NULL`
  ).all({ id });
  if (notifications.length > 0) {
    const parsePayload = (value) => {
      if (!value) return {};
      if (typeof value === 'object') return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (error) {
          return { value };
        }
      }
      return { value };
    };

    impacts.notifications = notifications.map((n) => {
      const payload = parsePayload(n.payload);
      const title =
        payload.title ||
        payload.subject ||
        payload.name ||
        payload.reference ||
        n.template_key ||
        n.type ||
        "Notification";
      const message =
        payload.message || payload.body || payload.description || null;

      return {
        id: n.id,
        title,
        message,
        severity: n.severity,
        status: n.status,
        type: n.type,
        subType: n.sub_type,
        templateKey: n.template_key,
      };
    });
  }

  // Check history events
  const historyService = require('./history.service');
  const history = db.prepare(
    `SELECT id, action, description, created_at
     FROM history_events
     WHERE entity_type = 'mission' AND entity_id = @id AND deleted_at IS NULL`
  ).all({ id });
  if (history.length > 0) {
    impacts.history = history.map(h => ({
      id: h.id,
      action: h.action,
      description: h.description,
      createdAt: h.created_at
    }));
  }

  const canDelete = Object.keys(impacts).length === 0;

  return {
    canDelete,
    impacts,
    mission: {
      id: mission.id,
      reference: mission.reference,
      title: mission.title
    }
  };
}

/**
 * Safely deletes a mission and all its dependencies in a transaction
 */
function remove(id) {
  const historyService = require('./history.service');

  // Get the mission to know which parent to update
  const mission = get(id);
  if (!mission) return false;

  // Use transaction for atomic deletion
  return withTx(db, () => {
    // 1. Delete financial entries (FK constraint)
    const deleteFinancial = db.prepare(
      `DELETE FROM financial_entries WHERE mission_id = @id`
    );
    deleteFinancial.run({ id });

    // 2. Delete documents (FK constraint)
    const deleteDocuments = db.prepare(
      `DELETE FROM documents WHERE mission_id = @id`
    );
    deleteDocuments.run({ id });

    // 3. Delete notifications (soft reference)
    const deleteNotifications = db.prepare(
      `DELETE FROM notifications WHERE entity_type = 'mission' AND entity_id = @id`
    );
    deleteNotifications.run({ id });

    // 4. Delete notes (soft reference via notes table)
    notesService.deleteNotesForEntity('mission', id);

    // 5. Finally, delete the mission itself
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });

    if (result.changes === 0) return false;

    historyService.create({
      entity_type: 'mission',
      entity_id: id,
      action: 'entity_deleted',
      description: `Mission "${mission.title}" (${mission.reference}) was deleted with all dependencies`,
    });

    if (mission.dossier_id) {
      historyService.create({
        entity_type: 'dossier',
        entity_id: mission.dossier_id,
        action: 'child_deleted',
        description: `Mission "${mission.title}" (${mission.reference}) was deleted with all dependencies`,
      });
    } else if (mission.lawsuit_id) {
      historyService.create({
        entity_type: 'lawsuit',
        entity_id: mission.lawsuit_id,
        action: 'child_deleted',
        description: `Mission "${mission.title}" (${mission.reference}) was deleted with all dependencies`,
      });
    }

    auditMutations.append(
      {
        entity_type: 'mission',
        entity_id: id,
        operation: 'delete',
        source: 'rest_api',
        before: mission,
        after: null,
        metadata: { cascade: true },
      },
      db
    );

    return true;
  });
}

module.exports = {
  list,
  listByDossier,
  listByLawsuit,
  listFiltered,
  get,
  create,
  update,
  remove,
  getDeleteImpact,
};

