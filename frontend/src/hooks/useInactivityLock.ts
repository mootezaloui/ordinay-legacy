/**
 * hooks/useInactivityLock.ts
 * Monitors user activity and triggers lock after timeout
 */

import { useEffect, useRef } from 'react';
import { useLock } from "../contexts/LockContext";

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

export const useInactivityLock = () => {
  const { isEnabled, config, lock, isLocked } = useLock();
  const timeoutRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(0);

  useEffect(() => {
    // Only monitor if lock is enabled, has timeout configured, and is not currently locked
    if (!isEnabled || !config || config.inactivityTimeout <= 0 || isLocked) {
      return;
    }

    const timeoutMs = config.inactivityTimeout * 60 * 1000;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();

      // Clear existing timeout
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = window.setTimeout(() => {
        lock();
      }, timeoutMs);
    };

    // Handle activity events
    const handleActivity = () => {
      resetTimer();
    };

    // Set initial timer
    lastActivityRef.current = Date.now();
    resetTimer();

    // Add event listeners
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isEnabled, config, lock, isLocked]);

  // Check for inactivity on visibility change (tab switch)
  useEffect(() => {
    if (!isEnabled || !config || config.inactivityTimeout <= 0 || isLocked) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const elapsed = now - lastActivityRef.current;
        const timeoutMs = config.inactivityTimeout * 60 * 1000;

        // If elapsed time exceeds timeout, lock immediately
        if (elapsed >= timeoutMs) {
          lock();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isEnabled, config, lock, isLocked]);
};
