"use strict";

/**
 * DRAFT TOOL: draftHearingSummary
 *
 * Generate a draft hearing summary for a completed session.
 * Output only, never persists automatically.
 * COMPLIANT with Draft Output Contract (Phase B.5).
 * Safe for v1, v2, v3.
 */

const db = require("../../../db/connection");
const { TOOL_CATEGORIES } = require("../tool.registry");
const {
  DRAFT_TYPE,
  DRAFT_TONE,
  DRAFT_SOURCE,
  createDraft,
} = require("../../contracts/draft.contract");

const inputSchema = {
  type: "object",
  properties: {
    sessionId: {
      type: "integer",
      minimum: 1,
      description: "The session ID to create summary for",
    },
    language: {
      type: "string",
      enum: ["en", "fr"],
      default: "fr",
      description: "Language for the summary",
    },
  },
  required: ["sessionId"],
  additionalProperties: false,
};

// Output schema references draft.schema.json contract
const outputSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["HEARING_SUMMARY"] },
    language: { type: "string" },
    tone: { type: "string", enum: ["FORMAL"] },
    sections: { type: "object" },
    metadata: { type: "object" },
    recipient: { type: "null" },
    context: { type: ["object", "null"] },
  },
  required: ["type", "language", "tone", "sections", "metadata"],
  additionalProperties: false,
};

async function handler({ sessionId, language = "fr" }) {
  // Fetch session details
  const session = db
    .prepare(
      `
      SELECT
        s.id, s.title, s.session_type, s.scheduled_at, s.location,
        s.court_room, s.judge, s.outcome, s.description, s.notes,
        s.participants, s.dossier_id, s.lawsuit_id,
        d.reference as dossier_reference, d.title as dossier_title,
        c.reference as lawsuit_reference, c.title as lawsuit_title,
        cl.name as client_name
      FROM sessions s
      LEFT JOIN dossiers d ON d.id = s.dossier_id
      LEFT JOIN lawsuits c ON c.id = s.lawsuit_id
      LEFT JOIN clients cl ON cl.id = d.client_id OR cl.id = (SELECT client_id FROM dossiers WHERE id = c.dossier_id)
      WHERE s.id = ? AND s.deleted_at IS NULL
      `
    )
    .get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Format date
  const scheduledDate = new Date(session.scheduled_at);
  const dateStr =
    language === "fr"
      ? scheduledDate.toLocaleDateString("fr-FR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : scheduledDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

  const timeStr = scheduledDate.toLocaleTimeString(
    language === "fr" ? "fr-FR" : "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  const reference = session.dossier_reference || session.lawsuit_reference || "";
  const lawsuitTitle = session.dossier_title || session.lawsuit_title || "";

  // Build sections
  let header, body, footer;

  if (language === "fr") {
    // HEADER: Title and general information
    const headerLines = [
      `COMPTE-RENDU DE ${session.session_type.toUpperCase()}`,
      "",
      reference ? `Référence dossier : ${reference}` : null,
      lawsuitTitle ? `Procès : ${lawsuitTitle}` : null,
      session.client_name ? `Client : ${session.client_name}` : null,
      `Date : ${dateStr}`,
      `Heure : ${timeStr}`,
      session.location ? `Lieu : ${session.location}` : null,
      session.court_room ? `Salle : ${session.court_room}` : null,
      session.judge ? `Juge : ${session.judge}` : null,
      session.participants ? `Participants : ${session.participants}` : null,
    ].filter(Boolean);
    header = headerLines.join("\n");

    // BODY: Outcome and notes
    body = `=== RÉSULTAT ===
${session.outcome || "[À compléter]"}

=== NOTES ===
${session.notes || "[À compléter]"}

${session.description ? "=== DESCRIPTION ===\n" + session.description : ""}`;

    // FOOTER: Generation info
    footer = `---
Document généré automatiquement - Nécessite validation
Généré le : ${new Date().toISOString()}`;
  } else {
    // HEADER: Title and general information
    const headerLines = [
      `${session.session_type.toUpperCase()} SUMMARY`,
      "",
      reference ? `Lawsuit reference: ${reference}` : null,
      lawsuitTitle ? `Lawsuit: ${lawsuitTitle}` : null,
      session.client_name ? `Client: ${session.client_name}` : null,
      `Date: ${dateStr}`,
      `Time: ${timeStr}`,
      session.location ? `Location: ${session.location}` : null,
      session.court_room ? `Court room: ${session.court_room}` : null,
      session.judge ? `Judge: ${session.judge}` : null,
      session.participants ? `Participants: ${session.participants}` : null,
    ].filter(Boolean);
    header = headerLines.join("\n");

    // BODY: Outcome and notes
    body = `=== OUTCOME ===
${session.outcome || "[To be completed]"}

=== NOTES ===
${session.notes || "[To be completed]"}

${session.description ? "=== DESCRIPTION ===\n" + session.description : ""}`;

    // FOOTER: Generation info
    footer = `---
Automatically generated document - Requires validation
Generated on: ${new Date().toISOString()}`;
  }

  // Build context
  const context = {
    sessionId: session.id,
    dossierId: session.dossier_id,
    lawsuitId: session.lawsuit_id,
    reference,
  };

  // Create draft using contract (summaries are always FORMAL tone)
  return createDraft({
    type: DRAFT_TYPE.HEARING_SUMMARY,
    language,
    tone: DRAFT_TONE.FORMAL, // Summaries are always formal
    sections: {
      header,
      body,
      footer,
    },
    metadata: {
      source: DRAFT_SOURCE.RULE_BASED,
      status: "draft",
      requiresValidation: true,
      createdAt: new Date().toISOString(),
    },
    recipient: null, // Summaries have no specific recipient
    context,
  });
}

module.exports = {
  name: "draftHearingSummary",
  category: TOOL_CATEGORIES.DRAFT,
  description:
    "Generate a draft hearing summary for a completed session (compliant with Draft Output Contract)",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v1", "v2", "v3"],
  handler,
};



