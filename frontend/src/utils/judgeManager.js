/**
 * Judge Manager
 * Manages custom judge names that users can add
 * Stored in localStorage for persistence
 */

const STORAGE_KEY = "lawyer_app_custom_judges";

/**
 * Get all custom judges from localStorage
 * @returns {Array} Array of judge objects with value and label
 */
export function getCustomJudges() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom judges:", error);
    return [];
  }
}

/**
 * Add a new custom judge
 * @param {string} name - The name of the judge
 * @returns {Object} The created judge object
 */
export function addCustomJudge(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Judge name is required");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Name cannot be empty");
  }

  const customJudges = getCustomJudges();

  // Check if already exists (case-insensitive)
  const exists = customJudges.some(
    (judge) => judge.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("This judge already exists");
  }

  const newJudge = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  const updated = [...customJudges, newJudge];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newJudge;
  } catch (error) {
    console.error("Error saving custom judge:", error);
    throw new Error("Error saving");
  }
}

/**
 * Remove a custom judge
 * @param {string} value - The value/name of the judge to remove
 */
export function removeCustomJudge(value) {
  const customJudges = getCustomJudges();
  const updated = customJudges.filter((judge) => judge.value !== value);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom judge:", error);
    throw new Error("Error deleting");
  }
}

/**
 * Get all judges (default + custom)
 * @param {Array} defaultJudges - Default judges to include
 * @returns {Array} Combined list of all judges
 */
export function getAllJudges(defaultJudges = []) {
  const customJudges = getCustomJudges();
  return [...defaultJudges, ...customJudges];
}
