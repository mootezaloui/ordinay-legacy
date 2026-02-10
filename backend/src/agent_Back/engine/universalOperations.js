'use strict';

/**
 * Universal Operation Handlers for V3 Execution Layer
 *
 * Four universal operations that scale across all entities:
 * - CREATE_ENTITY: Create any entity type
 * - UPDATE_ENTITY: Update any entity with field-level diffs
 * - LINK_ENTITIES: Change parent-child relationships
 * - ATTACH_TO_ENTITY: Add notes/documents to any entity
 *
 * Uses entity adapter registry for validation and execution.
 */

const { validateCreate, validateUpdate, getAdapter } = require('./entityAdapters');
const notesService = require('../services/notes.service');
const documentsService = require('../services/documents.service');

/**
 * Execute CREATE_ENTITY operation
 * @param {object} params - { entityType, payload }
 * @param {object} executionContext - { userId, sessionId }
 * @returns {Promise<object>} { entityType, entityId, entity }
 * @throws {Error} If validation or creation fails
 */
async function executeCreateEntity({ entityType, payload }, executionContext = {}) {
  // Validate payload via adapter
  const validated = validateCreate(entityType, payload);

  // Get service and call create
  const adapter = getAdapter(entityType);
  const service = require(adapter.servicePath);
  const created = service.create(validated);

  if (!created) {
    throw new Error(`Failed to create ${entityType}`);
  }

  return {
    entityType,
    entityId: created.id,
    entity: created
  };
}

/**
 * Execute UPDATE_ENTITY operation
 * @param {object} params - { entityType, entityId, changes }
 *   changes format: { field: { from: oldValue, to: newValue } }
 * @param {object} executionContext - { userId, sessionId }
 * @returns {Promise<object>} { entityType, entityId, entity, appliedChanges }
 * @throws {Error} If validation or update fails
 */
async function executeUpdateEntity({ entityType, entityId, changes }, executionContext = {}) {
  // Validate changes via adapter (flattens diffs to { field: value })
  const validated = validateUpdate(entityType, entityId, changes);

  // Get service and call update
  const adapter = getAdapter(entityType);
  const service = require(adapter.servicePath);
  const updated = service.update(entityId, validated);

  if (!updated) {
    throw new Error(`Failed to update ${entityType} #${entityId}`);
  }

  return {
    entityType,
    entityId: updated.id,
    entity: updated,
    appliedChanges: validated
  };
}

/**
 * Execute LINK_ENTITIES operation
 * @param {object} params - { relationType, from, to, mode }
 *   from/to format: { type, id }
 *   mode: 'add' | 'remove'
 * @param {object} executionContext - { userId, sessionId }
 * @returns {Promise<object>} { entityType, entityId, entity, appliedChanges }
 * @throws {Error} If relation type unsupported or update fails
 */
async function executeLinkEntities({ relationType, from, to, mode }, executionContext = {}) {
  // Linking is just an UPDATE_ENTITY with relationship field change
  // Example: link task #45 to dossier #12 → UPDATE task SET dossier_id = 12, lawsuit_id = NULL

  if (relationType === 'task_to_dossier') {
    return executeUpdateEntity({
      entityType: 'task',
      entityId: from.id,
      changes: {
        dossier_id: { from: null, to: to.id },
        lawsuit_id: { from: null, to: null }
      }
    }, executionContext);
  }

  if (relationType === 'task_to_lawsuit') {
    return executeUpdateEntity({
      entityType: 'task',
      entityId: from.id,
      changes: {
        dossier_id: { from: null, to: null },
        lawsuit_id: { from: null, to: to.id }
      }
    }, executionContext);
  }

  if (relationType === 'session_to_dossier') {
    return executeUpdateEntity({
      entityType: 'session',
      entityId: from.id,
      changes: {
        dossier_id: { from: null, to: to.id },
        lawsuit_id: { from: null, to: null }
      }
    }, executionContext);
  }

  if (relationType === 'session_to_lawsuit') {
    return executeUpdateEntity({
      entityType: 'session',
      entityId: from.id,
      changes: {
        dossier_id: { from: null, to: null },
        lawsuit_id: { from: null, to: to.id }
      }
    }, executionContext);
  }

  if (relationType === 'mission_to_dossier') {
    return executeUpdateEntity({
      entityType: 'mission',
      entityId: from.id,
      changes: {
        dossier_id: { from: null, to: to.id },
        lawsuit_id: { from: null, to: null }
      }
    }, executionContext);
  }

  if (relationType === 'mission_to_lawsuit') {
    return executeUpdateEntity({
      entityType: 'mission',
      entityId: from.id,
      changes: {
        dossier_id: { from: null, to: null },
        lawsuit_id: { from: null, to: to.id }
      }
    }, executionContext);
  }

  // Add more relation types as needed

  throw new Error(`Unsupported relation type: ${relationType}`);
}

/**
 * Execute ATTACH_TO_ENTITY operation
 * @param {object} params - { target, attachmentType, payload }
 *   target format: { type, id }
 *   attachmentType: 'note' | 'doc_draft' | 'file_ref'
 * @param {object} executionContext - { userId, sessionId }
 * @returns {Promise<object>} { attachmentType, target, noteId/documentId, ... }
 * @throws {Error} If attachment type unsupported or operation fails
 */
async function executeAttachToEntity({ target, attachmentType, payload }, executionContext = {}) {
  if (attachmentType === 'note') {
    // Add note via notesService
    const existingNotes = notesService.getNotesForEntity(target.type, target.id);
    const newNote = {
      content: payload.content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedNotes = [...existingNotes, newNote];
    const saved = notesService.saveNotesForEntity(target.type, target.id, updatedNotes);

    return {
      attachmentType: 'note',
      target,
      noteId: saved[saved.length - 1].id,
      content: payload.content
    };
  }

  if (attachmentType === 'doc_draft') {
    // Create document draft via documentsService
    const entityColumn = `${target.type}_id`;
    const docPayload = {
      title: `[DRAFT] ${payload.title}`,
      file_path: `drafts/${Date.now()}-${payload.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`,
      original_filename: `${payload.title}.txt`,
      mime_type: 'text/plain',
      size_bytes: Buffer.byteLength(payload.content || '', 'utf8'),
      notes: payload.notes || 'Agent-generated draft document',
      copy_type: 'draft',
      [entityColumn]: target.id
    };

    const document = documentsService.create(docPayload);

    return {
      attachmentType: 'doc_draft',
      target,
      documentId: document.id,
      title: document.title
    };
  }

  if (attachmentType === 'file_ref') {
    // File reference attachment (future implementation)
    throw new Error('file_ref attachment type not yet implemented');
  }

  throw new Error(`Unsupported attachment type: ${attachmentType}`);
}

module.exports = {
  executeCreateEntity,
  executeUpdateEntity,
  executeLinkEntities,
  executeAttachToEntity
};
