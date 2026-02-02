'use strict';

/**
 * UI Rendering Safety Contract
 *
 * CRITICAL: This contract defines HOW agent outputs can be rendered in the UI.
 *
 * This is NOT UI code. This is RULES for rendering.
 * The UI MUST follow these rules. No shortcuts, no assumptions.
 *
 * Free-text rendering is FORBIDDEN outside defined sections.
 * All content must be structured and explicitly typed.
 */

/**
 * Draft Render Rules
 *
 * Drafts must be rendered section-by-section.
 * Each section is a separate UI element.
 */
const DRAFT_RENDER_RULES = Object.freeze({
  /**
   * STRUCTURE
   * Drafts have THREE sections: header, body, footer
   * Each section is rendered independently
   */
  sections: ['header', 'body', 'footer'],

  /**
   * FORBIDDEN
   * These render patterns are NOT ALLOWED:
   * - Free-text rendering of entire draft
   * - Markdown parsing of draft content
   * - HTML injection
   * - Concatenation without section boundaries
   * - Custom formatting outside sections
   */
  forbidden: [
    'free_text_render',
    'markdown_parse',
    'html_injection',
    'section_concatenation',
    'custom_formatting',
  ],

  /**
   * REQUIRED
   * UI must render:
   * - Section labels (Header, Body, Footer)
   * - Visual separation between sections
   * - Draft metadata (type, tone, status, requiresValidation)
   * - Clear "REQUIRES VALIDATION" indicator
   */
  required: [
    'section_labels',
    'section_separation',
    'metadata_display',
    'validation_indicator',
  ],

  /**
   * TONE RENDERING
   * Tone affects ONLY visual styling, NOT content
   */
  toneRendering: {
    FORMAL: {
      description: 'Formal drafts use serif fonts, higher line spacing',
      visualOnly: true,
    },
    NEUTRAL: {
      description: 'Neutral drafts use sans-serif fonts, standard spacing',
      visualOnly: true,
    },
  },

  /**
   * TYPE RENDERING
   * Type determines UI icon/badge, NOT content
   */
  typeRendering: {
    INVITATION: {
      icon: 'calendar',
      badge: 'Invitation',
      requiresRecipient: true,
    },
    CLIENT_EMAIL: {
      icon: 'mail',
      badge: 'Client Email',
      requiresRecipient: true,
    },
    HEARING_SUMMARY: {
      icon: 'file-text',
      badge: 'Hearing Summary',
      requiresRecipient: false,
    },
    INTERNAL_NOTE: {
      icon: 'note',
      badge: 'Internal Note',
      requiresRecipient: false,
    },
  },
});

/**
 * Risk Render Rules
 *
 * Risks must be rendered as categorized lists, NOT prose.
 */
const RISK_RENDER_RULES = Object.freeze({
  /**
   * STRUCTURE
   * Risks are grouped by:
   * 1. Severity (HIGH → MEDIUM → LOW)
   * 2. Category (8 operational categories)
   */
  grouping: {
    primary: 'severity',
    secondary: 'category',
    order: ['HIGH', 'MEDIUM', 'LOW'],
  },

  /**
   * FORBIDDEN
   * These render patterns are NOT ALLOWED:
   * - Prose summary ("You have 3 high risks...")
   * - Risk score as color/emotion ("DANGER", "WARNING")
   * - Free-text risk descriptions without structure
   * - Combining risks into single narrative
   */
  forbidden: [
    'prose_summary',
    'emotion_colors',
    'unstructured_descriptions',
    'narrative_combination',
  ],

  /**
   * REQUIRED
   * UI must render:
   * - Risk category badge (DEADLINE, DEPENDENCY, etc.)
   * - Severity indicator (HIGH/MEDIUM/LOW)
   * - Risk description (factual, no speculation)
   * - Affected entity reference
   * - Risk score (0-100)
   * - Summary counts (total, by severity, by category)
   */
  required: [
    'category_badge',
    'severity_indicator',
    'description',
    'affected_entity',
    'risk_score',
    'summary_counts',
  ],

  /**
   * CATEGORY RENDERING
   * Each category has specific UI treatment
   */
  categoryRendering: {
    DEADLINE: {
      icon: 'clock',
      color: 'red',
      label: 'Deadline Risk',
    },
    DEPENDENCY: {
      icon: 'link',
      color: 'orange',
      label: 'Dependency',
    },
    STATE_INCONSISTENCY: {
      icon: 'alert-triangle',
      color: 'yellow',
      label: 'State Inconsistency',
    },
    ACCOUNTING_GAP: {
      icon: 'dollar-sign',
      color: 'purple',
      label: 'Accounting Gap',
    },
    MISSING_DOCUMENT: {
      icon: 'file-x',
      color: 'blue',
      label: 'Missing Document',
    },
    UNASSIGNED_RESPONSIBILITY: {
      icon: 'user-x',
      color: 'gray',
      label: 'Unassigned',
    },
    NO_RECENT_ACTIVITY: {
      icon: 'activity',
      color: 'gray',
      label: 'No Activity',
    },
    SESSION_PREPARATION_GAP: {
      icon: 'calendar-x',
      color: 'red',
      label: 'Preparation Gap',
    },
  },

  /**
   * SEVERITY RENDERING
   * Severity affects visual weight, NOT emotion
   */
  severityRendering: {
    HIGH: {
      weight: 'bold',
      size: 'large',
      priority: 1,
    },
    MEDIUM: {
      weight: 'semibold',
      size: 'medium',
      priority: 2,
    },
    LOW: {
      weight: 'normal',
      size: 'small',
      priority: 3,
    },
  },
});

/**
 * Action Proposal Render Rules
 *
 * Action proposals must be rendered as cards with explicit status.
 */
const ACTION_PROPOSAL_RENDER_RULES = Object.freeze({
  /**
   * STRUCTURE
   * Each action proposal is a card with:
   * - Proposal ID
   * - Action type
   * - Human-readable summary
   * - Status (explicit)
   * - Affected entities
   * - Confirmation requirements
   */
  structure: {
    layout: 'card',
    sections: [
      'proposal_id',
      'action_type',
      'summary',
      'status',
      'affected_entities',
      'confirmation',
    ],
  },

  /**
   * FORBIDDEN
   * These render patterns are NOT ALLOWED:
   * - Implicit confirmation ("Click to proceed")
   * - Hidden status
   * - Auto-execution buttons
   * - Bypassing confirmation flow
   */
  forbidden: [
    'implicit_confirmation',
    'hidden_status',
    'auto_execution',
    'bypass_confirmation',
  ],

  /**
   * REQUIRED
   * UI must render:
   * - Explicit status badge (PROPOSED, PERMITTED, BLOCKED, etc.)
   * - Clear confirmation button (if status = PERMITTED)
   * - Blocked reason (if status = BLOCKED)
   * - Affected entities list
   * - Reversibility indicator
   */
  required: [
    'status_badge',
    'confirmation_button',
    'blocking_reason',
    'affected_entities',
    'reversibility_indicator',
  ],

  /**
   * STATUS RENDERING
   * Each status has specific UI treatment
   */
  statusRendering: {
    PROPOSED: {
      color: 'blue',
      label: 'Proposed',
      allowConfirmation: false,
    },
    PERMITTED: {
      color: 'green',
      label: 'Permitted',
      allowConfirmation: true,
    },
    BLOCKED: {
      color: 'red',
      label: 'Blocked',
      allowConfirmation: false,
      requiresReason: true,
    },
    CONFIRMED: {
      color: 'purple',
      label: 'Confirmed',
      allowConfirmation: false,
    },
    REJECTED: {
      color: 'gray',
      label: 'Rejected',
      allowConfirmation: false,
    },
    EXECUTED: {
      color: 'green',
      label: 'Executed',
      allowConfirmation: false,
    },
    FAILED: {
      color: 'red',
      label: 'Failed',
      allowConfirmation: false,
    },
  },
});

/**
 * Explanation Render Rules
 *
 * Explanations are structured prose with explicit sections.
 */
const EXPLANATION_RENDER_RULES = Object.freeze({
  /**
   * STRUCTURE
   * Explanations have:
   * - Summary (one sentence)
   * - Details (array of strings)
   * - Sources (array of entity references)
   * - Timestamp
   */
  structure: {
    sections: ['summary', 'details', 'sources', 'timestamp'],
  },

  /**
   * FORBIDDEN
   * These render patterns are NOT ALLOWED:
   * - Free-form HTML
   * - Markdown injection
   * - Combining summary and details without structure
   */
  forbidden: [
    'free_html',
    'markdown_injection',
    'unstructured_combination',
  ],

  /**
   * REQUIRED
   * UI must render:
   * - Summary as heading
   * - Details as list
   * - Sources as links
   * - Timestamp as footer
   */
  required: [
    'summary_heading',
    'details_list',
    'sources_links',
    'timestamp_footer',
  ],
});

/**
 * Response Status Render Rules
 *
 * Response status determines overall UI treatment.
 */
const RESPONSE_STATUS_RENDER_RULES = Object.freeze({
  SUCCESS: {
    color: 'green',
    icon: 'check-circle',
    showContent: true,
  },
  BLOCKED: {
    color: 'red',
    icon: 'shield',
    showContent: false,
    requiresReason: true,
  },
  FAILED: {
    color: 'red',
    icon: 'x-circle',
    showContent: false,
    requiresErrors: true,
  },
});

/**
 * Validate that a render implementation follows the rules
 *
 * This function checks that UI code respects render contracts.
 * (Used for testing and code review, not runtime)
 *
 * @param {Object} implementation - Render implementation to validate
 * @param {string} implementation.type - Type of content (draft | risk | actionProposal | explanation)
 * @param {Array} implementation.usedPatterns - Patterns used in implementation
 * @throws {Error} If implementation violates rules
 */
function validateRenderImplementation(implementation) {
  if (!implementation || typeof implementation !== 'object') {
    throw new Error('Implementation must be an object');
  }

  const { type, usedPatterns } = implementation;

  if (!type || typeof type !== 'string') {
    throw new Error('Implementation type is required');
  }

  if (!Array.isArray(usedPatterns)) {
    throw new Error('usedPatterns must be an array');
  }

  let rules;
  switch (type) {
    case 'draft':
      rules = DRAFT_RENDER_RULES;
      break;
    case 'risk':
      rules = RISK_RENDER_RULES;
      break;
    case 'actionProposal':
      rules = ACTION_PROPOSAL_RENDER_RULES;
      break;
    case 'explanation':
      rules = EXPLANATION_RENDER_RULES;
      break;
    default:
      throw new Error(`Unknown render type: ${type}`);
  }

  // Check for forbidden patterns
  const forbiddenUsed = usedPatterns.filter(pattern =>
    rules.forbidden.includes(pattern)
  );

  if (forbiddenUsed.length > 0) {
    throw new Error(
      `Implementation uses forbidden patterns: ${forbiddenUsed.join(', ')}`
    );
  }

  // Check for required patterns
  const missingRequired = rules.required.filter(pattern =>
    !usedPatterns.includes(pattern)
  );

  if (missingRequired.length > 0) {
    throw new Error(
      `Implementation missing required patterns: ${missingRequired.join(', ')}`
    );
  }

  return true;
}

module.exports = {
  DRAFT_RENDER_RULES,
  RISK_RENDER_RULES,
  ACTION_PROPOSAL_RENDER_RULES,
  EXPLANATION_RENDER_RULES,
  RESPONSE_STATUS_RENDER_RULES,
  validateRenderImplementation,
};
