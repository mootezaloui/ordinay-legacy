'use strict';

/**
 * Tool Loader
 *
 * Central loader for all agent tools.
 * Initializes the registry and registers all declared tools.
 */

const { ToolRegistry } = require('./tool.registry');

// READ tools
const getClientTool = require('./read/getClient.tool');
const getDossierTool = require('./read/getDossier.tool');
const getCaseTool = require('./read/getCase.tool');
const getSessionTool = require('./read/getSession.tool');
const listTasksTool = require('./read/listTasks.tool');
const getTimelineTool = require('./read/getTimeline.tool');

// ANALYSIS tools
const computeDossierStatusTool = require('./analysis/computeDossierStatus.tool');
const detectOverdueTasksTool = require('./analysis/detectOverdueTasks.tool');
const findBlockingDependenciesTool = require('./analysis/findBlockingDependencies.tool');
const scanOperationalRisksTool = require('./analysis/scanOperationalRisks.tool');

// DRAFT tools
const draftInvitationTool = require('./draft/draftInvitation.tool');
const draftClientEmailTool = require('./draft/draftClientEmail.tool');
const draftHearingSummaryTool = require('./draft/draftHearingSummary.tool');

// EXECUTE tools (stubs)
const createTaskTool = require('./execute/createTask.tool');
const scheduleReminderTool = require('./execute/scheduleReminder.tool');
const prepareClientNotificationTool = require('./execute/prepareClientNotification.tool');

/**
 * Initialize and populate the tool registry
 * @returns {ToolRegistry} Initialized registry with all tools
 */
function initializeToolRegistry() {
  const registry = new ToolRegistry();

  // Register READ tools
  registry.register(getClientTool);
  registry.register(getDossierTool);
  registry.register(getCaseTool);
  registry.register(getSessionTool);
  registry.register(listTasksTool);
  registry.register(getTimelineTool);

  // Register ANALYSIS tools
  registry.register(computeDossierStatusTool);
  registry.register(detectOverdueTasksTool);
  registry.register(findBlockingDependenciesTool);
  registry.register(scanOperationalRisksTool);

  // Register DRAFT tools
  registry.register(draftInvitationTool);
  registry.register(draftClientEmailTool);
  registry.register(draftHearingSummaryTool);

  // Register EXECUTE tools (stubs)
  registry.register(createTaskTool);
  registry.register(scheduleReminderTool);
  registry.register(prepareClientNotificationTool);

  return registry;
}

module.exports = {
  initializeToolRegistry,
};
