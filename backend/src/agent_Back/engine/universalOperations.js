'use strict';

/**
 * Universal Operations
 *
 * Core execution handlers for universal mutation operations.
 * Called by confirmation.js after proposal validation.
 */

const db = require('../../db/connection');
const tasksService = require('../../services/tasks.service');
const clientsService = require('../../services/clients.service');
const dossiersService = require('../../services/dossiers.service');
const sessionsService = require('../../services/sessions.service');
const personalTasksService = require('../../services/personalTasks.service');
const missionsService = require('../../services/missions.service');
const lawsuitsService = require('../../services/lawsuits.service');
const financialService = require('../../services/financial.service');
const notificationsService = require('../../services/notifications.service');
const officersService = require('../../services/officers.service');
const notesService = require('../../services/notes.service');
const documentsService = require('../../services/documents.service');
const documentGenerationService = require('../../services/documentGeneration/documentGeneration.service');
const { validatePayload } = require('./entityAdapters');

/**
 * Map entity type to service
 */
const serviceMap = {
  task: tasksService,
  client: clientsService,
  dossier: dossiersService,
  session: sessionsService,
  personal_task: personalTasksService,
  mission: missionsService,
  lawsuit: lawsuitsService,
  financial_entry: financialService,
  notification: notificationsService,
  document: documentsService,
  officer: officersService,
};

/**
 * FK exclusivity groups (derived from DB CHECK constraints).
 * When setting a field in a group, all others in the group must be cleared.
 */
const FK_EXCLUSIVE_GROUPS = {
  task: [['dossier_id', 'lawsuit_id']],
  session: [['dossier_id', 'lawsuit_id']],
  mission: [['dossier_id', 'lawsuit_id']],
  financial_entry: [['dossier_id', 'lawsuit_id']],
  document: [['client_id', 'dossier_id', 'lawsuit_id', 'mission_id', 'task_id', 'session_id', 'personal_task_id', 'financial_entry_id', 'officer_id']],
};

/**
 * Valid entity types for polymorphic note links (from DB CHECK constraint).
 */
const NOTE_ENTITY_TYPES = [
  'client', 'dossier', 'lawsuit', 'task', 'session',
  'mission', 'officer', 'financial_entry', 'document', 'personal_task',
];

/**
 * Get service for entity type
 * @param {string} entityType - Entity type
 * @returns {Object} Service
 * @private
 */
function _getService(entityType) {
  const service = serviceMap[entityType];
  if (!service) {
    throw new Error(`No service found for entity type: ${entityType}`);
  }
  return service;
}

/**
 * CREATE_ENTITY operation
 *
 * Creates a new entity of the specified type.
 *
 * @param {Object} params - { entityType, payload }
 * @param {Object} context - { userId, sessionId }
 * @returns {Promise<Object>} Created entity
 */
async function executeCreateEntity(params, context) {
  const { entityType, payload } = params;

  // Validate payload
  validatePayload(entityType, 'create', payload);

  // Get service
  const service = _getService(entityType);

  // Map payload to service format (camelCase to snake_case)
  const servicePayload = _mapPayloadToService(payload);

  // Create entity
  const entity = service.create(servicePayload);

  if (!entity) {
    throw new Error(`Failed to create ${entityType}`);
  }

  return {
    id: entity.id,
    entityType,
    ...entity,
  };
}

/**
 * UPDATE_ENTITY operation
 *
 * Updates an existing entity.
 *
 * @param {Object} params - { entityType, entityId, changes }
 * @param {Object} context - { userId, sessionId }
 * @returns {Promise<Object>} Updated entity
 */
async function executeUpdateEntity(params, context) {
  const { entityType, entityId, changes } = params;

  // Validate changes
  validatePayload(entityType, 'update', changes);

  // Get service
  const service = _getService(entityType);

  // Map changes to service format
  const serviceChanges = _mapPayloadToService(changes);

  // Update entity
  const entity = service.update(entityId, serviceChanges);

  if (!entity) {
    throw new Error(`${entityType} ${entityId} not found or update failed`);
  }

  return {
    id: entity.id,
    entityType,
    ...entity,
  };
}

/**
 * DELETE_ENTITY operation
 *
 * Soft-deletes an entity of the specified type.
 *
 * @param {Object} params - { entityType, entityId }
 * @param {Object} context - { userId, sessionId }
 * @returns {Promise<Object>} Deleted entity confirmation
 */
async function executeDeleteEntity(params, context) {
  const { entityType, entityId } = params;

  // Get service
  const service = _getService(entityType);

  if (typeof service.remove !== 'function') {
    throw new Error(`Delete not supported for entity type: ${entityType}`);
  }

  // Soft-delete entity
  const result = service.remove(entityId);

  if (!result) {
    throw new Error(`${entityType} ${entityId} not found or delete failed`);
  }

  return {
    id: entityId,
    entityType,
    deleted: true,
    deletedAt: new Date().toISOString(),
  };
}

/**
 * LINK_ENTITIES operation
 *
 * Links two entities together via FK update.
 * Handles standard FK links, exclusive FK constraints, and polymorphic note links.
 *
 * @param {Object} params - { sourceType, sourceId, targetType, targetId, linkField, mode }
 * @param {Object} context - { userId, sessionId }
 * @returns {Promise<Object>} Updated source entity
 */
async function executeLinkEntities(params, context) {
  const { sourceType, sourceId, targetType, targetId, linkField, mode } = params;
  const linkMode = mode || 'add';

  // Special case: note re-linking (polymorphic entity_type + entity_id)
  if (sourceType === 'note') {
    return _executeLinkNote(sourceId, targetType, targetId, linkMode);
  }

  // Get service for source entity
  const service = _getService(sourceType);

  // Validate source entity exists
  const sourceEntity = service.get(sourceId);
  if (!sourceEntity) {
    throw new Error(`${sourceType} ${sourceId} not found`);
  }

  // Validate target entity exists (when adding)
  if (linkMode === 'add') {
    const targetService = _getService(targetType);
    const targetEntity = targetService.get(targetId);
    if (!targetEntity) {
      throw new Error(`${targetType} ${targetId} not found`);
    }
  }

  // Build update payload: set link field to targetId (add) or null (remove)
  const updatePayload = {
    [linkField]: linkMode === 'remove' ? null : targetId,
  };

  // Clear exclusive FK fields (respects DB CHECK constraints)
  if (linkMode === 'add') {
    const groups = FK_EXCLUSIVE_GROUPS[sourceType] || [];
    for (const group of groups) {
      if (group.includes(linkField)) {
        for (const field of group) {
          if (field !== linkField) {
            updatePayload[field] = null;
          }
        }
      }
    }
  }

  // Map to service format
  const servicePayload = _mapPayloadToService(updatePayload);

  // Update source entity
  const entity = service.update(sourceId, servicePayload);

  if (!entity) {
    const verb = linkMode === 'remove' ? 'unlink' : 'link';
    throw new Error(`Failed to ${verb} ${sourceType} ${sourceId} ${linkMode === 'remove' ? 'from' : 'to'} ${targetType} ${targetId}`);
  }

  return {
    id: entity.id,
    entityType: sourceType,
    linkOperation: linkMode,
    linkedTo: linkMode === 'remove' ? null : {
      type: targetType,
      id: targetId,
      field: linkField,
    },
    unlinkedFrom: linkMode === 'remove' ? {
      type: targetType,
      id: targetId,
      field: linkField,
    } : null,
    ...entity,
  };
}

/**
 * Re-link a note to a different entity (polymorphic entity_type + entity_id).
 *
 * @param {number} noteId - Note ID
 * @param {string} targetType - Target entity type
 * @param {number} targetId - Target entity ID
 * @param {string} linkMode - 'add' only (notes must belong to an entity)
 * @returns {Object} Link result
 * @private
 */
function _executeLinkNote(noteId, targetType, targetId, linkMode) {
  if (linkMode === 'remove') {
    throw new Error('Cannot remove note link — notes must belong to an entity');
  }

  if (!NOTE_ENTITY_TYPES.includes(targetType)) {
    throw new Error(`Invalid target entity type for note: ${targetType}. Valid: ${NOTE_ENTITY_TYPES.join(', ')}`);
  }

  // Validate note exists
  const note = db.prepare(
    'SELECT id, entity_type, entity_id FROM notes WHERE id = ? AND deleted_at IS NULL'
  ).get(noteId);
  if (!note) {
    throw new Error(`Note ${noteId} not found`);
  }

  // Validate target entity exists
  const targetService = _getService(targetType);
  const targetEntity = targetService.get(targetId);
  if (!targetEntity) {
    throw new Error(`${targetType} ${targetId} not found`);
  }

  // Update note's entity link
  db.prepare(
    'UPDATE notes SET entity_type = ?, entity_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(targetType, targetId, noteId);

  return {
    id: noteId,
    entityType: 'note',
    linkOperation: 'add',
    previousLink: {
      type: note.entity_type,
      id: note.entity_id,
    },
    linkedTo: {
      type: targetType,
      id: targetId,
      field: 'entity_id',
    },
    unlinkedFrom: null,
  };
}

/**
 * ATTACH_TO_ENTITY operation
 *
 * Non-destructive attachment of sub-entities to parent entities.
 * All attachments are append-only (INSERT, never UPDATE/DELETE existing data).
 *
 * @param {Object} params - { target: { type, id }, attachmentType, payload }
 * @param {Object} context - { userId, sessionId }
 * @returns {Promise<Object>} Attachment result with structured summary
 */
async function executeAttachToEntity(params, context) {
  const { target, attachmentType, payload } = params;

  // Validate target entity exists
  const targetService = _getService(target.type);
  const targetEntity = targetService.get(target.id);
  if (!targetEntity) {
    throw new Error(`${target.type} ${target.id} not found`);
  }

  if (attachmentType === 'note') {
    const now = new Date().toISOString();
    const author = payload.author || (context && context.userId) || 'agent';

    // Append note with author/time metadata (non-destructive INSERT)
    const result = db.prepare(
      'INSERT INTO notes (entity_type, entity_id, content, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(target.type, target.id, payload.content, author, now, now);

    const noteId = Number(result.lastInsertRowid);

    return {
      attachmentType: 'note',
      attachmentId: noteId,
      noteId,
      entityType: target.type,
      entityId: target.id,
      content: payload.content,
      created_by: author,
      created_at: now,
      attachmentSummary: {
        type: 'note',
        id: noteId,
        target: { type: target.type, id: target.id },
        createdAt: now,
        createdBy: author,
        nonDestructive: true,
      },
    };
  }

  if (attachmentType === 'doc_draft') {
    // Create draft document — does not overwrite originals
    const docPayload = {
      title: `[DRAFT] ${payload.title}`,
      file_path: `drafts/${Date.now()}-${payload.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`,
      original_filename: `${payload.title}.txt`,
      mime_type: 'text/plain',
      size_bytes: Buffer.byteLength(payload.content, 'utf8'),
      notes: payload.notes || 'Agent-generated draft document',
      copy_type: 'draft',
    };

    // Set the appropriate entity link
    const entityColumn = `${target.type}_id`;
    docPayload[entityColumn] = target.id;

    const document = documentsService.create(docPayload);

    if (!document) {
      throw new Error('Failed to create document draft');
    }

    const createdAt = document.created_at || document.uploaded_at;

    return {
      attachmentType: 'doc_draft',
      attachmentId: document.id,
      documentId: document.id,
      entityType: target.type,
      entityId: target.id,
      title: document.title,
      file_path: document.file_path,
      copy_type: document.copy_type,
      isDraft: true,
      created_at: createdAt,
      attachmentSummary: {
        type: 'doc_draft',
        id: document.id,
        target: { type: target.type, id: target.id },
        title: document.title,
        createdAt: createdAt,
        isDraft: true,
        nonDestructive: true,
      },
    };
  }

  if (attachmentType === 'file_ref') {
    // Store reference only — does not duplicate file content
    const filePayload = {
      title: payload.fileName,
      file_path: payload.filePath,
      original_filename: payload.fileName,
      mime_type: payload.mimeType || 'application/octet-stream',
      size_bytes: payload.sizeBytes || 0,
      notes: payload.notes || 'Agent-attached file reference',
      copy_type: payload.copyType || 'original',
    };

    // Set the appropriate entity link
    const entityColumn = `${target.type}_id`;
    filePayload[entityColumn] = target.id;

    const document = documentsService.create(filePayload);

    if (!document) {
      throw new Error('Failed to create file reference');
    }

    const createdAt = document.created_at || document.uploaded_at;

    return {
      attachmentType: 'file_ref',
      attachmentId: document.id,
      documentId: document.id,
      entityType: target.type,
      entityId: target.id,
      title: document.title,
      file_path: document.file_path,
      created_at: createdAt,
      attachmentSummary: {
        type: 'file_ref',
        id: document.id,
        target: { type: target.type, id: target.id },
        title: document.title,
        filePath: document.file_path,
        referenceOnly: true,
        createdAt: createdAt,
        nonDestructive: true,
      },
    };
  }

  if (attachmentType === 'generated_document') {
    const generated = await documentGenerationService.generateFromAttachmentPayload({
      target: { type: target.type, id: target.id },
      payload,
      createdBy: context?.userId ? String(context.userId) : null,
    });

    return {
      attachmentType: 'generated_document',
      attachmentId: generated.documentId,
      documentId: generated.documentId,
      generationId: generated.generationId,
      generationUid: generated.generationUid,
      entityType: target.type,
      entityId: target.id,
      downloadUrl: generated.downloadUrl,
      metadata: generated.metadata,
      attachmentSummary: {
        type: 'generated_document',
        id: generated.documentId,
        target: { type: target.type, id: target.id },
        generationId: generated.generationId,
        nonDestructive: true,
      },
    };
  }

  throw new Error(`Unsupported attachment type: ${attachmentType}`);
}

/**
 * Map payload from camelCase to snake_case (service format)
 * @param {Object} payload - Payload with camelCase keys
 * @returns {Object} Payload with snake_case keys
 * @private
 */
function _mapPayloadToService(payload) {
  const mapped = {};
  for (const [key, value] of Object.entries(payload)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    mapped[snakeKey] = value;
  }
  return mapped;
}

module.exports = {
  executeCreateEntity,
  executeUpdateEntity,
  executeDeleteEntity,
  executeLinkEntities,
  executeAttachToEntity,
};
