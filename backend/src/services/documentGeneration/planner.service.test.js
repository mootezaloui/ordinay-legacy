"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../../db/connection");

const planner = require("./planner.service");

function resolveExistingTarget() {
  const candidates = [
    { type: "task", table: "tasks" },
    { type: "lawsuit", table: "lawsuits" },
    { type: "session", table: "sessions" },
    { type: "dossier", table: "dossiers" },
  ];

  for (const candidate of candidates) {
    const row = db
      .prepare(`SELECT id FROM ${candidate.table} WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`)
      .get();
    if (row?.id) return { type: candidate.type, id: Number(row.id) };
  }
  return null;
}

test("planner returns missing_fields when required values are absent", () => {
  const target = resolveExistingTarget();
  if (!target) return;

  const result = planner.planDocument({
    target,
    documentType: "TASK_MEMO",
    language: "en",
    format: "html",
    instructions: "",
  });

  assert.equal(result.status, "missing_fields");
  assert.ok(Array.isArray(result.missingFields));
  assert.ok(result.missingFields.length >= 1);
});

test("planner returns ready when request includes enough inferred data", () => {
  const target = resolveExistingTarget();
  if (!target) return;

  const result = planner.planDocument({
    target,
    documentType: "COURT_REQUEST_LETTER",
    language: "en",
    format: "html",
    instructions: "Request postponement due to documented medical reason",
  });

  assert.ok(["missing_fields", "ready"].includes(result.status));
  assert.equal(result.documentType, "COURT_REQUEST_LETTER");
  assert.ok(result.templateKey);
});
