/**
 * Mission Type Manager
 * Manages custom mission types that users can add
 * Stored in localStorage for persistence
 */

const STORAGE_KEY = "lawyer_app_custom_mission_types";

/**
 * Get all custom mission types from localStorage
 * @returns {Array} Array of mission type objects with value and label
 */
export function getCustomMissionTypes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom mission types:", error);
    return [];
  }
}

/**
 * Add a new custom mission type
 * @param {string} name - The name of the mission type
 * @returns {Object} The created mission type object
 */
export function addCustomMissionType(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Mission type name is required");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Name cannot be empty");
  }

  const customTypes = getCustomMissionTypes();

  // Check if already exists (case-insensitive)
  const exists = customTypes.some(
    (type) => type.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("This mission type already exists");
  }

  const newType = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  const updated = [...customTypes, newType];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newType;
  } catch (error) {
    console.error("Error saving custom mission type:", error);
    throw new Error("Error saving");
  }
}

/**
 * Remove a custom mission type
 * @param {string} value - The value/name of the mission type to remove
 */
export function removeCustomMissionType(value) {
  const customTypes = getCustomMissionTypes();
  const updated = customTypes.filter((type) => type.value !== value);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom mission type:", error);
    throw new Error("Error deleting");
  }
}

/**
 * Get all mission types (default + custom)
 * @param {Array} defaultTypes - Default mission types to include
 * @returns {Array} Combined list of all mission types
 */
export function getAllMissionTypes(defaultTypes = []) {
  const customTypes = getCustomMissionTypes();
  return [...defaultTypes, ...customTypes];
}
