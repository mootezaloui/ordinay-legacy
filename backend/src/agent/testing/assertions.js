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

function assertSseEvents(result, spec) {
  const rules = isRecord(spec) ? spec : {};
  const events = Array.isArray(result?.events) ? result.events : [];
  const names = events.map((event) => String(event?.event || "").trim()).filter(Boolean);

  const includes = Array.isArray(rules.includes) ? rules.includes : [];
  for (const expected of includes) {
    const eventName = normalizeOptionalString(expected);
    assert.equal(
      names.includes(eventName),
      true,
      `Expected SSE event "${eventName}" to be present`,
    );
  }

  const excludes = Array.isArray(rules.excludes) ? rules.excludes : [];
  for (const forbidden of excludes) {
    const eventName = normalizeOptionalString(forbidden);
    assert.equal(
      names.includes(eventName),
      false,
      `Expected SSE event "${eventName}" to be absent`,
    );
  }

  const ordered = Array.isArray(rules.ordered) ? rules.ordered : [];
  if (ordered.length > 0) {
    let cursor = -1;
    for (const orderedEvent of ordered) {
      const eventName = normalizeOptionalString(orderedEvent);
      const nextIndex = names.findIndex((name, index) => index > cursor && name === eventName);
      assert.ok(
        nextIndex > cursor,
        `Expected SSE event "${eventName}" after index ${cursor}. Got sequence: ${names.join(", ")}`,
      );
      cursor = nextIndex;
    }
  }

  const counts = isRecord(rules.counts) ? rules.counts : {};
  for (const [name, expectedCountRaw] of Object.entries(counts)) {
    const expectedCount = Number(expectedCountRaw);
    if (!Number.isFinite(expectedCount)) {
      continue;
    }
    const actualCount = names.filter((eventName) => eventName === name).length;
    assert.equal(
      actualCount,
      expectedCount,
      `Expected SSE event "${name}" count to be ${expectedCount}, got ${actualCount}`,
    );
  }
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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  assertSseEvents,
};
