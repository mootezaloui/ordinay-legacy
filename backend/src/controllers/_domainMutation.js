function assertDomainMutationAllowed() {
  return { allowed: true };
}

function evaluateMutationConstraints() {
  return { allowed: true };
}

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
