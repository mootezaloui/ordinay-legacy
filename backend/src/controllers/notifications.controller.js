// Dismiss a notification for a user (persist dedupe_key)
async function dismiss(req, res, next) {
  try {
    const { user_id, dedupe_key } = req.body;
    if (!user_id || !dedupe_key)
      return res
        .status(400)
        .json({ message: "user_id and dedupe_key are required" });
    service.dismissNotification(user_id, dedupe_key);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

// Check if a notification is dismissed for a user
async function isDismissed(req, res, next) {
  try {
    const { user_id, dedupe_key } = req.query;
    if (!user_id || !dedupe_key)
      return res
        .status(400)
        .json({ message: "user_id and dedupe_key are required" });
    const dismissed = service.isNotificationDismissed(user_id, dedupe_key);
    res.json({ dismissed });
  } catch (error) {
    next(error);
  }
}
const service = require("../services/notifications.service");
const { parseId } = require("./_utils");

async function list(req, res, next) {
  try {
    const notifications = service.list();
    res.json(notifications);
  } catch (error) {
    next(error);
  }
}

async function count(req, res, next) {
  try {
    const total = service.count();
    res.json({ count: total });
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const notification = service.get(id);
    if (!notification)
      return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const notification = service.create(req.body);
    if (!notification) return res.status(204).send();
    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const notification = service.update(id, req.body);
    if (!notification)
      return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const user_id = Number(req.query.user_id) || 1;
    const removed = service.remove(id, user_id);
    if (!removed)
      return res.status(404).json({ message: "Notification not found" });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

// Bulk clear notifications for a user or all
async function clearAll(req, res, next) {
  try {
    // Optionally filter by entity_type/entity_id (user-specific)
    const { entity_type, entity_id } = req.query;
    const user_id = Number(req.query.user_id) || 1;
    const result = service.clearAll(entity_type, entity_id, user_id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  count,
  get,
  create,
  update,
  remove,
  clearAll,
  dismiss,
  isDismissed,
};
