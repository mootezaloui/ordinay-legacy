"use strict";

const assert = require("assert");
const pendingOperation = require("./pendingOperation");
const OperationalContextStore = require("../context/operational.context");

function buildEngine() {
  const ledgerEvents = [];
  const operational = new OperationalContextStore();
  const engine = {
    contextStore: { _operationalStore: operational },
    ledger: {
      record(event) {
        ledgerEvents.push(event);
        return event;
      },
    },
    _resolvePolicy() {
      return { version: "v3" };
    },
    async resolveEntity({ entityType, identifier, mode }) {
      if (entityType === "dossier" && String(identifier).toUpperCase() === "DOS-2026-001") {
        return {
          found: true,
          entityType: "dossier",
          entityId: 42,
          entityLabel: "DOS-2026-001",
        };
      }
      if (mode === "id" && Number(identifier) === 42) {
        return {
          found: true,
          entityType,
          entityId: 42,
          entityLabel: `${entityType} #42`,
        };
      }
      return { found: false, reason: "not_found" };
    },
  };

  Object.assign(engine, pendingOperation);
  return { engine, ledgerEvents };
}

async function testPendingLifecycle() {
  const { engine, ledgerEvents } = buildEngine();
  const requestContext = { conversationId: "c1", userId: "u1" };

  const created = engine.beginPendingOperation(requestContext, {
    operationType: "document_generation",
    originalIntent: "DOCUMENT_GENERATION",
    originalMessage: "Generate letter",
    policyVersion: "v3",
    requiredBindings: [{ entityType: "dossier", resolverStrategy: "reference_or_name" }],
    executionDescriptor: { resumeType: "document_generation_preview", generationRequest: {} },
  });

  assert.ok(created.id);
  assert.strictEqual(created.status, "awaiting_resolution");
  assert.strictEqual(engine.getPendingOperation(requestContext).id, created.id);

  const updated = await engine.applyResolutionInput(
    requestContext,
    "DOS-2026-001",
    null,
  );
  assert.ok(updated);
  assert.strictEqual(engine.canResumePendingOperation(updated), true);
  assert.strictEqual(updated.resolvedBindings.dossier.id, 42);

  const resumed = await engine.resumePendingOperation(requestContext, {
    document_generation: async ({ executionDescriptor }) => ({
      intent: "DOCUMENT_GENERATION",
      output: { type: "document_generation_preview", targetEntity: executionDescriptor.target },
    }),
  });
  assert.ok(resumed);
  assert.strictEqual(engine.getPendingOperation(requestContext), null);

  const clearNoop = engine.clearPendingOperation(requestContext, "manual");
  assert.strictEqual(clearNoop, null);

  const eventTypes = ledgerEvents.map((event) => event.type);
  assert.ok(eventTypes.includes("pending_operation_created"));
  assert.ok(eventTypes.includes("pending_operation_binding_updated"));
  assert.ok(eventTypes.includes("pending_operation_resumed"));
  assert.ok(eventTypes.includes("pending_operation_cleared"));
}

async function run() {
  await testPendingLifecycle();
  console.log("pendingOperation tests passed");
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };

