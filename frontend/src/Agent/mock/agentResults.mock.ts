import { AnalysisResultData, ReportResultData } from "../types/agentResult";

export const mockAnalysisResult: AnalysisResultData = {
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
  ],
};

export const mockReportResult: ReportResultData = {
  type: "report",
  title: "Dupont vs. Northwind Logistics - Case Summary",
  sections: [
    { label: "Case Overview", words: 247 },
    { label: "Timeline", words: 156 },
    { label: "Key Arguments", words: 412 },
  ],
  totalWords: 1238,
  generated: true,
};
