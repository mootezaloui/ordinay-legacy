"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildMutationEventsFromExecution,
  emitEntityMutationEventsFromExecution,
  subscribeEntityMutationSuccess,
} = require("./entityMutationEvents");

test("emits ENTITY_MUTATION_SUCCESS for agent-created task with scope", () => {
  const events = buildMutationEventsFromExecution({
    proposal: {
      actionType: "CREATE_ENTITY",
      params: {
        entityType: "task",
        payload: {
          dossier_id: 42,
          title: "Call client",
        },
      },
    },
    executionResult: {
      executedActions: [
        {
          actionType: "CREATE_ENTITY",
          result: {
            ok: true,
            entityType: "task",
            entityId: 101,
            createdRow: {
              id: 101,
              dossier_id: 42,
            },
          },
        },
      ],
    },
    sessionId: "session-task-create",
    source: "agent",
  });

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: "ENTITY_MUTATION_SUCCESS",
    entityType: "task",
    entityId: 101,
    operation: "create",
    scope: {
      clientId: undefined,
      dossierId: 42,
      lawsuitId: undefined,
      parentEntityType: undefined,
      parentEntityId: undefined,
    },
    sessionId: "session-task-create",
    source: "agent",
    timestamp: events[0].timestamp,
  });
});

test("publishes workflow step events to subscribers", () => {
  const received = [];
  const unsubscribe = subscribeEntityMutationSuccess((event) => {
    received.push(event);
  });

  emitEntityMutationEventsFromExecution({
    proposal: {
      actionType: "EXECUTE_MUTATION_WORKFLOW",
      params: {},
    },
    executionResult: {
      executedActions: [
        {
          actionType: "EXECUTE_MUTATION_WORKFLOW",
          result: {
            ok: true,
            stepResults: [
              {
                ok: true,
                actionType: "CREATE_ENTITY",
                result: {
                  ok: true,
                  entityType: "task",
                  entityId: 302,
                  createdRow: { id: 302, lawsuit_id: 77 },
                },
              },
            ],
          },
        },
      ],
    },
    sessionId: "workflow-session",
    source: "agent",
  });

  unsubscribe();
  assert.equal(received.length, 1);
  assert.equal(received[0].entityType, "task");
  assert.equal(received[0].entityId, 302);
  assert.equal(received[0].scope.lawsuitId, 77);
});
