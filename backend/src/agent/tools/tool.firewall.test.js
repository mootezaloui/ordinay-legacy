'use strict';

/**
 * Tool Firewall Test Harness
 *
 * Tests the safety gates and execution blocking.
 * CRITICAL: All blocked operations MUST fail.
 *
 * Run with: node backend/src/agent/tools/tool.firewall.test.js
 */

const AgentEngine = require('../agent.engine');
const { TOOL_CATEGORIES } = require('./tool.registry');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function assert(condition, message) {
  if (!condition) {
    log(`✗ FAILED: ${message}`, 'red');
    throw new Error(`Assertion failed: ${message}`);
  }
  log(`✓ PASSED: ${message}`, 'green');
}

async function runTests() {
  log('\n=== TOOL FIREWALL SAFETY TEST HARNESS ===\n', 'cyan');
  log('Testing critical security boundaries...\n', 'blue');

  const engine = new AgentEngine();
  let testsPassed = 0;
  let testsFailed = 0;

  // TEST 1: Attempt to call EXECUTE tool in v1 → MUST FAIL
  log('\n[TEST 1] Attempting to call EXECUTE tool in v1 (MUST BE BLOCKED)', 'yellow');
  try {
    const v1Policy = engine.policies.v1;
    await engine.callTool('createTask', { title: 'Test task' }, v1Policy);
    log('✗ SECURITY FAILURE: Execute tool was NOT blocked in v1', 'red');
    testsFailed++;
  } catch (error) {
    if (error.status === 403 && error.reason) {
      assert(
        error.reason === 'CATEGORY_NOT_ALLOWED' || error.reason === 'VERSION_NOT_ALLOWED',
        'Execute tool blocked in v1 with correct reason'
      );
      log(`  Blocked reason: ${error.reason}`, 'blue');
      log(`  Message: ${error.message}`, 'blue');
      testsPassed++;
    } else {
      log(`✗ Unexpected error: ${error.message}`, 'red');
      testsFailed++;
    }
  }

  // TEST 2: Attempt to call undeclared tool → MUST FAIL
  log('\n[TEST 2] Attempting to call undeclared tool (MUST BE BLOCKED)', 'yellow');
  try {
    const v1Policy = engine.policies.v1;
    await engine.callTool('nonexistentTool', {}, v1Policy);
    log('✗ SECURITY FAILURE: Undeclared tool was NOT blocked', 'red');
    testsFailed++;
  } catch (error) {
    if (error.status === 403 && error.reason === 'UNDECLARED_TOOL') {
      assert(true, 'Undeclared tool blocked with UNDECLARED_TOOL reason');
      log(`  Message: ${error.message}`, 'blue');
      testsPassed++;
    } else {
      log(`✗ Unexpected error: ${error.message}`, 'red');
      testsFailed++;
    }
  }

  // TEST 3: Call ANALYSIS tool in v1 → MUST PASS
  log('\n[TEST 3] Calling ANALYSIS tool in v1 (MUST BE ALLOWED)', 'yellow');
  try {
    const v1Policy = engine.policies.v1;
    const proposal = engine.proposeAction(
      'detectOverdueTasks',
      { dossierId: null },
      v1Policy
    );
    assert(proposal.permitted === true, 'Analysis tool permitted in v1');
    assert(proposal.tool.category === TOOL_CATEGORIES.ANALYSIS, 'Tool is ANALYSIS category');
    log(`  Tool category: ${proposal.tool.category}`, 'blue');
    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // TEST 4: Call DRAFT tool in v1 → MUST PASS
  log('\n[TEST 4] Calling DRAFT tool in v1 (MUST BE ALLOWED)', 'yellow');
  try {
    const v1Policy = engine.policies.v1;
    const proposal = engine.proposeAction(
      'draftInvitation',
      { sessionId: 1 },
      v1Policy
    );
    assert(proposal.permitted === true, 'Draft tool permitted in v1');
    assert(proposal.tool.category === TOOL_CATEGORIES.DRAFT, 'Tool is DRAFT category');
    log(`  Tool category: ${proposal.tool.category}`, 'blue');
    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // TEST 5: Call READ tool in v1 → MUST PASS
  log('\n[TEST 5] Calling READ tool in v1 (MUST BE ALLOWED)', 'yellow');
  try {
    const v1Policy = engine.policies.v1;
    const proposal = engine.proposeAction('getClient', { clientId: 1 }, v1Policy);
    assert(proposal.permitted === true, 'Read tool permitted in v1');
    assert(proposal.tool.category === TOOL_CATEGORIES.READ, 'Tool is READ category');
    log(`  Tool category: ${proposal.tool.category}`, 'blue');
    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // TEST 6: Attempt to call EXECUTE tool in v2 → MUST FAIL
  log('\n[TEST 6] Attempting to call EXECUTE tool in v2 (MUST BE BLOCKED)', 'yellow');
  try {
    const v2Policy = engine.policies.v2;
    await engine.callTool('scheduleReminder', {
      entityType: 'task',
      entityId: 1,
      reminderDate: '2025-01-01T10:00:00Z',
      message: 'Test',
    }, v2Policy);
    log('✗ SECURITY FAILURE: Execute tool was NOT blocked in v2', 'red');
    testsFailed++;
  } catch (error) {
    if (error.status === 403 && error.reason) {
      assert(
        error.reason === 'CATEGORY_NOT_ALLOWED' || error.reason === 'VERSION_NOT_ALLOWED',
        'Execute tool blocked in v2 with correct reason'
      );
      log(`  Blocked reason: ${error.reason}`, 'blue');
      testsPassed++;
    } else {
      log(`✗ Unexpected error: ${error.message}`, 'red');
      testsFailed++;
    }
  }

  // TEST 7: Call EXECUTE tool in v3 WITHOUT confirmation → MUST FAIL
  log('\n[TEST 7] Calling EXECUTE tool in v3 without confirmation (MUST BE BLOCKED)', 'yellow');
  try {
    const v3Policy = engine.policies.v3;
    await engine.callTool('createTask', {
      title: 'Test task',
      priority: 'medium',
    }, v3Policy, { confirmed: false });
    log('✗ SECURITY FAILURE: Execute tool without confirmation was NOT blocked', 'red');
    testsFailed++;
  } catch (error) {
    if (error.status === 403 && error.reason === 'CONFIRMATION_REQUIRED') {
      assert(true, 'Execute tool blocked in v3 without confirmation');
      log(`  Message: ${error.message}`, 'blue');
      testsPassed++;
    } else {
      log(`✗ Unexpected error: ${error.message}`, 'red');
      testsFailed++;
    }
  }

  // TEST 8: Verify tool registry integrity
  log('\n[TEST 8] Verifying tool registry integrity', 'yellow');
  try {
    const readTools = engine.toolRegistry.list({ category: TOOL_CATEGORIES.READ });
    const analysisTools = engine.toolRegistry.list({ category: TOOL_CATEGORIES.ANALYSIS });
    const draftTools = engine.toolRegistry.list({ category: TOOL_CATEGORIES.DRAFT });
    const executeTools = engine.toolRegistry.list({ category: TOOL_CATEGORIES.EXECUTE });

    assert(readTools.length >= 6, `At least 6 READ tools registered (found ${readTools.length})`);
    assert(analysisTools.length >= 4, `At least 4 ANALYSIS tools registered (found ${analysisTools.length})`);
    assert(draftTools.length >= 3, `At least 3 DRAFT tools registered (found ${draftTools.length})`);
    assert(executeTools.length >= 3, `At least 3 EXECUTE tools registered (found ${executeTools.length})`);

    // Verify all EXECUTE tools are only allowed in v3
    for (const tool of executeTools) {
      assert(
        tool.allowedAgentVersions.length === 1 && tool.allowedAgentVersions[0] === 'v3',
        `EXECUTE tool ${tool.name} only allowed in v3`
      );
    }

    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // TEST 9: Verify ledger logging
  log('\n[TEST 9] Verifying ledger logs permission checks', 'yellow');
  try {
    const initialCount = engine.ledger.list().length;
    const v1Policy = engine.policies.v1;

    // Make a permission check
    engine.proposeAction('getClient', { clientId: 1 }, v1Policy);

    const finalCount = engine.ledger.list().length;
    assert(
      finalCount > initialCount,
      'Ledger recorded permission check'
    );

    const lastEntry = engine.ledger.list()[finalCount - 1];
    assert(
      lastEntry.type === 'tool_permission_check',
      'Ledger entry has correct type'
    );

    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // TEST 10: Verify all READ tools have no side effects
  log('\n[TEST 10] Verifying all READ tools have no side effects', 'yellow');
  try {
    const readTools = engine.toolRegistry.list({ category: TOOL_CATEGORIES.READ });
    for (const tool of readTools) {
      assert(
        tool.sideEffects === false,
        `READ tool ${tool.name} has no side effects`
      );
    }
    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // TEST 11: Verify all ANALYSIS tools have no side effects
  log('\n[TEST 11] Verifying all ANALYSIS tools have no side effects', 'yellow');
  try {
    const analysisTools = engine.toolRegistry.list({ category: TOOL_CATEGORIES.ANALYSIS });
    for (const tool of analysisTools) {
      assert(
        tool.sideEffects === false,
        `ANALYSIS tool ${tool.name} has no side effects`
      );
    }
    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // TEST 12: Verify all EXECUTE tools have side effects
  log('\n[TEST 12] Verifying all EXECUTE tools have side effects', 'yellow');
  try {
    const executeTools = engine.toolRegistry.list({ category: TOOL_CATEGORIES.EXECUTE });
    for (const tool of executeTools) {
      assert(
        tool.sideEffects === true,
        `EXECUTE tool ${tool.name} has side effects`
      );
    }
    testsPassed++;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    testsFailed++;
  }

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`Total tests: ${testsPassed + testsFailed}`, 'blue');
  log(`Passed: ${testsPassed}`, 'green');
  log(`Failed: ${testsFailed}`, testsFailed > 0 ? 'red' : 'green');

  if (testsFailed === 0) {
    log('\n✓ ALL SAFETY GATES OPERATIONAL', 'green');
    log('The Tool Firewall is correctly blocking unauthorized operations.\n', 'green');
    return 0;
  } else {
    log('\n✗ SAFETY GATE FAILURES DETECTED', 'red');
    log('CRITICAL: The Tool Firewall has vulnerabilities.\n', 'red');
    return 1;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests()
    .then(exitCode => {
      process.exit(exitCode);
    })
    .catch(error => {
      log(`\nUNEXPECTED ERROR: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runTests };
