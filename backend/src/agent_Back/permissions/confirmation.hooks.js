'use strict';

/**
 * Confirmation Hooks
 *
 * UI hooks for user confirmation flows.
 * Ensures explicit user approval before executing sensitive actions.
 *
 * FLOW:
 * 1. Agent proposes action
 * 2. System checks if confirmation required
 * 3. If yes, emit confirmation request to UI
 * 4. UI shows confirmation dialog
 * 5. User approves/rejects
 * 6. System proceeds or blocks
 */

const EventEmitter = require('events');

/**
 * Confirmation Types
 */
const CONFIRMATION_TYPES = Object.freeze({
  // Simple yes/no confirmation
  SIMPLE: 'simple',
  // Confirmation with details review
  DETAILED: 'detailed',
  // Confirmation with modifications allowed
  EDITABLE: 'editable',
  // Multi-step confirmation for high-risk actions
  MULTI_STEP: 'multi_step',
});

/**
 * Confirmation Priorities
 */
const CONFIRMATION_PRIORITY = Object.freeze({
  LOW: 'low', // Can be batched
  NORMAL: 'normal', // Show when convenient
  HIGH: 'high', // Show immediately
  CRITICAL: 'critical', // Block until confirmed
});

/**
 * Confirmation Request
 */
class ConfirmationRequest {
  constructor({
    id,
    type = CONFIRMATION_TYPES.SIMPLE,
    priority = CONFIRMATION_PRIORITY.NORMAL,
    action,
    scope,
    title,
    description,
    details = {},
    expiresIn = 300000, // 5 minutes default
    allowModification = false,
    consequences = [],
    alternatives = [],
  }) {
    this.id = id || `confirm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.type = type;
    this.priority = priority;
    this.action = action;
    this.scope = scope;
    this.title = title;
    this.description = description;
    this.details = details;
    this.expiresIn = expiresIn;
    this.expiresAt = new Date(Date.now() + expiresIn).toISOString();
    this.allowModification = allowModification;
    this.consequences = consequences;
    this.alternatives = alternatives;

    this.status = 'pending';
    this.createdAt = new Date().toISOString();
    this.respondedAt = null;
    this.response = null;
    this.modifiedDetails = null;
  }

  /**
   * Check if expired
   */
  isExpired() {
    return new Date() > new Date(this.expiresAt);
  }

  /**
   * Approve the request
   */
  approve({ modifiedDetails = null, approvedBy = null } = {}) {
    if (this.isExpired()) {
      throw new Error('Confirmation request has expired');
    }
    if (this.status !== 'pending') {
      throw new Error(`Cannot approve: status is ${this.status}`);
    }

    this.status = 'approved';
    this.respondedAt = new Date().toISOString();
    this.response = { approved: true, approvedBy };
    if (modifiedDetails) {
      this.modifiedDetails = modifiedDetails;
    }

    return this;
  }

  /**
   * Reject the request
   */
  reject({ reason = null, rejectedBy = null } = {}) {
    if (this.status !== 'pending') {
      throw new Error(`Cannot reject: status is ${this.status}`);
    }

    this.status = 'rejected';
    this.respondedAt = new Date().toISOString();
    this.response = { approved: false, reason, rejectedBy };

    return this;
  }

  /**
   * Cancel the request (by system)
   */
  cancel(reason) {
    this.status = 'cancelled';
    this.respondedAt = new Date().toISOString();
    this.response = { cancelled: true, reason };

    return this;
  }

  /**
   * Get effective details (modified or original)
   */
  getEffectiveDetails() {
    return this.modifiedDetails || this.details;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      priority: this.priority,
      action: this.action,
      scope: this.scope,
      title: this.title,
      description: this.description,
      details: this.details,
      expiresAt: this.expiresAt,
      allowModification: this.allowModification,
      consequences: this.consequences,
      alternatives: this.alternatives,
      status: this.status,
      createdAt: this.createdAt,
      respondedAt: this.respondedAt,
      response: this.response,
      modifiedDetails: this.modifiedDetails,
    };
  }
}

/**
 * Confirmation Manager
 *
 * Manages confirmation requests and emits events for UI integration.
 */
class ConfirmationManager extends EventEmitter {
  constructor({ ledger = null, defaultTimeout = 300000 }) {
    super();
    this.ledger = ledger;
    this.defaultTimeout = defaultTimeout;
    this._pending = new Map();
    this._history = [];
  }

  /**
   * Request confirmation for an action
   */
  requestConfirmation(options) {
    const request = new ConfirmationRequest({
      ...options,
      expiresIn: options.expiresIn || this.defaultTimeout,
    });

    this._pending.set(request.id, request);

    // Log request
    if (this.ledger) {
      this.ledger.record({
        type: 'confirmation_requested',
        requestId: request.id,
        action: request.action,
        scope: request.scope,
        priority: request.priority,
        timestamp: request.createdAt,
      });
    }

    // Emit event for UI
    this.emit('confirmation:requested', request.toJSON());

    // Set expiration timeout
    setTimeout(() => {
      this._handleExpiration(request.id);
    }, request.expiresIn);

    return request;
  }

  /**
   * Handle user response
   */
  handleResponse(requestId, { approved, reason = null, modifiedDetails = null, respondedBy = null }) {
    const request = this._pending.get(requestId);
    if (!request) {
      throw new Error(`Confirmation request ${requestId} not found`);
    }

    if (approved) {
      request.approve({ modifiedDetails, approvedBy: respondedBy });
    } else {
      request.reject({ reason, rejectedBy: respondedBy });
    }

    this._pending.delete(requestId);
    this._history.push(request);

    // Log response
    if (this.ledger) {
      this.ledger.record({
        type: 'confirmation_responded',
        requestId: request.id,
        approved,
        reason,
        respondedBy,
        timestamp: request.respondedAt,
      });
    }

    // Emit response event
    this.emit('confirmation:responded', request.toJSON());

    return request;
  }

  /**
   * Handle expiration
   */
  _handleExpiration(requestId) {
    const request = this._pending.get(requestId);
    if (!request || request.status !== 'pending') {
      return;
    }

    request.cancel('Request expired');
    this._pending.delete(requestId);
    this._history.push(request);

    if (this.ledger) {
      this.ledger.record({
        type: 'confirmation_expired',
        requestId: request.id,
        timestamp: new Date().toISOString(),
      });
    }

    this.emit('confirmation:expired', request.toJSON());
  }

  /**
   * Get pending requests
   */
  getPending() {
    return Array.from(this._pending.values()).map(r => r.toJSON());
  }

  /**
   * Get request by ID
   */
  getRequest(requestId) {
    return this._pending.get(requestId) || null;
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId, reason) {
    const request = this._pending.get(requestId);
    if (!request) {
      return false;
    }

    request.cancel(reason);
    this._pending.delete(requestId);
    this._history.push(request);

    if (this.ledger) {
      this.ledger.record({
        type: 'confirmation_cancelled',
        requestId: request.id,
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    this.emit('confirmation:cancelled', request.toJSON());
    return true;
  }

  /**
   * Get history
   */
  getHistory(limit = 50) {
    return this._history.slice(-limit).map(r => r.toJSON());
  }
}

/**
 * Confirmation UI Payload Builders
 *
 * Helpers to build UI-friendly confirmation payloads.
 */
const ConfirmationPayloads = {
  /**
   * Build task creation confirmation
   */
  taskCreation({ task, dossier }) {
    return {
      type: CONFIRMATION_TYPES.DETAILED,
      priority: CONFIRMATION_PRIORITY.NORMAL,
      action: 'create_task',
      scope: 'execute:task:create',
      title: 'Aufgabe erstellen / Create Task',
      description: `Der Agent mochte eine neue Aufgabe erstellen.`,
      details: {
        taskTitle: task.title,
        dossierReference: dossier?.reference,
        dueDate: task.dueDate,
        priority: task.priority,
        assignee: task.assignee,
      },
      consequences: [
        'Eine neue Aufgabe wird im System angelegt',
        'Zugewiesene Personen werden benachrichtigt',
      ],
      alternatives: [
        { label: 'Bearbeiten', action: 'modify' },
        { label: 'Spater', action: 'postpone' },
      ],
      allowModification: true,
    };
  },

  /**
   * Build reminder confirmation
   */
  reminderCreation({ reminder }) {
    return {
      type: CONFIRMATION_TYPES.SIMPLE,
      priority: CONFIRMATION_PRIORITY.LOW,
      action: 'create_reminder',
      scope: 'execute:reminder:set',
      title: 'Erinnerung setzen / Set Reminder',
      description: `Der Agent mochte eine Erinnerung setzen.`,
      details: {
        message: reminder.message,
        remindAt: reminder.remindAt,
      },
      consequences: [
        'Sie erhalten eine Benachrichtigung zum angegebenen Zeitpunkt',
      ],
    };
  },

  /**
   * Build email sending confirmation
   */
  emailSending({ email, recipient }) {
    return {
      type: CONFIRMATION_TYPES.EDITABLE,
      priority: CONFIRMATION_PRIORITY.HIGH,
      action: 'send_email',
      scope: 'execute:email:queue',
      title: 'E-Mail senden / Send Email',
      description: `Der Agent mochte eine E-Mail versenden.`,
      details: {
        to: recipient.email,
        subject: email.subject,
        body: email.body,
      },
      consequences: [
        'Eine E-Mail wird an den Mandanten gesendet',
        'Die Kommunikation wird im Dossier protokolliert',
      ],
      allowModification: true,
    };
  },

  /**
   * Build external search confirmation
   */
  externalSearch({ query, sources }) {
    return {
      type: CONFIRMATION_TYPES.SIMPLE,
      priority: CONFIRMATION_PRIORITY.NORMAL,
      action: 'external_search',
      scope: 'external:web:search',
      title: 'Externe Suche / External Search',
      description: `Der Agent mochte eine externe Suche durchfuhren.`,
      details: {
        query,
        sources: sources.join(', '),
      },
      consequences: [
        'Suchanfragen werden an externe Dienste gesendet',
        'Ergebnisse werden nicht gespeichert',
      ],
    };
  },

  /**
   * Build tier upgrade confirmation
   */
  tierUpgrade({ currentTier, newTier, newPermissions }) {
    return {
      type: CONFIRMATION_TYPES.DETAILED,
      priority: CONFIRMATION_PRIORITY.HIGH,
      action: 'upgrade_trust_tier',
      scope: 'system:trust:upgrade',
      title: 'Vertrauensstufe erhohen / Upgrade Trust Tier',
      description: `Der Agent hat sich fur eine hohere Vertrauensstufe qualifiziert.`,
      details: {
        currentTier: currentTier.name,
        newTier: newTier.name,
        newPermissions: newPermissions,
      },
      consequences: [
        `Der Agent erhalt Zugriff auf: ${newPermissions.join(', ')}`,
        'Diese Entscheidung kann jederzeit ruckgangig gemacht werden',
      ],
    };
  },
};

module.exports = {
  CONFIRMATION_TYPES,
  CONFIRMATION_PRIORITY,
  ConfirmationRequest,
  ConfirmationManager,
  ConfirmationPayloads,
};
