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

import { formatDateValue } from "../utils/dateFormat";

// Helper to render sender signature with a future user name (fallback to firm name)
const getSenderName = (eventData) => eventData?.senderName || "Your Law Firm";
const formatEmailDate = (value) => formatDateValue(value);

// ========================================
// TEMPLATE: DOSSIER CREATED
// ========================================

function dossierCreatedTemplate(eventData) {
  const { dossierNumber, dossierTitle, clientName, joinDate } = eventData;

  const subject = `Opening of Your Dossier ${dossierTitle} (${dossierNumber})`;

  const body = `Dear ${clientName},

We confirm the opening of your Dossier.

Dossier: ${dossierTitle} (${dossierNumber})
Registration Date: ${
    joinDate ? formatEmailDate(joinDate) : formatEmailDate(new Date())
  }

We remain at your disposal for any questions.

Sincerely,
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
    Closed:
      "Your Dossier is now closed. All elements of the case have been processed.",
    Suspended:
      "Your Dossier is temporarily suspended due to circumstances requiring a pause in processing.",
    Open: isReopening
      ? "Your Dossier has been reopened for processing following new developments."
      : "Your Dossier is now active and being processed.",
  };

  const explanation = statusExplanations[newStatus] || "";

  const subject = `Dossier Update ${dossierTitle} (${dossierNumber})`;

  const body = `Dear ${clientName},

We inform you that the status of your Dossier has been modified.

Dossier: ${dossierTitle} (${dossierNumber})
New Status: ${newStatus}
Date: ${formatEmailDate(new Date())}

${explanation}

For any questions, please do not hesitate to contact us.

Sincerely,
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

  const oldDate = formatEmailDate(oldDeadline);
  const newDate = formatEmailDate(newDeadline);

  const impactNote =
    diffDays > 30
      ? "represents a significant change in your Dossier timeline"
      : "may impact the processing timeline of your Dossier";

  const subject = `Deadline Modification - ${dossierTitle} (${dossierNumber})`;

  const body = `Dear ${clientName},

We inform you of a deadline modification concerning your Dossier.

Dossier: ${dossierTitle} (${dossierNumber})

Previous Deadline: ${oldDate}
New Deadline: ${newDate}

This modification ${impactNote}.

For any questions, please do not hesitate to contact us.

Sincerely,
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
    Clos: "Your case is now closed. A final decision has been rendered.",
    Suspendu:
      "Your case has been suspended by the court. We will keep you informed of the resumption of proceedings.",
  };

  const explanation = statusExplanations[newStatus] || "";

  const subject = `Case Progress Update ${caseTitle} (${caseNumber})`;

  const body = `Dear ${clientName},

We inform you of a development concerning your case.

Case: ${caseTitle} (${caseNumber})
Court: ${court}
New Status: ${newStatus}
Date: ${formatEmailDate(new Date())}

${explanation}

We remain at your disposal for any additional information.

Sincerely,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS CREATED
// ========================================

function caseCreatedTemplate(eventData) {
  const { caseNumber, caseTitle, court, clientName } = eventData;

  const subject = `Opening of Your Case ${caseTitle} (${caseNumber})`;

  const body = `Dear ${clientName},

We confirm the opening of a new case concerning you.

Case: ${caseTitle} (${caseNumber})
Jurisdiction: ${court || "N/A"}

We will keep you informed of each step.

Sincerely,
${getSenderName(eventData)}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS HEARING DATE CHANGED
// ========================================

function caseHearingChangedTemplate(eventData) {
  const { caseNumber, caseTitle, court, clientName, oldDate, newDate } =
    eventData;

  const oldDateFormatted = oldDate ? formatEmailDate(oldDate) : "Not defined";
  const newDateFormatted = newDate ? formatEmailDate(newDate) : "Not defined";

  const subject = `Hearing Date Modification - ${caseTitle} (${caseNumber})`;

  const body = `Dear ${clientName},

We inform you of a modification concerning your upcoming hearing.

Case: ${caseTitle} (${caseNumber})
Court: ${court}

Previous Date: ${oldDateFormatted}
New Date: ${newDateFormatted}

Please take note of this change and organize accordingly.

For any questions, please do not hesitate to contact us.

Sincerely,
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

  const dateFormatted = formatEmailDate(date);

  const subject = `Hearing Scheduled - ${
    sessionTitle || sessionType || "Hearing"
  } ${caseTitle ? `(${caseTitle})` : ""} ${caseNumber ? `(${caseNumber})` : ""}`
    .replace(/\s+/g, " ")
    .trim();

  const body = `Dear ${clientName},

A hearing has been scheduled for your Dossier.

${caseNumber ? `Case: ${caseTitle || "N/A"} (${caseNumber})` : ""}
Type: ${sessionTitle}
Date: ${dateFormatted} at ${time}
Location: ${location}
Estimated Duration: ${duration}

We will keep you informed of any developments.

Sincerely,
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

  const oldDateFormatted = formatEmailDate(oldDate);
  const newDateFormatted = formatEmailDate(newDate);

  const subject = `Hearing Date Modification - ${sessionTitle || "Hearing"} ${
    caseTitle ? `(${caseTitle})` : ""
  } ${caseNumber ? `(${caseNumber})` : ""}`
    .replace(/\s+/g, " ")
    .trim();

  const body = `Dear ${clientName},

We inform you of a modification concerning your upcoming hearing.

${caseNumber ? `Case: ${caseTitle || "N/A"} (${caseNumber})` : ""}
Hearing: ${sessionTitle}

Previous Date: ${oldDateFormatted} at ${oldTime}
New Date: ${newDateFormatted} at ${newTime}

Location: ${location}

Please take note of this change and organize accordingly.

For any questions, please do not hesitate to contact us.

Sincerely,
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

  const dateFormatted = formatEmailDate(date);

  const subject = `Hearing Cancellation - ${caseNumber || "Your Dossier"}`;

  const body = `Dear ${clientName},

We inform you of the cancellation of the scheduled hearing.

${caseNumber ? `Case: ${caseNumber} - ${caseTitle}` : ""}
Cancelled Hearing: ${dateFormatted} at ${time}
Location: ${location}

A new date will be communicated to you as soon as possible.

Sincerely,
${eventData?.senderName || "Your Law Firm"}`;

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

  const subject = `New Financial Entry Concerning Your Dossier`;

  const body = `Dear ${clientName},

A new financial entry has been recorded.

Description: ${description}
Amount: ${amountWithSign || amount || "N/A"}
${dueDate ? `Due Date: ${formatEmailDate(dueDate)}` : ""}
${clientBalance ? `Client Balance After Entry: ${clientBalance}` : ""}

Please take note of this update.

Sincerely,
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
