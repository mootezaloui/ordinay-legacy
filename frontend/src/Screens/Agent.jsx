/**
 * Agent Screen
 *
 * Phase C.1 — Agent UI Layout (STRUCTURE ONLY)
 *
 * This is NOT a chatbot. This is a structured, explicit agent workspace.
 * 3-zone layout: Control Bar (top), Workspace (center), Transparency Panel (right)
 */

import { useState } from "react";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import AgentControlBar from "../components/agent/AgentControlBar";
import AgentWorkspace from "../components/agent/AgentWorkspace";
import AgentTransparencyPanel from "../components/agent/AgentTransparencyPanel";

export default function Agent() {
  // Current agent state (no backend connection yet - mock data only)
  const [agentVersion, setAgentVersion] = useState("v1");
  const [contextScope, setContextScope] = useState("GLOBAL");
  const [language, setLanguage] = useState("fr");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState("explanation");

  // Mock agent response (will be replaced with real data later)
  const [agentResponse, setAgentResponse] = useState(null);

  // Mock agent ledger (will be replaced with real data later)
  const [agentLedger, setAgentLedger] = useState([
    {
      id: 1,
      type: "ui_request_received",
      requestId: "req-u1-1234567890-abc123",
      timestamp: new Date(Date.now() - 5000).toISOString(),
      intent: "EXPLAIN_ENTITY_STATE",
      contextScope: "GLOBAL",
    },
    {
      id: 2,
      type: "ui_response_sent",
      requestId: "req-u1-1234567890-abc123",
      timestamp: new Date().toISOString(),
      intent: "EXPLAIN_ENTITY_STATE",
      status: "SUCCESS",
    },
  ]);

  const handleSubmitRequest = (request) => {
    // TODO: Wire to backend API
    console.log("[Agent] Submit request:", request);

    // Mock response for layout validation
    const mockResponse = {
      responseId: "res-req-u1-1234567890-abc123-1234567890-def456",
      requestId: request.requestId || "req-u1-1234567890-abc123",
      agentVersion: request.agentVersion || "v1",
      intent: request.intent,
      status: "SUCCESS",
      explanation: {
        type: "explanation",
        entityId: "1",
        entityType: "dossier",
        summary: "This is a mock explanation for layout validation. The dossier is currently in active status.",
        details: [
          "Detail 1: Current status is active with 3 open tasks",
          "Detail 2: Last updated today at 14:23",
          "Detail 3: No blocking issues detected",
          "Detail 4: Next hearing scheduled for 2026-02-15",
          "Detail 5: All documents are up to date",
        ],
        timestamp: new Date().toISOString(),
        confidence: 0.95,
        sources: [
          {
            type: "dossier",
            id: "1",
            description: "Dossier database record",
          },
          {
            type: "task",
            id: "12",
            description: "Task list query",
          },
        ],
        status: "draft",
        source: "rule-based",
        requires_validation: true,
      },
      risks: [
        {
          type: "operational_risk_analysis",
          category: "DEADLINE",
          severity: "HIGH",
          description: "Upcoming deadline in 3 days with incomplete preparation",
          affected_entities: [
            { type: "dossier", id: 1, name: "Contract Review Case" },
            { type: "task", id: 15, name: "Prepare hearing documents" },
          ],
          detected_at: new Date().toISOString(),
          risk_score: 0.85,
          source: "rule-based",
          status: "active",
        },
        {
          type: "operational_risk_analysis",
          category: "RESOURCE",
          severity: "MEDIUM",
          description: "Multiple tasks assigned to the same person with overlapping deadlines",
          affected_entities: [
            { type: "task", id: 15, name: "Prepare hearing documents" },
            { type: "task", id: 16, name: "Review contract amendments" },
          ],
          detected_at: new Date().toISOString(),
          risk_score: 0.65,
          source: "rule-based",
          status: "active",
        },
        {
          type: "operational_risk_analysis",
          category: "COMMUNICATION",
          severity: "LOW",
          description: "Client has not responded to last email sent 5 days ago",
          affected_entities: [
            { type: "client", id: 7, name: "Jean Dupont" },
            { type: "dossier", id: 1, name: "Contract Review Case" },
          ],
          detected_at: new Date().toISOString(),
          risk_score: 0.35,
          source: "rule-based",
          status: "active",
        },
      ],
      drafts: [
        {
          type: "CLIENT_EMAIL",
          sections: {
            header: "Bonjour Monsieur Dupont,\n\nSuite à notre dernière rencontre concernant votre dossier de révision de contrat.",
            body: "Je vous écris pour vous informer que nous avons terminé l'analyse préliminaire de votre contrat. Nous avons identifié plusieurs clauses qui nécessitent des modifications pour mieux protéger vos intérêts.\n\nNous vous proposons une rencontre la semaine prochaine pour discuter de ces modifications en détail.\n\nPourriez-vous nous confirmer votre disponibilité pour un rendez-vous ?",
            footer: "Cordialement,\n\nVotre équipe juridique",
          },
          metadata: {
            generated_at: new Date().toISOString(),
            confidence: 0.9,
            source: "rule-based",
            status: "draft",
            requires_validation: true,
            language: "fr",
          },
        },
        {
          type: "INVITATION",
          sections: {
            header: "Invitation à une réunion de suivi",
            body: "Date proposée: 2026-01-20\nHeure: 14:00\nLieu: Bureau principal\nObjet: Discussion sur les modifications contractuelles\n\nOrdre du jour:\n1. Revue des clauses identifiées\n2. Propositions de modifications\n3. Prochaines étapes",
            footer: "Veuillez confirmer votre présence avant le 2026-01-18.",
          },
          metadata: {
            generated_at: new Date().toISOString(),
            confidence: 0.85,
            source: "rule-based",
            status: "draft",
            requires_validation: true,
            language: "fr",
          },
        },
      ],
      actionProposals: [
        {
          proposalId: "v2-createTask-1234567890-abc123",
          status: "PROPOSED",
          actionType: "createTask",
          humanReadableSummary: "Create task: 'Follow up with client on pending documents'",
          affectedEntities: [
            { type: "dossier", id: 1, name: "Contract Review Case" },
            { type: "client", id: 7, name: "Jean Dupont" },
          ],
          reversible: true,
          requiresConfirmation: true,
          blockingReason: null,
          suggestedAlternative: null,
        },
        {
          proposalId: "v2-scheduleReminder-1234567890-def456",
          status: "BLOCKED",
          actionType: "scheduleReminder",
          humanReadableSummary: "Schedule reminder: 'Hearing preparation deadline in 2 days'",
          affectedEntities: [
            { type: "dossier", id: 1, name: "Contract Review Case" },
          ],
          reversible: true,
          requiresConfirmation: true,
          blockingReason: "Agent version v1 does not allow execution",
          suggestedAlternative: "Switch to Agent v2 or v3 to enable action proposals",
        },
      ],
      blockingReason: null,
      errors: [],
      generatedAt: new Date().toISOString(),
    };

    setAgentResponse(mockResponse);

    // Add ledger entries for this request
    const newLedgerEntries = [
      {
        id: agentLedger.length + 1,
        type: "ui_request_received",
        requestId: mockResponse.requestId,
        timestamp: new Date(Date.now() - 2000).toISOString(),
        intent: request.intent,
        contextScope: request.contextScope,
      },
      {
        id: agentLedger.length + 2,
        type: "ui_response_sent",
        requestId: mockResponse.requestId,
        timestamp: new Date().toISOString(),
        intent: request.intent,
        status: "SUCCESS",
      },
    ];

    setAgentLedger([...agentLedger, ...newLedgerEntries]);
  };

  return (
    <PageLayout>
      <PageHeader
        title="Agent"
        subtitle="Structured agent workspace — NOT a chatbot"
      />

      <ContentSection>
        {/* ZONE A — Context & Control Bar (TOP) */}
        <div className="mb-6">
          <AgentControlBar
            agentVersion={agentVersion}
            contextScope={contextScope}
            language={language}
            onVersionChange={setAgentVersion}
            onScopeChange={setContextScope}
            onLanguageChange={setLanguage}
          />
        </div>

        {/* Safety Notice */}
        <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-slate-800/70 dark:border-slate-700">
          <p className="text-sm text-blue-900 dark:text-slate-100">
            <strong>Note:</strong> Agent provides analysis and suggestions only. No automatic actions are performed without explicit confirmation.
          </p>
        </div>

        {/* Main Content Area: Workspace (left) + Transparency Panel (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ZONE B — Interaction & Output Area (CENTER) */}
          <div className="lg:col-span-2">
            <AgentWorkspace
              agentResponse={agentResponse}
              activeTab={activeWorkspaceTab}
              onTabChange={setActiveWorkspaceTab}
              onSubmitRequest={handleSubmitRequest}
              contextScope={contextScope}
              language={language}
            />
          </div>

          {/* ZONE C — Transparency & Audit Panel (RIGHT) */}
          <div className="lg:col-span-1">
            <AgentTransparencyPanel
              agentResponse={agentResponse}
              agentLedger={agentLedger}
            />
          </div>
        </div>
      </ContentSection>
    </PageLayout>
  );
}
