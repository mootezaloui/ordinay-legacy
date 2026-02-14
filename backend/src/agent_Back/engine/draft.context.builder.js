"use strict";

const operatorsService = require("../../services/operators.service");

async function buildDraftContext({
  entityType,
  entityId,
  draftType,
  originalMessage,
  invoiceSelection = null,
  policy,
}) {
  const context = {
    entityType,
    entityId,
    draftType,
    purpose: _derivePurpose(originalMessage, draftType),
    audience: _deriveAudience(draftType),
    tone: "formal",
    language: "fr",
  };

  const ambiguities = [];

  const entity = await _fetchEntityByType.call(
    this,
    entityType,
    entityId,
    policy,
  );
  if (!entity) {
    ambiguities.push({
      type: "missing_entity",
      message: `${entityType} ${entityId} not found.`,
    });
    return { context, ambiguities, isComplete: false };
  }

  context.entity = entity;

  const client = await _resolveClientForEntity.call(
    this,
    entityType,
    entity,
    policy,
  );
  if (client) {
    context.client = client;
  }

  const recipient = _buildRecipientIdentity(entityType, entity, client);
  if (recipient) {
    context.recipient = recipient;
  }

  context.author = _resolveAuthorIdentity();

  const isOverduePaymentEmail = _isOverduePaymentEmail(
    draftType,
    originalMessage,
  );

  if (isOverduePaymentEmail) {
    const overdue = await _buildOverdueContext.call(
      this,
      client,
      entityType,
      entity,
      policy,
    );
    context.overdue = overdue;

    if (!overdue.overdueInvoices || overdue.overdueInvoices.length === 0) {
      ambiguities.push({
        type: "no_overdue_invoices",
        message: "No overdue invoices found for this client.",
      });
    }

    if (overdue.overdueInvoices && overdue.overdueInvoices.length > 1) {
      const resolvedSelection = _resolveInvoiceSelection(
        invoiceSelection,
        overdue.overdueInvoices,
      );
      if (resolvedSelection) {
        overdue.selection = resolvedSelection;
      } else {
        ambiguities.push({
          type: "invoice_selection",
          message:
            "This client has multiple overdue invoices. Which should I reference?",
          options: overdue.overdueInvoices.map((invoice) => ({
            invoiceId: invoice.id,
            label: _buildInvoiceLabel(invoice),
            amount: invoice.amount ?? null,
            currency: invoice.currency || null,
            dueDate: invoice.dueDate || null,
            daysLate: invoice.daysLate ?? null,
          })),
        });
      }
    }
  }

  if (draftType === "HEARING_REQUEST") {
    const scheduledAt = entity?.scheduled_at || entity?.scheduledAt || null;
    if (!scheduledAt) {
      ambiguities.push({
        type: "missing_session_date",
      });
    }
  }

  return { context, ambiguities, isComplete: ambiguities.length === 0 };
}

function _resolveInvoiceSelection(invoiceSelection, overdueInvoices = []) {
  if (!invoiceSelection || !Array.isArray(overdueInvoices)) return null;
  if (overdueInvoices.length === 0) return null;

  const mode = String(invoiceSelection.mode || "").toLowerCase();
  const selectionId = String(invoiceSelection.selectionId || "").toUpperCase();
  const availableIds = overdueInvoices
    .map((invoice) => Number(invoice.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (mode === "all" || selectionId === "ALL_OVERDUE") {
    return {
      mode: "all",
      invoiceIds: availableIds,
    };
  }

  const requestedInvoiceId = Number(
    invoiceSelection.invoiceId || invoiceSelection.selectionId,
  );
  if (!Number.isFinite(requestedInvoiceId) || requestedInvoiceId <= 0) {
    return null;
  }
  if (!availableIds.includes(requestedInvoiceId)) {
    return null;
  }

  return {
    mode: "single",
    invoiceIds: [requestedInvoiceId],
  };
}

async function _fetchEntityByType(entityType, entityId, policy) {
  if (!entityType || !entityId) return null;
  const toolMap = {
    client: {
      toolName: "getClient",
      paramKey: "clientId",
      resultKey: "client",
    },
    dossier: {
      toolName: "getDossier",
      paramKey: "dossierId",
      resultKey: "dossier",
    },
    session: {
      toolName: "getSession",
      paramKey: "sessionId",
      resultKey: "session",
    },
    task: { toolName: "getTask", paramKey: "taskId", resultKey: "task" },
  };
  const config = toolMap[entityType];
  if (!config) return null;
  const result = await this._callReadTool(
    config.toolName,
    { [config.paramKey]: Number(entityId) },
    policy,
  );
  return result?.[config.resultKey] || null;
}

async function _resolveClientForEntity(entityType, entity, policy) {
  if (!entity) return null;
  if (entityType === "client") return entity;

  const clientId =
    entity.client_id ||
    entity.clientId ||
    entity.client?.id ||
    entity.client?.client_id ||
    null;

  if (!clientId) return null;

  const result = await this._callReadTool(
    "getClient",
    { clientId: Number(clientId) },
    policy,
  );
  return result?.client || null;
}

async function _buildOverdueContext(client, entityType, entity, policy) {
  const clientId =
    client?.id ||
    (entityType === "client" ? entity?.id : null) ||
    entity?.client_id ||
    entity?.clientId ||
    null;

  const overdue = {
    overdueInvoices: [],
    totalOverdueAmount: null,
    totalOverdueCurrency: null,
    oldestDueDate: null,
    daysLate: null,
    selection: null,
  };

  if (!clientId) return overdue;

  const result = await this._callReadTool(
    "listFinancialEntries",
    {
      clientId: Number(clientId),
      direction: "receivable",
      scope: "client",
      limit: 200,
    },
    policy,
  );

  const entries = Array.isArray(result?.financialEntries)
    ? result.financialEntries
    : [];

  const now = new Date();
  const overdueInvoices = entries
    .filter((entry) => _isOverdueEntry(entry, now))
    .map((entry) => _normalizeInvoice(entry, now));

  overdue.overdueInvoices = overdueInvoices;

  const totalAmount = overdueInvoices.reduce((sum, invoice) => {
    const value = Number(invoice.amount);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  const currencies = Array.from(
    new Set(
      overdueInvoices
        .map((invoice) => invoice.currency)
        .filter((currency) => currency),
    ),
  );

  overdue.totalOverdueAmount = Number.isFinite(totalAmount)
    ? totalAmount
    : null;
  overdue.totalOverdueCurrency = currencies.length === 1 ? currencies[0] : null;

  const oldestDueDate = overdueInvoices.reduce((oldest, invoice) => {
    if (!invoice.dueDate) return oldest;
    if (!oldest) return invoice.dueDate;
    const current = new Date(invoice.dueDate).getTime();
    const previous = new Date(oldest).getTime();
    if (!Number.isFinite(current)) return oldest;
    if (!Number.isFinite(previous)) return invoice.dueDate;
    return current < previous ? invoice.dueDate : oldest;
  }, null);

  overdue.oldestDueDate = oldestDueDate;
  overdue.daysLate = _computeDaysLate(oldestDueDate, now);

  if (overdueInvoices.length === 1) {
    overdue.selection = {
      mode: "single",
      invoiceIds: [overdueInvoices[0].id],
    };
  }

  return overdue;
}

function _isOverdueEntry(entry, now) {
  if (!entry) return false;
  const status = String(entry.status || "").toLowerCase();
  if (status === "paid" || status === "cancelled" || status === "void") {
    return false;
  }
  const direction = String(entry.direction || "").toLowerCase();
  if (direction !== "receivable") return false;
  const dueDate = entry.due_date || entry.dueDate || null;
  if (!dueDate) return false;
  const dueTime = new Date(dueDate).getTime();
  if (!Number.isFinite(dueTime)) return false;
  return dueTime < now.getTime();
}

function _normalizeInvoice(entry, now) {
  const dueDate = entry.due_date || entry.dueDate || null;
  return {
    id: Number(entry.id),
    title: entry.title || null,
    amount: entry.amount ?? null,
    currency: entry.currency || null,
    dueDate,
    daysLate: _computeDaysLate(dueDate, now),
  };
}

function _computeDaysLate(dueDate, now = new Date()) {
  if (!dueDate) return null;
  const dueTime = new Date(dueDate).getTime();
  if (!Number.isFinite(dueTime)) return null;
  const diffMs = now.getTime() - dueTime;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function _buildInvoiceLabel(invoice) {
  const amount = _formatAmount(invoice.amount, invoice.currency);
  const dueDate = _formatDueDate(invoice.dueDate);
  return `Invoice ${invoice.id} - ${amount || "[Amount]"} - Due ${dueDate}`;
}

function _formatAmount(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "";
  const formatted = new Intl.NumberFormat("fr-FR").format(numeric);
  return currency ? `${formatted} ${currency}` : formatted;
}

function _formatDueDate(value) {
  if (!value) return "[Due Date]";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "[Due Date]";
  return date.toLocaleDateString("fr-FR");
}

function _resolveAuthorIdentity() {
  const placeholders = {
    name: "[Your Name]",
    position: "[Your Title]",
    firmName: "[Firm Name]",
    phone: "[Phone]",
    email: "[Email]",
  };

  try {
    const operator = operatorsService.getCurrentOperator();
    return {
      name: operator?.name || placeholders.name,
      position: operator?.title || operator?.role || placeholders.position,
      firmName:
        operator?.office_name || operator?.office || placeholders.firmName,
      phone: operator?.phone || operator?.mobile || placeholders.phone,
      email: operator?.email || placeholders.email,
    };
  } catch (err) {
    return { ...placeholders };
  }
}

function _buildRecipientIdentity(entityType, entity, client) {
  const recipient = client || (entityType === "client" ? entity : null);
  if (recipient) {
    return {
      type: "client",
      id: recipient.id || null,
      name: recipient.name || recipient.client_name || null,
      email: recipient.email || recipient.client_email || null,
      phone: recipient.phone || recipient.client_phone || null,
      address: recipient.address || recipient.client_address || null,
    };
  }

  if (entity?.client_name || entity?.client_email) {
    return {
      type: "client",
      id: entity.client_id || null,
      name: entity.client_name || null,
      email: entity.client_email || null,
      phone: entity.client_phone || null,
      address: entity.client_address || null,
    };
  }

  return null;
}

function _deriveAudience(draftType) {
  if (draftType === "CLIENT_EMAIL") return "client";
  if (draftType === "INVITATION") return "client";
  if (draftType === "INTERNAL_NOTE") return "internal";
  if (draftType === "HEARING_SUMMARY") return "internal";
  return "client";
}

function _derivePurpose(message, draftType) {
  const purposePatterns = [
    /(?:about|regarding|concerning|au sujet de)\s+(.{5,60}?)(?:[.!?]|$)/i,
    /(?:requesting|afin de)\s+(.{5,60}?)(?:[.!?]|$)/i,
    /\bto\s+(.{5,60}?)(?:[.!?]|$)/i,
    /\b(?:for|pour)\s+(.{5,60}?)(?:[.!?]|$)/i,
  ];
  for (const pattern of purposePatterns) {
    const purposeMatch = String(message || "").match(pattern);
    if (purposeMatch) return purposeMatch[1].trim();
  }

  if (draftType === "INVITATION") return "session invitation";
  if (draftType === "CLIENT_EMAIL") return "client communication";
  if (draftType === "HEARING_SUMMARY") return "hearing summary";
  if (draftType === "INTERNAL_NOTE") return "internal documentation";
  return "general correspondence";
}

function _isOverduePaymentEmail(draftType, message) {
  if (draftType !== "CLIENT_EMAIL") return false;
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;
  const keywords = [
    "overdue",
    "unpaid",
    "late payment",
    "payment reminder",
    "past due",
    "late invoice",
    "retard",
    "retard de paiement",
    "impay",
  ];
  return keywords.some((keyword) => normalized.includes(keyword));
}

module.exports = {
  buildDraftContext,
};
