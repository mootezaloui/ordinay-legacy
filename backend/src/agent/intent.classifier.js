'use strict';

const { INTENTS, INTENT_LIST } = require('./intents');
const { classifyIntentWithLLM } = require('./llm.client');

/**
 * Data requirement types that can be detected from user messages
 */
const DATA_REQUIREMENTS = Object.freeze({
  CLIENT: 'client',
  DOSSIER: 'dossier',
  CASE: 'case',
  TASK: 'task',
  SESSION: 'session',
  OVERDUE_TASKS: 'overdue_tasks',
  UPCOMING_SESSIONS: 'upcoming_sessions',
  TIMELINE: 'timeline',
});

/**
 * Slash Command Registry
 * Defines all supported slash commands with their mappings to tools
 */
const SLASH_COMMANDS = Object.freeze({
  // Client commands
  clients: {
    command: '/clients',
    description: 'List all clients',
    usage: '/clients',
    tools: ['listClients'],
    params: {},
    category: 'clients',
  },
  client: {
    command: '/client',
    description: 'Get client by name or ID',
    usage: '/client <name|id>',
    tools: ['searchClientsByName', 'getClient'],
    params: { requiresArg: true, argType: 'nameOrId' },
    category: 'clients',
  },

  // Dossier commands
  dossiers: {
    command: '/dossiers',
    description: 'List all dossiers',
    usage: '/dossiers',
    tools: ['listDossiers'],
    params: {},
    category: 'dossiers',
  },
  dossier: {
    command: '/dossier',
    description: 'Get dossier by reference or ID',
    usage: '/dossier <reference|id>',
    tools: ['getDossierByReference', 'getDossier'],
    params: { requiresArg: true, argType: 'referenceOrId' },
    category: 'dossiers',
  },

  // Task commands
  tasks: {
    command: '/tasks',
    description: 'List tasks (optionally filtered)',
    usage: '/tasks [overdue|pending|today]',
    tools: ['listTasks'],
    params: { optionalArg: true, argType: 'filter' },
    category: 'tasks',
  },
  'tasks-overdue': {
    command: '/tasks overdue',
    description: 'List overdue tasks',
    usage: '/tasks overdue',
    tools: ['detectOverdueTasks'],
    params: {},
    category: 'tasks',
  },

  // Session commands
  sessions: {
    command: '/sessions',
    description: 'List sessions (optionally filtered by time)',
    usage: '/sessions [today|this-week|upcoming]',
    tools: ['listSessions'],
    params: { optionalArg: true, argType: 'timeFilter' },
    category: 'sessions',
  },
  'sessions-today': {
    command: '/sessions today',
    description: 'List sessions scheduled for today',
    usage: '/sessions today',
    tools: ['listSessionsToday'],
    params: { filter: 'today' },
    category: 'sessions',
  },
  'sessions-week': {
    command: '/sessions this-week',
    description: 'List sessions scheduled for this week',
    usage: '/sessions this-week',
    tools: ['listSessionsThisWeek'],
    params: { filter: 'this-week' },
    category: 'sessions',
  },

  // Help command
  help: {
    command: '/help',
    description: 'Show available commands',
    usage: '/help',
    tools: [],
    params: {},
    category: 'help',
  },
});

/**
 * Check if a message is a slash command
 * @param {string} message - User message
 * @returns {boolean} True if message starts with /
 */
function isSlashCommand(message) {
  return typeof message === 'string' && message.trim().startsWith('/');
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
    return { valid: false, error: 'Not a slash command' };
  }

  const trimmed = message.trim();
  const parts = trimmed.split(/\s+/);
  const commandPart = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Build potential compound command (e.g., "/tasks overdue")
  const compoundKey = args.length > 0 ? `${commandPart.slice(1)}-${args[0].toLowerCase()}` : null;

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
    .filter(c => c.category !== 'help')
    .map(c => c.command);

  return {
    valid: false,
    command: commandPart,
    error: `Unknown command: ${commandPart}`,
    availableCommands,
    suggestion: 'Type /help to see available commands',
  };
}

/**
 * Get all available slash commands for UI autocomplete
 * @returns {Array} List of command objects with command, description, usage
 */
function getAvailableCommands() {
  return Object.values(SLASH_COMMANDS).map(cmd => ({
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
    case: /\b(case|cases|hearing)\b/i,
    task: /\b(task|tasks|todo|to-do)\b/i,
    session: /\b(session|sessions|meeting|appointment)\b/i,
  };

  // Check for status inquiries
  const hasStatusInquiry = statusPatterns.some(p => p.test(normalized));

  // Check for list requests
  const hasListRequest = listPatterns.some(p => p.test(normalized));

  // Check for temporal context
  const hasTemporal = temporalPatterns.some(p => p.test(normalized));

  // Detect entity type mentions
  Object.entries(entityTypePatterns).forEach(([type, pattern]) => {
    if (pattern.test(normalized)) {
      needs.push(DATA_REQUIREMENTS[type.toUpperCase()]);
    }
  });

  // Detect overdue task queries
  if (/overdue/i.test(normalized) || (hasTemporal && /task/i.test(normalized))) {
    needs.push(DATA_REQUIREMENTS.OVERDUE_TASKS);
  }

  // Detect upcoming session queries
  if (/upcoming/i.test(normalized) && /session|meeting|appointment/i.test(normalized)) {
    needs.push(DATA_REQUIREMENTS.UPCOMING_SESSIONS);
  }

  // Detect timeline requests
  if (/timeline|history|activity|recent/i.test(normalized)) {
    needs.push(DATA_REQUIREMENTS.TIMELINE);
  }

  // Extract potential entity name hints (quoted names or capitalized words after possessive)
  // Pattern: "Emma's dossier" → hint: { type: 'client', name: 'Emma' }
  const possessiveMatch = normalized.match(/(\w+)(?:'s|s')\s+(dossier|case|task|matter|file)/i);
  if (possessiveMatch) {
    entityHints.push({
      type: 'client',
      nameHint: possessiveMatch[1],
      targetEntity: possessiveMatch[2].toLowerCase(),
    });
  }

  // Pattern: "dossier for Emma" or "client Emma"
  const forClientMatch = normalized.match(/(dossier|case|matter)\s+for\s+(\w+)/i);
  if (forClientMatch) {
    entityHints.push({
      type: 'client',
      nameHint: forClientMatch[2],
      targetEntity: forClientMatch[1].toLowerCase(),
    });
  }

  // Pattern: "client named X" or "client X"
  const clientNameMatch = message.match(/client\s+(?:named\s+)?([A-Z][a-z]+)/);
  if (clientNameMatch) {
    entityHints.push({
      type: 'client',
      nameHint: clientNameMatch[1],
      targetEntity: 'client',
    });
  }

  // Pattern: dossier reference "DOS-2024-123456"
  const dossierRefMatch = message.match(/DOS-\d{4}-\d+/i);
  if (dossierRefMatch) {
    entityHints.push({
      type: 'dossier',
      reference: dossierRefMatch[0].toUpperCase(),
      targetEntity: 'dossier',
    });
  }

  // Determine if local data is actually required
  const requiresData = needs.length > 0 ||
    entityHints.length > 0 ||
    (hasStatusInquiry && (context.scope !== 'GLOBAL' || entityHints.length > 0)) ||
    hasListRequest;

  return {
    requiresData,
    needs: [...new Set(needs)], // deduplicate
    entityHints,
    hasStatusInquiry,
    hasListRequest,
    hasTemporal,
    contextScope: context.scope || 'GLOBAL',
  };
}

async function classifyIntent(message, context = {}) {
  if (typeof message !== 'string' || !message.trim()) {
    throw classificationError('Message is required for intent classification.');
  }

  // Explicit user-provided intent takes precedence when valid.
  if (context.intent) {
    if (!INTENT_LIST.includes(context.intent)) {
      throw classificationError(`Unsupported intent provided in context: ${context.intent}`);
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
    normalized.includes('risk') ||
    normalized.includes('mitigation') ||
    normalized.includes('control') ||
    context.operation === 'analyze_risks'
  ) {
    matches.push(INTENTS.ANALYZE_OPERATIONAL_RISKS);
  }

  // Rule: Action planning must reference proposed actions or next steps explicitly.
  if (
    normalized.includes('propose actions') ||
    normalized.includes('proposed actions') ||
    normalized.includes('action plan') ||
    normalized.includes('next steps') ||
    context.operation === 'propose_actions'
  ) {
    matches.push(INTENTS.PROPOSE_ACTIONS);
  }

  // Rule: Invitations are identified by invitation keywords or explicit draft type.
  if (
    normalized.includes('invite') ||
    normalized.includes('invitation') ||
    normalized.includes('rsvp') ||
    context.draftType === 'invitation'
  ) {
    matches.push(INTENTS.DRAFT_INVITATION);
  }

  // Rule: Client emails require both client targeting and email drafting signals.
  if (
    (normalized.includes('client') && normalized.includes('email')) ||
    (context.recipientType === 'client' && normalized.includes('email')) ||
    context.draftType === 'client_email'
  ) {
    matches.push(INTENTS.DRAFT_CLIENT_EMAIL);
  }

  // Rule: Session summaries are detected via summary language or explicit operation.
  if (
    normalized.includes('summary') ||
    normalized.includes('summarize') ||
    normalized.includes('recap') ||
    normalized.includes('minutes') ||
    context.operation === 'summarize_session'
  ) {
    matches.push(INTENTS.SUMMARIZE_SESSION);
  }

  // Rule: Entity state explanations require explicit explain/status language or context operation.
  if (
    normalized.includes('explain') ||
    normalized.includes('status') ||
    normalized.includes('state') ||
    context.operation === 'explain_state'
  ) {
    matches.push(INTENTS.EXPLAIN_ENTITY_STATE);
  }

  const uniqueMatches = [...new Set(matches)];

  if (uniqueMatches.length === 0) {
    return INTENTS.GENERAL_CHAT;
  }

  if (uniqueMatches.length > 1) {
    throw classificationError(`Ambiguous intent; matched multiple intents: ${uniqueMatches.join(', ')}`);
  }

  return uniqueMatches[0];
}

function classificationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

module.exports = classifyIntent;
module.exports.INTENTS = INTENTS;
module.exports.DATA_REQUIREMENTS = DATA_REQUIREMENTS;
module.exports.detectDataRequirements = detectDataRequirements;
module.exports.SLASH_COMMANDS = SLASH_COMMANDS;
module.exports.isSlashCommand = isSlashCommand;
module.exports.parseSlashCommand = parseSlashCommand;
module.exports.getAvailableCommands = getAvailableCommands;
