/**
 * Centralized Document Service
 *
 * Single source of truth for all document operations.
 * Entity-agnostic, storage-abstracted, desktop-first design.
 */

import {
  createDocument,
  addDocumentLink,
  removeDocumentLink,
  getDocumentsForEntity,
  softDeleteDocument,
  restoreDocument,
  isValidFileType,
  isValidFileSize,
  getCategoryFromType,
} from "../models/Document.js";
import { LocalStorageProvider } from "./storage/LocalStorageProvider.js";

/**
 * Document service class
 * Manages all document operations with abstracted storage
 */
class DocumentService {
  constructor() {
    // Default to local storage provider (can be swapped for cloud later)
    this.storageProvider = new LocalStorageProvider();

    // In-memory document registry (will be persisted to localStorage)
    this.documents = [];

    // Load documents from localStorage on init
    this.loadDocuments();
  }

  /**
   * Sets a different storage provider
   * @param {IStorageProvider} provider - Storage provider instance
   */
  setStorageProvider(provider) {
    this.storageProvider = provider;
  }

  /**
   * Loads documents from localStorage
   */
  loadDocuments() {
    try {
      const stored = localStorage.getItem("documents");
      if (stored) {
        this.documents = JSON.parse(stored);
      }
    } catch (error) {
      console.error("DocumentService: Failed to load documents", error);
      this.documents = [];
    }
  }

  /**
   * Persists documents to localStorage
   */
  saveDocuments() {
    try {
      localStorage.setItem("documents", JSON.stringify(this.documents));
    } catch (error) {
      console.error("DocumentService: Failed to save documents", error);
    }
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
  async uploadDocument(file, entityType, entityId, category = "") {
    try {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Store file using storage provider
      const extension = file.name.split(".").pop();
      const storageResult = await this.storageProvider.storeFile(file, {
        directory: entityType,
      });

      if (!storageResult.success) {
        return { success: false, error: storageResult.error };
      }

      // Create document entity
      const document = createDocument({
        name: file.name,
        type: extension,
        sizeBytes: file.size,
        storageProvider: this.storageProvider.getProviderId(),
        storagePath: storageResult.path,
        checksum: storageResult.checksum,
      });

      // Link to entity
      addDocumentLink(document, entityType, entityId, category);

      // Add to registry
      this.documents.push(document);
      this.saveDocuments();

      return {
        success: true,
        document,
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
  async uploadMultipleDocuments(files, entityType, entityId, category = "") {
    const results = {
      successful: [],
      failed: [],
    };

    for (const file of files) {
      const result = await this.uploadDocument(
        file,
        entityType,
        entityId,
        category
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
   * @returns {Document[]} Documents linked to the entity
   */
  getEntityDocuments(entityType, entityId) {
    return getDocumentsForEntity(this.documents, entityType, entityId);
  }

  /**
   * Gets a document by ID
   * @param {string} documentId - Document ID
   * @returns {Document|null}
   */
  getDocumentById(documentId) {
    return this.documents.find((doc) => doc.id === documentId) || null;
  }

  /**
   * Links an existing document to an entity
   * @param {string} documentId - Document ID
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @param {string} category - User-defined category
   * @returns {boolean} Success status
   */
  linkDocumentToEntity(documentId, entityType, entityId, category = "") {
    const document = this.getDocumentById(documentId);
    if (!document) return false;

    addDocumentLink(document, entityType, entityId, category);
    this.saveDocuments();
    return true;
  }

  /**
   * Unlinks a document from an entity (removes link only)
   * @param {string} documentId - Document ID
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   * @returns {boolean} Success status
   */
  unlinkDocumentFromEntity(documentId, entityType, entityId) {
    const document = this.getDocumentById(documentId);
    if (!document) return false;

    removeDocumentLink(document, entityType, entityId);
    this.saveDocuments();
    return true;
  }

  /**
   * Deletes a document (user choice: link only or file too)
   * @param {string} documentId - Document ID
   * @param {string} entityType - Type of entity (for link removal)
   * @param {number|string} entityId - ID of entity (for link removal)
   * @param {boolean} deleteFile - Whether to delete the file itself
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocument(documentId, entityType, entityId, deleteFile = false) {
    try {
      const document = this.getDocumentById(documentId);
      if (!document) return false;

      // Store original state for rollback
      const originalLinks = [...document.links];
      const originalDeleted = document.deleted;

      // Remove link first
      removeDocumentLink(document, entityType, entityId);
      console.log(
        `DocumentService: Link removed. Remaining links: ${document.links.length}`
      );

      // Determine if we should delete the file
      const shouldDeleteFile = deleteFile || document.links.length === 0;

      if (shouldDeleteFile) {
        console.log(
          `DocumentService: Will delete file (deleteFile=${deleteFile}, noMoreLinks=${
            document.links.length === 0
          })`
        );

        try {
          // Delete from storage FIRST (atomic operation)
          console.log(
            `DocumentService: Deleting file from storage: ${document.storagePath}`
          );
          await this.storageProvider.deleteFile(document.storagePath);
          console.log(
            `DocumentService: File deleted from storage successfully: ${document.storagePath}`
          );

          // Only soft delete metadata after storage deletion succeeds
          softDeleteDocument(document);
          console.log(
            `DocumentService: Document metadata marked as deleted: ${documentId}`
          );
        } catch (storageError) {
          // Rollback: restore links and deleted state
          document.links = originalLinks;
          document.deleted = originalDeleted;
          console.error(
            "DocumentService: Storage deletion failed, rolling back metadata changes",
            storageError
          );
          throw storageError;
        }
      } else {
        console.log(
          `DocumentService: File kept in storage (link removed only)`
        );
      }

      this.saveDocuments();
      console.log(
        `DocumentService: Documents saved to localStorage after deletion`
      );
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
      const document = this.getDocumentById(documentId);
      if (!document || document.metadata.isDeleted) {
        throw new Error("Document not found");
      }

      // Check if file exists
      const exists = await this.storageProvider.fileExists(
        document.storagePath
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
      const document = this.getDocumentById(documentId);
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
      const document = this.getDocumentById(documentId);
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
      const document = this.getDocumentById(documentId);
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
      const document = this.getDocumentById(documentId);
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
      const document = this.getDocumentById(documentId);
      if (!document) return false;

      // Delete old file if it exists
      await this.storageProvider.deleteFile(document.storagePath);

      // Store new file
      const extension = newFile.name.split(".").pop();
      const storageResult = await this.storageProvider.storeFile(newFile, {
        directory: "documents",
      });

      if (!storageResult.success) return false;

      // Update document metadata
      document.storagePath = storageResult.path;
      document.checksum = storageResult.checksum;
      document.modifiedDate = new Date().toISOString();
      document.metadata.isDeleted = false;

      this.saveDocuments();
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

  /**
   * Migrates legacy document data to new system
   * @param {Object} legacyDocuments - Legacy documents from mockData
   * @param {string} entityType - Type of entity
   * @param {number|string} entityId - ID of entity
   */
  migrateLegacyDocuments(legacyDocuments, entityType, entityId) {
    // This method helps migrate old document structures
    // to the new centralized system without breaking existing data
    console.warn("DocumentService: Legacy migration not yet implemented");
  }
}

// Export singleton instance
const documentService = new DocumentService();
export default documentService;
