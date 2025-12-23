/**
 * Financial Entry Constants
 * Metadata for financial categories and statuses
 */

// Category metadata
export const financialCategories = {
  honoraires: {
    label: "Honoraires",
    type: "revenue",
    icon: "fas fa-money-bill-wave",
    color: "emerald",
  },
  advance: {
    label: "Avance client",
    type: "revenue",
    icon: "fas fa-hand-holding-usd",
    color: "blue",
  },
  frais_judiciaires: {
    label: "Frais judiciaires",
    type: "expense",
    icon: "fas fa-gavel",
    color: "orange",
  },
  frais_huissier: {
    label: "Frais d'huissier",
    type: "expense",
    icon: "fas fa-file-invoice",
    color: "purple",
  },
  frais_bureau: {
    label: "Frais de bureau",
    type: "expense",
    icon: "fas fa-building",
    color: "gray",
  },
  other: {
    label: "Autre",
    type: "both",
    icon: "fas fa-ellipsis-h",
    color: "slate",
  },
};

// Status metadata
export const financialStatuses = {
  draft: {
    label: "Brouillon",
    color: "slate",
    icon: "fas fa-file",
  },
  confirmed: {
    label: "Confirmé",
    color: "blue",
    icon: "fas fa-check-circle",
  },
  paid: {
    label: "Payé",
    color: "green",
    icon: "fas fa-check-double",
  },
  cancelled: {
    label: "Annulé",
    color: "red",
    icon: "fas fa-times-circle",
  },
};
