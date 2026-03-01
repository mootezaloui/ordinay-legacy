"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DocumentFormat,
  DocumentOutputFormatPreference,
  chooseOutputFormats,
} = require("./documentFormatGovernance");

test("chooseOutputFormats: auto + table artifact => xlsx canonical", () => {
  const result = chooseOutputFormats({
    preference: DocumentOutputFormatPreference.AUTO,
    artifactKind: "table",
    structureHints: {
      hasTabularData: false,
      requiresEditing: false,
      intendedForFiling: false,
    },
  });
  assert.equal(result.canonicalFormat, DocumentFormat.XLSX);
});

test("chooseOutputFormats: auto + requiresEditing => docx canonical", () => {
  const result = chooseOutputFormats({
    preference: DocumentOutputFormatPreference.AUTO,
    artifactKind: "document",
    structureHints: {
      hasTabularData: false,
      requiresEditing: true,
      intendedForFiling: false,
    },
  });
  assert.equal(result.canonicalFormat, DocumentFormat.DOCX);
});

test("chooseOutputFormats: auto default => pdf canonical", () => {
  const result = chooseOutputFormats({
    preference: DocumentOutputFormatPreference.AUTO,
    artifactKind: "document",
    structureHints: {
      hasTabularData: false,
      requiresEditing: false,
      intendedForFiling: false,
    },
  });
  assert.equal(result.canonicalFormat, DocumentFormat.PDF);
});

test("chooseOutputFormats: explicit canonical preference overrides auto signals", () => {
  for (const preference of [DocumentFormat.PDF, DocumentFormat.DOCX, DocumentFormat.XLSX]) {
    const result = chooseOutputFormats({
      preference,
      artifactKind: "table",
      structureHints: {
        hasTabularData: true,
        requiresEditing: true,
        intendedForFiling: false,
      },
    });
    assert.equal(result.canonicalFormat, preference);
    assert.equal(result.selectionMode, "preference");
  }
});

test("chooseOutputFormats: html preference falls back to pdf with warning", () => {
  const result = chooseOutputFormats({
    preference: DocumentOutputFormatPreference.HTML,
    artifactKind: "document",
    structureHints: {
      hasTabularData: false,
      requiresEditing: false,
      intendedForFiling: true,
    },
  });
  assert.equal(result.canonicalFormat, DocumentFormat.PDF);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.length > 0);
});

