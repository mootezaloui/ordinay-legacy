const db = require("../db/connection");
const notesService = require("./notes.service");
const { withTx } = require("../db/withTx");
const auditMutations = require("./auditMutations.service");
const {
  assert,
  filterPayload,
  buildUpdateClause,
  normalizeData,
} = require("./_utils");

const table = "clients";
const allowedFields = [
  "name",
  "email",
  "phone",
  "alternate_phone",
  "address",
  "status",
  "cin",
  "date_of_birth",
  "profession",
  "company",
  "tax_id",
  "join_date",
];

function normalizeClientStatus(value, fallback = null) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const token = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (token === "active") return "active";
  if (
    token === "inactive" ||
    token === "in_active" ||
    token === "former_client" ||
    token === "disabled" ||
    token === "suspended"
  ) {
    return "inActive";
  }
  return fallback;
}

function list() {
  const clients = db
    .prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`)
    .all();
  return clients.map((client) => ({
    ...client,
    notes: notesService.getNotesForEntity("client", client.id),
  }));
}

function listFiltered({ query = null, status = null, limit = 50 } = {}) {
  const where = ["deleted_at IS NULL"];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  };

  if (status) {
    where.push("LOWER(COALESCE(status, '')) = @status");
    params.status = String(status).trim().toLowerCase();
  }

  if (query) {
    where.push(
      `(LOWER(COALESCE(name, '')) LIKE @query
        OR LOWER(COALESCE(email, '')) LIKE @query
        OR LOWER(COALESCE(phone, '')) LIKE @query
        OR LOWER(COALESCE(alternate_phone, '')) LIKE @query
        OR LOWER(COALESCE(company, '')) LIKE @query)`,
    );
    params.query = `%${String(query).trim().toLowerCase()}%`;
  }

  const clients = db
    .prepare(
      `SELECT * FROM ${table}
       WHERE ${where.join(" AND ")}
       ORDER BY LOWER(COALESCE(name, '')) ASC, id ASC
       LIMIT @limit`,
    )
    .all(params);

  return clients.map((client) => ({
    ...client,
    notes: notesService.getNotesForEntity("client", client.id),
  }));
}

function findClientsWithOverdueInvoices(limit = 5, { clientId = null } = {}) {
  const params = {
    limit: Math.max(1, Number(limit) || 5),
  };

  let where = `
    c.deleted_at IS NULL
    AND fe.deleted_at IS NULL
    AND fe.scope = 'client'
    AND (fe.direction = 'receivable' OR fe.direction IS NULL)
    AND fe.due_date IS NOT NULL
    AND fe.due_date < CURRENT_TIMESTAMP
    AND fe.paid_at IS NULL
    AND LOWER(COALESCE(fe.status, '')) NOT IN ('cancelled', 'void')
  `;

  if (clientId) {
    where += " AND c.id = @clientId";
    params.clientId = Number(clientId);
  }

  const rows = db
    .prepare(
      `
      SELECT
        c.id AS client_id,
        c.name AS client_name,
        COUNT(fe.id) AS overdue_count,
        SUM(COALESCE(fe.amount, 0)) AS total_overdue_amount,
        MIN(fe.due_date) AS oldest_due_date
      FROM clients c
      JOIN financial_entries fe ON fe.client_id = c.id
      WHERE ${where}
      GROUP BY c.id, c.name
      ORDER BY oldest_due_date ASC, total_overdue_amount DESC, overdue_count DESC
      LIMIT @limit
      `,
    )
    .all(params);

  return rows;
}

function get(id) {
  const client = db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
  if (!client) return null;
  return {
    ...client,
    notes: notesService.getNotesForEntity("client", id),
  };
}

function create(payload) {
  const data = normalizeData(filterPayload(payload, allowedFields));
  const insertData = {
    email: null,
    phone: null,
    alternate_phone: null,
    address: null,
    cin: null,
    date_of_birth: null,
    profession: null,
    company: null,
    tax_id: null,
    join_date: null,
    ...data,
  };
  assert(insertData.name, "Name is required");
  insertData.status = normalizeClientStatus(insertData.status, "active");

  try {
    const stmt = db.prepare(
      `INSERT INTO ${table} (name, email, phone, alternate_phone, address, status, cin, date_of_birth, profession, company, tax_id, join_date)
       VALUES (@name, @email, @phone, @alternate_phone, @address, @status, @cin, @date_of_birth, @profession, @company, @tax_id, @join_date)`,
    );
    const result = stmt.run(insertData);
    const created = get(result.lastInsertRowid);
    if (payload?.notes !== undefined) {
      notesService.saveNotesForEntity("client", created.id, payload.notes);
      return get(created.id);
    }
    return created;
  } catch (error) {
    console.error("[clients.service] Create failed:", error.message);
    console.error(
      "[clients.service] Insert data:",
      JSON.stringify(insertData, null, 2),
    );
    throw error;
  }
}

function update(id, payload) {
  const notesArray = payload?.notes;
  const data = normalizeData(filterPayload(payload, allowedFields));
  if (Object.prototype.hasOwnProperty.call(data, "status")) {
    const normalizedStatus = normalizeClientStatus(data.status, null);
    assert(normalizedStatus, "Invalid status. Allowed values: active, inactive");
    data.status = normalizedStatus;
  }
  const hasDataFields = Object.keys(data).length > 0;
  if (!hasDataFields && notesArray === undefined) {
    assert(false, "No fields provided for update");
  }

  if (hasDataFields) {
    const setClause = buildUpdateClause(data);
    const stmt = db.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`,
    );
    const result = stmt.run({ ...data, id });
    if (result.changes === 0) return null;
  }
  if (notesArray !== undefined) {
    notesService.saveNotesForEntity("client", id, notesArray);
  }
  return get(id);
}

function remove(id) {
  const historyService = require("./history.service");
  const client = get(id);
  if (!client) return false;

  return withTx(db, () => {
    const deleteIn = (tableName, column, ids) => {
      if (!ids || ids.length === 0) return 0;
      const params = {};
      const placeholders = ids.map((value, index) => {
        const key = `id${index}`;
        params[key] = value;
        return `@${key}`;
      });
      const stmt = db.prepare(
        `DELETE FROM ${tableName} WHERE ${column} IN (${placeholders.join(", ")})`,
      );
      return stmt.run(params).changes;
    };

    const deleteNotesByEntity = (entityType, ids) => {
      if (!ids || ids.length === 0) return 0;
      const params = { entity_type: entityType };
      const placeholders = ids.map((value, index) => {
        const key = `id${index}`;
        params[key] = value;
        return `@${key}`;
      });
      const stmt = db.prepare(
        `DELETE FROM notes WHERE entity_type = @entity_type AND entity_id IN (${placeholders.join(", ")})`,
      );
      return stmt.run(params).changes;
    };

    const deleteNotificationsByEntity = (entityType, ids) => {
      if (!ids || ids.length === 0) return 0;
      const params = { entity_type: entityType };
      const placeholders = ids.map((value, index) => {
        const key = `id${index}`;
        params[key] = value;
        return `@${key}`;
      });
      const stmt = db.prepare(
        `DELETE FROM notifications WHERE entity_type = @entity_type AND entity_id IN (${placeholders.join(", ")})`,
      );
      return stmt.run(params).changes;
    };

    const dossierIds = db
      .prepare(`SELECT id FROM dossiers WHERE client_id = ?`)
      .all(id)
      .map((row) => row.id);

    const lawsuitIds = dossierIds.length
      ? db
          .prepare(
            `SELECT id FROM lawsuits WHERE dossier_id IN (${dossierIds.map(() => "?").join(", ")})`,
          )
          .all(...dossierIds)
          .map((row) => row.id)
      : [];

    const missionIds =
      dossierIds.length || lawsuitIds.length
        ? db
            .prepare(
              `SELECT id FROM missions WHERE ${
                [
                  dossierIds.length ? `dossier_id IN (${dossierIds.map(() => "?").join(", ")})` : null,
                  lawsuitIds.length ? `lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})` : null,
                ]
                  .filter(Boolean)
                  .join(" OR ")
              }`,
            )
            .all(...dossierIds, ...lawsuitIds)
            .map((row) => row.id)
        : [];

    const taskIds =
      dossierIds.length || lawsuitIds.length
        ? db
            .prepare(
              `SELECT id FROM tasks WHERE ${
                [
                  dossierIds.length ? `dossier_id IN (${dossierIds.map(() => "?").join(", ")})` : null,
                  lawsuitIds.length ? `lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})` : null,
                ]
                  .filter(Boolean)
                  .join(" OR ")
              }`,
            )
            .all(...dossierIds, ...lawsuitIds)
            .map((row) => row.id)
        : [];

    const sessionIds =
      dossierIds.length || lawsuitIds.length
        ? db
            .prepare(
              `SELECT id FROM sessions WHERE ${
                [
                  dossierIds.length ? `dossier_id IN (${dossierIds.map(() => "?").join(", ")})` : null,
                  lawsuitIds.length ? `lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})` : null,
                ]
                  .filter(Boolean)
                  .join(" OR ")
              }`,
            )
            .all(...dossierIds, ...lawsuitIds)
            .map((row) => row.id)
        : [];

    const financialEntryIds = db
      .prepare(
        `SELECT id FROM financial_entries WHERE client_id = ?${
          dossierIds.length ? ` OR dossier_id IN (${dossierIds.map(() => "?").join(", ")})` : ""
        }${
          lawsuitIds.length ? ` OR lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})` : ""
        }${
          missionIds.length ? ` OR mission_id IN (${missionIds.map(() => "?").join(", ")})` : ""
        }${
          taskIds.length ? ` OR task_id IN (${taskIds.map(() => "?").join(", ")})` : ""
        }`,
      )
      .all(id, ...dossierIds, ...lawsuitIds, ...missionIds, ...taskIds)
      .map((row) => row.id);

    const documentIds = db
      .prepare(
        `SELECT id FROM documents WHERE client_id = ?${
          dossierIds.length ? ` OR dossier_id IN (${dossierIds.map(() => "?").join(", ")})` : ""
        }${
          lawsuitIds.length ? ` OR lawsuit_id IN (${lawsuitIds.map(() => "?").join(", ")})` : ""
        }${
          missionIds.length ? ` OR mission_id IN (${missionIds.map(() => "?").join(", ")})` : ""
        }${
          taskIds.length ? ` OR task_id IN (${taskIds.map(() => "?").join(", ")})` : ""
        }${
          sessionIds.length ? ` OR session_id IN (${sessionIds.map(() => "?").join(", ")})` : ""
        }${
          financialEntryIds.length
            ? ` OR financial_entry_id IN (${financialEntryIds.map(() => "?").join(", ")})`
            : ""
        }`,
      )
      .all(
        id,
        ...dossierIds,
        ...lawsuitIds,
        ...missionIds,
        ...taskIds,
        ...sessionIds,
        ...financialEntryIds,
      )
      .map((row) => row.id);

    // Delete deepest dependencies first
    deleteIn("documents", "id", documentIds);
    deleteIn("financial_entries", "id", financialEntryIds);

    // Remove soft references
    deleteNotificationsByEntity("document", documentIds);
    deleteNotificationsByEntity("financial_entry", financialEntryIds);
    deleteNotificationsByEntity("mission", missionIds);
    deleteNotificationsByEntity("task", taskIds);
    deleteNotificationsByEntity("session", sessionIds);
    deleteNotificationsByEntity("lawsuit", lawsuitIds);
    deleteNotificationsByEntity("dossier", dossierIds);
    deleteNotificationsByEntity("client", [id]);

    deleteNotesByEntity("document", documentIds);
    deleteNotesByEntity("financial_entry", financialEntryIds);
    deleteNotesByEntity("mission", missionIds);
    deleteNotesByEntity("task", taskIds);
    deleteNotesByEntity("session", sessionIds);
    deleteNotesByEntity("lawsuit", lawsuitIds);
    deleteNotesByEntity("dossier", dossierIds);
    notesService.deleteNotesForEntity("client", id);

    // Delete children
    deleteIn("missions", "id", missionIds);
    deleteIn("tasks", "id", taskIds);
    deleteIn("sessions", "id", sessionIds);
    deleteIn("lawsuits", "id", lawsuitIds);
    deleteIn("dossiers", "id", dossierIds);

    // FK safety sweep: remove any remaining descendants still linked to this client
    // (protects against stale frontend cascade state or partially inconsistent rows)
    db.prepare(
      `DELETE FROM documents
       WHERE client_id = @id
          OR dossier_id IN (SELECT id FROM dossiers WHERE client_id = @id)
          OR lawsuit_id IN (
            SELECT l.id FROM lawsuits l
            JOIN dossiers d ON d.id = l.dossier_id
            WHERE d.client_id = @id
          )
          OR mission_id IN (
            SELECT m.id FROM missions m
            LEFT JOIN dossiers d ON d.id = m.dossier_id
            LEFT JOIN lawsuits l ON l.id = m.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE d.client_id = @id OR dl.client_id = @id
          )
          OR task_id IN (
            SELECT t.id FROM tasks t
            LEFT JOIN dossiers d ON d.id = t.dossier_id
            LEFT JOIN lawsuits l ON l.id = t.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE d.client_id = @id OR dl.client_id = @id
          )
          OR session_id IN (
            SELECT s.id FROM sessions s
            LEFT JOIN dossiers d ON d.id = s.dossier_id
            LEFT JOIN lawsuits l ON l.id = s.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE d.client_id = @id OR dl.client_id = @id
          )
          OR financial_entry_id IN (
            SELECT fe.id FROM financial_entries fe
            LEFT JOIN dossiers d ON d.id = fe.dossier_id
            LEFT JOIN lawsuits l ON l.id = fe.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            LEFT JOIN missions m ON m.id = fe.mission_id
            LEFT JOIN dossiers md ON md.id = m.dossier_id
            LEFT JOIN lawsuits ml ON ml.id = m.lawsuit_id
            LEFT JOIN dossiers mdl ON mdl.id = ml.dossier_id
            LEFT JOIN tasks t ON t.id = fe.task_id
            LEFT JOIN dossiers td ON td.id = t.dossier_id
            LEFT JOIN lawsuits tl ON tl.id = t.lawsuit_id
            LEFT JOIN dossiers tdl ON tdl.id = tl.dossier_id
            WHERE fe.client_id = @id
               OR d.client_id = @id
               OR dl.client_id = @id
               OR md.client_id = @id
               OR mdl.client_id = @id
               OR td.client_id = @id
               OR tdl.client_id = @id
          )`,
    ).run({ id });

    db.prepare(
      `DELETE FROM financial_entries
       WHERE client_id = @id
          OR dossier_id IN (SELECT id FROM dossiers WHERE client_id = @id)
          OR lawsuit_id IN (
            SELECT l.id FROM lawsuits l
            JOIN dossiers d ON d.id = l.dossier_id
            WHERE d.client_id = @id
          )
          OR mission_id IN (
            SELECT m.id FROM missions m
            LEFT JOIN dossiers d ON d.id = m.dossier_id
            LEFT JOIN lawsuits l ON l.id = m.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE d.client_id = @id OR dl.client_id = @id
          )
          OR task_id IN (
            SELECT t.id FROM tasks t
            LEFT JOIN dossiers d ON d.id = t.dossier_id
            LEFT JOIN lawsuits l ON l.id = t.lawsuit_id
            LEFT JOIN dossiers dl ON dl.id = l.dossier_id
            WHERE d.client_id = @id OR dl.client_id = @id
          )`,
    ).run({ id });

    db.prepare(
      `DELETE FROM missions
       WHERE dossier_id IN (SELECT id FROM dossiers WHERE client_id = @id)
          OR lawsuit_id IN (
            SELECT l.id FROM lawsuits l
            JOIN dossiers d ON d.id = l.dossier_id
            WHERE d.client_id = @id
          )`,
    ).run({ id });

    db.prepare(
      `DELETE FROM tasks
       WHERE dossier_id IN (SELECT id FROM dossiers WHERE client_id = @id)
          OR lawsuit_id IN (
            SELECT l.id FROM lawsuits l
            JOIN dossiers d ON d.id = l.dossier_id
            WHERE d.client_id = @id
          )`,
    ).run({ id });

    db.prepare(
      `DELETE FROM sessions
       WHERE dossier_id IN (SELECT id FROM dossiers WHERE client_id = @id)
          OR lawsuit_id IN (
            SELECT l.id FROM lawsuits l
            JOIN dossiers d ON d.id = l.dossier_id
            WHERE d.client_id = @id
          )`,
    ).run({ id });

    db.prepare(
      `DELETE FROM lawsuits
       WHERE dossier_id IN (SELECT id FROM dossiers WHERE client_id = @id)`,
    ).run({ id });

    db.prepare(`DELETE FROM dossiers WHERE client_id = @id`).run({ id });

    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = @id`);
    const result = stmt.run({ id });
    if (result.changes === 0) return false;

    historyService.create({
      entity_type: "client",
      entity_id: id,
      action: "entity_deleted",
      description: `Client "${client.name}" was deleted`,
    });
    auditMutations.append(
      {
        entity_type: "client",
        entity_id: id,
        operation: "delete",
        source: "rest_api",
        before: client,
        after: null,
      },
      db,
    );
    return true;
  });
}

module.exports = {
  list,
  listFiltered,
  findClientsWithOverdueInvoices,
  get,
  create,
  update,
  remove,
};
