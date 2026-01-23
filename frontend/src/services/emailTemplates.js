/**
 * Email Templates for Client Communication (Internationalized)
 *
 * Professional, neutral legal tone
 * Clear and concise
 * No technical jargon
 * No sensitive internal data
 * Event-specific wording
 * FULLY INTERNATIONALIZED (EN/FR/AR support)
 *
 * Each template is a function that takes (eventData, t) and returns { subject, body }
 * where t is the i18n translation function
 */

import { formatDateValue } from "../utils/dateFormat";
import { i18nInstance } from "../i18n/index";

// Helper to get translation function
// Can accept a custom t function or use the global i18n instance
const getT = (customT) => customT || ((key, options) => i18nInstance.t(key, options));

// Helper to render sender signature with a future user name (fallback to firm name)
const getSenderName = (eventData, t) => {
  const fallback = t ? t('clientEmail.body.closing', { senderName: 'Your Law Firm' }) : "Your Law Firm";
  return eventData?.senderName || fallback;
};

const formatEmailDate = (value) => formatDateValue(value);

// ========================================
// TEMPLATE: DOSSIER CREATED
// ========================================

function dossierCreatedTemplate(eventData, customT = null) {
  const t = getT(customT);
  const { dossierNumber, dossierTitle, clientName, joinDate } = eventData;

  const subject = t('notifications:clientEmail.subjects.dossierCreated', {
    title: dossierTitle,
    number: dossierNumber
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.dossierCreated.confirmation')}

${t('notifications:clientEmail.body.dossierCreated.details', {
    title: dossierTitle,
    number: dossierNumber,
    date: joinDate ? formatEmailDate(joinDate) : formatEmailDate(new Date())
  })}

${t('notifications:clientEmail.body.dossierCreated.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: DOSSIER STATUS CHANGED
// ========================================

function dossierStatusChangedTemplate(eventData, customT = null) {
  const t = getT(customT);
  const {
    dossierNumber,
    dossierTitle,
    clientName,
    oldStatus,
    newStatus,
    isReopening,
  } = eventData;

  // Get status explanation based on the new status and reopening flag
  let explanationKey = `notifications:clientEmail.body.dossierStatusChanged.statusExplanations.${newStatus}`;
  if (newStatus === 'Open' && isReopening) {
    explanationKey = 'notifications:clientEmail.body.dossierStatusChanged.statusExplanations.OpenAfterReopening';
  }

  const explanation = t(explanationKey, '');

  const subject = t('notifications:clientEmail.subjects.dossierStatusChanged', {
    title: dossierTitle,
    number: dossierNumber
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.dossierStatusChanged.intro')}

${t('notifications:clientEmail.body.dossierStatusChanged.details', {
    title: dossierTitle,
    number: dossierNumber,
    newStatus,
    date: formatEmailDate(new Date())
  })}

${explanation}

${t('notifications:clientEmail.body.dossierStatusChanged.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: DOSSIER DEADLINE CHANGED
// ========================================

function dossierDeadlineChangedTemplate(eventData, customT = null) {
  const t = getT(customT);
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

  const impactNoteKey = diffDays > 30
    ? 'notifications:clientEmail.body.dossierDeadlineChanged.impactNotes.significant'
    : 'notifications:clientEmail.body.dossierDeadlineChanged.impactNotes.moderate';

  const impactNote = t(impactNoteKey);

  const subject = t('notifications:clientEmail.subjects.dossierDeadlineChanged', {
    title: dossierTitle,
    number: dossierNumber
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.dossierDeadlineChanged.intro')}

${t('notifications:clientEmail.body.dossierDeadlineChanged.details', {
    title: dossierTitle,
    number: dossierNumber,
    oldDate,
    newDate
  })}

${t('notifications:clientEmail.body.dossierDeadlineChanged.impact', { impactNote })}

${t('notifications:clientEmail.body.dossierDeadlineChanged.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS STATUS CHANGED
// ========================================

function lawsuitStatusChangedTemplate(eventData, customT = null) {
  const t = getT(customT);
  const { lawsuitNumber, lawsuitTitle, court, clientName, oldStatus, newStatus } =
    eventData;

  const explanationKey = `notifications:clientEmail.body.lawsuitStatusChanged.statusExplanations.${newStatus}`;
  const explanation = t(explanationKey, '');

  const subject = t('notifications:clientEmail.subjects.lawsuitStatusChanged', {
    title: lawsuitTitle,
    number: lawsuitNumber
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.lawsuitStatusChanged.intro')}

${t('notifications:clientEmail.body.lawsuitStatusChanged.details', {
    title: lawsuitTitle,
    number: lawsuitNumber,
    court,
    newStatus,
    date: formatEmailDate(new Date())
  })}

${explanation}

${t('notifications:clientEmail.body.lawsuitStatusChanged.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS CREATED
// ========================================

function lawsuitCreatedTemplate(eventData, customT = null) {
  const t = getT(customT);
  const { lawsuitNumber, lawsuitTitle, court, clientName } = eventData;

  const subject = t('notifications:clientEmail.subjects.lawsuitCreated', {
    title: lawsuitTitle,
    number: lawsuitNumber
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.lawsuitCreated.confirmation')}

${t('notifications:clientEmail.body.lawsuitCreated.details', {
    title: lawsuitTitle,
    number: lawsuitNumber,
    court: court || "N/A"
  })}

${t('notifications:clientEmail.body.lawsuitCreated.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: PROCÈS HEARING DATE CHANGED
// ========================================

function lawsuitHearingChangedTemplate(eventData, customT = null) {
  const t = getT(customT);
  const { lawsuitNumber, lawsuitTitle, court, clientName, oldDate, newDate } =
    eventData;

  const oldDateFormatted = oldDate ? formatEmailDate(oldDate) : t('notifications:clientEmail.body.notDefined', 'Not defined');
  const newDateFormatted = newDate ? formatEmailDate(newDate) : t('notifications:clientEmail.body.notDefined', 'Not defined');

  const subject = t('notifications:clientEmail.subjects.lawsuitHearingChanged', {
    title: lawsuitTitle,
    number: lawsuitNumber
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.lawsuitHearingChanged.intro')}

${t('notifications:clientEmail.body.lawsuitHearingChanged.details', {
    title: lawsuitTitle,
    number: lawsuitNumber,
    court,
    oldDate: oldDateFormatted,
    newDate: newDateFormatted
  })}

${t('notifications:clientEmail.body.lawsuitHearingChanged.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: SESSION SCHEDULED
// ========================================

function sessionScheduledTemplate(eventData, customT = null) {
  const t = getT(customT);
  const {
    sessionTitle,
    sessionType,
    date,
    time,
    location,
    duration,
    lawsuitNumber,
    lawsuitTitle,
    clientName,
  } = eventData;

  const dateFormatted = formatEmailDate(date);

  const subjectTitle = sessionTitle || sessionType || t('notifications:clientEmail.body.session.hearing', 'Hearing');
  const subject = t('notifications:clientEmail.subjects.sessionScheduled', { title: subjectTitle });

  const detailsKey = lawsuitNumber
    ? 'notifications:clientEmail.body.sessionScheduled.detailsWithLawsuit'
    : 'notifications:clientEmail.body.sessionScheduled.details';

  const details = t(detailsKey, {
    lawsuitTitle: lawsuitTitle || 'N/A',
    lawsuitNumber,
    title: sessionTitle,
    date: dateFormatted,
    time,
    location,
    duration
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.sessionScheduled.intro')}

${details}

${t('notifications:clientEmail.body.sessionScheduled.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: SESSION DATE CHANGED
// ========================================

function sessionDateChangedTemplate(eventData, customT = null) {
  const t = getT(customT);
  const {
    sessionTitle,
    location,
    oldDate,
    oldTime,
    newDate,
    newTime,
    lawsuitNumber,
    lawsuitTitle,
    clientName,
  } = eventData;

  const oldDateFormatted = formatEmailDate(oldDate);
  const newDateFormatted = formatEmailDate(newDate);

  const subject = t('notifications:clientEmail.subjects.sessionDateChanged', { title: sessionTitle || t('notifications:clientEmail.body.session.hearing', 'Hearing') });

  const detailsKey = lawsuitNumber
    ? 'notifications:clientEmail.body.sessionDateChanged.detailsWithLawsuit'
    : 'notifications:clientEmail.body.sessionDateChanged.details';

  const details = t(detailsKey, {
    lawsuitTitle: lawsuitTitle || 'N/A',
    lawsuitNumber,
    title: sessionTitle,
    oldDate: oldDateFormatted,
    oldTime,
    newDate: newDateFormatted,
    newTime,
    location
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.sessionDateChanged.intro')}

${details}

${t('notifications:clientEmail.body.sessionDateChanged.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: SESSION CANCELLED
// ========================================

function sessionCancelledTemplate(eventData, customT = null) {
  const t = getT(customT);
  const {
    sessionTitle,
    date,
    time,
    location,
    lawsuitNumber,
    lawsuitTitle,
    clientName,
  } = eventData;

  const dateFormatted = formatEmailDate(date);

  const subject = t('notifications:clientEmail.subjects.sessionCancelled', { number: lawsuitNumber || t('notifications:clientEmail.body.yourDossier', 'Your Dossier') });

  const detailsKey = lawsuitNumber
    ? 'notifications:clientEmail.body.sessionCancelled.detailsWithLawsuit'
    : 'notifications:clientEmail.body.sessionCancelled.details';

  const details = t(detailsKey, {
    lawsuitNumber,
    lawsuitTitle,
    date: dateFormatted,
    time,
    location
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.sessionCancelled.intro')}

${details}

${t('notifications:clientEmail.body.sessionCancelled.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// TEMPLATE: FINANCIAL ENTRY ADDED (CLIENT-INVOICING)
// ========================================

function financialEntryAddedTemplate(eventData, customT = null) {
  const t = getT(customT);
  const {
    description,
    amountWithSign,
    amount,
    dueDate,
    clientName,
    clientBalance,
  } = eventData;

  const subject = t('notifications:clientEmail.subjects.financialEntryAdded');

  let detailsKey = 'notifications:clientEmail.body.financialEntryAdded.details';
  if (dueDate && clientBalance) {
    detailsKey = 'notifications:clientEmail.body.financialEntryAdded.detailsWithBalance';
  } else if (dueDate) {
    detailsKey = 'notifications:clientEmail.body.financialEntryAdded.detailsWithDueDate';
  }

  const details = t(detailsKey, {
    description,
    amount: amountWithSign || amount || 'N/A',
    dueDate: dueDate ? formatEmailDate(dueDate) : '',
    clientBalance: clientBalance || ''
  });

  const body = `${t('notifications:clientEmail.body.greeting', { name: clientName })}

${t('notifications:clientEmail.body.financialEntryAdded.intro')}

${details}

${t('notifications:clientEmail.body.financialEntryAdded.footer')}

${t('notifications:clientEmail.body.closing', {
    senderName: eventData?.senderName || t('notifications:clientEmail.body.defaultFirm', 'Your Law Firm')
  })}`;

  return { subject, body };
}

// ========================================
// EXPORT EMAIL TEMPLATES
// ========================================

export const emailTemplates = {
  dossier_created: dossierCreatedTemplate,
  dossier_status_changed: dossierStatusChangedTemplate,
  dossier_deadline_changed: dossierDeadlineChangedTemplate,
  lawsuit_created: lawsuitCreatedTemplate,
  lawsuit_status_changed: lawsuitStatusChangedTemplate,
  lawsuit_hearing_changed: lawsuitHearingChangedTemplate,
  session_scheduled: sessionScheduledTemplate,
  session_date_changed: sessionDateChangedTemplate,
  session_cancelled: sessionCancelledTemplate,
  financial_entry_added: financialEntryAddedTemplate,
};

