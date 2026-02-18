"use strict";

const { EventEmitter } = require("events");

const bus = new EventEmitter();
bus.setMaxListeners(200);

const latestByDoc = new Map();

function _channel(documentId) {
  return `doc:${Number(documentId)}`;
}

function emitDocumentEvent(documentId, type, payload = {}) {
  const docId = Number(documentId);
  const event = {
    type,
    docId,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  latestByDoc.set(docId, event);
  bus.emit(_channel(docId), event);
  return event;
}

function subscribeDocumentEvents(documentId, listener) {
  const channel = _channel(documentId);
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}

function getLatestDocumentEvent(documentId) {
  return latestByDoc.get(Number(documentId)) || null;
}

module.exports = {
  emitDocumentEvent,
  subscribeDocumentEvents,
  getLatestDocumentEvent,
};

