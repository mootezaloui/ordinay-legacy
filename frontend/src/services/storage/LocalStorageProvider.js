/**
 * Local Filesystem Storage Provider
 *
 * Desktop-first implementation using File System Access API and IndexedDB.
 * Stores files in browser's IndexedDB with optional filesystem integration.
 *
 * Future Enhancement: Can be extended to use Electron's filesystem API
 * when running as desktop app for true native file access.
 */

import { IStorageProvider } from "./IStorageProvider.js";

/**
 * IndexedDB database name and version
 */
const DB_NAME = "LawyerAppDocuments";
const DB_VERSION = 1;
const STORE_NAME = "files";

/**
 * Local storage provider using IndexedDB
 */
export class LocalStorageProvider extends IStorageProvider {
  constructor() {
    super();
    this.db = null;
    this.providerId = "local";
  }

  /**
   * Gets the provider identifier
   * @returns {string}
   */
  getProviderId() {
    return this.providerId;
  }

  /**
   * Initializes IndexedDB
   * @returns {Promise<IDBDatabase>}
   */
  async initDB() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "path" });
        }
      };
    });
  }

  /**
   * Stores a file in IndexedDB
   * @param {File} file - File to store
   * @param {Object} options - Storage options
   * @returns {Promise<StorageResult>}
   */
  async storeFile(file, options = {}) {
    try {
      await this.initDB();

      const checksum = await this.computeChecksum(file);
      const filename = options.filename || file.name;
      const directory = options.directory || "documents";
      const path = `${directory}/${Date.now()}_${filename}`;

      // Store file in IndexedDB
      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const fileData = {
        path,
        file: file, // IndexedDB can store File objects directly
        checksum,
        uploadDate: new Date().toISOString(),
      };

      await new Promise((resolve, reject) => {
        const request = store.put(fileData);

        // Wait for the transaction to complete, not just the request
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = () => reject(request.error);
      });

      return {
        success: true,
        path,
        checksum,
        error: null,
      };
    } catch (error) {
      console.error("LocalStorageProvider: Failed to store file", error);
      return {
        success: false,
        path: null,
        checksum: null,
        error: error.message,
      };
    }
  }

  /**
   * Retrieves a file from IndexedDB
   * @param {string} path - File path
   * @returns {Promise<Blob>}
   */
  async retrieveFile(path) {
    try {
      await this.initDB();

      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(path);
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result.file);
          } else {
            reject(new Error(`File not found: ${path}`));
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("LocalStorageProvider: Failed to retrieve file", error);
      throw error;
    }
  }

  /**
   * Checks if a file exists in IndexedDB
   * @param {string} path - File path
   * @returns {Promise<boolean>}
   */
  async fileExists(path) {
    try {
      await this.initDB();

      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve) => {
        const request = store.get(path);
        request.onsuccess = () => resolve(!!request.result);
        request.onerror = () => resolve(false);
      });
    } catch (error) {
      console.error(
        "LocalStorageProvider: Failed to check file existence",
        error,
      );
      return false;
    }
  }

  /**
   * Deletes a file from IndexedDB
   * @param {string} path - File path
   * @returns {Promise<boolean>}
   */
  async deleteFile(path) {
    try {
      await this.initDB();

      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.delete(path);

        // Wait for the transaction to complete, not just the request
        transaction.oncomplete = () => {
          resolve(true);
        };
        transaction.onerror = () => {
          console.error(
            `LocalStorageProvider: Transaction error for ${path}:`,
            transaction.error,
          );
          reject(transaction.error);
        };
        request.onerror = () => {
          console.error(
            `LocalStorageProvider: Request error for ${path}:`,
            request.error,
          );
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("LocalStorageProvider: Failed to delete file", error);
      return false;
    }
  }

  /**
   * Opens a file by downloading it
   * (Browser limitation: cannot directly open with system app)
   * @param {string} path - File path
   * @returns {Promise<void>}
   */
  async openFile(path) {
    try {
      const file = await this.retrieveFile(path);
      const url = URL.createObjectURL(file);

      // Open in new tab (browser will handle with default viewer)
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.download = file.name || path.split("/").pop();
      link.click();

      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error("LocalStorageProvider: Failed to open file", error);
      throw error;
    }
  }

  /**
   * Downloads a file (browser's "show in folder" equivalent)
   * @param {string} path - File path
   * @returns {Promise<void>}
   */
  async revealFile(path) {
    try {
      const file = await this.retrieveFile(path);
      const url = URL.createObjectURL(file);

      // Trigger download (browser will show in downloads folder)
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name || path.split("/").pop();
      link.click();

      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error("LocalStorageProvider: Failed to reveal file", error);
      throw error;
    }
  }

  /**
   * Generates a preview URL for supported file types
   * @param {string} path - File path
   * @returns {Promise<string>}
   */
  async getPreviewUrl(path) {
    try {
      const file = await this.retrieveFile(path);

      // Only generate preview for images and PDFs
      const type = file.type || "";
      if (type.startsWith("image/") || type === "application/pdf") {
        return URL.createObjectURL(file);
      }

      return null;
    } catch (error) {
      console.error(
        "LocalStorageProvider: Failed to generate preview URL",
        error,
      );
      return null;
    }
  }

  /**
   * Downloads a file (utility method)
   * @param {string} path - File path
   * @returns {Promise<void>}
   */
  async downloadFile(path) {
    return this.revealFile(path);
  }

  /**
   * Gets storage statistics
   * @returns {Promise<Object>}
   */
  async getStorageStats() {
    try {
      await this.initDB();

      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const files = request.result;
          const totalSize = files.reduce(
            (sum, f) => sum + (f.file.size || 0),
            0,
          );
          resolve({
            fileCount: files.length,
            totalSize,
            files: files.map((f) => ({
              path: f.path,
              size: f.file.size,
              uploadDate: f.uploadDate,
            })),
          });
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("LocalStorageProvider: Failed to get storage stats", error);
      return { fileCount: 0, totalSize: 0, files: [] };
    }
  }

  /**
   * Clears all files from storage (use with caution)
   * @returns {Promise<boolean>}
   */
  async clearAll() {
    try {
      await this.initDB();

      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.clear();

        // Wait for the transaction to complete, not just the request
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("LocalStorageProvider: Failed to clear storage", error);
      return false;
    }
  }
}

export default LocalStorageProvider;
