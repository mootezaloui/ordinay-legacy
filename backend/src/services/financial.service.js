const db = require("../db/connection");
const historyService = require("./history.service");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  normalizeData,
} = require("./_utils");

const table = "financial_entries";
const allowedFields = [
  "scope",
  "client_id",
  "dossier_id",
  "case_id",
  "mission_id",
  "task_id",
  "personal_task_id",
  "entry_type",
  "status",
  "category",
  "amount",
  "currency",
  "occurred_at",
  "due_date",
  "paid_at",
  "title",
  "description",
  "reference",
  "notes",
  "direction", // receivable | payable
];

// ========================================
// CANONICAL STATUS VALUES
// ========================================
// These are the only valid statuses for financial entries.
// Legacy values are mapped to canonical ones.
const CANONICAL_STATUSES = {
  draft: "draft",
  confirmed: "confirmed",
  cancelled: "cancelled",
  // Legacy mappings (DB may have these)
  pending: "draft",
  posted: "confirmed",
  void: "cancelled",
  paid: "confirmed", // paid is confirmed + paid_at set
};

/**
 * Normalize status to canonical value
 * @param {string} status - Raw status value
 * @returns {string} Canonical status
 */
function normalizeStatus(status) {
  if (!status) return "draft";
  const lowered = String(status).toLowerCase();
  return CANONICAL_STATUSES[lowered] || CANONICAL_STATUSES[status] || "draft";
}

/**
 * Determine direction based on entry_type and scope
 * @param {string} entryType - income/expense/revenue
 * @param {string} scope - client/internal
 * @returns {string} receivable | payable
 */
function determineDirection(entryType, scope) {
  // Internal expenses are firm costs, not client obligations
  if (scope === "internal") {
    return "payable";
  }
  // Revenue/income from clients = client owes
  // Client-scoped expenses = client reimburses
  return "receivable";
}

/**
 * Check if an entry can be hard-deleted (only draft/never-confirmed entries)
 * @param {object} entry - Financial entry
 * @returns {boolean}
 */
function canHardDelete(entry) {
  if (!entry) return false;
  const status = normalizeStatus(entry.status);
  // Only draft entries that were never confirmed can be hard-deleted
  return status === "draft" && !entry.paid_at && !entry.cancelled_at;
}

function validateParentCombination(data) {
  if (data.dossier_id !== undefined && data.case_id !== undefined) {
    if (data.dossier_id !== null && data.case_id !== null) {
      assert(false, "Provide at most one of dossier_id or case_id");
    }
  }
}

function list(includeDeleted = false) {
  const whereClause = includeDeleted ? "" : "WHERE deleted_at IS NULL";
  return db.prepare(`SELECT * FROM ${table} ${whereClause}`).all();
}

/**
 * List entries for balance calculations (excludes cancelled entries)
 * @param {object} filters - Optional filters { clientId, dossierId, caseId, direction }
 * @returns {Array} Active financial entries
 */
function listForBalance(filters = {}) {
  const where = ["deleted_at IS NULL", "status NOT IN ('cancelled', 'void')"];
  const params = {};

  if (filters.clientId) {
    where.push("client_id = @clientId");
    params.clientId = filters.clientId;
  }
  if (filters.dossierId) {
    where.push("dossier_id = @dossierId");
    params.dossierId = filters.dossierId;
  }
  if (filters.caseId) {
    where.push("case_id = @caseId");
    params.caseId = filters.caseId;
  }
  if (filters.direction) {
    where.push("direction = @direction");
    params.direction = filters.direction;
  }

  return db
    .prepare(`SELECT * FROM ${table} WHERE ${where.join(" AND ")}`)
    .all(params);
}

/**
 * Check if a client has outstanding receivable balance
 * (Used for closure blockers - only receivable entries matter)
 * @param {number} clientId - Client ID
 * @returns {object} { hasOutstanding, totalOwed, entries }
 */
function getClientReceivableBalance(clientId) {
  const entries = listForBalance({ clientId, direction: "receivable" });

  let totalOwed = 0;
  let totalPaid = 0;

  entries.forEach((entry) => {
    const amount = Number(entry.amount || 0);
    totalOwed += amount;
    if (entry.paid_at) {
      totalPaid += amount;
    }
  });

  const outstandingBalance = totalOwed - totalPaid;
  const unpaidEntries = entries.filter((e) => !e.paid_at);

  return {
    hasOutstanding: outstandingBalance > 0,
    totalOwed,
    totalPaid,
    outstandingBalance,
    unpaidEntries,
  };
}

function get(id) {
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
}

/**
 * Get entry including soft-deleted (for audit purposes)
 * @param {number} id - Entry ID
 * @returns {object|null} Entry or null
 */
function getIncludeDeleted(id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = @id`).get({ id });
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    scope: "client", // Default to client scope
    dossier_id: null,
    case_id: null,
    mission_id: null,
    task_id: null,
    personal_task_id: null,
    category: null,
    occurred_at: null,
    due_date: null,
    paid_at: null,
    description: null,
    reference: null,
    notes: null,
    ...data,
  };

  // Validate scope-specific requirements
  if (insertData.scope === "client") {
    assert(
      insertData.client_id,
      "client_id is required for client-scoped entries"
    );
  } else if (insertData.scope === "internal") {
    // For internal scope, client_id should be null
    insertData.client_id = null;
  }

  assert(insertData.entry_type, "entry_type is required");
  assert(insertData.amount !== undefined, "amount is required");
  assert(insertData.currency, "currency is required");
  validateParentCombination(insertData);

  // Normalize status to canonical value
  insertData.status = normalizeStatus(insertData.status);
  if (!insertData.status) insertData.status = "draft";

  // Auto-determine direction if not provided
  if (!insertData.direction) {
    insertData.direction = determineDirection(
      insertData.entry_type,
      insertData.scope
    );
  }

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (scope, client_id, dossier_id, case_id, mission_id, task_id, personal_task_id, entry_type, status, category, amount, currency, occurred_at, due_date, paid_at, title, description, reference, notes, direction)
       VALUES (@scope, @client_id, @dossier_id, @case_id, @mission_id, @task_id, @personal_task_id, @entry_type, @status, @category, @amount, @currency, @occurred_at, @due_date, @paid_at, @title, @description, @reference, @notes, @direction)`
    );
    const result = stmt.run(insertData);

    // Record creation in history
    const created = get(result.lastInsertRowid);
    historyService.create({
      entity_type: "financial_entry",
      entity_id: created.id,
      action: "created",
      description: `Financial entry created: ${
        created.title || created.entry_type
      } - ${created.amount} ${created.currency}`,
      changed_fields: { entry: created },
      actor: payload.actor || null,
    });

    return created;
  } catch (error) {
    console.error("[financial.service] Create failed:", error.message);
    console.error(
      "[financial.service] Insert data:",
      JSON.stringify(insertData, null, 2)
    );
    throw error;
  }
}

function update(id, payload) {
  const existingEntry = get(id);
  if (!existingEntry) return null;

  const data = normalizeData(filterPayload(payload, allowedFields));
  validateParentCombination(data);
  assert(Object.keys(data).length > 0, "No fields provided for update");

  const setClause = buildUpdateClause(data);
  const stmt = db.prepare(
    `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ ...data, id });
  if (result.changes === 0) return null;

  const updatedEntry = get(id);

  // Track meaningful changes for auditability
  const changedFields = {};
  if (existingEntry.amount !== updatedEntry.amount) {
    changedFields.previous_amount = existingEntry.amount;
    changedFields.new_amount = updatedEntry.amount;
  }
  if (existingEntry.status !== updatedEntry.status) {
    changedFields.previous_status = existingEntry.status;
    changedFields.new_status = updatedEntry.status;
  }
  if (existingEntry.paid_at !== updatedEntry.paid_at) {
    changedFields.previous_paid_at = existingEntry.paid_at;
    changedFields.new_paid_at = updatedEntry.paid_at;
  }

  // Always keep a lightweight before/after snapshot for traceability
  changedFields.previous_entry = existingEntry;
  changedFields.new_entry = updatedEntry;

  const changeSummaryParts = [];
  if (changedFields.previous_amount !== undefined) {
    changeSummaryParts.push(
      `amount ${existingEntry.amount} -> ${updatedEntry.amount} ${updatedEntry.currency}`
    );
  }
  if (changedFields.previous_status !== undefined) {
    changeSummaryParts.push(
      `status ${existingEntry.status || "-"} -> ${updatedEntry.status || "-"}`
    );
  }

  historyService.create({
    entity_type: "financial_entry",
    entity_id: id,
    action: "updated",
    description:
      changeSummaryParts.length > 0
        ? `Financial entry corrected (${changeSummaryParts.join(", ")})`
        : "Financial entry updated",
    changed_fields: changedFields,
    actor: payload.actor || payload.updated_by || payload.modified_by || null,
  });

  return updatedEntry;
}

function remove(id, options = {}) {
  const { reason, actor, forceHardDelete = false } = options;

  // Get the financial entry to know which client to update
  const entry = get(id);
  if (!entry) return { success: false, reason: "not_found" };

  const entryDesc =
    entry.description ||
    entry.title ||
    `${entry.entry_type} - ${entry.amount} ${entry.currency}`;

  // Determine if we can hard-delete or must soft-delete
  const shouldHardDelete = forceHardDelete && canHardDelete(entry);

  if (shouldHardDelete) {
    // HARD DELETE: Only for draft entries that were never confirmed
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });

    if (result.changes > 0) {
      historyService.create({
        entity_type: "financial_entry",
        entity_id: id,
        action: "hard_deleted",
        description: `Draft financial entry "${entryDesc}" was permanently deleted`,
        changed_fields: {
          previous_entry: entry,
          reason: reason || "Draft entry deleted before confirmation",
        },
        actor,
      });

      if (entry.client_id) {
        historyService.create({
          entity_type: "client",
          entity_id: entry.client_id,
          action: "child_deleted",
          description: `Draft financial entry "${entryDesc}" was deleted`,
          actor,
        });
      }
    }

    return { success: result.changes > 0, method: "hard_delete" };
  }

  // SOFT DELETE: Cancel the entry instead of deleting
  // This preserves history and prevents FK errors
  const cancelStmt = db.prepare(`
    UPDATE ${table}
    SET status = 'cancelled',
        cancelled_at = CURRENT_TIMESTAMP,
        cancellation_reason = @reason,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND deleted_at IS NULL
  `);

  const result = cancelStmt.run({
    id,
    reason: reason || "Deleted by user",
  });

  if (result.changes > 0) {
    // Record cancellation in history (not deletion)
    historyService.create({
      entity_type: "financial_entry",
      entity_id: id,
      action: "cancelled",
      description: `Financial entry "${entryDesc}" was cancelled`,
      changed_fields: {
        previous_status: entry.status,
        new_status: "cancelled",
        previous_entry: entry,
        cancellation_reason: reason || "Deleted by user",
      },
      actor,
    });

    if (entry.client_id) {
      historyService.create({
        entity_type: "client",
        entity_id: entry.client_id,
        action: "financial_cancelled",
        description: `Financial entry "${entryDesc}" was cancelled`,
        actor,
      });
    }
  }

  return { success: result.changes > 0, method: "soft_delete" };
}

/**
 * Cancel a financial entry (explicit cancellation, not deletion)
 * @param {number} id - Entry ID
 * @param {object} options - { reason, actor }
 * @returns {object|null} Updated entry or null
 */
function cancel(id, options = {}) {
  const { reason, actor } = options;
  const entry = get(id);
  if (!entry) return null;

  const normalizedStatus = normalizeStatus(entry.status);
  if (normalizedStatus === "cancelled") {
    // Already cancelled
    return entry;
  }

  const entryDesc =
    entry.description ||
    entry.title ||
    `${entry.entry_type} - ${entry.amount} ${entry.currency}`;

  const stmt = db.prepare(`
    UPDATE ${table}
    SET status = 'cancelled',
        cancelled_at = CURRENT_TIMESTAMP,
        cancellation_reason = @reason,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND deleted_at IS NULL
  `);

  const result = stmt.run({ id, reason: reason || "Cancelled by user" });
  if (result.changes === 0) return null;

  const updatedEntry = get(id);

  historyService.create({
    entity_type: "financial_entry",
    entity_id: id,
    action: "cancelled",
    description: `Financial entry "${entryDesc}" was cancelled: ${
      reason || "No reason provided"
    }`,
    changed_fields: {
      previous_status: entry.status,
      new_status: "cancelled",
      previous_entry: entry,
      new_entry: updatedEntry,
      cancellation_reason: reason,
    },
    actor,
  });

  if (entry.client_id) {
    historyService.create({
      entity_type: "client",
      entity_id: entry.client_id,
      action: "financial_cancelled",
      description: `Financial entry "${entryDesc}" was cancelled`,
      actor,
    });
  }

  return updatedEntry;
}

/**
 * Check if parent entity can be deleted/closed based on financial entries
 * @param {string} parentType - 'client' | 'dossier' | 'case'
 * @param {number} parentId - Parent entity ID
 * @returns {object} { canDelete, blockers, activeEntries }
 */
function checkParentDeletionAllowed(parentType, parentId) {
  let whereClause = "";
  const params = { parentId };

  switch (parentType) {
    case "client":
      whereClause = "client_id = @parentId";
      break;
    case "dossier":
      whereClause = "dossier_id = @parentId";
      break;
    case "case":
      whereClause = "case_id = @parentId";
      break;
    default:
      return { canDelete: true, blockers: [], activeEntries: [] };
  }

  // Find active (non-cancelled, non-deleted) entries
  const activeEntries = db
    .prepare(
      `
    SELECT * FROM ${table}
    WHERE ${whereClause}
    AND deleted_at IS NULL
    AND status NOT IN ('cancelled', 'void')
  `
    )
    .all(params);

  // Only receivable entries with outstanding balance block deletion
  const blockingEntries = activeEntries.filter((entry) => {
    // Only block on receivable entries (client owes money)
    if (entry.direction !== "receivable") return false;
    // Only block if not paid
    return !entry.paid_at;
  });

  const blockers = blockingEntries.map((entry) => {
    const desc = entry.description || entry.title || entry.entry_type;
    return `Unpaid financial entry: ${desc} - ${entry.amount} ${entry.currency}`;
  });

  return {
    canDelete: blockingEntries.length === 0,
    blockers,
    activeEntries,
    blockingEntries,
  };
}

module.exports = {
  list,
  listForBalance,
  get,
  getIncludeDeleted,
  getClientReceivableBalance,
  create,
  update,
  remove,
  cancel,
  checkParentDeletionAllowed,
  normalizeStatus,
  determineDirection,
  canHardDelete,
  CANONICAL_STATUSES,
};
