'use strict';

/**
 * DEPRECATED: This tool is replaced by the universal ATTACH_TO_ENTITY operation.
 * Kept for backward compatibility. New code should use ATTACH_TO_ENTITY with attachmentType='note'.
 *
 * Example universal operation:
 * actionType: 'ATTACH_TO_ENTITY'
 * params: { target: { type: 'dossier', id: 12 }, attachmentType: 'note', payload: { content: '...' } }
 */

/**
 * EXECUTE TOOL: addNote (V3 IMPLEMENTATION - DEPRECATED)
 *
 * CRITICAL: This is an execution tool.
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 * - Requires two-phase commit (PROPOSE → CONFIRM → EXECUTE)
 * - Non-destructive: only adds notes, never deletes
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const { TOOL_CATEGORIES } = require('../../tool.registry');
const notesService = require('../../../../services/notes.service');

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'client', 'task', 'session', 'lawsuit', 'mission', 'personal_task', 'financial_entry'],
      description: 'Type of entity to attach note to',
    },
    entityId: {
      type: 'integer',
      minimum: 1,
      description: 'ID of the entity',
    },
    content: {
      type: 'string',
      minLength: 1,
      description: 'Note content',
    },
  },
  required: ['entityType', 'entityId', 'content'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    noteId: {
      type: 'integer',
      description: 'Created note ID',
    },
    entityType: {
      type: 'string',
      description: 'Entity type',
    },
    entityId: {
      type: 'integer',
      description: 'Entity ID',
    },
    content: {
      type: 'string',
      description: 'Note content',
    },
    created_at: {
      type: 'string',
      description: 'Creation timestamp',
    },
  },
  required: ['noteId', 'entityType', 'entityId', 'content'],
  additionalProperties: true,
};

/**
 * Add a note to an entity
 *
 * This function is ONLY callable in v3 after explicit user confirmation.
 * The firewall will block execution in v1/v2.
 *
 * Non-destructive: appends note to existing notes, never deletes.
 *
 * @param {Object} params - Note parameters
 * @param {Object} executionContext - { userId, sessionId }
 * @returns {Promise<Object>} Created note
 */
async function handler(params, executionContext = {}) {
  const { entityType, entityId, content } = params;

  // Get existing notes
  const existingNotes = notesService.getNotesForEntity(entityType, entityId);

  // Create new note object
  const newNote = {
    content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Append to existing notes array
  const updatedNotes = [...existingNotes, newNote];

  // Save all notes (bulk operation)
  const savedNotes = notesService.saveNotesForEntity(entityType, entityId, updatedNotes);

  // Find the newly created note (last one)
  const createdNote = savedNotes[savedNotes.length - 1];

  if (!createdNote) {
    throw new Error('Failed to create note');
  }

  // Return note details for ExecutionResult
  return {
    noteId: createdNote.id,
    entityType: createdNote.entity_type,
    entityId: createdNote.entity_id,
    content: createdNote.content,
    created_at: createdNote.created_at,
    updated_at: createdNote.updated_at,
  };
}

module.exports = {
  name: 'addNote',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Add a note to a dossier, client, task, or session',
  inputSchema,
  outputSchema,
  reversibility: true, // Notes can be deleted
  sideEffects: true, // Creates database record
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};
