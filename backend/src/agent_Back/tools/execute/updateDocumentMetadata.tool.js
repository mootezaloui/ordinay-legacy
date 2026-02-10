'use strict';

/**
 * DEPRECATED: This tool is replaced by the universal UPDATE_ENTITY operation.
 * Kept for backward compatibility. New code should use UPDATE_ENTITY with entityType='document'.
 *
 * Example universal operation:
 * actionType: 'UPDATE_ENTITY'
 * params: { entityType: 'document', entityId: 789, changes: { title: { from: '...', to: '...' } } }
 */

/**
 * EXECUTE TOOL: updateDocumentMetadata (V3 IMPLEMENTATION - DEPRECATED)
 *
 * CRITICAL: This is an execution tool.
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 * - Requires two-phase commit (PROPOSE → CONFIRM → EXECUTE)
 * - Metadata-only: never touches document content
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const { TOOL_CATEGORIES } = require('../tool.registry');
const documentsService = require('../../../services/documents.service');

const inputSchema = {
  type: 'object',
  properties: {
    documentId: {
      type: 'integer',
      minimum: 1,
      description: 'Document ID to update',
    },
    title: {
      type: 'string',
      minLength: 1,
      description: 'New document title',
    },
    notes: {
      type: 'string',
      description: 'New notes',
    },
    copyType: {
      type: 'string',
      enum: ['original', 'copy', 'draft', 'scan'],
      description: 'Document copy type',
    },
  },
  required: ['documentId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    documentId: {
      type: 'integer',
      description: 'Updated document ID',
    },
    title: {
      type: 'string',
      description: 'Document title',
    },
    notes: {
      type: 'string',
      description: 'Document notes',
    },
    copy_type: {
      type: 'string',
      description: 'Copy type',
    },
    updated_at: {
      type: 'string',
      description: 'Update timestamp',
    },
  },
  required: ['documentId'],
  additionalProperties: true,
};

/**
 * Update document metadata (metadata-only, content unchanged)
 *
 * This function is ONLY callable in v3 after explicit user confirmation.
 * The firewall will block execution in v1/v2.
 *
 * Updates ONLY metadata fields:
 * - title
 * - notes
 * - copy_type
 *
 * Does NOT update:
 * - file_path (document content location)
 * - document_text (extracted text)
 * - mime_type
 * - size_bytes
 *
 * @param {Object} params - Metadata update parameters
 * @param {Object} executionContext - { userId, sessionId }
 * @returns {Promise<Object>} Updated document
 */
async function handler(params, executionContext = {}) {
  const { documentId, title, notes, copyType } = params;

  // Build metadata-only update payload
  const payload = {};
  if (title !== undefined) payload.title = title;
  if (notes !== undefined) payload.notes = notes;
  if (copyType !== undefined) payload.copy_type = copyType;

  // Ensure at least one field is being updated
  if (Object.keys(payload).length === 0) {
    throw new Error('At least one metadata field must be provided for update');
  }

  // Update document metadata via service
  const document = documentsService.update(documentId, payload);

  if (!document) {
    throw new Error(`Document ${documentId} not found or update failed`);
  }

  // Return document details for ExecutionResult
  return {
    documentId: document.id,
    title: document.title,
    notes: document.notes,
    copy_type: document.copy_type,
    updated_at: document.updated_at,
    file_path: document.file_path,
    mime_type: document.mime_type,
  };
}

module.exports = {
  name: 'updateDocumentMetadata',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Update document metadata (title, notes, copy type) - content unchanged',
  inputSchema,
  outputSchema,
  reversibility: true, // Can be undone by setting previous values
  sideEffects: true, // Modifies database record
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};
