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
  /** When true the renderer should use apiRequest() IPC instead of HTTP fetch */
  useIPC?: boolean;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

export interface AppPaths {
  userData: string;
  documents: string;
  database: string;
}

export interface UpdateStatus {
  status:
    | "idle"
    | "checking"
    | "update-available"
    | "up-to-date"
    | "downloading"
    | "downloaded"
    | "download-failed";
  version: string;
  availableVersion: string | null;
  progress: number | null;
  lastCheckedAt: string | null;
  updatesEnabled: boolean;
}

export interface ElectronAPI {
  /**
   * Send an API request to the backend via IPC.
   * Replaces direct HTTP fetch to localhost.
   */
  apiRequest: (
    method: string,
    url: string,
    body?: unknown,
  ) => Promise<ApiResponse>;

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
  writeLicenseFile: (
    licenseData: import("../services/licenseService").SignedLicense
  ) => Promise<{ ok: boolean }>;

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
  onActivationUrl: (handler: (url: string) => void) => () => void;

  /**
   * Get current update status
   */
  getUpdateStatus: () => Promise<UpdateStatus>;

  /**
   * Listen for update status changes
   */
  onUpdateStatus: (handler: (status: UpdateStatus) => void) => () => void;

  /**
   * Trigger a manual update check
   */
  checkForUpdates: () => Promise<UpdateStatus>;

  /**
   * Download the available update
   */
  downloadUpdate: () => Promise<UpdateStatus>;

  /**
   * Install the downloaded update and restart
   */
  installUpdate: () => Promise<{ ok: boolean }>;

  /**
   * Reset app data (backend DB + documents)
   */
  resetAppData: () => Promise<{ ok: boolean; error?: string }>;

}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
