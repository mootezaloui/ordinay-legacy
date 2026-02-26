"use strict";

/**
 * Centralized compatibility rules for conversation scope binding.
 *
 * This file intentionally consolidates child->parent and target slot rules so
 * scope-driven binding decisions are not scattered across detector/chat code.
 * It is used by conversationScopeManager and may be reused by other mutation
 * orchestration helpers.
 */

const CREATE_PARENT_RULES = Object.freeze({
  dossier: Object.freeze({
    slot: "parent",
    compatibleParentTypes: Object.freeze(["client"]),
    payloadFieldByParentType: Object.freeze({
      client: "client_id",
    }),
  }),
  lawsuit: Object.freeze({
    slot: "parent",
    compatibleParentTypes: Object.freeze(["dossier", "client"]),
    payloadFieldByParentType: Object.freeze({
      dossier: "dossier_id",
      // client is a valid conversational parent hint, but not a direct FK;
      // legacy deterministic enrichment may remap client -> dossier.
      client: null,
    }),
  }),
  task: Object.freeze({
    slot: "parent",
    compatibleParentTypes: Object.freeze(["dossier", "lawsuit"]),
    payloadFieldByParentType: Object.freeze({
      dossier: "dossier_id",
      lawsuit: "lawsuit_id",
    }),
  }),
  session: Object.freeze({
    slot: "parent",
    compatibleParentTypes: Object.freeze(["dossier", "lawsuit"]),
    payloadFieldByParentType: Object.freeze({
      dossier: "dossier_id",
      lawsuit: "lawsuit_id",
    }),
  }),
  mission: Object.freeze({
    slot: "parent",
    compatibleParentTypes: Object.freeze(["dossier", "lawsuit"]),
    payloadFieldByParentType: Object.freeze({
      dossier: "dossier_id",
      lawsuit: "lawsuit_id",
    }),
  }),
  financial_entry: Object.freeze({
    slot: "parent",
    compatibleParentTypes: Object.freeze(["client", "dossier", "lawsuit", "mission", "task", "personal_task"]),
    payloadFieldByParentType: Object.freeze({
      client: "client_id",
      dossier: "dossier_id",
      lawsuit: "lawsuit_id",
      mission: "mission_id",
      task: "task_id",
      personal_task: "personal_task_id",
    }),
  }),
  document: Object.freeze({
    slot: "parent",
    compatibleParentTypes: Object.freeze([
      "client",
      "dossier",
      "lawsuit",
      "mission",
      "task",
      "session",
      "personal_task",
      "financial_entry",
      "officer",
    ]),
    payloadFieldByParentType: Object.freeze({
      client: "client_id",
      dossier: "dossier_id",
      lawsuit: "lawsuit_id",
      mission: "mission_id",
      task: "task_id",
      session: "session_id",
      personal_task: "personal_task_id",
      financial_entry: "financial_entry_id",
      officer: "officer_id",
    }),
  }),
});

function _normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function getRequiredBindingSlots({ operation, entityType, actionType } = {}) {
  const normalizedActionType = _normalize(actionType);
  const normalizedOperation = _normalize(operation);
  const normalizedEntityType = _normalize(entityType);

  // detector proposalInput uses operation=create/update/delete
  if (normalizedOperation === "create" && CREATE_PARENT_RULES[normalizedEntityType]) {
    return [{ kind: "parent", entityType: normalizedEntityType, rule: CREATE_PARENT_RULES[normalizedEntityType] }];
  }

  // universal mutation ATTACH_TO_ENTITY needs target binding when used elsewhere
  if (normalizedActionType === "attach_to_entity") {
    return [{ kind: "target", entityType: normalizedEntityType || null, rule: null }];
  }

  return [];
}

function getCompatibleParentTypes({ childEntityType, operation = "create" } = {}) {
  if (_normalize(operation) !== "create") return [];
  const rule = CREATE_PARENT_RULES[_normalize(childEntityType)];
  return rule ? [...rule.compatibleParentTypes] : [];
}

function getPayloadFieldForParent({ childEntityType, parentEntityType } = {}) {
  const rule = CREATE_PARENT_RULES[_normalize(childEntityType)];
  if (!rule) return null;
  return rule.payloadFieldByParentType[_normalize(parentEntityType)] || null;
}

function isScopeCompatibleForSlot({ slot, activeScope } = {}) {
  if (!slot || !activeScope || typeof activeScope !== "object") {
    return { compatible: false, reasonCode: "missing_slot_or_scope", compatibilityRule: null };
  }

  if (slot.kind === "parent") {
    const activeType = _normalize(activeScope.entityType);
    const compatible = Array.isArray(slot.rule?.compatibleParentTypes)
      ? slot.rule.compatibleParentTypes.includes(activeType)
      : false;
    return {
      compatible,
      reasonCode: compatible ? "scope_parent_type_compatible" : "scope_parent_type_incompatible",
      compatibilityRule: {
        slotKind: "parent",
        childEntityType: _normalize(slot.entityType),
        compatibleParentTypes: [...(slot.rule?.compatibleParentTypes || [])],
      },
    };
  }

  if (slot.kind === "target") {
    return {
      compatible: Boolean(activeScope.entityType && Number(activeScope.entityId) > 0),
      reasonCode: Boolean(activeScope.entityType && Number(activeScope.entityId) > 0)
        ? "scope_target_available"
        : "scope_target_missing",
      compatibilityRule: {
        slotKind: "target",
      },
    };
  }

  return { compatible: false, reasonCode: "unsupported_slot_kind", compatibilityRule: null };
}

module.exports = {
  CREATE_PARENT_RULES,
  getRequiredBindingSlots,
  getCompatibleParentTypes,
  getPayloadFieldForParent,
  isScopeCompatibleForSlot,
};

