'use strict';

/**
 * Entity Adapter Registry
 *
 * Central registry for all entity adapters.
 * Imported by entityAdapters.js to provide universal adapter resolution.
 */

const taskAdapter = require('./task.adapter');
const clientAdapter = require('./client.adapter');
const dossierAdapter = require('./dossier.adapter');
const sessionAdapter = require('./session.adapter');
const lawsuitAdapter = require('./lawsuit.adapter');
const personalTaskAdapter = require('./personalTask.adapter');
const missionAdapter = require('./mission.adapter');
const financialEntryAdapter = require('./financialEntry.adapter');
const notificationAdapter = require('./notification.adapter');
const documentAdapter = require('./document.adapter');
const historyEventAdapter = require('./historyEvent.adapter');

const adapters = new Map([
  [taskAdapter.entityType, taskAdapter],
  [clientAdapter.entityType, clientAdapter],
  [dossierAdapter.entityType, dossierAdapter],
  [sessionAdapter.entityType, sessionAdapter],
  [lawsuitAdapter.entityType, lawsuitAdapter],
  [personalTaskAdapter.entityType, personalTaskAdapter],
  [missionAdapter.entityType, missionAdapter],
  [financialEntryAdapter.entityType, financialEntryAdapter],
  [notificationAdapter.entityType, notificationAdapter],
  [documentAdapter.entityType, documentAdapter],
  [historyEventAdapter.entityType, historyEventAdapter],
]);

module.exports = adapters;
