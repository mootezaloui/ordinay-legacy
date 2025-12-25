/**
 * referenceUtils.js
 *
 * Centralized Reference & Numbering System
 *
 * Provides:
 * - Auto-generation of entity references (Dossier, Procès, Mission)
 * - Uniqueness validation across entity types
 * - Support for user-defined references
 *
 * Architecture:
 * - Each entity type has its own reference format (DOS-, PRO-, MIS-)
 * - References include year for organizational clarity
 * - Incremental numbering per entity type
 * - Strict uniqueness enforcement
 *
 * Usage:
 * const ref = generateEntityReference('dossier');
 * const isUnique = isReferenceUnique('dossier', 'DOS-2025-001');
 * const isValid = isReferenceUnique('dossier', 'DOS-2025-001', currentId);
 */


/**
 * Reference format definitions
 */
const REFERENCE_FORMATS = {
  dossier: {
    prefix: "DOS",
    format: "DOS-YYYY-XXX",
    example: "DOS-2025-001",
  },
  case: {
    prefix: "PRO",
    format: "PRO-YYYY-XXX",
    example: "PRO-2025-001",
  },
  mission: {
    prefix: "MIS",
    format: "MIS-YYYY-XXX",
    example: "MIS-2025-001",
  },
};

/**
 * Get all existing references for a given entity type
 * @param {string} entityType - 'dossier', 'case', or 'mission'
 * @param {Object} entities - All entities data { dossiers, cases, missions, etc. }
 * @returns {Array<{id: number, reference: string}>} - Array of {id, reference} objects
 */
function getExistingReferences(entityType, entities) {
  // Handle null or undefined entities
  if (!entities || typeof entities !== 'object') {
    return [];
  }

  switch (entityType) {
    case "dossier":
      return (entities.dossiers || []).map((d) => ({
        id: d.id,
        reference: d.caseNumber || d.reference,
      }));
    case "case":
      return (entities.cases || []).map((c) => ({
        id: c.id,
        reference: c.caseNumber || c.reference,
      }));
    case "mission":
      return (entities.missions || []).map((m) => ({
        id: m.id,
        reference: m.missionNumber || m.reference,
      }));
    default:
      return [];
  }
}

/**
 * Generate next reference number for a given entity type
 * Automatically increments based on existing references for current year
 *
 * @param {string} entityType - 'dossier', 'case', or 'mission'
 * @param {Object} entities - All entities data { dossiers, cases, missions, etc. }
 * @returns {string} - Generated reference (e.g., "DOS-2025-001")
 */
export function generateEntityReference(entityType, entities = {}) {
  const format = REFERENCE_FORMATS[entityType];

  if (!format) {
    console.error(`Unknown entity type: ${entityType}`);
    return null;
  }

  const currentYear = new Date().getFullYear();
  const prefix = `${format.prefix}-${currentYear}-`;

  // Get all existing references for this entity type
  const existingRefs = getExistingReferences(entityType, entities);

  // Filter references for current year and extract numbers
  const currentYearNumbers = existingRefs
    .map((item) => item.reference)
    .filter((ref) => ref && ref.startsWith(prefix))
    .map((ref) => {
      const match = ref.match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((num) => !isNaN(num));

  // Find the maximum number and increment
  const maxNumber =
    currentYearNumbers.length > 0 ? Math.max(...currentYearNumbers) : 0;

  const nextNumber = maxNumber + 1;

  // Format with leading zeros (XXX = 3 digits)
  const paddedNumber = String(nextNumber).padStart(3, "0");

  return `${prefix}${paddedNumber}`;
}

/**
 * Check if a reference is unique across the entity type
 *
 * @param {string} entityType - 'dossier', 'case', or 'mission'
 * @param {string} reference - Reference to validate
 * @param {number|null} currentEntityId - ID of entity being edited (exclude from check)
 * @param {Object} entities - All entities data { dossiers, cases, missions, etc. }
 * @returns {boolean} - true if unique, false if duplicate
 */
export function isReferenceUnique(
  entityType,
  reference,
  currentEntityId = null,
  entities = {}
) {
  if (!reference) {
    return true; // Empty references are valid (will be auto-generated)
  }

  const existingRefs = getExistingReferences(entityType, entities);

  // Check for duplicates, excluding current entity (for edit mode)
  const isDuplicate = existingRefs.some((item) => {
    // Skip if it's the same entity being edited
    if (currentEntityId && item.id === currentEntityId) {
      return false;
    }

    return item.reference === reference;
  });

  return !isDuplicate;
}

/**
 * Validate reference format (optional - for future use)
 * Checks if reference follows expected pattern
 *
 * @param {string} entityType - 'dossier', 'case', or 'mission'
 * @param {string} reference - Reference to validate
 * @returns {boolean} - true if format is valid
 */
export function isReferenceFormatValid(entityType, reference) {
  if (!reference) {
    return true; // Empty is valid
  }

  const format = REFERENCE_FORMATS[entityType];
  if (!format) {
    return false;
  }

  // Expected pattern: PREFIX-YYYY-XXX (e.g., DOS-2025-001)
  const pattern = new RegExp(`^${format.prefix}-\\d{4}-\\d{3,}$`);
  return pattern.test(reference);
}

/**
 * Get reference format information for display
 *
 * @param {string} entityType - 'dossier', 'case', or 'mission'
 * @returns {object|null} - Format information
 */
export function getReferenceFormat(entityType) {
  return REFERENCE_FORMATS[entityType] || null;
}

/**
 * Get user-friendly error message for duplicate reference
 *
 * @param {string} entityType - 'dossier', 'case', or 'mission'
 * @param {string} reference - The duplicate reference
 * @returns {string} - Localized error message
 */
export function getDuplicateReferenceError(entityType, reference) {
  const entityNames = {
    dossier: "dossier",
    case: "procès",
    mission: "mission",
  };

  const entityName = entityNames[entityType] || "entité";

  return `Cette référence "${reference}" est déjà utilisée pour un autre ${entityName}. Veuillez en choisir une autre.`;
}

/**
 * Normalize reference (uppercase, trim whitespace)
 *
 * @param {string} reference - Reference to normalize
 * @returns {string} - Normalized reference
 */
export function normalizeReference(reference) {
  if (!reference) {
    return "";
  }

  return reference.trim().toUpperCase();
}
