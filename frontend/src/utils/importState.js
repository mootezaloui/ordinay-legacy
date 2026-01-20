export function isOperationalEntity(entity) {
  if (!entity) return false;
  if (entity.validated === undefined || entity.validated === null) return true;
  if (entity.validated === "1") return true;
  if (entity.validated === "0") return false;
  if (entity.validated === "true") return true;
  if (entity.validated === "false") return false;
  return entity.validated === true || entity.validated === 1;
}

export function filterOperationalEntities(entities = []) {
  if (!Array.isArray(entities)) return [];
  return entities.filter(isOperationalEntity);
}
