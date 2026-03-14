"use strict";

const assert = require("node:assert/strict");

function assertTurnType(result, expectedTurnType) {
  assert.equal(
    normalizeOptionalString(result?.output?.turnType),
    normalizeOptionalString(expectedTurnType),
    `Expected turn type "${expectedTurnType}"`,
  );
}

function assertHasPendingAction(result) {
  const hasPending =
    Boolean(result?.output?.pendingAction) ||
    Boolean(result?.session?.state?.pendingAction) ||
    Boolean(findSseEvent(result, "pending"));
  assert.equal(hasPending, true, "Expected pending action to be present");
}

function assertNoPendingAction(result) {
  const hasPending =
    Boolean(result?.output?.pendingAction) ||
    Boolean(result?.session?.state?.pendingAction) ||
    Boolean(findSseEvent(result, "pending"));
  assert.equal(hasPending, false, "Expected pending action to be absent");
}

function assertToolCallCount(result, expectedCount) {
  const actualCount = Array.isArray(result?.output?.toolCalls)
    ? result.output.toolCalls.length
    : Array.isArray(result?.capturedLoopOutput?.toolCalls)
      ? result.capturedLoopOutput.toolCalls.length
      : 0;
  assert.equal(actualCount, Number(expectedCount), `Expected ${expectedCount} tool calls`);
}

function assertMetadataField(result, fieldPath, expectedValue) {
  const source =
    result?.output?.metadata ||
    result?.capturedLoopOutput?.metadata ||
    result?.derived?.metadata ||
    {};
  const actual = getByPath(source, fieldPath);
  assert.deepEqual(actual, expectedValue, `Metadata field mismatch at "${fieldPath}"`);
}

function assertCitationPresence(result, shouldBePresent) {
  const responseText = normalizeOptionalString(
    result?.output?.responseText ||
      result?.derived?.responseText ||
      result?.capturedLoopOutput?.responseText,
  );
  const citations = result?.output?.metadata?.citations || result?.capturedLoopOutput?.metadata?.citations;
  const citationText = normalizeOptionalString(citations?.text);
  const hasVisibleCitation =
    (citationText && responseText.includes(citationText)) ||
    /\[\d+\]/.test(responseText) ||
    /sources?/i.test(responseText);
  assert.equal(
    hasVisibleCitation,
    Boolean(shouldBePresent),
    `Expected citation presence to be ${Boolean(shouldBePresent)}`,
  );
}

function assertClarificationTriggered(result) {
  const uxDecision =
    result?.output?.metadata?.uxDecision ||
    result?.capturedLoopOutput?.metadata?.uxDecision ||
    {};
  const action = normalizeOptionalString(uxDecision.action);
  if (action === "ask" || action === "offer_choices") {
    return;
  }
  const text = normalizeOptionalString(result?.derived?.responseText || result?.output?.responseText);
  assert.match(text, /\?|which|clarify|specify/i, "Expected clarification-oriented response");
}

function assertFailureType(result, expectedType) {
  const actual =
    normalizeOptionalString(result?.failure?.type) ||
    normalizeOptionalString(result?.comparison?.actualFailureType) ||
    normalizeOptionalString(result?.output?.metadata?.failure?.type) ||
    normalizeOptionalString(result?.capturedLoopOutput?.metadata?.failure?.type);
  assert.equal(actual, normalizeOptionalString(expectedType), `Expected failure type "${expectedType}"`);
}

function getByPath(object, fieldPath) {
  const pathParts = String(fieldPath || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let pointer = object;
  for (const part of pathParts) {
    if (pointer == null || typeof pointer !== "object") {
      return undefined;
    }
    pointer = pointer[part];
  }
  return pointer;
}

function findSseEvent(result, eventName) {
  const events = Array.isArray(result?.events) ? result.events : [];
  return events.find((event) => event?.event === eventName) || null;
}

function normalizeOptionalString(value) {
  return String(value ?? "").trim();
}

module.exports = {
  assertTurnType,
  assertHasPendingAction,
  assertNoPendingAction,
  assertToolCallCount,
  assertMetadataField,
  assertCitationPresence,
  assertClarificationTriggered,
  assertFailureType,
};

