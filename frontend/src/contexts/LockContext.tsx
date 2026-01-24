/**
 * contexts/LockContext.tsx
 * Manages workspace lock state and operations
 */

/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, ReactNode } from 'react';
import {
  getLockConfig,
  isLocked as checkIsLocked,
  shouldLockOnStartup,
  unlock as unlockWorkspace,
  lock as lockWorkspace,
  enableLock as enableWorkspaceLock,
  disableLock as disableWorkspaceLock,
  changePassword as changeWorkspacePassword,
  updateLockSettings as updateWorkspaceLockSettings,
  LockConfig,
} from '../services/lockService';

interface LockContextValue {
  isLocked: boolean;
  isEnabled: boolean;
  config: LockConfig | null;
  unlock: (password: string) => boolean;
  lock: () => void;
  enableLock: (password: string, lockOnStartup?: boolean, inactivityTimeout?: number) => void;
  disableLock: () => void;
  changePassword: (currentPassword: string, newPassword: string) => boolean;
  updateSettings: (updates: Partial<Pick<LockConfig, 'inactivityTimeout' | 'lockOnStartup'>>) => void;
}

const LockContext = createContext<LockContextValue | undefined>(undefined);

export const LockProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<LockConfig | null>(() => getLockConfig());
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const lockConfig = getLockConfig();
    if (lockConfig && lockConfig.enabled) {
      return shouldLockOnStartup() || checkIsLocked();
    }
    return false;
  });

  const unlock = (password: string): boolean => {
    const success = unlockWorkspace(password);
    if (success) {
      setIsLocked(false);
    }
    return success;
  };

  const lock = (): void => {
    lockWorkspace();
    setIsLocked(true);
  };

  const enableLock = (password: string, lockOnStartup: boolean = true, inactivityTimeout: number = 15): void => {
    enableWorkspaceLock(password, lockOnStartup, inactivityTimeout);
    const newConfig = getLockConfig();
    setConfig(newConfig);
    setIsLocked(true);
  };

  const disableLock = (): void => {
    disableWorkspaceLock();
    setConfig(null);
    setIsLocked(false);
  };

  const changePassword = (currentPassword: string, newPassword: string): boolean => {
    const success = changeWorkspacePassword(currentPassword, newPassword);
    if (success) {
      const updatedConfig = getLockConfig();
      setConfig(updatedConfig);
    }
    return success;
  };

  const updateSettings = (updates: Partial<Pick<LockConfig, 'inactivityTimeout' | 'lockOnStartup'>>): void => {
    updateWorkspaceLockSettings(updates);
    const updatedConfig = getLockConfig();
    setConfig(updatedConfig);
  };

  const value: LockContextValue = {
    isLocked,
    isEnabled: config?.enabled ?? false,
    config,
    unlock,
    lock,
    enableLock,
    disableLock,
    changePassword,
    updateSettings,
  };

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
};

export const useLock = (): LockContextValue => {
  const context = useContext(LockContext);
  if (!context) {
    throw new Error('useLock must be used within LockProvider');
  }
  return context;
};
