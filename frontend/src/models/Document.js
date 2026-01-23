/**
 * Document Model - First-Class Entity
 *
 * Represents a centralized document that can be linked to multiple entities.
 * Desktop-first design with abstracted storage for future cloud migration.
 */

/**
 * Document metadata structure
 * @typedef {Object} Document
 * @property {string} id - Unique document identifier
 * @property {string} name - Original filename
 * @property {string} type - File extension (pdf, docx, jpg, etc.)
 * @property {string} category - Human-readable category (PDF, Document, Image, etc.)
 * @property {number} sizeBytes - File size in bytes
 * @property {string} size - Human-readable size (e.g., "1.2 MB")
 * @property {string} uploadDate - ISO date string when document was created
 * @property {string} modifiedDate - ISO date string when document was last modified
 * @property {string} storageProvider - Storage provider identifier (e.g., "local", "cloud")
 * @property {string} storagePath - Provider-specific path/reference to file
 * @property {string} mimeType - MIME type of the file
 * @property {string} checksum - File hash for integrity verification (SHA-256)
 * @property {DocumentLink[]} links - Entities this document is linked to
 * @property {DocumentMetadata} metadata - Additional metadata
 */

/**
 * Document link to an entity
 * @typedef {Object} DocumentLink
 * @property {string} entityType - Type of entity (client, dossier, lawsuit, task, etc.)
 * @property {number|string} entityId - ID of the linked entity
 * @property {string} linkedDate - ISO date string when link was created
 * @property {string} linkedBy - User who created the link (future use)
 * @property {string} category - User-defined category for this link (e.g., "Identité", "Contrat")
 */

/**
 * Additional document metadata
 * @typedef {Object} DocumentMetadata
 * @property {string} description - Optional description
 * @property {string[]} tags - Optional tags for categorization
 * @property {number} version - Version number (for future versioning)
 * @property {boolean} isDeleted - Soft delete flag
 * @property {string} deletedDate - ISO date string when deleted
 */

/**
 * File type to category mapping
 */
export const FILE_CATEGORIES = {
  pdf: "PDF",
  doc: "Document",
  docx: "Document",
  xls: "Tableur",
  xlsx: "Tableur",
  ppt: "Présentation",
  pptx: "Présentation",
  jpg: "Image",
  jpeg: "Image",
  png: "Image",
  gif: "Image",
  bmp: "Image",
  svg: "Image",
  zip: "Archive",
  rar: "Archive",
  "7z": "Archive",
  txt: "Texte",
  csv: "Texte",
  json: "Texte",
};

/**
 * MIME type mapping
 */
export const MIME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  "7z": "application/x-7z-compressed",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
};

/**
 * Creates a new Document instance
 * @param {Object} params - Document parameters
 * @returns {Document}
 */
export function createDocument({
  id,
  name,
  type,
  sizeBytes,
  storageProvider,
  storagePath,
  checksum,
  category,
  mimeType,
}) {
  const now = new Date().toISOString();

  return {
    id: id || generateDocumentId(),
    name,
    type: type.toLowerCase(),
    category: category || getCategoryFromType(type),
    sizeBytes,
    size: formatFileSize(sizeBytes),
    uploadDate: now,
    modifiedDate: now,
    storageProvider,
    storagePath,
    mimeType: mimeType || getMimeType(type),
    checksum,
    links: [],
    metadata: {
      description: "",
      tags: [],
      version: 1,
      isDeleted: false,
      deletedDate: null,
    },
  };
}

/**
 * Adds a link between a document and an entity
 * @param {Document} document - Document to link
 * @param {string} entityType - Type of entity
 * @param {number|string} entityId - ID of entity
 * @param {string} category - Category for this link
 * @returns {Document} Updated document
 */
export function addDocumentLink(document, entityType, entityId, category = "") {
  const link = {
    entityType,
    entityId,
    linkedDate: new Date().toISOString(),
    linkedBy: "system", // Future: actual user ID
    category,
  };

  // Prevent duplicate links
  const existingLink = document.links.find(
    (l) => l.entityType === entityType && l.entityId === entityId
  );

  if (!existingLink) {
    document.links.push(link);
  }

  return document;
}

/**
 * Removes a link between a document and an entity
 * @param {Document} document - Document to unlink
 * @param {string} entityType - Type of entity
 * @param {number|string} entityId - ID of entity
 * @returns {Document} Updated document
 */
export function removeDocumentLink(document, entityType, entityId) {
  document.links = document.links.filter(
    (l) => !(l.entityType === entityType && l.entityId === entityId)
  );
  return document;
}

/**
 * Gets all links for a specific entity
 * @param {Document[]} documents - Array of documents
 * @param {string} entityType - Type of entity
 * @param {number|string} entityId - ID of entity
 * @returns {Document[]} Documents linked to the entity
 */
export function getDocumentsForEntity(documents, entityType, entityId) {
  return documents.filter(
    (doc) =>
      doc.links.some(
        (l) => l.entityType === entityType && l.entityId === entityId
      ) && !doc.metadata.isDeleted
  );
}

/**
 * Soft deletes a document
 * @param {Document} document - Document to delete
 * @returns {Document} Updated document
 */
export function softDeleteDocument(document) {
  document.metadata.isDeleted = true;
  document.metadata.deletedDate = new Date().toISOString();
  return document;
}

/**
 * Restores a soft-deleted document
 * @param {Document} document - Document to restore
 * @returns {Document} Updated document
 */
export function restoreDocument(document) {
  document.metadata.isDeleted = false;
  document.metadata.deletedDate = null;
  return document;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique document ID
 * @returns {string}
 */
export function generateDocumentId() {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets category from file extension
 * @param {string} extension - File extension
 * @returns {string} Category name
 */
export function getCategoryFromType(extension) {
  return FILE_CATEGORIES[extension?.toLowerCase()] || "Autre";
}

/**
 * Gets MIME type from file extension
 * @param {string} extension - File extension
 * @returns {string} MIME type
 */
export function getMimeType(extension) {
  return MIME_TYPES[extension?.toLowerCase()] || "application/octet-stream";
}

/**
 * Formats file size to human-readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Validates file type
 * @param {string} extension - File extension
 * @returns {boolean}
 */
export function isValidFileType(extension) {
  return extension?.toLowerCase() in FILE_CATEGORIES;
}

/**
 * Validates file size
 * @param {number} bytes - File size in bytes
 * @param {number} maxBytes - Maximum allowed bytes (default: unlimited for desktop app)
 * @returns {boolean}
 */
export function isValidFileSize(bytes, maxBytes = Infinity) {
  return bytes <= maxBytes;
}

export default {
  createDocument,
  addDocumentLink,
  removeDocumentLink,
  getDocumentsForEntity,
  softDeleteDocument,
  restoreDocument,
  generateDocumentId,
  getCategoryFromType,
  getMimeType,
  formatFileSize,
  isValidFileType,
  isValidFileSize,
  FILE_CATEGORIES,
  MIME_TYPES,
};
