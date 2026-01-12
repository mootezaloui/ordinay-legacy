/**
 * Category Manager
 * Manages custom dossier categories that users can add
 * Stored in localStorage for persistence
 */

const STORAGE_KEY = "lawyer_app_custom_categories";

/**
 * Get all custom categories from localStorage
 * @returns {Array} Array of category objects with value and label
 */
export function getCustomCategories() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom categories:", error);
    return [];
  }
}

/**
 * Add a new custom category
 * @param {string} name - The name of the category
 * @returns {Object} The created category object
 */
export function addCustomCategory(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Category name is required");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Category name cannot be empty");
  }

  const customCategories = getCustomCategories();

  // Check if already exists (case-insensitive)
  const exists = customCategories.some(
    (category) => category.label.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exists) {
    throw new Error("This category already exists in the list");
  }

  const newCategory = {
    value: trimmedName,
    label: trimmedName,
    custom: true,
  };

  const updated = [...customCategories, newCategory];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newCategory;
  } catch (error) {
    console.error("Error saving custom category:", error);
    throw new Error("Error saving");
  }
}

/**
 * Remove a custom category
 * @param {string} value - The value/name of the category to remove
 */
export function removeCustomCategory(value) {
  const customCategories = getCustomCategories();
  const updated = customCategories.filter(
    (category) => category.value !== value
  );

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing custom category:", error);
    throw new Error("Error deleting");
  }
}

/**
 * Get all categories (default + custom)
 * @param {Array} defaultCategories - Default categories to include
 * @returns {Array} Combined list of all categories
 */
export function getAllCategories(defaultCategories = []) {
  const customCategories = getCustomCategories();
  return [...defaultCategories, ...customCategories];
}
