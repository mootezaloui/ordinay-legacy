"use strict";

/**
 * DRAFT TOOL: draftClientEmail
 *
 * Generate a draft email for a client regarding a dossier.
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
    dossierId: {
      type: "integer",
      minimum: 1,
      description: "The dossier ID",
    },
    purpose: {
      type: "string",
      enum: ["update", "request_info", "confirm_appointment", "general"],
      description: "Purpose of the email",
    },
    language: {
      type: "string",
      enum: ["en", "fr"],
      default: "fr",
      description: "Language for the email",
    },
    tone: {
      type: "string",
      enum: ["formal", "neutral"],
      default: "formal",
      description: "Tone of the email",
    },
  },
  required: ["dossierId", "purpose"],
  additionalProperties: false,
};

// Output schema references draft.schema.json contract
const outputSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["CLIENT_EMAIL"] },
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

async function handler({
  dossierId,
  purpose,
  language = "fr",
  tone = "formal",
}) {
  // Fetch dossier and client details
  const dossier = db
    .prepare(
      `
      SELECT
        d.id, d.reference, d.title, d.description, d.status, d.next_deadline,
        c.id as client_id, c.name as client_name, c.email as client_email
      FROM dossiers d
      LEFT JOIN clients c ON c.id = d.client_id
      WHERE d.id = ? AND d.deleted_at IS NULL
      `
    )
    .get(dossierId);

  if (!dossier) {
    throw new Error(`Dossier ${dossierId} not found`);
  }

  const contractTone =
    tone === "formal" ? DRAFT_TONE.FORMAL : DRAFT_TONE.NEUTRAL;

  let subject, bodyContent;

  if (language === "fr") {
    const greeting = tone === "formal" ? "Madame, Monsieur" : "Bonjour";

    switch (purpose) {
      case "update":
        subject = `Mise à jour - Dossier ${dossier.reference}`;
        bodyContent = `Nous vous écrivons pour vous informer de l'avancement de votre dossier "${
          dossier.title
        }" (Référence: ${dossier.reference}).

Statut actuel : ${dossier.status}
${
  dossier.next_deadline
    ? `Prochaine échéance : ${new Date(
        dossier.next_deadline
      ).toLocaleDateString("fr-FR")}`
    : ""
}

[Veuillez ajouter les détails de la mise à jour ici]

N'hésitez pas à nous contacter pour toute question.`;
        break;

      case "request_info":
        subject = `Demande d'information - Dossier ${dossier.reference}`;
        bodyContent = `Dans le cadre du suivi de votre dossier "${dossier.title}" (Référence: ${dossier.reference}), nous aurions besoin des informations suivantes :

[Veuillez spécifier les informations requises]

Merci de nous transmettre ces éléments dans les meilleurs délais.`;
        break;

      case "confirm_appointment":
        subject = `Confirmation de rendez-vous - Dossier ${dossier.reference}`;
        bodyContent = `Nous souhaitons confirmer notre rendez-vous concernant votre dossier "${dossier.title}" (Référence: ${dossier.reference}).

[Veuillez ajouter les détails du rendez-vous]

Merci de confirmer votre disponibilité.`;
        break;

      case "general":
      default:
        subject = `Dossier ${dossier.reference}`;
        bodyContent = `Nous vous contactons au sujet de votre dossier "${dossier.title}" (Référence: ${dossier.reference}).

[Veuillez ajouter le contenu de votre message]`;
    }
  } else {
    const greeting = tone === "formal" ? "Dear Sir/Madam" : "Hello";

    switch (purpose) {
      case "update":
        subject = `Update - Case file ${dossier.reference}`;
        bodyContent = `We are writing to inform you about the progress of your case file "${
          dossier.title
        }" (Reference: ${dossier.reference}).

Current status: ${dossier.status}
${
  dossier.next_deadline
    ? `Next deadline: ${new Date(dossier.next_deadline).toLocaleDateString(
        "en-US"
      )}`
    : ""
}

[Please add update details here]

Feel free to contact us if you have any questions.`;
        break;

      case "request_info":
        subject = `Information request - Case file ${dossier.reference}`;
        bodyContent = `As part of the follow-up on your case file "${dossier.title}" (Reference: ${dossier.reference}), we need the following information:

[Please specify required information]

Thank you for sending us these elements as soon as possible.`;
        break;

      case "confirm_appointment":
        subject = `Appointment confirmation - Case file ${dossier.reference}`;
        bodyContent = `We would like to confirm our appointment regarding your case file "${dossier.title}" (Reference: ${dossier.reference}).

[Please add appointment details]

Please confirm your availability.`;
        break;

      case "general":
      default:
        subject = `Case file ${dossier.reference}`;
        bodyContent = `We are contacting you about your case file "${dossier.title}" (Reference: ${dossier.reference}).

[Please add your message content]`;
    }
  }

  // Build sections
  const header =
    language === "fr"
      ? `${tone === "formal" ? "Madame, Monsieur" : "Bonjour"}${
          dossier.client_name ? " " + dossier.client_name : ""
        },

Objet : ${subject}
Référence : ${dossier.reference}
Date : ${new Date().toLocaleDateString("fr-FR")}`
      : `${tone === "formal" ? "Dear Sir/Madam" : "Hello"}${
          dossier.client_name ? " " + dossier.client_name : ""
        },

Subject: ${subject}
Reference: ${dossier.reference}
Date: ${new Date().toLocaleDateString("en-US")}`;

  const body = bodyContent;

  const footer =
    language === "fr"
      ? `Cordialement,

[Signature à compléter]

---
Document généré automatiquement - Nécessite validation`
      : `Best regards,

[Signature to be completed]

---
Automatically generated document - Requires validation`;

  // Build recipient info
  const recipient = dossier.client_email
    ? {
        clientId: dossier.client_id,
        name: dossier.client_name,
        email: dossier.client_email,
      }
    : null;

  // Build context
  const context = {
    dossierId: dossier.id,
    reference: dossier.reference,
    purpose,
  };

  // Create draft using contract
  return createDraft({
    type: DRAFT_TYPE.CLIENT_EMAIL,
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
  name: "draftClientEmail",
  category: TOOL_CATEGORIES.DRAFT,
  description:
    "Generate a draft email for a client regarding a dossier (compliant with Draft Output Contract)",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v1", "v2", "v3"],
  handler,
};
