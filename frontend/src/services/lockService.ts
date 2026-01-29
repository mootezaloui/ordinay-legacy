/**
 * services/lockService.ts
 * Handles workspace lock password management and verification
 * All operations are local-only, no cloud auth
 */

import CryptoJS from 'crypto-js';

const LOCK_STORAGE_KEY = 'ordinay_workspace_lock';
const LOCK_STATE_KEY = 'ordinay_lock_state';

export interface LockConfig {
  enabled: boolean;
  passwordHash: string;
  inactivityTimeout: number; // minutes, 0 = disabled
  lockOnStartup: boolean;
}

/**
 * Hash password using SHA-256
 * Never store plaintext passwords
 */
export const hashPassword = (password: string): string => {
  return CryptoJS.SHA256(password).toString();
};

/**
 * Get current lock configuration
 */
export const getLockConfig = (): LockConfig | null => {
  try {
    const stored = localStorage.getItem(LOCK_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error('[LockService] Failed to get lock config:', error);
    return null;
  }
};

/**
 * Save lock configuration
 */
export const saveLockConfig = (config: LockConfig): void => {
  try {
    localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('[LockService] Failed to save lock config:', error);
    throw error;
  }
};

/**
 * Enable workspace lock with a new password
 */
export const enableLock = (password: string, lockOnStartup: boolean = true, inactivityTimeout: number = 15): void => {
  const config: LockConfig = {
    enabled: true,
    passwordHash: hashPassword(password),
    inactivityTimeout,
    lockOnStartup,
  };
  saveLockConfig(config);
  
  // Lock immediately after enabling
  setLocked(true);
};

/**
 * Disable workspace lock
 */
export const disableLock = (): void => {
  localStorage.removeItem(LOCK_STORAGE_KEY);
  setLocked(false);
};

/**
 * Verify password against stored hash
 */
export const verifyPassword = (password: string): boolean => {
  const config = getLockConfig();
  if (!config) return false;
  
  const inputHash = hashPassword(password);
  return inputHash === config.passwordHash;
};

/**
 * Change password (requires current password)
 */
export const changePassword = (currentPassword: string, newPassword: string): boolean => {
  const config = getLockConfig();
  if (!config) return false;
  
  // Verify current password
  if (!verifyPassword(currentPassword)) {
    return false;
  }
  
  // Update with new password hash
  config.passwordHash = hashPassword(newPassword);
  saveLockConfig(config);
  return true;
};

/**
 * Update lock settings (timeout, startup behavior)
 */
export const updateLockSettings = (updates: Partial<Pick<LockConfig, 'inactivityTimeout' | 'lockOnStartup'>>): void => {
  const config = getLockConfig();
  if (!config) return;
  
  if (updates.inactivityTimeout !== undefined) {
    config.inactivityTimeout = updates.inactivityTimeout;
  }
  if (updates.lockOnStartup !== undefined) {
    config.lockOnStartup = updates.lockOnStartup;
  }
  
  saveLockConfig(config);
};

/**
 * Check if lock is currently active
 */
export const isLocked = (): boolean => {
  try {
    const state = sessionStorage.getItem(LOCK_STATE_KEY);
    return state === 'locked';
  } catch {
    return false;
  }
};

/**
 * Set lock state
 */
export const setLocked = (locked: boolean): void => {
  try {
    if (locked) {
      sessionStorage.setItem(LOCK_STATE_KEY, 'locked');
    } else {
      sessionStorage.removeItem(LOCK_STATE_KEY);
    }
  } catch (error) {
    console.error('[LockService] Failed to set lock state:', error);
  }
};

/**
 * Check if workspace should be locked on startup
 */
export const shouldLockOnStartup = (): boolean => {
  const config = getLockConfig();
  if (!config || !config.enabled) return false;
  return config.lockOnStartup;
};

/**
 * Unlock workspace with password
 */
export const unlock = (password: string): boolean => {
  if (verifyPassword(password)) {
    setLocked(false);
    return true;
  }
  return false;
};

/**
 * Manually lock workspace
 */
export const lock = (): void => {
  const config = getLockConfig();
  if (config && config.enabled) {
    setLocked(true);
  }
};