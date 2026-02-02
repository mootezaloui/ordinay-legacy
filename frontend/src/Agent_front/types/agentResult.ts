export interface AnalysisResultData {
  type: "analysis";
  items: AnalysisItem[];
}

export interface AnalysisItem {
  title: string;
  status: "Critical" | "High" | "Medium" | "Low";
  reason: string;
  dossier_id: string;
}

export interface ReportResultData {
  type: "report";
  title: string;
  sections: ReportSection[];
  totalWords: number;
  generated: boolean;
}

export interface ReportSection {
  label: string;
  words: number;
}

export interface ExplanationResultData {
  type: "explanation";
  summary: string;
  details: string[];
}
