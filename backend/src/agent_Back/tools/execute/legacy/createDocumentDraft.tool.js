'use strict';

/**
 * DEPRECATED: This tool is replaced by the universal ATTACH_TO_ENTITY operation.
 * Kept for backward compatibility. New code should use ATTACH_TO_ENTITY with attachmentType='doc_draft'.
 *
 * Example universal operation:
 * actionType: 'ATTACH_TO_ENTITY'
 * params: { target: { type: 'dossier', id: 12 }, attachmentType: 'doc_draft', payload: { title, content } }
 */

/**
 * EXECUTE TOOL: createDocumentDraft (V3 IMPLEMENTATION - DEPRECATED)
 *
 * CRITICAL: This is an execution tool.
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 * - Requires two-phase commit (PROPOSE → CONFIRM → EXECUTE)
 * - Non-destructive: creates drafts, never overwrites existing documents
 * - Drafts are clearly marked as non-final
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const { TOOL_CATEGORIES } = require('../../tool.registry');
const documentsService = require('../../../../services/documents.service');

const inputSchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      description: 'Draft document title',
    },
    content: {
      type: 'string',
      description: 'Draft document content (text)',
    },
    notes: {
      type: 'string',
      description: 'Optional notes about the draft',
    },
    entityType: {
      type: 'string',
      enum: ['client', 'dossier', 'lawsuit', 'mission', 'task', 'session', 'personal_task', 'financial_entry'],
      description: 'Type of entity to attach draft to',
    },
    entityId: {
      type: 'integer',
      minimum: 1,
      description: 'ID of the entity',
    },
  },
  required: ['title', 'content', 'entityType', 'entityId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    documentId: {
      type: 'integer',
      description: 'Created draft document ID',
    },
    title: {
      type: 'string',
      description: 'Draft title',
    },
    isDraft: {
      type: 'boolean',
      description: 'Always true for drafts',
    },
    created_at: {
      type: 'string',
      description: 'Creation timestamp',
    },
  },
  required: ['documentId', 'title', 'isDraft'],
  additionalProperties: true,
};

/**
 * Create a document draft
 *
 * This function is ONLY callable in v3 after explicit user confirmation.
 * The firewall will block execution in v1/v2.
 *
 * Creates a draft document that is:
 * - Clearly marked as non-final (copy_type = 'draft')
 * - Linked to a specific entity
 * - Never overwrites existing documents
 *
 * @param {Object} params - Draft parameters
 * @param {Object} executionContext - { userId, sessionId }
 * @returns {Promise<Object>} Created draft document
 */
async function handler(params, executionContext = {}) {
  const { title, content, notes, entityType, entityId } = params;

  // Build document payload
  const payload = {
    title: `[DRAFT] ${title}`,  // Prefix to clearly mark as draft
    file_path: `drafts/${Date.now()}-${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`,
    original_filename: `${title}.txt`,
    mime_type: 'text/plain',
    size_bytes: Buffer.byteLength(content, 'utf8'),
    notes: notes || 'Agent-generated draft document',
    copy_type: 'draft',  // Mark as draft
  };

  // Set the appropriate entity link
  const entityColumn = `${entityType}_id`;
  payload[entityColumn] = entityId;

  // Create document record
  const document = documentsService.create(payload);

  if (!document) {
    throw new Error('Failed to create document draft');
  }

  // Return document details for ExecutionResult
  return {
    documentId: document.id,
    title: document.title,
    file_path: document.file_path,
    copy_type: document.copy_type,
    isDraft: true,
    entityType,
    entityId,
    created_at: document.created_at || document.uploaded_at,
    notes: document.notes,
  };
}

module.exports = {
  name: 'createDocumentDraft',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Create a draft document (non-final, clearly marked)',
  inputSchema,
  outputSchema,
  reversibility: true, // Drafts can be deleted
  sideEffects: true, // Creates database record
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};
