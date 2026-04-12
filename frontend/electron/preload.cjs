// Electron Preload Script for Ordinay
// Exposes safe APIs to the renderer process

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose Electron APIs to the renderer process
 * Using contextBridge for security (contextIsolation: true)
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Send an API request to the backend via IPC (replaces direct HTTP fetch).
   * The main process proxies this through a named pipe to the Express backend.
   *
   * @param {string} method  HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param {string} url     API path with optional query string, e.g. "/clients?status=active"
   * @param {*}      [body]  Request body (will be JSON-stringified by main process)
   * @returns {Promise<{status: number, data: *}>}
   */
  apiRequest: (method, url, body) =>
    ipcRenderer.invoke('api-request', { method, url, body }),

  /**
   * Get backend configuration (port, URLs)
   * @returns {Promise<{port: number, baseUrl: string, apiUrl: string, useIPC: boolean}>}
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
   * @param {object} licenseData - Signed license payload
   * @returns {Promise<{ok: boolean}>}
   */
  writeLicenseFile: (licenseData) => ipcRenderer.invoke('write-license-file', licenseData),

  /**
   * Read device id
   * @returns {Promise<{exists: boolean, deviceId?: string}>}
   */
  readDeviceId: () => ipcRenderer.invoke('read-device-id'),

  /**
   * Write device id
   * @param {string} deviceId
   * @returns {Promise<{ok: boolean}>}
   */
  writeDeviceId: (deviceId) => ipcRenderer.invoke('write-device-id', deviceId),

  /**
   * Read secure agent token cache from main process storage.
   * @returns {Promise<{exists: boolean, token?: string, expiresAt?: number}>}
   */
  readAgentTokenCache: () => ipcRenderer.invoke('read-agent-token-cache'),

  /**
   * Write secure agent token cache through main process storage.
   * @param {string} token
   * @param {number} expiresAt
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  writeAgentTokenCache: (token, expiresAt) =>
    ipcRenderer.invoke('write-agent-token-cache', { token, expiresAt }),

  /**
   * Clear secure agent token cache from main process storage.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  clearAgentTokenCache: () => ipcRenderer.invoke('clear-agent-token-cache'),

  /**
   * Open external web URL (https only)
   * @param {string} url
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  openExternalWebUrl: (url) => ipcRenderer.invoke('open-external-web-url', url),

  /**
   * Open external mailto URL
   * @param {string} url
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  openExternalMailto: (url) => ipcRenderer.invoke('open-external-mailto', url),

  /**
   * Deprecated broad external URL opener.
   * Use openExternalWebUrl/openExternalMailto instead.
   * @param {string} url
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),

  /**
   * Reset app data (backend DB + documents)
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  resetAppData: () => ipcRenderer.invoke('reset-app-data'),

  /**
   * File system helpers for local document storage
   */
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  openFile: (filePath) => ipcRenderer.invoke('file-open', filePath),
  revealFile: (filePath) => ipcRenderer.invoke('file-reveal', filePath),
  downloadFile: (filePath, fileName) =>
    ipcRenderer.invoke('file-download', { filePath, fileName }),
  deleteFile: (filePath) => ipcRenderer.invoke('file-delete', filePath),

  /**
   * Listen for activation deep links
   * @param {(url: string) => void} handler
   */
  onActivationUrl: (handler) => {
    const listener = (_event, url) => handler(url);
    ipcRenderer.on('activation-url', listener);
    return () => ipcRenderer.removeListener('activation-url', listener);
  },

  /**
   * Get current update status
   * @returns {Promise<object>}
   */
  getUpdateStatus: () => ipcRenderer.invoke('updates-get-status'),

  /**
   * Listen for update status changes
   * @param {(status: object) => void} handler
   */
  onUpdateStatus: (handler) => {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },

  /**
   * Trigger a manual update check
   * @returns {Promise<object>}
   */
  checkForUpdates: () => ipcRenderer.invoke('updates-check'),

  /**
   * Download the available update
   * @returns {Promise<object>}
   */
  downloadUpdate: () => ipcRenderer.invoke('updates-download'),

  /**
   * Install the downloaded update and restart
   * @returns {Promise<{ok: boolean}>}
   */
  installUpdate: () => ipcRenderer.invoke('updates-install'),

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
