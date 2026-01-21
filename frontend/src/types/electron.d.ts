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

  /**
   * Read local license file
   */
  readLicenseFile: () => Promise<{ exists: boolean; contents?: string }>;

  /**
   * Write local license file (overwrites existing)
   */
  writeLicenseFile: (licenseData: unknown) => Promise<{ ok: boolean }>;

  /**
   * Read device id
   */
  readDeviceId: () => Promise<{ exists: boolean; deviceId?: string }>;

  /**
   * Write device id
   */
  writeDeviceId: (deviceId: string) => Promise<{ ok: boolean }>;

  /**
   * Open external URL
   */
  openExternal: (url: string) => Promise<void>;

  /**
   * Listen for activation deep link
   */
  onActivationUrl: (handler: (url: string) => void) => void;

}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
