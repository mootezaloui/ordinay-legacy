/**
 * Phase Manager
 * Manages custom dossier phases that users can add
 * Stored in localStorage for persistence
 */

const STORAGE_KEY = "lawyer_app_custom_phases";

/**
 * Get all custom phases from localStorage
 * @returns {Array} Array of phase objects with value and label
 */
export function getCustomPhases() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom phases:", error);
    return [];
  }
}

/**
 * Add a new custom phase
 * @param {string} name - The name of the phase
 * @returns {Object} The created phase object
 */
export function addCustomPhase(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Phase name is required");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Phase name cannot be empty");
  }

  const customPhases = getCustomPhases();

  // Check if already exists (case-insensitive)
  const exists = customPhases.some(
    (phase) => phase.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("This phase already exists in the list");
  }

  const newPhase = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  const updated = [...customPhases, newPhase];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newPhase;
  } catch (error) {
    console.error("Error saving custom phase:", error);
    throw new Error("Error saving");
  }
}

/**
 * Remove a custom phase
 * @param {string} value - The value/name of the phase to remove
 */
export function removeCustomPhase(value) {
  const customPhases = getCustomPhases();
  const updated = customPhases.filter((phase) => phase.value !== value);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom phase:", error);
    throw new Error("Error deleting");
  }
}

/**
 * Get all phases (default + custom)
 * @param {Array} defaultPhases - Default phases to include
 * @returns {Array} Combined list of all phases
 */
export function getAllPhases(defaultPhases = []) {
  const customPhases = getCustomPhases();
  return [...defaultPhases, ...customPhases];
}
