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

  /**
   * Read local license file
   * @returns {Promise<{exists: boolean, contents?: string}>}
   */
  readLicenseFile: () => ipcRenderer.invoke('read-license-file'),

  /**
   * Write local license file (overwrites existing)
   * @param {object} licenseData
   * @returns {Promise<{ok: boolean}>}
   */
  writeLicenseFile: (licenseData) => ipcRenderer.invoke('write-license-file', licenseData),

  /**
   * Window control methods
   */
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
});

// Log that preload script has loaded
console.log('[Preload] Electron APIs exposed to renderer');
