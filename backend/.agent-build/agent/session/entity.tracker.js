"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addEntity = addEntity;
exports.removeEntity = removeEntity;
exports.clearEntities = clearEntities;
exports.listEntities = listEntities;
function entityKey(entity) {
    return `${entity.type}:${entity.id}`;
}
function addEntity(session, entity) {
    if (!entity.type || !entity.id) {
        return;
    }
    const key = entityKey(entity);
    const index = session.activeEntities.findIndex((item) => entityKey(item) === key);
    const normalized = {
        ...entity,
        lastMentionedAt: entity.lastMentionedAt || new Date().toISOString(),
    };
    if (index >= 0) {
        session.activeEntities[index] = normalized;
        return;
    }
    session.activeEntities.push(normalized);
}
function removeEntity(session, ref) {
    const key = entityKey(ref);
    session.activeEntities = session.activeEntities.filter((entity) => entityKey(entity) !== key);
}
function clearEntities(session) {
    session.activeEntities = [];
}
function listEntities(session) {
    return [...session.activeEntities];
}
