"use strict";

/**
 * Tool Loader
 *
 * Central loader for all agent tools.
 * Initializes the registry and registers all declared tools.
 */

const { ToolRegistry } = require("./tool.registry");

// READ tools
const getClientTool = require("./read/getClient.tool");
const listClientsTool = require("./read/listClients.tool");
const searchClientsByNameTool = require("./read/searchClientsByName.tool");
const getDossierTool = require("./read/getDossier.tool");
const getDossierByReferenceTool = require("./read/getDossierByReference.tool");
const listDossiersTool = require("./read/listDossiers.tool");
const listDossiersForClientTool = require("./read/listDossiersForClient.tool");
const getClientDossierSummaryTool = require("./read/getClientDossierSummary.tool");
const getDossierWorkSummaryTool = require("./read/getDossierWorkSummary.tool");
const getLawsuitTool = require("./read/getLawsuit.tool");
const listLawsuitsTool = require("./read/listLawsuits.tool");
const getSessionTool = require("./read/getSession.tool");
const listSessionsTool = require("./read/listSessions.tool");
const listTasksTool = require("./read/listTasks.tool");
const getTaskTool = require("./read/getTask.tool");
const listPersonalTasksTool = require("./read/listPersonalTasks.tool");
const getPersonalTaskTool = require("./read/getPersonalTask.tool");
const listMissionsTool = require("./read/listMissions.tool");
const getMissionTool = require("./read/getMission.tool");
const listOfficersTool = require("./read/listOfficers.tool");
const getOfficerTool = require("./read/getOfficer.tool");
const listFinancialEntriesTool = require("./read/listFinancialEntries.tool");
const getFinancialEntryTool = require("./read/getFinancialEntry.tool");
const findClientsWithOverdueInvoicesTool = require("./read/findClientsWithOverdueInvoices.tool");
const listNotificationsTool = require("./read/listNotifications.tool");
const getNotificationTool = require("./read/getNotification.tool");
const listHistoryEventsTool = require("./read/listHistoryEvents.tool");
const getHistoryEventTool = require("./read/getHistoryEvent.tool");
const getTimelineTool = require("./read/getTimeline.tool");
const getEntityGraphTool = require("./read/getEntityGraph.tool");
const mcpWebSearchTool = require("./read/mcpWebSearch.tool");
const mcpLegalSearchTool = require("./read/mcpLegalSearch.tool");
const mcpDeepSearchTool = require("./read/mcpDeepSearch.tool");

// ANALYSIS tools
const computeDossierStatusTool = require("./analysis/computeDossierStatus.tool");
const detectOverdueTasksTool = require("./analysis/detectOverdueTasks.tool");
const findBlockingDependenciesTool = require("./analysis/findBlockingDependencies.tool");
const scanOperationalRisksTool = require("./analysis/scanOperationalRisks.tool");

// DRAFT tools
const genericDraftTool = require("./draft/genericDraft.tool");
const planGeneratedDocumentTool = require("./draft/planGeneratedDocument.tool");

// PLAN tools
const detectPrioritySignalsTool = require("./plan/detectPrioritySignals.tool");
const analyzeEntityStateTool = require("./plan/analyzeEntityState.tool");
const buildActionPlanTool = require("./plan/buildActionPlan.tool");
const summarizeEntityProgressTool = require("./plan/summarizeEntityProgress.tool");

// RESEARCH tools
const compileDossierResearchTool = require("./research/compileDossierResearch.tool");

// EXECUTE tools
const universalMutationTool = require("./execute/universalMutation.tool");
const createTaskTool = require("./execute/createTask.tool");
const updateTaskTool = require("./execute/updateTask.tool");
const addNoteTool = require("./execute/addNote.tool");
const createDocumentDraftTool = require("./execute/createDocumentDraft.tool");
const updateDocumentMetadataTool = require("./execute/updateDocumentMetadata.tool");
const scheduleReminderTool = require("./execute/scheduleReminder.tool");
const prepareClientNotificationTool = require("./execute/prepareClientNotification.tool");

/**
 * Initialize and populate the tool registry
 * @returns {ToolRegistry} Initialized registry with all tools
 */
function initializeToolRegistry() {
  const registry = new ToolRegistry();

  // Register READ tools
  registry.register(getClientTool);
  registry.register(listClientsTool);
  registry.register(searchClientsByNameTool);
  registry.register(getDossierTool);
  registry.register(getDossierByReferenceTool);
  registry.register(listDossiersTool);
  registry.register(listDossiersForClientTool);
  registry.register(getClientDossierSummaryTool);
  registry.register(getDossierWorkSummaryTool);
  registry.register(getLawsuitTool);
  registry.register(listLawsuitsTool);
  registry.register(getSessionTool);
  registry.register(listSessionsTool);
  registry.register(listTasksTool);
  registry.register(getTaskTool);
  registry.register(listPersonalTasksTool);
  registry.register(getPersonalTaskTool);
  registry.register(listMissionsTool);
  registry.register(getMissionTool);
  registry.register(listOfficersTool);
  registry.register(getOfficerTool);
  registry.register(listFinancialEntriesTool);
  registry.register(getFinancialEntryTool);
  registry.register(findClientsWithOverdueInvoicesTool);
  registry.register(listNotificationsTool);
  registry.register(getNotificationTool);
  registry.register(listHistoryEventsTool);
  registry.register(getHistoryEventTool);
  registry.register(getTimelineTool);
  registry.register(getEntityGraphTool);
  // MCP-backed external search tools. These are routed only by explicit SEARCH_WEB gate.
  registry.register(mcpWebSearchTool);
  registry.register(mcpLegalSearchTool);
  registry.register(mcpDeepSearchTool);

  // Register ANALYSIS tools
  registry.register(computeDossierStatusTool);
  registry.register(detectOverdueTasksTool);
  registry.register(findBlockingDependenciesTool);
  registry.register(scanOperationalRisksTool);

  // Register DRAFT tools
  registry.register(genericDraftTool);
  registry.register(planGeneratedDocumentTool);

  // Register PLAN tools
  registry.register(detectPrioritySignalsTool);
  registry.register(analyzeEntityStateTool);
  registry.register(buildActionPlanTool);
  registry.register(summarizeEntityProgressTool);

  // Register RESEARCH tools
  registry.register(compileDossierResearchTool);

  // Register EXECUTE tools
  registry.register(universalMutationTool);
  registry.register(createTaskTool);
  registry.register(updateTaskTool);
  registry.register(addNoteTool);
  registry.register(createDocumentDraftTool);
  registry.register(updateDocumentMetadataTool);
  registry.register(scheduleReminderTool);
  registry.register(prepareClientNotificationTool);

  return registry;
}

module.exports = {
  initializeToolRegistry,
};
