/**
 * Storage Provider Interface
 *
 * Abstraction for document storage, allowing swapping between local filesystem,
 * cloud storage, or hybrid approaches without changing business logic.
 */

/**
 * Result of a storage operation
 * @typedef {Object} StorageResult
 * @property {boolean} success - Whether operation succeeded
 * @property {string} path - Provider-specific path/reference to stored file
 * @property {string} checksum - File hash for integrity verification
 * @property {string} error - Error message if operation failed
 */

/**
 * Storage provider interface
 * All providers must implement these methods
 */
export class IStorageProvider {
  /**
   * Gets the provider identifier
   * @returns {string}
   */
  getProviderId() {
    throw new Error('getProviderId() must be implemented');
  }

  /**
   * Stores a file
   * @param {File} file - File to store
   * @param {Object} options - Storage options
   * @param {string} options.directory - Optional subdirectory
   * @param {string} options.filename - Optional custom filename
   * @returns {Promise<StorageResult>}
   */
  async storeFile(file, options = {}) {
    throw new Error('storeFile() must be implemented');
  }

  /**
   * Retrieves a file as a Blob
   * @param {string} path - Provider-specific path
   * @returns {Promise<Blob>}
   */
  async retrieveFile(path) {
    throw new Error('retrieveFile() must be implemented');
  }

  /**
   * Checks if a file exists
   * @param {string} path - Provider-specific path
   * @returns {Promise<boolean>}
   */
  async fileExists(path) {
    throw new Error('fileExists() must be implemented');
  }

  /**
   * Deletes a file permanently
   * @param {string} path - Provider-specific path
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(path) {
    throw new Error('deleteFile() must be implemented');
  }

  /**
   * Opens a file with system default application
   * @param {string} path - Provider-specific path
   * @returns {Promise<void>}
   */
  async openFile(path) {
    throw new Error('openFile() must be implemented');
  }

  /**
   * Shows file in system file explorer
   * @param {string} path - Provider-specific path
   * @returns {Promise<void>}
   */
  async revealFile(path) {
    throw new Error('revealFile() must be implemented');
  }

  /**
   * Generates a preview URL for a file (for images, PDFs)
   * @param {string} path - Provider-specific path
   * @returns {Promise<string>} URL or data URL
   */
  async getPreviewUrl(path) {
    throw new Error('getPreviewUrl() must be implemented');
  }

  /**
   * Computes file checksum
   * @param {File|Blob} file - File to hash
   * @returns {Promise<string>} SHA-256 hash
   */
  async computeChecksum(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

export default IStorageProvider;
