"use strict";

const { INTENTS, INTENT_LIST, READ_INTENTS } = require("./intents");
const { classifyIntentWithLLM } = require("./llm.client");

/**
 * Data requirement types that can be detected from user messages
 */
const DATA_REQUIREMENTS = Object.freeze({
  CLIENT: "client",
  DOSSIER: "dossier",
  LAWSUIT: "lawsuit",
  TASK: "task",
  PERSONAL_TASK: "personal_task",
  MISSION: "mission",
  OFFICER: "officer",
  FINANCIAL_ENTRY: "financial_entry",
  NOTIFICATION: "notification",
  HISTORY_EVENT: "history_event",
  SESSION: "session",
  OVERDUE_TASKS: "overdue_tasks",
  UPCOMING_SESSIONS: "upcoming_sessions",
  TIMELINE: "timeline",
});

/**
 * Slash Command Registry
 * Defines all supported slash commands with their mappings to tools
 */
const SLASH_COMMANDS = Object.freeze({
  // Client commands
  clients: {
    command: "/clients",
    description: "List all clients",
    usage: "/clients",
    tools: ["listClients"],
    params: {},
    category: "clients",
  },
  client: {
    command: "/client",
    description: "Get client by name",
    usage: "/client <name>",
    tools: ["searchClientsByName", "getClient"],
    params: { requiresArg: true, argType: "nameOrId" },
    category: "clients",
  },

  // Dossier commands
  dossiers: {
    command: "/dossiers",
    description: "List all dossiers",
    usage: "/dossiers",
    tools: ["listDossiers"],
    params: {},
    category: "dossiers",
  },
  dossier: {
    command: "/dossier",
    description: "Get dossier by reference",
    usage: "/dossier <reference>",
    tools: ["getDossierByReference", "getDossier"],
    params: { requiresArg: true, argType: "referenceOrId" },
    category: "dossiers",
  },

  // Task commands
  tasks: {
    command: "/tasks",
    description: "List tasks (optionally filtered)",
    usage: "/tasks [overdue|pending|today]",
    tools: ["listTasks"],
    params: { optionalArg: true, argType: "filter" },
    category: "tasks",
  },
  "tasks-overdue": {
    command: "/tasks overdue",
    description: "List overdue tasks",
    usage: "/tasks overdue",
    tools: ["detectOverdueTasks"],
    params: {},
    category: "tasks",
  },

  // Session commands
  sessions: {
    command: "/sessions",
    description: "List sessions (optionally filtered by time)",
    usage: "/sessions [today|this-week|upcoming]",
    tools: ["listSessions"],
    params: { optionalArg: true, argType: "timeFilter" },
    category: "sessions",
  },
  "sessions-today": {
    command: "/sessions today",
    description: "List sessions scheduled for today",
    usage: "/sessions today",
    tools: ["listSessionsToday"],
    params: { filter: "today" },
    category: "sessions",
  },
  "sessions-week": {
    command: "/sessions this-week",
    description: "List sessions scheduled for this week",
    usage: "/sessions this-week",
    tools: ["listSessionsThisWeek"],
    params: { filter: "this-week" },
    category: "sessions",
  },

  // Lawsuit commands
  lawsuits: {
    command: "/lawsuits",
    description: "List all lawsuits",
    usage: "/lawsuits",
    tools: ["listLawsuits"],
    params: {},
    category: "lawsuits",
  },
  lawsuit: {
    command: "/lawsuit",
    description: "Get lawsuit by reference",
    usage: "/lawsuit <reference>",
    tools: ["listLawsuits", "getLawsuit"],
    params: { requiresArg: true, argType: "referenceOrId" },
    category: "lawsuits",
  },

  // Mission commands
  missions: {
    command: "/missions",
    description: "List all missions",
    usage: "/missions",
    tools: ["listMissions"],
    params: {},
    category: "missions",
  },
  mission: {
    command: "/mission",
    description: "Get mission by reference",
    usage: "/mission <reference>",
    tools: ["listMissions", "getMission"],
    params: { requiresArg: true, argType: "referenceOrId" },
    category: "missions",
  },
  officers: {
    command: "/officers",
    description: "List all bailiffs/officers",
    usage: "/officers",
    tools: ["listOfficers"],
    params: {},
    category: "officers",
  },
  officer: {
    command: "/officer",
    description: "Get bailiff/officer by name",
    usage: "/officer <name>",
    tools: ["listOfficers", "getOfficer"],
    params: { requiresArg: true, argType: "nameOrId" },
    category: "officers",
  },

  // Personal task commands
  "personal-tasks": {
    command: "/personal-tasks",
    description: "List personal tasks",
    usage: "/personal-tasks",
    tools: ["listPersonalTasks"],
    params: {},
    category: "personal_tasks",
  },
  "personal-task": {
    command: "/personal-task",
    description: "Get personal task by title",
    usage: "/personal-task <title>",
    tools: ["listPersonalTasks", "getPersonalTask"],
    params: { requiresArg: true, argType: "titleOrId" },
    category: "personal_tasks",
  },

  // Accounting commands
  accounting: {
    command: "/accounting",
    description: "List financial entries",
    usage: "/accounting [unpaid|paid|overdue]",
    tools: ["listFinancialEntries"],
    params: { optionalArg: true, argType: "filter" },
    category: "accounting",
  },
  "accounting-unpaid": {
    command: "/accounting unpaid",
    description: "List unpaid financial entries",
    usage: "/accounting unpaid",
    tools: ["listFinancialEntries"],
    params: { filter: "unpaid" },
    category: "accounting",
  },
  "accounting-paid": {
    command: "/accounting paid",
    description: "List paid financial entries",
    usage: "/accounting paid",
    tools: ["listFinancialEntries"],
    params: { filter: "paid" },
    category: "accounting",
  },
  "accounting-overdue": {
    command: "/accounting overdue",
    description: "List overdue financial entries",
    usage: "/accounting overdue",
    tools: ["listFinancialEntries"],
    params: { filter: "overdue" },
    category: "accounting",
  },

  // Notification commands
  notifications: {
    command: "/notifications",
    description: "List notifications",
    usage: "/notifications [unread|read]",
    tools: ["listNotifications"],
    params: { optionalArg: true, argType: "filter" },
    category: "notifications",
  },
  "notifications-unread": {
    command: "/notifications unread",
    description: "List unread notifications",
    usage: "/notifications unread",
    tools: ["listNotifications"],
    params: { filter: "unread" },
    category: "notifications",
  },
  "notifications-read": {
    command: "/notifications read",
    description: "List read notifications",
    usage: "/notifications read",
    tools: ["listNotifications"],
    params: { filter: "read" },
    category: "notifications",
  },

  // History commands
  history: {
    command: "/history",
    description: "List recent history/audit events",
    usage: "/history [entity]",
    tools: ["listHistoryEvents"],
    params: { optionalArg: true, argType: "entityType" },
    category: "history",
  },
  "web-search": {
    command: "/web-search",
    description: "Run an explicit web search",
    usage: "/web-search <query>",
    tools: ["mcpWebSearch"],
    params: { requiresArg: true, argType: "query" },
    category: "web_search",
  },
  "deep-search": {
    command: "/deep-search",
    description: "Run an explicit deep legal search",
    usage: "/deep-search <query>",
    tools: ["mcpDeepSearch"],
    params: { requiresArg: true, argType: "query" },
    category: "deep_search",
  },

  // Help command
  help: {
    command: "/help",
    description: "Show available commands",
    usage: "/help",
    tools: [],
    params: {},
    category: "help",
  },
});

/**
 * Check if a message is a slash command
 * @param {string} message - User message
 * @returns {boolean} True if message starts with /
 */
function isSlashCommand(message) {
  return typeof message === "string" && message.trim().startsWith("/");
}

/**
 * Parse a slash command message
 * Returns command details or error
 *
 * @param {string} message - User message starting with /
 * @returns {Object} Parsed command: { valid, command, args, error, toolMapping }
 */
function parseSlashCommand(message) {
  if (!isSlashCommand(message)) {
    return { valid: false, error: "Not a slash command" };
  }

  const trimmed = message.trim();
  const parts = trimmed.split(/\s+/);
  const commandPart = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Build potential compound command (e.g., "/tasks overdue")
  const compoundKey =
    args.length > 0 ? `${commandPart.slice(1)}-${args[0].toLowerCase()}` : null;

  // Check for compound command first
  if (compoundKey && SLASH_COMMANDS[compoundKey]) {
    const cmd = SLASH_COMMANDS[compoundKey];
    return {
      valid: true,
      command: cmd.command,
      commandKey: compoundKey,
      args: args.slice(1), // remaining args after compound
      toolMapping: cmd,
    };
  }

  // Check for simple command
  const simpleKey = commandPart.slice(1); // remove leading /
  if (SLASH_COMMANDS[simpleKey]) {
    const cmd = SLASH_COMMANDS[simpleKey];

    // Validate required arguments
    if (cmd.params.requiresArg && args.length === 0) {
      return {
        valid: false,
        command: cmd.command,
        error: `Command ${cmd.command} requires an argument. Usage: ${cmd.usage}`,
        suggestion: cmd.usage,
      };
    }

    return {
      valid: true,
      command: cmd.command,
      commandKey: simpleKey,
      args,
      toolMapping: cmd,
    };
  }

  // Unknown command - provide suggestions
  const availableCommands = Object.values(SLASH_COMMANDS)
    .filter((c) => c.category !== "help")
    .map((c) => c.command);

  return {
    valid: false,
    command: commandPart,
    error: `Unknown command: ${commandPart}`,
    availableCommands,
    suggestion: "Type /help to see available commands",
  };
}

/**
 * Get all available slash commands for UI autocomplete
 * @returns {Array} List of command objects with command, description, usage
 */
function getAvailableCommands() {
  return Object.values(SLASH_COMMANDS).map((cmd) => ({
    command: cmd.command,
    description: cmd.description,
    usage: cmd.usage,
    category: cmd.category,
  }));
}

/**
 * Detect what local data is required based on user message content
 * This is rule-based, not AI-driven - deterministic detection
 *
 * @param {string} message - User message
 * @param {Object} context - Request context (scope, refs)
 * @returns {Object} Data requirements: { needs: [], entityHints: [], scope: string }
 */
function detectDataRequirements(message, context = {}) {
  const normalized = message.toLowerCase();
  const needs = [];
  const entityHints = [];

  // Pattern 1: Status/state inquiries require entity data
  const statusPatterns = [
    /status\s+of/i,
    /state\s+of/i,
    /what('s|s| is)\s+(the\s+)?(status|state|situation)/i,
    /how\s+is\s+(the\s+)?(\w+)/i,
    /why\s+is\s+(this|the)/i,
    /what('s|s| is)\s+happening/i,
    /show\s+(me\s+)?(the\s+)?/i,
  ];

  // Pattern 2: List/summary requests
  const listPatterns = [
    /list\s+(all\s+)?(my\s+)?/i,
    /show\s+(all\s+)?(my\s+)?/i,
    /what\s+(are\s+)?(my\s+)?/i,
    /do\s+i\s+have/i,
    /summarize/i,
    /summary\s+of/i,
    /overview/i,
  ];

  // Pattern 3: Temporal queries
  const temporalPatterns = [
    /today/i,
    /this\s+week/i,
    /next\s+week/i,
    /upcoming/i,
    /overdue/i,
    /pending/i,
    /deadline/i,
    /due\s+(date|soon|today|this)/i,
  ];

  // Pattern 4: Entity type mentions
  const entityTypePatterns = {
    client: /\b(client|clients)\b/i,
    dossier: /\b(dossier|dossiers|case\s*file|matter)\b/i,
    lawsuit: /\b(lawsuit|lawsuits|case|cases|trial|proces)\b/i,
    personal_task: /\b(personal\s+task|personal\s+tasks)\b/i,
    task: /\b(task|tasks|todo|to-do)\b/i,
    session: /\b(session|sessions|meeting|appointment)\b/i,
    mission: /\b(mission|missions)\b/i,
    officer: /\b(officer|officers|bailiff|bailiffs|huissier|huissiers)\b/i,
    financial_entry:
      /\b(accounting|financial|invoice|payment|expense|billing|entry|entries)\b/i,
    notification: /\b(notification|notifications|alert|alerts)\b/i,
    history_event: /\b(history|audit\s*trail|activity\s*log|audit)\b/i,
  };

  // Check for status inquiries
  const hasStatusInquiry = statusPatterns.some((p) => p.test(normalized));

  // Check for list requests
  const hasListRequest = listPatterns.some((p) => p.test(normalized));

  // Check for temporal context
  const hasTemporal = temporalPatterns.some((p) => p.test(normalized));

  // Detect entity type mentions
  Object.entries(entityTypePatterns).forEach(([type, pattern]) => {
    if (pattern.test(normalized)) {
      needs.push(DATA_REQUIREMENTS[type.toUpperCase()]);
    }
  });

  // Detect overdue task queries
  if (
    /overdue/i.test(normalized) ||
    (hasTemporal && /task/i.test(normalized))
  ) {
    needs.push(DATA_REQUIREMENTS.OVERDUE_TASKS);
  }

  // Detect upcoming session queries
  if (
    /upcoming/i.test(normalized) &&
    /session|meeting|appointment/i.test(normalized)
  ) {
    needs.push(DATA_REQUIREMENTS.UPCOMING_SESSIONS);
  }

  // Detect timeline requests
  if (/timeline|history|activity|recent/i.test(normalized)) {
    needs.push(DATA_REQUIREMENTS.TIMELINE);
  }

  // Extract potential entity name hints (quoted names or capitalized words after possessive)
  // Pattern: "Emma's dossier" → hint: { type: 'client', name: 'Emma' }
  const possessiveMatch = normalized.match(
    /(\w+)(?:'s|s')\s+(dossier|lawsuit|case|task|matter|file)/i,
  );
  if (possessiveMatch) {
    entityHints.push({
      type: "client",
      nameHint: possessiveMatch[1],
      targetEntity: possessiveMatch[2].toLowerCase(),
    });
  }

  // Pattern: "dossier for Emma" or "client Emma"
  const forClientMatch = normalized.match(
    /(dossier|lawsuit|case|matter)\s+for\s+(\w+)/i,
  );
  if (forClientMatch) {
    entityHints.push({
      type: "client",
      nameHint: forClientMatch[2],
      targetEntity: forClientMatch[1].toLowerCase(),
    });
  }

  // Pattern: "client named X" or "client X"
  const clientNameMatch = message.match(/client\s+(?:named\s+)?([A-Z][a-z]+)/);
  if (clientNameMatch) {
    entityHints.push({
      type: "client",
      nameHint: clientNameMatch[1],
      targetEntity: "client",
    });
  }

  // Pattern: dossier reference "DOS-2024-123456"
  const dossierRefMatch = message.match(/DOS-\d{4}-\d+/i);
  if (dossierRefMatch) {
    entityHints.push({
      type: "dossier",
      reference: dossierRefMatch[0].toUpperCase(),
      targetEntity: "dossier",
    });
  }

  // Determine if local data is actually required
  const requiresData =
    needs.length > 0 ||
    entityHints.length > 0 ||
    (hasStatusInquiry &&
      (context.scope !== "GLOBAL" || entityHints.length > 0)) ||
    hasListRequest;

  return {
    requiresData,
    needs: [...new Set(needs)], // deduplicate
    entityHints,
    hasStatusInquiry,
    hasListRequest,
    hasTemporal,
    contextScope: context.scope || "GLOBAL",
  };
}

/**
 * Extract entity hints from user message (names, references)
 * @param {string} message - User message
 * @returns {Array} Array of entity hints
 */
function extractEntityHints(message) {
  const hints = [];

  // Pattern: "about X" or "regarding X" (e.g., "tell me about Youssef Daly")
  const aboutMatch = message.match(
    /(?:about|regarding|concerning)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/,
  );
  if (aboutMatch) hints.push({ type: "name", value: aboutMatch[1].trim() });

  // Pattern: explicit numeric ID "id 123" or "#123"
  const idMatch = message.match(/(?:\b(id|#)\s*)(\d{1,9})/i);
  if (idMatch) {
    hints.push({ type: "id", value: parseInt(idMatch[2], 10) });
  }

  // Pattern: typed ID "client 123", "dossier 45"
  const typedIdMatch = message.match(
    /\b(client|dossier|lawsuit|case|session|task|personal\s+task|mission|officer|bailiff|huissier|notification|history|financial\s+entry|accounting\s+entry)\s+#?(\d{1,9})\b/i,
  );
  if (typedIdMatch) {
    const rawType = typedIdMatch[1].toLowerCase();
    const typeMap = {
      case: "lawsuit",
      "personal task": "personal_task",
      bailiff: "officer",
      huissier: "officer",
      "financial entry": "financial_entry",
      "accounting entry": "financial_entry",
      history: "history_event",
    };
    const entityType = typeMap[rawType] || rawType;
    hints.push({
      type: "id",
      value: parseInt(typedIdMatch[2], 10),
      entityType,
    });
  }

  // Possessive pattern: "Emma's dossier"
  const possMatch = message.match(
    /(\w+)(?:'s|s')\s+(dossier|client|task|lawsuit|case)/i,
  );
  if (possMatch)
    hints.push({ type: "name", value: possMatch[1], entityType: "client" });

  // "for X" pattern: "dossier for Emma"
  const forMatch = message.match(
    /(?:dossier|lawsuit|case|task|session|mission|officer|bailiff|huissier|accounting|financial|invoice|payment|expense|billing|entry|entries)\s+for\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/i,
  );
  if (forMatch)
    hints.push({ type: "name", value: forMatch[1], entityType: "client" });

  // Dossier reference: DOS-2024-123456
  const dossierRefMatch = message.match(/DOS-\d{4}-\d+/i);
  if (dossierRefMatch) {
    hints.push({
      type: "reference",
      value: dossierRefMatch[0].toUpperCase(),
      entityType: "dossier",
    });
  }

  // Mission reference: MIS-2024-123456
  const missionRefMatch = message.match(/MIS-\d{4}-\d+/i);
  if (missionRefMatch) {
    hints.push({
      type: "reference",
      value: missionRefMatch[0].toUpperCase(),
      entityType: "mission",
    });
  }

  // Lawsuit reference: PRO-2024-001
  const lawsuitRefMatch = message.match(/PRO-\d{4}-\d+/i);
  if (lawsuitRefMatch) {
    hints.push({
      type: "reference",
      value: lawsuitRefMatch[0].toUpperCase(),
      entityType: "lawsuit",
    });
  }

  // Generic reference: "reference ABC-123"
  const genericRefMatch = message.match(/reference\s+([A-Z0-9\-]+)/i);
  if (genericRefMatch) {
    hints.push({ type: "reference", value: genericRefMatch[1].toUpperCase() });
  }

  // Capitalized name after "client"
  const clientMatch = message.match(
    /client\s+(?:named\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
  );
  if (clientMatch)
    hints.push({
      type: "name",
      value: clientMatch[1],
      entityType: "client",
    });

  // Capitalized name after "dossier" or "case"
  const dossierNameMatch = message.match(
    /(dossier|case\s*file|matter)\s+(?:named\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/i,
  );
  if (dossierNameMatch)
    hints.push({
      type: "name",
      value: dossierNameMatch[2],
      entityType: "dossier",
    });

  // Capitalized name after "lawsuit"
  const lawsuitNameMatch = message.match(
    /(lawsuit|case|trial)\s+(?:named\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/i,
  );
  if (lawsuitNameMatch)
    hints.push({
      type: "name",
      value: lawsuitNameMatch[2],
      entityType: "lawsuit",
    });

  // Capitalized name after "task"
  const taskNameMatch = message.match(
    /(task|personal\s+task)\s+(?:named\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/i,
  );
  if (taskNameMatch) {
    const type = String(taskNameMatch[1]).toLowerCase().includes("personal")
      ? "personal_task"
      : "task";
    hints.push({
      type: "name",
      value: taskNameMatch[2],
      entityType: type,
    });
  }

  // Capitalized name after "session"/"hearing"
  const sessionNameMatch = message.match(
    /(session|hearing|meeting)\s+(?:named\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/i,
  );
  if (sessionNameMatch)
    hints.push({
      type: "name",
      value: sessionNameMatch[2],
      entityType: "session",
    });

  // Capitalized name after "mission"
  const missionNameMatch = message.match(
    /(mission)\s+(?:named\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/i,
  );
  if (missionNameMatch)
    hints.push({
      type: "name",
      value: missionNameMatch[2],
      entityType: "mission",
    });

  // Capitalized name after "officer"/"bailiff"/"huissier"
  const officerNameMatch = message.match(
    /(officer|bailiff|huissier)\s+(?:named\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/i,
  );
  if (officerNameMatch)
    hints.push({
      type: "name",
      value: officerNameMatch[2],
      entityType: "officer",
    });

  // Pattern: "X's status/info/details" (where X is capitalized name)
  const statusMatch = message.match(
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)'s\s+(?:status|info|information|details|data)/,
  );
  if (statusMatch) hints.push({ type: "name", value: statusMatch[1].trim() });

  return hints;
}

const AGGREGATE_QUANTIFIER_PATTERN =
  /\b(all|every|each|any|active|inactive|open|closed|pending|overdue|upcoming|current|recent|archived|unpaid|paid|workload|backlog|balance|balances)\b/i;

const AGGREGATE_PLURAL_PATTERNS = Object.freeze({
  client: /\bclients\b/i,
  dossier: /\bdossiers\b/i,
  lawsuit: /\blawsuits\b/i,
  task: /\btasks\b/i,
  personal_task: /\bpersonal\s+tasks\b/i,
  session: /\bsessions\b/i,
  mission: /\bmissions\b/i,
  officer: /\b(officers|bailiffs|huissiers)\b/i,
  financial_entry: /\b(entries|financials|invoices|payments)\b/i,
  notification: /\bnotifications\b/i,
  history_event: /\b(history\s+events|history|audit\s*trail|activity\s*log)\b/i,
});

const SCOPE_ID_KEYS = Object.freeze({
  client: "clientId",
  dossier: "dossierId",
  lawsuit: "lawsuitId",
  task: "taskId",
  personal_task: "personalTaskId",
  session: "sessionId",
  mission: "missionId",
  officer: "officerId",
  financial_entry: "financialEntryId",
  notification: "notificationId",
  history_event: "historyEventId",
});

function hasExplicitEntityTarget(entityType, entityHints, context) {
  if (!entityType) return false;
  const scope = String(context?.scope || "").toLowerCase();
  const scopedKey = SCOPE_ID_KEYS[entityType];
  const scopedEntity =
    scopedKey && scope === entityType && context?.[scopedKey] != null;

  if (scopedEntity) return true;

  return entityHints.some((hint) => {
    if (hint.type === "id" || hint.type === "reference") {
      return !hint.entityType || hint.entityType === entityType;
    }
    if (hint.type === "name" && hint.entityType) {
      return hint.entityType === entityType;
    }
    return false;
  });
}

function detectAggregateSummaryRequest(
  normalized,
  entityType,
  entityHints,
  context,
) {
  if (!entityType) return false;
  const pluralSignal = AGGREGATE_PLURAL_PATTERNS[entityType]?.test(normalized);
  const quantifierSignal = AGGREGATE_QUANTIFIER_PATTERN.test(normalized);
  if (!pluralSignal && !quantifierSignal) return false;
  if (hasExplicitEntityTarget(entityType, entityHints, context)) return false;
  return true;
}

function buildAggregateFilters(normalized, entityType, temporal) {
  const filters = {};

  if (temporal?.today) filters.timeframe = "today";
  if (temporal?.thisWeek) filters.timeframe = "this-week";
  if (temporal?.upcoming) filters.timeframe = "upcoming";

  if (/\b(unpaid|paid|overdue)\b/i.test(normalized)) {
    const paymentStatus = normalized.match(/\b(unpaid|paid|overdue)\b/i)?.[1];
    if (paymentStatus) filters.paymentStatus = paymentStatus.toLowerCase();
  }

  if (/\b(urgent|high|medium|low)\b/i.test(normalized)) {
    const priority = normalized.match(/\b(urgent|high|medium|low)\b/i)?.[1];
    if (priority) filters.priority = priority.toLowerCase();
  }

  if (/\b(overdue)\b/i.test(normalized)) {
    filters.overdue = true;
  }

  if (
    /\b(active|open|pending|closed|inactive|archived|blocked|done|completed|cancelled)\b/i.test(
      normalized,
    )
  ) {
    const status = normalized.match(
      /\b(active|open|pending|closed|inactive|archived|blocked|done|completed|cancelled)\b/i,
    )?.[1];
    if (status) {
      filters.status = status.toLowerCase();
      if (
        ["active", "open", "pending"].includes(filters.status) &&
        (entityType === "task" || entityType === "personal_task")
      ) {
        filters.activity = "active";
      }
    }
  }

  return filters;
}

/**
 * Detect DRAFT intent using rule-based pattern matching.
 * Runs BEFORE LLM classification — deterministic verb-first detection.
 *
 * Returns null if no draft intent detected.
 * Returns descriptor with intent, draftType, and entityHints if detected.
 *
 * @param {string} message - User message
 * @param {Object} context - Request context
 * @returns {Object|null} DRAFT intent descriptor or null
 */
function detectDraftIntent(message, context = {}) {
  const normalized = message.toLowerCase();

  // Exclude generic/template requests — these are informational, not production
  const genericPatterns = [
    /\b(a|an)\s+(sample|example|template|generic)\s+(email|letter|message|document|invitation)\b/i,
    /\bhow\s+to\s+(write|draft|compose|structure)\s+(a|an)\b/i,
    /\b(email|letter|message|document|invitation)\s+(template|example|sample|format)\b/i,
  ];
  if (genericPatterns.some((p) => p.test(normalized))) {
    return null;
  }

  // Verb-first detection: draft, write, compose, prepare, rédiger
  const draftVerbPattern = /\b(draft|write|compose|prepare|rédiger|rediger)\b/i;
  if (!draftVerbPattern.test(normalized)) {
    return null;
  }

  // Detect draft type from message
  // --- Explicit document-type patterns (highest confidence) ---
  const isInvitation =
    /\b(invitation|convocation|invite|meeting\s+request|summons|summon|assignation)\b/i.test(
      normalized,
    );
  const isClientEmail =
    /\b(email|e-mail|mail|letter|message|courrier|lettre)\b/i.test(
      normalized,
    ) && /\b(client|customer|mandant)\b/i.test(normalized);
  const isHearingSummary =
    /\b(hearing\s+summary|session\s+summary|compte[\s-]?rendu|summary\s+of\s+(?:the\s+)?(?:hearing|session))\b/i.test(
      normalized,
    );
  const isInternalNote = /\b(internal\s+note|memo|note\s+interne)\b/i.test(
    normalized,
  );
  const isResponse =
    /\b(response|reply|r[eé]ponse)\b/i.test(normalized) &&
    /\b(client|customer|mandant|party|partie|opposing|adverse)\b/i.test(
      normalized,
    );
  const isStandaloneNote =
    !isInternalNote &&
    /\b(note|note\s+de\s+service)\b/i.test(normalized) &&
    !/\bnote\s+(that|the|this|how|why|about\s+the\s+difference)\b/i.test(
      normalized,
    );

  let intent = null;
  let draftType = null;
  let draftTypeConfidence = 0;

  if (isInvitation) {
    intent = INTENTS.DRAFT_INVITATION;
    draftType = "INVITATION";
    draftTypeConfidence = 1;
  } else if (isClientEmail) {
    intent = INTENTS.DRAFT_CLIENT_EMAIL;
    draftType = "CLIENT_EMAIL";
    draftTypeConfidence = 1;
  } else if (isHearingSummary) {
    intent = INTENTS.DRAFT_INVITATION;
    draftType = "HEARING_SUMMARY";
    draftTypeConfidence = 1;
  } else if (isInternalNote) {
    intent = INTENTS.DRAFT_INVITATION;
    draftType = "INTERNAL_NOTE";
    draftTypeConfidence = 1;
  } else if (isResponse) {
    // "response to client" → CLIENT_EMAIL; "response to opposing party" → INVITATION
    const isOpposingParty = /\b(opposing|adverse|partie\s+adverse)\b/i.test(
      normalized,
    );
    intent = isOpposingParty
      ? INTENTS.DRAFT_INVITATION
      : INTENTS.DRAFT_CLIENT_EMAIL;
    draftType = isOpposingParty ? "INVITATION" : "CLIENT_EMAIL";
    draftTypeConfidence = 1;
  } else if (isStandaloneNote) {
    intent = INTENTS.DRAFT_INVITATION;
    draftType = "INTERNAL_NOTE";
    draftTypeConfidence = 1;
  }
  if (!draftType) {
    intent = INTENTS.DRAFT_GENERIC;
    draftTypeConfidence = 0;
  }

  // Extract entity hints using existing helper
  const entityHints = extractEntityHints(message);

  // Extract "for X" patterns specific to drafting context
  const forMatch = message.match(
    /(?:draft|write|compose|prepare|rédiger|rediger)\s+(?:an?\s+)?(?:\w+\s+){0,3}(?:for|pour)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/i,
  );
  if (forMatch && !entityHints.some((h) => h.value === forMatch[1].trim())) {
    entityHints.push({ type: "name", value: forMatch[1].trim() });
  }

  return {
    intent,
    draftType,
    draftTypeConfidence,
    entityHints,
  };
}

/**
 * Detect READ intent from user message using rule-based patterns
 * This runs BEFORE LLM classification to ensure data questions access local data
 *
 * CRITICAL: This gate MUST catch all data retrieval requests.
 * If this gate misses a pattern, the request falls to LLM streaming
 * which may retrieve data but fail to present it properly.
 *
 * @param {string} message - User message
 * @param {Object} context - Request context
 * @returns {Object|null} READ intent object or null if no READ intent detected
 */
function detectReadIntent(message, context = {}) {
  const normalized = message.toLowerCase();

  // DOMAIN LANGUAGE DECOUPLING: Filter out generic domain language usage
  // These patterns indicate the user is using domain terms generically (examples, templates)
  // NOT requesting access to system data
  const genericDomainUsagePatterns = [
    /\b(a|an)\s+(sample|example|template|draft|generic|simple|professional|formal|informal)\s+(email|letter|message|document|invitation|cover\s+letter)\b/i,
    /\b(sample|example|template|generic)\s+(of|for)\s+(a|an)\b/i,
    /\b(email|letter|message|document|invitation)\s+(template|example|sample|format)\b/i,
    /\bhow\s+to\s+(write|draft|compose|structure)\s+(a|an)\b/i,
    /\bstructured\s+(email|letter|message|document|invitation|cover\s+letter)\b/i,
  ];

  const isGenericDomainUsage = genericDomainUsagePatterns.some((pattern) =>
    pattern.test(normalized),
  );

  if (isGenericDomainUsage) {
    console.log(
      "[Domain Language Decoupling] Generic domain usage detected, not requiring system data:",
      message.slice(0, 60),
    );
    return null;
  }

  const explicitWebSearchPattern =
    /\b(search\s+the\s+web|web\s+search|search\s+online|internet\s+search|look\s+up\s+online|find\s+online|look\s+up\s+on\s+the\s+web|look\s+it\s+up\s+on\s+the\s+web)\b/i;
  const explicitDeepSearchPattern =
    /\b(deep\s+search|deep\s+research|legal\s+research|jurisprudence\s+research|research\s+jurisprudence|in[\s-]?depth\s+legal\s+research)\b/i;
  const explicitWebSearchQuery = extractExplicitSearchQuery(
    message,
    /\b(?:search\s+the\s+web|web\s+search|search\s+online|internet\s+search|look\s+up\s+online|find\s+online|look\s+up\s+on\s+the\s+web|look\s+it\s+up\s+on\s+the\s+web)(?:\s+(?:for|about|on))?\s+(.+)/i,
  );
  const explicitDeepSearchQuery = extractExplicitSearchQuery(
    message,
    /\b(?:do\s+a\s+deep\s+search|deep\s+search|deep\s+research|legal\s+research|jurisprudence\s+research|research\s+jurisprudence|in[\s-]?depth\s+legal\s+research)(?:\s+(?:for|about|on))?\s+(.+)/i,
  );
  if (explicitDeepSearchPattern.test(normalized) || explicitDeepSearchQuery) {
    const query = explicitDeepSearchQuery || "";
    return {
      intent: READ_INTENTS.DEEP_SEARCH,
      requiresLocalData: true,
      allowedTools: ["mcpDeepSearch"],
      filters: {
        query,
        researchType: inferDeepResearchTypeFromQuery(query),
      },
      entityHints: [],
    };
  }
  if (explicitWebSearchPattern.test(normalized) || explicitWebSearchQuery) {
    const query = explicitWebSearchQuery || "";
    return {
      intent: READ_INTENTS.WEB_SEARCH,
      requiresLocalData: true,
      allowedTools: ["mcpWebSearch"],
      filters: {
        query,
        category: inferWebSearchCategoryFromQuery(query),
      },
      entityHints: [],
    };
  }

  // Pattern groups for intent detection
  // IMPORTANT: Must cover both verb-first AND noun-first patterns
  const listPatterns = [
    // Verb-first patterns: "list clients", "show my tasks"
    /\b(list|show|open|view|read|give|get|display|see|fetch|retrieve)\b.*\b(all|my)?\s*/i,
    // Noun-first patterns: "clients list", "tasks please", "dossiers show"
    /\b(client|clients|dossier|dossiers|task|tasks|session|sessions)\s+(list|show|please|now)\b/i,
    // Standalone entity requests: "clients", "my clients", "all clients"
    /^(all\s+)?(my\s+)?(client|clients|dossier|dossiers|task|tasks|session|sessions)(\s+please)?[\.\?\!]?$/i,
    // Question patterns
    /\bwhat\s+(are|is)\s+(my|the)\b/i,
    /\bdo\s+i\s+have\b/i,
    /\bhow\s+many\b/i,
    // Imperative patterns: "give me clients", "get tasks"
    /\b(give|get)\s+(me\s+)?(my\s+)?(all\s+)?(the\s+)?/i,
  ];

  const explainPatterns = [
    /\b(explain|status|state|situation|blocking|blocked|why|procedural|next\s+steps?)\b/i,
    /\bwhat('s| is)\s+(going\s+on|the\s+status|the\s+state)\b/i,
  ];

  const summarizePatterns = [
    /\b(summarize|summary|overview|recap|brief|timeline|workload|backlog|balance|balances)\b/i,
  ];

  const entityPatterns = [
    {
      type: "personal_task",
      pattern: /\b(personal\s+task|personal\s+tasks)\b/i,
    },
    { type: "client", pattern: /\b(client|clients)\b/i },
    {
      type: "dossier",
      pattern: /\b(dossier|dossiers|case\s*file|matter|matters)\b/i,
    },
    {
      type: "lawsuit",
      pattern: /\b(lawsuit|lawsuits|case|cases|trial|proces)\b/i,
    },
    { type: "task", pattern: /\b(task|tasks|todo|to-do|todos)\b/i },
    {
      type: "session",
      pattern:
        /\b(session|sessions|meeting|meetings|hearing|hearings|appointment|appointments)\b/i,
    },
    { type: "mission", pattern: /\b(mission|missions)\b/i },
    {
      type: "officer",
      pattern: /\b(officer|officers|bailiff|bailiffs|huissier|huissiers)\b/i,
    },
    {
      type: "financial_entry",
      pattern:
        /\b(accounting|financial|invoice|payment|expense|billing|entry|entries)\b/i,
    },
    {
      type: "document",
      pattern:
        /\b(document|documents|file|files|attachment|attachments|pdf|docx|resume|cv|letter|report)\b/i,
    },
    {
      type: "notification",
      pattern: /\b(notification|notifications|alert|alerts)\b/i,
    },
    {
      type: "history_event",
      pattern: /\b(history|audit\s*trail|activity\s*log|audit)\b/i,
    },
  ];

  const temporalPatterns = {
    overdue: /\b(overdue|late|past\s+due|missed)\b/i,
    upcoming: /\b(upcoming|next|scheduled|future|soon)\b/i,
    today: /\b(today|today's)\b/i,
    thisWeek: /\b(this\s+week|week's)\b/i,
    pending: /\b(pending|open|active|in\s*progress)\b/i,
    unpaid: /\b(unpaid|outstanding|not\s+paid)\b/i,
    paid: /\b(paid|settled)\b/i,
    unread: /\b(unread|new|unseen)\b/i,
  };

  // Check for list/query patterns
  const hasListPattern = listPatterns.some((p) => p.test(normalized));
  const hasExplainPattern = explainPatterns.some((p) => p.test(normalized));
  const hasSummarizePattern = summarizePatterns.some((p) => p.test(normalized));
  const hasPartiesQuery = /\bparties\b/i.test(normalized);

  // Detect entity type
  let entityType = null;
  for (const entry of entityPatterns) {
    if (entry.pattern.test(normalized)) {
      entityType = entry.type;
      break;
    }
  }

  if (!entityType && /\b(workload|backlog)\b/i.test(normalized)) {
    entityType = "task";
  }
  if (!entityType && /\b(balance|balances)\b/i.test(normalized)) {
    entityType = "financial_entry";
  }

  // Detect temporal modifiers
  const temporal = {};
  for (const [key, pattern] of Object.entries(temporalPatterns)) {
    temporal[key] = pattern.test(normalized);
  }

  // CRITICAL FIX: If entity type is detected in a short message, assume LIST intent
  // This prevents "clients list please" from falling through to LLM
  const wordCount = normalized.split(/\s+/).length;
  const isShortEntityRequest = entityType && wordCount <= 5;

  let extractedHints = extractEntityHints(message);
  const hasPrimaryHint = extractedHints.some((hint) =>
    ["name", "reference", "id"].includes(hint.type),
  );
  if (!hasPrimaryHint) {
    const aboutMatch = message.match(
      /(?:what\s+do\s+you\s+know\s+about|tell\s+me\s+about|about|regarding|concerning)\s+(.+)/i,
    );
    if (aboutMatch) {
      const cleaned = String(aboutMatch[1] || "")
        .replace(/[?!.]+$/g, "")
        .trim();
      if (
        cleaned &&
        !/^(all|list|overview|summary|clients?|dossiers?|tasks?|sessions?)$/i.test(
          cleaned,
        )
      ) {
        extractedHints = [...extractedHints, { type: "name", value: cleaned }];
      }
    }
  }

  const documentContentQuery =
    /\b(what\s+does|what\s+is|what'?s\s+in|talk\s+about|content|summariz|summary|describe|read)\b/i.test(
      normalized,
    );
  const hasAttachedDocuments =
    Boolean(context?._hasDocumentContext) ||
    Boolean(context?.hasDocuments) ||
    Number(context?.documentCount || 0) > 0;
  const documentMentioned =
    entityType === "document" ||
    /\b(document|documents|file|files|attachment|attachments|pdf|docx|resume|cv|letter|report)\b/i.test(
      normalized,
    );

  if (documentMentioned && documentContentQuery) {
    return {
      intent: READ_INTENTS.SUMMARIZE_DOCUMENT,
      requiresLocalData: true,
      allowedTools: [],
      entityHints: extractedHints,
    };
  }
  if (!entityType && hasAttachedDocuments && documentContentQuery) {
    return {
      intent: READ_INTENTS.SUMMARIZE_DOCUMENT,
      requiresLocalData: true,
      allowedTools: [],
      entityHints: extractedHints,
    };
  }
  const aggregateSummary = detectAggregateSummaryRequest(
    normalized,
    entityType,
    extractedHints,
    context,
  );
  const aggregateFilters = buildAggregateFilters(
    normalized,
    entityType,
    temporal,
  );

  // SUMMARIZE intents
  if (hasSummarizePattern) {
    if (entityType === "client")
      return {
        intent: READ_INTENTS.SUMMARIZE_CLIENT,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listClients"]
          : ["getClient", "searchClientsByName", "listDossiersForClient"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "dossier")
      return {
        intent: READ_INTENTS.SUMMARIZE_DOSSIER,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listDossiers"]
          : [
              "getDossier",
              "getDossierByReference",
              "listTasks",
              "listSessions",
              "listMissions",
            ],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "lawsuit")
      return {
        intent: READ_INTENTS.SUMMARIZE_LAWSUIT,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listLawsuits"]
          : ["getLawsuit", "listTasks", "listSessions"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "session")
      return {
        intent: READ_INTENTS.SUMMARIZE_SESSION,
        requiresLocalData: true,
        allowedTools: aggregateSummary ? ["listSessions"] : ["getSession"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "task")
      return {
        intent: READ_INTENTS.SUMMARIZE_TASK,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listTasks"]
          : ["getTask", "listTasks"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "personal_task")
      return {
        intent: READ_INTENTS.SUMMARIZE_PERSONAL_TASK,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listPersonalTasks"]
          : ["getPersonalTask", "listPersonalTasks"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "mission")
      return {
        intent: READ_INTENTS.SUMMARIZE_MISSION,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listMissions"]
          : ["getMission", "listMissions"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "officer")
      return {
        intent: READ_INTENTS.SUMMARIZE_OFFICER,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listOfficers"]
          : ["getOfficer", "listOfficers"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "financial_entry")
      return {
        intent: READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listFinancialEntries"]
          : ["getFinancialEntry", "listFinancialEntries"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "notification")
      return {
        intent: READ_INTENTS.SUMMARIZE_NOTIFICATION,
        requiresLocalData: true,
        allowedTools: aggregateSummary
          ? ["listNotifications"]
          : ["getNotification", "listNotifications"],
        entityHints: extractedHints,
        aggregateSummary,
        filters: aggregateFilters,
      };
    if (entityType === "history_event")
      return {
        intent: READ_INTENTS.SUMMARIZE_HISTORY,
        requiresLocalData: true,
        allowedTools: ["listHistoryEvents"],
        entityHints: extractedHints,
        aggregateSummary: true,
        filters: aggregateFilters,
      };
  }

  if (hasPartiesQuery && entityType === "lawsuit") {
    return {
      intent: READ_INTENTS.READ_LAWSUIT,
      requiresLocalData: true,
      allowedTools: ["getLawsuit", "listLawsuits"],
      entityHints: extractedHints,
    };
  }

  // EXPLAIN STATE intents
  if (hasExplainPattern) {
    if (entityType === "client")
      return {
        intent: READ_INTENTS.EXPLAIN_CLIENT_STATE,
        requiresLocalData: true,
        allowedTools: [
          "getClient",
          "searchClientsByName",
          "listDossiersForClient",
        ],
        entityHints: extractedHints,
      };
    if (entityType === "dossier")
      return {
        intent: READ_INTENTS.EXPLAIN_DOSSIER_STATE,
        requiresLocalData: true,
        allowedTools: [
          "getDossier",
          "getDossierByReference",
          "listTasks",
          "listSessions",
          "listMissions",
        ],
        entityHints: extractedHints,
      };
    if (entityType === "lawsuit")
      return {
        intent: READ_INTENTS.EXPLAIN_LAWSUIT_STATE,
        requiresLocalData: true,
        allowedTools: ["getLawsuit", "listTasks", "listSessions"],
        entityHints: extractedHints,
      };
    if (entityType === "session")
      return {
        intent: READ_INTENTS.EXPLAIN_SESSION_STATE,
        requiresLocalData: true,
        allowedTools: ["getSession"],
        entityHints: extractedHints,
      };
    if (entityType === "task")
      return {
        intent: READ_INTENTS.EXPLAIN_TASK_STATE,
        requiresLocalData: true,
        allowedTools: ["getTask", "listTasks"],
        entityHints: extractedHints,
      };
    if (entityType === "personal_task")
      return {
        intent: READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE,
        requiresLocalData: true,
        allowedTools: ["getPersonalTask", "listPersonalTasks"],
        entityHints: extractedHints,
      };
    if (entityType === "mission")
      return {
        intent: READ_INTENTS.EXPLAIN_MISSION_STATE,
        requiresLocalData: true,
        allowedTools: ["getMission", "listMissions"],
        entityHints: extractedHints,
      };
    if (entityType === "officer")
      return {
        intent: READ_INTENTS.EXPLAIN_OFFICER_STATE,
        requiresLocalData: true,
        allowedTools: ["getOfficer", "listOfficers"],
        entityHints: extractedHints,
      };
    if (entityType === "financial_entry")
      return {
        intent: READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE,
        requiresLocalData: true,
        allowedTools: ["getFinancialEntry", "listFinancialEntries"],
        entityHints: extractedHints,
      };
    if (entityType === "notification")
      return {
        intent: READ_INTENTS.EXPLAIN_NOTIFICATION_STATE,
        requiresLocalData: true,
        allowedTools: ["getNotification", "listNotifications"],
        entityHints: extractedHints,
      };
    if (entityType === "history_event")
      return {
        intent: READ_INTENTS.EXPLAIN_HISTORY_STATE,
        requiresLocalData: true,
        allowedTools: ["listHistoryEvents"],
        entityHints: extractedHints,
      };
  }

  // Determine READ intent
  if (!entityType) {
    // No explicit entity type mentioned, but check if we have name hints
    // This handles queries like "tell me about Youssef Daly" (no "client" word)
    const nameHints = extractedHints;
    const typedReference = nameHints.find((hint) => hint.entityType);
    if (typedReference) {
      const typed = typedReference.entityType;
      if (typed === "dossier")
        return {
          intent: READ_INTENTS.READ_DOSSIER,
          requiresLocalData: true,
          allowedTools: ["getDossier", "getDossierByReference"],
          entityHints: nameHints,
        };
      if (typed === "lawsuit")
        return {
          intent: READ_INTENTS.READ_LAWSUIT,
          requiresLocalData: true,
          allowedTools: ["getLawsuit", "listLawsuits"],
          entityHints: nameHints,
        };
      if (typed === "mission")
        return {
          intent: READ_INTENTS.READ_MISSION,
          requiresLocalData: true,
          allowedTools: ["getMission", "listMissions"],
          entityHints: nameHints,
        };
      if (typed === "officer")
        return {
          intent: READ_INTENTS.READ_OFFICER,
          requiresLocalData: true,
          allowedTools: ["getOfficer", "listOfficers"],
          entityHints: nameHints,
        };
    }
    if (nameHints.length > 0) {
      if (hasSummarizePattern) {
        return {
          intent: READ_INTENTS.SUMMARIZE_CLIENT,
          requiresLocalData: true,
          allowedTools: [
            "getClient",
            "searchClientsByName",
            "listDossiersForClient",
          ],
          entityHints: nameHints,
        };
      }
      if (hasExplainPattern) {
        return {
          intent: READ_INTENTS.EXPLAIN_CLIENT_STATE,
          requiresLocalData: true,
          allowedTools: [
            "getClient",
            "searchClientsByName",
            "listDossiersForClient",
          ],
          entityHints: nameHints,
        };
      }
      // Default to client search when name is mentioned without entity type
      return {
        intent: READ_INTENTS.READ_CLIENT,
        requiresLocalData: true,
        allowedTools: ["getClient", "searchClientsByName"],
        entityHints: nameHints,
      };
    }
    return null;
  }

  // LIST intents
  // CRITICAL: isShortEntityRequest ensures "clients list please" triggers READ gate
  if (hasListPattern || temporal.pending || isShortEntityRequest) {
    if (entityType === "client")
      return {
        intent: READ_INTENTS.LIST_CLIENTS,
        requiresLocalData: true,
        allowedTools: ["listClients"],
        entityHints: extractedHints,
      };
    if (entityType === "dossier")
      return {
        intent: READ_INTENTS.LIST_DOSSIERS,
        requiresLocalData: true,
        allowedTools: ["listDossiers"],
        entityHints: extractedHints,
      };
    if (entityType === "lawsuit")
      return {
        intent: READ_INTENTS.LIST_LAWSUITS,
        requiresLocalData: true,
        allowedTools: ["listLawsuits"],
        entityHints: extractedHints,
      };
    if (entityType === "task") {
      if (temporal.overdue)
        return {
          intent: READ_INTENTS.LIST_OVERDUE_TASKS,
          requiresLocalData: true,
          allowedTools: ["listTasks"],
          filters: { overdue: true },
          entityHints: extractedHints,
        };
      return {
        intent: READ_INTENTS.LIST_TASKS,
        requiresLocalData: true,
        allowedTools: ["listTasks"],
        entityHints: extractedHints,
      };
    }
    if (entityType === "personal_task")
      return {
        intent: READ_INTENTS.LIST_PERSONAL_TASKS,
        requiresLocalData: true,
        allowedTools: ["listPersonalTasks"],
        entityHints: extractedHints,
      };
    if (entityType === "session") {
      if (temporal.upcoming || temporal.today || temporal.thisWeek) {
        return {
          intent: READ_INTENTS.LIST_UPCOMING_SESSIONS,
          requiresLocalData: true,
          allowedTools: ["listSessions"],
          filters: {
            timeframe: temporal.today
              ? "today"
              : temporal.thisWeek
                ? "this-week"
                : temporal.upcoming
                  ? "upcoming"
                  : null,
          },
          entityHints: extractedHints,
        };
      }
      return {
        intent: READ_INTENTS.LIST_SESSIONS,
        requiresLocalData: true,
        allowedTools: ["listSessions"],
        entityHints: extractedHints,
      };
    }
    if (entityType === "mission")
      return {
        intent: READ_INTENTS.LIST_MISSIONS,
        requiresLocalData: true,
        allowedTools: ["listMissions"],
        entityHints: extractedHints,
      };
    if (entityType === "officer")
      return {
        intent: READ_INTENTS.LIST_OFFICERS,
        requiresLocalData: true,
        allowedTools: ["listOfficers"],
        entityHints: extractedHints,
      };
    if (entityType === "financial_entry")
      return {
        intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
        requiresLocalData: true,
        allowedTools: ["listFinancialEntries"],
        filters: {
          paymentStatus: temporal.unpaid
            ? "unpaid"
            : temporal.paid
              ? "paid"
              : temporal.overdue
                ? "overdue"
                : null,
        },
        entityHints: extractedHints,
      };
    if (entityType === "notification")
      return {
        intent: READ_INTENTS.LIST_NOTIFICATIONS,
        requiresLocalData: true,
        allowedTools: ["listNotifications"],
        filters: {
          status: temporal.unread ? "unread" : null,
        },
        entityHints: extractedHints,
      };
    if (entityType === "history_event")
      return {
        intent: READ_INTENTS.LIST_HISTORY_EVENTS,
        requiresLocalData: true,
        allowedTools: ["listHistoryEvents"],
        entityHints: extractedHints,
      };
    if (entityType === "document")
      return {
        intent: READ_INTENTS.SUMMARIZE_DOCUMENT,
        requiresLocalData: true,
        allowedTools: [],
        entityHints: extractedHints,
      };
  }

  // GET single entity intents (when specific entity is mentioned)
  const nameHints = extractedHints;
  if (nameHints.length > 0) {
    if (entityType === "client")
      return {
        intent: READ_INTENTS.READ_CLIENT,
        requiresLocalData: true,
        allowedTools: ["getClient", "searchClientsByName"],
        entityHints: nameHints,
      };
    if (entityType === "dossier")
      return {
        intent: READ_INTENTS.READ_DOSSIER,
        requiresLocalData: true,
        allowedTools: ["getDossier", "getDossierByReference"],
        entityHints: nameHints,
      };
    if (entityType === "lawsuit")
      return {
        intent: READ_INTENTS.READ_LAWSUIT,
        requiresLocalData: true,
        allowedTools: ["getLawsuit", "listLawsuits"],
        entityHints: nameHints,
      };
    if (entityType === "task")
      return {
        intent: READ_INTENTS.READ_TASK,
        requiresLocalData: true,
        allowedTools: ["getTask", "listTasks"],
        entityHints: nameHints,
      };
    if (entityType === "personal_task")
      return {
        intent: READ_INTENTS.READ_PERSONAL_TASK,
        requiresLocalData: true,
        allowedTools: ["getPersonalTask", "listPersonalTasks"],
        entityHints: nameHints,
      };
    if (entityType === "session")
      return {
        intent: READ_INTENTS.READ_SESSION,
        requiresLocalData: true,
        allowedTools: ["getSession", "listSessions"],
        entityHints: nameHints,
      };
    if (entityType === "mission")
      return {
        intent: READ_INTENTS.READ_MISSION,
        requiresLocalData: true,
        allowedTools: ["getMission", "listMissions"],
        entityHints: nameHints,
      };
    if (entityType === "officer")
      return {
        intent: READ_INTENTS.READ_OFFICER,
        requiresLocalData: true,
        allowedTools: ["getOfficer", "listOfficers"],
        entityHints: nameHints,
      };
    if (entityType === "financial_entry")
      return {
        intent: READ_INTENTS.READ_FINANCIAL_ENTRY,
        requiresLocalData: true,
        allowedTools: ["getFinancialEntry", "listFinancialEntries"],
        entityHints: nameHints,
      };
    if (entityType === "notification")
      return {
        intent: READ_INTENTS.READ_NOTIFICATION,
        requiresLocalData: true,
        allowedTools: ["getNotification", "listNotifications"],
        entityHints: nameHints,
      };
    if (entityType === "history_event")
      return {
        intent: READ_INTENTS.READ_HISTORY_EVENT,
        requiresLocalData: true,
        allowedTools: ["getHistoryEvent", "listHistoryEvents"],
        entityHints: nameHints,
      };
    if (entityType === "document")
      return {
        intent: READ_INTENTS.SUMMARIZE_DOCUMENT,
        requiresLocalData: true,
        allowedTools: [],
        entityHints: nameHints,
      };
  }

  return null;
}

function extractExplicitSearchQuery(message, pattern) {
  if (typeof message !== "string") return "";
  const match = message.match(pattern);
  if (!match || !match[1]) return "";
  return String(match[1])
    .replace(/[?!.]+$/g, "")
    .trim();
}

function inferDeepResearchTypeFromQuery(query) {
  const normalized = String(query || "").toLowerCase();
  if (
    /\b(jurisprudence|case\s+law|precedent|ruling|decision|judgment)\b/i.test(
      normalized,
    )
  ) {
    return "jurisprudence";
  }
  if (
    /\b(statute|law|code|regulation|act|article|section)\b/i.test(normalized)
  ) {
    return "statute";
  }
  if (
    /\b(procedure|procedural|filing|deadline|appeal|jurisdiction)\b/i.test(
      normalized,
    )
  ) {
    return "procedure";
  }
  return "comprehensive";
}

function inferWebSearchCategoryFromQuery(query) {
  const normalized = String(query || "").toLowerCase();
  if (/\b(deadline|due\s+date|filing\s+date|cutoff)\b/i.test(normalized)) {
    return "deadline";
  }
  if (/\b(procedure|process|step|how\s+to|filing)\b/i.test(normalized)) {
    return "procedure";
  }
  if (/\b(define|definition|meaning|what\s+is)\b/i.test(normalized)) {
    return "definition";
  }
  if (
    /\b(legal|law|jurisprudence|court|statute|regulation)\b/i.test(normalized)
  ) {
    return "legal";
  }
  return "general";
}

async function classifyIntent(message, context = {}) {
  if (typeof message !== "string" || !message.trim()) {
    throw classificationError("Message is required for intent classification.");
  }

  // Explicit user-provided intent takes precedence when valid.
  if (context.intent) {
    if (!INTENT_LIST.includes(context.intent)) {
      throw classificationError(
        `Unsupported intent provided in context: ${context.intent}`,
      );
    }
    return context.intent;
  }

  // Try LLM classification first
  const llmIntent = await classifyIntentWithLLM(message);
  if (llmIntent) {
    return llmIntent;
  }

  // Fallback to keyword-based classification
  const normalized = message.toLowerCase();
  const matches = [];

  // Rule: Operational risk requests must contain explicit risk language or operation flag.
  if (
    normalized.includes("risk") ||
    normalized.includes("mitigation") ||
    normalized.includes("control") ||
    context.operation === "analyze_risks"
  ) {
    matches.push(INTENTS.ANALYZE_OPERATIONAL_RISKS);
  }

  // Rule: Action planning must reference proposed actions or next steps explicitly.
  if (
    normalized.includes("propose actions") ||
    normalized.includes("proposed actions") ||
    normalized.includes("action plan") ||
    normalized.includes("next steps") ||
    context.operation === "propose_actions"
  ) {
    matches.push(INTENTS.PROPOSE_ACTIONS);
  }

  // Rule: Invitations are identified by invitation keywords or explicit draft type.
  if (
    normalized.includes("invite") ||
    normalized.includes("invitation") ||
    normalized.includes("rsvp") ||
    context.draftType === "invitation"
  ) {
    matches.push(INTENTS.DRAFT_INVITATION);
  }

  // Rule: Client emails require both client targeting and email drafting signals.
  if (
    (normalized.includes("client") && normalized.includes("email")) ||
    (context.recipientType === "client" && normalized.includes("email")) ||
    context.draftType === "client_email"
  ) {
    matches.push(INTENTS.DRAFT_CLIENT_EMAIL);
  }

  // Rule: Session summaries are detected via summary language or explicit operation.
  if (
    normalized.includes("summary") ||
    normalized.includes("summarize") ||
    normalized.includes("recap") ||
    normalized.includes("minutes") ||
    context.operation === "summarize_session"
  ) {
    matches.push(INTENTS.SUMMARIZE_SESSION);
  }

  // Rule: Entity state explanations require explicit explain/status language or context operation.
  if (
    normalized.includes("explain") ||
    normalized.includes("status") ||
    normalized.includes("state") ||
    context.operation === "explain_state"
  ) {
    matches.push(INTENTS.EXPLAIN_ENTITY_STATE);
  }

  const uniqueMatches = [...new Set(matches)];

  if (uniqueMatches.length === 0) {
    return INTENTS.GENERAL_CHAT;
  }

  if (uniqueMatches.length > 1) {
    throw classificationError(
      `Ambiguous intent; matched multiple intents: ${uniqueMatches.join(", ")}`,
    );
  }

  return uniqueMatches[0];
}

function classificationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Follow-up Intent Types
 * These indicate the type of follow-up the user is making
 */
const FOLLOW_UP_TYPES = Object.freeze({
  FILTER_MODIFICATION: "filter_modification", // "what about inactive ones?"
  NEXT_ACTION: "next_action", // "and now?", "what's next?"
  REPEAT_ACTION: "repeat_action", // "give it again", "repeat that"
  CLARIFICATION_REQUEST: "clarification", // "why?", "explain"
  PAGINATION: "pagination", // "show more", "next page"
  SUBSET_REQUEST: "subset", // "just the overdue ones"
  CONFIRMATION: "confirmation", // "yes", "ok", "do it"
  NEGATION: "negation", // "no", "cancel", "nevermind"
});

/**
 * Filter modifiers that can be applied to follow-up queries
 */
const FILTER_MODIFIERS = Object.freeze({
  // Status filters
  inactive: { field: "status", value: "inactive", label: "inactive" },
  active: { field: "status", value: "active", label: "active" },
  pending: { field: "status", value: "pending", label: "pending" },
  completed: { field: "status", value: "completed", label: "completed" },
  done: { field: "status", value: "done", label: "done" },
  open: { field: "status", value: "open", label: "open" },
  closed: { field: "status", value: "closed", label: "closed" },

  // Temporal filters
  overdue: { field: "temporal", value: "overdue", label: "overdue" },
  upcoming: { field: "temporal", value: "upcoming", label: "upcoming" },
  today: { field: "temporal", value: "today", label: "today" },
  "this week": { field: "temporal", value: "this_week", label: "this week" },

  // Priority filters
  urgent: { field: "priority", value: "urgent", label: "urgent" },
  high: { field: "priority", value: "high", label: "high priority" },
  low: { field: "priority", value: "low", label: "low priority" },
});

/**
 * Detect if a message is a follow-up that requires conversation context
 *
 * DESIGN DECISIONS:
 * - Short messages (< 30 chars) with no entity mentions are likely follow-ups
 * - Vague patterns like "and now?", "what about X?" indicate follow-ups
 * - Filter words without entity context indicate follow-up filtering
 * - Pronouns (them, those, it) indicate reference to prior context
 *
 * @param {string} message - User message
 * @param {Object} context - Request context
 * @returns {Object|null} Follow-up detection result or null if not a follow-up
 */
function detectFollowUp(message, context = {}) {
  if (!message || typeof message !== "string") return null;

  const normalized = message.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).length;

  // Pattern 1: Very short vague messages (likely follow-ups)
  const vaguePatterns = [
    /^(and\s+)?now\??$/i, // "now?", "and now?"
    /^(now\s+)?what\??$/i, // "now what?", "what?"
    /^what('s|s)?\s*(next|now)\??$/i, // "what's next?", "what now?"
    /^(so\s+)?what\s+(do|should)\s+i\s+do\??$/i, // "what do I do?", "what should I do?"
    /^(ok|okay)\s*(,?\s*(and|so|now))?\s*\??$/i, // "ok, and?", "okay now?"
    /^then\??$/i, // "then?"
    /^next\??$/i, // "next?"
    /^why\??$/i, // "why?"
    /^how\s*(come|so)\??$/i, // "how come?", "how so?"
    /^explain\??$/i, // "explain?"
    /^more\??$/i, // "more?"
    /^show\s+more\??$/i, // "show more?"
    /^continue\??$/i, // "continue?"
    /^what\s+else\??$/i, // "what else?"
    /^anything\s+else\??$/i, // "anything else?"
  ];

  // Pattern 2: "What about X?" patterns (filter modification)
  // NOTE: These patterns must NOT match when explicit entity types are present
  const whatAboutPatterns = [
    /^what\s+about\s+(the\s+)?(.+?)\s*(ones?)?\??$/i, // "what about the inactive ones?"
    /^(and|but)\s+(the\s+)?(.+?)\s*(ones?)?\??$/i, // "and the overdue ones?"
    /^(just|only)\s+(the\s+)?(.+?)\s*(ones?)?\??$/i, // "just the urgent ones"
    /^(how\s+about|what\s+of)\s+(the\s+)?(.+?)\??$/i, // "how about inactive?"
  ];

  // Entity keywords that indicate a NEW query, not a follow-up
  const entityKeywords =
    /\b(client|clients|dossier|dossiers|task|tasks|personal\s+task|personal\s+tasks|session|sessions|meeting|meetings|hearing|hearings|appointment|appointments|lawsuit|lawsuits|case|cases|matter|matters|mission|missions|officer|officers|bailiff|bailiffs|huissier|huissiers|accounting|financial|invoice|payment|expense|billing|document|documents|file|files|attachment|attachments|notification|notifications|alert|alerts|history|audit)\b/i;

  // Pattern 3: Pronoun references (refer to prior context)
  const pronounPatterns = [
    /\b(them|those|these|it|that)\b/i,
    /\b(the\s+)?(same|previous|last)\s+(one|ones|list|result)/i,
  ];

  // Pattern 4: Confirmation/negation patterns
  const confirmPatterns = [
    /^(yes|yeah|yep|ok|okay|sure|correct|right|exactly|do\s+it|proceed|go\s+ahead)[\.\!\?]?$/i,
  ];
  const negatePatterns = [
    /^(no|nope|nah|cancel|stop|never\s*mind|forget\s+it)[\.\!\?]?$/i,
  ];

  // Check for vague follow-up patterns
  for (const pattern of vaguePatterns) {
    if (pattern.test(normalized)) {
      return {
        isFollowUp: true,
        type: FOLLOW_UP_TYPES.NEXT_ACTION,
        confidence: 0.9,
        reason: "vague_query",
        originalMessage: message,
      };
    }
  }

  // Pattern 1.5: Repeat action patterns (explicit repeat requests)
  // CRITICAL: These must be checked early to prevent fallthrough
  const repeatPatterns = [
    /^(give|show|do|run)\s+it\s+again[\.\?\!]?$/i, // "give it again", "show it again"
    /^again[\s,]*(?:please)?[\.\?\!]?$/i, // "again", "again please"
    /^repeat[\s\w]*[\.\?\!]?$/i, // "repeat", "repeat that", "repeat please"
    /^one\s+more\s+time[\.\?\!]?$/i, // "one more time"
    /^(same|the\s+same)[\.\?\!]?$/i, // "same", "the same"
    /^do\s+(that|the\s+same)[\s\w]*[\.\?\!]?$/i, // "do that", "do the same", "do that again"
    /^(show|give|list)\s+(them|it|that)\s+again[\.\?\!]?$/i, // "show them again", "list it again"
  ];

  for (const pattern of repeatPatterns) {
    if (pattern.test(normalized)) {
      return {
        isFollowUp: true,
        type: FOLLOW_UP_TYPES.REPEAT_ACTION,
        confidence: 0.95,
        reason: "repeat_request",
        originalMessage: message,
      };
    }
  }

  // Check for "what about X?" patterns with filter extraction
  // BUT: If the message contains entity keywords, it's a NEW query, not a follow-up
  if (!entityKeywords.test(normalized)) {
    for (const pattern of whatAboutPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        // Extract the filter word (last captured group before "ones")
        const filterWord = (match[3] || match[2] || "").trim().toLowerCase();
        const modifier = detectFilterModifier(filterWord);

        return {
          isFollowUp: true,
          type: FOLLOW_UP_TYPES.FILTER_MODIFICATION,
          confidence: 0.85,
          reason: "what_about_pattern",
          filterWord,
          modifier,
          originalMessage: message,
        };
      }
    }
  }

  // Check for confirmation patterns
  for (const pattern of confirmPatterns) {
    if (pattern.test(normalized)) {
      return {
        isFollowUp: true,
        type: FOLLOW_UP_TYPES.CONFIRMATION,
        confidence: 0.95,
        reason: "confirmation",
        originalMessage: message,
      };
    }
  }

  // Check for negation patterns
  for (const pattern of negatePatterns) {
    if (pattern.test(normalized)) {
      return {
        isFollowUp: true,
        type: FOLLOW_UP_TYPES.NEGATION,
        confidence: 0.95,
        reason: "negation",
        originalMessage: message,
      };
    }
  }

  // Check for pronoun references in short messages
  if (wordCount <= 8) {
    for (const pattern of pronounPatterns) {
      if (pattern.test(normalized)) {
        return {
          isFollowUp: true,
          type: FOLLOW_UP_TYPES.SUBSET_REQUEST,
          confidence: 0.7,
          reason: "pronoun_reference",
          originalMessage: message,
        };
      }
    }
  }

  // Check for standalone filter words in short messages (no entity context)
  if (wordCount <= 5) {
    const entityPatterns = [
      /\b(client|clients|dossier|dossiers|task|tasks|session|sessions|officer|officers|bailiff|bailiffs|huissier|huissiers)\b/i,
    ];
    const hasEntityMention = entityPatterns.some((p) => p.test(normalized));

    if (!hasEntityMention) {
      const modifier = detectFilterModifier(normalized);
      if (modifier) {
        return {
          isFollowUp: true,
          type: FOLLOW_UP_TYPES.FILTER_MODIFICATION,
          confidence: 0.75,
          reason: "standalone_filter",
          filterWord: normalized,
          modifier,
          originalMessage: message,
        };
      }
    }
  }

  return null;
}

/**
 * Detect filter modifier from a word or phrase
 *
 * @param {string} text - Text to check for filter modifiers
 * @returns {Object|null} Filter modifier object or null
 */
function detectFilterModifier(text) {
  if (!text || typeof text !== "string") return null;

  const normalized = text.trim().toLowerCase();

  // Direct match
  if (FILTER_MODIFIERS[normalized]) {
    return { ...FILTER_MODIFIERS[normalized] };
  }

  // Partial match (e.g., "the inactive" -> "inactive")
  for (const [key, modifier] of Object.entries(FILTER_MODIFIERS)) {
    if (normalized.includes(key)) {
      return { ...modifier };
    }
  }

  // Pattern-based detection for temporal filters
  if (/overdue|late|past\s+due|missed/i.test(normalized)) {
    return { ...FILTER_MODIFIERS.overdue };
  }
  if (/upcoming|next|soon|scheduled/i.test(normalized)) {
    return { ...FILTER_MODIFIERS.upcoming };
  }
  if (/today/i.test(normalized)) {
    return { ...FILTER_MODIFIERS.today };
  }
  if (/this\s+week|weekly/i.test(normalized)) {
    return { ...FILTER_MODIFIERS["this week"] };
  }

  return null;
}

/**
 * Check if message contains explicit entity mentions
 * Used to determine if context should be reset
 *
 * @param {string} message - User message
 * @returns {boolean} True if message has explicit entity mentions
 */
function hasExplicitEntityMention(message) {
  if (!message || typeof message !== "string") return false;

  const normalized = message.toLowerCase();

  // Check for entity type keywords with list/show verbs (new query)
  const newQueryPatterns = [
    /\b(list|show|get|display)\s+(my\s+)?(all\s+)?(client|dossier|task|session|lawsuit|mission|officer|bailiff|huissier|accounting|notification|history)/i,
    /\bmy\s+(client|dossier|task|session|lawsuit|mission|officer|bailiff|huissier|notification)s?\b/i,
    /\b(client|dossier|task|session|lawsuit|mission|officer|bailiff|huissier|notification)s?\s+(list|overview)/i,
  ];

  // Check for specific entity references
  const specificEntityPatterns = [
    /\bclient\s+(?:named\s+)?[A-Z][a-z]+/i, // "client Emma"
    /DOS-\d{4}-\d+/i, // Dossier reference
    /PRO-\d{4}-\d+/i, // Lawsuit reference
    /MIS-\d{4}-\d+/i, // Mission reference
    /\bdossier\s+(?:for\s+)?[A-Z][a-z]+/i, // "dossier for Emma"
  ];

  for (const pattern of [...newQueryPatterns, ...specificEntityPatterns]) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect entity type from message
 * Returns the primary entity type mentioned
 *
 * @param {string} message - User message
 * @returns {string|null} Entity type or null
 */
function detectEntityType(message) {
  if (!message || typeof message !== "string") return null;

  const normalized = message.toLowerCase();

  const entityPatterns = {
    client: /\b(client|clients)\b/i,
    dossier: /\b(dossier|dossiers|case\s*file|matter|matters)\b/i,
    lawsuit: /\b(lawsuit|lawsuits|case|cases|trial|proces)\b/i,
    personal_task: /\b(personal\s+task|personal\s+tasks)\b/i,
    task: /\b(task|tasks|todo|to-do|todos)\b/i,
    session:
      /\b(session|sessions|meeting|meetings|hearing|hearings|appointment|appointments)\b/i,
    mission: /\b(mission|missions)\b/i,
    officer: /\b(officer|officers|bailiff|bailiffs|huissier|huissiers)\b/i,
    financial_entry:
      /\b(accounting|financial|invoice|payment|expense|billing|entry|entries)\b/i,
    document:
      /\b(document|documents|file|files|attachment|attachments|pdf|docx|resume|cv|letter|report)\b/i,
    notification: /\b(notification|notifications|alert|alerts)\b/i,
    history_event: /\b(history|audit\s*trail|activity\s*log|audit)\b/i,
  };

  for (const [type, pattern] of Object.entries(entityPatterns)) {
    if (pattern.test(normalized)) {
      return type;
    }
  }

  return null;
}

function getIntentSignals(message, context = {}) {
  const signals = [];
  const draftIntent = detectDraftIntent(message, context);
  const readIntent = draftIntent ? null : detectReadIntent(message, context);

  if (draftIntent) signals.push("draft_rule");
  if (readIntent) signals.push("read_rule");
  if (
    readIntent &&
    (readIntent.intent === READ_INTENTS.WEB_SEARCH ||
      readIntent.intent === READ_INTENTS.DEEP_SEARCH)
  ) {
    signals.push("search_rule");
  }

  return {
    draftIntent,
    readIntent,
    signals,
  };
}

module.exports = classifyIntent;
module.exports.INTENTS = INTENTS;
module.exports.DATA_REQUIREMENTS = DATA_REQUIREMENTS;
module.exports.detectDataRequirements = detectDataRequirements;
module.exports.SLASH_COMMANDS = SLASH_COMMANDS;
module.exports.isSlashCommand = isSlashCommand;
module.exports.parseSlashCommand = parseSlashCommand;
module.exports.getAvailableCommands = getAvailableCommands;
module.exports.READ_INTENTS = READ_INTENTS;
module.exports.detectReadIntent = detectReadIntent;
module.exports.detectDraftIntent = detectDraftIntent;
module.exports.FOLLOW_UP_TYPES = FOLLOW_UP_TYPES;
module.exports.FILTER_MODIFIERS = FILTER_MODIFIERS;
module.exports.detectFollowUp = detectFollowUp;
module.exports.detectFilterModifier = detectFilterModifier;
module.exports.hasExplicitEntityMention = hasExplicitEntityMention;
module.exports.detectEntityType = detectEntityType;
module.exports.getIntentSignals = getIntentSignals;
