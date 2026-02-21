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

import { emailTemplates } from "./emailTemplates";
import { openExternalMailto } from "../lib/externalLink";

// ========================================
// CLIENT-RELEVANT EVENT DETECTION
// ========================================

/**
 * Determines if an action warrants prompting for client notification
 *
 * @param {string} entityType - Type of entity (dossier, lawsuit, session, etc.)
 * @param {string} action - Action performed (changeStatus, create, edit, delete)
 * @param {object} context - Action context (oldValue, newValue, data, etc.)
 * @param {object} entities - All entities data { clients, dossiers, lawsuits, etc. }
 * @param {object} notificationPrefs - User notification preferences (from SettingsContext)
 * @returns {object|null} { shouldPrompt: true, eventType: "dossier_closed", eventData: {...} } or null
 */
export function shouldPromptClientNotification(
  entityType,
  action,
  context = {},
  entities = {},
  notificationPrefs = null,
) {
  // Check global email notification preference
  if (notificationPrefs?.clientEmails?.enabled === false) {
    return null;
  }

  // Check category-specific preference
  const categoryMap = {
    dossier: "dossiers",
    lawsuit: "lawsuits",
    session: "sessions",
    financialEntry: "financial",
  };
  const category = categoryMap[entityType];
  if (category && notificationPrefs?.clientEmails?.[category] === false) {
    return null;
  }

  const detector = EVENT_DETECTORS[entityType];

  if (!detector) {
    return null; // No notification logic for this entity type
  }

  const actionDetector = detector[action];

  if (!actionDetector) {
    return null; // No notification logic for this action
  }

  return actionDetector(context, entities);
}

// Helper: resolve client info from ids or nested data
function resolveClientInfo(data = {}, entities) {
  // Handle null or undefined entities
  if (!entities || typeof entities !== "object") {
    entities = {};
  }

  const { clients = [], dossiers = [], lawsuits = [] } = entities;

  // Prefer explicit clientId
  let clientId = data.clientId || data.client?.id;

  // Try dossier reference
  if (!clientId && data.dossierId) {
    const dossier = dossiers.find((d) => d.id === parseInt(data.dossierId, 10));
    if (dossier) clientId = dossier.clientId || dossier.client_id;
  }

  // Try lawsuit reference
  if (!clientId && data.lawsuitId) {
    const lawsuitItem = lawsuits.find(
      (c) => c.id === parseInt(data.lawsuitId, 10),
    );
    if (lawsuitItem) {
      clientId =
        lawsuitItem.clientId ||
        lawsuitItem.client_id ||
        (() => {
          const dossier = dossiers.find(
            (d) => d.id === lawsuitItem.dossierId || lawsuitItem.dossier_id,
          );
          return dossier?.clientId || dossier?.client_id;
        })();
    }
  }

  // Try nested lawsuit/dossier objects
  if (!clientId && data.dossier?.clientId) clientId = data.dossier.clientId;
  if (!clientId && data.lawsuit?.dossier?.clientId)
    clientId = data.lawsuit.dossier.clientId;

  const client = clients.find((c) => c.id === clientId);
  return {
    clientId,
    clientName: data.clientName || data.client?.name || client?.name,
  };
}

// ========================================
// EVENT DETECTORS BY ENTITY TYPE
// ========================================

const EVENT_DETECTORS = {
  dossier: {
    create: detectDossierCreated,
    changeStatus: detectDossierStatusChange,
    edit: detectDossierDeadlineChange,
  },
  lawsuit: {
    create: detectLawsuitCreated,
    changeStatus: detectLawsuitStatusChange,
    edit: detectLawsuitHearingChange,
  },
  session: {
    create: detectSessionCreated,
    edit: detectSessionDateChange,
    changeStatus: detectSessionCancellation,
  },
  financialEntry: {
    add: detectFinancialEntryAdded,
    create: detectFinancialEntryAdded,
  },
};

/**
 * Detect Dossier creation
 */
function detectDossierCreated(context, entities) {
  const { data } = context;

  const { clientId, clientName } = resolveClientInfo(data, entities);
  if (!clientId) return null;

  return {
    shouldPrompt: true,
    eventType: "dossier_created",
    eventData: {
      dossierNumber: data.lawsuitNumber,
      dossierTitle: data.title,
      clientId,
      clientName,
      joinDate: data.joinDate,
    },
  };
}

/**
 * Detect Dossier status changes that are client-relevant
 */
function detectDossierStatusChange(context, entities) {
  const { oldValue, newValue, data } = context;

  // Client-relevant status changes
  const relevantStatuses = ["Closed", "Suspended", "Open"];

  // Only trigger if status actually changed AND is client-relevant
  if (oldValue === newValue || !relevantStatuses.includes(newValue)) {
    return null;
  }

  // Special case: Reopening (Closed → Open)
  const isReopening = oldValue === "Closed" && newValue === "Open";

  const { clientId, clientName } = resolveClientInfo(data, entities);

  return {
    shouldPrompt: true,
    eventType: "dossier_status_changed",
    eventData: {
      dossierNumber: data.lawsuitNumber,
      dossierTitle: data.title,
      clientId,
      clientName,
      oldStatus: oldValue,
      newStatus: newValue,
      isReopening,
    },
  };
}

/**
 * Detect significant deadline changes (>7 days)
 */
function detectDossierDeadlineChange(context, entities) {
  const { data, newData } = context;

  // Check if deadline field is being changed
  if (!("nextDeadline" in newData)) {
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

  const { clientId, clientName } = resolveClientInfo(data, entities);

  return {
    shouldPrompt: true,
    eventType: "dossier_deadline_changed",
    eventData: {
      dossierNumber: data.lawsuitNumber,
      dossierTitle: data.title,
      clientId,
      clientName,
      oldDeadline,
      newDeadline,
      diffDays: Math.round(diffDays),
    },
  };
}

/**
 * Detect Procès (Lawsuit) creation
 */
function detectLawsuitCreated(context, entities) {
  const { data } = context;

  const { clientId, clientName } = resolveClientInfo(data, entities);

  if (!clientId) return null;

  return {
    shouldPrompt: true,
    eventType: "lawsuit_created",
    eventData: {
      lawsuitNumber: data.lawsuitNumber,
      lawsuitTitle: data.title,
      court: data.court,
      clientId,
      clientName,
    },
  };
}

/**
 * Detect Procès (Lawsuit) status changes
 */
function detectLawsuitStatusChange(context, entities) {
  const { oldValue, newValue, data } = context;

  // Client-relevant status changes
  const relevantStatuses = ["Clos", "Suspendu"];

  if (oldValue === newValue || !relevantStatuses.includes(newValue)) {
    return null;
  }

  // Get client info from dossier/lawsuit refs
  const { clientId, clientName } = resolveClientInfo(data, entities);

  return {
    shouldPrompt: true,
    eventType: "lawsuit_status_changed",
    eventData: {
      lawsuitNumber: data.lawsuitNumber,
      lawsuitTitle: data.title,
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
function detectLawsuitHearingChange(context, entities) {
  const { data, newData } = context;

  // Check if nextHearing field is being changed
  if (!("nextHearing" in newData)) {
    return null;
  }

  const oldHearing = data.nextHearing;
  const newHearing = newData.nextHearing;

  // No change
  if (oldHearing === newHearing) {
    return null;
  }

  // Get client info
  const { clientId, clientName } = resolveClientInfo(
    { ...data, ...newData },
    entities,
  );

  return {
    shouldPrompt: true,
    eventType: "lawsuit_hearing_changed",
    eventData: {
      lawsuitNumber: data.lawsuitNumber,
      lawsuitTitle: data.title,
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

  // Get client info from linked lawsuit or dossier (fallback to ids)
  const { clientId, clientName } = resolveClientInfo(data);

  if (!clientId) {
    return null; // No client link
  }

  return {
    shouldPrompt: true,
    eventType: "session_scheduled",
    eventData: {
      sessionTitle: data.title,
      sessionType: data.type,
      date: data.date,
      time: data.time,
      location: data.location,
      duration: data.duration,
      lawsuitNumber: data.lawsuit?.lawsuitNumber || data.lawsuitId,
      lawsuitTitle: data.lawsuit?.title,
      clientId,
      clientName,
    },
  };
}

/**
 * Detect Session date/time changes
 */
function detectSessionDateChange(context, entities) {
  const { data, newData } = context;

  // Check if date or time changed
  const dateChanged = "date" in newData && data.date !== newData.date;
  const timeChanged = "time" in newData && data.time !== newData.time;

  if (!dateChanged && !timeChanged) {
    return null;
  }

  // Get client info
  const { clientId, clientName } = resolveClientInfo(
    { ...data, ...newData },
    entities,
  );

  if (!clientId) {
    return null;
  }

  return {
    shouldPrompt: true,
    eventType: "session_date_changed",
    eventData: {
      sessionTitle: data.title,
      location: data.location,
      oldDate: data.date,
      oldTime: data.time,
      newDate: newData.date || data.date,
      newTime: newData.time || data.time,
      lawsuitNumber: data.lawsuit?.lawsuitNumber,
      lawsuitTitle: data.lawsuit?.title,
      clientId,
      clientName,
    },
  };
}

/**
 * Detect Session cancellation
 */
function detectSessionCancellation(context, entities) {
  const { oldValue, newValue, data } = context;

  // Only if status changed to Annulée
  if (newValue !== "Annulée" || oldValue === "Annulée") {
    return null;
  }

  // Get client info
  const { clientId, clientName } = resolveClientInfo(data, entities);

  if (!clientId) {
    return null;
  }

  return {
    shouldPrompt: true,
    eventType: "session_cancelled",
    eventData: {
      sessionTitle: data.title,
      date: data.date,
      time: data.time,
      location: data.location,
      lawsuitNumber: data.lawsuit?.lawsuitNumber,
      lawsuitTitle: data.lawsuit?.title,
      clientId,
      clientName,
    },
  };
}

/**
 * Detect financial entry creation that impacts client balance
 */
function detectFinancialEntryAdded(context, entities) {
  const { data } = context;

  const { clientId, clientName } = resolveClientInfo(data, entities);
  if (!clientId) return null;

  // Only notify for client-scope entries (not internal-only)
  if (data.scope && data.scope !== "client") return null;

  return {
    shouldPrompt: true,
    eventType: "financial_entry_added",
    eventData: {
      description: data.description,
      amountWithSign: data.amountWithSign,
      amount: data.amount,
      dueDate: data.dueDate,
      clientId,
      clientName,
      clientBalance: data.clientBalance,
    },
  };
}

// ========================================
// EMAIL GENERATION
// ========================================

/**
 * Generate client email based on event type
 *
 * @param {string} eventType - Type of event (dossier_closed, lawsuit_hearing_changed, etc.)
 * @param {object} eventData - Event-specific data
 * @returns {object} { subject, body, clientEmail }
 */
const STORAGE_KEY_CLIENTS = "lawyer-app:data:clients";

const resolveClientFromStorage = (clientId) => {
  if (typeof window === "undefined" || !clientId) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CLIENTS);
    if (!raw) return null;
    const clients = JSON.parse(raw);
    return clients.find((c) => String(c.id) === String(clientId)) || null;
  } catch (_err) {
    return null;
  }
};

export function generateClientEmail(eventType, eventData) {
  const template = emailTemplates[eventType];

  if (!template) {
    throw new Error(`No email template found for event type: ${eventType}`);
  }

  // Resolve client info: prefer explicit eventData, fallback to cached clients from storage
  const clientFromEvent = eventData.client || null;
  const clientFromStorage = resolveClientFromStorage(eventData.clientId);
  const resolvedClient = clientFromEvent || clientFromStorage || null;

  const clientEmail = eventData.clientEmail || resolvedClient?.email || null;
  if (!clientEmail) {
    console.warn(
      "[clientCommunication] Client email missing for clientId:",
      eventData.clientId,
    );
    return null;
  }

  // Resolve client name (fallback to generic label)
  const resolvedClientName =
    eventData.clientName || resolvedClient?.name || "votre client";
  const enrichedEventData = { ...eventData, clientName: resolvedClientName };

  // Generate email from template with enriched data
  const email = template(enrichedEventData);

  return {
    ...email,
    clientEmail,
    clientName: resolvedClientName,
  };
}

// ========================================
// NOTIFICATION CHANNELS
// ========================================

/**
 * Send email notification to client via mailto: link (MVP).
 *
 * Opens the user's default email client with pre-filled content.
 * This is simple and requires no backend configuration.
 *
 * FUTURE: Can be switched to backend API for automated sending.
 *
 * @param {object} email - Email object { subject, body, clientEmail }
 * @returns {Promise<boolean>} Success status
 */
export async function sendEmailNotification(email) {
  try {
    // Build mailto: URL with encoded parameters
    const mailtoUrl = `mailto:${encodeURIComponent(email.clientEmail)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    await openExternalMailto(mailtoUrl);

    return true;
  } catch (error) {
    console.error("❌ Error opening email client:", error);
    return false;
  }
}

/**
 * Send mobile push notification (FUTURE)
 *
 * @param {object} notification - Notification object
 * @returns {Promise<boolean>}
 */
export async function sendMobileNotification(notification) {
  // FUTURE IMPLEMENTATION
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
export async function sendClientNotification(
  eventType,
  eventData,
  options = {},
) {
  const channels = options.channels || ["email"]; // Default: email only

  const results = {};

  // EMAIL CHANNEL
  if (channels.includes("email")) {
    try {
      const email = generateClientEmail(eventType, eventData);
      if (email) {
        const success = await sendEmailNotification(email);
        results.email = success;
      } else {
        results.email = false;
      }
    } catch (error) {
      console.error("Error sending email notification:", error);
      results.email = false;
    }
  }

  // MOBILE CHANNEL (FUTURE)
  if (channels.includes("mobile")) {
    try {
      const success = await sendMobileNotification({ eventType, eventData });
      results.mobile = success;
    } catch (error) {
      console.error("Error sending mobile notification:", error);
      results.mobile = false;
    }
  }

  // IN-APP CHANNEL (FUTURE)
  if (channels.includes("in-app")) {
    try {
      const success = await sendInAppNotification({ eventType, eventData });
      results.inApp = success;
    } catch (error) {
      console.error("Error sending in-app notification:", error);
      results.inApp = false;
    }
  }

  const overallSuccess = Object.values(results).some((success) => success);

  return {
    success: overallSuccess,
    channels: results,
  };
}

// ========================================
// LIGHTWEIGHT PENDING NOTIFICATION BUFFER
// ========================================

// For flows that navigate immediately after create/edit, stash the pending notification
// and let the destination screen present it. We keep it until the user explicitly handles it.
let pendingNotification = null;
export function setPendingNotification(notification) {
  pendingNotification = notification;
}
export function getPendingNotification() {
  return pendingNotification;
}
export function clearPendingNotification() {
  pendingNotification = null;
}
