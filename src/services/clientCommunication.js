/**
 * Client Communication System (MVP - Email Based)
 *
 * ARCHITECTURE OVERVIEW:
 * =====================
 * This module provides a user-controlled, event-driven client notification system.
 * - Notifications are NEVER sent automatically
 * - Lawyer explicitly chooses whether to notify the client
 * - Notifications happen AFTER successful actions
 * - Designed to be channel-agnostic (email today, mobile app tomorrow)
 *
 * KEY PRINCIPLES:
 * ===============
 * ❌ No automatic emails
 * ❌ No silent client notifications
 * ❌ No blocking user actions
 * ✅ Lawyer always chooses
 * ✅ Notification after action succeeds
 * ✅ Frontend-driven logic only
 * ✅ Future backend hooks ready
 *
 * USAGE FLOW:
 * ===========
 * 1. User performs action (e.g., change dossier status to "Fermé")
 * 2. Action succeeds (domain rules pass)
 * 3. System detects client-relevant event via `shouldPromptClientNotification()`
 * 4. UI shows prompt: "Souhaitez-vous notifier le client ?"
 * 5. If yes → generate email via `generateClientEmail()` → send via email channel
 * 6. If no → action completes silently
 *
 * FUTURE EXTENSIBILITY:
 * =====================
 * - Email channel (current): sendEmailNotification()
 * - Mobile push (future): sendMobileNotification()
 * - In-app notification (future): sendInAppNotification()
 * - SMS (future): sendSMSNotification()
 */

import { mockClients } from '../utils/mockData';
import { emailTemplates } from './emailTemplates';

// ========================================
// CLIENT-RELEVANT EVENT DETECTION
// ========================================

/**
 * Determines if an action warrants prompting for client notification
 *
 * @param {string} entityType - Type of entity (dossier, case, session, etc.)
 * @param {string} action - Action performed (changeStatus, create, edit, delete)
 * @param {object} context - Action context (oldValue, newValue, data, etc.)
 * @returns {object|null} { shouldPrompt: true, eventType: "dossier_closed", eventData: {...} } or null
 */
export function shouldPromptClientNotification(entityType, action, context = {}) {
  const detector = EVENT_DETECTORS[entityType];

  if (!detector) {
    return null; // No notification logic for this entity type
  }

  const actionDetector = detector[action];

  if (!actionDetector) {
    return null; // No notification logic for this action
  }

  return actionDetector(context);
}

// ========================================
// EVENT DETECTORS BY ENTITY TYPE
// ========================================

const EVENT_DETECTORS = {
  dossier: {
    changeStatus: detectDossierStatusChange,
    edit: detectDossierDeadlineChange,
  },
  case: {
    changeStatus: detectCaseStatusChange,
    edit: detectCaseHearingChange,
  },
  session: {
    create: detectSessionCreated,
    edit: detectSessionDateChange,
    changeStatus: detectSessionCancellation,
  },
};

/**
 * Detect Dossier status changes that are client-relevant
 */
function detectDossierStatusChange(context) {
  const { oldValue, newValue, data } = context;

  // Client-relevant status changes
  const relevantStatuses = ['Fermé', 'Suspendu', 'Ouvert'];

  // Only trigger if status actually changed AND is client-relevant
  if (oldValue === newValue || !relevantStatuses.includes(newValue)) {
    return null;
  }

  // Special case: Reopening (Fermé → Ouvert)
  const isReopening = oldValue === 'Fermé' && newValue === 'Ouvert';

  return {
    shouldPrompt: true,
    eventType: 'dossier_status_changed',
    eventData: {
      dossierNumber: data.caseNumber,
      dossierTitle: data.title,
      clientId: data.clientId,
      clientName: data.client?.name,
      oldStatus: oldValue,
      newStatus: newValue,
      isReopening,
    },
  };
}

/**
 * Detect significant deadline changes (>7 days)
 */
function detectDossierDeadlineChange(context) {
  const { data, newData } = context;

  // Check if deadline field is being changed
  if (!('nextDeadline' in newData)) {
    return null;
  }

  const oldDeadline = data.nextDeadline;
  const newDeadline = newData.nextDeadline;

  // No change
  if (oldDeadline === newDeadline) {
    return null;
  }

  // Calculate difference in days
  const oldDate = oldDeadline ? new Date(oldDeadline) : null;
  const newDate = newDeadline ? new Date(newDeadline) : null;

  if (!oldDate || !newDate) {
    return null; // Can't calculate difference
  }

  const diffDays = Math.abs((newDate - oldDate) / (1000 * 60 * 60 * 24));

  // Only notify if change is significant (>7 days)
  if (diffDays <= 7) {
    return null;
  }

  return {
    shouldPrompt: true,
    eventType: 'dossier_deadline_changed',
    eventData: {
      dossierNumber: data.caseNumber,
      dossierTitle: data.title,
      clientId: data.clientId,
      clientName: data.client?.name,
      oldDeadline,
      newDeadline,
      diffDays: Math.round(diffDays),
    },
  };
}

/**
 * Detect Procès (Case) status changes
 */
function detectCaseStatusChange(context) {
  const { oldValue, newValue, data } = context;

  // Client-relevant status changes
  const relevantStatuses = ['Clos', 'Suspendu'];

  if (oldValue === newValue || !relevantStatuses.includes(newValue)) {
    return null;
  }

  // Get client info from dossier
  const clientId = data.dossier?.clientId || data.clientId;
  const clientName = data.dossier?.client?.name || data.client?.name;

  return {
    shouldPrompt: true,
    eventType: 'case_status_changed',
    eventData: {
      caseNumber: data.caseNumber,
      caseTitle: data.title,
      court: data.court,
      clientId,
      clientName,
      oldStatus: oldValue,
      newStatus: newValue,
    },
  };
}

/**
 * Detect next hearing date changes
 */
function detectCaseHearingChange(context) {
  const { data, newData } = context;

  // Check if nextHearing field is being changed
  if (!('nextHearing' in newData)) {
    return null;
  }

  const oldHearing = data.nextHearing;
  const newHearing = newData.nextHearing;

  // No change
  if (oldHearing === newHearing) {
    return null;
  }

  // Get client info
  const clientId = data.dossier?.clientId || data.clientId;
  const clientName = data.dossier?.client?.name || data.client?.name;

  return {
    shouldPrompt: true,
    eventType: 'case_hearing_changed',
    eventData: {
      caseNumber: data.caseNumber,
      caseTitle: data.title,
      court: data.court,
      clientId,
      clientName,
      oldDate: oldHearing,
      newDate: newHearing,
    },
  };
}

/**
 * Detect Session (Audience) creation
 */
function detectSessionCreated(context) {
  const { data } = context;

  // Only notify for Audience type sessions (not internal consultations)
  if (data.type !== 'Audience') {
    return null;
  }

  // Get client info from linked case or dossier
  const clientId = data.case?.dossier?.clientId || data.dossier?.clientId;
  const clientName = data.case?.dossier?.client?.name || data.dossier?.client?.name;

  if (!clientId) {
    return null; // No client link
  }

  return {
    shouldPrompt: true,
    eventType: 'session_scheduled',
    eventData: {
      sessionTitle: data.title,
      sessionType: data.type,
      date: data.date,
      time: data.time,
      location: data.location,
      duration: data.duration,
      caseNumber: data.case?.caseNumber || data.caseId,
      caseTitle: data.case?.title,
      clientId,
      clientName,
    },
  };
}

/**
 * Detect Session date/time changes
 */
function detectSessionDateChange(context) {
  const { data, newData } = context;

  // Only for Audience type
  if (data.type !== 'Audience') {
    return null;
  }

  // Check if date or time changed
  const dateChanged = 'date' in newData && data.date !== newData.date;
  const timeChanged = 'time' in newData && data.time !== newData.time;

  if (!dateChanged && !timeChanged) {
    return null;
  }

  // Get client info
  const clientId = data.case?.dossier?.clientId || data.dossier?.clientId;
  const clientName = data.case?.dossier?.client?.name || data.dossier?.client?.name;

  if (!clientId) {
    return null;
  }

  return {
    shouldPrompt: true,
    eventType: 'session_date_changed',
    eventData: {
      sessionTitle: data.title,
      location: data.location,
      oldDate: data.date,
      oldTime: data.time,
      newDate: newData.date || data.date,
      newTime: newData.time || data.time,
      caseNumber: data.case?.caseNumber,
      caseTitle: data.case?.title,
      clientId,
      clientName,
    },
  };
}

/**
 * Detect Session cancellation
 */
function detectSessionCancellation(context) {
  const { oldValue, newValue, data } = context;

  // Only for Audience type
  if (data.type !== 'Audience') {
    return null;
  }

  // Only if status changed to Annulée
  if (newValue !== 'Annulée' || oldValue === 'Annulée') {
    return null;
  }

  // Get client info
  const clientId = data.case?.dossier?.clientId || data.dossier?.clientId;
  const clientName = data.case?.dossier?.client?.name || data.dossier?.client?.name;

  if (!clientId) {
    return null;
  }

  return {
    shouldPrompt: true,
    eventType: 'session_cancelled',
    eventData: {
      sessionTitle: data.title,
      date: data.date,
      time: data.time,
      location: data.location,
      caseNumber: data.case?.caseNumber,
      caseTitle: data.case?.title,
      clientId,
      clientName,
    },
  };
}

// ========================================
// EMAIL GENERATION
// ========================================

/**
 * Generate client email based on event type
 *
 * @param {string} eventType - Type of event (dossier_closed, case_hearing_changed, etc.)
 * @param {object} eventData - Event-specific data
 * @returns {object} { subject, body, clientEmail }
 */
export function generateClientEmail(eventType, eventData) {
  const template = emailTemplates[eventType];

  if (!template) {
    throw new Error(`No email template found for event type: ${eventType}`);
  }

  // Get client email
  const client = mockClients.find(c => c.id === eventData.clientId);
  const clientEmail = client?.email;

  if (!clientEmail) {
    throw new Error(`Client email not found for clientId: ${eventData.clientId}`);
  }

  // Generate email from template
  const email = template(eventData);

  return {
    ...email,
    clientEmail,
    clientName: eventData.clientName,
  };
}

// ========================================
// NOTIFICATION CHANNELS
// ========================================

/**
 * Send email notification to client (MVP implementation)
 *
 * CURRENT: Frontend-only simulation (logs to console)
 * FUTURE: Backend API call to email service
 *
 * @param {object} email - Email object { subject, body, clientEmail }
 * @returns {Promise<boolean>} Success status
 */
export async function sendEmailNotification(email) {
  console.log('📧 CLIENT EMAIL NOTIFICATION (MVP - Simulated)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`To: ${email.clientEmail}`);
  console.log(`Subject: ${email.subject}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(email.body);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // FUTURE: Replace with actual backend call
  // const response = await fetch('/api/notifications/email', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(email),
  // });
  // return response.ok;

  // MVP: Simulate success
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 500);
  });
}

/**
 * Send mobile push notification (FUTURE)
 *
 * @param {object} notification - Notification object
 * @returns {Promise<boolean>}
 */
export async function sendMobileNotification(notification) {
  // FUTURE IMPLEMENTATION
  console.log('📱 MOBILE NOTIFICATION (Future feature)', notification);
  return Promise.resolve(true);
}

/**
 * Send in-app notification (FUTURE)
 *
 * @param {object} notification - Notification object
 * @returns {Promise<boolean>}
 */
export async function sendInAppNotification(notification) {
  // FUTURE IMPLEMENTATION
  console.log('🔔 IN-APP NOTIFICATION (Future feature)', notification);
  return Promise.resolve(true);
}

// ========================================
// UNIFIED NOTIFICATION API
// ========================================

/**
 * Send notification via appropriate channel(s)
 *
 * CURRENT: Email only
 * FUTURE: Multi-channel (email + mobile + in-app)
 *
 * @param {string} eventType - Event type
 * @param {object} eventData - Event data
 * @param {object} options - Notification options { channels: ['email', 'mobile', 'in-app'] }
 * @returns {Promise<object>} { success: boolean, channels: { email: true, mobile: false } }
 */
export async function sendClientNotification(eventType, eventData, options = {}) {
  const channels = options.channels || ['email']; // Default: email only

  const results = {};

  // EMAIL CHANNEL
  if (channels.includes('email')) {
    try {
      const email = generateClientEmail(eventType, eventData);
      const success = await sendEmailNotification(email);
      results.email = success;
    } catch (error) {
      console.error('Error sending email notification:', error);
      results.email = false;
    }
  }

  // MOBILE CHANNEL (FUTURE)
  if (channels.includes('mobile')) {
    try {
      const success = await sendMobileNotification({ eventType, eventData });
      results.mobile = success;
    } catch (error) {
      console.error('Error sending mobile notification:', error);
      results.mobile = false;
    }
  }

  // IN-APP CHANNEL (FUTURE)
  if (channels.includes('in-app')) {
    try {
      const success = await sendInAppNotification({ eventType, eventData });
      results.inApp = success;
    } catch (error) {
      console.error('Error sending in-app notification:', error);
      results.inApp = false;
    }
  }

  const overallSuccess = Object.values(results).some(success => success);

  return {
    success: overallSuccess,
    channels: results,
  };
}
