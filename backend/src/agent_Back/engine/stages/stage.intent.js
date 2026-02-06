"use strict";

const {
  parseSlashCommand,
  getAvailableCommands,
  READ_INTENTS,
} = require("../../intent.classifier");

async function _executeSlashCommand(message, context, policy, engineContext) {
  const parsed = parseSlashCommand(message);

  // Log command attempt
  this.ledger.record({
    type: "slash_command_received",
    command: parsed.command,
    valid: parsed.valid,
    args: parsed.args,
    timestamp: new Date().toISOString(),
  });

  // Handle invalid commands
  if (!parsed.valid) {
    return {
      intent: "COMMAND",
      agentVersion: policy.version,
      reasoner: "command",
      output: {
        type: "explanation",
        entityId: "command_error",
        entityType: "command",
        summary: parsed.error,
        details: parsed.suggestion
          ? [parsed.suggestion]
          : parsed.availableCommands
            ? [
                "Available commands:",
                ...parsed.availableCommands.map((c) => `  ${c}`),
              ]
            : [],
        timestamp: new Date().toISOString(),
        confidence: 1,
        sources: [
          {
            sourceType: "system",
            reference: "command_parser",
            note: "Slash command validation",
          },
        ],
        status: "error",
        source: "command-parser",
        requires_validation: false,
      },
      isCommand: true,
    };
  }

  // Handle /help command specially
  if (parsed.commandKey === "help") {
    const commands = getAvailableCommands();
    const grouped = {};
    commands.forEach((cmd) => {
      if (!grouped[cmd.category]) grouped[cmd.category] = [];
      grouped[cmd.category].push(cmd);
    });

    const details = ["Available commands:"];
    Object.entries(grouped).forEach(([category, cmds]) => {
      if (category !== "help") {
        details.push("");
        details.push(
          `${category.charAt(0).toUpperCase() + category.slice(1)}:`,
        );
        cmds.forEach((cmd) => {
          details.push(`  ${cmd.usage} - ${cmd.description}`);
        });
      }
    });

    return {
      intent: "COMMAND",
      agentVersion: policy.version,
      reasoner: "command",
      output: {
        type: "explanation",
        entityId: "help",
        entityType: "command",
        summary: "Slash Command Reference",
        details,
        timestamp: new Date().toISOString(),
        confidence: 1,
        sources: [
          {
            sourceType: "system",
            reference: "command_registry",
            note: "Available slash commands",
          },
        ],
        status: "complete",
        source: "command-parser",
        requires_validation: false,
      },
      isCommand: true,
    };
  }

  // Execute command using READ intent pipeline
  try {
      const result = await this._executeCommandTools(
        parsed,
        context,
        policy,
        message,
        engineContext,
      );

    this.ledger.record({
      type: "slash_command_executed",
      command: parsed.command,
      success: true,
      timestamp: new Date().toISOString(),
    });

    return {
      ...result,
      isCommand: true,
    };
  } catch (err) {
    this.ledger.record({
      type: "slash_command_error",
      command: parsed.command,
      error: err.message,
      timestamp: new Date().toISOString(),
    });

    return {
      intent: "COMMAND",
      agentVersion: policy.version,
      reasoner: "command",
      output: {
        type: "explanation",
        entityId: "command_error",
        entityType: "command",
        summary: `Command failed: ${err.message}`,
        details: ["The command could not be executed."],
        timestamp: new Date().toISOString(),
        confidence: 1,
        sources: [{ sourceType: "system", reference: "command-parser" }],
        status: "error",
        source: "command-parser",
        requires_validation: false,
      },
      isCommand: true,
    };
  }
}

/**
 * Execute a READ intent (deterministic data access)
 * This bypasses LLM for intent classification - data is retrieved first
 * LLM is only used for formatting/explanation after data is retrieved
 *
 * CRITICAL: Domain access is checked BEFORE any database queries.
 * If the required domain is disabled, the intent is BLOCKED.
 *
 * @param {Object} readIntent - Detected READ intent from detectReadIntent()
 * @param {string} message - Original user message
 * @param {Object} context - Request context
 * @param {Object} policy - Current agent policy
 * @returns {Promise<Object>} Data response
 * @private
*/

async function _executeCommandTools(
  parsed,
  context,
  policy,
  message,
  engineContext,
) {
  const { commandKey, args } = parsed;
  const argText = args.join(" ").trim();

  const buildHintFromArg = (arg) => {
    if (!arg) return [];
    const trimmed = String(arg).trim();
    if (!trimmed) return [];
    if (/^\d+$/.test(trimmed)) {
      return [{ type: "id", value: parseInt(trimmed, 10) }];
    }
    if (/^DOS-\d{4}-\d+$/i.test(trimmed)) {
      return [
        {
          type: "reference",
          value: trimmed.toUpperCase(),
          entityType: "dossier",
        },
      ];
    }
    if (/^PRO-\d{4}-\d+$/i.test(trimmed)) {
      return [
        {
          type: "reference",
          value: trimmed.toUpperCase(),
          entityType: "lawsuit",
        },
      ];
    }
    if (/^MIS-\d{4}-\d+$/i.test(trimmed)) {
      return [
        {
          type: "reference",
          value: trimmed.toUpperCase(),
          entityType: "mission",
        },
      ];
    }
    return [{ type: "name", value: trimmed }];
  };

  const readIntent = (() => {
    switch (commandKey) {
      case "clients":
        return { intent: READ_INTENTS.LIST_CLIENTS, requiresLocalData: true };
      case "client":
        return {
          intent: READ_INTENTS.READ_CLIENT,
          requiresLocalData: true,
          entityHints: buildHintFromArg(argText),
        };
      case "dossiers":
        return { intent: READ_INTENTS.LIST_DOSSIERS, requiresLocalData: true };
      case "dossier":
        return {
          intent: READ_INTENTS.READ_DOSSIER,
          requiresLocalData: true,
          entityHints: buildHintFromArg(argText),
        };
      case "lawsuits":
        return { intent: READ_INTENTS.LIST_LAWSUITS, requiresLocalData: true };
      case "lawsuit":
        return {
          intent: READ_INTENTS.READ_LAWSUIT,
          requiresLocalData: true,
          entityHints: buildHintFromArg(argText),
        };
      case "tasks":
        return { intent: READ_INTENTS.LIST_TASKS, requiresLocalData: true };
      case "tasks-overdue":
        return {
          intent: READ_INTENTS.LIST_OVERDUE_TASKS,
          requiresLocalData: true,
        };
      case "personal-tasks":
        return {
          intent: READ_INTENTS.LIST_PERSONAL_TASKS,
          requiresLocalData: true,
        };
      case "personal-task":
        return {
          intent: READ_INTENTS.READ_PERSONAL_TASK,
          requiresLocalData: true,
          entityHints: buildHintFromArg(argText),
        };
      case "sessions": {
        const normalized = argText.toLowerCase();
        if (["today", "this-week", "upcoming"].includes(normalized)) {
          return {
            intent: READ_INTENTS.LIST_UPCOMING_SESSIONS,
            requiresLocalData: true,
            filters: { timeframe: normalized },
          };
        }
        return { intent: READ_INTENTS.LIST_SESSIONS, requiresLocalData: true };
      }
      case "sessions-today":
        return {
          intent: READ_INTENTS.LIST_UPCOMING_SESSIONS,
          requiresLocalData: true,
          filters: { timeframe: "today" },
        };
      case "sessions-week":
        return {
          intent: READ_INTENTS.LIST_UPCOMING_SESSIONS,
          requiresLocalData: true,
          filters: { timeframe: "this-week" },
        };
      case "missions":
        return { intent: READ_INTENTS.LIST_MISSIONS, requiresLocalData: true };
      case "mission":
        return {
          intent: READ_INTENTS.READ_MISSION,
          requiresLocalData: true,
          entityHints: buildHintFromArg(argText),
        };
      case "accounting": {
        const normalized = argText.toLowerCase();
        const paymentStatus = ["unpaid", "paid", "overdue"].includes(normalized)
          ? normalized
          : null;
        return {
          intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
          requiresLocalData: true,
          filters: { paymentStatus },
        };
      }
      case "accounting-unpaid":
        return {
          intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
          requiresLocalData: true,
          filters: { paymentStatus: "unpaid" },
        };
      case "accounting-paid":
        return {
          intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
          requiresLocalData: true,
          filters: { paymentStatus: "paid" },
        };
      case "accounting-overdue":
        return {
          intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
          requiresLocalData: true,
          filters: { paymentStatus: "overdue" },
        };
      case "notifications": {
        const normalized = argText.toLowerCase();
        const status = ["unread", "read"].includes(normalized)
          ? normalized
          : null;
        return {
          intent: READ_INTENTS.LIST_NOTIFICATIONS,
          requiresLocalData: true,
          filters: { status },
        };
      }
      case "notifications-unread":
        return {
          intent: READ_INTENTS.LIST_NOTIFICATIONS,
          requiresLocalData: true,
          filters: { status: "unread" },
        };
      case "notifications-read":
        return {
          intent: READ_INTENTS.LIST_NOTIFICATIONS,
          requiresLocalData: true,
          filters: { status: "read" },
        };
      case "history":
        return {
          intent: READ_INTENTS.LIST_HISTORY_EVENTS,
          requiresLocalData: true,
          filters: { entityType: argText || null },
        };
      case "web-search":
        return {
          intent: READ_INTENTS.WEB_SEARCH,
          requiresLocalData: true,
          filters: {
            query: argText,
          },
        };
      case "deep-search":
        return {
          intent: READ_INTENTS.DEEP_SEARCH,
          requiresLocalData: true,
          filters: {
            query: argText,
          },
        };
      default:
        return null;
    }
  })();

  if (!readIntent) {
    throw new Error(`Command ${commandKey} not implemented`);
  }

  return this._executeReadIntent(
    readIntent,
    message || parsed.command,
    context,
    policy,
    engineContext,
  );
}

module.exports = {
  _executeSlashCommand,
  _executeCommandTools,
};
