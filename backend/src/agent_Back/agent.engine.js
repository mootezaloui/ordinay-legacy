"use strict";

const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const ConversationContextStore = require("./context/conversation.context");
const RuleReasoner = require("./reasoners/rule.reasoner");
const AgentLedgerService = require("./ledger/agent.ledger.service");
const { initializeToolRegistry } = require("./tools");
const { ToolFirewall } = require("./tools/tool.firewall");

const agentV1Policy = require("./policies/agent.v1.policy");
const agentV2Policy = require("./policies/agent.v2.policy");
const agentV3Policy = require("./policies/agent.v3.policy");

const chatSchema = require("./schemas/chat.schema.json");
const explanationSchema = require("./schemas/explanation.schema.json");
const draftSchema = require("./schemas/draft.schema.json");
const riskSchema = require("./schemas/risk.schema.json");
const actionsSchema = require("./schemas/actions.schema.json");
const agentRequestSchema = require("./schemas/agentRequest.schema.json");
const agentResponseSchema = require("./schemas/agentResponse.schema.json");
const followUpIntentSchema = require("./schemas/followUpIntent.schema.json");

const pipeline = require("./engine/pipeline");
const response = require("./engine/response");
const validation = require("./engine/validation");
const tools = require("./engine/tools");
const permissions = require("./engine/permissions");
const documents = require("./engine/documents");
const context = require("./engine/context");
const intentStage = require("./engine/stages/stage.intent");
const readStage = require("./engine/stages/stage.read");
const followUpStage = require("./engine/stages/stage.followup");
const draftStage = require("./engine/stages/stage.draft");
const state = require("./engine/state");
const planner = require("./engine/planner");
const executor = require("./engine/executor");
const toolRuntime = require("./engine/toolRuntime");
const confirmation = require("./engine/confirmation");

class AgentEngine {
  constructor(options = {}) {
    this.policies = {
      v1: agentV1Policy,
      v2: agentV2Policy,
      v3: agentV3Policy,
    };

    this.reasoners = {
      rule: new RuleReasoner(),
    };

    this.ledger = options.ledgerService || new AgentLedgerService();

    // Initialize Conversation Context Store for follow-up handling
    this.contextStore = options.contextStore || new ConversationContextStore();

    // Initialize Tool Registry and Firewall
    this.toolRegistry = options.toolRegistry || initializeToolRegistry();
    this.toolFirewall = new ToolFirewall({
      registry: this.toolRegistry,
      ledger: this.ledger,
    });

    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: false,
      strict: true,
      allowUnionTypes: true,
    });
    addFormats(this.ajv);

    this.validators = {
      chat: this.ajv.compile(chatSchema),
      explanation: this.ajv.compile(explanationSchema),
      draft: this.ajv.compile(draftSchema),
      operational_risk_analysis: this.ajv.compile(riskSchema),
      action_plan: this.ajv.compile(actionsSchema),
      agent_request: this.ajv.compile(agentRequestSchema),
      agent_response: this.ajv.compile(agentResponseSchema),
      follow_up_intent: this.ajv.compile(followUpIntentSchema),
    };
  }
}

Object.assign(
  AgentEngine.prototype,
  pipeline,
  response,
  validation,
  tools,
  permissions,
  documents,
  context,
  intentStage,
  readStage,
  followUpStage,
  draftStage,
  state,
  planner,
  executor,
  toolRuntime,
  confirmation,
);

module.exports = AgentEngine;
