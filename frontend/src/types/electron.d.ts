/**
 * Electron API Type Definitions
 * 
 * These types define the API exposed by the Electron preload script
 * through contextBridge.exposeInMainWorld('electronAPI', ...)
 */

export interface BackendConfig {
  port: number;
  baseUrl: string;
  apiUrl: string;
}

export interface AppPaths {
  userData: string;
  documents: string;
  database: string;
}

export interface ElectronAPI {
  /**
   * Get backend configuration (port, URLs)
   */
  getBackendConfig: () => Promise<BackendConfig>;
  
  /**
   * Get application paths
   */
  getAppPaths: () => Promise<AppPaths>;
  
  /**
   * Check if app is running in packaged mode
   */
  isPackaged: () => Promise<boolean>;
  
  /**
   * Platform information
   */
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
