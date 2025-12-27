/**
 * Financial Entry Constants
 * Metadata for financial categories and statuses
 */

// Category metadata
export const financialCategories = {
  honoraires: {
    label: "Fees",
    type: "revenue",
    icon: "fas fa-money-bill-wave",
    color: "emerald",
  },
  advance: {
    label: "Client Advance",
    type: "revenue",
    icon: "fas fa-hand-holding-usd",
    color: "blue",
  },
  frais_judiciaires: {
    label: "Court Fees",
    type: "expense",
    icon: "fas fa-gavel",
    color: "orange",
  },
  frais_huissier: {
    label: "Bailiff Fees",
    type: "expense",
    icon: "fas fa-file-invoice",
    color: "purple",
  },
  frais_bureau: {
    label: "Office Expenses",
    type: "expense",
    icon: "fas fa-building",
    color: "gray",
  },
  other: {
    label: "Other",
    type: "both",
    icon: "fas fa-ellipsis-h",
    color: "slate",
  },
};

// Status metadata
export const financialStatuses = {
  draft: {
    label: "Draft",
    color: "slate",
    icon: "fas fa-file",
  },
  confirmed: {
    label: "Confirmed",
    color: "blue",
    icon: "fas fa-check-circle",
  },
  paid: {
    label: "Paid",
    color: "green",
    icon: "fas fa-check-double",
  },
  void: {
    label: "Cancelled",
    color: "red",
    icon: "fas fa-times-circle",
  },
};
