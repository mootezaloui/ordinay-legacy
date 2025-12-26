/**
 * notificationService.js
 *
 * API client for notification CRUD operations
 * Connects to backend /api/notifications endpoints
 */

import { apiClient } from './api/client';

const ENDPOINT = '/notifications';

/**
 * Fetch all notifications
 * @returns {Promise<Array>} Array of notification objects
 */
export async function fetchNotifications() {
  try {
    const data = await apiClient.get(ENDPOINT);
    return data;
  } catch (error) {
    console.error('Error fetching notifications:', error);
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
  try {
    const result = await apiClient.post(ENDPOINT, data);
    return result;
  } catch (error) {
    console.error('Error creating notification:', error);
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
export async function deleteNotification(id) {
  try {
    await apiClient.delete(`${ENDPOINT}/${id}`);
  } catch (error) {
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
  try {
    const data = await apiClient.put(`${ENDPOINT}/${id}`, {
      status: 'read',
      read_at: new Date().toISOString(),
    });
    return data;
  } catch (error) {
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
  try {
    const promises = notificationIds.map(id =>
      apiClient.put(`${ENDPOINT}/${id}`, {
        status: 'read',
        read_at: new Date().toISOString(),
      })
    );
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

/**
 * Archive a notification
 * @param {number} id - Notification ID
 * @returns {Promise<Object>} Updated notification object
 */
export async function archiveNotification(id) {
  try {
    const data = await apiClient.put(`${ENDPOINT}/${id}`, {
      status: 'archived',
    });
    return data;
  } catch (error) {
    console.error(`Error archiving notification ${id}:`, error);
    throw error;
  }
}
