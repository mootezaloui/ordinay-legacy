"use strict";

const assert = require("assert");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const envelopeSchema = require("./schemas/event-envelope.schema.json");
const intentSchema = require("./schemas/intent.schema.json");
const commentarySchema = require("./schemas/commentary.schema.json");
const failureSchema = require("./schemas/failure.schema.json");

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const validateEnvelope = ajv.compile(envelopeSchema);
const validateIntent = ajv.compile(intentSchema);
const validateCommentary = ajv.compile(commentarySchema);
const validateFailure = ajv.compile(failureSchema);

const now = new Date().toISOString();
const envelope = {
  eventId: "evt_1",
  turnId: "turn_1",
  seq: 1,
  type: "intent.final",
  timestamp: now,
  payload: {
    kind: "intent",
    summary: "Got it — you want me to review this dossier.",
    contextEcho: "قضية طلاق زوجية",
    nextQuestion: null,
  },
};
assert.strictEqual(validateEnvelope(envelope), true, "Envelope must validate");
assert.strictEqual(validateIntent(envelope.payload), true, "Intent payload must validate");

const commentary = {
  kind: "commentary",
  lines: ["I found 3 dossiers that match your request."],
  options: [
    { label: "DOS-2026-4512", value: "dossier-4512" },
    { label: "DOS-2025-8831", value: "dossier-8831" },
  ],
  question: "Which one do you mean?",
};
assert.strictEqual(validateCommentary(commentary), true, "Commentary payload must validate");

const failure = {
  stage: "commentary",
  code: "COMMENTARY_SCHEMA_INVALID",
  message: "Payload invalid",
  retryable: false,
  details: {},
};
assert.strictEqual(validateFailure(failure), true, "Failure payload must validate");

console.log("streaming.contract.test passed");
