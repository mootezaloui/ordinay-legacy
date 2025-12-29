/**
 * FINANCIAL UTILITIES
 *
 * Shared functions for querying and computing financial data.
 * All financial logic is centralized here to ensure consistency.
 *
 * Key principle: Balances are COMPUTED, never stored.
 */

import {
  financialCategories,
  financialStatuses,
} from "./financialConstants";

/**
 * Filter financial entries by criteria
 * @param {Object} filters - Filter criteria
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Array} Filtered entries
 */
export const filterFinancialEntries = (filters = {}, allEntries = []) => {
  let entries = [...allEntries];

  // Exclude void entries by default
  if (filters.includeCancelled !== true) {
    entries = entries.filter((e) => e.status !== "void");
  }

  // Filter by scope
  if (filters.scope) {
    entries = entries.filter((e) => e.scope === filters.scope);
  }

  // Filter by client
  if (filters.clientId) {
    entries = entries.filter((e) => e.clientId === filters.clientId);
  }

  // Filter by dossier
  if (filters.dossierId) {
    entries = entries.filter((e) => e.dossierId === filters.dossierId);
  }

  // Filter by case (procès)
  if (filters.caseId) {
    entries = entries.filter((e) => e.caseId === filters.caseId);
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
    entries = entries.filter((e) => e.status === filters.status);
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
const computeTotal = (entries) => {
  return entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
};

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
 * Get financial summary for a specific case (procès)
 * @param {Number} caseId - Case ID
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Case financial summary
 */
export const getCaseFinancialSummary = (caseId, allEntries = []) => {
  return computeFinancialSummary({ caseId, scope: "client" }, allEntries);
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
export const getPersonalTaskFinancialSummary = (personalTaskId, allEntries = []) => {
  return computeFinancialSummary({ personalTaskId, scope: "internal" }, allEntries);
};

/**
 * Get global accounting summary (all client + internal expenses)
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Global summary with client and internal breakdown
 */
export const getGlobalAccountingSummary = (allEntries = []) => {
  const clientSummary = computeFinancialSummary({ scope: "client" }, allEntries);
  const internalSummary = computeFinancialSummary({ scope: "internal" }, allEntries);

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
 * @param {String} currency - Currency code (default: TND)
 * @returns {String} Formatted amount
 */
export const formatCurrency = (amount, currency = "TND") => {
  if (amount === null || amount === undefined) return "-";

  const formatted = amount.toLocaleString("fr-TN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${formatted} ${currency}`;
};

/**
 * Get financial entries for display in tables
 * Includes computed display fields
 *
 * @param {Object} filters - Filter criteria
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Array} Entries with display fields
 */
export const getFinancialEntriesForDisplay = (filters = {}, allEntries = []) => {
  const entries = filterFinancialEntries(filters, allEntries);

  return entries.map((entry) => ({
    ...entry,
    // Display fields
    categoryLabel: financialCategories[entry.category]?.label || entry.category,
    categoryColor: financialCategories[entry.category]?.color || "gray",
    statusLabel: financialStatuses[entry.status]?.label || entry.status,
    statusColor: financialStatuses[entry.status]?.color || "gray",
    amountFormatted: formatCurrency(entry.amount, entry.currency),
    amountWithSign:
      entry.type === "expense"
        ? `-${formatCurrency(entry.amount, entry.currency)}`
        : `+${formatCurrency(entry.amount, entry.currency)}`,

    // Entity references for display
    entityReference: entry.caseReference
      ? `${entry.caseReference}`
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
  const reimbursableExpenses = summary.fraisJudiciaires + summary.fraisHuissier + summary.otherExpense;

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
  if (!entry.date) errors.push("Date is required");
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

/**
 * Get statistics for accounting dashboard
 * @param {Array} allEntries - All financial entries (from DataContext)
 * @returns {Object} Dashboard statistics
 */
export const getAccountingStatistics = (allEntries = []) => {
  const allClientEntries = filterFinancialEntries({ scope: "client" }, allEntries);
  const allInternalEntries = filterFinancialEntries({ scope: "internal" }, allEntries);

  // Client financials
  const clientRevenues = allClientEntries.filter((e) => e.type === "revenue");
  const clientExpenses = allClientEntries.filter((e) => e.type === "expense");

  const totalClientRevenue = computeTotal(clientRevenues);
  const totalClientExpense = computeTotal(clientExpenses);
  const totalClientPaid = computeTotal(
    clientRevenues.filter((e) => e.status === "paid")
  );
  const totalClientPending = computeTotal(
    clientRevenues.filter((e) => e.status === "confirmed")
  );

  // Internal expenses
  const totalInternalExpense = computeTotal(allInternalEntries);
  const totalInternalPaid = computeTotal(
    allInternalEntries.filter((e) => e.status === "paid")
  );
  const totalInternalPending = computeTotal(
    allInternalEntries.filter((e) => e.status === "confirmed")
  );

  // Global
  const totalRevenue = totalClientRevenue;
  const totalExpense = totalClientExpense + totalInternalExpense;
  const netProfit =
    totalClientRevenue - totalClientExpense - totalInternalExpense;

  return {
    // Client
    totalClientRevenue,
    totalClientExpense,
    totalClientPaid,
    totalClientPending,
    clientNetBalance: totalClientRevenue - totalClientExpense,

    // Internal
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
  getCaseFinancialSummary,
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
};
