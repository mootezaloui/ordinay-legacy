const service = require("../services/financial.service");
const { parseId } = require("./_utils");
const { enforceDomainMutation } = require("./_domainMutation");

async function list(req, res, next) {
  try {
    const entries = service.list();
    res.json(entries);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const entry = service.get(id);
    if (!entry)
      return res.status(404).json({ message: "Financial entry not found" });
    res.json(entry);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    console.log(
      "[financial.controller] Received payload:",
      JSON.stringify(req.body, null, 2)
    );
    enforceDomainMutation({ entityType: "financial_entry", operation: "create", payload: req.body, service });
    const entry = service.create(req.body);
    res.status(201).json(entry);
  } catch (error) {
    console.error("[financial.controller] Create error:", error.message);
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    enforceDomainMutation({ entityType: "financial_entry", operation: "update", entityId: id, payload: req.body, service });
    const entry = service.update(id, req.body);
    if (!entry)
      return res.status(404).json({ message: "Financial entry not found" });
    res.json(entry);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const { reason, forceHardDelete } = req.body || {};
    const result = service.remove(id, { reason, forceHardDelete });

    if (!result.success) {
      if (result.reason === "not_found") {
        return res.status(404).json({ message: "Financial entry not found" });
      }
      return res
        .status(400)
        .json({
          message: "Could not delete financial entry",
          reason: result.reason,
        });
    }

    // Return 200 with info about the deletion method for transparency
    res.status(200).json({
      success: true,
      method: result.method,
      message:
        result.method === "hard_delete"
          ? "Entry permanently deleted (was a draft)"
          : "Entry cancelled and archived (preserved for audit trail)",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel a financial entry explicitly
 */
async function cancel(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const { reason } = req.body || {};
    const entry = service.cancel(id, { reason });
    if (!entry)
      return res.status(404).json({ message: "Financial entry not found" });
    res.json(entry);
  } catch (error) {
    next(error);
  }
}

/**
 * Get client receivable balance for closure validation
 */
async function getClientBalance(req, res, next) {
  try {
    const clientId = parseId(req.params.clientId);
    const balance = service.getClientReceivableBalance(clientId);
    res.json(balance);
  } catch (error) {
    next(error);
  }
}

/**
 * Check if parent entity can be deleted/closed
 */
async function checkParentDeletion(req, res, next) {
  try {
    const { parentType, parentId } = req.params;
    const id = parseId(parentId);
    const result = service.checkParentDeletionAllowed(parentType, id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  cancel,
  getClientBalance,
  checkParentDeletion,
};
