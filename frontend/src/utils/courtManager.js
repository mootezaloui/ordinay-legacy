/**
 * Court Manager
 * Manages custom courts/tribunals that users can add
 * Stored in localStorage for persistence
 */

const STORAGE_KEY = "lawyer_app_custom_courts";

/**
 * Get all custom courts from localStorage
 * @returns {Array} Array of court objects with value and label
 */
export function getCustomCourts() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom courts:", error);
    return [];
  }
}

/**
 * Add a new custom court
 * @param {string} name - The name of the court
 * @returns {Object} The created court object
 */
export function addCustomCourt(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Court name is required");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Name cannot be empty");
  }

  const customCourts = getCustomCourts();

  // Check if already exists (case-insensitive)
  const exists = customCourts.some(
    (court) => court.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("This court already exists");
  }

  const newCourt = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  const updated = [...customCourts, newCourt];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newCourt;
  } catch (error) {
    console.error("Error saving custom court:", error);
    throw new Error("Error saving");
  }
}

/**
 * Remove a custom court
 * @param {string} value - The value/name of the court to remove
 */
export function removeCustomCourt(value) {
  const customCourts = getCustomCourts();
  const updated = customCourts.filter((court) => court.value !== value);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom court:", error);
    throw new Error("Error deleting");
  }
}

/**
 * Get all courts (default + custom)
 * @param {Array} defaultCourts - Default courts to include
 * @returns {Array} Combined list of all courts
 */
export function getAllCourts(defaultCourts = []) {
  const customCourts = getCustomCourts();
  return [...defaultCourts, ...customCourts];
}
