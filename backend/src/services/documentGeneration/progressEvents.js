"use strict";

const { EventEmitter } = require("events");

const emitter = new EventEmitter();
const latestByGeneration = new Map();

function emitGenerationEvent(generationId, stage, payload = {}) {
  if (!generationId) return;
  const event = {
    type: "progress",
    generationId,
    stage,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  latestByGeneration.set(String(generationId), event);
  emitter.emit(`generation:${generationId}`, event);
}

function subscribeGenerationEvents(generationId, handler) {
  const channel = `generation:${generationId}`;
  emitter.on(channel, handler);
  return () => emitter.off(channel, handler);
}

function getLatestGenerationEvent(generationId) {
  return latestByGeneration.get(String(generationId)) || null;
}

module.exports = {
  emitGenerationEvent,
  subscribeGenerationEvents,
  getLatestGenerationEvent,
};
