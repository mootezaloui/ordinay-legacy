"use strict";

const assert = require("assert");

function assertSequence(events) {
  const eventNames = events.map((e) => e.type);
  const startIdx = eventNames.indexOf("turn.start");
  const intentTerminal = Math.max(
    eventNames.indexOf("intent.final"),
    eventNames.indexOf("intent.failed"),
  );
  const artifactTerminal = Math.max(
    eventNames.indexOf("artifact.final"),
    eventNames.indexOf("artifact.failed"),
  );
  const commentaryTerminal = Math.max(
    eventNames.indexOf("commentary.final"),
    eventNames.indexOf("commentary.failed"),
  );
  const endIdx = eventNames.indexOf("turn.end");

  assert(startIdx >= 0, "turn.start missing");
  assert(intentTerminal > startIdx, "intent terminal event missing or out of order");
  assert(artifactTerminal > intentTerminal, "artifact terminal event missing or out of order");
  assert(commentaryTerminal > artifactTerminal, "commentary terminal event missing or out of order");
  assert(endIdx > commentaryTerminal, "turn.end missing or out of order");
}

assertSequence([
  { type: "turn.start" },
  { type: "intent.delta" },
  { type: "intent.final" },
  { type: "artifact.delta" },
  { type: "artifact.final" },
  { type: "commentary.delta" },
  { type: "commentary.final" },
  { type: "turn.end" },
]);

assertSequence([
  { type: "turn.start" },
  { type: "intent.failed" },
  { type: "artifact.failed" },
  { type: "commentary.failed" },
  { type: "turn.end" },
]);

console.log("streaming.sequence.test passed");
