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
const {
  bindMutationScope,
  resolveBoundFromScopeLabels,
} = require('../../mutations/mutationScopeBinder');
const { validateAndPrepareFields } = require('../../mutations/fieldGovernance');
const { applyHierarchicalScopeBinding } = require('../../mutations/hierarchicalScopeBinder');

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

function toDisplayEntityName(entityType) {
  return String(entityType || "record")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function summarizeMutationFields(value = {}) {
  const keys = Object.keys(value || {}).filter((key) => key && !/(^id$|_id$|Id$|ID$)/.test(key));
  if (keys.length === 0) return "";
  return ` fields [${keys.join(", ")}]`;
}

function buildScopeBindingRequiredError({ entityType, missingRequired = [], boundLabels = [] }) {
  const normalizedType = toDisplayEntityName(entityType);
  const missing = Array.isArray(missingRequired) ? missingRequired : [];
  let message = `I need additional context to create this ${normalizedType}.`;
  if (missing.includes("dossier_reference")) {
    message = "I need the dossier reference to continue.";
  } else if (missing.includes("dossier_or_lawsuit_reference")) {
    message = "I need either a dossier reference or a lawsuit reference to continue.";
  } else if (missing.includes("target_reference")) {
    message = "I need the target record reference to continue.";
  }

  const withScope = Array.isArray(boundLabels) && boundLabels.length > 0
    ? `${message} Current scope: ${boundLabels.join(", ")}.`
    : message;

  const err = new Error(withScope);
  err.code = "MUTATION_SCOPE_BINDING_REQUIRED";
  err.type = "mutation_scope_binding_required";
  err.missingRequired = missing;
  err.userMessageDraft = withScope;
  return err;
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
      label: primary || `selected ${toDisplayEntityName(type)}`,
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

const ENTITY_TYPE_ENUM = Object.freeze([
  'client', 'dossier', 'lawsuit', 'task', 'session',
  'mission', 'officer', 'financial_entry', 'document', 'personal_task',
]);

const STRICT_MUTATION_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: Object.values(OPERATION_TYPES),
          },
          entityType: {
            type: 'string',
            enum: ENTITY_TYPE_ENUM,
          },
          payload: {
            type: 'object',
            additionalProperties: true,
          },
          reason: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
          },
        },
        required: ['op', 'entityType', 'payload', 'reason'],
        additionalProperties: false,
      },
    },
    idempotencyKey: {
      type: 'string',
      minLength: 8,
      maxLength: 200,
    },
    origin: {
      type: 'string',
      enum: ['chat', 'system'],
    },
    risk: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
  },
  required: ['operations', 'idempotencyKey', 'origin', 'risk'],
  additionalProperties: false,
};

const LEGACY_MUTATION_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: Object.values(OPERATION_TYPES),
    },
    params: {
      type: 'object',
      additionalProperties: true,
    },
  },
  required: ['operation', 'params'],
  additionalProperties: false,
};

const inputSchema = {
  oneOf: [STRICT_MUTATION_INPUT_SCHEMA, LEGACY_MUTATION_INPUT_SCHEMA],
};

const outputSchema = {
  anyOf: [
    {
      type: 'object',
      description: 'Action proposal for confirmation',
      properties: {
        proposalId: { type: 'string', minLength: 1 },
        actionType: { type: 'string', minLength: 1 },
        toolCategory: { type: 'string' },
        params: { type: 'object' },
        reversible: { type: 'boolean' },
        requiresConfirmation: { const: true },
        humanReadableSummary: { type: 'string' },
        affectedEntities: { type: 'array' },
        status: { type: 'string' },
        proposedAt: { type: 'string' },
        version: { type: 'string' },
        posture: { type: 'string' },
        blockedReason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        suggestedAlternative: { anyOf: [{ type: 'object' }, { type: 'null' }] },
        userMessageDraft: { type: 'string' },
        confirmation: { type: 'object' },
        sessionId: { type: 'string' },
        snapshot: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                scope: { type: 'string' },
                scopeId: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
                hash: { type: 'string' },
                timestamp: { type: 'string' },
              },
              required: ['scope', 'scopeId', 'hash', 'timestamp'],
              additionalProperties: false,
            },
          ],
        },
      },
      required: [
        'proposalId',
        'actionType',
        'toolCategory',
        'params',
        'reversible',
        'requiresConfirmation',
        'humanReadableSummary',
        'affectedEntities',
        'status',
        'proposedAt',
      ],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'entity_creation_form' },
        entityType: { type: 'string', minLength: 1 },
        prefilled: { type: 'object' },
        missingRequired: { type: 'array', items: { type: 'string', minLength: 1 } },
        parentSelection: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                mode: { type: 'string' },
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      entityType: { type: 'string', minLength: 1 },
                      id: { type: 'integer' },
                      label: { type: 'string', minLength: 1 },
                    },
                    required: ['entityType', 'id', 'label'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['mode', 'options'],
              additionalProperties: false,
            },
          ],
        },
      },
      required: ['type', 'entityType', 'prefilled', 'missingRequired'],
      additionalProperties: false,
    },
  ],
};

function _hashIdempotencySeed(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

function _recordLegacyNormalizationWarning(executionContext = {}, detail = {}) {
  const event = {
    type: 'universal_mutation_legacy_input_normalized',
    timestamp: new Date().toISOString(),
    ...detail,
  };
  if (executionContext?.ledger?.record) {
    executionContext.ledger.record(event);
    return;
  }
  try {
    console.warn('[universalMutation] legacy input normalized', event);
  } catch (_) {
    // best-effort logging only
  }
}

function _inferEntityTypeFromLegacyParams(params = {}) {
  return String(
    params?.entityType ||
      params?.target?.type ||
      params?.sourceType ||
      params?.targetType ||
      '',
  ).trim().toLowerCase() || null;
}

function _normalizeSingleOperationPayload({ op, entityType, payload }) {
  const normalizedPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? JSON.parse(JSON.stringify(payload))
      : {};
  const normalizedEntityType = String(entityType || '').trim().toLowerCase();

  if (
    normalizedEntityType &&
    op !== OPERATION_TYPES.LINK_ENTITIES &&
    op !== OPERATION_TYPES.ATTACH_TO_ENTITY &&
    !normalizedPayload.entityType
  ) {
    normalizedPayload.entityType = normalizedEntityType;
  }

  return normalizedPayload;
}

function normalizeUniversalMutationInput(rawInput = {}, executionContext = {}) {
  if (rawInput && Array.isArray(rawInput.operations)) {
    return {
      normalizedInput: {
        operations: rawInput.operations.map((op) => ({
          op: String(op.op || '').toUpperCase(),
          entityType: String(op.entityType || '').toLowerCase(),
          payload: _normalizeSingleOperationPayload({
            op: String(op.op || '').toUpperCase(),
            entityType: op.entityType,
            payload: op.payload,
          }),
          reason: String(op.reason || '').trim(),
        })),
        idempotencyKey: String(rawInput.idempotencyKey || ''),
        origin: String(rawInput.origin || '').toLowerCase(),
        risk: String(rawInput.risk || '').toLowerCase(),
      },
      legacyNormalized: false,
      warnings: [],
    };
  }

  const operation = String(rawInput?.operation || '').toUpperCase();
  const params = rawInput?.params && typeof rawInput.params === 'object' ? rawInput.params : {};
  const entityType = _inferEntityTypeFromLegacyParams(params);
  const reason =
    typeof params.reason === 'string' && params.reason.trim()
      ? params.reason.trim()
      : '[legacy caller: no reason provided]';
  const idempotencyKey = `legacy_${_hashIdempotencySeed(`${operation}:${JSON.stringify(params)}`)}`;

  _recordLegacyNormalizationWarning(executionContext, {
    operation,
    entityType,
    sourceRoute: executionContext?.sourceRoute || null,
  });

  return {
    normalizedInput: {
      operations: [
        {
          op: operation,
          entityType: entityType || 'document',
          payload: _normalizeSingleOperationPayload({ op: operation, entityType, payload: params }),
          reason,
        },
      ],
      idempotencyKey,
      origin: 'system',
      risk: 'medium',
    },
    legacyNormalized: true,
    warnings: ['legacy_input_normalized'],
  };
}

function _deriveEntityRefFromPayload(op) {
  const payload = op?.payload && typeof op.payload === 'object' ? op.payload : {};
  if (Number.isInteger(Number(payload.entityId)) && Number(payload.entityId) > 0) {
    return { type: String(op.entityType || '').toLowerCase(), id: Number(payload.entityId) };
  }
  if (payload?.target && payload.target.type && Number.isInteger(Number(payload.target.id)) && Number(payload.target.id) > 0) {
    return { type: String(payload.target.type).toLowerCase(), id: Number(payload.target.id) };
  }
  if (payload?.sourceType && Number.isInteger(Number(payload.sourceId)) && Number(payload.sourceId) > 0) {
    return { type: String(payload.sourceType).toLowerCase(), id: Number(payload.sourceId) };
  }
  return null;
}

function buildEntityCreationFormArtifact({
  entityType,
  prefilled = {},
  missingRequired = [],
  parentSelection = null,
}) {
  return {
    type: 'entity_creation_form',
    entityType: String(entityType || '').toLowerCase(),
    prefilled:
      prefilled && typeof prefilled === 'object' && !Array.isArray(prefilled)
        ? prefilled
        : {},
    missingRequired: Array.isArray(missingRequired)
      ? Array.from(new Set(missingRequired.map((field) => String(field || '').trim()).filter(Boolean)))
      : [],
    parentSelection:
      parentSelection && typeof parentSelection === 'object' ? parentSelection : null,
  };
}

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
async function buildSingleOperationProposal(input, executionContext = {}) {
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

      const scopeBinding = bindMutationScope({
        entityType,
        payload,
        activeScope: executionContext,
      });
      params.payload = scopeBinding.boundPayload;
      const boundLabels = resolveBoundFromScopeLabels(scopeBinding.boundFromScope);
      const hierarchicalBinding = applyHierarchicalScopeBinding({
        entityType,
        payload: params.payload,
        activeScope: executionContext,
      });
      params.payload = hierarchicalBinding.preparedPayload;
      if (hierarchicalBinding.status === 'needs_parent_input') {
        return buildEntityCreationFormArtifact({
          entityType,
          prefilled: params.payload,
          missingRequired: hierarchicalBinding.missingParentFields,
          parentSelection: hierarchicalBinding.parentSelection,
        });
      }
      if (
        Array.isArray(scopeBinding.missingRequired) &&
        scopeBinding.missingRequired.length > 0 &&
        !['task', 'session', 'mission', 'financial_entry', 'lawsuit'].includes(String(entityType || '').toLowerCase())
      ) {
        throw buildScopeBindingRequiredError({
          entityType,
          missingRequired: scopeBinding.missingRequired,
          boundLabels,
        });
      }

      const governance = validateAndPrepareFields({
        entityType,
        payload: params.payload,
        activeScope: {
          ...(executionContext && typeof executionContext === 'object' ? executionContext : {}),
        },
      });
      params.payload = governance.preparedPayload;
      if (governance.status === 'needs_input') {
        return buildEntityCreationFormArtifact({
          entityType,
          prefilled: params.payload,
          missingRequired: governance.missingCriticalFields,
        });
      }

      // Validate payload after deterministic governance normalization.
      validatePayload(entityType, 'create', params.payload);

      // No snapshot needed for creation (entity doesn't exist yet)
      snapshot = null;

      const displayName = pickDisplayValue(params.payload || {});
      actionSummary = displayName
        ? `Create ${toDisplayEntityName(entityType)}: ${displayName}`
        : `Create selected ${toDisplayEntityName(entityType)}${summarizeMutationFields(params.payload)}`;
      if (boundLabels.length > 0) {
        actionSummary = `${actionSummary} (${boundLabels.join(", ")})`;
      }

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

      const display = resolveEntityDisplay(entityType, entityId);
      actionSummary = `Update ${display?.label || `selected ${toDisplayEntityName(entityType)}`}${summarizeMutationFields(changes)}`;

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

      const display = resolveEntityDisplay(entityType, entityId);
      actionSummary = `Delete ${display?.label || `selected ${toDisplayEntityName(entityType)}`}`;

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

      const sourceDisplay = resolveEntityDisplay(sourceType, sourceId);
      const targetDisplay = resolveEntityDisplay(targetType, targetId);
      if (linkMode === LINK_MODES.REMOVE) {
        actionSummary = `Remove ${toDisplayEntityName(targetType)} link from ${sourceDisplay?.label || `selected ${toDisplayEntityName(sourceType)}`}`;
      } else {
        actionSummary = `Link ${sourceDisplay?.label || `selected ${toDisplayEntityName(sourceType)}`} to ${targetDisplay?.label || `selected ${toDisplayEntityName(targetType)}`}`;
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
      if (!attachmentType || !payload) {
        throw new Error('ATTACH_TO_ENTITY requires attachmentType and payload');
      }

      const scopeBinding = bindMutationScope({
        entityType: 'document_attach',
        payload: { target, ...(payload && typeof payload === 'object' ? { payload } : {}) },
        activeScope: executionContext,
      });
      const boundTarget = scopeBinding.boundPayload?.target || target;
      if (!boundTarget || !boundTarget.type || !boundTarget.id) {
        throw buildScopeBindingRequiredError({
          entityType: 'document',
          missingRequired: scopeBinding.missingRequired,
          boundLabels: resolveBoundFromScopeLabels(scopeBinding.boundFromScope),
        });
      }
      params.target = boundTarget;

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
        const canonicalFormat = payload.canonicalFormat || payload.format;
        if (!payload.documentType || !payload.templateKey || !payload.language || !canonicalFormat) {
          throw new Error('generated_document attachment requires payload.documentType, templateKey, language, and canonicalFormat');
        }
        if (!payload.schemaVersion || !payload.contentJson) {
          throw new Error('generated_document attachment requires payload.schemaVersion and contentJson');
        }
        payload.canonicalFormat = canonicalFormat;
        payload.format = canonicalFormat;
      }

      // Compute snapshot hash of target entity
      const attachHash = computeSnapshotHash(params.target.type, params.target.id);
      snapshot = {
        scope: params.target.type,
        scopeId: params.target.id,
        hash: attachHash,
        timestamp: new Date().toISOString(),
      };

      const display = resolveEntityDisplay(params.target.type, params.target.id);
      const targetLabel = display?.label || `selected ${toDisplayEntityName(params.target.type)}`;
      params.target = {
        ...params.target,
        label: targetLabel,
        reference: display?.reference || params.target.reference || null,
      };

      actionSummary = `Attach ${attachmentType} to ${targetLabel}`;
      reversible = true; // Attachments like notes can be deleted

      affectedEntities = [
        {
          type: params.target.type,
          id: params.target.id,
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

function _buildBatchWorkflowProposal({ normalizedInput, executionContext = {} }) {
  const operations = Array.isArray(normalizedInput?.operations) ? normalizedInput.operations : [];
  if (operations.length < 2) {
    throw new Error('Batch workflow proposal requires at least 2 operations');
  }

  const steps = operations.map((op, index) => ({
    stepId: `step_${index + 1}`,
    actionType: String(op.op || '').toUpperCase(),
    params: _normalizeSingleOperationPayload({
      op: String(op.op || '').toUpperCase(),
      entityType: op.entityType,
      payload: op.payload,
    }),
    risk: normalizedInput.risk || 'medium',
    reason: String(op.reason || '').trim(),
  }));

  const rootRef = operations.map(_deriveEntityRefFromPayload).find(Boolean) || null;
  const workflow = {
    workflowType: 'UNIVERSAL_MUTATION_BATCH',
    rootEntity: rootRef ? { type: rootRef.type, id: rootRef.id } : null,
    steps,
    requestedGoal: {
      operation: String(operations[operations.length - 1]?.op || '').toLowerCase(),
      entityType: String(operations[operations.length - 1]?.entityType || '').toLowerCase(),
    },
    canReachRequestedGoal: true,
    facts: {
      idempotencyKey: normalizedInput.idempotencyKey,
      origin: normalizedInput.origin,
      risk: normalizedInput.risk,
    },
  };

  let snapshot = null;
  if (rootRef?.type && Number.isInteger(Number(rootRef.id)) && Number(rootRef.id) > 0) {
    snapshot = {
      scope: rootRef.type,
      scopeId: Number(rootRef.id),
      hash: computeSnapshotHash(rootRef.type, Number(rootRef.id)),
      timestamp: new Date().toISOString(),
    };
  }

  const proposalId = generateProposalId('EXECUTE_MUTATION_WORKFLOW', 'v3');
  const affectedEntities = operations.map((op) => {
    const ref = _deriveEntityRefFromPayload(op);
    return {
      type: String(op.entityType || '').toLowerCase(),
      id: ref?.id || null,
      operation: String(op.op || '').toLowerCase(),
    };
  });

  const summary = `Execute ${operations.length} mutation steps (${operations
    .map((op) => String(op.op || '').toLowerCase())
    .join(', ')})`;

  return createActionProposal({
    proposalId,
    actionType: 'EXECUTE_MUTATION_WORKFLOW',
    toolCategory: 'execute',
    params: {
      workflow,
      idempotencyKey: normalizedInput.idempotencyKey,
      origin: normalizedInput.origin,
      risk: normalizedInput.risk,
    },
    reversible: false,
    requiresConfirmation: true,
    humanReadableSummary: summary,
    affectedEntities,
    status: ACTION_STATUS.PROPOSED,
    version: 'v3',
    posture: 'WORK',
    snapshot,
    sessionId: executionContext.sessionId || null,
  });
}

/**
 * Universal mutation handler
 *
 * Accepts strict `operations[]` input and temporarily normalizes legacy
 * `{ operation, params }` callers during migration.
 */
async function handler(input, executionContext = {}) {
  const { normalizedInput } = normalizeUniversalMutationInput(input, executionContext);
  const operations = Array.isArray(normalizedInput?.operations) ? normalizedInput.operations : [];

  if (!operations.length) {
    const err = new Error('At least one mutation operation is required');
    err.code = 'MUTATION_OPERATIONS_REQUIRED';
    throw err;
  }

  for (const op of operations) {
    if (!OPERATION_TYPES[String(op?.op || '').toUpperCase()]) {
      const err = new Error(`Invalid operation type: ${op?.op || 'UNKNOWN'}`);
      err.code = 'INVALID_MUTATION_OPERATION';
      throw err;
    }
    if (typeof op.reason !== 'string' || !op.reason.trim()) {
      const err = new Error('Each mutation operation requires a non-empty reason');
      err.code = 'MUTATION_REASON_REQUIRED';
      throw err;
    }
    if (!ENTITY_TABLE_BY_TYPE[String(op.entityType || '').toLowerCase()]) {
      const err = new Error(`Unsupported entity type for mutation: ${op.entityType || 'UNKNOWN'}`);
      err.code = 'UNSUPPORTED_MUTATION_ENTITY_TYPE';
      throw err;
    }
  }

  if (operations.length > 1) {
    return _buildBatchWorkflowProposal({ normalizedInput, executionContext });
  }

  const single = operations[0];
  return buildSingleOperationProposal(
    {
      operation: String(single.op || '').toUpperCase(),
      params: _normalizeSingleOperationPayload({
        op: String(single.op || '').toUpperCase(),
        entityType: single.entityType,
        payload: single.payload,
      }),
    },
    executionContext,
  );
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
