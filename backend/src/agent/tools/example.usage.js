"use strict";

/**
 * Tool Usage Examples
 *
 * Demonstrates how to use the Agent Tool System safely.
 *
 * Run with: node backend/src/agent/tools/example.usage.js
 */

const AgentEngine = require("../agent.engine");

async function runExamples() {
  console.log("\n=== Agent Tool System - Usage Examples ===\n");

  const engine = new AgentEngine();
  const v1Policy = engine.policies.v1;

  // Example 1: Read client data
  console.log("--- Example 1: Read Client Data (v1) ---");
  try {
    const result = await engine.callTool(
      "getClient",
      { clientId: 1 },
      v1Policy
    );
    console.log("✓ Successfully retrieved client");
    if (result.result.client) {
      console.log(`  Client: ${result.result.client.name}`);
      console.log(`  Email: ${result.result.client.email || "N/A"}`);
    } else {
      console.log("  Client not found");
    }
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  // Example 2: List tasks
  console.log("\n--- Example 2: List Tasks with Filters (v1) ---");
  try {
    const result = await engine.callTool(
      "listTasks",
      {
        status: "todo",
        priority: "urgent",
        limit: 10,
      },
      v1Policy
    );
    console.log(`✓ Found ${result.result.count} tasks`);
    result.result.tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. [${task.priority}] ${task.title}`);
    });
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  // Example 3: Analyze dossier status
  console.log("\n--- Example 3: Compute Dossier Status (v1) ---");
  try {
    const result = await engine.callTool(
      "computeDossierStatus",
      { dossierId: 1 },
      v1Policy
    );
    console.log("✓ Dossier analysis complete");
    const { computed } = result.result;
    console.log(`  Total tasks: ${computed.totalTasks}`);
    console.log(`  Completed: ${computed.completedTasks}`);
    console.log(`  Overdue: ${computed.overdueTasks}`);
    console.log(`  Completion rate: ${computed.completionRate}%`);
    console.log(
      `  Days until deadline: ${computed.daysUntilNextDeadline || "N/A"}`
    );
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  // Example 4: Detect overdue tasks
  console.log("\n--- Example 4: Detect Overdue Tasks (v1) ---");
  try {
    const result = await engine.callTool(
      "detectOverdueTasks",
      { priority: "urgent" },
      v1Policy
    );
    console.log(`✓ Found ${result.result.count} overdue urgent tasks`);
    const { analysis } = result.result;
    console.log(`  Average days overdue: ${analysis.averageDaysOverdue}`);
    console.log("  By priority:");
    Object.entries(analysis.byPriority).forEach(([priority, count]) => {
      if (count > 0) {
        console.log(`    ${priority}: ${count}`);
      }
    });
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  // Example 5: Draft client email
  console.log("\n--- Example 5: Draft Client Email (v1) ---");
  try {
    const result = await engine.callTool(
      "draftClientEmail",
      {
        dossierId: 1,
        purpose: "update",
        language: "fr",
      },
      v1Policy
    );
    console.log("✓ Email draft created");
    console.log(`  Header: ${result.result.draft.sections.header}`);
    console.log(
      `  Requires validation: ${result.result.draft.metadata.requiresValidation}`
    );
    console.log(`  Status: ${result.result.draft.metadata.status}`);
    console.log("\n  Body preview:");
    console.log(
      result.result.draft.sections.body.split("\n").slice(0, 5).join("\n")
    );
    console.log("  ...");
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  // Example 6: Scan operational risks
  console.log("\n--- Example 6: Scan Operational Risks (v1) ---");
  try {
    const result = await engine.callTool(
      "scanOperationalRisks",
      {
        entityType: "dossier",
        entityId: 1,
      },
      v1Policy
    );
    console.log("✓ Risk scan complete");
    console.log(`  Risk score: ${result.result.riskScore}/100`);
    console.log(`  Risks identified: ${result.result.risks.length}`);
    result.result.risks.forEach((risk, i) => {
      console.log(
        `    ${i + 1}. [${risk.severity}] ${risk.type}: ${risk.description}`
      );
    });
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }

  // Example 7: Attempt to call EXECUTE tool (will be blocked)
  console.log("\n--- Example 7: Attempt EXECUTE Tool in v1 (BLOCKED) ---");
  try {
    await engine.callTool(
      "createTask",
      {
        title: "New task from agent",
        priority: "high",
      },
      v1Policy
    );
    console.log("✗ SECURITY FAILURE: Tool was not blocked!");
  } catch (error) {
    console.log("✓ Correctly blocked");
    console.log(`  Reason: ${error.reason}`);
    console.log(`  Message: ${error.message}`);
    if (error.suggestedAlternative) {
      console.log(`  Suggested: ${error.suggestedAlternative.toolName}`);
    }
  }

  // Example 8: Check permission before execution
  console.log("\n--- Example 8: Check Permission Before Execution ---");
  const proposal = engine.proposeAction(
    "createTask",
    { title: "Test" },
    v1Policy
  );
  console.log(`Tool: createTask`);
  console.log(`Permitted: ${proposal.permitted}`);
  if (!proposal.permitted) {
    console.log(`Reason: ${proposal.reason}`);
    console.log(`Message: ${proposal.message}`);
  }

  // Example 9: View ledger entries
  console.log("\n--- Example 9: View Recent Ledger Entries ---");
  const ledgerEntries = engine.ledger.list();
  console.log(`Total ledger entries: ${ledgerEntries.length}`);
  console.log("\nLast 3 entries:");
  ledgerEntries.slice(-3).forEach((entry, i) => {
    console.log(
      `  ${i + 1}. [${entry.type}] ${entry.toolName || entry.intent || "N/A"}`
    );
    if (entry.type === "tool_permission_check") {
      console.log(
        `     Permitted: ${entry.permitted}, Reason: ${entry.reason}`
      );
    }
  });

  // Example 10: List available tools by category
  console.log("\n--- Example 10: Available Tools by Category ---");
  const categories = ["read", "analysis", "draft", "execute"];
  categories.forEach((category) => {
    const tools = engine.toolRegistry.list({ category });
    console.log(`\n${category.toUpperCase()} (${tools.length} tools):`);
    tools.forEach((tool) => {
      const versions = tool.allowedAgentVersions.join(", ");
      console.log(`  - ${tool.name} (allowed in: ${versions})`);
    });
  });

  console.log("\n=== Examples Complete ===\n");
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nUnexpected error:", error.message);
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runExamples };
