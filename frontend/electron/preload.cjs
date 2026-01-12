// Electron Preload Script for Organia
// Exposes safe APIs to the renderer process

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose Electron APIs to the renderer process
 * Using contextBridge for security (contextIsolation: true)
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get backend configuration (port, URLs)
   * @returns {Promise<{port: number, baseUrl: string, apiUrl: string}>}
   */
  getBackendConfig: () => ipcRenderer.invoke('get-backend-config'),
  
  /**
   * Get application paths
   * @returns {Promise<{userData: string, documents: string, database: string}>}
   */
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  
  /**
   * Check if app is running in packaged mode
   * @returns {Promise<boolean>}
   */
  isPackaged: () => ipcRenderer.invoke('is-packaged'),
  
  /**
   * Platform information
   */
  platform: process.platform,
});

// Log that preload script has loaded
console.log('[Preload] Electron APIs exposed to renderer');
