'use strict';

/**
 * EXECUTE TOOL: universalMutation (V3 UNIVERSAL MUTATION FRAMEWORK)
 *
 * Universal mutation tool that replaces all per-entity execution tools.
 * Handles CREATE_ENTITY, UPDATE_ENTITY, DELETE_ENTITY, LINK_ENTITIES, ATTACH_TO_ENTITY.
 *
 * CRITICAL: This is an execution tool.
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 * - Requires two-phase commit (PROPOSE → CONFIRM → EXECUTE)
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const db = require('../../../db/connection');
const crypto = require('crypto');
const { TOOL_CATEGORIES } = require('../tool.registry');
const { getAdapter, computeSnapshotHash, validatePayload, getReversibilityRules } = require('../../engine/entityAdapters');
const { createActionProposal, generateProposalId, ACTION_STATUS } = require('../../contracts/actionProposal.contract');

const OPERATION_TYPES = Object.freeze({
  CREATE_ENTITY: 'CREATE_ENTITY',
  UPDATE_ENTITY: 'UPDATE_ENTITY',
  DELETE_ENTITY: 'DELETE_ENTITY',
  LINK_ENTITIES: 'LINK_ENTITIES',
  ATTACH_TO_ENTITY: 'ATTACH_TO_ENTITY',
});

const ATTACHMENT_TYPES = Object.freeze({
  NOTE: 'note',
  DOC_DRAFT: 'doc_draft',
  FILE_REF: 'file_ref',
  GENERATED_DOCUMENT: 'generated_document',
});

const LINK_MODES = Object.freeze({
  ADD: 'add',
  REMOVE: 'remove',
});

const ENTITY_TABLE_BY_TYPE = Object.freeze({
  client: 'clients',
  dossier: 'dossiers',
  lawsuit: 'lawsuits',
  task: 'tasks',
  session: 'sessions',
  mission: 'missions',
  officer: 'officers',
  financial_entry: 'financial_entries',
  document: 'documents',
  personal_task: 'personal_tasks',
});

function pickDisplayValue(entity = {}) {
  const candidates = [
    entity.reference,
    entity.code,
    entity.number,
    entity.case_number,
    entity.name,
    entity.title,
    entity.subject,
  ];
  const chosen = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return chosen ? String(chosen).trim() : null;
}

function resolveEntityDisplay(type, id) {
  const table = ENTITY_TABLE_BY_TYPE[type];
  if (!table || !id) return null;
  try {
    const row = db
      .prepare(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`)
      .get(id);
    if (!row) return null;
    const primary = pickDisplayValue(row);
    return {
      reference: typeof row.reference === 'string' && row.reference.trim() ? String(row.reference).trim() : null,
      label: primary || `${type} #${id}`,
    };
  } catch {
    return null;
  }
}

/**
 * Valid link relationships per entity type.
 * Derived from DB foreign key columns and CHECK constraints.
 *
 * Format: sourceType → { linkField: { targetType, nullable, polymorphic? } }
 */
const LINK_DEFINITIONS = Object.freeze({
  dossier: {
    client_id: { targetType: 'client', nullable: false },
  },
  lawsuit: {
    dossier_id: { targetType: 'dossier', nullable: false },
  },
  task: {
    dossier_id: { targetType: 'dossier', nullable: true },
    lawsuit_id: { targetType: 'lawsuit', nullable: true },
  },
  session: {
    dossier_id: { targetType: 'dossier', nullable: true },
    lawsuit_id: { targetType: 'lawsuit', nullable: true },
  },
  mission: {
    dossier_id: { targetType: 'dossier', nullable: true },
    lawsuit_id: { targetType: 'lawsuit', nullable: true },
    officer_id: { targetType: 'officer', nullable: true },
  },
  document: {
    client_id: { targetType: 'client', nullable: true },
    dossier_id: { targetType: 'dossier', nullable: true },
    lawsuit_id: { targetType: 'lawsuit', nullable: true },
    mission_id: { targetType: 'mission', nullable: true },
    task_id: { targetType: 'task', nullable: true },
    session_id: { targetType: 'session', nullable: true },
    personal_task_id: { targetType: 'personal_task', nullable: true },
    financial_entry_id: { targetType: 'financial_entry', nullable: true },
    officer_id: { targetType: 'officer', nullable: true },
  },
  financial_entry: {
    client_id: { targetType: 'client', nullable: true },
    dossier_id: { targetType: 'dossier', nullable: true },
    lawsuit_id: { targetType: 'lawsuit', nullable: true },
    mission_id: { targetType: 'mission', nullable: true },
    task_id: { targetType: 'task', nullable: true },
    personal_task_id: { targetType: 'personal_task', nullable: true },
  },
  note: {
    entity_id: { targetType: '*', nullable: false, polymorphic: true },
  },
});

/**
 * Valid entity types for polymorphic note links (from DB CHECK constraint).
 */
const NOTE_ENTITY_TYPES = Object.freeze([
  'client', 'dossier', 'lawsuit', 'task', 'session',
  'mission', 'officer', 'financial_entry', 'document', 'personal_task',
]);

const inputSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: ['CREATE_ENTITY', 'UPDATE_ENTITY', 'DELETE_ENTITY', 'LINK_ENTITIES', 'ATTACH_TO_ENTITY'],
      description: 'Type of mutation operation',
    },
    params: {
      type: 'object',
      description: 'Operation-specific parameters',
    },
  },
  required: ['operation', 'params'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  description: 'Action proposal for confirmation',
  additionalProperties: true,
};

/**
 * Universal mutation handler
 *
 * This function generates a proposal for the mutation.
 * The actual execution happens in confirmation.js after user approval.
 *
 * @param {Object} input - { operation, params }
 * @param {Object} executionContext - { userId, sessionId }
 * @returns {Promise<Object>} ActionProposal
 */
async function handler(input, executionContext = {}) {
  const { operation, params } = input;

  // Validate operation type
  if (!OPERATION_TYPES[operation]) {
    throw new Error(`Invalid operation type: ${operation}`);
  }

  // Check for read-only entities (CREATE, UPDATE, DELETE all blocked)
  const entityTypeKey = params.entityType || (params.target && params.target.type) || params.sourceType;
  if (entityTypeKey && operation !== OPERATION_TYPES.LINK_ENTITIES && operation !== OPERATION_TYPES.ATTACH_TO_ENTITY) {
    const adapter = getAdapter(entityTypeKey);
    if (adapter.readOnly) {
      throw new Error(`${entityTypeKey} is read-only — mutations are not allowed`);
    }
  }

  // Validate and prepare based on operation type
  let snapshot = null;
  let actionSummary = '';
  let reversible = false;
  let affectedEntities = [];

  switch (operation) {
    case OPERATION_TYPES.CREATE_ENTITY: {
      const { entityType, payload } = params;
      if (!entityType || !payload) {
        throw new Error('CREATE_ENTITY requires entityType and payload');
      }

      // Validate payload
      validatePayload(entityType, 'create', payload);

      // No snapshot needed for creation (entity doesn't exist yet)
      snapshot = {
        scope: entityType,
        scopeId: null,
        hash: 'sha256:null',
        timestamp: new Date().toISOString(),
      };

      actionSummary = `Create new ${entityType}: ${JSON.stringify(payload).substring(0, 100)}...`;

      const rules = getReversibilityRules(entityType);
      reversible = rules.create.reversible;

      affectedEntities = [{ type: entityType, id: null, operation: 'create' }];
      break;
    }

    case OPERATION_TYPES.UPDATE_ENTITY: {
      const { entityType, entityId, changes } = params;
      if (!entityType || !entityId || !changes) {
        throw new Error('UPDATE_ENTITY requires entityType, entityId, and changes');
      }

      // Validate changes
      validatePayload(entityType, 'update', changes);

      // Compute snapshot hash before update
      const hash = computeSnapshotHash(entityType, entityId);
      snapshot = {
        scope: entityType,
        scopeId: entityId,
        hash,
        timestamp: new Date().toISOString(),
      };

      const changesList = Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(', ');
      actionSummary = `Update ${entityType} ${entityId}: ${changesList}`;

      const rules = getReversibilityRules(entityType);
      reversible = rules.update.reversible;

      affectedEntities = [{ type: entityType, id: entityId, operation: 'update' }];
      break;
    }

    case OPERATION_TYPES.DELETE_ENTITY: {
      const { entityType, entityId } = params;
      if (!entityType || !entityId) {
        throw new Error('DELETE_ENTITY requires entityType and entityId');
      }

      // Check if delete is allowed for this entity type
      const deleteAdapter = getAdapter(entityType);
      if (deleteAdapter.allowedDelete === false) {
        throw new Error(`Delete is not allowed for ${entityType} — use soft-delete or archive instead`);
      }

      // Validate delete operation
      validatePayload(entityType, 'delete', {});

      // Compute snapshot hash before deletion
      const deleteHash = computeSnapshotHash(entityType, entityId);
      snapshot = {
        scope: entityType,
        scopeId: entityId,
        hash: deleteHash,
        timestamp: new Date().toISOString(),
      };

      actionSummary = `Delete ${entityType} ${entityId}`;

      const deleteRules = getReversibilityRules(entityType);
      reversible = deleteRules.delete ? deleteRules.delete.reversible : false;

      affectedEntities = [{ type: entityType, id: entityId, operation: 'delete' }];
      break;
    }

    case OPERATION_TYPES.LINK_ENTITIES: {
      const { sourceType, sourceId, targetType, targetId, linkField, mode } = params;
      if (!sourceType || !sourceId || !targetType || !targetId || !linkField) {
        throw new Error('LINK_ENTITIES requires sourceType, sourceId, targetType, targetId, and linkField');
      }

      const linkMode = mode || LINK_MODES.ADD;
      if (!Object.values(LINK_MODES).includes(linkMode)) {
        throw new Error(`LINK_ENTITIES mode must be one of: ${Object.values(LINK_MODES).join(', ')}`);
      }

      // Validate relationship type against LINK_DEFINITIONS
      const sourceLinks = LINK_DEFINITIONS[sourceType];
      if (!sourceLinks) {
        throw new Error(`LINK_ENTITIES: ${sourceType} has no defined link relationships`);
      }

      const linkDef = sourceLinks[linkField];
      if (!linkDef) {
        throw new Error(`LINK_ENTITIES: ${sourceType}.${linkField} is not a valid link field. Valid: ${Object.keys(sourceLinks).join(', ')}`);
      }

      // Validate targetType matches definition
      if (linkDef.polymorphic) {
        if (!NOTE_ENTITY_TYPES.includes(targetType)) {
          throw new Error(`LINK_ENTITIES: Invalid target type for ${sourceType}: ${targetType}. Valid: ${NOTE_ENTITY_TYPES.join(', ')}`);
        }
      } else if (linkDef.targetType !== targetType) {
        throw new Error(`LINK_ENTITIES: ${sourceType}.${linkField} links to ${linkDef.targetType}, not ${targetType}`);
      }

      // Validate remove mode on non-nullable links
      if (linkMode === LINK_MODES.REMOVE && !linkDef.nullable) {
        throw new Error(`LINK_ENTITIES: Cannot remove ${sourceType}.${linkField} — relationship is mandatory`);
      }

      // Compute snapshot hash before linking
      let hash;
      if (sourceType === 'note') {
        // Notes are sub-entities — compute snapshot inline
        const noteRow = db.prepare(
          'SELECT entity_type, entity_id FROM notes WHERE id = ? AND deleted_at IS NULL'
        ).get(sourceId);
        if (noteRow) {
          const canonical = JSON.stringify({
            entity_type: noteRow.entity_type || null,
            entity_id: noteRow.entity_id || null,
          });
          hash = 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
        } else {
          hash = 'sha256:null';
        }
      } else {
        hash = computeSnapshotHash(sourceType, sourceId);
      }

      snapshot = {
        scope: sourceType,
        scopeId: sourceId,
        hash,
        timestamp: new Date().toISOString(),
      };

      if (linkMode === LINK_MODES.REMOVE) {
        actionSummary = `Unlink ${sourceType} ${sourceId} from ${targetType} ${targetId} via ${linkField}`;
      } else {
        actionSummary = `Link ${sourceType} ${sourceId} to ${targetType} ${targetId} via ${linkField}`;
      }

      if (sourceType === 'note') {
        reversible = true;
      } else {
        const rules = getReversibilityRules(sourceType);
        reversible = rules.update.reversible;
      }

      affectedEntities = [
        { type: sourceType, id: sourceId, operation: linkMode === LINK_MODES.REMOVE ? 'unlink' : 'link' },
        { type: targetType, id: targetId, operation: linkMode === LINK_MODES.REMOVE ? 'unlink' : 'link' },
      ];
      break;
    }

    case OPERATION_TYPES.ATTACH_TO_ENTITY: {
      const { target, attachmentType, payload } = params;
      if (!target || !target.type || !target.id || !attachmentType || !payload) {
        throw new Error('ATTACH_TO_ENTITY requires target (type, id), attachmentType, and payload');
      }

      const validAttachmentTypes = Object.values(ATTACHMENT_TYPES);
      if (!validAttachmentTypes.includes(attachmentType)) {
        throw new Error(`attachmentType must be one of: ${validAttachmentTypes.join(', ')}`);
      }

      // Validate attachment-specific payload
      if (attachmentType === ATTACHMENT_TYPES.NOTE && !payload.content) {
        throw new Error('note attachment requires payload.content');
      }
      if (attachmentType === ATTACHMENT_TYPES.DOC_DRAFT && (!payload.title || !payload.content)) {
        throw new Error('doc_draft attachment requires payload.title and payload.content');
      }
      if (attachmentType === ATTACHMENT_TYPES.FILE_REF && (!payload.filePath || !payload.fileName)) {
        throw new Error('file_ref attachment requires payload.filePath and payload.fileName');
      }
      if (attachmentType === ATTACHMENT_TYPES.GENERATED_DOCUMENT) {
        if (!payload.documentType || !payload.templateKey || !payload.language || !payload.format) {
          throw new Error('generated_document attachment requires payload.documentType, templateKey, language, and format');
        }
        if (!payload.schemaVersion || !payload.contentJson) {
          throw new Error('generated_document attachment requires payload.schemaVersion and contentJson');
        }
      }

      // Compute snapshot hash of target entity
      const attachHash = computeSnapshotHash(target.type, target.id);
      snapshot = {
        scope: target.type,
        scopeId: target.id,
        hash: attachHash,
        timestamp: new Date().toISOString(),
      };

      const display = resolveEntityDisplay(target.type, target.id);
      const targetLabel = display?.label || `${target.type} #${target.id}`;
      params.target = {
        ...target,
        label: targetLabel,
        reference: display?.reference || target.reference || null,
      };

      actionSummary = `Attach ${attachmentType} to ${targetLabel}`;
      reversible = true; // Attachments like notes can be deleted

      affectedEntities = [
        {
          type: target.type,
          id: target.id,
          operation: 'attach',
          reference: display?.reference || undefined,
          label: targetLabel,
        },
      ];
      break;
    }

    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }

  // Generate proposal ID
  const proposalId = generateProposalId(operation, 'v3');

  // Create action proposal
  const proposal = createActionProposal({
    proposalId,
    actionType: operation,
    toolCategory: 'execute',
    params,
    reversible,
    requiresConfirmation: true,
    humanReadableSummary: actionSummary,
    affectedEntities,
    status: ACTION_STATUS.PROPOSED,
    version: 'v3',
    posture: 'WORK',
    snapshot,
    sessionId: executionContext.sessionId || null,
  });

  return proposal;
}

module.exports = {
  name: 'universalMutation',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Universal mutation framework for CREATE_ENTITY, UPDATE_ENTITY, DELETE_ENTITY, LINK_ENTITIES (add/remove), ATTACH_TO_ENTITY (note/doc_draft/file_ref/generated_document)',
  inputSchema,
  outputSchema,
  reversibility: true, // Determined per operation
  sideEffects: true, // All mutations have side effects
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
  operationTypes: OPERATION_TYPES,
  attachmentTypes: ATTACHMENT_TYPES,
  linkModes: LINK_MODES,
  linkDefinitions: LINK_DEFINITIONS,
};
