"use strict";

/**
 * Data Integrity Protection — Placeholder-Based Data Binding
 *
 * Ensures system-originated data (client names, dossier references, case numbers,
 * financial values, dates) is injected deterministically into LLM-generated text,
 * never regenerated probabilistically.
 *
 * Three-step contract:
 *   1. buildDataBindings()       — extract { KEY: exactValue } from enriched context
 *   2. buildPlaceholderInstruction() — tell LLM to use {{KEY}} syntax
 *   3. resolveDataBindings()     — replace {{KEY}} with exact DB values
 */

/**
 * Builds a data bindings map from enriched context entity data.
 * Each key is a placeholder name (e.g., "CLIENT_NAME"),
 * each value is the exact DB string.
 *
 * @param {Object} context - Enriched context from pipeline
 * @returns {Object} - { [placeholderKey]: exactValue }
 */
function buildDataBindings(context) {
  const bindings = {};
  if (!context) return bindings;

  const add = (key, value) => {
    if (value != null && String(value).trim() !== "") {
      bindings[key] = String(value);
    }
  };

  if (context.clientData) {
    const c = context.clientData;
    add("CLIENT_NAME", c.name);
    add("CLIENT_EMAIL", c.email);
    add("CLIENT_PHONE", c.phone);
    add("CLIENT_COMPANY", c.company);
    add("CLIENT_STATUS", c.status);
  }

  if (context.dossierData) {
    const d = context.dossierData;
    add("DOSSIER_REFERENCE", d.reference);
    add("DOSSIER_TITLE", d.title);
    add("DOSSIER_STATUS", d.status);
    add("DOSSIER_CLIENT_NAME", d.client_name);
    add("DOSSIER_ADVERSARY", d.adversary_party);
    add("DOSSIER_COURT_REFERENCE", d.court_reference);
    add("DOSSIER_NEXT_DEADLINE", d.next_deadline);
    add("DOSSIER_PHASE", d.phase);
  }

  if (context.taskData) {
    const t = context.taskData;
    add("TASK_TITLE", t.title);
    add("TASK_STATUS", t.status);
    add("TASK_PRIORITY", t.priority);
    add("TASK_DUE_DATE", t.due_date);
    add("TASK_ASSIGNED_TO", t.assigned_to);
  }

  if (context.lawsuitData) {
    const l = context.lawsuitData;
    add("LAWSUIT_CASE_NUMBER", l.case_number);
  }

  if (context.sessionData) {
    const s = context.sessionData;
    add("SESSION_TITLE", s.title);
  }

  if (context.missionData) {
    const m = context.missionData;
    add("MISSION_TITLE", m.title);
  }

  if (context.financialData) {
    const f = context.financialData;
    add("FINANCIAL_AMOUNT", f.amount);
  }

  return bindings;
}

/**
 * Replaces {{PLACEHOLDER}} tokens in text with exact DB values.
 * Uses split/join for global replacement without regex.
 * Idempotent — if no placeholders found, text passes through unchanged.
 *
 * @param {string} text - LLM-generated text with potential placeholders
 * @param {Object} bindings - { [key]: exactValue } from buildDataBindings
 * @returns {string} - Resolved text
 */
function resolveDataBindings(text, bindings) {
  if (!text || typeof text !== "string") return text || "";
  if (!bindings || typeof bindings !== "object") return text;

  let resolved = text;
  for (const [key, value] of Object.entries(bindings)) {
    const placeholder = `{{${key}}}`;
    resolved = resolved.split(placeholder).join(value);
  }
  return resolved;
}

/**
 * Builds a prompt instruction block listing available placeholders.
 * Tells the LLM to use {{KEY}} syntax instead of retyping system values.
 *
 * @param {Object} bindings - { [key]: exactValue }
 * @returns {string} - Instruction text for system prompt injection, or "" if empty
 */
function buildPlaceholderInstruction(bindings) {
  if (!bindings || typeof bindings !== "object") return "";
  const keys = Object.keys(bindings);
  if (keys.length === 0) return "";

  const lines = keys.map((key) => `  {{${key}}}`);
  return `DATA INTEGRITY: When referencing the following system values, use these exact placeholders instead of writing the values yourself:
${lines.join("\n")}
Never type out the actual value for these fields. Always use the placeholder syntax {{FIELD_NAME}}.
These placeholders will be resolved to exact database values automatically.`;
}

module.exports = {
  buildDataBindings,
  resolveDataBindings,
  buildPlaceholderInstruction,
};
