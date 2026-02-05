'use strict';

/**
 * Permission & Trust System - Examples
 *
 * Demonstrates the permission and trust system in action.
 */

const { PERMISSION_SCOPES } = require('./permission.model');
const { TRUST_TIERS, getTierPermissions } = require('./trust.tiers');
const { GATE_RESULT, BLOCK_REASON } = require('./execution.gate');

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 1: Blocked Action - Trust Insufficient
// ═══════════════════════════════════════════════════════════════════

/**
 * Scenario: New user (OBSERVER tier) tries to create a task
 *
 * OBSERVER tier does not have execute:task:create permission.
 * Action is BLOCKED with suggestion to earn trust.
 */
const EXAMPLE_BLOCKED_TRUST_INSUFFICIENT = {
  scenario: 'New user tries to create a task',
  userTier: 'observer',
  attemptedAction: {
    action: 'create_task',
    scope: PERMISSION_SCOPES.EXECUTE.TASK_CREATE,
    params: {
      title: 'Follow up with client',
      dueDate: '2026-02-10',
      priority: 'high',
    },
  },
  gateResult: {
    result: GATE_RESULT.BLOCKED,
    checkId: 'check_1707130800000_abc123',
    action: 'create_task',
    scope: 'execute:task:create',
    reason: BLOCK_REASON.TRUST_INSUFFICIENT,
    message: "Trust tier 'observer' does not permit 'execute:task:create'",
    checks: [
      {
        gate: 'PERMISSION',
        passed: false,
        message: "Permission 'execute:task:create' not granted",
      },
      {
        gate: 'TRUST',
        passed: false,
        currentTier: 'observer',
        message: "Trust tier 'observer' does not permit 'execute:task:create'",
      },
    ],
    suggestedAction: 'Earn trust through successful interactions or request tier upgrade',
  },
  userMessage: {
    de: `Diese Aktion erfordert eine hohere Vertrauensstufe.

Ihre aktuelle Stufe: **Observer** (Stufe 0)
Erforderliche Stufe: **Operator** (Stufe 3)

Um diese Stufe zu erreichen:
- Fuhren Sie weitere erfolgreiche Interaktionen durch
- Ihre Zufriedenheitsrate muss mindestens 85% betragen
- Sie mussen mindestens 50 erfolgreiche Interaktionen haben

Der Agent kann stattdessen:
- Die Aufgabe als Entwurf vorbereiten
- Sie an die Aufgabe erinnern
- Ihnen eine Zusammenfassung geben`,

    en: `This action requires a higher trust level.

Your current level: **Observer** (Level 0)
Required level: **Operator** (Level 3)

To reach this level:
- Complete more successful interactions
- Maintain a satisfaction rate of at least 85%
- Have at least 50 successful interactions

The agent can instead:
- Prepare the task as a draft
- Remind you about the task
- Provide you with a summary`,
  },
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 2: Blocked Action - Policy Violation
// ═══════════════════════════════════════════════════════════════════

/**
 * Scenario: User on v1 policy tries to execute an action
 *
 * v1 policy has allowExecution: false
 */
const EXAMPLE_BLOCKED_POLICY_VIOLATION = {
  scenario: 'V1 policy user tries to execute action',
  userTier: 'operator',
  policyVersion: 'v1',
  attemptedAction: {
    action: 'create_task',
    scope: PERMISSION_SCOPES.EXECUTE.TASK_CREATE,
  },
  gateResult: {
    result: GATE_RESULT.BLOCKED,
    checkId: 'check_1707130800001_def456',
    action: 'create_task',
    scope: 'execute:task:create',
    reason: BLOCK_REASON.POLICY_VIOLATION,
    message: 'Policy v1 does not allow execution',
    checks: [
      { gate: 'PERMISSION', passed: true, message: 'Permission granted' },
      { gate: 'TRUST', passed: true, message: 'Trust tier permits action' },
      { gate: 'POLICY', passed: false, message: 'Policy v1 does not allow execution' },
    ],
  },
  userMessage: {
    de: `Diese Aktion ist in Ihrer aktuellen Konfiguration nicht verfugbar.

Aktuelle Richtlinie: **v1** (Nur-Lesen-Modus)

Um Aktionen auszufuhren, wechseln Sie bitte zu v3 in den Einstellungen.`,
    en: `This action is not available in your current configuration.

Current policy: **v1** (Read-only mode)

To execute actions, please switch to v3 in settings.`,
  },
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 3: Pending Confirmation
// ═══════════════════════════════════════════════════════════════════

/**
 * Scenario: Operator tier user creates a task (requires confirmation)
 */
const EXAMPLE_PENDING_CONFIRMATION = {
  scenario: 'Operator tier user creates task - requires confirmation',
  userTier: 'operator',
  attemptedAction: {
    action: 'create_task',
    scope: PERMISSION_SCOPES.EXECUTE.TASK_CREATE,
    params: {
      task: {
        title: 'Prepare contract draft',
        dueDate: '2026-02-15',
        priority: 'high',
        assignee: 'lawyer@example.com',
      },
      dossier: {
        reference: 'DOS-2024-001',
      },
    },
  },
  gateResult: {
    result: GATE_RESULT.PENDING_CONFIRMATION,
    checkId: 'check_1707130800002_ghi789',
    action: 'create_task',
    scope: 'execute:task:create',
    confirmationRequest: {
      id: 'confirm_1707130800002_xyz',
      type: 'detailed',
      priority: 'normal',
      action: 'create_task',
      scope: 'execute:task:create',
      title: 'Aufgabe erstellen / Create Task',
      description: 'Der Agent mochte eine neue Aufgabe erstellen.',
      details: {
        taskTitle: 'Prepare contract draft',
        dossierReference: 'DOS-2024-001',
        dueDate: '2026-02-15',
        priority: 'high',
        assignee: 'lawyer@example.com',
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
      expiresAt: '2026-02-05T10:05:00Z',
      status: 'pending',
    },
    message: 'Action requires user confirmation',
  },
  uiDialog: {
    title: 'Aufgabe erstellen',
    body: `
Der Agent mochte folgende Aufgabe erstellen:

**Titel:** Prepare contract draft
**Dossier:** DOS-2024-001
**Fallig:** 15.02.2026
**Prioritat:** Hoch
**Zugewiesen an:** lawyer@example.com

**Auswirkungen:**
- Eine neue Aufgabe wird im System angelegt
- Zugewiesene Personen werden benachrichtigt
    `,
    buttons: [
      { label: 'Erstellen', action: 'approve', style: 'primary' },
      { label: 'Bearbeiten', action: 'modify', style: 'secondary' },
      { label: 'Abbrechen', action: 'reject', style: 'danger' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 4: Allowed Action (Trusted Tier - Auto-approved)
// ═══════════════════════════════════════════════════════════════════

/**
 * Scenario: Trusted tier user sets a reminder (auto-approved)
 */
const EXAMPLE_ALLOWED_AUTO_APPROVED = {
  scenario: 'Trusted tier user sets reminder - auto-approved',
  userTier: 'trusted',
  attemptedAction: {
    action: 'create_reminder',
    scope: PERMISSION_SCOPES.EXECUTE.REMINDER_SET,
    params: {
      message: 'Check status of contract negotiation',
      remindAt: '2026-02-06T09:00:00Z',
    },
  },
  gateResult: {
    result: GATE_RESULT.ALLOWED,
    checkId: 'check_1707130800003_jkl012',
    action: 'create_reminder',
    scope: 'execute:reminder:set',
    checks: [
      { gate: 'PERMISSION', passed: true, message: 'Permission granted' },
      { gate: 'TRUST', passed: true, currentTier: 'trusted', message: 'Trust tier permits action' },
      { gate: 'POLICY', passed: true, message: 'Policy allows action' },
      { gate: 'RATE_LIMIT', passed: true, message: 'Rate limit: 5/50' },
      { gate: 'CONFIRMATION', passed: true, required: false, message: 'Auto-approved at trusted tier' },
    ],
    message: 'Action permitted',
  },
  executionResult: {
    success: true,
    reminder: {
      id: 'reminder_123',
      message: 'Check status of contract negotiation',
      remindAt: '2026-02-06T09:00:00Z',
      createdAt: '2026-02-05T10:00:00Z',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 5: Trust Tier Upgrade Flow
// ═══════════════════════════════════════════════════════════════════

/**
 * Scenario: User becomes eligible for tier upgrade
 */
const EXAMPLE_TIER_UPGRADE = {
  scenario: 'User eligible for tier upgrade',
  currentTier: 'assistant',
  trustScore: {
    totalInteractions: 25,
    successfulInteractions: 23,
    failedInteractions: 2,
    userApprovals: 20,
    userRejections: 1,
    successRate: 0.92,
    satisfactionRate: 0.95,
    daysActive: 5,
  },
  upgradeCheck: {
    readyForUpgrade: true,
    currentTier: TRUST_TIERS.ASSISTANT,
    nextTier: TRUST_TIERS.RESEARCHER,
    requiresApproval: true,
    newPermissions: [
      'external:web:search',
      'external:legal:research',
      'draft:legal',
      'analysis:financial',
    ],
  },
  confirmationRequest: {
    type: 'detailed',
    priority: 'high',
    action: 'upgrade_trust_tier',
    scope: 'system:trust:upgrade',
    title: 'Vertrauensstufe erhohen / Upgrade Trust Tier',
    description: 'Der Agent hat sich fur eine hohere Vertrauensstufe qualifiziert.',
    details: {
      currentTier: 'Assistant',
      newTier: 'Researcher',
      newPermissions: [
        'Web-Suche durchfuhren',
        'Rechtliche Recherche',
        'Rechtliche Dokumente entwerfen',
        'Finanzanalysen erstellen',
      ],
    },
    consequences: [
      'Der Agent kann nun externe Suchen durchfuhren',
      'Der Agent kann rechtliche Recherchen durchfuhren',
      'Diese Entscheidung kann jederzeit ruckgangig gemacht werden',
    ],
  },
  uiDialog: {
    title: 'Agent-Vertrauensstufe erhohen?',
    body: `
Der Agent hat durch erfolgreiche Interaktionen eine hohere Vertrauensstufe erreicht.

**Aktuelle Stufe:** Assistant (Stufe 1)
**Neue Stufe:** Researcher (Stufe 2)

**Neue Fahigkeiten:**
- Web-Suche durchfuhren
- Rechtliche Recherche
- Rechtliche Dokumente entwerfen
- Finanzanalysen erstellen

Diese Entscheidung kann jederzeit in den Einstellungen ruckgangig gemacht werden.
    `,
    buttons: [
      { label: 'Stufe erhohen', action: 'approve', style: 'primary' },
      { label: 'Spater entscheiden', action: 'postpone', style: 'secondary' },
      { label: 'Ablehnen', action: 'reject', style: 'text' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 6: Complete Permission Check Flow
// ═══════════════════════════════════════════════════════════════════

/**
 * Shows the complete flow from request to execution/block
 */
const EXAMPLE_COMPLETE_FLOW = {
  scenario: 'Complete permission check flow',
  steps: [
    {
      step: 1,
      name: 'Agent proposes action',
      code: `
const result = await executionGate.checkAction({
  action: 'create_task',
  scope: PERMISSION_SCOPES.EXECUTE.TASK_CREATE,
  params: { title: 'Review contract', dueDate: '2026-02-10' },
  context: {},
});
      `,
    },
    {
      step: 2,
      name: 'Gate checks permission',
      description: 'System checks if scope is in user permissions',
    },
    {
      step: 3,
      name: 'Gate checks trust tier',
      description: 'System checks if trust tier includes this scope',
    },
    {
      step: 4,
      name: 'Gate checks policy',
      description: 'System checks if policy allows execution',
    },
    {
      step: 5,
      name: 'Gate checks rate limit',
      description: 'System checks if action is within rate limits',
    },
    {
      step: 6,
      name: 'Gate checks confirmation requirement',
      description: 'System determines if user confirmation needed',
    },
    {
      step: 7,
      name: 'Result returned',
      outcomes: [
        'ALLOWED - Proceed with execution',
        'BLOCKED - Return error with reason',
        'PENDING_CONFIRMATION - Wait for user response',
      ],
    },
    {
      step: 8,
      name: 'If PENDING_CONFIRMATION, handle response',
      code: `
// User responds to confirmation dialog
const finalResult = await executionGate.handleConfirmation(
  confirmationRequest.id,
  { approved: true, respondedBy: 'user_123' }
);
      `,
    },
    {
      step: 9,
      name: 'Trust score updated',
      description: 'Interaction recorded for trust calculation',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 7: Tier Comparison
// ═══════════════════════════════════════════════════════════════════

const TIER_COMPARISON = {
  tiers: [
    {
      tier: 'Observer',
      level: 0,
      color: '#6B7280',
      capabilities: ['Daten lesen', 'Basiskanalysen', 'Chat'],
      restrictions: ['Keine Anderungen', 'Keine externen Suchen', 'Keine Entwurfe'],
    },
    {
      tier: 'Assistant',
      level: 1,
      color: '#3B82F6',
      capabilities: ['+ Risikoanalysen', '+ Interne Entwurfe', '+ E-Mail-Entwurfe'],
      restrictions: ['Keine externen Suchen', 'Keine Ausfuhrung'],
    },
    {
      tier: 'Researcher',
      level: 2,
      color: '#8B5CF6',
      capabilities: ['+ Web-Suche', '+ Rechtliche Recherche', '+ Rechtliche Entwurfe'],
      restrictions: ['Keine Ausfuhrung'],
    },
    {
      tier: 'Operator',
      level: 3,
      color: '#F59E0B',
      capabilities: ['+ Aufgaben erstellen', '+ Erinnerungen setzen', '+ Notizen erstellen'],
      restrictions: ['Bestatigung erforderlich fur alle Aktionen'],
    },
    {
      tier: 'Trusted',
      level: 4,
      color: '#10B981',
      capabilities: ['+ Benachrichtigungen senden', '+ Einige Aktionen automatisch'],
      restrictions: ['Bestatigung fur sensible Aktionen'],
    },
  ],
};

module.exports = {
  EXAMPLE_BLOCKED_TRUST_INSUFFICIENT,
  EXAMPLE_BLOCKED_POLICY_VIOLATION,
  EXAMPLE_PENDING_CONFIRMATION,
  EXAMPLE_ALLOWED_AUTO_APPROVED,
  EXAMPLE_TIER_UPGRADE,
  EXAMPLE_COMPLETE_FLOW,
  TIER_COMPARISON,
};
