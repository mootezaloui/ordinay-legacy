"use strict";

const { INTENTS } = require("../intents");
const {
  EXECUTION_MODE,
  createPlanStep,
  createAgentPlan,
} = require("../contracts/agentPlan.contract");

/**
 * Derive execution mode from intent and policy
 * @param {string} intent - Classified intent
 * @param {Object} policy - Agent policy
 * @returns {string} Execution mode
 * @private
 */
function _deriveExecutionMode(intent, policy) {
  if (intent === INTENTS.GENERAL_CHAT) {
    return EXECUTION_MODE.read;
  }

  if (
    intent === INTENTS.EXPLAIN_ENTITY_STATE ||
    intent === INTENTS.SUMMARIZE_SESSION ||
    intent === INTENTS.ANALYZE_OPERATIONAL_RISKS
  ) {
    return EXECUTION_MODE.research;
  }

  if (
    intent === INTENTS.DRAFT_INVITATION ||
    intent === INTENTS.DRAFT_CLIENT_EMAIL
  ) {
    return policy.allowExecution
      ? EXECUTION_MODE.execute
      : EXECUTION_MODE.research;
  }

  if (intent === INTENTS.PROPOSE_ACTIONS) {
    return policy.allowExecution
      ? EXECUTION_MODE.execute
      : EXECUTION_MODE.research;
  }

  return EXECUTION_MODE.research;
}

/**
 * Build an execution plan from classified intent + enriched context.
 * Logs plan creation to ledger. Never executes tools.
 *
 * @param {string} intent - Classified intent
 * @param {Object} payload - { message, context, dataReqs }
 * @param {Object} policy - Agent policy
 * @param {Object} engineContext - Engine context
 * @returns {Object} AgentPlan
 * @private
 */
function _buildPlan(intent, payload, policy, engineContext) {
  // Safety net: never plan analytical intents for document-only contexts.
  // If the classifier inferred an advanced intent from document content alone
  // (no explicit user instruction), downgrade to GENERAL_CHAT to prevent
  // version-restricted errors from surfacing to the user.
  const hasDocOnly =
    engineContext.documentContext &&
    engineContext.documentContext.documents &&
    engineContext.documentContext.documents.length > 0 &&
    !engineContext._hasExplicitUserIntent;
  if (
    hasDocOnly &&
    intent !== INTENTS.GENERAL_CHAT
  ) {
    this.ledger.record({
      type: "planner_downgrade_document_only",
      originalIntent: intent,
      downgradedTo: INTENTS.GENERAL_CHAT,
      timestamp: new Date().toISOString(),
    });
    intent = INTENTS.GENERAL_CHAT;
    engineContext.intent = INTENTS.GENERAL_CHAT;
  }

  const executionMode = this._deriveExecutionMode(intent, policy);

  // Determine tool and description based on intent
  let toolName;
  let toolCategory;
  let description;
  let permissionsRequired;

  if (intent === INTENTS.GENERAL_CHAT) {
    toolName = "_chat";
    toolCategory = "internal";
    description = "Execute chat via reasoner";
    permissionsRequired = [];
  } else {
    toolName = "_executeIntent";
    toolCategory = executionMode === EXECUTION_MODE.execute ? "execute" : "read";
    description = `Execute ${intent} intent via reasoner with enriched context`;
    permissionsRequired = [toolCategory];
  }

  const step = createPlanStep({
    stepIndex: 0,
    toolName,
    toolCategory,
    params: { intent },
    expectedOutputType: intent === INTENTS.GENERAL_CHAT ? "chat" : "explanation",
    description,
    dependsOn: [],
    optional: false,
  });

  const plan = createAgentPlan({
    intent,
    executionMode,
    steps: [step],
    permissionsRequired,
    agentVersion: policy.version,
    context: {
      sessionId: engineContext.sessionId || null,
      hasEnrichedData: Boolean(payload.context?._dataEnriched),
      dataRequirements: payload.dataReqs || null,
    },
  });

  // Log plan creation
  this.ledger.record({
    type: "plan_created",
    planId: plan.planId,
    intent,
    executionMode,
    stepCount: plan.steps.length,
    requiredTools: plan.requiredTools,
    permissionsRequired: plan.permissionsRequired,
    timestamp: new Date().toISOString(),
  });

  return plan;
}

module.exports = {
  _buildPlan,
  _deriveExecutionMode,
};
