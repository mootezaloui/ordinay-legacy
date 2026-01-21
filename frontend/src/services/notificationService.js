import { apiClient } from "./api/client";
import { getAppLicenseState } from "./licenseService";

const ENDPOINT = "/notifications";
const isNotFoundError = (error) => error?.message?.includes("API error 404");
const isLicenseLocked = () =>
  ["ACTIVATING", "ERROR"].includes(getAppLicenseState());

/**
 * notificationService.js
 *
 * API client for notification CRUD operations
 * Connects to backend /api/notifications endpoints
 */

/**
 * Dismiss a notification for a user (persist dedupe_key)
 * @param {string} dedupe_key
 * @param {number} user_id
 * @returns {Promise<void>}
 */
export async function dismissNotification(dedupe_key, user_id = 1) {
  if (isLicenseLocked()) return null;
  try {
    await apiClient.post(`${ENDPOINT}/dismiss`, { dedupe_key, user_id });
  } catch (error) {
    console.error("Error dismissing notification:", error);
    throw error;
  }
}
/**
 * Bulk clear all notifications for the current user (optionally by entity_type/entity_id)
 * @param {Object} [options] - Optional filter (entity_type, entity_id)
 * @returns {Promise<number>} Number of notifications cleared
 */
export async function clearAllNotifications(options = {}) {
  if (isLicenseLocked()) return 0;
  try {
    const params = new URLSearchParams(options).toString();
    const url = params ? `${ENDPOINT}?${params}` : ENDPOINT;
    const result = await apiClient.delete(url);
    return result.cleared;
  } catch (error) {
    console.error("Error clearing all notifications:", error);
    throw error;
  }
}

/**
 * Fetch all notifications
 * @returns {Promise<Array>} Array of notification objects
 */
export async function fetchNotifications() {
  try {
    const data = await apiClient.get(ENDPOINT);
    return data;
  } catch (error) {
    console.error("Error fetching notifications:", error);
    throw error;
  }
}

/**
 * Get a single notification by ID
 * @param {number} id - Notification ID
 * @returns {Promise<Object>} Notification object
 */
export async function getNotification(id) {
  try {
    const data = await apiClient.get(`${ENDPOINT}/${id}`);
    return data;
  } catch (error) {
    console.error(`Error fetching notification ${id}:`, error);
    throw error;
  }
}

/**
 * Create a new notification
 * @param {Object} data - Notification data
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} [data.severity='info'] - Severity level (info, warning, error)
 * @param {string} [data.status='unread'] - Status (unread, read, archived)
 * @param {string} [data.entity_type] - Related entity type
 * @param {number} [data.entity_id] - Related entity ID
 * @param {string} [data.scheduled_at] - ISO datetime for scheduled notification
 * @returns {Promise<Object>} Created notification object
 */
export async function createNotification(data) {
  if (isLicenseLocked()) return null;
  try {
    const result = await apiClient.post(ENDPOINT, data);
    return result;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Update an existing notification
 * @param {number} id - Notification ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated notification object
 */
export async function updateNotification(id, data) {
  if (isLicenseLocked()) return null;
  try {
    const result = await apiClient.put(`${ENDPOINT}/${id}`, data);
    return result;
  } catch (error) {
    console.error(`Error updating notification ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a notification (soft delete)
 * @param {number} id - Notification ID
 * @returns {Promise<void>}
 */
export async function deleteNotification(id, options = {}) {
  if (isLicenseLocked()) return;
  try {
    const params = new URLSearchParams(options).toString();
    const url = params ? `${ENDPOINT}/${id}?${params}` : `${ENDPOINT}/${id}`;
    await apiClient.delete(url);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    console.error(`Error deleting notification ${id}:`, error);
    throw error;
  }
}

/**
 * Mark a notification as read
 * @param {number} id - Notification ID
 * @returns {Promise<Object>} Updated notification object
 */
export async function markAsRead(id) {
  if (isLicenseLocked()) return null;
  try {
    const data = await apiClient.put(`${ENDPOINT}/${id}`, {
      status: "read",
      read_at: new Date().toISOString(),
    });
    return data;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    console.error(`Error marking notification ${id} as read:`, error);
    throw error;
  }
}

/**
 * Mark all notifications as read
 * @param {Array<number>} notificationIds - Array of notification IDs to mark as read
 * @returns {Promise<Array>} Array of updated notifications
 */
export async function markAllAsRead(notificationIds) {
  if (isLicenseLocked()) return [];
  try {
    const promises = notificationIds.map((id) => markAsRead(id));
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
}

/**
 * Archive a notification
 * @param {number} id - Notification ID
 * @returns {Promise<Object>} Updated notification object
 */
export async function archiveNotification(id) {
  if (isLicenseLocked()) return null;
  try {
    const data = await apiClient.put(`${ENDPOINT}/${id}`, {
      status: "archived",
    });
    return data;
  } catch (error) {
    console.error(`Error archiving notification ${id}:`, error);
    throw error;
  }
}
