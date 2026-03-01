"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseFinalOutputContract } = require("./output.contract");

test("output contract: document metadata with artifactKind and structureHints parses", () => {
  const payload = {
    outputType: "document",
    title: "Draft Table",
    content: "Body",
    metadata: {
      artifactKind: "table",
      storageHint: "dossier",
      structureHints: {
        hasTabularData: true,
        requiresEditing: false,
        intendedForFiling: false,
      },
    },
  };
  const parsed = parseFinalOutputContract(JSON.stringify(payload));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.contract.metadata.artifactKind, "table");
  assert.equal(parsed.contract.metadata.storageHint, "dossier");
  assert.equal(parsed.contract.metadata.structureHints.hasTabularData, true);
});

test("output contract: missing document signals default deterministically", () => {
  const payload = {
    outputType: "document",
    content: "Body",
    metadata: {},
  };
  const parsed = parseFinalOutputContract(JSON.stringify(payload));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.contract.metadata.artifactKind, "document");
  assert.deepEqual(parsed.contract.metadata.structureHints, {
    hasTabularData: false,
    requiresEditing: false,
    intendedForFiling: false,
  });
  assert.equal(parsed.contract.metadata.storageHint, "inherit");
  assert.ok(Array.isArray(parsed.contract.metadata._outputContractWarnings));
  assert.ok(parsed.contract.metadata._outputContractWarnings.length > 0);
});

test("output contract: invalid document signal shapes normalize with warnings", () => {
  const payload = {
    outputType: "document",
    content: "Body",
    metadata: {
      artifactKind: "invalid_kind",
      storageHint: "invalid_hint",
      structureHints: "not-an-object",
    },
  };
  const parsed = parseFinalOutputContract(JSON.stringify(payload));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.contract.metadata.artifactKind, "document");
  assert.deepEqual(parsed.contract.metadata.structureHints, {
    hasTabularData: false,
    requiresEditing: false,
    intendedForFiling: false,
  });
  assert.equal(parsed.contract.metadata.storageHint, "inherit");
  assert.ok(Array.isArray(parsed.contract.metadata._outputContractWarnings));
  assert.ok(parsed.contract.metadata._outputContractWarnings.length > 0);
});
