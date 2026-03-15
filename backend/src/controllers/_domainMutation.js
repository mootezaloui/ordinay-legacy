const { assertDomainMutationAllowed } = require("../agent_Back/mutation/agentDomainMutationRules");
const { evaluateMutationConstraints } = require("../agent_Back/mutation/agentDomainConstraintEvaluator");

function enforceDomainMutation({ entityType, operation, entityId = null, payload = {}, service }) {
  const existing =
    operation === "update" && service && typeof service.get === "function"
      ? service.get(entityId)
      : null;

  const domainEvaluation = evaluateMutationConstraints({
    entityType,
    operation,
    entityId,
    payload,
    existing,
    mode: "rest_api",
  });

  if (!domainEvaluation.allowed) {
    return assertDomainMutationAllowed({
      entityType,
      operation,
      entityId,
      payload,
      existing,
      mode: "rest_api",
    });
  }

  return domainEvaluation;
}

module.exports = {
  enforceDomainMutation,
};
