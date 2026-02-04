import { AgentMessage } from "../types/agentMessage";

export const mockConversation: AgentMessage[] = [
  {
    id: "1",
    role: "user",
    content: "Which dossiers need urgent attention this week?",
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: "2",
    role: "agent",
    content:
      "I've analyzed your active dossiers and found 3 that require urgent attention:",
    timestamp: new Date(Date.now() - 240000),
    data: {
      type: "explanation",
      explanation: {
        type: "explanation",
        entityId: "D-2024-001",
        entityType: "dossier",
        facts: {
          summary: "3 dossiers need immediate attention based on upcoming hearings and deadlines.",
          details: [
            "Dupont vs. Northwind Logistics — hearing in 2 days, 3 documents pending (D-2024-001).",
            "Martin Estate Settlement — deadline tomorrow, final review needed (D-2024-015).",
            "Tech Corp Contract Dispute — client meeting Friday, prep incomplete (D-2024-008).",
          ],
        },
        interpretation: {
          statements: [
            {
              level: "critical",
              statement: "Dupont hearing in 2 days with pending documents.",
              implication: "Immediate action required to prepare documentation.",
            },
            {
              level: "critical",
              statement: "Martin Estate deadline is tomorrow.",
              implication: "Final review must be completed today.",
            },
          ],
          summary: "2 critical issues require immediate attention.",
        },
        navigation: {
          role: "parent",
          roleDescription: "These are active dossiers with urgent deadlines.",
          contextStatement: "Review each dossier to address the specific issues.",
        },
        followUps: [
          {
            label: "View Dupont dossier",
            labelKey: "view",
            reason: "Hearing in 2 days requires preparation.",
            intent: "READ_DOSSIER",
            entityType: "dossier",
            entityId: 1,
            origin: { entity: "DOSSIER", entityId: 1 },
            target: { type: "dossier", id: 1, label: "Dupont dossier" },
            scope: { dossierId: 1 },
          },
          {
            label: "View Martin Estate",
            labelKey: "view",
            reason: "Deadline tomorrow needs final review.",
            intent: "READ_DOSSIER",
            entityType: "dossier",
            entityId: 15,
            origin: { entity: "DOSSIER", entityId: 15 },
            target: { type: "dossier", id: 15, label: "Martin Estate" },
            scope: { dossierId: 15 },
          },
        ],
      },
    },
  },
  {
    id: "3",
    role: "user",
    content: "Prepare a summary of the Dupont lawsuit",
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: "4",
    role: "agent",
    content: "I've prepared a comprehensive summary of the Dupont lawsuit:",
    timestamp: new Date(Date.now() - 60000),
    data: {
      type: "draft",
      draft: {
        type: "HEARING_SUMMARY",
        sections: {
          subject: "Dupont vs. Northwind Logistics — Hearing Summary",
          body:
            "This summary consolidates the case background, recent filings, and hearing agenda. Key points include pending evidence submissions and witness availability. Next steps are aligned with the court schedule and document deadlines.",
          closing: "Please confirm any additional evidence to include before filing.",
          signature: "— Legal Ops",
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "en",
          targetEntity: { type: "dossier", id: 1 },
        },
      },
    },
  },
];
