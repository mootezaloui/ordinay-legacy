"use strict";

const { evaluateMutationConstraints } = require("./agentDomainConstraintEvaluator");

function _domainRuleError(message, meta = {}) {
  const err = new Error(String(message || "This change is blocked by a business rule."));
  err.code = "DOMAIN_RULE_BLOCKED";
  err.status = 409;
  err.domainRule = meta;
  return err;
}

function assertDomainMutationAllowed({
  entityType,
  operation,
  entityId = null,
  payload = {},
  existing = null,
  mode = "proposal_preflight",
}) {
  const evaluation = evaluateMutationConstraints({
    entityType,
    operation,
    entityId,
    payload,
    existing,
    mode,
  });

  if (evaluation.allowed) return evaluation;

  const primary = evaluation.blockers?.[0] || null;
  const msg =
    primary?.userFacingFactText ||
    "I can’t apply that change because related records need to be updated first.";
  throw _domainRuleError(msg, {
    evaluation,
    primaryBlocker: primary,
    entityType: entityType || null,
    entityId: entityId == null ? null : Number(entityId),
    existing: existing && typeof existing === "object" ? { ...existing } : null,
  });
}

module.exports = {
  assertDomainMutationAllowed,
};
