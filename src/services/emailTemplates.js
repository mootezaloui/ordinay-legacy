/**
 * Email Templates for Client Communication
 *
 * Professional, neutral legal tone
 * Clear and concise
 * No technical jargon
 * No sensitive internal data
 * Event-specific wording
 *
 * Each template is a function that takes eventData and returns { subject, body }
 */

// Helper to render sender signature with a future user name (fallback to firm name)
const getSenderName = (eventData) => eventData?.senderName || "Votre Cabinet d'avocats";

// ========================================
// TEMPLATE: DOSSIER CREATED
// ========================================

function dossierCreatedTemplate(eventData) {
  const {
    dossierNumber,
    dossierTitle,
    clientName,
    joinDate,
  } = eventData;

  const subject = `Ouverture de votre dossier ${dossierTitle} (${dossierNumber})`;

  const body = `Madame, Monsieur ${clientName},

Nous vous confirmons l'ouverture de votre dossier.

Dossier : ${dossierTitle} (${dossierNumber})
Date d'inscription : ${joinDate ? new Date(joinDate).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}

Nous restons à votre disposition pour toute question.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: DOSSIER STATUS CHANGED
// ========================================

function dossierStatusChangedTemplate(eventData) {
  const {
    dossierNumber,
    dossierTitle,
    clientName,
    oldStatus,
    newStatus,
    isReopening,
  } = eventData;

  const statusExplanations = {
    Fermé:
      "Votre dossier est désormais clôturé. Tous les éléments du dossier ont été traités.",
    Suspendu:
      "Votre dossier est temporairement suspendu en raison de circonstances nécessitant une pause dans le traitement.",
    Ouvert: isReopening
      ? "Votre dossier a été rouvert pour traitement suite à de nouveaux développements."
      : "Votre dossier est désormais actif et en cours de traitement.",
  };

  const explanation = statusExplanations[newStatus] || "";

  const subject = `Mise à jour de votre dossier ${dossierTitle} (${dossierNumber})`;

  const body = `Madame, Monsieur ${clientName},

Nous vous informons que le statut de votre dossier a été modifié.

Dossier : ${dossierTitle} (${dossierNumber})
Nouveau statut : ${newStatus}
Date : ${new Date().toLocaleDateString("fr-FR")}

${explanation}

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: DOSSIER DEADLINE CHANGED
// ========================================

function dossierDeadlineChangedTemplate(eventData) {
  const {
    dossierNumber,
    dossierTitle,
    clientName,
    oldDeadline,
    newDeadline,
    diffDays,
  } = eventData;

  const oldDate = new Date(oldDeadline).toLocaleDateString("fr-FR");
  const newDate = new Date(newDeadline).toLocaleDateString("fr-FR");

  const impactNote =
    diffDays > 30
      ? "représente un changement significatif dans le calendrier de votre dossier"
      : "pourra impacter le calendrier de traitement de votre dossier";

  const subject = `Modification d'échéance - ${dossierTitle} (${dossierNumber})`;

  const body = `Madame, Monsieur ${clientName},

Nous vous informons d'une modification d'échéance concernant votre dossier.

Dossier : ${dossierTitle} (${dossierNumber})

Ancienne échéance : ${oldDate}
Nouvelle échéance : ${newDate}

Cette modification ${impactNote}.

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS STATUS CHANGED
// ========================================

function caseStatusChangedTemplate(eventData) {
  const { caseNumber, caseTitle, court, clientName, oldStatus, newStatus } =
    eventData;

  const statusExplanations = {
    Clos: "Votre procès est désormais clos. Une décision définitive a été rendue.",
    Suspendu:
      "Votre procès a été suspendu par le tribunal. Nous vous tiendrons informé de la reprise des procédures.",
  };

  const explanation = statusExplanations[newStatus] || "";

  const subject = `Évolution de votre procès ${caseTitle} (${caseNumber})`;

  const body = `Madame, Monsieur ${clientName},

Nous vous informons d'une évolution concernant votre procès.

Procès : ${caseTitle} (${caseNumber})
Tribunal : ${court}
Nouveau statut : ${newStatus}
Date : ${new Date().toLocaleDateString("fr-FR")}

${explanation}

Nous restons à votre disposition pour tout complément d'information.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS CREATED
// ========================================

function caseCreatedTemplate(eventData) {
  const {
    caseNumber,
    caseTitle,
    court,
    clientName,
  } = eventData;

  const subject = `Ouverture de votre procès ${caseTitle} (${caseNumber})`;

  const body = `Madame, Monsieur ${clientName},

Nous vous confirmons l'ouverture d'un nouveau procès vous concernant.

Procès : ${caseTitle} (${caseNumber})
Juridiction : ${court || 'N/A'}

Nous vous tiendrons informé de chaque étape.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS HEARING DATE CHANGED
// ========================================

function caseHearingChangedTemplate(eventData) {
  const { caseNumber, caseTitle, court, clientName, oldDate, newDate } =
    eventData;

  const oldDateFormatted = oldDate
    ? new Date(oldDate).toLocaleDateString("fr-FR")
    : "Non définie";
  const newDateFormatted = newDate
    ? new Date(newDate).toLocaleDateString("fr-FR")
    : "Non définie";

  const subject = `Modification de la date d'audience - ${caseTitle} (${caseNumber})`;

  const body = `Madame, Monsieur ${clientName},

Nous vous informons d'une modification concernant votre prochaine audience.

Procès : ${caseTitle} (${caseNumber})
Tribunal : ${court}

Ancienne date : ${oldDateFormatted}
Nouvelle date : ${newDateFormatted}

Veuillez prendre note de ce changement et vous organiser en conséquence.

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: SESSION SCHEDULED
// ========================================

function sessionScheduledTemplate(eventData) {
  const {
    sessionTitle,
    sessionType,
    date,
    time,
    location,
    duration,
    caseNumber,
    caseTitle,
    clientName,
  } = eventData;

  const dateFormatted = new Date(date).toLocaleDateString("fr-FR");

  const subject = `Audience programmée - ${
    sessionTitle || sessionType || "Audience"
  } ${caseTitle ? `(${caseTitle})` : ""} ${caseNumber ? `(${caseNumber})` : ""}`
    .replace(/\s+/g, " ")
    .trim();

  const body = `Madame, Monsieur ${clientName},

Une audience a été programmée dans le cadre de votre dossier.

${caseNumber ? `Procès : ${caseTitle || "N/A"} (${caseNumber})` : ""}
Type : ${sessionTitle}
Date : ${dateFormatted} à ${time}
Lieu : ${location}
Durée estimée : ${duration}

Nous vous tiendrons informé de toute évolution.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: SESSION DATE CHANGED
// ========================================

function sessionDateChangedTemplate(eventData) {
  const {
    sessionTitle,
    location,
    oldDate,
    oldTime,
    newDate,
    newTime,
    caseNumber,
    caseTitle,
    clientName,
  } = eventData;

  const oldDateFormatted = new Date(oldDate).toLocaleDateString("fr-FR");
  const newDateFormatted = new Date(newDate).toLocaleDateString("fr-FR");

  const subject = `Modification de la date d'audience - ${
    sessionTitle || "Audience"
  } ${caseTitle ? `(${caseTitle})` : ""} ${caseNumber ? `(${caseNumber})` : ""}`
    .replace(/\s+/g, " ")
    .trim();

  const body = `Madame, Monsieur ${clientName},

Nous vous informons d'une modification concernant votre prochaine audience.

${caseNumber ? `Procès : ${caseTitle || "N/A"} (${caseNumber})` : ""}
Audience : ${sessionTitle}

Ancienne date : ${oldDateFormatted} à ${oldTime}
Nouvelle date : ${newDateFormatted} à ${newTime}

Lieu : ${location}

Veuillez prendre note de ce changement et vous organiser en conséquence.

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: SESSION CANCELLED
// ========================================

function sessionCancelledTemplate(eventData) {
  const {
    sessionTitle,
    date,
    time,
    location,
    caseNumber,
    caseTitle,
    clientName,
  } = eventData;

  const dateFormatted = new Date(date).toLocaleDateString("fr-FR");

  const subject = `Annulation d'audience - ${caseNumber || "Votre dossier"}`;

  const body = `Madame, Monsieur ${clientName},

Nous vous informons de l'annulation de l'audience prévue.

${caseNumber ? `Procès : ${caseNumber} - ${caseTitle}` : ""}
Audience annulée : ${dateFormatted} à ${time}
Lieu : ${location}

Une nouvelle date vous sera communiquée dès que possible.

Cordialement,
${eventData?.senderName || "Votre Cabinet d'avocats"}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: FINANCIAL ENTRY ADDED (CLIENT-INVOICING)
// ========================================

function financialEntryAddedTemplate(eventData) {
  const {
    description,
    amountWithSign,
    amount,
    dueDate,
    clientName,
    clientBalance,
  } = eventData;

  const subject = `Nouvelle écriture comptable concernant votre dossier`;

  const body = `Madame, Monsieur ${clientName},

Une nouvelle écriture comptable a été enregistrée.

Objet : ${description}
Montant : ${amountWithSign || amount || "N/A"}
${dueDate ? `Échéance : ${new Date(dueDate).toLocaleDateString("fr-FR")}` : ""}
${clientBalance ? `Solde client après écriture : ${clientBalance}` : ""}

Merci de prendre connaissance de cette mise à jour.

Cordialement,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// EXPORT EMAIL TEMPLATES
// ========================================

export const emailTemplates = {
  dossier_created: dossierCreatedTemplate,
  dossier_status_changed: dossierStatusChangedTemplate,
  dossier_deadline_changed: dossierDeadlineChangedTemplate,
  case_created: caseCreatedTemplate,
  case_status_changed: caseStatusChangedTemplate,
  case_hearing_changed: caseHearingChangedTemplate,
  session_scheduled: sessionScheduledTemplate,
  session_date_changed: sessionDateChangedTemplate,
  session_cancelled: sessionCancelledTemplate,
  financial_entry_added: financialEntryAddedTemplate,
};
