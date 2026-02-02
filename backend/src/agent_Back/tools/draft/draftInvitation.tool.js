"use strict";

/**
 * DRAFT TOOL: draftInvitation
 *
 * Generate a draft invitation for a session.
 * Output only, never persists or sends automatically.
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
      description: "The session ID to create invitation for",
    },
    language: {
      type: "string",
      enum: ["en", "fr"],
      default: "fr",
      description: "Language for the invitation",
    },
    tone: {
      type: "string",
      enum: ["formal", "neutral"],
      default: "formal",
      description: "Tone of the invitation (formal or neutral)",
    },
  },
  required: ["sessionId"],
  additionalProperties: false,
};

// Output schema references draft.schema.json contract
const outputSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["INVITATION"] },
    language: { type: "string" },
    tone: { type: "string", enum: ["FORMAL", "NEUTRAL"] },
    sections: { type: "object" },
    metadata: { type: "object" },
    recipient: { type: ["object", "null"] },
    context: { type: ["object", "null"] },
  },
  required: ["type", "language", "tone", "sections", "metadata"],
  additionalProperties: false,
};

async function handler({ sessionId, language = "fr", tone = "formal" }) {
  // Fetch session details
  const session = db
    .prepare(
      `
      SELECT
        s.id, s.title, s.session_type, s.scheduled_at, s.location,
        s.court_room, s.description, s.dossier_id, s.lawsuit_id,
        d.reference as dossier_reference, d.title as dossier_title,
        c.reference as lawsuit_reference, c.title as lawsuit_title,
        cl.id as client_id, cl.name as client_name, cl.email as client_email
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
  const dossierInfo = session.dossier_title || session.lawsuit_title || "";

  // Map tone to contract enum
  const contractTone =
    tone === "formal" ? DRAFT_TONE.FORMAL : DRAFT_TONE.NEUTRAL;

  // Build sections based on language
  let header, body, footer;

  if (language === "fr") {
    const greeting = tone === "formal" ? "Madame, Monsieur" : "Bonjour";

    // HEADER: Recipient, subject, date
    header = `${greeting}${
      session.client_name ? " " + session.client_name : ""
    },

Objet : Invitation - ${session.session_type}
Référence : ${reference}
Date d'envoi : ${new Date().toLocaleDateString("fr-FR")}`;

    // BODY: Main content
    body = `Nous vous invitons à une ${
      session.session_type
    } concernant ${dossierInfo}.

Détails de la séance :
• Date : ${dateStr}
• Heure : ${timeStr}
• Lieu : ${session.location || "À confirmer"}${
      session.court_room ? "\n• Salle : " + session.court_room : ""
    }

${
  session.description ? "Description :\n" + session.description + "\n\n" : ""
}Veuillez confirmer votre présence dès que possible.`;

    // FOOTER: Closing and signature
    footer = `Cordialement,

[Signature à compléter]

---
Document généré automatiquement - Nécessite validation`;
  } else {
    const greeting = tone === "formal" ? "Dear Sir/Madam" : "Hello";

    // HEADER: Recipient, subject, date
    header = `${greeting}${
      session.client_name ? " " + session.client_name : ""
    },

Subject: Invitation - ${session.session_type}
Reference: ${reference}
Date: ${new Date().toLocaleDateString("en-US")}`;

    // BODY: Main content
    body = `We invite you to a ${session.session_type} regarding ${dossierInfo}.

Session details:
• Date: ${dateStr}
• Time: ${timeStr}
• Location: ${session.location || "To be confirmed"}${
      session.court_room ? "\n• Room: " + session.court_room : ""
    }

${
  session.description ? "Description:\n" + session.description + "\n\n" : ""
}Please confirm your attendance as soon as possible.`;

    // FOOTER: Closing and signature
    footer = `Best regards,

[Signature to be completed]

---
Automatically generated document - Requires validation`;
  }

  // Build recipient info
  const recipient = session.client_email
    ? {
        clientId: session.client_id,
        name: session.client_name,
        email: session.client_email,
      }
    : null;

  // Build context
  const context = {
    sessionId: session.id,
    dossierId: session.dossier_id,
    lawsuitId: session.lawsuit_id,
    reference,
  };

  // Create draft using contract
  return createDraft({
    type: DRAFT_TYPE.INVITATION,
    language,
    tone: contractTone,
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
    recipient,
    context,
  });
}

module.exports = {
  name: "draftInvitation",
  category: TOOL_CATEGORIES.DRAFT,
  description:
    "Generate a draft invitation for a session (compliant with Draft Output Contract)",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v1", "v2", "v3"],
  handler,
};



