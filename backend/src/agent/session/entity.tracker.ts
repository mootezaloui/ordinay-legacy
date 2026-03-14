import type { EntityReference } from "../types";
import type { ActiveEntity, Session } from "./session.types";

function entityKey(entity: EntityReference): string {
  return `${entity.type}:${entity.id}`;
}

export function addEntity(session: Session, entity: ActiveEntity): void {
  if (!entity.type || !entity.id) {
    return;
  }

  const key = entityKey(entity);
  const index = session.activeEntities.findIndex((item) => entityKey(item) === key);
  const normalized: ActiveEntity = {
    ...entity,
    lastMentionedAt: entity.lastMentionedAt || new Date().toISOString(),
  };

  if (index >= 0) {
    session.activeEntities[index] = normalized;
    return;
  }

  session.activeEntities.push(normalized);
}

export function removeEntity(session: Session, ref: EntityReference): void {
  const key = entityKey(ref);
  session.activeEntities = session.activeEntities.filter((entity) => entityKey(entity) !== key);
}

export function clearEntities(session: Session): void {
  session.activeEntities = [];
}

export function listEntities(session: Session): ActiveEntity[] {
  return [...session.activeEntities];
}
