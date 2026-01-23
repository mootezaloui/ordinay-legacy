/**
 * Centralized Document Service
 *
 * Single source of truth for all document operations.
 * Entity-agnostic, storage-abstracted, desktop-first design.
 *
 * ARCHITECTURE:
 * - File blobs: IndexedDB (via LocalStorageProvider)
 * - Metadata: SQLite backend (via API)
 * - Bridge: file_path (stored in both layers)
 */

import {
  createDocument,
  isValidFileType,
  isValidFileSize,
  getCategoryFromType,
  formatFileSize,
  getMimeType,
} from "../models/Document.js";
import { LocalStorageProvider } from "./storage/LocalStorageProvider.js";
import { getApiBase } from "../lib/apiConfig";
import { getAppLicenseState } from "./licenseService";

const isLicenseLocked = () =>
  ["ACTIVATING", "ERROR"].includes(getAppLicenseState());

/**
 * Document service class
 * Manages all document operations with abstracted storage
 */
class DocumentService {
  constructor() {
    // Default to local storage provider (file blobs only)
    this.storageProvider = new LocalStorageProvider();
  }

  /**
   * Gets the API base URL dynamically
   * @private
   */
  getApiBase() {
    return getApiBase();
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
  }) {
    const payload = {
      title,
      file_path,
      mime_type,
      size_bytes,
      notes: category || null,
      copy_type: copy_type || null,
    };

    // Map entityType to backend foreign key field, always use 'lawsuit' for legal proceedings
    let entityField, directoryType;
    if (entityType === "lawsuit") {
      entityField = "lawsuit_id";
      directoryType = "lawsuit";
    } else if (entityType === "personalTask") {
      entityField = "personal_task_id";
      directoryType = "personalTask";
    } else {
      entityField = `${entityType}_id`;
      directoryType = entityType;
    }
    payload[entityField] = parseInt(entityId, 10);

    // Ensure file_path uses legacy storage directory for lawsuits
    if (payload.file_path && payload.file_path.startsWith("proces/")) {
      payload.file_path = payload.file_path.replace("proces/", "case/");
    }

    console.debug("[DocumentService] Upload document payload:", payload);
    const response = await fetch(`${this.getApiBase()}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Validates a file before upload
   * @param {File} file - File to validate
   * @returns {Object} Validation result
   */
  validateFile(file) {
    const extension = file.name.split(".").pop();

    if (!isValidFileType(extension)) {
      return {
        valid: false,
        error: `Type de fichier non supporté: .${extension}`,
      };
    }

    if (!isValidFileSize(file.size)) {
      return {
        valid: false,
        error: "Fichier trop volumineux",
      };
    }

    return { valid: true };
  }

  /**
   * Uploads a file and links it to an entity
   * @param {File} file - File to upload
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @param {string} category - User-defined category
   * @returns {Promise<Object>} Result with document or error
   */
  async uploadDocument(file, entityType, entityId, category = "", options = {}) {
    try {
      if (isLicenseLocked()) {
        return { success: false, error: "License inactive" };
      }
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 1. Store file blob in IndexedDB
      const extension = file.name.split(".").pop();
      // Map 'proces' to 'lawsuit' for storage and backend if needed
      let mappedEntityType = entityType === "proces" ? "lawsuit" : entityType;
      const storageResult = await this.storageProvider.storeFile(file, {
        directory: mappedEntityType,
      });

      if (!storageResult.success) {
        return { success: false, error: storageResult.error };
      }

      // 2. Store metadata in backend SQLite
      const backendDoc = await this.createBackendMetadata({
        title: file.name,
        file_path: storageResult.path.replace("proces/", "case/"),
        mime_type: file.type || getMimeType(extension),
        size_bytes: file.size,
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
  async uploadMultipleDocuments(files, entityType, entityId, category = "", options = {}) {
    if (isLicenseLocked()) {
      return {
        successful: [],
        failed: files.map((file) => ({ file: file.name, error: "License inactive" })),
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
      } else if (entityType === "officer") {
        return [];
      } else {
        entityField = `${entityType}_id`;
      }
      const response = await fetch(
        `${this.getApiBase()}/documents?${entityField}=${entityId}`,
      );

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status}`);
      }

      const backendDocs = await response.json();

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
      const response = await fetch(
        `${this.getApiBase()}/documents/${documentId}`,
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status}`);
      }

      const backendDoc = await response.json();
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
      const response = await fetch(
        `${this.getApiBase()}/documents/${documentId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status}`);
      }

      // 2. Optionally delete file blob from IndexedDB
      if (deleteFile && document.storagePath) {
        try {
          console.log(
            `DocumentService: Deleting file from IndexedDB: ${document.storagePath}`,
          );
          await this.storageProvider.deleteFile(document.storagePath);
          console.log(
            `DocumentService: File deleted successfully: ${document.storagePath}`,
          );
        } catch (storageError) {
          console.error(
            "DocumentService: Storage deletion failed",
            storageError,
          );
          // Don't fail the whole operation if file blob deletion fails
          // Metadata is already soft-deleted in backend
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
      const exists = await this.storageProvider.fileExists(
        document.storagePath,
      );
      if (!exists) {
        throw new Error("File not found in storage");
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

      // Delete old file if it exists
      await this.storageProvider.deleteFile(document.storagePath);

      // Store new file
      const extension = newFile.name.split(".").pop();
      const storageResult = await this.storageProvider.storeFile(newFile, {
        directory: "documents",
      });

      if (!storageResult.success) return false;

      // Update document metadata in backend
      const response = await fetch(
        `${this.getApiBase()}/documents/${documentId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_path: storageResult.path,
            mime_type: newFile.type || getMimeType(extension),
            size_bytes: newFile.size,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error("DocumentService: Relink failed", error);
      return false;
    }
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


