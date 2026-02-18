import { apiClient } from "./client";

export interface DocumentGenerationPlanRequest {
  target: { type: string; id: number };
  documentType: string;
  language: "ar" | "en";
  format: "html" | "pdf" | "docx";
  instructions?: string;
  contextPolicy?: Record<string, unknown>;
}

export interface DocumentGenerationPlanResponse {
  status: "missing_fields" | "ready";
  target: { type: string; id: number };
  documentType: string;
  language: "ar" | "en";
  format: "html" | "pdf" | "docx";
  schemaVersion: string;
  templateKey: string;
  contentJson: Record<string, unknown>;
  previewHtml?: string;
  missingFields?: Array<{
    path: string;
    label: string;
    reason: string;
    example?: string;
  }>;
}

export interface DocumentGenerationResult {
  generationId: number;
  generationUid: string;
  documentId: number;
  downloadUrl: string;
  metadata: {
    templateKey: string;
    schemaVersion: string;
    documentType: string;
    language: string;
    format: string;
  };
}

export async function planDocumentGeneration(
  payload: DocumentGenerationPlanRequest,
): Promise<DocumentGenerationPlanResponse> {
  return apiClient.post<DocumentGenerationPlanResponse>(
    "/documents/generate/plan",
    payload,
  );
}

export async function generateDocument(
  payload: DocumentGenerationPlanRequest,
): Promise<DocumentGenerationResult> {
  return apiClient.post<DocumentGenerationResult>("/documents/generate", payload);
}

export async function getDocumentGeneration(generationId: number) {
  return apiClient.get(`/documents/generations/${generationId}`);
}
