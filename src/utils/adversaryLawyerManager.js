/**
 * Adversary Lawyer Manager
 * Manages custom adversary lawyer names that users can add
 * Stored in localStorage for persistence
 */

const STORAGE_KEY = "lawyer_app_custom_adversary_lawyers";

/**
 * Get all custom adversary lawyers from localStorage
 * @returns {Array} Array of adversary lawyer objects with value and label
 */
export function getCustomAdversaryLawyers() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom adversary lawyers:", error);
    return [];
  }
}

/**
 * Add a new custom adversary lawyer
 * @param {string} name - The name of the adversary lawyer
 * @returns {Object} The created adversary lawyer object
 */
export function addCustomAdversaryLawyer(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Opposing lawyer name is required");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Name cannot be empty");
  }

  const customLawyers = getCustomAdversaryLawyers();

  // Check if already exists (case-insensitive)
  const exists = customLawyers.some(
    (lawyer) => lawyer.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("This lawyer already exists");
  }

  const newLawyer = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  const updated = [...customLawyers, newLawyer];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newLawyer;
  } catch (error) {
    console.error("Error saving custom adversary lawyer:", error);
    throw new Error("Error saving");
  }
}

/**
 * Remove a custom adversary lawyer
 * @param {string} value - The value/name of the adversary lawyer to remove
 */
export function removeCustomAdversaryLawyer(value) {
  const customLawyers = getCustomAdversaryLawyers();
  const updated = customLawyers.filter((lawyer) => lawyer.value !== value);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom adversary lawyer:", error);
    throw new Error("Error deleting");
  }
}

/**
 * Get all adversary lawyers (default + custom)
 * @param {Array} defaultLawyers - Default adversary lawyers to include
 * @returns {Array} Combined list of all adversary lawyers
 */
export function getAllAdversaryLawyers(defaultLawyers = []) {
  const customLawyers = getCustomAdversaryLawyers();
  return [...defaultLawyers, ...customLawyers];
}
