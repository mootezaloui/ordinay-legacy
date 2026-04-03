"use strict";

const tools = [
  require("./getClient.tool"),
  require("./listClients.tool"),
  require("./getDossier.tool"),
  require("./getDossierByReference.tool"),
  require("./listDossiers.tool"),
  require("./getLawsuit.tool"),
  require("./listLawsuits.tool"),
  require("./getSession.tool"),
  require("./listSessions.tool"),
  require("./listTasks.tool"),
  require("./getTask.tool"),
  require("./listPersonalTasks.tool"),
  require("./getPersonalTask.tool"),
  require("./listMissions.tool"),
  require("./getMission.tool"),
  require("./listOfficers.tool"),
  require("./getOfficer.tool"),
  require("./listFinancialEntries.tool"),
  require("./getFinancialEntry.tool"),
  require("./listNotifications.tool"),
  require("./getNotification.tool"),
  require("./listDocuments.tool"),
  require("./getDocument.tool"),
  require("./listHistoryEvents.tool"),
  require("./getHistoryEvent.tool"),
  require("./getEntityGraph.tool"),
  require("./searchDocuments.tool"),
  require("./mcpWebSearch.tool"),
];

function getReadTools() {
  return [...tools];
}

module.exports = {
  tools,
  getReadTools,
};
