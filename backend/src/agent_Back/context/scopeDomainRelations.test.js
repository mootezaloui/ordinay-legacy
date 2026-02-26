"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getRequiredBindingSlots,
  getCompatibleParentTypes,
  getPayloadFieldForParent,
  isScopeCompatibleForSlot,
} = require("./scopeDomainRelations");

test("create task requires parent slot and supports dossier/lawsuit", () => {
  const slots = getRequiredBindingSlots({ operation: "create", entityType: "task" });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].kind, "parent");
  assert.deepEqual(getCompatibleParentTypes({ childEntityType: "task", operation: "create" }), [
    "dossier",
    "lawsuit",
  ]);
  assert.equal(
    getPayloadFieldForParent({ childEntityType: "task", parentEntityType: "dossier" }),
    "dossier_id",
  );
  assert.equal(
    getPayloadFieldForParent({ childEntityType: "task", parentEntityType: "lawsuit" }),
    "lawsuit_id",
  );
});

test("lawsuit accepts client parent hint with no direct payload fk mapping", () => {
  assert.equal(
    getPayloadFieldForParent({ childEntityType: "lawsuit", parentEntityType: "client" }),
    null,
  );
  const slot = getRequiredBindingSlots({ operation: "create", entityType: "lawsuit" })[0];
  const compat = isScopeCompatibleForSlot({
    slot,
    activeScope: { entityType: "client", entityId: 1 },
  });
  assert.equal(compat.compatible, true);
});

test("incompatible scope type is rejected deterministically", () => {
  const slot = getRequiredBindingSlots({ operation: "create", entityType: "dossier" })[0];
  const compat = isScopeCompatibleForSlot({
    slot,
    activeScope: { entityType: "mission", entityId: 22 },
  });
  assert.equal(compat.compatible, false);
  assert.equal(compat.reasonCode, "scope_parent_type_incompatible");
});

