/**
 * Assignee Manager
 * Manages custom assignees that users can add
 * Stored in localStorage for persistence
 */

const STORAGE_KEY = "lawyer_app_custom_assignees";

/**
 * Get all custom assignees from localStorage
 * @returns {Array} Array of assignee objects with value and label
 */
export function getCustomAssignees() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom assignees:", error);
    return [];
  }
}

/**
 * Add a new custom assignee
 * @param {string} name - The name of the assignee
 * @returns {Object} The created assignee object
 */
export function addCustomAssignee(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Assignee name is required");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Assignee name cannot be empty");
  }

  const customAssignees = getCustomAssignees();

  // Check if already exists (case-insensitive)
  const exists = customAssignees.some(
    (assignee) => assignee.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("This assignee already exists");
  }

  const newAssignee = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  const updated = [...customAssignees, newAssignee];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newAssignee;
  } catch (error) {
    console.error("Error saving custom assignee:", error);
    throw new Error("Error saving");
  }
}

/**
 * Remove a custom assignee
 * @param {string} value - The value/name of the assignee to remove
 */
export function removeCustomAssignee(value) {
  const customAssignees = getCustomAssignees();
  const updated = customAssignees.filter(
    (assignee) => assignee.value !== value
  );

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom assignee:", error);
    throw new Error("Error deleting");
  }
}

/**
 * Get all assignees (default + custom)
 * @param {Array} defaultAssignees - Default assignees to include
 * @returns {Array} Combined list of all assignees
 */
export function getAllAssignees(defaultAssignees = []) {
  const customAssignees = getCustomAssignees();
  return [...defaultAssignees, ...customAssignees];
}
