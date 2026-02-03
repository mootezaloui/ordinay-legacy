/**
 * Acknowledgement Phrases — Immediate, deterministic responses
 *
 * These are shown INSTANTLY when the user submits a message,
 * BEFORE any API call or LLM involvement.
 *
 * The phrases should:
 * - Be short and direct (no chatbot fluff)
 * - Signal that the request was received
 * - Not promise specific actions
 * - Vary slightly to feel natural
 */

const ACK_PHRASES = [
  "Got it, checking now.",
  "Alright, let me look into that.",
  "On it.",
  "Okay, one moment.",
  "Looking into this.",
  "Let me check.",
  "Understood, working on it.",
];

// Track last used index to avoid immediate repeats
let lastIndex = -1;

/**
 * Get a random acknowledgement phrase.
 * Avoids repeating the same phrase twice in a row.
 */
export function getAckPhrase(): string {
  let index = Math.floor(Math.random() * ACK_PHRASES.length);

  // Avoid immediate repeat
  if (index === lastIndex && ACK_PHRASES.length > 1) {
    index = (index + 1) % ACK_PHRASES.length;
  }

  lastIndex = index;
  return ACK_PHRASES[index];
}

/**
 * Get acknowledgement phrase based on detected intent hint.
 * For more contextual acknowledgements.
 *
 * @param message - The user's message (for context)
 */
export function getContextualAckPhrase(message: string): string {
  const lower = message.toLowerCase();

  // Data retrieval hints
  if (/\b(show|list|get|find|search)\b/.test(lower)) {
    return "Searching now…";
  }

  if (/\b(client|clients)\b/.test(lower)) {
    return "Looking up client info…";
  }

  if (/\b(dossier|dossiers|case|cases)\b/.test(lower)) {
    return "Checking dossier records…";
  }

  if (/\b(task|tasks)\b/.test(lower)) {
    return "Loading tasks…";
  }

  // Slash commands
  if (message.startsWith("/")) {
    return "Executing command…";
  }

  // Default
  return getAckPhrase();
}
