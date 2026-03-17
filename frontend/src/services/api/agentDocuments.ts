/**
 * Agent Session Documents API Service
 *
 * Handles uploading, binding, and querying documents attached to agent sessions.
 * These are documents the user explicitly provides in the chat for the agent to reason about.
 */

import { apiClient } from './client';
import { getDocumentFormatGovernance } from "./documentFormats";

// ============================================================================
// Types
// ============================================================================

export interface AgentSessionDocument {
  document_id: number;
  title: string;
  file_path: string;
  original_filename: string;
  category: string | null;
  mime_type: string;
  size_bytes: number;
  notes: string | null;
  text_status: 'unreadable' | 'extracting' | 'readable' | 'needs_ocr' | 'failed';
  text_source: string | null;
  text_failure_reason: string | null;
  analysis_status?: string | null;
  analysis_provider?: string | null;
  understanding_confidence?: number | null;
  analysis_version?: string | null;
  artifacts?: {
    extracted_text?: string;
    visual_summary?: string;
    key_entities?: Array<Record<string, unknown>>;
    risk_flags?: string[];
    provenance?: Record<string, unknown>;
  } | null;
  failure_stage?: string | null;
  failure_detail?: string | null;
  has_text: boolean;
  unreadable_text: boolean;
  text_length: number | null;
  document_text: string | null;
  session_id: string;
  message_id: string | null;
  role: 'attachment' | 'reference';
  bound_at: string;
  bound?: boolean;
}

export interface AgentDocumentContext {
  sessionId: string;
  totalDocuments: number;
  readableCount: number;
  processingCount: number;
  unreadableCount: number;
  documents: Array<{
    document_id: number;
    title: string;
    original_filename: string;
    mime_type: string;
    text_status: string;
    text_source: string | null;
    understanding_status?: string | null;
    understanding_confidence?: number | null;
    analysis_provider?: string | null;
    has_text: boolean;
    text_length: number | null;
    text: string | null;
    needs_user_continue?: boolean;
    pages_processed?: number | null;
    pages_total?: number | null;
    progress_stage?: string | null;
    artifacts?: AgentSessionDocument['artifacts'];
    role: string;
    supportedOperations: string[];
  }>;
}

export interface UploadResult extends AgentSessionDocument {
  bound: true;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum file size for agent session document uploads (20 MB) */
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

// ============================================================================
// API Functions
// ============================================================================

/**
 * Upload a file and bind it to the agent session.
 * Validates file size and type before uploading.
 */
export async function uploadSessionDocument(
  sessionId: string,
  file: File,
  messageId?: string,
): Promise<UploadResult> {
  // Client-side validation
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`File "${file.name}" exceeds the ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)} MB limit`);
  }
  const governance = await getDocumentFormatGovernance();
  const supportedMimes = new Set(
    (governance?.supported?.ingestMimeTypes || []).map((mime) => String(mime || "").toLowerCase()),
  );
  const supportedExtensions = new Set(
    (governance?.supported?.ingestExtensions || []).map((ext) => String(ext || "").toLowerCase()),
  );
  const fileMime = String(file.type || "").toLowerCase();
  const fileExtension = String(file.name.split(".").pop() || "").toLowerCase();
  const looksSupported =
    (fileMime && supportedMimes.has(fileMime)) ||
    (fileExtension && supportedExtensions.has(fileExtension));
  if (!looksSupported) {
    console.warn(
      `[AgentDocs] File "${file.name}" (${file.type || "unknown"}) is not in backend-supported ingest formats`,
    );
  }

  const dataBase64 = await fileToBase64(file);

  return apiClient.post<UploadResult>(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents/upload`,
    {
      filename: file.name,
      mime_type: file.type,
      data_base64: dataBase64,
      message_id: messageId || null,
    },
  );
}

/**
 * Bind an existing system document to the agent session.
 */
export async function bindSessionDocument(
  sessionId: string,
  documentId: number,
  messageId?: string,
): Promise<AgentSessionDocument> {
  return apiClient.post<AgentSessionDocument>(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents/bind`,
    {
      document_id: documentId,
      message_id: messageId || null,
    },
  );
}

/**
 * List all documents in an agent session.
 */
export async function listSessionDocuments(
  sessionId: string,
  includeText = false,
): Promise<AgentSessionDocument[]> {
  const query = includeText ? '?include_text=true' : '';
  return apiClient.get<AgentSessionDocument[]>(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents${query}`,
  );
}

/**
 * Get agent-formatted document context for the session.
 */
export async function getSessionDocumentContext(
  sessionId: string,
): Promise<AgentDocumentContext> {
  return apiClient.get<AgentDocumentContext>(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents/context`,
  );
}

/**
 * Remove a document from the session.
 */
export async function removeSessionDocument(
  sessionId: string,
  documentId: number,
): Promise<void> {
  return apiClient.delete(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents/${documentId}`,
  );
}

/**
 * Clear all documents from a session.
 */
export async function clearSessionDocuments(
  sessionId: string,
): Promise<{ cleared: number }> {
  return apiClient.delete(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents`,
  );
}

/**
 * Get multimodal artifacts for a specific session document.
 */
export async function getSessionDocumentArtifacts(
  sessionId: string,
  documentId: number,
): Promise<{
  document_id: number;
  title: string;
  original_filename: string;
  mime_type: string;
  text_status: string;
  text_source: string | null;
  understanding_status: string;
  understanding_confidence: number | null;
  analysis_provider: string | null;
  analysis_version: string | null;
  failure_stage: string | null;
  failure_detail: string | null;
  artifacts: AgentSessionDocument['artifacts'];
  needs_user_continue?: boolean;
  pages_processed?: number | null;
  pages_total?: number | null;
}> {
  return apiClient.get(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents/${documentId}/artifacts`,
  );
}

/**
 * Retry extraction/understanding for a specific session document.
 */
export async function retrySessionDocumentAnalysis(
  sessionId: string,
  documentId: number,
): Promise<{
  document_id: number;
  title: string;
  original_filename: string;
  mime_type: string;
  text_status: string;
  text_source: string | null;
  understanding_status: string;
  understanding_confidence: number | null;
  analysis_provider: string | null;
  analysis_version: string | null;
  failure_stage: string | null;
  failure_detail: string | null;
  artifacts: AgentSessionDocument['artifacts'];
  needs_user_continue?: boolean;
  pages_processed?: number | null;
  pages_total?: number | null;
}> {
  return apiClient.post(
    `/agent/sessions/${encodeURIComponent(sessionId)}/documents/${documentId}/retry`,
    {},
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a File to base64 data URL string.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload multiple attachments to a session.
 * Handles both new file uploads and existing document bindings.
 *
 * @returns Array of successfully bound documents
 */
export async function uploadAttachments(
  sessionId: string,
  attachments: Array<{
    type: 'file' | 'image' | 'document';
    file?: File;
    documentId?: number;
    name: string;
  }>,
  messageId?: string,
): Promise<AgentSessionDocument[]> {
  const results: AgentSessionDocument[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const attachment of attachments) {
    try {
      if (attachment.type === 'document' && attachment.documentId) {
        // Bind existing system document
        const doc = await bindSessionDocument(sessionId, attachment.documentId, messageId);
        results.push(doc);
      } else if (attachment.file) {
        // Upload new file
        const doc = await uploadSessionDocument(sessionId, attachment.file, messageId);
        results.push(doc);
      }
    } catch (err) {
      console.error(`[AgentDocs] Failed to upload ${attachment.name}:`, err);
      errors.push({
        name: attachment.name,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }

  if (errors.length > 0) {
    console.warn('[AgentDocs] Some attachments failed:', errors);
  }

  return results;
}
