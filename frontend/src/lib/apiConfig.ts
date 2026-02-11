/// <reference types="vite/client" />
/**
 * API Configuration Module
 * 
 * Centralized configuration for API base URL.
 * Handles both Electron (dynamic port via IPC) and web (env variable) contexts.
 * 
 * Usage:
 *   import { getApiBase, initializeApiConfig } from '@/lib/apiConfig';
 *   
 *   // At app startup (in Electron context):
 *   await initializeApiConfig();
 *   
 *   // Then anywhere:
 *   const url = `${getApiBase()}/clients`;
 */

import type { BackendConfig } from '../types/electron';

// Default fallback for web development
const DEFAULT_API_BASE = 'http://localhost:3000/api';

// Cached API base URL
let cachedApiBase: string | null = null;
let cachedBackendConfig: BackendConfig | null = null;

/**
 * Check if we're running in Electron
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
}

/**
 * Initialize API configuration
 * Should be called once at app startup
 * 
 * @returns Promise<string> The API base URL
 */
export async function initializeApiConfig(): Promise<string> {
  if (cachedApiBase) {
    return cachedApiBase;
  }

  if (isElectron()) {
    try {
      // Get backend config from Electron main process
      const config = await window.electronAPI!.getBackendConfig();
      cachedBackendConfig = config;
      // When IPC transport is available the renderer does not need an HTTP
      // base URL — all requests go through window.electronAPI.apiRequest().
      // We still cache a value so getApiBase() works for any edge cases.
      cachedApiBase = config.useIPC ? 'ipc://backend/api' : config.apiUrl;
    } catch (error) {
      console.error('[API Config] Failed to get Electron config:', error);
      cachedApiBase = getEnvApiBase();
    }
  } else {
    // Web context - use environment variable
    cachedApiBase = getEnvApiBase();
  }

  return cachedApiBase;
}

/**
 * Get API base URL from environment variable
 */
function getEnvApiBase(): string {
  // Vite environment variable
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  return DEFAULT_API_BASE;
}

/**
 * Get the API base URL
 * Returns cached value or falls back to environment/default
 * 
 * NOTE: In Electron context, initializeApiConfig() should be called first
 */
export function getApiBase(): string {
  if (cachedApiBase) {
    return cachedApiBase;
  }
  
  // Fallback if not initialized
  console.warn('[API Config] getApiBase() called before initialization, using fallback');
  return getEnvApiBase();
}

/**
 * Get full backend configuration (Electron only)
 */
export function getBackendConfig(): BackendConfig | null {
  return cachedBackendConfig;
}

/**
 * Reset cached configuration (for testing)
 */
export function resetApiConfig(): void {
  cachedApiBase = null;
  cachedBackendConfig = null;
}
