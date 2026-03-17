/**
 * Centralized Document Service
 *
 * Single source of truth for all document operations.
 * Entity-agnostic, storage-abstracted, desktop-first design.
 *
 * ARCHITECTURE:
 * - File storage: backend local filesystem (Electron)
 * - Metadata: SQLite backend (via API)
 * - Bridge: file_path (absolute filesystem path)
 */

import {
  isValidFileSize,
  getCategoryFromType,
  formatFileSize,
  getMimeType,
} from "../models/Document.js";
import { LocalStorageProvider } from "./storage/LocalStorageProvider.js";
import { apiClient } from "./api/client";
import { getDocumentFormatGovernance } from "./api/documentFormats";
import { getAppLicenseState } from "./licenseService";
import { isElectron } from "../lib/apiConfig";

const isLicenseLocked = () =>
  ["ACTIVATING", "ERROR"].includes(getAppLicenseState());

/**
 * Document service class
 * Manages all document operations with abstracted storage
 */
class DocumentService {
  constructor() {
    // Fallback provider for non-Electron contexts
    this.storageProvider = new LocalStorageProvider();
  }

  async fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  async uploadFileToBackend(file) {
    const base64 = await this.fileToBase64(file);
    const payload = {
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      data_base64: base64,
    };
    return apiClient.post("/documents/upload", payload);
  }

  async getFormatGovernance() {
    return getDocumentFormatGovernance();
  }

  resolveGovernedMimeType(governance, extension) {
    const safeExtension = String(extension || "").toLowerCase();
    if (!governance || !safeExtension) return null;
    const extensionByFormat = governance?.mappings?.extensionByFormat || {};
    const mimeByFormat = governance?.mappings?.mimeByFormat || {};
    const matchedFormat = Object.keys(extensionByFormat).find(
      (format) => String(extensionByFormat[format] || "").toLowerCase() === safeExtension,
    );
    return matchedFormat ? mimeByFormat[matchedFormat] || null : null;
  }

  /**
   * Sets a different storage provider
   * @param {IStorageProvider} provider - Storage provider instance
   */
  setStorageProvider(provider) {
    this.storageProvider = provider;
  }

  /**
   * Creates metadata in backend
   * @private
   */
  async createBackendMetadata({
    title,
    file_path,
    mime_type,
    size_bytes,
    entityType,
    entityId,
    category,
    copy_type,
    original_filename,
  }) {
    const payload = {
      title,
      file_path,
      mime_type,
      size_bytes,
      notes: category || null,
      copy_type: copy_type || null,
      ...(original_filename ? { original_filename } : {}),
    };

    // Map entityType to backend foreign key field, always use 'lawsuit' for legal proceedings
    let entityField, directoryType;
    if (entityType === "lawsuit") {
      entityField = "lawsuit_id";
      directoryType = "lawsuit";
    } else if (entityType === "personalTask") {
      entityField = "personal_task_id";
      directoryType = "personalTask";
    } else if (entityType === "financialEntry") {
      entityField = "financial_entry_id";
      directoryType = "financialEntry";
    } else if (entityType === "officer") {
      entityField = "officer_id";
      directoryType = "officer";
    } else if (
      ["client", "dossier", "mission", "task", "session"].includes(entityType)
    ) {
      entityField = `${entityType}_id`;
      directoryType = entityType;
    } else {
      throw new Error(`Unsupported document target: ${entityType}`);
    }
    payload[entityField] = parseInt(entityId, 10);

    // Ensure file_path uses legacy storage directory for lawsuits
    if (payload.file_path && payload.file_path.startsWith("proces/")) {
      payload.file_path = payload.file_path.replace("proces/", "case/");
    }

    return apiClient.post("/documents", payload);
  }

  /**
   * Validates a file before upload
   * @param {File} file - File to validate
   * @returns {Object} Validation result
   */
  async validateFile(file) {
    const extension = String(file?.name?.split(".").pop() || "").toLowerCase();
    const governance = await this.getFormatGovernance();
    const supportedExtensions = new Set(
      (governance?.supported?.ingestExtensions || []).map((ext) => String(ext || "").toLowerCase()),
    );

    if (!extension || !supportedExtensions.has(extension)) {
      const supportedDisplay = Array.from(supportedExtensions)
        .slice(0, 16)
        .map((ext) => `.${ext}`)
        .join(", ");
      return {
        valid: false,
        error: `Unsupported file type: .${extension || "unknown"}. Supported: ${supportedDisplay}`,
      };
    }

    if (!isValidFileSize(file.size)) {
      return {
        valid: false,
        error: "Fichier trop volumineux",
      };
    }

    return { valid: true, governance, extension };
  }

  /**
   * Uploads a file and links it to an entity
   * @param {File} file - File to upload
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @param {string} category - User-defined category
   * @returns {Promise<Object>} Result with document or error
   */
  async uploadDocument(
    file,
    entityType,
    entityId,
    category = "",
    options = {},
  ) {
    try {
      if (isLicenseLocked()) {
        return { success: false, error: "License inactive" };
      }
      // Validate file
      const validation = await this.validateFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const extension = validation.extension || file.name.split(".").pop();
      const governance = validation.governance || (await this.getFormatGovernance());
      // Map 'proces' to 'lawsuit' for storage and backend if needed
      let mappedEntityType = entityType === "proces" ? "lawsuit" : entityType;

      let filePath = null;
      let mimeType =
        file.type ||
        this.resolveGovernedMimeType(governance, extension) ||
        getMimeType(extension);
      let sizeBytes = file.size;

      if (isElectron() && window.electronAPI?.apiRequest) {
        const uploadResult = await this.uploadFileToBackend(file);
        filePath = uploadResult.file_path;
        mimeType = uploadResult.mime_type || mimeType;
        sizeBytes = uploadResult.size_bytes || sizeBytes;
      } else {
        const storageResult = await this.storageProvider.storeFile(file, {
          directory: mappedEntityType,
        });
        if (!storageResult.success) {
          return { success: false, error: storageResult.error };
        }
        filePath = storageResult.path.replace("proces/", "case/");
      }

      if (!filePath) {
        return { success: false, error: "File upload failed" };
      }

      // Store metadata in backend SQLite
      const backendDoc = await this.createBackendMetadata({
        title: file.name,
        original_filename: file.name,
        file_path: filePath,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        entityType: mappedEntityType,
        entityId,
        category,
        copy_type: options.copyType || options.copy_type,
      });

      // 3. Return frontend-compatible document structure
      return {
        success: true,
        document: this.transformBackendDocument(backendDoc),
      };
    } catch (error) {
      console.error("DocumentService: Upload failed", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Uploads multiple files
   * @param {File[]} files - Files to upload
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @param {string} category - User-defined category
   * @returns {Promise<Object>} Results
   */
  async uploadMultipleDocuments(
    files,
    entityType,
    entityId,
    category = "",
    options = {},
  ) {
    if (isLicenseLocked()) {
      return {
        successful: [],
        failed: files.map((file) => ({
          file: file.name,
          error: "License inactive",
        })),
      };
    }
    const results = {
      successful: [],
      failed: [],
    };

    for (const file of files) {
      const result = await this.uploadDocument(
        file,
        entityType,
        entityId,
        category,
        options,
      );
      if (result.success) {
        results.successful.push(result.document);
      } else {
        results.failed.push({ file: file.name, error: result.error });
      }
    }

    return results;
  }

  /**
   * Gets all documents for a specific entity
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @returns {Promise<Document[]>} Documents linked to the entity
   */
  async getEntityDocuments(entityType, entityId) {
    try {
      // Map entityType to backend query parameter
      let entityField;
      if (entityType === "lawsuit") {
        entityField = "lawsuit_id";
      } else if (entityType === "personalTask") {
        entityField = "personal_task_id";
      } else if (entityType === "financialEntry") {
        entityField = "financial_entry_id";
      } else if (entityType === "officer") {
        entityField = "officer_id";
      } else {
        entityField = `${entityType}_id`;
      }
      const backendDocs = await apiClient.get(
        `/documents?${entityField}=${entityId}`,
      );

      // Transform backend documents to frontend format
      return backendDocs.map((doc) => this.transformBackendDocument(doc));
    } catch (error) {
      console.error("DocumentService: Failed to fetch entity documents", error);
      return [];
    }
  }

  /**
   * Transforms backend document to frontend format
   * @private
   */
  transformBackendDocument(backendDoc) {
    const extension = backendDoc.title.split(".").pop() || "";
    const artifactValue = backendDoc.artifact_json || backendDoc.artifacts || null;
    let parsedArtifacts = null;
    if (artifactValue) {
      if (typeof artifactValue === "string") {
        try {
          parsedArtifacts = JSON.parse(artifactValue);
        } catch {
          parsedArtifacts = null;
        }
      } else if (typeof artifactValue === "object") {
        parsedArtifacts = artifactValue;
      }
    }
    return {
      id: backendDoc.id.toString(),
      name: backendDoc.title,
      type: extension.toLowerCase(),
      category: getCategoryFromType(extension),
      sizeBytes: backendDoc.size_bytes || 0,
      size: formatFileSize(backendDoc.size_bytes || 0),
      uploadDate: backendDoc.uploaded_at || backendDoc.created_at,
      modifiedDate: backendDoc.updated_at,
      storagePath: backendDoc.file_path,
      mimeType: backendDoc.mime_type,
      textStatus: backendDoc.text_status || backendDoc.status || null,
      textSource: backendDoc.text_source || backendDoc.source || null,
      textFailureReason:
        backendDoc.text_failure_reason || backendDoc.failure_reason || null,
      understandingStatus:
        backendDoc.analysis_status || backendDoc.understanding_status || null,
      understandingConfidence:
        Number.isFinite(backendDoc.analysis_confidence)
          ? backendDoc.analysis_confidence
          : Number.isFinite(backendDoc.understanding_confidence)
            ? backendDoc.understanding_confidence
            : null,
      analysisProvider: backendDoc.analysis_provider || null,
      analysisVersion: backendDoc.analysis_version || null,
      failureStage: backendDoc.failure_stage || null,
      failureDetail: backendDoc.failure_detail || null,
      artifacts: parsedArtifacts,
      // Note: backend doesn't store these, but UI may expect them
      metadata: {
        isDeleted: !!backendDoc.deleted_at,
        deletedDate: backendDoc.deleted_at,
      },
    };
  }

  /**
   * Gets a document by ID
   * @param {string} documentId - Document ID
   * @returns {Promise<Document|null>}
   */
  async getDocumentById(documentId) {
    try {
      const backendDoc = await apiClient.get(`/documents/${documentId}`);
      return this.transformBackendDocument(backendDoc);
    } catch (error) {
      console.error("DocumentService: Failed to fetch document by ID", error);
      return null;
    }
  }

  /**
   * Links an existing document to an entity
   * Creates a new backend row with same file_path (many-to-many via duplication)
   * @param {string} documentId - Document ID
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @param {string} category - User-defined category
   * @returns {Promise<boolean>} Success status
   */
  async linkDocumentToEntity(documentId, entityType, entityId, category = "") {
    try {
      if (isLicenseLocked()) {
        return false;
      }
      const document = await this.getDocumentById(documentId);
      if (!document) return false;

      // Create duplicate backend row with same file_path
      await this.createBackendMetadata({
        title: document.name,
        file_path: document.storagePath,
        mime_type: document.mimeType,
        size_bytes: document.sizeBytes,
        entityType,
        entityId,
        category,
      });

      return true;
    } catch (error) {
      console.error("DocumentService: Link failed", error);
      return false;
    }
  }

  /**
   * Unlinks a document from an entity (soft-deletes the specific link row)
   * Note: This is handled by deleteDocument() which soft-deletes the backend row
   * @param {string} documentId - Document ID
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @returns {Promise<boolean>} Success status
   */
  async unlinkDocumentFromEntity(documentId, entityType, entityId) {
    // Same as deleteDocument with deleteFile=false
    return this.deleteDocument(documentId, entityType, entityId, false);
  }

  /**
   * Deletes a document (user choice: link only or file too)
   * @param {string} documentId - Document ID
   * @param {string} entityType - Type of entity (not used with backend)
   * @param {number|string} entityId - ID of entity (not used with backend)
   * @param {boolean} deleteFile - Whether to delete the file itself
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocument(documentId, entityType, entityId, deleteFile = false) {
    try {
      if (isLicenseLocked()) {
        return false;
      }
      // Get document metadata to retrieve file_path
      const document = await this.getDocumentById(documentId);
      if (!document) return false;

      // 1. Soft-delete metadata in backend (always happens)
      await apiClient.delete(`/documents/${documentId}`);

      // 2. Optionally delete file from filesystem/IndexedDB
      if (deleteFile && document.storagePath) {
        try {
          if (isElectron() && window.electronAPI?.deleteFile) {
            const result = await window.electronAPI.deleteFile(
              document.storagePath,
            );
            if (!result?.ok) {
              throw new Error(result?.error || "Delete failed");
            }
          } else {
            await this.storageProvider.deleteFile(document.storagePath);
          }
        } catch (storageError) {
          console.error(
            "DocumentService: Storage deletion failed",
            storageError,
          );
          // Don't fail the whole operation if file deletion fails
        }
      }

      return true;
    } catch (error) {
      console.error("DocumentService: Delete failed", error);
      return false;
    }
  }

  /**
   * Opens a document with system default application
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} Success status
   */
  async openDocument(documentId) {
    try {
      const document = await this.getDocumentById(documentId);
      if (!document || document.metadata.isDeleted) {
        throw new Error("Document not found");
      }

      // Check if file exists
      const exists = await this.documentFileExists(documentId);
      if (!exists) {
        throw new Error("File not found in storage");
      }

      if (isElectron() && window.electronAPI?.openFile) {
        const result = await window.electronAPI.openFile(document.storagePath);
        if (!result?.ok) {
          throw new Error(result?.error || "Open failed");
        }
        return true;
      }
      await this.storageProvider.openFile(document.storagePath);
      return true;
    } catch (error) {
      console.error("DocumentService: Open failed", error);
      throw error;
    }
  }

  /**
   * Reveals document in file explorer
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} Success status
   */
  async revealDocument(documentId) {
    try {
      const document = await this.getDocumentById(documentId);
      if (!document || document.metadata.isDeleted) {
        throw new Error("Document not found");
      }

      if (isElectron() && window.electronAPI?.revealFile) {
        const result = await window.electronAPI.revealFile(
          document.storagePath,
        );
        if (!result?.ok) {
          throw new Error(result?.error || "Reveal failed");
        }
        return true;
      }
      await this.storageProvider.revealFile(document.storagePath);
      return true;
    } catch (error) {
      console.error("DocumentService: Reveal failed", error);
      throw error;
    }
  }

  /**
   * Downloads a document
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} Success status
   */
  async downloadDocument(documentId) {
    try {
      if (isLicenseLocked()) {
        throw new Error("License inactive");
      }
      const document = await this.getDocumentById(documentId);
      if (!document || document.metadata.isDeleted) {
        throw new Error("Document not found");
      }

      if (isElectron() && window.electronAPI?.downloadFile) {
        const result = await window.electronAPI.downloadFile(
          document.storagePath,
          document.name,
        );
        if (!result?.ok) {
          throw new Error(result?.error || "Download failed");
        }
        return true;
      }
      await this.storageProvider.downloadFile(document.storagePath);
      return true;
    } catch (error) {
      console.error("DocumentService: Download failed", error);
      throw error;
    }
  }

  /**
   * Gets a preview URL for a document (images, PDFs)
   * @param {string} documentId - Document ID
   * @returns {Promise<string|null>} Preview URL or null
   */
  async getPreviewUrl(documentId) {
    try {
      const document = await this.getDocumentById(documentId);
      if (!document || document.metadata.isDeleted) return null;

      return await this.storageProvider.getPreviewUrl(document.storagePath);
    } catch (error) {
      console.error("DocumentService: Preview failed", error);
      return null;
    }
  }

  /**
   * Checks if a document file exists in storage
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>}
   */
  async documentFileExists(documentId) {
    try {
      const document = await this.getDocumentById(documentId);
      if (!document) return false;

      if (isElectron() && window.electronAPI?.fileExists) {
        const result = await window.electronAPI.fileExists(
          document.storagePath,
        );
        return !!result?.exists;
      }
      return await this.storageProvider.fileExists(document.storagePath);
    } catch (error) {
      console.error("DocumentService: File check failed", error);
      return false;
    }
  }

  /**
   * Relinks a document to a new file (if original is missing)
   * @param {string} documentId - Document ID
   * @param {File} newFile - Replacement file
   * @returns {Promise<boolean>} Success status
   */
  async relinkDocument(documentId, newFile) {
    try {
      if (isLicenseLocked()) {
        return false;
      }
      const document = await this.getDocumentById(documentId);
      if (!document) return false;

      let filePath = null;
      let mimeType = newFile.type || document.mimeType;
      let sizeBytes = newFile.size;
      const extension = newFile.name.split(".").pop();
      const governance = await this.getFormatGovernance();

      if (isElectron() && window.electronAPI?.apiRequest) {
        const uploadResult = await this.uploadFileToBackend(newFile);
        filePath = uploadResult.file_path;
        mimeType = uploadResult.mime_type || mimeType;
        sizeBytes = uploadResult.size_bytes || sizeBytes;
        if (document.storagePath && window.electronAPI?.deleteFile) {
          await window.electronAPI.deleteFile(document.storagePath);
        }
      } else {
        await this.storageProvider.deleteFile(document.storagePath);
        const storageResult = await this.storageProvider.storeFile(newFile, {
          directory: "documents",
        });
        if (!storageResult.success) return false;
        filePath = storageResult.path;
      }

      // Update document metadata in backend
      await apiClient.put(`/documents/${documentId}`, {
        title: newFile.name,
        file_path: filePath,
        mime_type:
          mimeType ||
          this.resolveGovernedMimeType(governance, extension) ||
          getMimeType(extension),
        size_bytes: sizeBytes,
        original_filename: newFile.name,
      });

      return true;
    } catch (error) {
      console.error("DocumentService: Relink failed", error);
      return false;
    }
  }

  /**
   * Retry text extraction for a failed document.
   * @param {string} documentId
   * @returns {Promise<Object>} Updated document
   */
  async retryExtraction(documentId) {
    return apiClient.post(`/documents/${documentId}/retry-extraction`, {});
  }

  /**
   * Trigger OCR for a document marked as needs_ocr.
   * @param {string} documentId
   * @returns {Promise<Object>} Updated document
   */
  async runOcr(documentId) {
    return apiClient.post(`/documents/${documentId}/run-ocr`, {});
  }

  /**
   * Gets storage statistics
   * @returns {Promise<Object>}
   */
  async getStorageStats() {
    return await this.storageProvider.getStorageStats();
  }
}

// Export singleton instance
const documentService = new DocumentService();
export default documentService;
