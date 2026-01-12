/**
 * Financial Entry Constants
 * Metadata for financial categories and statuses
 *
 * FINANCIAL STABILIZATION (Phase 1):
 * - Canonical statuses: draft, confirmed, cancelled
 * - Direction: receivable (client owes) | payable (firm owes)
 */

// ========================================
// CANONICAL STATUS VALUES
// ========================================
// These are the only valid statuses after stabilization.
// Legacy values are mapped for backward compatibility.

export const CANONICAL_STATUSES = {
  draft: "draft",
  confirmed: "confirmed",
  cancelled: "cancelled",
};

// Legacy status mappings (DB/backend may send these)
export const STATUS_MAPPINGS = {
  // Standard mappings
  draft: "draft",
  confirmed: "confirmed",
  cancelled: "cancelled",
  // Legacy mappings
  pending: "draft",
  posted: "confirmed",
  void: "cancelled",
  paid: "confirmed", // paid entries have status=confirmed + paidAt set
  // French legacy
  brouillon: "draft",
  confirmé: "confirmed",
  annulé: "cancelled",
  payé: "confirmed",
};

/**
 * Normalize status to canonical value
 * @param {string} status - Raw status value
 * @returns {string} Canonical status (draft/confirmed/cancelled)
 */
export const normalizeFinancialStatus = (status) => {
  if (!status) return "draft";
  const lowered = String(status).toLowerCase();
  return STATUS_MAPPINGS[lowered] || STATUS_MAPPINGS[status] || "draft";
};

// ========================================
// DIRECTION VALUES
// ========================================
// receivable: Client owes money to firm (fees, reimbursable expenses)
// payable: Firm owes money (internal expenses, not client's obligation)

export const FINANCIAL_DIRECTIONS = {
  receivable: {
    label: "Receivable",
    description: "Client owes this amount",
    icon: "fas fa-arrow-down",
    color: "green",
  },
  payable: {
    label: "Payable",
    description: "Firm expense (not client obligation)",
    icon: "fas fa-arrow-up",
    color: "orange",
  },
};

/**
 * Determine direction based on entry type and scope
 * @param {string} type - revenue/expense
 * @param {string} scope - client/internal
 * @returns {string} receivable | payable
 */
export const determineDirection = (type, scope) => {
  // Internal expenses are firm costs, not client obligations
  if (scope === "internal") {
    return "payable";
  }
  // Revenue from clients = receivable
  // Client-scoped expenses = client reimburses = receivable
  return "receivable";
};

// Category metadata
export const financialCategories = {
  honoraires: {
    label: "Fees",
    type: "revenue",
    icon: "fas fa-money-bill-wave",
    color: "emerald",
    defaultDirection: "receivable",
  },
  advance: {
    label: "Client Advance",
    type: "revenue",
    icon: "fas fa-hand-holding-usd",
    color: "blue",
    defaultDirection: "receivable",
  },
  frais_judiciaires: {
    label: "Court Fees",
    type: "expense",
    icon: "fas fa-gavel",
    color: "orange",
    defaultDirection: "receivable", // Client reimburses
  },
  frais_huissier: {
    label: "Bailiff Fees",
    type: "expense",
    icon: "fas fa-file-invoice",
    color: "purple",
    defaultDirection: "receivable", // Client reimburses
  },
  frais_bureau: {
    label: "Office Expenses",
    type: "expense",
    icon: "fas fa-building",
    color: "gray",
    defaultDirection: "payable", // Internal, not client obligation
  },
  other: {
    label: "Other",
    type: "both",
    icon: "fas fa-ellipsis-h",
    color: "slate",
    defaultDirection: "receivable",
  },
};

// Status metadata (using canonical statuses)
export const financialStatuses = {
  draft: {
    label: "Draft",
    color: "slate",
    icon: "fas fa-file",
    description: "Entry not yet confirmed",
    canEdit: true,
    canDelete: true,
  },
  confirmed: {
    label: "Confirmed",
    color: "blue",
    icon: "fas fa-check-circle",
    description: "Entry confirmed, may be paid",
    canEdit: true,
    canDelete: false, // Can only cancel
  },
  cancelled: {
    label: "Cancelled",
    color: "red",
    icon: "fas fa-times-circle",
    description: "Entry cancelled (preserved for audit)",
    canEdit: false,
    canDelete: false,
  },
};

// Legacy alias for backward compatibility
export const legacyStatusMap = {
  paid: {
    label: "Paid",
    color: "green",
    icon: "fas fa-check-double",
  },
  void: {
    label: "Void",
    color: "red",
    icon: "fas fa-times-circle",
  },
};
