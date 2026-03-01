"use strict";

const DOCUMENT_TYPES = Object.freeze({
  COURT_REQUEST_LETTER: "COURT_REQUEST_LETTER",
  LEGAL_OPINION: "LEGAL_OPINION",
  TASK_MEMO: "TASK_MEMO",
  SESSION_SUMMARY: "SESSION_SUMMARY",
});

const SUPPORTED_LANGUAGES = Object.freeze(["ar", "en"]);
const SCHEMA_VERSION = "1.0.0";

const TARGET_TYPES = Object.freeze([
  "client",
  "dossier",
  "lawsuit",
  "mission",
  "task",
  "session",
  "personal_task",
  "financial_entry",
  "officer",
]);

const ENTITY_COLUMN_MAP = Object.freeze({
  client: "client_id",
  dossier: "dossier_id",
  lawsuit: "lawsuit_id",
  mission: "mission_id",
  task: "task_id",
  session: "session_id",
  personal_task: "personal_task_id",
  financial_entry: "financial_entry_id",
  officer: "officer_id",
});

module.exports = {
  DOCUMENT_TYPES,
  SUPPORTED_LANGUAGES,
  SCHEMA_VERSION,
  TARGET_TYPES,
  ENTITY_COLUMN_MAP,
};
