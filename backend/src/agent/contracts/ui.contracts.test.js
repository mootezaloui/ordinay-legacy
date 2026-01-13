'use strict';

/**
 * UI Contracts Test Suite
 *
 * Tests for Phase C.0 — Agent UI Contracts
 *
 * These tests verify that:
 * 1. Invalid UI requests are rejected
 * 2. Missing context scope is rejected
 * 3. Agent responses missing metadata are rejected
 * 4. UI cannot request execution
 * 5. Valid request/response roundtrip passes
 */

const { createAgentRequest, CONTEXT_SCOPE } = require('./agentRequest.contract');
const { createAgentResponse, RESPONSE_STATUS } = require('./agentResponse.contract');
const { createConfirmationRequest, createConfirmationResponse, CONFIRMATION_STATUS } = require('./confirmation.contract');
const { validateRenderImplementation } = require('./render.contract');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    testsFailed++;
    console.error(`❌ FAIL: ${message}`);
  }
}

function assertThrows(fn, expectedMessage, testMessage) {
  try {
    fn();
    testsFailed++;
    console.error(`❌ FAIL: ${testMessage} (expected error, but no error thrown)`);
    return false;
  } catch (error) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      testsFailed++;
      console.error(`❌ FAIL: ${testMessage} (wrong error: ${error.message})`);
      return false;
    }
    testsPassed++;
    console.log(`✅ PASS: ${testMessage}`);
    return true;
  }
}

// Test Suite
console.log('='.repeat(60));
console.log('UI CONTRACTS TEST SUITE');
console.log('='.repeat(60));
console.log('');

// ===== PART 1: AgentRequest Contract Tests =====
console.log('PART 1: AgentRequest Contract');
console.log('-'.repeat(60));

// Test 1.1: Valid request passes
try {
  const validRequest = createAgentRequest({
    userId: 123,
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    contextScope: CONTEXT_SCOPE.DOSSIER,
    contextRefs: { dossierId: 456 },
    userMessage: 'Explain the current state of this dossier',
    language: 'en',
  });

  assert(validRequest.requestId.startsWith('req-u123-'), 'Valid request creates requestId');
  assert(validRequest.userId === 123, 'Valid request preserves userId');
  assert(validRequest.agentVersion === 'v1', 'Valid request preserves agentVersion');
  assert(validRequest.intent === 'EXPLAIN_ENTITY_STATE', 'Valid request preserves intent');
  assert(validRequest.contextScope === 'DOSSIER', 'Valid request preserves contextScope');
  assert(validRequest.contextRefs.dossierId === 456, 'Valid request preserves contextRefs');
  assert(validRequest.userMessage === 'Explain the current state of this dossier', 'Valid request preserves userMessage');
  assert(validRequest.language === 'en', 'Valid request preserves language');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid request should pass (${error.message})`);
}

// Test 1.2: Invalid userId is rejected
assertThrows(
  () => createAgentRequest({
    userId: -1, // Invalid: must be positive
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    contextScope: CONTEXT_SCOPE.GLOBAL,
    contextRefs: {},
    userMessage: 'Test',
    language: 'en',
  }),
  'userId',
  'Invalid userId is rejected'
);

// Test 1.3: Invalid agentVersion is rejected
assertThrows(
  () => createAgentRequest({
    userId: 123,
    agentVersion: 'v99', // Invalid: not in [v1, v2, v3]
    intent: 'EXPLAIN_ENTITY_STATE',
    contextScope: CONTEXT_SCOPE.GLOBAL,
    contextRefs: {},
    userMessage: 'Test',
    language: 'en',
  }),
  'agentVersion',
  'Invalid agentVersion is rejected'
);

// Test 1.4: Missing context scope is rejected
assertThrows(
  () => createAgentRequest({
    userId: 123,
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    // Missing contextScope
    contextRefs: {},
    userMessage: 'Test',
    language: 'en',
  }),
  'context scope',
  'Missing context scope is rejected'
);

// Test 1.5: Missing required contextRef is rejected
assertThrows(
  () => createAgentRequest({
    userId: 123,
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    contextScope: CONTEXT_SCOPE.DOSSIER, // Requires dossierId
    contextRefs: {}, // Missing dossierId
    userMessage: 'Test',
    language: 'en',
  }),
  'dossierId',
  'Missing required contextRef (dossierId) is rejected'
);

// Test 1.6: UI cannot request execution directly
assertThrows(
  () => createAgentRequest({
    userId: 123,
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    contextScope: CONTEXT_SCOPE.GLOBAL,
    contextRefs: {},
    userMessage: 'Test',
    language: 'en',
    execute: true, // FORBIDDEN
  }),
  'execute',
  'UI cannot request execution directly'
);

// Test 1.7: UI cannot specify tools
assertThrows(
  () => createAgentRequest({
    userId: 123,
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    contextScope: CONTEXT_SCOPE.GLOBAL,
    contextRefs: {},
    userMessage: 'Test',
    language: 'en',
    toolName: 'createTask', // FORBIDDEN
  }),
  'toolName',
  'UI cannot specify tools'
);

// Test 1.8: UI cannot bypass validation
assertThrows(
  () => createAgentRequest({
    userId: 123,
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    contextScope: CONTEXT_SCOPE.GLOBAL,
    contextRefs: {},
    userMessage: 'Test',
    language: 'en',
    bypassValidation: true, // FORBIDDEN
  }),
  'bypassValidation',
  'UI cannot bypass validation'
);

console.log('');

// ===== PART 2: AgentResponse Contract Tests =====
console.log('PART 2: AgentResponse Contract');
console.log('-'.repeat(60));

// Test 2.1: Valid SUCCESS response passes
try {
  const validResponse = createAgentResponse({
    requestId: 'req-u123-1234567890-abc123',
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    status: RESPONSE_STATUS.SUCCESS,
    explanation: {
      type: 'explanation',
      entityId: '123',
      entityType: 'dossier',
      summary: 'Test summary',
      details: ['Detail 1', 'Detail 2'],
      timestamp: new Date().toISOString(),
      confidence: 1,
      sources: [],
      status: 'draft',
      source: 'rule-based',
      requires_validation: true,
    },
  });

  assert(validResponse.responseId.startsWith('res-req-u123-'), 'Valid response creates responseId');
  assert(validResponse.requestId === 'req-u123-1234567890-abc123', 'Valid response preserves requestId');
  assert(validResponse.status === 'SUCCESS', 'Valid response has SUCCESS status');
  assert(validResponse.explanation !== null, 'Valid response includes explanation');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid SUCCESS response should pass (${error.message})`);
}

// Test 2.2: Valid BLOCKED response passes
try {
  const blockedResponse = createAgentResponse({
    requestId: 'req-u123-1234567890-abc123',
    agentVersion: 'v1',
    intent: 'PROPOSE_ACTIONS',
    status: RESPONSE_STATUS.BLOCKED,
    blockingReason: 'Agent version v1 does not allow execution',
  });

  assert(blockedResponse.status === 'BLOCKED', 'BLOCKED response has BLOCKED status');
  assert(blockedResponse.blockingReason === 'Agent version v1 does not allow execution', 'BLOCKED response includes blockingReason');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid BLOCKED response should pass (${error.message})`);
}

// Test 2.3: BLOCKED without blockingReason is rejected
assertThrows(
  () => createAgentResponse({
    requestId: 'req-u123-1234567890-abc123',
    agentVersion: 'v1',
    intent: 'PROPOSE_ACTIONS',
    status: RESPONSE_STATUS.BLOCKED,
    // Missing blockingReason
  }),
  'blockingReason',
  'BLOCKED response without blockingReason is rejected'
);

// Test 2.4: Valid FAILED response passes
try {
  const failedResponse = createAgentResponse({
    requestId: 'req-u123-1234567890-abc123',
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    status: RESPONSE_STATUS.FAILED,
    errors: [{
      message: 'Entity not found',
      code: 'ENTITY_NOT_FOUND',
    }],
  });

  assert(failedResponse.status === 'FAILED', 'FAILED response has FAILED status');
  assert(failedResponse.errors.length === 1, 'FAILED response includes errors array');
  assert(failedResponse.errors[0].message === 'Entity not found', 'FAILED response error has message');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid FAILED response should pass (${error.message})`);
}

// Test 2.5: FAILED without errors is rejected
assertThrows(
  () => createAgentResponse({
    requestId: 'req-u123-1234567890-abc123',
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    status: RESPONSE_STATUS.FAILED,
    errors: [], // Empty array
  }),
  'errors',
  'FAILED response without errors is rejected'
);

// Test 2.6: Agent cannot leak raw LLM output
assertThrows(
  () => createAgentResponse({
    requestId: 'req-u123-1234567890-abc123',
    agentVersion: 'v1',
    intent: 'EXPLAIN_ENTITY_STATE',
    status: RESPONSE_STATUS.SUCCESS,
    rawLLMOutput: 'Some raw output', // FORBIDDEN
  }),
  'rawLLMOutput',
  'Agent cannot leak raw LLM output'
);

console.log('');

// ===== PART 3: Confirmation Contract Tests =====
console.log('PART 3: Confirmation Contract');
console.log('-'.repeat(60));

// Test 3.1: Valid confirmation request passes
try {
  const confirmRequest = createConfirmationRequest({
    proposalId: 'v3-createTask-1234567890-abc123',
    actionType: 'createTask',
    humanReadableSummary: 'Create a new task: "Review contract"',
    affectedEntities: [
      { type: 'dossier', id: 123, name: 'Contract Review' },
    ],
    reversible: true,
    timeoutSeconds: 300,
  });

  assert(confirmRequest.confirmationId.startsWith('confirm-'), 'Confirmation request creates confirmationId');
  assert(confirmRequest.status === 'PENDING', 'Confirmation request starts with PENDING status');
  assert(confirmRequest.reversible === true, 'Confirmation request preserves reversible');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid confirmation request should pass (${error.message})`);
}

// Test 3.2: Valid confirmation response (CONFIRMED) passes
try {
  const confirmResponse = createConfirmationResponse({
    confirmationId: 'confirm-v3-createTask-1234567890-abc123-1234567890-def456',
    proposalId: 'v3-createTask-1234567890-abc123',
    status: CONFIRMATION_STATUS.CONFIRMED,
    userId: 123,
  });

  assert(confirmResponse.status === 'CONFIRMED', 'Confirmation response has CONFIRMED status');
  assert(confirmResponse.userId === 123, 'Confirmation response includes userId');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid CONFIRMED response should pass (${error.message})`);
}

// Test 3.3: Valid confirmation response (REJECTED) passes
try {
  const rejectResponse = createConfirmationResponse({
    confirmationId: 'confirm-v3-createTask-1234567890-abc123-1234567890-def456',
    proposalId: 'v3-createTask-1234567890-abc123',
    status: CONFIRMATION_STATUS.REJECTED,
    userId: 123,
    rejectionReason: 'Not needed at this time',
  });

  assert(rejectResponse.status === 'REJECTED', 'Rejection response has REJECTED status');
  assert(rejectResponse.rejectionReason === 'Not needed at this time', 'Rejection response includes rejectionReason');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid REJECTED response should pass (${error.message})`);
}

// Test 3.4: REJECTED without rejectionReason is rejected
assertThrows(
  () => createConfirmationResponse({
    confirmationId: 'confirm-v3-createTask-1234567890-abc123-1234567890-def456',
    proposalId: 'v3-createTask-1234567890-abc123',
    status: CONFIRMATION_STATUS.REJECTED,
    userId: 123,
    // Missing rejectionReason
  }),
  'rejectionReason',
  'REJECTED response without rejectionReason is rejected'
);

// Test 3.5: UI cannot auto-confirm
assertThrows(
  () => createConfirmationResponse({
    confirmationId: 'confirm-v3-createTask-1234567890-abc123-1234567890-def456',
    proposalId: 'v3-createTask-1234567890-abc123',
    status: CONFIRMATION_STATUS.CONFIRMED,
    userId: 123,
    autoConfirm: true, // FORBIDDEN
  }),
  'autoConfirm',
  'UI cannot auto-confirm'
);

console.log('');

// ===== PART 4: Render Contract Tests =====
console.log('PART 4: Render Contract');
console.log('-'.repeat(60));

// Test 4.1: Valid draft render implementation passes
try {
  validateRenderImplementation({
    type: 'draft',
    usedPatterns: [
      'section_labels',
      'section_separation',
      'metadata_display',
      'validation_indicator',
    ],
  });
  testsPassed++;
  console.log('✅ PASS: Valid draft render implementation passes');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid draft render implementation should pass (${error.message})`);
}

// Test 4.2: Draft render with forbidden pattern is rejected
assertThrows(
  () => validateRenderImplementation({
    type: 'draft',
    usedPatterns: [
      'section_labels',
      'free_text_render', // FORBIDDEN
    ],
  }),
  'forbidden',
  'Draft render with forbidden pattern (free_text_render) is rejected'
);

// Test 4.3: Draft render missing required pattern is rejected
assertThrows(
  () => validateRenderImplementation({
    type: 'draft',
    usedPatterns: [
      'section_labels',
      // Missing section_separation, metadata_display, validation_indicator
    ],
  }),
  'missing required',
  'Draft render missing required patterns is rejected'
);

// Test 4.4: Valid risk render implementation passes
try {
  validateRenderImplementation({
    type: 'risk',
    usedPatterns: [
      'category_badge',
      'severity_indicator',
      'description',
      'affected_entity',
      'risk_score',
      'summary_counts',
    ],
  });
  testsPassed++;
  console.log('✅ PASS: Valid risk render implementation passes');
} catch (error) {
  testsFailed++;
  console.error(`❌ FAIL: Valid risk render implementation should pass (${error.message})`);
}

// Test 4.5: Risk render with forbidden pattern is rejected
assertThrows(
  () => validateRenderImplementation({
    type: 'risk',
    usedPatterns: [
      'category_badge',
      'prose_summary', // FORBIDDEN
    ],
  }),
  'forbidden',
  'Risk render with forbidden pattern (prose_summary) is rejected'
);

console.log('');

// ===== Test Summary =====
console.log('='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`✅ PASSED: ${testsPassed}`);
console.log(`❌ FAILED: ${testsFailed}`);
console.log(`📊 TOTAL:  ${testsPassed + testsFailed}`);
console.log('');

if (testsFailed === 0) {
  console.log('🎉 ALL TESTS PASSED!');
  console.log('');
  console.log('Phase C.0 UI Contracts are COMPLETE and VALIDATED.');
  console.log('');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED');
  console.error('');
  console.error('Fix the failing tests before proceeding.');
  console.error('');
  process.exit(1);
}
