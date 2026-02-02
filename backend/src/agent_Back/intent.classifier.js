'use strict';

const { INTENTS, INTENT_LIST } = require('./intents');
const { classifyIntentWithLLM } = require('./llm.client');

/**
 * Data requirement types that can be detected from user messages
 */
const DATA_REQUIREMENTS = Object.freeze({
  CLIENT: 'client',
  DOSSIER: 'dossier',
  LAWSUIT: 'lawsuit',
  TASK: 'task',
  SESSION: 'session',
  OVERDUE_TASKS: 'overdue_tasks',
  UPCOMING_SESSIONS: 'upcoming_sessions',
  TIMELINE: 'timeline',
});

/**
 * READ intent types for deterministic data access
 * These intents bypass LLM classification and execute directly
 */
const READ_INTENTS = Object.freeze({
  LIST_CLIENTS: 'LIST_CLIENTS',
  GET_CLIENT: 'GET_CLIENT',
  LIST_DOSSIERS: 'LIST_DOSSIERS',
  GET_DOSSIER: 'GET_DOSSIER',
  LIST_TASKS: 'LIST_TASKS',
  LIST_OVERDUE_TASKS: 'LIST_OVERDUE_TASKS',
  LIST_SESSIONS: 'LIST_SESSIONS',
  GET_UPCOMING_SESSIONS: 'GET_UPCOMING_SESSIONS',
  LIST_PENDING_WORK: 'LIST_PENDING_WORK',
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
    lawsuit: /\b(lawsuit|lawsuits|case|cases)\b/i,
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
  const possessiveMatch = normalized.match(/(\w+)(?:'s|s')\s+(dossier|lawsuit|case|task|matter|file)/i);
  if (possessiveMatch) {
    entityHints.push({
      type: 'client',
      nameHint: possessiveMatch[1],
      targetEntity: possessiveMatch[2].toLowerCase(),
    });
  }

  // Pattern: "dossier for Emma" or "client Emma"
  const forClientMatch = normalized.match(/(dossier|lawsuit|case|matter)\s+for\s+(\w+)/i);
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

/**
 * Extract entity hints from user message (names, references)
 * @param {string} message - User message
 * @returns {Array} Array of entity hints
 */
function extractEntityHints(message) {
  const hints = [];
  
  // Pattern: "about X" or "regarding X" (e.g., "tell me about Youssef Daly")
  const aboutMatch = message.match(/(?:about|regarding|concerning)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
  if (aboutMatch) hints.push({ type: 'name', value: aboutMatch[1].trim() });
  
  // Possessive pattern: "Emma's dossier"
  const possMatch = message.match(/(\w+)(?:'s|s')\s+(dossier|client|task|lawsuit|case)/i);
  if (possMatch) hints.push({ type: 'name', value: possMatch[1] });
  
  // "for X" pattern: "dossier for Emma"
  const forMatch = message.match(/(?:dossier|lawsuit|case|task)\s+for\s+(\w+)/i);
  if (forMatch) hints.push({ type: 'name', value: forMatch[1] });
  
  // Dossier reference: DOS-2024-123456
  const refMatch = message.match(/DOS-\d{4}-\d+/i);
  if (refMatch) hints.push({ type: 'reference', value: refMatch[0].toUpperCase() });
  
  // Capitalized name after "client"
  const clientMatch = message.match(/client\s+(?:named\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (clientMatch) hints.push({ type: 'name', value: clientMatch[1] });
  
  // Pattern: "X's status/info/details" (where X is capitalized name)
  const statusMatch = message.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)'s\s+(?:status|info|information|details|data)/);
  if (statusMatch) hints.push({ type: 'name', value: statusMatch[1].trim() });
  
  return hints;
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

  // Pattern groups for intent detection
  // IMPORTANT: Must cover both verb-first AND noun-first patterns
  const listPatterns = [
    // Verb-first patterns: "list clients", "show my tasks"
    /\b(list|show|give|get|display|see|fetch|retrieve)\b.*\b(all|my)?\s*/i,
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

  const entityPatterns = {
    client: /\b(client|clients)\b/i,
    dossier: /\b(dossier|dossiers|case\s*file|matter|matters)\b/i,
    task: /\b(task|tasks|todo|to-do|todos)\b/i,
    session: /\b(session|sessions|meeting|meetings|hearing|hearings|appointment|appointments)\b/i,
  };

  const temporalPatterns = {
    overdue: /\b(overdue|late|past\s+due|missed)\b/i,
    upcoming: /\b(upcoming|next|scheduled|future|soon)\b/i,
    today: /\b(today|today's)\b/i,
    thisWeek: /\b(this\s+week|week's)\b/i,
    pending: /\b(pending|open|active|in\s*progress)\b/i,
  };

  // Check for list/query patterns
  const hasListPattern = listPatterns.some(p => p.test(normalized));

  // Detect entity type
  let entityType = null;
  for (const [type, pattern] of Object.entries(entityPatterns)) {
    if (pattern.test(normalized)) {
      entityType = type;
      break;
    }
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

  // Determine READ intent
  if (!entityType) {
    // No explicit entity type mentioned, but check if we have name hints
    // This handles queries like "tell me about Youssef Daly" (no "client" word)
    const nameHints = extractEntityHints(message);
    if (nameHints.length > 0) {
      // Default to client search when name is mentioned without entity type
      return { 
        intent: READ_INTENTS.GET_CLIENT, 
        requiresLocalData: true, 
        allowedTools: ['getClient', 'searchClientsByName'], 
        entityHints: nameHints 
      };
    }
    return null;
  }

  // LIST intents
  // CRITICAL: isShortEntityRequest ensures "clients list please" triggers READ gate
  if (hasListPattern || temporal.pending || isShortEntityRequest) {
    if (entityType === 'client') return { intent: READ_INTENTS.LIST_CLIENTS, requiresLocalData: true, allowedTools: ['listClients'] };
    if (entityType === 'dossier') return { intent: READ_INTENTS.LIST_DOSSIERS, requiresLocalData: true, allowedTools: ['listDossiers'] };
    if (entityType === 'task') {
      if (temporal.overdue) return { intent: READ_INTENTS.LIST_OVERDUE_TASKS, requiresLocalData: true, allowedTools: ['detectOverdueTasks'] };
      return { intent: READ_INTENTS.LIST_TASKS, requiresLocalData: true, allowedTools: ['listTasks'] };
    }
    if (entityType === 'session') {
      if (temporal.upcoming || temporal.today || temporal.thisWeek) {
        return { intent: READ_INTENTS.GET_UPCOMING_SESSIONS, requiresLocalData: true, allowedTools: ['listSessions'], filters: temporal };
      }
      return { intent: READ_INTENTS.LIST_SESSIONS, requiresLocalData: true, allowedTools: ['listSessions'] };
    }
  }

  // GET single entity intents (when specific entity is mentioned)
  const nameHints = extractEntityHints(message);
  if (nameHints.length > 0) {
    if (entityType === 'client') return { intent: READ_INTENTS.GET_CLIENT, requiresLocalData: true, allowedTools: ['getClient', 'searchClientsByName'], entityHints: nameHints };
    if (entityType === 'dossier') return { intent: READ_INTENTS.GET_DOSSIER, requiresLocalData: true, allowedTools: ['getDossier', 'getDossierByReference'], entityHints: nameHints };
  }

  return null;
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

/**
 * Follow-up Intent Types
 * These indicate the type of follow-up the user is making
 */
const FOLLOW_UP_TYPES = Object.freeze({
  FILTER_MODIFICATION: 'filter_modification',   // "what about inactive ones?"
  NEXT_ACTION: 'next_action',                   // "and now?", "what's next?"
  REPEAT_ACTION: 'repeat_action',               // "give it again", "repeat that"
  CLARIFICATION_REQUEST: 'clarification',       // "why?", "explain"
  PAGINATION: 'pagination',                     // "show more", "next page"
  SUBSET_REQUEST: 'subset',                     // "just the overdue ones"
  CONFIRMATION: 'confirmation',                 // "yes", "ok", "do it"
  NEGATION: 'negation',                         // "no", "cancel", "nevermind"
});

/**
 * Filter modifiers that can be applied to follow-up queries
 */
const FILTER_MODIFIERS = Object.freeze({
  // Status filters
  inactive: { field: 'status', value: 'inactive', label: 'inactive' },
  active: { field: 'status', value: 'active', label: 'active' },
  pending: { field: 'status', value: 'pending', label: 'pending' },
  completed: { field: 'status', value: 'completed', label: 'completed' },
  done: { field: 'status', value: 'done', label: 'done' },
  open: { field: 'status', value: 'open', label: 'open' },
  closed: { field: 'status', value: 'closed', label: 'closed' },

  // Temporal filters
  overdue: { field: 'temporal', value: 'overdue', label: 'overdue' },
  upcoming: { field: 'temporal', value: 'upcoming', label: 'upcoming' },
  today: { field: 'temporal', value: 'today', label: 'today' },
  'this week': { field: 'temporal', value: 'this_week', label: 'this week' },

  // Priority filters
  urgent: { field: 'priority', value: 'urgent', label: 'urgent' },
  high: { field: 'priority', value: 'high', label: 'high priority' },
  low: { field: 'priority', value: 'low', label: 'low priority' },
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
  if (!message || typeof message !== 'string') return null;

  const normalized = message.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).length;

  // Pattern 1: Very short vague messages (likely follow-ups)
  const vaguePatterns = [
    /^(and\s+)?now\??$/i,                       // "now?", "and now?"
    /^(now\s+)?what\??$/i,                      // "now what?", "what?"
    /^what('s|s)?\s*(next|now)\??$/i,           // "what's next?", "what now?"
    /^(so\s+)?what\s+(do|should)\s+i\s+do\??$/i, // "what do I do?", "what should I do?"
    /^(ok|okay)\s*(,?\s*(and|so|now))?\s*\??$/i, // "ok, and?", "okay now?"
    /^then\??$/i,                               // "then?"
    /^next\??$/i,                               // "next?"
    /^why\??$/i,                                // "why?"
    /^how\s*(come|so)\??$/i,                    // "how come?", "how so?"
    /^explain\??$/i,                            // "explain?"
    /^more\??$/i,                               // "more?"
    /^show\s+more\??$/i,                        // "show more?"
    /^continue\??$/i,                           // "continue?"
    /^what\s+else\??$/i,                        // "what else?"
    /^anything\s+else\??$/i,                    // "anything else?"
  ];

  // Pattern 2: "What about X?" patterns (filter modification)
  // NOTE: These patterns must NOT match when explicit entity types are present
  const whatAboutPatterns = [
    /^what\s+about\s+(the\s+)?(.+?)\s*(ones?)?\??$/i,     // "what about the inactive ones?"
    /^(and|but)\s+(the\s+)?(.+?)\s*(ones?)?\??$/i,       // "and the overdue ones?"
    /^(just|only)\s+(the\s+)?(.+?)\s*(ones?)?\??$/i,     // "just the urgent ones"
    /^(how\s+about|what\s+of)\s+(the\s+)?(.+?)\??$/i,    // "how about inactive?"
  ];

  // Entity keywords that indicate a NEW query, not a follow-up
  const entityKeywords = /\b(client|clients|dossier|dossiers|task|tasks|session|sessions|meeting|meetings|hearing|hearings|appointment|appointments|lawsuit|lawsuits|case|cases|matter|matters)\b/i;

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
        reason: 'vague_query',
        originalMessage: message,
      };
    }
  }

  // Pattern 1.5: Repeat action patterns (explicit repeat requests)
  // CRITICAL: These must be checked early to prevent fallthrough
  const repeatPatterns = [
    /^(give|show|do|run)\s+it\s+again[\.\?\!]?$/i,    // "give it again", "show it again"
    /^again[\s,]*(?:please)?[\.\?\!]?$/i,             // "again", "again please"
    /^repeat[\s\w]*[\.\?\!]?$/i,                      // "repeat", "repeat that", "repeat please"
    /^one\s+more\s+time[\.\?\!]?$/i,                  // "one more time"
    /^(same|the\s+same)[\.\?\!]?$/i,                  // "same", "the same"
    /^do\s+(that|the\s+same)[\s\w]*[\.\?\!]?$/i,     // "do that", "do the same", "do that again"
    /^(show|give|list)\s+(them|it|that)\s+again[\.\?\!]?$/i, // "show them again", "list it again"
  ];

  for (const pattern of repeatPatterns) {
    if (pattern.test(normalized)) {
      return {
        isFollowUp: true,
        type: FOLLOW_UP_TYPES.REPEAT_ACTION,
        confidence: 0.95,
        reason: 'repeat_request',
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
        const filterWord = (match[3] || match[2] || '').trim().toLowerCase();
        const modifier = detectFilterModifier(filterWord);

        return {
          isFollowUp: true,
          type: FOLLOW_UP_TYPES.FILTER_MODIFICATION,
          confidence: 0.85,
          reason: 'what_about_pattern',
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
        reason: 'confirmation',
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
        reason: 'negation',
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
          reason: 'pronoun_reference',
          originalMessage: message,
        };
      }
    }
  }

  // Check for standalone filter words in short messages (no entity context)
  if (wordCount <= 5) {
    const entityPatterns = [
      /\b(client|clients|dossier|dossiers|task|tasks|session|sessions)\b/i,
    ];
    const hasEntityMention = entityPatterns.some(p => p.test(normalized));

    if (!hasEntityMention) {
      const modifier = detectFilterModifier(normalized);
      if (modifier) {
        return {
          isFollowUp: true,
          type: FOLLOW_UP_TYPES.FILTER_MODIFICATION,
          confidence: 0.75,
          reason: 'standalone_filter',
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
  if (!text || typeof text !== 'string') return null;

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
    return { ...FILTER_MODIFIERS['this week'] };
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
  if (!message || typeof message !== 'string') return false;

  const normalized = message.toLowerCase();

  // Check for entity type keywords with list/show verbs (new query)
  const newQueryPatterns = [
    /\b(list|show|get|display)\s+(my\s+)?(all\s+)?(client|dossier|task|session)/i,
    /\bmy\s+(client|dossier|task|session)s?\b/i,
    /\b(client|dossier|task|session)s?\s+(list|overview)/i,
  ];

  // Check for specific entity references
  const specificEntityPatterns = [
    /\bclient\s+(?:named\s+)?[A-Z][a-z]+/i,  // "client Emma"
    /DOS-\d{4}-\d+/i,                         // Dossier reference
    /\bdossier\s+(?:for\s+)?[A-Z][a-z]+/i,   // "dossier for Emma"
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
  if (!message || typeof message !== 'string') return null;

  const normalized = message.toLowerCase();

  const entityPatterns = {
    client: /\b(client|clients)\b/i,
    dossier: /\b(dossier|dossiers|case\s*file|matter|matters)\b/i,
    task: /\b(task|tasks|todo|to-do|todos)\b/i,
    session: /\b(session|sessions|meeting|meetings|hearing|hearings|appointment|appointments)\b/i,
  };

  for (const [type, pattern] of Object.entries(entityPatterns)) {
    if (pattern.test(normalized)) {
      return type;
    }
  }

  return null;
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
module.exports.FOLLOW_UP_TYPES = FOLLOW_UP_TYPES;
module.exports.FILTER_MODIFIERS = FILTER_MODIFIERS;
module.exports.detectFollowUp = detectFollowUp;
module.exports.detectFilterModifier = detectFilterModifier;
module.exports.hasExplicitEntityMention = hasExplicitEntityMention;
module.exports.detectEntityType = detectEntityType;
