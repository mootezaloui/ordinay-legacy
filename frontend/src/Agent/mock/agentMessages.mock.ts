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
      type: "analysis",
      items: [
        {
          title: "Dupont vs. Northwind Logistics",
          status: "Critical",
          reason: "Hearing in 2 days, 3 documents pending",
          dossier_id: "D-2024-001",
        },
        {
          title: "Martin Estate Settlement",
          status: "High",
          reason: "Deadline tomorrow, final review needed",
          dossier_id: "D-2024-015",
        },
        {
          title: "Tech Corp Contract Dispute",
          status: "Medium",
          reason: "Client meeting Friday, prep incomplete",
          dossier_id: "D-2024-008",
        },
      ],
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
      type: "report",
      title: "Dupont vs. Northwind Logistics - Case Summary",
      sections: [
        { label: "Case Overview", words: 247 },
        { label: "Timeline", words: 156 },
        { label: "Key Arguments", words: 412 },
        { label: "Evidence Summary", words: 289 },
        { label: "Next Steps", words: 134 },
      ],
      totalWords: 1238,
      generated: true,
    },
  },
];
