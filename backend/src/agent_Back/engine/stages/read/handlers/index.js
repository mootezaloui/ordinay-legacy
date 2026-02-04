"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const clientHandlers = require("./clients");
const dossierHandlers = require("./dossiers");
const lawsuitHandlers = require("./lawsuits");
const taskHandlers = require("./tasks");
const personalTaskHandlers = require("./personal-tasks");
const sessionHandlers = require("./sessions");
const missionHandlers = require("./missions");
const financialHandlers = require("./financial");
const notificationHandlers = require("./notifications");
const historyHandlers = require("./history");

async function dispatchReadIntent(state) {
  const intent = state.intent;
  let result = null;

  switch (intent) {
    case READ_INTENTS.LIST_CLIENTS:
      result = await clientHandlers.handleListClients.call(state.engine, state);
      break;
    case READ_INTENTS.READ_CLIENT:
      result = await clientHandlers.handleReadClient.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_CLIENT_STATE:
    case READ_INTENTS.SUMMARIZE_CLIENT:
      result = await clientHandlers.handleExplainClient.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_DOSSIERS:
      result = await dossierHandlers.handleListDossiers.call(state.engine, state);
      break;
    case READ_INTENTS.READ_DOSSIER:
      result = await dossierHandlers.handleReadDossier.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_DOSSIER_STATE:
    case READ_INTENTS.SUMMARIZE_DOSSIER:
      result = await dossierHandlers.handleExplainDossier.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_LAWSUITS:
      result = await lawsuitHandlers.handleListLawsuits.call(state.engine, state);
      break;
    case READ_INTENTS.READ_LAWSUIT:
      result = await lawsuitHandlers.handleReadLawsuit.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_LAWSUIT_STATE:
    case READ_INTENTS.SUMMARIZE_LAWSUIT:
      result = await lawsuitHandlers.handleExplainLawsuit.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_TASKS:
      result = await taskHandlers.handleListTasks.call(state.engine, state);
      break;
    case READ_INTENTS.LIST_OVERDUE_TASKS:
      result = await taskHandlers.handleListOverdueTasks.call(state.engine, state);
      break;
    case READ_INTENTS.READ_TASK:
      result = await taskHandlers.handleReadTask.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_TASK_STATE:
    case READ_INTENTS.SUMMARIZE_TASK:
      result = await taskHandlers.handleExplainTask.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_PERSONAL_TASKS:
      result = await personalTaskHandlers.handleListPersonalTasks.call(state.engine, state);
      break;
    case READ_INTENTS.READ_PERSONAL_TASK:
      result = await personalTaskHandlers.handleReadPersonalTask.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE:
    case READ_INTENTS.SUMMARIZE_PERSONAL_TASK:
      result = await personalTaskHandlers.handleExplainPersonalTask.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_SESSIONS:
    case READ_INTENTS.LIST_UPCOMING_SESSIONS:
      result = await sessionHandlers.handleListSessions.call(state.engine, state);
      break;
    case READ_INTENTS.READ_SESSION:
      result = await sessionHandlers.handleReadSession.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_SESSION_STATE:
    case READ_INTENTS.SUMMARIZE_SESSION:
      result = await sessionHandlers.handleExplainSession.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_MISSIONS:
      result = await missionHandlers.handleListMissions.call(state.engine, state);
      break;
    case READ_INTENTS.READ_MISSION:
      result = await missionHandlers.handleReadMission.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_MISSION_STATE:
    case READ_INTENTS.SUMMARIZE_MISSION:
      result = await missionHandlers.handleExplainMission.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_FINANCIAL_ENTRIES:
      result = await financialHandlers.handleListFinancialEntries.call(state.engine, state);
      break;
    case READ_INTENTS.READ_FINANCIAL_ENTRY:
      result = await financialHandlers.handleReadFinancialEntry.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE:
    case READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY:
      result = await financialHandlers.handleExplainFinancialEntry.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_NOTIFICATIONS:
      result = await notificationHandlers.handleListNotifications.call(state.engine, state);
      break;
    case READ_INTENTS.READ_NOTIFICATION:
      result = await notificationHandlers.handleReadNotification.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_NOTIFICATION_STATE:
    case READ_INTENTS.SUMMARIZE_NOTIFICATION:
      result = await notificationHandlers.handleExplainNotification.call(state.engine, state);
      break;

    case READ_INTENTS.LIST_HISTORY_EVENTS:
      result = await historyHandlers.handleListHistoryEvents.call(state.engine, state);
      break;
    case READ_INTENTS.READ_HISTORY_EVENT:
      result = await historyHandlers.handleReadHistoryEvent.call(state.engine, state);
      break;
    case READ_INTENTS.EXPLAIN_HISTORY_STATE:
    case READ_INTENTS.SUMMARIZE_HISTORY:
      result = await historyHandlers.handleExplainHistory.call(state.engine, state);
      break;
    default:
      result = null;
  }

  if (result) {
    state.data = result.data;
    state.title = result.title;
    state.summary = result.summary;
  }

  return result;
}

module.exports = {
  dispatchReadIntent,
};
