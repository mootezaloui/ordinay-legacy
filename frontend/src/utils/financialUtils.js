/**
 * FINANCIAL UTILITIES
 *
 * Shared functions for querying and computing financial data.
 * All financial logic is centralized here to ensure consistency.
 *
 * Key principle: Balances are COMPUTED, never stored.
 *
 * FINANCIAL STABILIZATION (Phase 1):
 * - Uses direction (receivable/payable) for accurate balance calculations
 * - Excludes cancelled entries from balance computations
 * - Only receivable entries affect client closure blockers
 */

import {
  financialCategories,
  financialStatuses,
  normalizeFinancialStatus,
  determineDirection,
  CANONICAL_STATUSES,
} from "./financialConstants";
import i18next from "i18next";
import { isOperationalEntity } from "./importState";
import { formatCurrency as formatCurrencyValue } from "./currency";

/**
 * Check if a status represents a cancelled/void entry
 * @param {string} status - Entry status
 * @returns {boolean}
 */
const isCancelledStatus = (status) => {
  const normalized = normalizeFinancialStatus(status);
  return normalized === "cancelled";
};

/**
 * Filter financial entries by criteria
 * @param {Object} filters - Filter criteria
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Array} Filtered entries
 */
export const filterFinancialEntries = (filters = {}, allEntries = []) => {
  let entries = [...allEntries];

  // Exclude unvalidated imports by default
  if (filters.includeUnvalidated !== true) {
    entries = entries.filter(isOperationalEntity);
  }

  // Exclude cancelled/void entries by default (unless explicitly requested)
  if (filters.includeCancelled !== true) {
    entries = entries.filter((e) => !isCancelledStatus(e.status));
  }

  // Filter by scope
  if (filters.scope) {
    entries = entries.filter((e) => e.scope === filters.scope);
  }

  // Filter by direction (receivable/payable) - NEW for stabilization
  if (filters.direction) {
    entries = entries.filter((e) => {
      const entryDirection = e.direction || determineDirection(e.type, e.scope);
      return entryDirection === filters.direction;
    });
  }

  // Filter by client
  if (filters.clientId) {
    entries = entries.filter((e) => e.clientId === filters.clientId);
  }

  // Filter by dossier
  if (filters.dossierId) {
    entries = entries.filter((e) => e.dossierId === filters.dossierId);
  }

  // Filter by lawsuit (procès)
  if (filters.lawsuitId) {
    entries = entries.filter((e) => e.lawsuitId === filters.lawsuitId);
  }

  // Filter by mission
  if (filters.missionId) {
    entries = entries.filter((e) => e.missionId === filters.missionId);
  }

  // Filter by officer (huissier)
  if (filters.officerId) {
    entries = entries.filter((e) => e.officerId === filters.officerId);
  }

  // Filter by personal task
  if (filters.personalTaskId) {
    entries = entries.filter(
      (e) => e.personalTaskId === filters.personalTaskId
    );
  }

  // Filter by task
  if (filters.taskId) {
    entries = entries.filter((e) => e.taskId === filters.taskId);
  }

  // Filter by type (revenue/expense)
  if (filters.type) {
    entries = entries.filter((e) => e.type === filters.type);
  }

  // Filter by category
  if (filters.category) {
    entries = entries.filter((e) => e.category === filters.category);
  }

  // Filter by status
  if (filters.status) {
    entries = entries.filter(
      (e) =>
        normalizeFinancialStatus(e.status) ===
        normalizeFinancialStatus(filters.status)
    );
  }

  // Filter by date range
  if (filters.dateFrom) {
    entries = entries.filter((e) => e.date >= filters.dateFrom);
  }
  if (filters.dateTo) {
    entries = entries.filter((e) => e.date <= filters.dateTo);
  }

  // Sort by date (newest first) by default
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  return entries;
};

/**
 * Compute total amount from entries
 * @param {Array} entries - Financial entries
 * @returns {Number} Total amount
 */
const normalizeAmount = (entry) => Number(entry.amount || 0);

const computeTotal = (entries) => {
  return entries.reduce((sum, entry) => sum + normalizeAmount(entry), 0);
};

// Accounting rule: sign is determined ONLY by entry.type (scope never flips sign).
const getSignedAmount = (entry) => {
  const amount = normalizeAmount(entry);
  if (entry.type === "expense") return -amount;
  if (entry.type === "revenue") return amount;
  return 0;
};

const sumByType = (entries) =>
  entries.reduce(
    (totals, entry) => {
      const amount = normalizeAmount(entry);
      if (entry.type === "revenue") totals.revenue += amount;
      if (entry.type === "expense") totals.expense += amount;
      return totals;
    },
    { revenue: 0, expense: 0 }
  );

/**
 * Compute financial summary for a given filter
 * Returns detailed breakdown of revenues, expenses, and balances
 *
 * @param {Object} filters - Filter criteria
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Financial summary
 */
export const computeFinancialSummary = (filters = {}, allEntries = []) => {
  const entries = filterFinancialEntries(filters, allEntries);

  // Separate by type
  const revenues = entries.filter((e) => e.type === "revenue");
  const expenses = entries.filter((e) => e.type === "expense");

  // Totals
  const totalRevenue = computeTotal(revenues);
  const totalExpense = computeTotal(expenses);

  // Revenue breakdown
  const honoraires = computeTotal(
    revenues.filter((e) => e.category === "honoraires")
  );
  const advances = computeTotal(
    revenues.filter((e) => e.category === "advance")
  );
  const otherRevenue = computeTotal(
    revenues.filter((e) => e.category === "other")
  );

  // Expense breakdown
  const fraisJudiciaires = computeTotal(
    expenses.filter((e) => e.category === "frais_judiciaires")
  );
  const fraisHuissier = computeTotal(
    expenses.filter((e) => e.category === "frais_huissier")
  );
  const fraisBureau = computeTotal(
    expenses.filter((e) => e.category === "frais_bureau")
  );
  const otherExpense = computeTotal(
    expenses.filter((e) => e.category === "other")
  );

  // Paid amounts (only entries with status 'paid')
  const paidEntries = entries.filter((e) => e.status === "paid");
  const totalPaid = computeTotal(
    paidEntries.filter((e) => e.type === "revenue")
  );
  const totalExpensePaid = computeTotal(
    paidEntries.filter((e) => e.type === "expense")
  );

  // Confirmed but not paid
  const confirmedRevenue = computeTotal(
    revenues.filter((e) => e.status === "confirmed" || e.status === "draft")
  );
  const confirmedExpense = computeTotal(
    expenses.filter((e) => e.status === "confirmed" || e.status === "draft")
  );

  // Balance calculations
  const netBalance = totalRevenue - totalExpense; // Total owed by client (honoraires + expenses)
  const amountPaid = totalPaid; // What client has paid (advances + payments)
  const remainingBalance = netBalance - amountPaid; // What client still owes

  // For clients: positive remainingBalance = client owes money
  // For clients: negative remainingBalance = client has credit

  return {
    // Raw totals
    totalRevenue,
    totalExpense,
    netBalance,

    // Revenue breakdown
    honoraires,
    advances,
    otherRevenue,

    // Expense breakdown
    fraisJudiciaires,
    fraisHuissier,
    fraisBureau,
    otherExpense,

    // Payment status
    totalPaid,
    totalExpensePaid,
    confirmedRevenue,
    confirmedExpense,

    // Balance (what matters most for clients)
    amountPaid, // Total paid by client
    remainingBalance, // Amount still owed

    // Counts
    entryCount: entries.length,
    revenueCount: revenues.length,
    expenseCount: expenses.length,
  };
};

/**
 * Get financial summary for a specific client
 * @param {Number} clientId - Client ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Client financial summary
 */
export const getClientFinancialSummary = (clientId, allEntries = []) => {
  return computeFinancialSummary({ clientId, scope: "client" }, allEntries);
};

/**
 * Get financial summary for a specific dossier
 * @param {Number} dossierId - Dossier ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Dossier financial summary
 */
export const getDossierFinancialSummary = (dossierId, allEntries = []) => {
  return computeFinancialSummary({ dossierId, scope: "client" }, allEntries);
};

/**
 * Get financial summary for a specific lawsuit (procès)
 * @param {Number} lawsuitId - Case ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Case financial summary
 */
export const getLawsuitFinancialSummary = (lawsuitId, allEntries = []) => {
  return computeFinancialSummary({ lawsuitId, scope: "client" }, allEntries);
};

/**
 * Get financial summary for a specific mission
 * @param {Number} missionId - Mission ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Mission financial summary (expenses only)
 */
export const getMissionFinancialSummary = (missionId, allEntries = []) => {
  return computeFinancialSummary({ missionId, scope: "client" }, allEntries);
};

/**
 * Get financial summary for all missions of an officer (huissier)
 * @param {Number} officerId - Officer ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Officer missions financial summary
 */
export const getOfficerFinancialSummary = (officerId, allEntries = []) => {
  return computeFinancialSummary({ officerId, scope: "client" }, allEntries);
};

/**
 * Get financial summary for a specific personal task
 * @param {Number} personalTaskId - Personal Task ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Personal task financial summary (internal expenses only)
 */
export const getPersonalTaskFinancialSummary = (
  personalTaskId,
  allEntries = []
) => {
  return computeFinancialSummary(
    { personalTaskId, scope: "internal" },
    allEntries
  );
};

/**
 * Get global accounting summary (all client + internal expenses)
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Global summary with client and internal breakdown
 */
export const getGlobalAccountingSummary = (allEntries = []) => {
  const clientSummary = computeFinancialSummary(
    { scope: "client" },
    allEntries
  );
  const internalSummary = computeFinancialSummary(
    { scope: "internal" },
    allEntries
  );

  return {
    client: clientSummary,
    internal: internalSummary,
    total: {
      revenue: clientSummary.totalRevenue,
      expense: clientSummary.totalExpense + internalSummary.totalExpense,
      netBalance: clientSummary.netBalance - internalSummary.totalExpense,
    },
  };
};

/**
 * Format amount as currency string
 * @param {Number} amount - Amount to format
 * @param {String} currency - Currency code (defaults to the active app currency)
 * @returns {String} Formatted amount
 */
export const formatCurrency = (amount, currency) =>
  formatCurrencyValue(amount, { currency });

/**
 * Get financial entries for display in tables
 * Includes computed display fields
 *
 * @param {Object} filters - Filter criteria
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Array} Entries with display fields
 */
export const getFinancialEntriesForDisplay = (
  filters = {},
  allEntries = []
) => {
  const entries = filterFinancialEntries(filters, allEntries);

  return entries.map((entry) => ({
    ...entry,
    // Display fields
    categoryLabel: i18next.t(`table.category.${entry.category}`, {
      ns: "accounting",
      defaultValue: financialCategories[entry.category]?.label || entry.category,
    }),
    categoryColor: financialCategories[entry.category]?.color || "gray",
    statusLabel: i18next.t(`table.status.${normalizeFinancialStatus(entry.status)}`, {
      ns: "accounting",
      defaultValue: financialStatuses[entry.status]?.label || entry.status,
    }),
    statusColor:
      financialStatuses[normalizeFinancialStatus(entry.status)]?.color || "gray",
    amountFormatted: formatCurrency(entry.amount),
    amountWithSign:
      entry.type === "expense"
        ? `-${formatCurrency(entry.amount)}`
        : `+${formatCurrency(entry.amount)}`,

    // Entity references for display
    entityReference: entry.lawsuitReference
      ? `${entry.lawsuitReference}`
      : entry.dossierReference
      ? `${entry.dossierReference}`
      : entry.clientName || "-",
  }));
};

/**
 * Get client balance details
 * Returns a comprehensive breakdown of what the client owes
 *
 * @param {Number} clientId - Client ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Balance details
 */
export const getClientBalanceDetails = (clientId, allEntries = []) => {
  const summary = getClientFinancialSummary(clientId, allEntries);

  // Total amount owed by client
  const totalOwed = summary.honoraires; // Honoraires are what client must pay

  // Reimbursable expenses (paid by firm on behalf of client)
  // Include fraisJudiciaires, fraisHuissier, and otherExpense (for "Other" category expenses)
  const reimbursableExpenses =
    summary.fraisJudiciaires + summary.fraisHuissier + summary.otherExpense;

  // Total client should pay
  const totalDue = totalOwed + reimbursableExpenses;

  // What client has already paid
  const totalPaid = summary.advances;

  // Final balance
  const balance = totalDue - totalPaid;

  return {
    totalOwed, // Honoraires
    reimbursableExpenses, // Expenses client must reimburse
    totalDue, // Total amount client must pay
    totalPaid, // What client has paid (advances)
    balance, // Remaining balance (positive = client owes, negative = client has credit)

    // Status
    isFullyPaid: balance <= 0,
    hasCredit: balance < 0,
    owesAmount: balance > 0,

    // Breakdown
    honoraires: summary.honoraires,
    advances: summary.advances,
    fraisJudiciaires: summary.fraisJudiciaires,
    fraisHuissier: summary.fraisHuissier,
    otherExpense: summary.otherExpense,
  };
};

/**
 * Get internal expenses summary
 * Returns summary of office expenses (Personal Tasks, etc.)
 *
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Internal expenses summary
 */
export const getInternalExpensesSummary = (allEntries = []) => {
  return computeFinancialSummary({ scope: "internal" }, allEntries);
};

/**
 * Validate financial entry data
 * @param {Object} entry - Entry data to validate
 * @returns {Object} { valid: boolean, errors: [] }
 */
export const validateFinancialEntry = (entry) => {
  const errors = [];

  // Required fields
  if (!entry.type) errors.push("Type is required");
  if (!entry.category) errors.push("Category is required");
  if (!entry.amount || entry.amount <= 0)
    errors.push("Amount must be greater than 0");
  const dueDate = entry.dueDate || entry.due_date;
  if (!dueDate) errors.push("Due date is required");
  if (!entry.description) errors.push("Description is required");
  if (!entry.scope) errors.push("Scope (client/internal) is required");

  // Client scope requires clientId
  if (entry.scope === "client" && !entry.clientId) {
    errors.push("Client is required for client operations");
  }

  // Type/Category compatibility
  const categoryMeta = financialCategories[entry.category];
  if (categoryMeta && categoryMeta.type !== "both") {
    if (categoryMeta.type !== entry.type) {
      errors.push(
        `Category ${categoryMeta.label} incompatible with type ${entry.type}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ========================================
// FINANCIAL STABILIZATION (Phase 1) - Balance for Blockers
// ========================================

/**
 * Get client RECEIVABLE balance for closure validation
 * This is what matters for closure blockers - only receivable entries
 * (what client owes to firm), not internal/payable expenses.
 *
 * @param {Number} clientId - Client ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} { hasOutstanding, outstandingBalance, unpaidEntries }
 */
export const getClientReceivableBalance = (clientId, allEntries = []) => {
  // Only receivable entries (client owes money)
  const receivableEntries = filterFinancialEntries(
    { clientId, direction: "receivable" },
    allEntries
  );

  // Calculate totals
  let totalOwed = 0;
  let totalPaid = 0;
  const unpaidEntries = [];

  receivableEntries.forEach((entry) => {
    const amount = Number(entry.amount || 0);
    totalOwed += amount;

    // Check if paid (using isPaid flag or paidAt)
    if (entry.isPaid || entry.paidAt) {
      totalPaid += amount;
    } else {
      unpaidEntries.push(entry);
    }
  });

  const outstandingBalance = totalOwed - totalPaid;

  return {
    hasOutstanding: outstandingBalance > 0,
    totalOwed,
    totalPaid,
    outstandingBalance,
    unpaidEntries,
    unpaidCount: unpaidEntries.length,
  };
};

/**
 * Check if a dossier has outstanding receivable balance
 * Uses client balance (dossiers share client's financial state)
 *
 * @param {Number} dossierId - Dossier ID
 * @param {Number} clientId - Client ID (from dossier)
 * @param {Array} allEntries - All financial entries
 * @returns {Object} Balance info for closure blocker
 */
export const getDossierReceivableBalance = (
  dossierId,
  clientId,
  allEntries = []
) => {
  // Get client-level receivable balance
  const clientBalance = getClientReceivableBalance(clientId, allEntries);

  // Filter unpaid entries that are specifically linked to this dossier
  const dossierUnpaid = clientBalance.unpaidEntries.filter(
    (e) => e.dossierId === dossierId
  );

  return {
    ...clientBalance,
    dossierSpecificUnpaid: dossierUnpaid,
    dossierSpecificCount: dossierUnpaid.length,
    // Note: closure blocks if ANY client receivable is unpaid (not just dossier-specific)
    // This is intentional - settling all client balances is a business rule
  };
};

/**
 * Get statistics for accounting dashboard
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Dashboard statistics
 */
export const getAccountingStatistics = (allEntries = []) => {
  const allClientEntries = filterFinancialEntries(
    { scope: "client" },
    allEntries
  );
  const allInternalEntries = filterFinancialEntries(
    { scope: "internal" },
    allEntries
  );

  // Client financials
  const clientRevenues = allClientEntries.filter((e) => e.type === "revenue");
  const clientExpenses = allClientEntries.filter((e) => e.type === "expense");

  const clientTotals = sumByType(allClientEntries);
  const totalClientRevenue = clientTotals.revenue;
  const totalClientExpense = clientTotals.expense;
  const totalClientPaid = computeTotal(
    clientRevenues.filter((e) => e.isPaid || e.paidAt)
  );
  const totalClientPending = computeTotal(
    clientRevenues.filter(
      (e) =>
        !e.isPaid &&
        !e.paidAt &&
        normalizeFinancialStatus(e.status) === "confirmed"
    )
  );

  // Internal (office) entries
  const internalExpenses = allInternalEntries.filter((e) => e.type === "expense");
  const internalTotals = sumByType(allInternalEntries);
  const totalInternalRevenue = internalTotals.revenue;
  const totalInternalExpense = internalTotals.expense;
  const totalInternalPaid = computeTotal(
    internalExpenses.filter((e) => e.isPaid || e.paidAt)
  );
  const totalInternalPending = computeTotal(
    internalExpenses.filter(
      (e) =>
        !e.isPaid &&
        !e.paidAt &&
        normalizeFinancialStatus(e.status) === "confirmed"
    )
  );

  // Global
  const totalRevenue = totalClientRevenue + totalInternalRevenue;
  const totalExpense = totalClientExpense + totalInternalExpense;
  const netProfit = [...allClientEntries, ...allInternalEntries].reduce(
    (sum, entry) => sum + getSignedAmount(entry),
    0
  );

  return {
    // Client
    totalClientRevenue,
    totalClientExpense,
    totalClientPaid,
    totalClientPending,
    clientNetBalance: totalClientRevenue - totalClientExpense,

    // Internal
    totalInternalRevenue,
    totalInternalExpense,
    totalInternalPaid,
    totalInternalPending,

    // Global
    totalRevenue,
    totalExpense,
    netProfit,

    // Counts
    totalEntries: allClientEntries.length + allInternalEntries.length,
    clientEntries: allClientEntries.length,
    internalEntries: allInternalEntries.length,
  };
};

export default {
  filterFinancialEntries,
  computeFinancialSummary,
  getClientFinancialSummary,
  getDossierFinancialSummary,
  getLawsuitFinancialSummary,
  getMissionFinancialSummary,
  getOfficerFinancialSummary,
  getPersonalTaskFinancialSummary,
  getGlobalAccountingSummary,
  formatCurrency,
  getFinancialEntriesForDisplay,
  getClientBalanceDetails,
  getInternalExpensesSummary,
  validateFinancialEntry,
  getAccountingStatistics,
  // Financial stabilization exports
  getClientReceivableBalance,
  getDossierReceivableBalance,
};

