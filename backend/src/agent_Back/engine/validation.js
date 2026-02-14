"use strict";

const { INTENTS } = require("../intents");

function _validateContract(contractType, output, context = {}) {
  const validator = this.validators[contractType];
  if (!validator) {
    const error = new Error(`No validator for contract: ${contractType}`);
    error.status = 500;
    error.errorType = "NO_VALIDATOR";
    throw error;
  }

  const valid = validator(output);
  if (!valid) {
    // Log contract validation failure
    this.ledger.record({
      type: "contract_validation_failure",
      contract: contractType,
      validationErrors: validator.errors,
      output: output,
      context: context,
      timestamp: new Date().toISOString(),
    });

    // Debug log: print the offending object and errors
    // eslint-disable-next-line no-console
    console.error("=== CONTRACT VALIDATION ERROR ===");
    console.error("Contract:", contractType);
    console.error("Output object:", JSON.stringify(output, null, 2));
    console.error("Validation errors:", validator.errors);
    // End debug log

    const error = new Error(
      `Contract validation failed: ${this.ajv.errorsText(validator.errors)}`,
    );
    error.status = 500;
    error.errorType = "CONTRACT_VALIDATION_FAILED";
    error.contract = contractType;
    error.validationErrors = validator.errors;
    throw error; // FAIL ENTIRE RESPONSE - NO PARTIAL SUCCESS
  }

  // Log contract validation success
  this.ledger.record({
    type: "contract_validation_success",
    contract: contractType,
    timestamp: new Date().toISOString(),
  });

  return true;
}

function _validateAgainstSchema(intent, output, posture) {
  // ASSISTANT Mode: Skip schema validation (free-form output allowed)
  if (posture && posture.mode === "ASSISTANT") {
    console.log("[Schema Validation] Skipped for ASSISTANT posture");
    return;
  }

  const schemaKey = this._schemaKeyForIntent(intent);

  // Use contract validation boundary
  this._validateContract(schemaKey, output, { intent });
}

function _schemaKeyForIntent(intent) {
  if (intent === INTENTS.GENERAL_CHAT) {
    return "chat";
  }
  if (
    intent === INTENTS.EXPLAIN_ENTITY_STATE ||
    intent === INTENTS.SUMMARIZE_SESSION
  ) {
    return "explanation";
  }
  if (
    intent === INTENTS.DRAFT_INVITATION ||
    intent === INTENTS.DRAFT_CLIENT_EMAIL
  ) {
    return "draft";
  }
  if (intent === INTENTS.DRAFT_GENERIC) {
    return "context_suggestion";
  }
  if (intent === INTENTS.ANALYZE_OPERATIONAL_RISKS) {
    return "operational_risk_analysis"; // Updated to match schema key
  }
  if (intent === INTENTS.PROPOSE_ACTIONS) {
    return "action_plan";
  }
  return "explanation";
}

/**
 * Execute a slash command
 * Bypasses LLM intent classification - deterministic tool execution
 *
 * @param {string} message - Slash command message
 * @param {Object} context - Request context
 * @param {Object} policy - Current agent policy
 * @returns {Promise<Object>} Command result
 * @private
 */

module.exports = {
  _validateContract,
  _validateAgainstSchema,
  _schemaKeyForIntent,
};
