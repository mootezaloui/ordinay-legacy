const { assertDomainMutationAllowed } = require("../agent_Back/engine/agentDomainMutationRules");

function enforceDomainMutation({ entityType, operation, entityId = null, payload = {}, service }) {
  const existing =
    operation === "update" && service && typeof service.get === "function"
      ? service.get(entityId)
      : null;

  return assertDomainMutationAllowed({
    entityType,
    operation,
    entityId,
    payload,
    existing,
    mode: "rest_api",
  });
}

module.exports = {
  enforceDomainMutation,
};
